import { isDefensivelyValidContactObservation, type ContactObservation } from "./contact-evidence";
import {
  isVerifiedPersistedContactEligibilityEvidence,
  type PersistedContactEligibilityEvidence,
} from "./contact-settlement-persistence";

export const DEFAULT_CONTACT_FRESHNESS_MS = Object.freeze({
  mailboxVerifiedEmail: 30 * 24 * 60 * 60 * 1000,
  sourceVerifiedEmail: 90 * 24 * 60 * 60 * 1000,
  verifiedBusinessPhone: 90 * 24 * 60 * 60 * 1000,
});

export type ContactEligibilityState = "ContactReady" | "ContactSuggestion" | "NeedsReview" | "NonContactable";
export type ContactStrategy = Readonly<{
  configurationId: string;
  configurationDigest: string;
  mailboxVerifiedEmailFreshnessMs?: number;
  sourceVerifiedEmailFreshnessMs?: number;
  verifiedBusinessPhoneFreshnessMs?: number;
}>;
export type ContactEligibilityAuthority = Readonly<{
  prospectId: string;
  configurationId: string;
  configurationDigest: string;
  profileAvailable: boolean;
  configurationCurrent: boolean;
  drifted: boolean;
  disqualified: boolean;
  suppressed: boolean;
  phase4Approved: boolean;
  contactCapabilityEnabled: boolean;
}>;
export type ContactEligibilityTarget = Readonly<{
  workspaceId: string;
  prospectId: string;
  contactId: string;
}>;
type ContactEligibilityEvidence = ContactObservation | PersistedContactEligibilityEvidence;
export type DownstreamBoundary = "package_approval" | "crm_export" | "click_to_call" | "final_send";
export type DownstreamEffectSnapshot = Readonly<{
  packageMutations: 0;
  exportMutations: 0;
  callInvocations: 0;
  sendInvocations: 0;
  suppressionMutations: 0;
}>;

export type ContactEligibility = Readonly<{
  state: ContactEligibilityState;
  eligible: boolean;
  reasonCodes: readonly string[];
  points: readonly Readonly<{
    observationId: string;
    state: "eligible" | "suggestion" | "invalid" | "stale" | "scope_mismatch" | "configuration_mismatch";
    freshnessExpiresAt: number | null;
    verificationClass: ContactObservation["verificationClass"];
  }> [];
}>;

export type DownstreamRecheck = Readonly<{
  boundary: DownstreamBoundary;
  blocked: true;
  eligibility: ContactEligibility;
  effectsBefore: DownstreamEffectSnapshot;
  effectsAfter: DownstreamEffectSnapshot;
}>;

const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_FRESHNESS_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * A pure current projection over immutable evidence.  The default is intentionally
 * fail-closed: a caller must supply a current Phase 4 approval and a separately
 * enabled Phase 5 capability before a fresh verified point can become ContactReady.
 */
export function projectContactEligibility(value: {
  target?: ContactEligibilityTarget;
  points?: readonly ContactEligibilityEvidence[];
  strategy?: ContactStrategy;
  authority?: ContactEligibilityAuthority;
  now?: number;
} | unknown): ContactEligibility {
  const input = snapshotEligibilityInput(value);
  const now = validEvaluationTimestamp(input?.now);
  const clockInvalid = !input?.hasNow || now === null;
  const evaluationTime = now ?? 0;
  const authority = normalizeAuthority(input?.authority);
  const effectiveAuthority = authority ?? FAIL_CLOSED_AUTHORITY;
  const reasonCodes = authority ? authorityReasons(authority) : ["invalid_contact_authority"];
  if (!input) reasonCodes.push("invalid_contact_input");
  if (clockInvalid) reasonCodes.push("invalid_evaluation_time");
  const target = normalizeTarget(input?.target);
  if (!target) reasonCodes.push("invalid_contact_target");
  const strategy = normalizeStrategy(input?.strategy);
  if (!strategy) reasonCodes.push("invalid_contact_strategy");
  if (authority && target && authority.prospectId !== target.prospectId) {
    reasonCodes.push("contact_authority_scope_mismatch");
  }
  if (
    authority
    && strategy
    && (
      authority.configurationId !== strategy.configurationId
      || authority.configurationDigest !== strategy.configurationDigest
    )
  ) reasonCodes.push("contact_authority_configuration_mismatch");
  const authorityBlocked = reasonCodes.length > 0;

  const suppliedPoints = input?.points ?? [];
  const points: ContactEligibilityEvidence[] = [];
  let hasInvalidEvidence = false;
  for (const point of suppliedPoints) {
    if (
      isDefensivelyValidContactObservation(point)
      || isVerifiedPersistedContactEligibilityEvidence(point)
    ) points.push(point);
    else hasInvalidEvidence = true;
  }
  const projected = points.map((point) => projectPoint(point, target, strategy, evaluationTime));
  if (!points.length) reasonCodes.push("no_contact_evidence");
  if (hasInvalidEvidence) reasonCodes.push("contact_evidence_invalid");
  if (projected.some((point) => point.state === "stale")) reasonCodes.push("contact_evidence_stale");
  if (projected.some((point) => point.state === "invalid")) reasonCodes.push("contact_evidence_invalid");
  if (projected.some((point) => point.state === "scope_mismatch")) reasonCodes.push("contact_scope_mismatch");
  if (projected.some((point) => point.state === "configuration_mismatch")) reasonCodes.push("contact_configuration_mismatch");
  if (projected.length > 0 && projected.every((point) => point.state === "suggestion")) reasonCodes.push("verification_class_ineligible");

  const hasEligible = projected.some((point) => point.state === "eligible");
  const suppressed = effectiveAuthority.suppressed;
  const hasBlockingEvidence = hasInvalidEvidence || projected.some((point) =>
    point.state === "invalid"
    || point.state === "scope_mismatch"
    || point.state === "configuration_mismatch"
  );
  const blockedForReview = authorityBlocked || clockInvalid || !target || !strategy || hasBlockingEvidence;
  const state: ContactEligibilityState = suppressed
    ? "NonContactable"
    : hasEligible && !blockedForReview ? "ContactReady"
    : clockInvalid || hasEligible || hasInvalidEvidence || projected.some((point) => point.state === "stale" || point.state === "invalid" || point.state === "scope_mismatch" || point.state === "configuration_mismatch") || effectiveAuthority.drifted || effectiveAuthority.disqualified
      ? "NeedsReview"
      : "ContactSuggestion";
  return freeze({ state, eligible: state === "ContactReady", reasonCodes: uniqueSorted(reasonCodes), points: projected });
}

/** Downstream consumers only receive a fresh, blocked recheck projection. */
export function recheckForPackageApproval(input: unknown): DownstreamRecheck { return blockedRecheck("package_approval", input); }
export function recheckForCrmExport(input: unknown): DownstreamRecheck { return blockedRecheck("crm_export", input); }
export function recheckForClickToCall(input: unknown): DownstreamRecheck { return blockedRecheck("click_to_call", input); }
export function recheckForFinalSend(input: unknown): DownstreamRecheck { return blockedRecheck("final_send", input); }

export function zeroDownstreamEffects(): DownstreamEffectSnapshot {
  return Object.freeze({ packageMutations: 0, exportMutations: 0, callInvocations: 0, sendInvocations: 0, suppressionMutations: 0 });
}

function blockedRecheck(boundary: DownstreamBoundary, input: unknown): DownstreamRecheck {
  const effectsBefore = zeroDownstreamEffects();
  const eligibility = projectContactEligibility(input);
  // This module cannot authorize or execute later-phase behavior, even if current
  // evidence is ContactReady.  Its exact zero snapshots make that containment testable.
  const effectsAfter = zeroDownstreamEffects();
  return freeze({ boundary, blocked: true as const, eligibility, effectsBefore, effectsAfter });
}

function projectPoint(point: ContactEligibilityEvidence, target: ContactEligibilityTarget | null, strategy: Freshness | null, now: number) {
  const eligibleClass = point.verificationClass === "mailbox_verified" || point.verificationClass === "source_verified";
  if (!eligibleClass) return freeze({ observationId: point.id, state: point.verificationClass === "invalid" ? "invalid" as const : "suggestion" as const, freshnessExpiresAt: null, verificationClass: point.verificationClass });
  if (
    !target
    || point.workspaceId !== target.workspaceId
    || point.contactId !== target.contactId
    || point.assignmentContext?.prospectId !== target.prospectId
  ) {
    return freeze({ observationId: point.id, state: "scope_mismatch" as const, freshnessExpiresAt: null, verificationClass: point.verificationClass });
  }
  if (strategy && (point.profileConfigurationId !== strategy.configurationId || point.profileConfigurationDigest !== strategy.configurationDigest)) {
    return freeze({ observationId: point.id, state: "configuration_mismatch" as const, freshnessExpiresAt: null, verificationClass: point.verificationClass });
  }
  const maxAge = strategy ? freshnessFor(point, strategy) : null;
  if (maxAge === null || point.verifiedAt === null || point.verifiedAt > now) return freeze({ observationId: point.id, state: "invalid" as const, freshnessExpiresAt: null, verificationClass: point.verificationClass });
  const freshnessExpiresAt = point.verifiedAt + maxAge;
  return freeze({ observationId: point.id, state: now >= freshnessExpiresAt ? "stale" as const : "eligible" as const, freshnessExpiresAt, verificationClass: point.verificationClass });
}

type Freshness = Readonly<Pick<ContactStrategy, "configurationId" | "configurationDigest"> & Required<Pick<ContactStrategy, "mailboxVerifiedEmailFreshnessMs" | "sourceVerifiedEmailFreshnessMs" | "verifiedBusinessPhoneFreshnessMs">>>;
function normalizeTarget(value: unknown): ContactEligibilityTarget | null {
  const target = record(value);
  return target && opaque(target.workspaceId) && opaque(target.prospectId) && opaque(target.contactId)
    ? Object.freeze({
        workspaceId: target.workspaceId as string,
        prospectId: target.prospectId as string,
        contactId: target.contactId as string,
      })
    : null;
}
function normalizeStrategy(value: unknown): Freshness | null {
  const strategy = record(value);
  if (!strategy || !opaque(strategy.configurationId) || typeof strategy.configurationDigest !== "string" || !DIGEST.test(strategy.configurationDigest)) return null;
  const mailboxVerifiedEmailFreshnessMs = freshness(strategy.mailboxVerifiedEmailFreshnessMs, DEFAULT_CONTACT_FRESHNESS_MS.mailboxVerifiedEmail);
  const sourceVerifiedEmailFreshnessMs = freshness(strategy.sourceVerifiedEmailFreshnessMs, DEFAULT_CONTACT_FRESHNESS_MS.sourceVerifiedEmail);
  const verifiedBusinessPhoneFreshnessMs = freshness(strategy.verifiedBusinessPhoneFreshnessMs, DEFAULT_CONTACT_FRESHNESS_MS.verifiedBusinessPhone);
  return mailboxVerifiedEmailFreshnessMs && sourceVerifiedEmailFreshnessMs && verifiedBusinessPhoneFreshnessMs
    ? Object.freeze({ configurationId: strategy.configurationId as string, configurationDigest: strategy.configurationDigest, mailboxVerifiedEmailFreshnessMs, sourceVerifiedEmailFreshnessMs, verifiedBusinessPhoneFreshnessMs }) : null;
}
function freshnessFor(point: ContactEligibilityEvidence, strategy: Freshness) {
  if (point.verificationClass === "mailbox_verified" && point.kind === "email") return strategy.mailboxVerifiedEmailFreshnessMs;
  if (point.verificationClass === "source_verified" && point.kind === "email") return strategy.sourceVerifiedEmailFreshnessMs;
  if (point.verificationClass === "source_verified" && point.kind === "phone") return strategy.verifiedBusinessPhoneFreshnessMs;
  return null;
}
const AUTHORITY_KEYS = Object.freeze([
  "prospectId", "configurationId", "configurationDigest",
  "profileAvailable", "configurationCurrent", "drifted", "disqualified",
  "suppressed", "phase4Approved", "contactCapabilityEnabled",
]);
const FAIL_CLOSED_AUTHORITY: ContactEligibilityAuthority = Object.freeze({
  prospectId: "",
  configurationId: "",
  configurationDigest: "",
  profileAvailable: false,
  configurationCurrent: false,
  drifted: false,
  disqualified: false,
  suppressed: false,
  phase4Approved: false,
  contactCapabilityEnabled: false,
});
function normalizeAuthority(value: unknown): ContactEligibilityAuthority | null {
  const input = exactPlainRecord(value, AUTHORITY_KEYS);
  const booleanKeys = AUTHORITY_KEYS.slice(3);
  if (
    !input
    || !opaque(input.prospectId)
    || !opaque(input.configurationId)
    || typeof input.configurationDigest !== "string"
    || !DIGEST.test(input.configurationDigest)
    || booleanKeys.some((key) => typeof input[key] !== "boolean")
  ) return null;
  return Object.freeze({
    prospectId: input.prospectId as string,
    configurationId: input.configurationId as string,
    configurationDigest: input.configurationDigest,
    profileAvailable: input.profileAvailable as boolean,
    configurationCurrent: input.configurationCurrent as boolean,
    drifted: input.drifted as boolean,
    disqualified: input.disqualified as boolean,
    suppressed: input.suppressed as boolean,
    phase4Approved: input.phase4Approved as boolean,
    contactCapabilityEnabled: input.contactCapabilityEnabled as boolean,
  });
}
function authorityReasons(authority: ContactEligibilityAuthority) {
  const reasons: string[] = [];
  if (!authority.profileAvailable) reasons.push("profile_unavailable");
  if (!authority.configurationCurrent) reasons.push("configuration_not_current");
  if (!authority.phase4Approved) reasons.push("prospect_not_currently_approved");
  if (!authority.contactCapabilityEnabled) reasons.push("contact_capability_unavailable");
  if (authority.drifted) reasons.push("material_drift");
  if (authority.disqualified) reasons.push("prospect_disqualified");
  if (authority.suppressed) reasons.push("suppressed");
  return reasons;
}
type EligibilityInputSnapshot = Readonly<{
  target: Readonly<Record<string, unknown>> | undefined;
  points: readonly unknown[];
  strategy: Readonly<Record<string, unknown>> | undefined;
  authority: Readonly<Record<string, unknown>> | undefined;
  now: unknown;
  hasNow: boolean;
}>;
function snapshotEligibilityInput(value: unknown): EligibilityInputSnapshot | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = ["target", "points", "strategy", "authority", "now"] as const;
    if (
      keys.some((key) => typeof key !== "string" || !allowed.includes(key as typeof allowed[number]))
    ) return null;
    for (const key of allowed) {
      const descriptor = descriptors[key];
      if (descriptor && (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable)) return null;
    }
    const target = descriptors.target
      ? snapshotKnownRecord(descriptors.target.value, ["workspaceId", "prospectId", "contactId"])
      : undefined;
    const strategy = descriptors.strategy
      ? snapshotKnownRecord(descriptors.strategy.value, [
          "configurationId", "configurationDigest", "mailboxVerifiedEmailFreshnessMs",
          "sourceVerifiedEmailFreshnessMs", "verifiedBusinessPhoneFreshnessMs",
        ])
      : undefined;
    const authority = descriptors.authority
      ? snapshotKnownRecord(descriptors.authority.value, AUTHORITY_KEYS)
      : undefined;
    const points = descriptors.points ? snapshotPointArray(descriptors.points.value) : Object.freeze([]);
    if (
      (descriptors.target && !target)
      || (descriptors.strategy && !strategy)
      || (descriptors.authority && !authority)
      || !points
    ) return null;
    // Every nested accessor has already failed above. This final cloneability
    // check rejects transparent and hostile Proxy objects anywhere in the input.
    structuredClone(value);
    return Object.freeze({
      target,
      points,
      strategy,
      authority,
      now: descriptors.now?.value,
      hasNow: descriptors.now !== undefined,
    });
  } catch {
    return null;
  }
}
function snapshotKnownRecord(value: unknown, allowedKeys: readonly string[]): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))) return null;
  const snapshot: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    const child = snapshotEligibilityNode(descriptor.value, 0, new Set<object>());
    if (child === invalidEligibilitySnapshot) return null;
    snapshot[key] = child;
  }
  return Object.freeze(snapshot);
}
function snapshotPointArray(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string")
    || keys.length !== value.length + 1
    || !Object.hasOwn(descriptors, "length")
  ) return null;
  const points: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    const safeSnapshot = snapshotEligibilityNode(descriptor.value, 0, new Set<object>());
    if (safeSnapshot === invalidEligibilitySnapshot) return null;
    points.push(
      isDefensivelyValidContactObservation(descriptor.value)
      || isVerifiedPersistedContactEligibilityEvidence(descriptor.value)
        ? descriptor.value
        : safeSnapshot,
    );
  }
  return Object.freeze(points);
}
const invalidEligibilitySnapshot = Symbol("invalid_contact_eligibility_snapshot");
function snapshotEligibilityNode(
  value: unknown,
  depth: number,
  seen: Set<object>,
): unknown | typeof invalidEligibilitySnapshot {
  if (depth > 5) return invalidEligibilitySnapshot;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : invalidEligibilitySnapshot;
  if (typeof value === "string") return value.length <= 4_096 ? value : invalidEligibilitySnapshot;
  if (typeof value !== "object" || seen.has(value)) return invalidEligibilitySnapshot;
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) return invalidEligibilitySnapshot;
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype || value.length > 100 || keys.length !== value.length + 1) return invalidEligibilitySnapshot;
      const copy: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalidEligibilitySnapshot;
        const child = snapshotEligibilityNode(descriptor.value, depth + 1, seen);
        if (child === invalidEligibilitySnapshot) return invalidEligibilitySnapshot;
        copy.push(child);
      }
      return Object.freeze(copy);
    }
    if (prototype !== Object.prototype || keys.length > 32) return invalidEligibilitySnapshot;
    const copy: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalidEligibilitySnapshot;
      const child = snapshotEligibilityNode(descriptor.value, depth + 1, seen);
      if (child === invalidEligibilitySnapshot) return invalidEligibilitySnapshot;
      copy[key] = child;
    }
    return Object.freeze(copy);
  } catch {
    return invalidEligibilitySnapshot;
  } finally {
    seen.delete(value);
  }
}
function exactPlainRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key))
    ? value as Record<string, unknown>
    : null;
}
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function opaque(value: unknown) { return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/u.test(value) && value.length > 0 && value.length <= 160; }
function validEvaluationTimestamp(value: unknown) { return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null; }
function freshness(value: unknown, fallback: number) { return value === undefined ? fallback : Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_FRESHNESS_MS ? value as number : null; }
function uniqueSorted(values: readonly string[]) { return Object.freeze([...new Set(values)].sort()); }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
