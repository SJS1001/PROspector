/**
 * Owner Gmail authorization validator (plan 06-05, Task 2).
 *
 * Pure and local. It makes no network request, holds no provider endpoint or
 * client configuration, never receives an authorization code or bearer
 * material, and is not composed by any route, worker, or domain service. A
 * future owner-authorized adapter may use it to decide whether a completed
 * consent round-trip is bound to the exact attempt that started it.
 *
 * Binding rules:
 * - state and nonce are one-time, high-entropy values kept only as SHA-256
 *   digests; state is consumed by the first well-formed completion, whatever
 *   its outcome, so a replay is always refused;
 * - PKCE is S256 only: the verifier must hash to the stored challenge;
 * - the redirect URI must equal the registered value byte for byte;
 * - the granted scope set must be exactly gmail.readonly and gmail.send;
 * - the attempt expires at issuedAt + ttlMs (at most ten minutes);
 * - the completing workspace/principal must be the one that began it, and a
 *   pinned subject refuses an account swap on reconnect.
 *
 * Success is connection metadata only: it reports zero provider calls and
 * never enables sending. The MailPort adapter in ./gmail.ts stays reject-only.
 */

export const OWNER_MAIL_AUTHORIZATION_SCOPES: readonly ["gmail.readonly", "gmail.send"] = Object.freeze([
  "gmail.readonly",
  "gmail.send",
] as const);

export const OWNER_MAIL_AUTHORIZATION_MAX_TTL_MS = 10 * 60 * 1000;

export type OwnerMailAuthorizationRefusalReason =
  | "input_invalid"
  | "attempt_duplicate"
  | "state_unknown"
  | "state_replayed"
  | "attempt_expired"
  | "principal_mismatch"
  | "redirect_mismatch"
  | "pkce_mismatch"
  | "nonce_mismatch"
  | "scope_mismatch"
  | "subject_mismatch";

export type OwnerMailAuthorizationRefusal = Readonly<{
  status: "refused";
  reason: OwnerMailAuthorizationRefusalReason;
  providerCalls: 0;
  sendingEnabled: false;
}>;

export type OwnerMailAuthorizationBeginInput = Readonly<{
  workspaceId: string;
  principalId: string;
  attemptId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  issuedAt: number;
  ttlMs: number;
  pinnedSubject: string | null;
}>;

export type OwnerMailAuthorizationChallenge = Readonly<{
  status: "pending";
  attemptId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: typeof OWNER_MAIL_AUTHORIZATION_SCOPES;
  expiresAt: number;
  providerCalls: 0;
}>;

export type OwnerMailAuthorizationCompletionInput = Readonly<{
  workspaceId: string;
  principalId: string;
  state: string;
  nonce: string;
  redirectUri: string;
  codeVerifier: string;
  grantedScopes: readonly string[];
  subject: string;
  receivedAt: number;
}>;

export type OwnerMailAuthorizationGranted = Readonly<{
  status: "authorized";
  workspaceId: string;
  principalId: string;
  attemptId: string;
  subject: string;
  scopes: typeof OWNER_MAIL_AUTHORIZATION_SCOPES;
  authorizedAt: number;
  providerCalls: 0;
  sendingEnabled: false;
}>;

export type OwnerMailAuthorizationResult = OwnerMailAuthorizationGranted | OwnerMailAuthorizationRefusal;

export type OwnerMailAuthorizationLedger = Readonly<{
  begin(input: unknown): Promise<OwnerMailAuthorizationChallenge | OwnerMailAuthorizationRefusal>;
  complete(input: unknown): Promise<OwnerMailAuthorizationResult>;
}>;

type PendingAttempt = Readonly<{
  workspaceId: string;
  principalId: string;
  attemptId: string;
  redirectUri: string;
  nonceDigest: string;
  codeChallenge: string;
  issuedAt: number;
  expiresAt: number;
  pinnedSubject: string | null;
}>;

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,127}$/u;
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u;
// 43 base64url characters carry at least 256 bits when generated randomly.
const HIGH_ENTROPY = /^[A-Za-z0-9_-]{43,128}$/u;
// RFC 7636 section 4.1: unreserved characters, 43 to 128 long.
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/u;
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/u;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_GRANTED_SCOPES = 16;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const BEGIN_KEYS = [
  "workspaceId",
  "principalId",
  "attemptId",
  "redirectUri",
  "state",
  "nonce",
  "codeVerifier",
  "issuedAt",
  "ttlMs",
  "pinnedSubject",
] as const;

const COMPLETION_KEYS = [
  "workspaceId",
  "principalId",
  "state",
  "nonce",
  "redirectUri",
  "codeVerifier",
  "grantedScopes",
  "subject",
  "receivedAt",
] as const;

/** Derives the RFC 7636 S256 code challenge: BASE64URL(SHA-256(ASCII(verifier))). */
export async function deriveS256CodeChallenge(verifier: unknown): Promise<string> {
  if (typeof verifier !== "string" || !PKCE_VERIFIER.test(verifier)) {
    throw new Error("pkce_verifier_invalid");
  }
  const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digestBytes));
}

/** True only when the verifier is well formed and hashes to the given S256 challenge. */
export async function verifyS256CodeChallenge(verifier: unknown, challenge: unknown): Promise<boolean> {
  if (typeof verifier !== "string" || !PKCE_VERIFIER.test(verifier)) return false;
  if (typeof challenge !== "string" || !S256_CHALLENGE.test(challenge)) return false;
  return constantTimeEqual(await deriveS256CodeChallenge(verifier), challenge);
}

/**
 * Creates an in-memory attempt ledger. Pending attempts are keyed by the state
 * digest; consumed digests are remembered for the ledger's lifetime so a state
 * can never be completed or registered twice.
 */
export function createOwnerMailAuthorizationLedger(): OwnerMailAuthorizationLedger {
  const pending = new Map<string, PendingAttempt>();
  const consumed = new Set<string>();
  const attemptIds = new Set<string>();

  async function begin(value: unknown): Promise<OwnerMailAuthorizationChallenge | OwnerMailAuthorizationRefusal> {
    const input = parseBegin(value);
    if (!input) return refused("input_invalid");
    const [stateDigest, nonceDigest, codeChallenge] = await Promise.all([
      bindingDigest("state", input.state),
      bindingDigest("nonce", input.nonce),
      deriveS256CodeChallenge(input.codeVerifier),
    ]);
    // Synchronous check-and-register after the last await.
    if (pending.has(stateDigest) || consumed.has(stateDigest) || attemptIds.has(input.attemptId)) {
      return refused("attempt_duplicate");
    }
    const expiresAt = input.issuedAt + input.ttlMs;
    pending.set(stateDigest, Object.freeze({
      workspaceId: input.workspaceId,
      principalId: input.principalId,
      attemptId: input.attemptId,
      redirectUri: input.redirectUri,
      nonceDigest,
      codeChallenge,
      issuedAt: input.issuedAt,
      expiresAt,
      pinnedSubject: input.pinnedSubject,
    }));
    attemptIds.add(input.attemptId);
    return Object.freeze({
      status: "pending",
      attemptId: input.attemptId,
      redirectUri: input.redirectUri,
      codeChallenge,
      codeChallengeMethod: "S256",
      scopes: OWNER_MAIL_AUTHORIZATION_SCOPES,
      expiresAt,
      providerCalls: 0,
    });
  }

  async function complete(value: unknown): Promise<OwnerMailAuthorizationResult> {
    const input = parseCompletion(value);
    if (!input) return refused("input_invalid");
    const stateDigest = await bindingDigest("state", input.state);
    // Synchronous lookup-and-consume after the await: one state, one outcome.
    if (consumed.has(stateDigest)) return refused("state_replayed");
    const attempt = pending.get(stateDigest);
    if (!attempt) return refused("state_unknown");
    pending.delete(stateDigest);
    consumed.add(stateDigest);

    if (input.receivedAt < attempt.issuedAt || input.receivedAt >= attempt.expiresAt) {
      return refused("attempt_expired");
    }
    if (input.workspaceId !== attempt.workspaceId || input.principalId !== attempt.principalId) {
      return refused("principal_mismatch");
    }
    if (input.redirectUri !== attempt.redirectUri) return refused("redirect_mismatch");
    if (!(await verifyS256CodeChallenge(input.codeVerifier, attempt.codeChallenge))) {
      return refused("pkce_mismatch");
    }
    if (!constantTimeEqual(await bindingDigest("nonce", input.nonce), attempt.nonceDigest)) {
      return refused("nonce_mismatch");
    }
    if (!isExactScopeSet(input.grantedScopes)) return refused("scope_mismatch");
    if (attempt.pinnedSubject !== null && input.subject !== attempt.pinnedSubject) {
      return refused("subject_mismatch");
    }
    return Object.freeze({
      status: "authorized",
      workspaceId: attempt.workspaceId,
      principalId: attempt.principalId,
      attemptId: attempt.attemptId,
      subject: input.subject,
      scopes: OWNER_MAIL_AUTHORIZATION_SCOPES,
      authorizedAt: input.receivedAt,
      providerCalls: 0,
      sendingEnabled: false,
    });
  }

  return Object.freeze({ begin, complete });
}

function parseBegin(value: unknown): OwnerMailAuthorizationBeginInput | null {
  const record = exactRecord(value, BEGIN_KEYS);
  if (!record) return null;
  const {
    workspaceId, principalId, attemptId, redirectUri, state, nonce, codeVerifier, issuedAt, ttlMs, pinnedSubject,
  } = record;
  if (!isOpaqueId(workspaceId) || !isOpaqueId(principalId) || !isOpaqueId(attemptId)) return null;
  if (!isRegistrableRedirectUri(redirectUri)) return null;
  if (!isHighEntropy(state) || !isHighEntropy(nonce)) return null;
  if (typeof codeVerifier !== "string" || !PKCE_VERIFIER.test(codeVerifier)) return null;
  if (!isTimestamp(issuedAt)) return null;
  if (!Number.isSafeInteger(ttlMs) || (ttlMs as number) < 1 || (ttlMs as number) > OWNER_MAIL_AUTHORIZATION_MAX_TTL_MS) {
    return null;
  }
  if (pinnedSubject !== null && !isSubject(pinnedSubject)) return null;
  return {
    workspaceId,
    principalId,
    attemptId,
    redirectUri,
    state,
    nonce,
    codeVerifier,
    issuedAt,
    ttlMs: ttlMs as number,
    pinnedSubject: pinnedSubject as string | null,
  };
}

function parseCompletion(value: unknown): OwnerMailAuthorizationCompletionInput | null {
  const record = exactRecord(value, COMPLETION_KEYS);
  if (!record) return null;
  const {
    workspaceId, principalId, state, nonce, redirectUri, codeVerifier, grantedScopes, subject, receivedAt,
  } = record;
  if (!isOpaqueId(workspaceId) || !isOpaqueId(principalId)) return null;
  if (!isHighEntropy(state) || !isHighEntropy(nonce)) return null;
  if (typeof redirectUri !== "string" || redirectUri.length > MAX_REDIRECT_URI_LENGTH) return null;
  if (typeof codeVerifier !== "string" || !PKCE_VERIFIER.test(codeVerifier)) return null;
  const scopes = exactStringArray(grantedScopes);
  if (!scopes) return null;
  if (!isSubject(subject) || !isTimestamp(receivedAt)) return null;
  return { workspaceId, principalId, state, nonce, redirectUri, codeVerifier, grantedScopes: scopes, subject, receivedAt };
}

function isExactScopeSet(granted: readonly string[]): boolean {
  if (granted.length !== OWNER_MAIL_AUTHORIZATION_SCOPES.length) return false;
  const sorted = [...granted].sort();
  return sorted.every((scope, index) => scope === OWNER_MAIL_AUTHORIZATION_SCOPES[index]);
}

/**
 * A registrable redirect URI is absolute, already in canonical serialized form
 * (so exact matching is unambiguous), carries no credentials or fragment, and
 * uses https except for local loopback development.
 */
function isRegistrableRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_REDIRECT_URI_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.href !== value) return false;
  if (parsed.username !== "" || parsed.password !== "" || parsed.hash !== "" || value.includes("#")) return false;
  if (parsed.protocol === "https:") return true;
  return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
}

function exactRecord<const K extends string>(
  value: unknown,
  keys: readonly K[],
): Record<K, unknown> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actualKeys = Reflect.ownKeys(descriptors);
    if (actualKeys.length !== keys.length || actualKeys.some((key) => typeof key !== "string")) return null;
    const record = {} as Record<K, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function exactStringArray(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)) return null;
    const length = lengthDescriptor.value as number;
    if (!Number.isSafeInteger(length) || length > MAX_GRANTED_SCOPES) return null;
    if (Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const items: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") return null;
      items.push(descriptor.value);
    }
    return Object.freeze(items);
  } catch {
    return null;
  }
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value);
}

function isSubject(value: unknown): value is string {
  return typeof value === "string" && SUBJECT.test(value);
}

function isHighEntropy(value: unknown): value is string {
  return typeof value === "string" && HIGH_ENTROPY.test(value);
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function refused(reason: OwnerMailAuthorizationRefusalReason): OwnerMailAuthorizationRefusal {
  return Object.freeze({ status: "refused", reason, providerCalls: 0, sendingEnabled: false });
}

async function bindingDigest(purpose: "state" | "nonce", value: string): Promise<string> {
  const material = `prospector-owner-mail-authorization/v1\u0000${purpose}\u0000${value}`;
  const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
