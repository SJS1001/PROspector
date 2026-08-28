type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type SuppressionKind =
  | "company"
  | "organization"
  | "contact"
  | "exact_email"
  | "confirmed_email_domain"
  | "exact_phone";
type Channel = "all" | "email" | "phone";
type Subject = Readonly<{
  refId: string;
  tombstoneId: string;
  kind: SuppressionKind;
  channel: Channel;
  scopeIdentityId: string;
  valueDigest: string;
  effectiveAt: number;
}>;
type Binding = Readonly<{
  identityId: string;
  identityKind: "contact" | "organization";
  subjectRefIds: readonly string[];
}>;
type MergeTransition = Readonly<{
  kind: "merge";
  id: string;
  digest: string;
  primaryIdentityId: string;
  secondaryIdentityIds: readonly string[];
  associationIds: readonly string[];
}>;
type SplitTransition = Readonly<{
  kind: "split";
  id: string;
  digest: string;
  sourceIdentityId: string;
  newIdentityId: string;
  retainedAssociationIds: readonly string[];
  movedAssociationIds: readonly string[];
}>;
type Transition = MergeTransition | SplitTransition;
type CandidateSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  transition: Transition;
  identityBindings: readonly Binding[];
  companySubjectRefIds: readonly string[];
  subjects: readonly Subject[];
  createdAt: number;
}>;

export type SyntheticSuppressionIdentityCandidate = Readonly<{
  kind: "synthetic_suppression_identity_candidate";
  id: string;
  digest: string;
  snapshot: CandidateSnapshot;
  identityMutationAuthorized: false;
  suppressionMutationAuthorized: false;
  tombstoneDeletionAuthorized: false;
  persistenceAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const candidateArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/** Canonicalizes only synthetic identity topology and suppression references. */
export async function buildSyntheticSuppressionIdentityCandidate(
  value: unknown,
): Promise<SyntheticSuppressionIdentityCandidate> {
  try {
    const snapshot = normalizeCandidate(value);
    const artifact: SyntheticSuppressionIdentityCandidate = deepFreeze({
      kind: "synthetic_suppression_identity_candidate",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      snapshot,
      identityMutationAuthorized: false,
      suppressionMutationAuthorized: false,
      tombstoneDeletionAuthorized: false,
      persistenceAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    candidateArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_suppression_identity_candidate_invalid");
  }
}

/**
 * Projects the most restrictive suppression reach after merge or split.
 * It cannot mutate an identity, tombstone, index, projection, or provider.
 */
export async function evaluateSyntheticSuppressionIdentityResolution(value: unknown) {
  try {
    const input = exactRecord(value, ["candidateArtifact", "currentCandidate", "currentAuthority"]);
    if (!candidateArtifacts.has(input.candidateArtifact as object)) invalid();
    const artifact = input.candidateArtifact as SyntheticSuppressionIdentityCandidate;
    const currentCandidate = await buildSyntheticSuppressionIdentityCandidate(input.currentCandidate);
    const current = normalizeAuthority(input.currentAuthority);
    const snapshot = artifact.snapshot;
    const reasons: string[] = [];

    if (currentCandidate.digest !== artifact.digest) reasons.push("suppression_identity_candidate_changed");
    if (!current.identityChangeCurrent) reasons.push("identity_change_not_current");
    if (!current.suppressionIndexAvailable) reasons.push("suppression_index_unavailable");
    if (!current.historicalAliasesRetained) reasons.push("historical_aliases_not_retained");
    if (!current.tombstonesAppendOnly) reasons.push("tombstones_not_append_only");
    if (current.evaluatedAt < snapshot.createdAt) reasons.push("evaluation_precedes_candidate");

    const preservedSubjectRefIds = sortedUniqueStrings([
      ...snapshot.companySubjectRefIds,
      ...snapshot.identityBindings.flatMap((binding) => binding.subjectRefIds),
    ]);
    const subjectByRef = new Map(snapshot.subjects.map((subject) => [subject.refId, subject]));
    const effectiveSubjectRefIds = preservedSubjectRefIds.filter(
      (refId) => subjectByRef.get(refId)!.effectiveAt <= current.evaluatedAt,
    );
    const effectiveSubjects = effectiveSubjectRefIds.map((refId) => subjectByRef.get(refId)!);
    const emailBlocked = effectiveSubjects.some((subject) => subject.channel === "all" || subject.channel === "email");
    const phoneBlocked = effectiveSubjects.some((subject) => subject.channel === "all" || subject.channel === "phone");

    const sourceIdentityIds = transitionSourceIds(snapshot.transition);
    const destinationIdentityIds = transitionDestinationIds(snapshot.transition);
    const destinationProjections = destinationIdentityIds.map((identityId) => deepFreeze({
      identityId,
      applicableSubjectRefIds: preservedSubjectRefIds,
      effectiveSubjectRefIds: deepFreeze([...effectiveSubjectRefIds]),
      emailBlocked,
      phoneBlocked,
    }));
    const retiredIdentityMappings = snapshot.transition.kind === "merge"
      ? snapshot.transition.secondaryIdentityIds.map((retiredIdentityId) => deepFreeze({
        retiredIdentityId,
        survivingIdentityId: snapshot.transition.primaryIdentityId,
      }))
      : [];
    const associationIds = snapshot.transition.kind === "merge"
      ? snapshot.transition.associationIds
      : sortedUniqueStrings([
        ...snapshot.transition.retainedAssociationIds,
        ...snapshot.transition.movedAssociationIds,
      ]);
    const associationInvalidations = associationIds.map((associationId) => deepFreeze({
      associationId,
      projection: effectiveSubjectRefIds.length > 0 ? "NonContactable" as const : "NeedsReview" as const,
    }));
    const reasonCodes = deepFreeze([...new Set(reasons)].sort());

    return deepFreeze({
      kind: "synthetic_suppression_identity_resolution_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_suppression_identity_resolution_projected_no_authority" as const
        : "synthetic_suppression_identity_resolution_rejected" as const,
      candidateId: snapshot.id,
      candidateDigest: artifact.digest,
      transitionId: snapshot.transition.id,
      transitionDigest: snapshot.transition.digest,
      transitionKind: snapshot.transition.kind,
      sourceIdentityIds,
      destinationIdentityIds,
      preservedSubjectRefIds,
      destinationProjections: deepFreeze(destinationProjections),
      retiredIdentityMappings: deepFreeze(retiredIdentityMappings),
      associationInvalidations: deepFreeze(associationInvalidations),
      splitConservativeCarryForwardRequired: snapshot.transition.kind === "split",
      reasonCodes,
      identityMutationAuthorized: false as const,
      suppressionMutationAuthorized: false as const,
      tombstoneDeletionAuthorized: false as const,
      persistenceAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_suppression_identity_resolution_invalid");
  }
}

function normalizeCandidate(value: unknown): CandidateSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "transition", "identityBindings",
    "companySubjectRefIds", "subjects", "createdAt",
  ]);
  const transition = normalizeTransition(input.transition);
  const sourceIds = transitionSourceIds(transition);
  const identityBindings = normalizeBindings(input.identityBindings, sourceIds);
  const companySubjectRefIds = sortedIds(input.companySubjectRefIds, 0, 1_024);
  const subjects = normalizeSubjects(input.subjects);
  const companyId = syntheticId(input.companyId);
  assertReferenceClosure(companyId, identityBindings, companySubjectRefIds, subjects);
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId,
    transition,
    identityBindings,
    companySubjectRefIds,
    subjects,
    createdAt: timestamp(input.createdAt),
  });
}

function normalizeTransition(value: unknown): Transition {
  const base = dataRecord(value);
  if (base.kind === "merge") {
    const input = exactRecord(value, [
      "kind", "id", "digest", "primaryIdentityId", "secondaryIdentityIds", "associationIds",
    ]);
    const primaryIdentityId = syntheticId(input.primaryIdentityId);
    const secondaryIdentityIds = sortedIds(input.secondaryIdentityIds, 1, 15);
    if (secondaryIdentityIds.includes(primaryIdentityId)) invalid();
    return deepFreeze({
      kind: "merge",
      id: syntheticId(input.id),
      digest: digest(input.digest),
      primaryIdentityId,
      secondaryIdentityIds,
      associationIds: sortedIds(input.associationIds, 0, 2_048),
    });
  }
  if (base.kind === "split") {
    const input = exactRecord(value, [
      "kind", "id", "digest", "sourceIdentityId", "newIdentityId",
      "retainedAssociationIds", "movedAssociationIds",
    ]);
    const sourceIdentityId = syntheticId(input.sourceIdentityId);
    const newIdentityId = syntheticId(input.newIdentityId);
    if (sourceIdentityId === newIdentityId) invalid();
    const retainedAssociationIds = sortedIds(input.retainedAssociationIds, 1, 1_024);
    const movedAssociationIds = sortedIds(input.movedAssociationIds, 1, 1_024);
    if (retainedAssociationIds.some((id) => movedAssociationIds.includes(id))) invalid();
    return deepFreeze({
      kind: "split",
      id: syntheticId(input.id),
      digest: digest(input.digest),
      sourceIdentityId,
      newIdentityId,
      retainedAssociationIds,
      movedAssociationIds,
    });
  }
  invalid();
}

function normalizeBindings(value: unknown, sourceIds: readonly string[]) {
  const bindings = denseArray(value, sourceIds.length, sourceIds.length).map((entry) => {
    const input = exactRecord(entry, ["identityId", "identityKind", "subjectRefIds"]);
    return deepFreeze({
      identityId: syntheticId(input.identityId),
      identityKind: enumValue(input.identityKind, ["contact", "organization"] as const),
      subjectRefIds: sortedIds(input.subjectRefIds, 0, 1_024),
    });
  }).sort((left, right) => left.identityId.localeCompare(right.identityId));
  if (!sameStrings(bindings.map((binding) => binding.identityId), sourceIds)) invalid();
  return deepFreeze(bindings);
}

function normalizeSubjects(value: unknown) {
  const subjects = denseArray(value, 1, 2_048).map((entry) => {
    const input = exactRecord(entry, [
      "refId", "tombstoneId", "kind", "channel", "scopeIdentityId", "valueDigest", "effectiveAt",
    ]);
    const kind = enumValue(input.kind, [
      "company", "organization", "contact", "exact_email", "confirmed_email_domain", "exact_phone",
    ] as const);
    const channel = enumValue(input.channel, ["all", "email", "phone"] as const);
    if (expectedChannel(kind) !== channel) invalid();
    return deepFreeze({
      refId: syntheticId(input.refId),
      tombstoneId: syntheticId(input.tombstoneId),
      kind,
      channel,
      scopeIdentityId: syntheticId(input.scopeIdentityId),
      valueDigest: digest(input.valueDigest),
      effectiveAt: timestamp(input.effectiveAt),
    });
  }).sort((left, right) => left.refId.localeCompare(right.refId));
  if (new Set(subjects.map((subject) => subject.refId)).size !== subjects.length) invalid();
  if (new Set(subjects.map((subject) => subject.tombstoneId)).size !== subjects.length) invalid();
  return deepFreeze(subjects);
}

function assertReferenceClosure(
  companyId: string,
  identityBindings: readonly Binding[],
  companySubjectRefIds: readonly string[],
  subjects: readonly Subject[],
) {
  const byRef = new Map(subjects.map((subject) => [subject.refId, subject]));
  const identityRefs = identityBindings.flatMap((binding) => binding.subjectRefIds);
  if (new Set(identityRefs).size !== identityRefs.length) invalid();
  if (identityRefs.some((refId) => !byRef.has(refId))) invalid();
  if (companySubjectRefIds.some((refId) => {
    const subject = byRef.get(refId);
    return subject?.kind !== "company" || subject.scopeIdentityId !== companyId;
  })) invalid();
  if (identityRefs.some((refId) => byRef.get(refId)?.kind === "company")) invalid();
  for (const binding of identityBindings) {
    if (binding.subjectRefIds.some((refId) => byRef.get(refId)?.scopeIdentityId !== binding.identityId)) invalid();
    if (binding.subjectRefIds.some((refId) => {
      const kind = byRef.get(refId)?.kind;
      return (kind === "contact" || kind === "organization") && kind !== binding.identityKind;
    })) invalid();
  }
  const referenced = sortedUniqueStrings([...identityRefs, ...companySubjectRefIds]);
  if (!sameStrings(referenced, subjects.map((subject) => subject.refId))) invalid();
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "identityChangeCurrent", "suppressionIndexAvailable",
    "historicalAliasesRetained", "tombstonesAppendOnly",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    identityChangeCurrent: booleanValue(input.identityChangeCurrent),
    suppressionIndexAvailable: booleanValue(input.suppressionIndexAvailable),
    historicalAliasesRetained: booleanValue(input.historicalAliasesRetained),
    tombstonesAppendOnly: booleanValue(input.tombstonesAppendOnly),
  });
}

function transitionSourceIds(transition: Transition) {
  return transition.kind === "merge"
    ? sortedUniqueStrings([transition.primaryIdentityId, ...transition.secondaryIdentityIds])
    : deepFreeze([transition.sourceIdentityId]);
}

function transitionDestinationIds(transition: Transition) {
  return transition.kind === "merge"
    ? deepFreeze([transition.primaryIdentityId])
    : sortedUniqueStrings([transition.sourceIdentityId, transition.newIdentityId]);
}

function expectedChannel(kind: SuppressionKind): Channel {
  if (kind === "exact_email" || kind === "confirmed_email_domain") return "email";
  if (kind === "exact_phone") return "phone";
  return "all";
}

function dataRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  const output = dataRecord(value);
  if (Object.keys(output).sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
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

function sortedIds(value: unknown, minimum: number, maximum: number) {
  const ids = denseArray(value, minimum, maximum).map(syntheticId).sort();
  if (new Set(ids).size !== ids.length) invalid();
  return deepFreeze(ids);
}

function sortedUniqueStrings(values: readonly string[]) {
  return deepFreeze([...new Set(values)].sort());
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
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
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
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

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
