type HeaderReader = Pick<Headers, "get">;

export type CloudflareAccessConfig = {
  issuer?: unknown;
  audience?: unknown;
};

export type CloudflareAccessIdentity = {
  email: string;
  displayName: string;
};

type VerificationDependencies = {
  fetcher?: (input: string) => Promise<Response>;
  now?: () => number;
};

type AccessJwk = JsonWebKey & { kid: string };

type CachedJwks = {
  expiresAt: number;
  refreshAfter: number;
  staleUntil: number;
  keys: AccessJwk[];
};

const ASSERTION_HEADER = "cf-access-jwt-assertion";
const JWKS_TTL_MS = 5 * 60 * 1000;
const JWKS_REFRESH_COOLDOWN_MS = 30 * 1000;
const JWKS_HARD_STALE_MS = 10 * 60 * 1000;
const MAX_ASSERTION_BYTES = 16 * 1024;
const MAX_JWKS_BYTES = 256 * 1024;
const cache = new Map<string, CachedJwks>();
const pending = new Map<string, Promise<AccessJwk[]>>();

export function cloudflareAccessMode(config: CloudflareAccessConfig):
  | "disabled"
  | "invalid"
  | "enabled" {
  const hasIssuer = config.issuer !== undefined;
  const hasAudience = config.audience !== undefined;
  if (!hasIssuer && !hasAudience) return "disabled";
  return normalizeIssuer(config.issuer) && normalizeAudience(config.audience)
    ? "enabled"
    : "invalid";
}

export async function verifyCloudflareAccessIdentity(
  requestHeaders: HeaderReader,
  config: CloudflareAccessConfig,
  dependencies: VerificationDependencies = {},
): Promise<CloudflareAccessIdentity | null> {
  try {
    const issuer = normalizeIssuer(config.issuer);
    const audience = normalizeAudience(config.audience);
    if (!issuer || !audience) return null;

    const assertion = requestHeaders.get(ASSERTION_HEADER);
    if (!assertion || assertion.length > MAX_ASSERTION_BYTES) return null;
    const parts = assertion.split(".");
    if (parts.length !== 3 || parts.some((part) => !part)) return null;

    const header = decodeJson(parts[0]);
    const payload = decodeJson(parts[1]);
    if (!header || !payload) return null;
    if (header.alg !== "RS256" || !boundedString(header.kid, 1, 128)) return null;

    const now = (dependencies.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || now <= 0) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (!validClaims(payload, issuer, audience, nowSeconds)) return null;

    const fetcher = dependencies.fetcher ?? ((input: string) => fetch(input));
    let jwks = await loadJwks(issuer, fetcher, now, false);
    let jwk = matchingKey(jwks, header.kid);
    if (!jwk) {
      jwks = await loadJwks(issuer, fetcher, now, true);
      jwk = matchingKey(jwks, header.kid);
    }
    if (!jwk) return null;

    const decodedSignature = decodeBase64url(parts[2]);
    if (!decodedSignature) return null;
    const signature = new Uint8Array(decodedSignature.byteLength);
    signature.set(decodedSignature);
    const material = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    let verified = await verifySignature(jwk, signature, material);
    if (!verified) {
      jwks = await loadJwks(issuer, fetcher, now, true);
      const rotatedJwk = matchingKey(jwks, header.kid);
      verified = rotatedJwk
        ? await verifySignature(rotatedJwk, signature, material)
        : false;
    }
    if (!verified) return null;

    const email = normalizeEmail(payload.email);
    return email ? { email, displayName: email } : null;
  } catch {
    return null;
  }
}

async function loadJwks(
  issuer: string,
  fetcher: (input: string) => Promise<Response>,
  now: number,
  force: boolean,
): Promise<AccessJwk[]> {
  const cached = cache.get(issuer);
  if (!force && cached && cached.expiresAt > now) return cached.keys;
  if (force && cached && cached.refreshAfter > now) return cached.keys;
  const active = pending.get(issuer);
  if (active) return active;

  const loading = fetchAndCacheJwks(issuer, fetcher, now, cached);
  pending.set(issuer, loading);
  try {
    return await loading;
  } finally {
    if (pending.get(issuer) === loading) pending.delete(issuer);
  }
}

async function fetchAndCacheJwks(
  issuer: string,
  fetcher: (input: string) => Promise<Response>,
  now: number,
  cached: CachedJwks | undefined,
): Promise<AccessJwk[]> {
  try {
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`);
    if (!response.ok) return retainCachedJwks(issuer, cached, now);
    const source = await response.text();
    if (source.length > MAX_JWKS_BYTES) return retainCachedJwks(issuer, cached, now);
    const decoded: unknown = JSON.parse(source);
    if (!isRecord(decoded) || !Array.isArray(decoded.keys) || decoded.keys.length > 16)
      return retainCachedJwks(issuer, cached, now);
    const keys = decoded.keys.filter(validJwk);
    if (keys.length === 0) return retainCachedJwks(issuer, cached, now);
    cache.set(issuer, {
      expiresAt: now + JWKS_TTL_MS,
      refreshAfter: now + JWKS_REFRESH_COOLDOWN_MS,
      staleUntil: now + JWKS_HARD_STALE_MS,
      keys,
    });
    return keys;
  } catch {
    return retainCachedJwks(issuer, cached, now);
  }
}

function retainCachedJwks(
  issuer: string,
  cached: CachedJwks | undefined,
  now: number,
) {
  const canRetain = Boolean(cached && cached.staleUntil > now);
  const retained = canRetain ? cached?.keys ?? [] : [];
  cache.set(issuer, {
    expiresAt: canRetain
      ? Math.min(cached?.staleUntil ?? now, now + JWKS_REFRESH_COOLDOWN_MS)
      : now + JWKS_REFRESH_COOLDOWN_MS,
    refreshAfter: now + JWKS_REFRESH_COOLDOWN_MS,
    staleUntil: cached?.staleUntil ?? now,
    keys: retained,
  });
  return retained;
}

async function verifySignature(
  jwk: AccessJwk,
  signature: Uint8Array<ArrayBuffer>,
  material: Uint8Array<ArrayBuffer>,
) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signature,
    material,
  );
}

function matchingKey(keys: AccessJwk[], kid: unknown): AccessJwk | null {
  if (typeof kid !== "string") return null;
  return keys.find((key) => key.kid === kid) ?? null;
}

function validJwk(value: unknown): value is AccessJwk {
  if (!isRecord(value)) return false;
  return value.kty === "RSA"
    && boundedString(value.kid, 1, 128)
    && boundedString(value.n, 64, 1024)
    && boundedString(value.e, 1, 16)
    && (value.alg === undefined || value.alg === "RS256")
    && (value.use === undefined || value.use === "sig");
}

function validClaims(
  payload: Record<string, unknown>,
  issuer: string,
  audience: string,
  nowSeconds: number,
) {
  if (payload.iss !== issuer || !audienceIncludes(payload.aud, audience)) return false;
  if (!numericDate(payload.exp) || payload.exp <= nowSeconds) return false;
  if (payload.nbf !== undefined && (!numericDate(payload.nbf) || payload.nbf > nowSeconds))
    return false;
  if (payload.iat !== undefined && (!numericDate(payload.iat) || payload.iat > nowSeconds))
    return false;
  return normalizeEmail(payload.email) !== null;
}

function audienceIncludes(value: unknown, expected: string) {
  if (typeof value === "string") return value === expected;
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 8
    && value.every((entry) => typeof entry === "string")
    && value.includes(expected);
}

function normalizeIssuer(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
      || !url.hostname.endsWith(".cloudflareaccess.com")
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeAudience(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value)
    ? value
    : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

function numericDate(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function decodeJson(value: string): Record<string, unknown> | null {
  const bytes = decodeBase64url(value);
  if (!bytes || bytes.byteLength > MAX_ASSERTION_BYTES) return null;
  const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return isRecord(decoded) ? decoded : null;
}

function decodeBase64url(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (standard.length % 4)) % 4);
  const decoded = atob(`${standard}${padding}`);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function boundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
