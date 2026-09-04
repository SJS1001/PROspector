type Effects = Readonly<{
  providerCalls: 0;
  exportMutations: 0;
  csvSerializations: 0;
  deliveryInvocations: 0;
  durableMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
}>;

const PROSPECT_STATUSES = ["export_ready", "needs_review", "non_contactable"] as const;
const CONTACT_KINDS = ["email", "phone"] as const;
const VERIFICATION_CLASSES = ["mailbox_verified", "source_verified", "generated", "mx_only"] as const;
type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
type ContactKind = (typeof CONTACT_KINDS)[number];
type VerificationClass = (typeof VERIFICATION_CLASSES)[number];

type ProspectProjection = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  profileId: string;
  qualificationDigest: string;
  status: ProspectStatus;
  packageId: string;
  packageDigest: string;
  packageApprovalId: string;
  packageApprovalDigest: string;
  packageApprovalExpiresAt: number;
  packageCurrent: boolean;
  packageApproved: boolean;
  configurationCurrent: boolean;
  disqualified: boolean;
  highRiskDrift: boolean;
  deleted: boolean;
}>;

type ContactPointProjection = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  profileId: string;
  prospectId: string;
  contactId: string;
  identityDigest: string;
  kind: ContactKind;
  verificationClass: VerificationClass;
  verificationMethodDigest: string;
  verificationEvidenceDigest: string;
  verifiedAt: number;
  freshUntil: number;
  identityCurrent: boolean;
  suppressionMatchRefIds: readonly string[];
}>;

type CandidateSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  productId: string;
  marketPlayId: string;
  profileId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  evaluatedAt: number;
  prospects: readonly ProspectProjection[];
  contactPoints: readonly ContactPointProjection[];
}>;

type IncludedRow = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointId: string;
  rowIdentityDigest: string;
  packageId: string;
  packageDigest: string;
  verificationClass: "mailbox_verified" | "source_verified";
  verificationMethodDigest: string;
  verificationEvidenceDigest: string;
  verifiedAt: number;
  freshUntil: number;
}>;

type Exclusion = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointId: string;
  reasonCodes: readonly string[];
}>;

type NonContactableManifestRef = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointId: string;
  suppressionMatchRefIds: readonly string[];
  reason: "suppressed_non_contactable";
}>;

type EligibilityProjection = Readonly<{
  uniqueProspectCount: number;
  eligibleContactRowCount: number;
  includedRows: readonly IncludedRow[];
  exclusions: readonly Exclusion[];
  nonContactableManifestRefs: readonly NonContactableManifestRef[];
}>;

export type SyntheticHandoffEligibilityCandidate = Readonly<{
  kind: "synthetic_phase7_handoff_eligibility_candidate";
  id: string;
  digest: string;
  snapshot: CandidateSnapshot;
  projection: EligibilityProjection;
  operationalHandoffClaimed: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
  persistenceAuthorized: false;
  csvSerializationAuthorized: false;
  deliveryAuthorized: false;
  exportAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

type CurrentAuthority = Readonly<{
  evaluatedAt: number;
  scopeCurrent: boolean;
  upstreamProjectionsCurrent: boolean;
  packageAuthorityCurrent: boolean;
  identityAuthorityCurrent: boolean;
  verificationAuthorityCurrent: boolean;
  suppressionAuthorityCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const candidates = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  exportMutations: 0,
  csvSerializations: 0,
  deliveryInvocations: 0,
  durableMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
});

/**
 * Canonicalizes current synthetic Phase 4-6 projection references and models
 * which stable contact-point identities would be eligible at one instant. It
 * cannot materialize bytes, persist a snapshot, deliver a file, or export.
 */
export async function buildSyntheticHandoffEligibilityCandidate(
  value: unknown,
): Promise<SyntheticHandoffEligibilityCandidate> {
  try {
    const snapshot = normalizeCandidate(value);
    const projection = await projectEligibility(snapshot);
    const artifact: SyntheticHandoffEligibilityCandidate = deepFreeze({
      kind: "synthetic_phase7_handoff_eligibility_candidate",
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify({ snapshot, projection })),
      snapshot,
      projection,
      operationalHandoffClaimed: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      persistenceAuthorized: false,
      csvSerializationAuthorized: false,
      deliveryAuthorized: false,
      exportAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    candidates.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_handoff_eligibility_candidate_invalid");
  }
}

/**
 * Rechecks only whether the synthetic projection tuple is still current. A
 * passing result grants no snapshot, serialization, persistence, or effect
 * authority and is not an operational CRM handoff.
 */
export async function evaluateSyntheticHandoffEligibilityCandidate(value: unknown) {
  try {
    const input = exactRecord(value, ["candidate", "currentCandidate", "currentAuthority"]);
    if (!candidates.has(input.candidate as object)) invalid();
    const artifact = input.candidate as SyntheticHandoffEligibilityCandidate;
    const current = await buildSyntheticHandoffEligibilityCandidate(input.currentCandidate);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("handoff_candidate_changed");
    if (authority.evaluatedAt < artifact.snapshot.evaluatedAt) {
      reasons.push("evaluation_precedes_handoff_candidate");
    }
    if (!authority.scopeCurrent) reasons.push("handoff_scope_not_current");
    if (!authority.upstreamProjectionsCurrent) reasons.push("handoff_upstream_projections_not_current");
    if (!authority.packageAuthorityCurrent) reasons.push("handoff_package_authority_not_current");
    if (!authority.identityAuthorityCurrent) reasons.push("handoff_identity_authority_not_current");
    if (!authority.verificationAuthorityCurrent) reasons.push("handoff_verification_authority_not_current");
    if (!authority.suppressionAuthorityCurrent) reasons.push("handoff_suppression_authority_not_current");
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort(compareText));
    return deepFreeze({
      kind: "synthetic_phase7_handoff_eligibility_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_handoff_eligibility_current_no_authority" as const
        : "synthetic_handoff_eligibility_rejected" as const,
      candidateId: artifact.id,
      candidateDigest: artifact.digest,
      uniqueProspectCount: artifact.projection.uniqueProspectCount,
      eligibleContactRowCount: artifact.projection.eligibleContactRowCount,
      currentProjectionClaimed: reasonCodes.length === 0,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
      persistenceAuthorized: false as const,
      csvSerializationAuthorized: false as const,
      deliveryAuthorized: false as const,
      exportAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      reasonCodes,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_phase7_handoff_eligibility_decision_invalid");
  }
}

function normalizeCandidate(value: unknown): CandidateSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "productId", "marketPlayId", "profileId",
    "profileConfigurationId", "profileConfigurationDigest", "evaluatedAt", "prospects", "contactPoints",
  ]);
  const evaluatedAt = timestamp(input.evaluatedAt);
  const prospects = denseArray(input.prospects, 0, 4_096).map(normalizeProspect)
    .sort((left, right) => compareText(left.id, right.id));
  assertUnique(prospects.map((entry) => entry.id));
  const contactPoints = denseArray(input.contactPoints, 0, 8_192).map((entry) => (
    normalizeContactPoint(entry, evaluatedAt)
  )).sort(compareContactPoint);
  assertConsistentContactPointDuplicates(contactPoints);
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    productId: syntheticId(input.productId),
    marketPlayId: syntheticId(input.marketPlayId),
    profileId: syntheticId(input.profileId),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    evaluatedAt,
    prospects,
    contactPoints,
  });
}

function normalizeProspect(value: unknown): ProspectProjection {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "profileId", "qualificationDigest", "status",
    "packageId", "packageDigest", "packageApprovalId", "packageApprovalDigest",
    "packageApprovalExpiresAt", "packageCurrent", "packageApproved", "configurationCurrent",
    "disqualified", "highRiskDrift", "deleted",
  ]);
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    profileId: syntheticId(input.profileId),
    qualificationDigest: digest(input.qualificationDigest),
    status: enumValue(input.status, PROSPECT_STATUSES),
    packageId: syntheticId(input.packageId),
    packageDigest: digest(input.packageDigest),
    packageApprovalId: syntheticId(input.packageApprovalId),
    packageApprovalDigest: digest(input.packageApprovalDigest),
    packageApprovalExpiresAt: timestamp(input.packageApprovalExpiresAt),
    packageCurrent: booleanValue(input.packageCurrent),
    packageApproved: booleanValue(input.packageApproved),
    configurationCurrent: booleanValue(input.configurationCurrent),
    disqualified: booleanValue(input.disqualified),
    highRiskDrift: booleanValue(input.highRiskDrift),
    deleted: booleanValue(input.deleted),
  });
}

function normalizeContactPoint(value: unknown, evaluatedAt: number): ContactPointProjection {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "profileId", "prospectId", "contactId", "identityDigest",
    "kind", "verificationClass", "verificationMethodDigest", "verificationEvidenceDigest",
    "verifiedAt", "freshUntil", "identityCurrent", "suppressionMatchRefIds",
  ]);
  const verifiedAt = timestamp(input.verifiedAt);
  const freshUntil = timestamp(input.freshUntil);
  if (verifiedAt > evaluatedAt || freshUntil <= verifiedAt) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    profileId: syntheticId(input.profileId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    identityDigest: digest(input.identityDigest),
    kind: enumValue(input.kind, CONTACT_KINDS),
    verificationClass: enumValue(input.verificationClass, VERIFICATION_CLASSES),
    verificationMethodDigest: digest(input.verificationMethodDigest),
    verificationEvidenceDigest: digest(input.verificationEvidenceDigest),
    verifiedAt,
    freshUntil,
    identityCurrent: booleanValue(input.identityCurrent),
    suppressionMatchRefIds: sortedUniqueIds(input.suppressionMatchRefIds, 0, 64),
  });
}

async function projectEligibility(snapshot: CandidateSnapshot): Promise<EligibilityProjection> {
  const prospects = new Map(snapshot.prospects.map((entry) => [entry.id, entry]));
  const includedRows: IncludedRow[] = [];
  const exclusions: Exclusion[] = [];
  const nonContactableManifestRefs: NonContactableManifestRef[] = [];
  const seen = new Map<string, string>();

  for (const point of snapshot.contactPoints) {
    const identityKey = `${point.prospectId}\0${point.id}`;
    const canonical = JSON.stringify(point);
    const previous = seen.get(identityKey);
    if (previous !== undefined) {
      if (previous !== canonical) invalid();
      exclusions.push(exclusion(point, ["duplicate_contact_point"]));
      continue;
    }
    seen.set(identityKey, canonical);
    const prospect = prospects.get(point.prospectId);
    const reasons = eligibilityReasons(snapshot, prospect, point);
    if (reasons.length > 0) {
      exclusions.push(exclusion(point, reasons));
      if (point.suppressionMatchRefIds.length > 0) {
        nonContactableManifestRefs.push(deepFreeze({
          prospectId: point.prospectId,
          contactId: point.contactId,
          contactPointId: point.id,
          suppressionMatchRefIds: point.suppressionMatchRefIds,
          reason: "suppressed_non_contactable",
        }));
      }
      continue;
    }
    if (!prospect || !isEligibleVerification(point.verificationClass)) invalid();
    includedRows.push(deepFreeze({
      prospectId: prospect.id,
      contactId: point.contactId,
      contactPointId: point.id,
      rowIdentityDigest: await sha256Ascii(`${prospect.id}\0${point.id}`),
      packageId: prospect.packageId,
      packageDigest: prospect.packageDigest,
      verificationClass: point.verificationClass,
      verificationMethodDigest: point.verificationMethodDigest,
      verificationEvidenceDigest: point.verificationEvidenceDigest,
      verifiedAt: point.verifiedAt,
      freshUntil: point.freshUntil,
    }));
  }

  const uniqueProspectCount = new Set(includedRows.map((row) => row.prospectId)).size;
  return deepFreeze({
    uniqueProspectCount,
    eligibleContactRowCount: includedRows.length,
    includedRows,
    exclusions: exclusions.sort(compareExclusion),
    nonContactableManifestRefs: nonContactableManifestRefs.sort(compareManifestRef),
  });
}

function eligibilityReasons(
  snapshot: CandidateSnapshot,
  prospect: ProspectProjection | undefined,
  point: ContactPointProjection,
) {
  const reasons: string[] = [];
  if (!prospect) reasons.push("prospect_missing");
  if (point.workspaceId !== snapshot.workspaceId || point.companyId !== snapshot.companyId
    || point.profileId !== snapshot.profileId || (prospect && (
      prospect.workspaceId !== snapshot.workspaceId || prospect.companyId !== snapshot.companyId
      || prospect.profileId !== snapshot.profileId
    ))) reasons.push("scope_mismatch");
  if (prospect) {
    if (prospect.status !== "export_ready") reasons.push("prospect_not_export_ready");
    if (!prospect.packageCurrent) reasons.push("package_not_current");
    if (!prospect.packageApproved) reasons.push("package_not_approved");
    if (prospect.packageApprovalExpiresAt <= snapshot.evaluatedAt) reasons.push("package_approval_expired");
    if (!prospect.configurationCurrent) reasons.push("configuration_not_current");
    if (prospect.disqualified) reasons.push("prospect_disqualified");
    if (prospect.highRiskDrift) reasons.push("high_risk_drift");
    if (prospect.deleted) reasons.push("prospect_deleted");
  }
  if (!point.identityCurrent) reasons.push("identity_not_current");
  if (!isEligibleVerification(point.verificationClass)) reasons.push("verification_not_eligible");
  if (point.freshUntil <= snapshot.evaluatedAt) reasons.push("verification_stale");
  if (point.suppressionMatchRefIds.length > 0) reasons.push("suppressed");
  return [...new Set(reasons)].sort(compareText);
}

function exclusion(point: ContactPointProjection, reasonCodes: readonly string[]): Exclusion {
  return deepFreeze({
    prospectId: point.prospectId,
    contactId: point.contactId,
    contactPointId: point.id,
    reasonCodes: deepFreeze([...reasonCodes].sort(compareText)),
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "scopeCurrent", "upstreamProjectionsCurrent", "packageAuthorityCurrent",
    "identityAuthorityCurrent", "verificationAuthorityCurrent", "suppressionAuthorityCurrent",
    "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    scopeCurrent: booleanValue(input.scopeCurrent),
    upstreamProjectionsCurrent: booleanValue(input.upstreamProjectionsCurrent),
    packageAuthorityCurrent: booleanValue(input.packageAuthorityCurrent),
    identityAuthorityCurrent: booleanValue(input.identityAuthorityCurrent),
    verificationAuthorityCurrent: booleanValue(input.verificationAuthorityCurrent),
    suppressionAuthorityCurrent: booleanValue(input.suppressionAuthorityCurrent),
    externalEffectsDisabled: booleanValue(input.externalEffectsDisabled),
  });
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const keys = Object.keys(descriptors);
  if (keys.sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const expected = [...Array(value.length).keys()].map(String);
  const actual = Object.keys(descriptors).filter((key) => key !== "length");
  if (actual.sort().join("\0") !== expected.sort().join("\0")) invalid();
  return expected.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    return descriptor.value;
  });
}

function sortedUniqueIds(value: unknown, minimum: number, maximum: number) {
  const items = denseArray(value, minimum, maximum).map(syntheticId).sort(compareText);
  assertUnique(items);
  return deepFreeze(items);
}

function assertConsistentContactPointDuplicates(points: readonly ContactPointProjection[]) {
  const seen = new Map<string, string>();
  for (const point of points) {
    const key = `${point.prospectId}\0${point.id}`;
    const canonical = JSON.stringify(point);
    const previous = seen.get(key);
    if (previous !== undefined && previous !== canonical) invalid();
    seen.set(key, canonical);
  }
}

function compareContactPoint(left: ContactPointProjection, right: ContactPointProjection) {
  return compareText(left.prospectId, right.prospectId)
    || compareText(left.id, right.id)
    || compareText(JSON.stringify(left), JSON.stringify(right));
}

function compareExclusion(left: Exclusion, right: Exclusion) {
  return compareText(left.prospectId, right.prospectId)
    || compareText(left.contactPointId, right.contactPointId)
    || compareText(left.reasonCodes.join("\0"), right.reasonCodes.join("\0"));
}

function compareManifestRef(left: NonContactableManifestRef, right: NonContactableManifestRef) {
  return compareText(left.prospectId, right.prospectId) || compareText(left.contactPointId, right.contactPointId);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isEligibleVerification(value: VerificationClass): value is "mailbox_verified" | "source_verified" {
  return value === "mailbox_verified" || value === "source_verified";
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) invalid();
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid();
  return value as T[number];
}

function assertUnique(values: readonly string[]) {
  if (new Set(values).size !== values.length) invalid();
}

async function sha256Ascii(value: string) {
  if ([...value].some((character) => character.charCodeAt(0) > 0x7f)) invalid();
  const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0));
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalid(): never {
  throw new Error("invalid");
}
