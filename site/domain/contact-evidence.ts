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
  providerAuthority: Readonly<{
    providerId: string;
    providerVersion: string;
    catalogRef: string;
  }> | null;
}>;

export type ContactVerifierDescriptor = Readonly<{
  verifierId: string;
  verifierVersion: string;
}>;

export type ContactVerificationRequest = Readonly<{
  assignmentId: string;
  prospectId: string;
  role: "champion" | "economic_buyer" | "general";
  assignment: Readonly<Omit<ContactEvidenceAssignment, "providerAuthority"> & {
    providerId: string;
    providerVersion: string;
    catalogRef: string;
    quoteRevision: number;
  }>;
  envelope: unknown;
}>;

export type ContactVerificationVerdict = Readonly<{
  observationId: string;
  workspaceId: string;
  contactId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  kind: ContactPointKind;
  normalizedValue: string;
  contentHash: string;
  verificationClass: ContactVerificationClass;
  method: ContactMethod;
  verifiedAt: number | null;
  providerId: string | null;
  providerVersion: string | null;
  catalogRef: string | null;
  verdictReference: string;
  verdictDigest: string;
}>;

export type ContactEvidenceVerifier = Readonly<{
  kind: "bound";
  descriptor: ContactVerifierDescriptor;
  verify(input: ContactVerificationRequest): Promise<ContactVerificationVerdict | unknown>;
}>;

/**
 * Output from a trusted server-side verifier. Provider adapters must never
 * manufacture this value or place any of its authority fields in their envelope.
 * Structural equality is insufficient: ingestion also requires the module-local
 * receipt issued by executeContactVerification.
 */
export type TrustedContactVerification = Readonly<{
  observationId: string;
  workspaceId: string;
  contactId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  kind: ContactPointKind;
  normalizedValue: string;
  contentHash: string;
  verificationClass: ContactVerificationClass;
  method: ContactMethod;
  verifiedAt: number | null;
  providerId: string | null;
  providerVersion: string | null;
  catalogRef: string | null;
  verifierId: string;
  verifierVersion: string;
  verdictReference: string;
  verdictDigest: string;
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
  providerId: string | null;
  providerVersion: string | null;
  catalogRef: string | null;
  verificationAuthority: Readonly<{
    verifierId: string;
    verifierVersion: string;
    verdictReference: string;
    verdictDigest: string;
  }> | null;
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
const admittedContactObservations = new WeakSet<object>();
const serverBoundVerifiers = new WeakSet<object>();
const trustedVerificationReceipts = new WeakSet<object>();

/**
 * The server composition root binds a verification implementation to one
 * immutable verifier identity. Neither callback output nor provider evidence can
 * choose or replace that identity.
 */
export function bindContactEvidenceVerifier(
  descriptorValue: ContactVerifierDescriptor,
  verify: ContactEvidenceVerifier["verify"],
): ContactEvidenceVerifier {
  const descriptor = normalizeVerifierDescriptor(descriptorValue);
  if (!descriptor || typeof verify !== "function") throw new TypeError("invalid_contact_verifier_binding");
  const verifier: ContactEvidenceVerifier = Object.freeze({
    kind: "bound" as const,
    descriptor,
    verify,
  });
  serverBoundVerifiers.add(verifier);
  return verifier;
}

/**
 * Executes only a module-branded verifier and returns an unforgeable in-process
 * receipt. JSON copies and raw structural verdicts intentionally lose authority.
 */
export async function executeContactVerification(
  verifierValue: ContactEvidenceVerifier | unknown,
  requestValue: ContactVerificationRequest | unknown,
): Promise<TrustedContactVerification | null> {
  if (!isBoundContactEvidenceVerifier(verifierValue)) return null;
  const request = normalizeVerificationRequest(requestValue);
  if (!request) return null;
  try {
    const verdictValue = await verifierValue.verify(request);
    const verdict = normalizeVerifierVerdict(verdictValue, request);
    if (!verdict) return null;
    const receipt = deepFreeze({
      ...verdict,
      verifierId: verifierValue.descriptor.verifierId,
      verifierVersion: verifierValue.descriptor.verifierVersion,
    });
    trustedVerificationReceipts.add(receipt);
    return receipt;
  } catch {
    return null;
  }
}

export function isBoundContactEvidenceVerifier(value: unknown): value is ContactEvidenceVerifier {
  return !!value
    && typeof value === "object"
    && serverBoundVerifiers.has(value)
    && (value as ContactEvidenceVerifier).kind === "bound"
    && normalizeVerifierDescriptor((value as ContactEvidenceVerifier).descriptor) !== null
    && typeof (value as ContactEvidenceVerifier).verify === "function";
}

/**
 * Defensively accepts only a bounded, assignment-bound immutable observation.
 * It intentionally returns a value rather than writing it: preparation code must
 * not become a runtime ingestion path before the Phase 5 authority gate exists.
 */
export function ingestContactEvidence(
  assignmentValue: ContactEvidenceAssignment | unknown,
  envelopeValue: unknown,
  trustedVerificationValue?: TrustedContactVerification | unknown,
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

  if ([
    "verificationClass", "method", "verifiedAt", "provider", "providerId",
    "providerVersion", "catalogVersion", "catalogRef", "verificationAuthority",
  ].some((key) => Object.hasOwn(envelope, key))) {
    return blocked("untrusted_verification_authority");
  }

  const id = opaque(envelope.id, 160);
  const kind: ContactPointKind | null = envelope.kind === "email" || envelope.kind === "phone" ? envelope.kind : null;
  const confidence = typeof envelope.confidence === "number" ? envelope.confidence : Number.NaN;
  if (!id || !kind || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return blocked("invalid_contact_claim");
  }

  const normalizedValue = normalizeContactValue(kind, envelope.value);
  const provenance = normalizeProvenance(envelope.provenance);
  const observedAt = timestamp(envelope.observedAt);
  if (!normalizedValue || !provenance || observedAt === null || provenance.retrievedAt > observedAt) {
    return blocked("invalid_contact_provenance");
  }
  const trusted = trustedVerificationValue === undefined
    ? null
    : normalizeTrustedVerification(trustedVerificationValue, assignment, {
        id, kind, normalizedValue, contentHash: provenance.contentHash,
      });
  if (trustedVerificationValue !== undefined && !trusted) return blocked("invalid_verification_authority");

  const verificationClass = trusted?.verificationClass ?? "suggested";
  const method = trusted?.method ?? "pattern_inference";
  const verifiedAt = trusted?.verifiedAt ?? null;
  if (verifiedAt !== null && (verifiedAt > observedAt || verifiedAt < provenance.retrievedAt)) return blocked("invalid_verification_time");
  if (!methodMatchesClaim(kind, verificationClass, method, verifiedAt)) return blocked("unrecognized_verification_method");

  const parentObservationId = envelope.lineage === undefined ? null : optionalLineage(envelope.lineage);
  if (envelope.lineage !== undefined && parentObservationId === undefined) return blocked("invalid_evidence_lineage");

  const observation = deepFreeze({
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
    providerId: trusted?.providerId ?? null,
    providerVersion: trusted?.providerVersion ?? null,
    catalogRef: trusted?.catalogRef ?? null,
    verificationAuthority: trusted ? {
      verifierId: trusted.verifierId,
      verifierVersion: trusted.verifierVersion,
      verdictReference: trusted.verdictReference,
      verdictDigest: trusted.verdictDigest,
    } : null,
    lineage: { parentObservationId: parentObservationId ?? null },
  });
  admittedContactObservations.add(observation);
  return Object.freeze({ accepted: true as const, observation });
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
 * Re-validates an observation before it is used as eligibility input. During this
 * local/in-memory preparation lane, structural validity is necessary but not
 * sufficient: the exact object must also carry the module-local admission receipt
 * issued only by ingestContactEvidence. JSON copies and provider-shaped objects
 * therefore fail closed even when every field is well formed.
 *
 * Persisted observations intentionally remain invalid after deserialization until
 * a future authenticated repository rehydration seam can verify durable authority
 * and issue a fresh internal receipt. No public bypass exists in this module.
 */
export function isDefensivelyValidContactObservation(value: unknown): value is ContactObservation {
  const observation = record(value);
  if (!observation || !admittedContactObservations.has(observation)) return false;
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
  const providerId = observation.providerId === null ? null : optionalText(observation.providerId, 120);
  const providerVersion = observation.providerVersion === null ? null : optionalText(observation.providerVersion, 120);
  const catalogRef = observation.catalogRef === null ? null : optionalText(observation.catalogRef, 256);
  const providerTupleValid = (
    observation.providerId === null && observation.providerVersion === null && observation.catalogRef === null
  ) || (
    providerId !== null && providerVersion !== null && catalogRef !== null
  );
  const verificationAuthority = observation.verificationAuthority === null
    ? null
    : normalizeStoredVerificationAuthority(observation.verificationAuthority);
  const lineage = record(observation.lineage);
  const parentObservationId = lineage && Object.hasOwn(lineage, "parentObservationId")
    ? lineage.parentObservationId === null ? null : opaque(lineage.parentObservationId, 160) : undefined;
  const chronologyValid = observedAt !== null && provenance !== null && provenance.retrievedAt <= observedAt;
  const verifiedTimeValid = verifiedAt === null
    ? observation.verifiedAt === null && methodMatchesClaim(kind as ContactPointKind, verificationClass as ContactVerificationClass, method as ContactMethod, null)
    : chronologyValid && verifiedAt <= observedAt && verifiedAt >= provenance.retrievedAt && methodMatchesClaim(kind as ContactPointKind, verificationClass as ContactVerificationClass, method as ContactMethod, verifiedAt);
  return Boolean(
    id && workspaceId && contactId && profileConfigurationId && profileConfigurationDigest && kind && verificationClass && method &&
    typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 &&
    normalizedValue === observation.normalizedValue && provenance && chronologyValid &&
    (observation.verifiedAt === null || verifiedAt !== null) && verifiedTimeValid &&
    providerTupleValid &&
    (observation.verificationAuthority === null || verificationAuthority !== null) &&
    (!(verificationClass === "mailbox_verified" || verificationClass === "source_verified") || verificationAuthority !== null) &&
    lineage && parentObservationId !== undefined,
  );
}

function normalizeTrustedVerification(
  value: unknown,
  assignment: ContactEvidenceAssignment,
  evidence: Readonly<{ id: string; kind: ContactPointKind; normalizedValue: string; contentHash: string }>,
): TrustedContactVerification | null {
  const input = record(value);
  if (!input || !trustedVerificationReceipts.has(input)) return null;
  const verificationClass = typeof input.verificationClass === "string" && CLASSES.has(input.verificationClass)
    ? input.verificationClass as ContactVerificationClass : null;
  const method = typeof input.method === "string" && METHODS.has(input.method as ContactMethod)
    ? input.method as ContactMethod : null;
  const verifiedAt = input.verifiedAt === null ? null : timestamp(input.verifiedAt);
  const providerId = input.providerId === null ? null : optionalText(input.providerId, 120);
  const providerVersion = input.providerVersion === null ? null : optionalText(input.providerVersion, 120);
  const catalogRef = input.catalogRef === null ? null : optionalText(input.catalogRef, 256);
  const providerTupleValid = (
    input.providerId === null && input.providerVersion === null && input.catalogRef === null
  ) || (
    providerId !== null && providerVersion !== null && catalogRef !== null
  );
  const verifierId = opaque(input.verifierId, 160);
  const verifierVersion = opaque(input.verifierVersion, 160);
  const verdictReference = opaque(input.verdictReference, 256);
  const verdictDigest = typeof input.verdictDigest === "string" && HASH.test(input.verdictDigest)
    ? input.verdictDigest : null;
  if (
    input.observationId !== evidence.id ||
    input.workspaceId !== assignment.workspaceId ||
    input.contactId !== assignment.contactId ||
    input.profileConfigurationId !== assignment.profileConfigurationId ||
    input.profileConfigurationDigest !== assignment.profileConfigurationDigest ||
    input.kind !== evidence.kind ||
    input.normalizedValue !== evidence.normalizedValue ||
    input.contentHash !== evidence.contentHash ||
    !verificationClass ||
    !method ||
    (input.verifiedAt !== null && verifiedAt === null) ||
    !providerTupleValid ||
    !providerMatchesAssignment(assignment, providerId, providerVersion, catalogRef) ||
    !verifierId ||
    !verifierVersion ||
    !verdictReference ||
    !verdictDigest ||
    !methodMatchesClaim(evidence.kind, verificationClass, method, verifiedAt)
  ) return null;
  return deepFreeze({
    observationId: evidence.id,
    workspaceId: assignment.workspaceId,
    contactId: assignment.contactId,
    profileConfigurationId: assignment.profileConfigurationId,
    profileConfigurationDigest: assignment.profileConfigurationDigest,
    kind: evidence.kind,
    normalizedValue: evidence.normalizedValue,
    contentHash: evidence.contentHash,
    verificationClass,
    method,
    verifiedAt,
    providerId,
    providerVersion,
    catalogRef,
    verifierId,
    verifierVersion,
    verdictReference,
    verdictDigest,
  });
}

function normalizeVerificationRequest(value: unknown): ContactVerificationRequest | null {
  const input = exactRecord(value, ["assignmentId", "prospectId", "role", "assignment", "envelope"]);
  if (!input) return null;
  const assignment = exactRecord(input.assignment, [
    "workspaceId", "contactId", "profileConfigurationId", "profileConfigurationDigest",
    "providerId", "providerVersion", "catalogRef", "quoteRevision",
  ]);
  const assignmentId = opaque(input.assignmentId, 256);
  const prospectId = opaque(input.prospectId, 256);
  const role = input.role === "champion" || input.role === "economic_buyer" || input.role === "general"
    ? input.role : null;
  if (
    !assignment ||
    !assignmentId ||
    !prospectId ||
    !role ||
    !opaque(assignment.workspaceId, 160) ||
    !opaque(assignment.contactId, 160) ||
    !opaque(assignment.profileConfigurationId, 160) ||
    typeof assignment.profileConfigurationDigest !== "string" ||
    !HASH.test(assignment.profileConfigurationDigest) ||
    !safeText(assignment.providerId, 120) ||
    !safeText(assignment.providerVersion, 120) ||
    !safeText(assignment.catalogRef, 256) ||
    !Number.isSafeInteger(assignment.quoteRevision) ||
    (assignment.quoteRevision as number) <= 0
  ) return null;
  return Object.freeze({
    assignmentId,
    prospectId,
    role,
    assignment: Object.freeze({
      workspaceId: assignment.workspaceId as string,
      contactId: assignment.contactId as string,
      profileConfigurationId: assignment.profileConfigurationId as string,
      profileConfigurationDigest: assignment.profileConfigurationDigest,
      providerId: assignment.providerId as string,
      providerVersion: assignment.providerVersion as string,
      catalogRef: assignment.catalogRef as string,
      quoteRevision: assignment.quoteRevision as number,
    }),
    envelope: input.envelope,
  });
}

function normalizeVerifierVerdict(
  value: unknown,
  request: ContactVerificationRequest,
): Omit<TrustedContactVerification, "verifierId" | "verifierVersion"> | null {
  const input = exactRecord(value, [
    "observationId", "workspaceId", "contactId", "profileConfigurationId",
    "profileConfigurationDigest", "kind", "normalizedValue", "contentHash",
    "verificationClass", "method", "verifiedAt", "providerId", "providerVersion",
    "catalogRef", "verdictReference", "verdictDigest",
  ]);
  const envelope = record(request.envelope);
  if (!input || !envelope) return null;
  const evidenceId = opaque(envelope.id, 160);
  const evidenceKind = envelope.kind === "email" || envelope.kind === "phone" ? envelope.kind : null;
  const normalizedValue = evidenceKind ? normalizeContactValue(evidenceKind, envelope.value) : null;
  const provenance = normalizeProvenance(envelope.provenance);
  if (!evidenceId || !evidenceKind || !normalizedValue || !provenance) return null;
  const assignment: ContactEvidenceAssignment = {
    workspaceId: request.assignment.workspaceId,
    contactId: request.assignment.contactId,
    profileConfigurationId: request.assignment.profileConfigurationId,
    profileConfigurationDigest: request.assignment.profileConfigurationDigest,
    providerAuthority: {
      providerId: request.assignment.providerId,
      providerVersion: request.assignment.providerVersion,
      catalogRef: request.assignment.catalogRef,
    },
  };
  const verificationClass = typeof input.verificationClass === "string" && CLASSES.has(input.verificationClass)
    ? input.verificationClass as ContactVerificationClass : null;
  const method = typeof input.method === "string" && METHODS.has(input.method as ContactMethod)
    ? input.method as ContactMethod : null;
  const verifiedAt = input.verifiedAt === null ? null : timestamp(input.verifiedAt);
  const providerId = input.providerId === null ? null : optionalText(input.providerId, 120);
  const providerVersion = input.providerVersion === null ? null : optionalText(input.providerVersion, 120);
  const catalogRef = input.catalogRef === null ? null : optionalText(input.catalogRef, 256);
  const verdictReference = opaque(input.verdictReference, 256);
  const verdictDigest = typeof input.verdictDigest === "string" && HASH.test(input.verdictDigest)
    ? input.verdictDigest : null;
  if (
    input.observationId !== evidenceId ||
    input.workspaceId !== assignment.workspaceId ||
    input.contactId !== assignment.contactId ||
    input.profileConfigurationId !== assignment.profileConfigurationId ||
    input.profileConfigurationDigest !== assignment.profileConfigurationDigest ||
    input.kind !== evidenceKind ||
    input.normalizedValue !== normalizedValue ||
    input.contentHash !== provenance.contentHash ||
    !verificationClass ||
    !method ||
    (input.verifiedAt !== null && verifiedAt === null) ||
    !providerMatchesAssignment(assignment, providerId, providerVersion, catalogRef) ||
    !verdictReference ||
    !verdictDigest ||
    !methodMatchesClaim(evidenceKind, verificationClass, method, verifiedAt)
  ) return null;
  return deepFreeze({
    observationId: evidenceId,
    workspaceId: assignment.workspaceId,
    contactId: assignment.contactId,
    profileConfigurationId: assignment.profileConfigurationId,
    profileConfigurationDigest: assignment.profileConfigurationDigest,
    kind: evidenceKind,
    normalizedValue,
    contentHash: provenance.contentHash,
    verificationClass,
    method,
    verifiedAt,
    providerId,
    providerVersion,
    catalogRef,
    verdictReference,
    verdictDigest,
  });
}

function normalizeVerifierDescriptor(value: unknown): ContactVerifierDescriptor | null {
  const input = exactRecord(value, ["verifierId", "verifierVersion"]);
  if (!input) return null;
  const verifierId = opaque(input.verifierId, 160);
  const verifierVersion = opaque(input.verifierVersion, 160);
  return verifierId && verifierVersion ? Object.freeze({ verifierId, verifierVersion }) : null;
}

function normalizeStoredVerificationAuthority(value: unknown) {
  const input = record(value);
  if (!input) return null;
  const verifierId = opaque(input.verifierId, 160);
  const verifierVersion = opaque(input.verifierVersion, 160);
  const verdictReference = opaque(input.verdictReference, 256);
  const verdictDigest = typeof input.verdictDigest === "string" && HASH.test(input.verdictDigest)
    ? input.verdictDigest : null;
  return verifierId && verifierVersion && verdictReference && verdictDigest
    ? Object.freeze({ verifierId, verifierVersion, verdictReference, verdictDigest })
    : null;
}

function assignmentRecord(value: unknown): ContactEvidenceAssignment | null {
  const input = record(value);
  if (!input) return null;
  const workspaceId = opaque(input.workspaceId, 160);
  const contactId = opaque(input.contactId, 160);
  const profileConfigurationId = opaque(input.profileConfigurationId, 160);
  const profileConfigurationDigest = typeof input.profileConfigurationDigest === "string" && HASH.test(input.profileConfigurationDigest)
    ? input.profileConfigurationDigest : null;
  const providerAuthority = input.providerAuthority === null ? null : normalizeProviderAuthority(input.providerAuthority);
  return workspaceId && contactId && profileConfigurationId && profileConfigurationDigest &&
    (input.providerAuthority === null || providerAuthority !== null)
    ? Object.freeze({ workspaceId, contactId, profileConfigurationId, profileConfigurationDigest, providerAuthority }) : null;
}

function normalizeProviderAuthority(value: unknown) {
  const input = record(value);
  if (!input) return null;
  const providerId = safeText(input.providerId, 120);
  const providerVersion = safeText(input.providerVersion, 120);
  const catalogRef = safeText(input.catalogRef, 256);
  return providerId && providerVersion && catalogRef
    ? Object.freeze({ providerId, providerVersion, catalogRef })
    : null;
}

function providerMatchesAssignment(
  assignment: ContactEvidenceAssignment,
  providerId: string | null,
  providerVersion: string | null,
  catalogRef: string | null,
) {
  const expected = assignment.providerAuthority;
  return expected === null
    ? providerId === null && providerVersion === null && catalogRef === null
    : providerId === expected.providerId && providerVersion === expected.providerVersion && catalogRef === expected.catalogRef;
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
function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const input = record(value);
  if (!input) return null;
  const prototype = Object.getPrototypeOf(input);
  return (prototype === null || prototype === Object.prototype)
    && Object.keys(input).sort().join(",") === [...keys].sort().join(",")
    ? input
    : null;
}
function opaque(value: unknown, max: number): string | null { return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/u.test(value) && value.length <= max ? value : null; }
function safeText(value: unknown, max: number): string | null { if (typeof value !== "string") return null; const text = value.normalize("NFC").trim(); return text && text.length <= max && !/[<>\u0000-\u001f]/u.test(text) ? text : null; }
function optionalText(value: unknown, max: number): string | null { return value === undefined || value === null ? null : safeText(value, max); }
function optionalLineage(value: unknown): string | null | undefined { const lineage = record(value); if (!lineage) return undefined; return lineage.parentObservationId === null || lineage.parentObservationId === undefined ? null : opaque(lineage.parentObservationId, 160) ?? undefined; }
function timestamp(value: unknown): number | null { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_640_000_000_000_000 ? value as number : null; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
