import { isDefensivelyValidContactObservation, type ContactObservation } from "./contact-evidence";

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
  profileAvailable: boolean;
  configurationCurrent: boolean;
  drifted: boolean;
  disqualified: boolean;
  suppressed: boolean;
  phase4Approved: boolean;
  contactCapabilityEnabled: boolean;
}>;
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
    state: "eligible" | "suggestion" | "invalid" | "stale" | "configuration_mismatch";
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
  points?: readonly ContactObservation[];
  strategy?: ContactStrategy;
  authority?: Partial<ContactEligibilityAuthority>;
  now?: number;
} | unknown): ContactEligibility {
  const input = record(value);
  const now = validTimestamp(input?.now) ?? Date.now();
  const authority = normalizeAuthority(input?.authority);
  const reasonCodes = authorityReasons(authority);
  const strategy = normalizeStrategy(input?.strategy);
  if (!strategy) reasonCodes.push("invalid_contact_strategy");

  const points = Array.isArray(input?.points) ? input.points.filter(isDefensivelyValidContactObservation) : [];
  const projected = points.map((point) => projectPoint(point, strategy, now));
  if (!points.length) reasonCodes.push("no_contact_evidence");
  if (projected.some((point) => point.state === "stale")) reasonCodes.push("contact_evidence_stale");
  if (projected.some((point) => point.state === "invalid")) reasonCodes.push("contact_evidence_invalid");
  if (projected.some((point) => point.state === "configuration_mismatch")) reasonCodes.push("contact_configuration_mismatch");
  if (projected.length > 0 && projected.every((point) => point.state === "suggestion")) reasonCodes.push("verification_class_ineligible");

  const hasEligible = projected.some((point) => point.state === "eligible");
  const suppressed = authority.suppressed;
  const blockedForReview = reasonCodes.length > 0;
  const state: ContactEligibilityState = suppressed
    ? "NonContactable"
    : hasEligible && !blockedForReview ? "ContactReady"
    : hasEligible || projected.some((point) => point.state === "stale" || point.state === "invalid" || point.state === "configuration_mismatch") || authority.drifted || authority.disqualified
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

function projectPoint(point: ContactObservation, strategy: Freshness | null, now: number) {
  const eligibleClass = point.verificationClass === "mailbox_verified" || point.verificationClass === "source_verified";
  if (!eligibleClass) return freeze({ observationId: point.id, state: point.verificationClass === "invalid" ? "invalid" as const : "suggestion" as const, freshnessExpiresAt: null, verificationClass: point.verificationClass });
  if (strategy && (point.profileConfigurationId !== strategy.configurationId || point.profileConfigurationDigest !== strategy.configurationDigest)) {
    return freeze({ observationId: point.id, state: "configuration_mismatch" as const, freshnessExpiresAt: null, verificationClass: point.verificationClass });
  }
  const maxAge = strategy ? freshnessFor(point, strategy) : null;
  if (maxAge === null || point.verifiedAt === null || point.verifiedAt > now) return freeze({ observationId: point.id, state: "invalid" as const, freshnessExpiresAt: null, verificationClass: point.verificationClass });
  const freshnessExpiresAt = point.verifiedAt + maxAge;
  return freeze({ observationId: point.id, state: now >= freshnessExpiresAt ? "stale" as const : "eligible" as const, freshnessExpiresAt, verificationClass: point.verificationClass });
}

type Freshness = Readonly<Pick<ContactStrategy, "configurationId" | "configurationDigest"> & Required<Pick<ContactStrategy, "mailboxVerifiedEmailFreshnessMs" | "sourceVerifiedEmailFreshnessMs" | "verifiedBusinessPhoneFreshnessMs">>>;
function normalizeStrategy(value: unknown): Freshness | null {
  const strategy = record(value);
  if (!strategy || !opaque(strategy.configurationId) || typeof strategy.configurationDigest !== "string" || !DIGEST.test(strategy.configurationDigest)) return null;
  const mailboxVerifiedEmailFreshnessMs = freshness(strategy.mailboxVerifiedEmailFreshnessMs, DEFAULT_CONTACT_FRESHNESS_MS.mailboxVerifiedEmail);
  const sourceVerifiedEmailFreshnessMs = freshness(strategy.sourceVerifiedEmailFreshnessMs, DEFAULT_CONTACT_FRESHNESS_MS.sourceVerifiedEmail);
  const verifiedBusinessPhoneFreshnessMs = freshness(strategy.verifiedBusinessPhoneFreshnessMs, DEFAULT_CONTACT_FRESHNESS_MS.verifiedBusinessPhone);
  return mailboxVerifiedEmailFreshnessMs && sourceVerifiedEmailFreshnessMs && verifiedBusinessPhoneFreshnessMs
    ? Object.freeze({ configurationId: strategy.configurationId as string, configurationDigest: strategy.configurationDigest, mailboxVerifiedEmailFreshnessMs, sourceVerifiedEmailFreshnessMs, verifiedBusinessPhoneFreshnessMs }) : null;
}
function freshnessFor(point: ContactObservation, strategy: Freshness) {
  if (point.verificationClass === "mailbox_verified" && point.kind === "email") return strategy.mailboxVerifiedEmailFreshnessMs;
  if (point.verificationClass === "source_verified" && point.kind === "email") return strategy.sourceVerifiedEmailFreshnessMs;
  if (point.verificationClass === "source_verified" && point.kind === "phone") return strategy.verifiedBusinessPhoneFreshnessMs;
  return null;
}
function normalizeAuthority(value: unknown): ContactEligibilityAuthority {
  const input = record(value) ?? {};
  return Object.freeze({
    profileAvailable: input.profileAvailable === true,
    configurationCurrent: input.configurationCurrent === true,
    drifted: input.drifted === true,
    disqualified: input.disqualified === true,
    suppressed: input.suppressed === true,
    phase4Approved: input.phase4Approved === true,
    contactCapabilityEnabled: input.contactCapabilityEnabled === true,
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
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function opaque(value: unknown) { return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/u.test(value) && value.length > 0 && value.length <= 160; }
function validTimestamp(value: unknown) { return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null; }
function freshness(value: unknown, fallback: number) { return value === undefined ? fallback : Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_FRESHNESS_MS ? value as number : null; }
function uniqueSorted(values: readonly string[]) { return Object.freeze([...new Set(values)].sort()); }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
