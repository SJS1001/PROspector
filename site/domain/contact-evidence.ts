/**
 * Provider-neutral contact evidence boundary.
 *
 * This module deliberately has no persistence, provider, or network dependency.  It
 * canonicalises the small immutable observation shape that a future repository may
 * store after its own authority/reservation checks.  In particular, an adapter's
 * confidence is descriptive metadata; it is never an eligibility decision.
 */

export const CONTACT_VERIFICATION_CLASSES = Object.freeze([
  "suggested",
  "domain_valid",
  "mailbox_verified",
  "source_verified",
  "invalid",
] as const);

export type ContactVerificationClass = (typeof CONTACT_VERIFICATION_CLASSES)[number];
export type ContactPointKind = "email" | "phone";
export type ContactMethod =
  | "pattern_inference"
  | "domain_validation"
  | "mailbox_verification"
  | "authoritative_source_reconfirmed";

export type ContactEvidenceAssignment = Readonly<{
  workspaceId: string;
  contactId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
}>;

export type ContactObservation = Readonly<{
  id: string;
  workspaceId: string;
  contactId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  kind: ContactPointKind;
  normalizedValue: string;
  verificationClass: ContactVerificationClass;
  confidence: number;
  method: ContactMethod;
  provenance: Readonly<{
    sourceReference: string;
    excerpt: string;
    objectReference: string;
    contentHash: string;
    retrievedAt: number;
  }>;
  observedAt: number;
  verifiedAt: number | null;
  provider: string | null;
  catalogVersion: string | null;
  lineage: Readonly<{ parentObservationId: string | null }>;
}>;

export type ContactEvidenceResult = Readonly<
  | { accepted: true; observation: ContactObservation }
  | { accepted: false; reason: string }
>;

const METHODS = new Set<ContactMethod>([
  "pattern_inference",
  "domain_validation",
  "mailbox_verification",
  "authoritative_source_reconfirmed",
]);
const CLASSES = new Set<string>(CONTACT_VERIFICATION_CLASSES);
const HASH = /^[a-f0-9]{64}$/u;
const E164 = /^\+[1-9][0-9]{7,14}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Defensively accepts only a bounded, assignment-bound immutable observation.
 * It intentionally returns a value rather than writing it: preparation code must
 * not become a runtime ingestion path before the Phase 5 authority gate exists.
 */
export function ingestContactEvidence(
  assignmentValue: ContactEvidenceAssignment | unknown,
  envelopeValue: unknown,
): ContactEvidenceResult {
  const assignment = assignmentRecord(assignmentValue);
  const envelope = record(envelopeValue);
  if (!assignment || !envelope) return blocked("malformed_evidence_envelope");

  if (
    envelope.workspaceId !== assignment.workspaceId ||
    envelope.contactId !== assignment.contactId ||
    envelope.profileConfigurationId !== assignment.profileConfigurationId ||
    envelope.profileConfigurationDigest !== assignment.profileConfigurationDigest
  ) return blocked("assignment_scope_mismatch");

  const id = opaque(envelope.id, 160);
  const kind: ContactPointKind | null = envelope.kind === "email" || envelope.kind === "phone" ? envelope.kind : null;
  const verificationClass = typeof envelope.verificationClass === "string" && CLASSES.has(envelope.verificationClass)
    ? envelope.verificationClass as ContactVerificationClass : null;
  const method = typeof envelope.method === "string" && METHODS.has(envelope.method as ContactMethod)
    ? envelope.method as ContactMethod : null;
  const confidence = typeof envelope.confidence === "number" ? envelope.confidence : Number.NaN;
  if (!id || !kind || !verificationClass || !method || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return blocked("invalid_contact_claim");
  }

  const normalizedValue = normalizeContactValue(kind, envelope.value);
  const provenance = normalizeProvenance(envelope.provenance);
  const observedAt = timestamp(envelope.observedAt);
  const verifiedAt = envelope.verifiedAt === null ? null : timestamp(envelope.verifiedAt);
  if (!normalizedValue || !provenance || observedAt === null || (envelope.verifiedAt !== null && verifiedAt === null)) {
    return blocked("invalid_contact_provenance");
  }
  if (verifiedAt !== null && (verifiedAt > observedAt || verifiedAt < provenance.retrievedAt)) return blocked("invalid_verification_time");
  if (!methodMatchesClaim(kind, verificationClass, method, verifiedAt)) return blocked("unrecognized_verification_method");

  const provider = optionalText(envelope.provider, 120);
  const catalogVersion = optionalText(envelope.catalogVersion, 120);
  if ((envelope.provider !== undefined && provider === null) || (envelope.catalogVersion !== undefined && catalogVersion === null)) {
    return blocked("invalid_provider_metadata");
  }
  const parentObservationId = envelope.lineage === undefined ? null : optionalLineage(envelope.lineage);
  if (envelope.lineage !== undefined && parentObservationId === undefined) return blocked("invalid_evidence_lineage");

  return Object.freeze({
    accepted: true as const,
    observation: deepFreeze({
      id,
      workspaceId: assignment.workspaceId,
      contactId: assignment.contactId,
      profileConfigurationId: assignment.profileConfigurationId,
      profileConfigurationDigest: assignment.profileConfigurationDigest,
      kind,
      normalizedValue,
      verificationClass,
      confidence,
      method,
      provenance,
      observedAt,
      verifiedAt,
      provider,
      catalogVersion,
      lineage: { parentObservationId: parentObservationId ?? null },
    }),
  });
}

export function normalizeBusinessEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").trim().toLowerCase();
  return normalized.length > 3 && normalized.length <= 320 && EMAIL.test(normalized) ? normalized : null;
}

export function normalizeBusinessPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.normalize("NFC").trim();
  if (!trimmed.startsWith("+") || !/^[+0-9().\-\s]+$/u.test(trimmed) || trimmed.slice(1).includes("+")) return null;
  const normalized = `+${trimmed.slice(1).replace(/[^0-9]/gu, "")}`;
  return E164.test(normalized) ? normalized : null;
}

/**
 * Re-validates a stored/read-model observation before it is used as eligibility
 * input.  Type assertions, provider-shaped JSON, and partial projections must not
 * be able to manufacture a verified contact point outside the ingestion boundary.
 */
export function isDefensivelyValidContactObservation(value: unknown): value is ContactObservation {
  const observation = record(value);
  if (!observation) return false;
  const id = opaque(observation.id, 160);
  const workspaceId = opaque(observation.workspaceId, 160);
  const contactId = opaque(observation.contactId, 160);
  const profileConfigurationId = opaque(observation.profileConfigurationId, 160);
  const profileConfigurationDigest = typeof observation.profileConfigurationDigest === "string" && HASH.test(observation.profileConfigurationDigest);
  const kind: ContactPointKind | null = observation.kind === "email" || observation.kind === "phone" ? observation.kind : null;
  const verificationClass = typeof observation.verificationClass === "string" && CLASSES.has(observation.verificationClass)
    ? observation.verificationClass as ContactVerificationClass : null;
  const method = typeof observation.method === "string" && METHODS.has(observation.method as ContactMethod)
    ? observation.method as ContactMethod : null;
  const confidence = observation.confidence;
  const normalizedValue = kind ? normalizeContactValue(kind, observation.normalizedValue) : null;
  const provenance = normalizeProvenance(observation.provenance);
  const observedAt = timestamp(observation.observedAt);
  const verifiedAt = observation.verifiedAt === null ? null : timestamp(observation.verifiedAt);
  const provider = observation.provider === null ? null : optionalText(observation.provider, 120);
  const catalogVersion = observation.catalogVersion === null ? null : optionalText(observation.catalogVersion, 120);
  const lineage = record(observation.lineage);
  const parentObservationId = lineage && Object.hasOwn(lineage, "parentObservationId")
    ? lineage.parentObservationId === null ? null : opaque(lineage.parentObservationId, 160) : undefined;
  const verifiedTimeValid = verifiedAt === null
    ? observation.verifiedAt === null && methodMatchesClaim(kind as ContactPointKind, verificationClass as ContactVerificationClass, method as ContactMethod, null)
    : observedAt !== null && provenance !== null && verifiedAt <= observedAt && verifiedAt >= provenance.retrievedAt && methodMatchesClaim(kind as ContactPointKind, verificationClass as ContactVerificationClass, method as ContactMethod, verifiedAt);
  return Boolean(
    id && workspaceId && contactId && profileConfigurationId && profileConfigurationDigest && kind && verificationClass && method &&
    typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 &&
    normalizedValue === observation.normalizedValue && provenance && observedAt !== null &&
    (observation.verifiedAt === null || verifiedAt !== null) && verifiedTimeValid &&
    (observation.provider === null || provider !== null) && (observation.catalogVersion === null || catalogVersion !== null) &&
    lineage && parentObservationId !== undefined,
  );
}

function assignmentRecord(value: unknown): ContactEvidenceAssignment | null {
  const input = record(value);
  if (!input) return null;
  const workspaceId = opaque(input.workspaceId, 160);
  const contactId = opaque(input.contactId, 160);
  const profileConfigurationId = opaque(input.profileConfigurationId, 160);
  const profileConfigurationDigest = typeof input.profileConfigurationDigest === "string" && HASH.test(input.profileConfigurationDigest)
    ? input.profileConfigurationDigest : null;
  return workspaceId && contactId && profileConfigurationId && profileConfigurationDigest
    ? Object.freeze({ workspaceId, contactId, profileConfigurationId, profileConfigurationDigest }) : null;
}

function normalizeContactValue(kind: ContactPointKind, value: unknown) {
  return kind === "email" ? normalizeBusinessEmail(value) : normalizeBusinessPhone(value);
}

function normalizeProvenance(value: unknown): ContactObservation["provenance"] | null {
  const provenance = record(value);
  if (!provenance) return null;
  const sourceReference = safeText(provenance.sourceReference, 600);
  const excerpt = safeText(provenance.excerpt, 800);
  const objectReference = safeText(provenance.objectReference, 600);
  const contentHash = typeof provenance.contentHash === "string" && HASH.test(provenance.contentHash) ? provenance.contentHash : null;
  const retrievedAt = timestamp(provenance.retrievedAt);
  return sourceReference && excerpt && objectReference && contentHash && retrievedAt !== null
    ? deepFreeze({ sourceReference, excerpt, objectReference, contentHash, retrievedAt }) : null;
}

function methodMatchesClaim(kind: ContactPointKind, verificationClass: ContactVerificationClass, method: ContactMethod, verifiedAt: number | null) {
  if (verificationClass === "mailbox_verified") return kind === "email" && method === "mailbox_verification" && verifiedAt !== null;
  if (verificationClass === "source_verified") return method === "authoritative_source_reconfirmed" && verifiedAt !== null;
  if (verificationClass === "domain_valid") return kind === "email" && method === "domain_validation";
  if (verificationClass === "suggested") return method === "pattern_inference";
  return true;
}

function blocked(reason: string): ContactEvidenceResult { return Object.freeze({ accepted: false as const, reason }); }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function opaque(value: unknown, max: number): string | null { return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/u.test(value) && value.length <= max ? value : null; }
function safeText(value: unknown, max: number): string | null { if (typeof value !== "string") return null; const text = value.normalize("NFC").trim(); return text && text.length <= max && !/[<>\u0000-\u001f]/u.test(text) ? text : null; }
function optionalText(value: unknown, max: number): string | null { return value === undefined || value === null ? null : safeText(value, max); }
function optionalLineage(value: unknown): string | null | undefined { const lineage = record(value); if (!lineage) return undefined; return lineage.parentObservationId === null || lineage.parentObservationId === undefined ? null : opaque(lineage.parentObservationId, 160) ?? undefined; }
function timestamp(value: unknown): number | null { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_640_000_000_000_000 ? value as number : null; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
