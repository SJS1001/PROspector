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

export type CommittedContactEvidenceAssignment = Readonly<ContactEvidenceAssignment & {
  assignmentId: string;
  prospectId: string;
  role: "champion" | "economic_buyer" | "general";
  quoteRevision: number;
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

export type ContactEvidenceBatchVerifier = Readonly<{
  kind: "batch_bound";
  descriptor: ContactVerifierDescriptor;
  verifyBatch(inputs: readonly ContactVerificationRequest[]): Promise<readonly unknown[] | unknown>;
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
  requestDigest: string;
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
  assignmentContext: Readonly<{
    assignmentId: string;
    prospectId: string;
    role: "champion" | "economic_buyer" | "general";
    quoteRevision: number;
  }> | null;
  verificationAuthority: Readonly<{
    assignmentId: string;
    prospectId: string;
    role: "champion" | "economic_buyer" | "general";
    quoteRevision: number;
    verifierId: string;
    verifierVersion: string;
    requestDigest: string;
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
const serverBoundBatchVerifiers = new WeakSet<object>();
const trustedVerificationReceipts = new WeakSet<object>();
type TrustedVerificationBinding = Readonly<{
  request: ContactVerificationRequest;
  verifier: ContactVerifierDescriptor;
  canonicalRequest: string;
  requestDigest: string;
}>;
const trustedVerificationBindings = new WeakMap<object, TrustedVerificationBinding>();

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
 * Binds one all-or-nothing batch callback. Multi-contact operations use this
 * seam exactly once, then validate the complete ordered verdict set before any
 * in-process receipt is issued.
 */
export function bindContactEvidenceBatchVerifier(
  descriptorValue: ContactVerifierDescriptor,
  verifyBatch: ContactEvidenceBatchVerifier["verifyBatch"],
): ContactEvidenceBatchVerifier {
  const descriptor = normalizeVerifierDescriptor(descriptorValue);
  if (!descriptor || typeof verifyBatch !== "function") throw new TypeError("invalid_contact_batch_verifier_binding");
  const verifier: ContactEvidenceBatchVerifier = Object.freeze({
    kind: "batch_bound" as const,
    descriptor,
    verifyBatch,
  });
  serverBoundBatchVerifiers.add(verifier);
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
    const verifier = verifierValue.descriptor;
    const prepared = await prepareTrustedVerification(verdict, request, verifier);
    const receipt = admitPreparedVerification(prepared);
    return receipt;
  } catch {
    return null;
  }
}

/**
 * Executes one module-branded batch callback and admits receipts only after the
 * complete dense, ordered, one-to-one verdict set has validated. A malformed,
 * partial, duplicated, reordered, or throwing result therefore admits nothing.
 */
export async function executeContactVerificationBatch(
  verifierValue: ContactEvidenceBatchVerifier | unknown,
  requestValues: readonly ContactVerificationRequest[] | unknown,
): Promise<readonly TrustedContactVerification[] | null> {
  if (!isBoundContactEvidenceBatchVerifier(verifierValue)) return null;
  const requests = normalizeVerificationRequestBatch(requestValues);
  if (!requests) return null;
  try {
    const verdictValues = snapshotVerificationVerdictBatch(
      await verifierValue.verifyBatch(requests),
      requests.length,
    );
    if (!verdictValues) return null;
    const verdicts = verdictValues.map((value, index) => normalizeVerifierVerdict(value, requests[index]));
    if (verdicts.some((verdict) => verdict === null)) return null;
    const observationIds = verdicts.map((verdict) => verdict!.observationId);
    if (new Set(observationIds).size !== observationIds.length) return null;
    const verifier = verifierValue.descriptor;
    const prepared = await Promise.all(verdicts.map((verdict, index) =>
      prepareTrustedVerification(verdict!, requests[index], verifier)
    ));
    const receipts = prepared.map(admitPreparedVerification);
    return Object.freeze(receipts);
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

export function isBoundContactEvidenceBatchVerifier(value: unknown): value is ContactEvidenceBatchVerifier {
  return !!value
    && typeof value === "object"
    && serverBoundBatchVerifiers.has(value)
    && (value as ContactEvidenceBatchVerifier).kind === "batch_bound"
    && normalizeVerifierDescriptor((value as ContactEvidenceBatchVerifier).descriptor) !== null
    && typeof (value as ContactEvidenceBatchVerifier).verifyBatch === "function";
}

/**
 * Purely validates and snapshots one provider envelope against its complete
 * committed assignment. It issues no verifier receipt and admits no observation,
 * so callers can preflight an entire outcome before starting trusted work.
 */
export function preflightContactEvidenceEnvelope(
  assignmentValue: CommittedContactEvidenceAssignment | unknown,
  envelopeValue: unknown,
): Readonly<Record<string, unknown>> | null {
  const assignment = committedAssignmentRecord(snapshotCloneableBoundedData(assignmentValue));
  const envelopeSnapshot = snapshotCloneableBoundedData(envelopeValue);
  if (!assignment || !envelopeSnapshot) return null;
  const envelope = normalizeVerificationEnvelope(
    envelopeSnapshot,
    assignment.assignmentId,
    assignment.prospectId,
  );
  if (
    !envelope
    || !Object.hasOwn(envelope, "assignmentId")
    || !Object.hasOwn(envelope, "prospectId")
    || envelope.assignmentId !== assignment.assignmentId
    || envelope.prospectId !== assignment.prospectId
    || envelope.workspaceId !== assignment.workspaceId
    || envelope.contactId !== assignment.contactId
    || envelope.profileConfigurationId !== assignment.profileConfigurationId
    || envelope.profileConfigurationDigest !== assignment.profileConfigurationDigest
  ) return null;
  return envelope;
}

/**
 * Defensively accepts only a bounded, assignment-bound immutable observation.
 * It intentionally returns a value rather than writing it: preparation code must
 * not become a runtime ingestion path before the Phase 5 authority gate exists.
 */
export function ingestContactEvidence(
  assignmentValue: ContactEvidenceAssignment | CommittedContactEvidenceAssignment | unknown,
  envelopeValue: unknown,
  trustedVerificationValue?: TrustedContactVerification | unknown,
): ContactEvidenceResult {
  const assignmentSnapshot = snapshotCloneableBoundedData(assignmentValue);
  const envelopeSnapshot = snapshotCloneableBoundedData(envelopeValue);
  const committedAssignment = committedAssignmentRecord(assignmentSnapshot);
  const assignment = committedAssignment ?? assignmentRecord(assignmentSnapshot);
  const envelope = record(envelopeSnapshot);
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
    : committedAssignment
      ? normalizeTrustedVerification(trustedVerificationValue, committedAssignment, {
        id, kind, normalizedValue, contentHash: provenance.contentHash,
      }, envelope)
      : null;
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
    assignmentContext: committedAssignment ? {
      assignmentId: committedAssignment.assignmentId,
      prospectId: committedAssignment.prospectId,
      role: committedAssignment.role,
      quoteRevision: committedAssignment.quoteRevision,
    } : null,
    verificationAuthority: trusted ? {
      assignmentId: committedAssignment!.assignmentId,
      prospectId: committedAssignment!.prospectId,
      role: committedAssignment!.role,
      quoteRevision: committedAssignment!.quoteRevision,
      verifierId: trusted.verifierId,
      verifierVersion: trusted.verifierVersion,
      requestDigest: trusted.requestDigest,
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
  const assignmentContext = observation.assignmentContext === null
    ? null
    : normalizeStoredAssignmentContext(observation.assignmentContext);
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
    (observation.assignmentContext === null || assignmentContext !== null) &&
    (observation.verificationAuthority === null || verificationAuthority !== null) &&
    (!(verificationClass === "mailbox_verified" || verificationClass === "source_verified") || assignmentContext !== null) &&
    (!(verificationClass === "mailbox_verified" || verificationClass === "source_verified") || verificationAuthority !== null) &&
    lineage && parentObservationId !== undefined,
  );
}

function normalizeTrustedVerification(
  value: unknown,
  assignment: CommittedContactEvidenceAssignment,
  evidence: Readonly<{ id: string; kind: ContactPointKind; normalizedValue: string; contentHash: string }>,
  envelope: Record<string, unknown>,
): TrustedContactVerification | null {
  const input = record(value);
  const binding = input ? trustedVerificationBindings.get(input) : undefined;
  if (
    !input
    || !trustedVerificationReceipts.has(input)
    || !binding
    || !HASH.test(binding.requestDigest)
  ) return null;
  const boundAssignment = binding.request.assignment;
  const exactEnvelope = normalizeVerificationEnvelope(
    envelope,
    assignment.assignmentId,
    assignment.prospectId,
  );
  const currentRequest = exactEnvelope && assignment.providerAuthority ? Object.freeze({
    assignmentId: assignment.assignmentId,
    prospectId: assignment.prospectId,
    role: assignment.role,
    assignment: Object.freeze({
      workspaceId: assignment.workspaceId,
      contactId: assignment.contactId,
      profileConfigurationId: assignment.profileConfigurationId,
      profileConfigurationDigest: assignment.profileConfigurationDigest,
      providerId: assignment.providerAuthority.providerId,
      providerVersion: assignment.providerAuthority.providerVersion,
      catalogRef: assignment.providerAuthority.catalogRef,
      quoteRevision: assignment.quoteRevision,
    }),
    envelope: exactEnvelope,
  }) : null;
  if (
    !exactEnvelope
    || !currentRequest
    || assignment.assignmentId !== binding.request.assignmentId
    || assignment.prospectId !== binding.request.prospectId
    || assignment.role !== binding.request.role
    || assignment.quoteRevision !== boundAssignment.quoteRevision
    || assignment.workspaceId !== boundAssignment.workspaceId
    || assignment.contactId !== boundAssignment.contactId
    || assignment.profileConfigurationId !== boundAssignment.profileConfigurationId
    || assignment.profileConfigurationDigest !== boundAssignment.profileConfigurationDigest
    || assignment.providerAuthority === null
    || assignment.providerAuthority.providerId !== boundAssignment.providerId
    || assignment.providerAuthority.providerVersion !== boundAssignment.providerVersion
    || assignment.providerAuthority.catalogRef !== boundAssignment.catalogRef
    || canonicalVerificationBinding(currentRequest, binding.verifier) !== binding.canonicalRequest
  ) return null;
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
    verifierId !== binding.verifier.verifierId ||
    verifierVersion !== binding.verifier.verifierVersion ||
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
    requestDigest: binding.requestDigest,
    verdictReference,
    verdictDigest,
  });
}

function normalizeVerificationRequest(value: unknown): ContactVerificationRequest | null {
  const snapshot = snapshotCloneableBoundedData(value);
  if (!snapshot) return null;
  const input = exactRecord(snapshot, ["assignmentId", "prospectId", "role", "assignment", "envelope"]);
  if (!input) return null;
  const assignment = exactRecord(input.assignment, [
    "workspaceId", "contactId", "profileConfigurationId", "profileConfigurationDigest",
    "providerId", "providerVersion", "catalogRef", "quoteRevision",
  ]);
  const assignmentId = opaque(input.assignmentId, 256);
  const prospectId = opaque(input.prospectId, 256);
  const role = input.role === "champion" || input.role === "economic_buyer" || input.role === "general"
    ? input.role : null;
  const envelope = normalizeVerificationEnvelope(input.envelope, assignmentId, prospectId);
  if (
    !assignment ||
    !assignmentId ||
    !prospectId ||
    !role ||
    !envelope ||
    !opaque(assignment.workspaceId, 160) ||
    !opaque(assignment.contactId, 160) ||
    !opaque(assignment.profileConfigurationId, 160) ||
    typeof assignment.profileConfigurationDigest !== "string" ||
    !HASH.test(assignment.profileConfigurationDigest) ||
    !safeText(assignment.providerId, 120) ||
    !safeText(assignment.providerVersion, 120) ||
    !safeText(assignment.catalogRef, 256) ||
    !Number.isSafeInteger(assignment.quoteRevision) ||
    (assignment.quoteRevision as number) <= 0 ||
    envelope.workspaceId !== assignment.workspaceId ||
    envelope.contactId !== assignment.contactId ||
    envelope.profileConfigurationId !== assignment.profileConfigurationId ||
    envelope.profileConfigurationDigest !== assignment.profileConfigurationDigest
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
    envelope,
  });
}

function normalizeVerificationRequestBatch(value: unknown): readonly ContactVerificationRequest[] | null {
  try {
    if (
      !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || value.length < 1
      || value.length > 100
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== value.length + 1
      || !Object.hasOwn(descriptors, "length")
    ) return null;
    const requests: ContactVerificationRequest[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      const request = normalizeVerificationRequest(descriptor.value);
      if (!request) return null;
      requests.push(request);
    }
    const assignmentIds = requests.map((request) => request.assignmentId);
    const observationIds = requests.map((request) => (request.envelope as Record<string, unknown>).id);
    if (
      new Set(assignmentIds).size !== assignmentIds.length
      || new Set(observationIds).size !== observationIds.length
    ) return null;
    structuredClone(value);
    return Object.freeze(requests);
  } catch {
    return null;
  }
}

function snapshotVerificationVerdictBatch(value: unknown, expectedLength: number): readonly unknown[] | null {
  try {
    if (
      !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || value.length !== expectedLength
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== expectedLength + 1
      || !Object.hasOwn(descriptors, "length")
    ) return null;
    const verdicts: unknown[] = [];
    for (let index = 0; index < expectedLength; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      const verdict = snapshotCloneableBoundedData(descriptor.value);
      if (!verdict) return null;
      verdicts.push(verdict);
    }
    structuredClone(value);
    return Object.freeze(verdicts);
  } catch {
    return null;
  }
}

type PreparedTrustedVerification = Readonly<{
  receipt: TrustedContactVerification;
  binding: TrustedVerificationBinding;
}>;

async function prepareTrustedVerification(
  verdict: Omit<TrustedContactVerification, "verifierId" | "verifierVersion" | "requestDigest">,
  request: ContactVerificationRequest,
  verifier: ContactVerifierDescriptor,
): Promise<PreparedTrustedVerification> {
  const canonicalRequest = canonicalVerificationBinding(request, verifier);
  const requestDigest = await verificationBindingDigest(canonicalRequest);
  return Object.freeze({
    receipt: deepFreeze({
      ...verdict,
      verifierId: verifier.verifierId,
      verifierVersion: verifier.verifierVersion,
      requestDigest,
    }),
    binding: Object.freeze({
      request,
      verifier,
      canonicalRequest,
      requestDigest,
    }),
  });
}

function admitPreparedVerification(prepared: PreparedTrustedVerification): TrustedContactVerification {
  trustedVerificationReceipts.add(prepared.receipt);
  trustedVerificationBindings.set(prepared.receipt, prepared.binding);
  return prepared.receipt;
}

function normalizeVerificationEnvelope(
  value: unknown,
  assignmentId: string | null,
  prospectId: string | null,
): Readonly<Record<string, unknown>> | null {
  if (!assignmentId || !prospectId) return null;
  const envelope = record(value);
  if (!envelope || Object.getPrototypeOf(envelope) !== Object.prototype) return null;
  const requiredKeys = [
    "id", "workspaceId", "contactId", "profileConfigurationId",
    "profileConfigurationDigest", "kind", "value", "confidence",
    "provenance", "observedAt",
  ];
  const optionalKeys = ["assignmentId", "prospectId", "lineage"];
  const keys = Object.keys(envelope);
  if (
    requiredKeys.some((key) => !Object.hasOwn(envelope, key))
    || keys.some((key) => !requiredKeys.includes(key) && !optionalKeys.includes(key))
    || (Object.hasOwn(envelope, "assignmentId") !== Object.hasOwn(envelope, "prospectId"))
  ) return null;
  const provenance = exactRecord(envelope.provenance, [
    "sourceReference", "excerpt", "objectReference", "contentHash", "retrievedAt",
  ]);
  const observedAt = timestamp(envelope.observedAt);
  const normalizedProvenance = normalizeProvenance(provenance);
  if (
    !opaque(envelope.id, 160)
    || !opaque(envelope.workspaceId, 160)
    || !opaque(envelope.contactId, 160)
    || !opaque(envelope.profileConfigurationId, 160)
    || typeof envelope.profileConfigurationDigest !== "string"
    || !HASH.test(envelope.profileConfigurationDigest)
    || (envelope.kind !== "email" && envelope.kind !== "phone")
    || typeof envelope.value !== "string"
    || envelope.value.length === 0
    || envelope.value.length > 512
    || !Number.isFinite(envelope.confidence)
    || (envelope.confidence as number) < 0
    || (envelope.confidence as number) > 1
    || !normalizedProvenance
    || observedAt === null
    || normalizedProvenance.retrievedAt > observedAt
  ) return null;
  if (
    Object.hasOwn(envelope, "assignmentId")
    && (envelope.assignmentId !== assignmentId || envelope.prospectId !== prospectId)
  ) return null;
  if (Object.hasOwn(envelope, "lineage")) {
    const lineage = exactRecord(envelope.lineage, ["parentObservationId"]);
    if (
      !lineage
      || (lineage.parentObservationId !== null && !opaque(lineage.parentObservationId, 160))
    ) return null;
  }
  return envelope;
}

function normalizeVerifierVerdict(
  value: unknown,
  request: ContactVerificationRequest,
): Omit<TrustedContactVerification, "verifierId" | "verifierVersion" | "requestDigest"> | null {
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
  const input = exactRecord(value, [
    "assignmentId", "prospectId", "role", "quoteRevision",
    "verifierId", "verifierVersion", "requestDigest", "verdictReference", "verdictDigest",
  ]);
  if (!input) return null;
  const assignmentId = opaque(input.assignmentId, 256);
  const prospectId = opaque(input.prospectId, 256);
  const role = input.role === "champion" || input.role === "economic_buyer" || input.role === "general"
    ? input.role : null;
  const quoteRevision = Number.isSafeInteger(input.quoteRevision) && (input.quoteRevision as number) > 0
    ? input.quoteRevision as number : null;
  const verifierId = opaque(input.verifierId, 160);
  const verifierVersion = opaque(input.verifierVersion, 160);
  const requestDigest = typeof input.requestDigest === "string" && HASH.test(input.requestDigest)
    ? input.requestDigest : null;
  const verdictReference = opaque(input.verdictReference, 256);
  const verdictDigest = typeof input.verdictDigest === "string" && HASH.test(input.verdictDigest)
    ? input.verdictDigest : null;
  return assignmentId && prospectId && role && quoteRevision && verifierId && verifierVersion && requestDigest && verdictReference && verdictDigest
    ? Object.freeze({
        assignmentId, prospectId, role, quoteRevision,
        verifierId, verifierVersion, requestDigest, verdictReference, verdictDigest,
      })
    : null;
}

function normalizeStoredAssignmentContext(value: unknown) {
  const input = exactRecord(value, ["assignmentId", "prospectId", "role", "quoteRevision"]);
  if (!input) return null;
  const assignmentId = opaque(input.assignmentId, 256);
  const prospectId = opaque(input.prospectId, 256);
  const role = input.role === "champion" || input.role === "economic_buyer" || input.role === "general"
    ? input.role : null;
  const quoteRevision = Number.isSafeInteger(input.quoteRevision) && (input.quoteRevision as number) > 0
    ? input.quoteRevision as number : null;
  return assignmentId && prospectId && role && quoteRevision
    ? Object.freeze({ assignmentId, prospectId, role, quoteRevision })
    : null;
}

function assignmentRecord(value: unknown): ContactEvidenceAssignment | null {
  const input = exactRecord(value, [
    "workspaceId", "contactId", "profileConfigurationId",
    "profileConfigurationDigest", "providerAuthority",
  ]);
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

function committedAssignmentRecord(value: unknown): CommittedContactEvidenceAssignment | null {
  const input = exactRecord(value, [
    "assignmentId", "prospectId", "role", "quoteRevision",
    "workspaceId", "contactId", "profileConfigurationId",
    "profileConfigurationDigest", "providerAuthority",
  ]);
  if (!input) return null;
  const base = assignmentRecord({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    profileConfigurationId: input.profileConfigurationId,
    profileConfigurationDigest: input.profileConfigurationDigest,
    providerAuthority: input.providerAuthority,
  });
  const assignmentId = opaque(input.assignmentId, 256);
  const prospectId = opaque(input.prospectId, 256);
  const role = input.role === "champion" || input.role === "economic_buyer" || input.role === "general"
    ? input.role : null;
  const quoteRevision = Number.isSafeInteger(input.quoteRevision) && (input.quoteRevision as number) > 0
    ? input.quoteRevision as number : null;
  return base && assignmentId && prospectId && role && quoteRevision
    ? Object.freeze({ assignmentId, prospectId, role, quoteRevision, ...base })
    : null;
}

function normalizeProviderAuthority(value: unknown) {
  const input = exactRecord(value, ["providerId", "providerVersion", "catalogRef"]);
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
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== keys.length
      || keys.some((key) => !Object.hasOwn(descriptors, key))
    ) return null;
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}
const invalidDataSnapshot = Symbol("invalid_contact_data_snapshot");
function snapshotBoundedPlainData(value: unknown): unknown | null {
  const budget = { nodes: 0, text: 0 };
  const snapshot = snapshotBoundedNode(value, 0, new Set<object>(), budget);
  return snapshot === invalidDataSnapshot ? null : snapshot;
}
function snapshotCloneableBoundedData(value: unknown): unknown | null {
  const snapshot = snapshotBoundedPlainData(value);
  if (!snapshot) return null;
  try {
    // Descriptor validation rejects accessors first; this then rejects Proxy
    // objects at any depth without retaining caller-owned state.
    structuredClone(value);
  } catch {
    return null;
  }
  return snapshot;
}
function snapshotBoundedNode(
  value: unknown,
  depth: number,
  seen: Set<object>,
  budget: { nodes: number; text: number },
): unknown | typeof invalidDataSnapshot {
  if (depth > 5 || budget.nodes > 256) return invalidDataSnapshot;
  budget.nodes += 1;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : invalidDataSnapshot;
  if (typeof value === "string") {
    budget.text += value.length;
    return value.length <= 4_096 && budget.text <= 32_768 ? value : invalidDataSnapshot;
  }
  if (typeof value !== "object" || seen.has(value)) return invalidDataSnapshot;
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== "string")) return invalidDataSnapshot;
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) return invalidDataSnapshot;
      const lengthDescriptor = descriptors.length;
      if (
        !lengthDescriptor
        || !("value" in lengthDescriptor)
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || lengthDescriptor.value > 100
        || ownKeys.length !== lengthDescriptor.value + 1
      ) return invalidDataSnapshot;
      const copy: unknown[] = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalidDataSnapshot;
        const child = snapshotBoundedNode(descriptor.value, depth + 1, seen, budget);
        if (child === invalidDataSnapshot) return invalidDataSnapshot;
        copy.push(child);
      }
      return Object.freeze(copy);
    }
    if (prototype !== Object.prototype || ownKeys.length > 24) return invalidDataSnapshot;
    const copy: Record<string, unknown> = {};
    for (const key of ownKeys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalidDataSnapshot;
      const child = snapshotBoundedNode(descriptor.value, depth + 1, seen, budget);
      if (child === invalidDataSnapshot) return invalidDataSnapshot;
      copy[key] = child;
    }
    return Object.freeze(copy);
  } catch {
    return invalidDataSnapshot;
  } finally {
    seen.delete(value);
  }
}
function canonicalVerificationBinding(
  request: ContactVerificationRequest,
  verifier: ContactVerifierDescriptor,
): string {
  return canonicalContactData({ request, verifier });
}
function canonicalContactData(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalContactData).join(",")}]`;
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return `{${Object.keys(input).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalContactData(input[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
async function verificationBindingDigest(canonicalRequest: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRequest),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
function opaque(value: unknown, max: number): string | null { return typeof value === "string" && /^[A-Za-z0-9_.:-]+$/u.test(value) && value.length <= max ? value : null; }
function safeText(value: unknown, max: number): string | null { if (typeof value !== "string") return null; const text = value.normalize("NFC").trim(); return text && text.length <= max && !/[<>\u0000-\u001f]/u.test(text) ? text : null; }
function optionalText(value: unknown, max: number): string | null { return value === undefined || value === null ? null : safeText(value, max); }
function optionalLineage(value: unknown): string | null | undefined { const lineage = record(value); if (!lineage) return undefined; return lineage.parentObservationId === null || lineage.parentObservationId === undefined ? null : opaque(lineage.parentObservationId, 160) ?? undefined; }
function timestamp(value: unknown): number | null { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_640_000_000_000_000 ? value as number : null; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
