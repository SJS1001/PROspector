type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

const BOUNDARY_KINDS = ["delete", "import", "export", "archive", "restore"] as const;
type BoundaryKind = (typeof BOUNDARY_KINDS)[number];

type IntentSnapshot = Readonly<{
  id: string;
  lineageId: string;
  operationId: string;
  operationDigest: string;
  workspaceId: string;
  companyId: string;
  sourceSnapshotId: string;
  sourceSnapshotDigest: string;
  sourceSubjectRefIds: readonly string[];
  sourceAliasIds: readonly string[];
  sourceDeletionTombstoneIds: readonly string[];
  deletionEventId: string;
  deletionEventDigest: string;
  resultingDeletionTombstoneId: string;
  importBundleId: string;
  importBundleDigest: string;
  importedSubjectRefIds: readonly string[];
  importedAliasIds: readonly string[];
  importedDeletionTombstoneIds: readonly string[];
  exportManifestId: string;
  archiveManifestId: string;
  restoreOperationId: string;
  createdAt: number;
  completedAt: number;
}>;

type BoundaryRecord = Readonly<{
  id: string;
  kind: BoundaryKind;
  sequence: number;
  lineageId: string;
  operationId: string;
  operationDigest: string;
  workspaceId: string;
  companyId: string;
  sourceSnapshotId: string;
  sourceSnapshotDigest: string;
  retainedSubjectRefIds: readonly string[];
  retainedAliasIds: readonly string[];
  retainedDeletionTombstoneIds: readonly string[];
  suppressionManifestSubjectRefIds: readonly string[];
  materialDigest: string;
  predecessorDigest: string | null;
  recordedAt: number;
  digest: string;
}>;

export type SyntheticSuppressionRetentionManifestIntent = Readonly<{
  kind: "synthetic_suppression_retention_manifest_intent";
  id: string;
  digest: string;
  snapshot: IntentSnapshot;
  boundaryPlan: Readonly<{
    records: readonly BoundaryRecord[];
    completionDigest: string;
  }>;
  deletionAuthorized: false;
  importAuthorized: false;
  exportAuthorized: false;
  archiveAuthorized: false;
  restoreAuthorized: false;
  persistenceAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const intentArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/** Canonicalizes only synthetic retention references; it performs no boundary action. */
export async function buildSyntheticSuppressionRetentionManifestIntent(
  value: unknown,
): Promise<SyntheticSuppressionRetentionManifestIntent> {
  try {
    const snapshot = normalizeIntent(value);
    const records = await buildBoundaryPlan(snapshot);
    const boundaryPlan = deepFreeze({
      records,
      completionDigest: records[records.length - 1].digest,
    });
    const artifact: SyntheticSuppressionRetentionManifestIntent = deepFreeze({
      kind: "synthetic_suppression_retention_manifest_intent",
      id: snapshot.id,
      digest: await sha256(JSON.stringify({ snapshot, boundaryPlan })),
      snapshot,
      boundaryPlan,
      deletionAuthorized: false,
      importAuthorized: false,
      exportAuthorized: false,
      archiveAuthorized: false,
      restoreAuthorized: false,
      persistenceAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    intentArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_suppression_retention_manifest_intent_invalid");
  }
}

/**
 * Classifies an empty or exactly complete synthetic retention lineage. It
 * cannot delete, import, export, archive, restore, persist, or release data.
 */
export async function evaluateSyntheticSuppressionRetentionManifest(value: unknown) {
  try {
    const input = exactRecord(value, [
      "intentArtifact", "currentIntent", "currentAuthority", "observedState",
    ]);
    if (!intentArtifacts.has(input.intentArtifact as object)) invalid();
    const artifact = input.intentArtifact as SyntheticSuppressionRetentionManifestIntent;
    const currentIntent = await buildSyntheticSuppressionRetentionManifestIntent(input.currentIntent);
    const authority = normalizeAuthority(input.currentAuthority);
    const observedRecords = normalizeObservedState(input.observedState);
    const expectedRecords = artifact.boundaryPlan.records;
    const reasons: string[] = [];

    if (currentIntent.digest !== artifact.digest) reasons.push("suppression_retention_intent_changed");
    if (!authority.sourceCurrent) reasons.push("retention_source_not_current");
    if (!authority.deletionAppendOnly) reasons.push("deletion_not_append_only");
    if (!authority.importUnionOnly) reasons.push("import_not_union_only");
    if (!authority.exportSuppressionExcluded) reasons.push("export_suppression_exclusion_unproven");
    if (!authority.archiveComplete) reasons.push("archive_incomplete");
    if (!authority.restoreEffectsDisabled) reasons.push("restore_effects_not_disabled");
    if (authority.evaluatedAt < artifact.snapshot.createdAt) {
      reasons.push("evaluation_precedes_retention_intent");
    }
    if (observedRecords.length > 0 && authority.evaluatedAt < artifact.snapshot.completedAt) {
      reasons.push("evaluation_precedes_retention_completion");
    }

    if (observedRecords.length !== 0 && observedRecords.length !== expectedRecords.length) {
      reasons.push("partial_retention_boundary_set");
    } else if (observedRecords.length === expectedRecords.length) {
      await compareCompleteBoundarySet(observedRecords, expectedRecords, reasons);
    }

    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    const exactObserved = observedRecords.length === expectedRecords.length && reasonCodes.length === 0;
    const status = reasonCodes.length > 0
      ? "synthetic_suppression_retention_manifest_rejected" as const
      : exactObserved
        ? "synthetic_suppression_retention_manifest_verified_no_authority" as const
        : "synthetic_suppression_retention_manifest_required_no_authority" as const;

    return deepFreeze({
      kind: "synthetic_suppression_retention_manifest_decision" as const,
      status,
      intentId: artifact.id,
      intentDigest: artifact.digest,
      lineageId: artifact.snapshot.lineageId,
      operationId: artifact.snapshot.operationId,
      operationDigest: artifact.snapshot.operationDigest,
      workspaceId: artifact.snapshot.workspaceId,
      companyId: artifact.snapshot.companyId,
      completionDigest: artifact.boundaryPlan.completionDigest,
      requiredBoundaryKinds: status === "synthetic_suppression_retention_manifest_required_no_authority"
        ? deepFreeze([...BOUNDARY_KINDS])
        : deepFreeze([] as BoundaryKind[]),
      observedBoundaryDigests: exactObserved
        ? deepFreeze(observedRecords.map((record) => record.digest))
        : deepFreeze([] as string[]),
      reasonCodes,
      contactableExportAuthorized: false as const,
      restoreReleaseAuthorized: false as const,
      deletionAuthorized: false as const,
      importAuthorized: false as const,
      exportAuthorized: false as const,
      archiveAuthorized: false as const,
      restoreAuthorized: false as const,
      persistenceAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_suppression_retention_manifest_invalid");
  }
}

async function buildBoundaryPlan(snapshot: IntentSnapshot): Promise<readonly BoundaryRecord[]> {
  const deletionSubjectRefs = snapshot.sourceSubjectRefIds;
  const deletionAliasIds = snapshot.sourceAliasIds;
  const deletionTombstones = sortedUnique([
    ...snapshot.sourceDeletionTombstoneIds,
    snapshot.resultingDeletionTombstoneId,
  ]);
  const unionSubjectRefs = sortedUnique([
    ...snapshot.sourceSubjectRefIds,
    ...snapshot.importedSubjectRefIds,
  ]);
  const unionAliasIds = sortedUnique([
    ...snapshot.sourceAliasIds,
    ...snapshot.importedAliasIds,
  ]);
  const unionDeletionTombstones = sortedUnique([
    ...deletionTombstones,
    ...snapshot.importedDeletionTombstoneIds,
  ]);
  const deletionMaterial = await sha256(JSON.stringify({
    eventId: snapshot.deletionEventId,
    eventDigest: snapshot.deletionEventDigest,
    resultingDeletionTombstoneId: snapshot.resultingDeletionTombstoneId,
  }));
  const importMaterial = await sha256(JSON.stringify({
    bundleId: snapshot.importBundleId,
    bundleDigest: snapshot.importBundleDigest,
    subjectRefIds: snapshot.importedSubjectRefIds,
    aliasIds: snapshot.importedAliasIds,
    deletionTombstoneIds: snapshot.importedDeletionTombstoneIds,
  }));
  const exportMaterial = await sha256(JSON.stringify({
    manifestId: snapshot.exportManifestId,
    subjectRefIds: unionSubjectRefs,
  }));
  const archiveMaterial = await sha256(JSON.stringify({
    manifestId: snapshot.archiveManifestId,
    subjectRefIds: unionSubjectRefs,
    aliasIds: unionAliasIds,
    deletionTombstoneIds: unionDeletionTombstones,
  }));

  const records: BoundaryRecord[] = [];
  records.push(await buildBoundaryRecord(
    snapshot, "delete", 1, deletionSubjectRefs, deletionAliasIds,
    deletionTombstones, [], deletionMaterial, null,
  ));
  records.push(await buildBoundaryRecord(
    snapshot, "import", 2, unionSubjectRefs, unionAliasIds,
    unionDeletionTombstones, [], importMaterial, records[0].digest,
  ));
  records.push(await buildBoundaryRecord(
    snapshot, "export", 3, unionSubjectRefs, unionAliasIds,
    unionDeletionTombstones, unionSubjectRefs, exportMaterial, records[1].digest,
  ));
  records.push(await buildBoundaryRecord(
    snapshot, "archive", 4, unionSubjectRefs, unionAliasIds,
    unionDeletionTombstones, unionSubjectRefs, archiveMaterial, records[2].digest,
  ));
  const restoreMaterial = await sha256(JSON.stringify({
    restoreOperationId: snapshot.restoreOperationId,
    archiveManifestId: snapshot.archiveManifestId,
    archiveBoundaryDigest: records[3].digest,
  }));
  records.push(await buildBoundaryRecord(
    snapshot, "restore", 5, unionSubjectRefs, unionAliasIds,
    unionDeletionTombstones, unionSubjectRefs, restoreMaterial, records[3].digest,
  ));
  return deepFreeze(records);
}

async function buildBoundaryRecord(
  snapshot: IntentSnapshot,
  kind: BoundaryKind,
  sequence: number,
  retainedSubjectRefIds: readonly string[],
  retainedAliasIds: readonly string[],
  retainedDeletionTombstoneIds: readonly string[],
  suppressionManifestSubjectRefIds: readonly string[],
  materialDigest: string,
  predecessorDigest: string | null,
): Promise<BoundaryRecord> {
  const idDigest = await sha256(JSON.stringify({ lineageId: snapshot.lineageId, kind, sequence }));
  const unsigned = {
    id: `synthetic-retention-${idDigest.slice(0, 40)}`,
    kind,
    sequence,
    lineageId: snapshot.lineageId,
    operationId: snapshot.operationId,
    operationDigest: snapshot.operationDigest,
    workspaceId: snapshot.workspaceId,
    companyId: snapshot.companyId,
    sourceSnapshotId: snapshot.sourceSnapshotId,
    sourceSnapshotDigest: snapshot.sourceSnapshotDigest,
    retainedSubjectRefIds,
    retainedAliasIds,
    retainedDeletionTombstoneIds,
    suppressionManifestSubjectRefIds,
    materialDigest,
    predecessorDigest,
    recordedAt: snapshot.createdAt + sequence,
  };
  return deepFreeze({ ...unsigned, digest: await sha256(JSON.stringify(unsigned)) });
}

async function compareCompleteBoundarySet(
  actual: readonly BoundaryRecord[],
  expected: readonly BoundaryRecord[],
  reasons: string[],
) {
  for (let index = 0; index < expected.length; index += 1) {
    const record = actual[index];
    const planned = expected[index];
    if (record.id !== planned.id || record.kind !== planned.kind || record.sequence !== planned.sequence) {
      reasons.push("retention_boundary_order_invalid");
    }
    if (record.lineageId !== planned.lineageId) reasons.push("retention_lineage_mismatch");
    if (record.workspaceId !== planned.workspaceId || record.companyId !== planned.companyId) {
      reasons.push("retention_scope_mismatch");
    }
    if (
      record.operationId !== planned.operationId
      || record.operationDigest !== planned.operationDigest
      || record.sourceSnapshotId !== planned.sourceSnapshotId
      || record.sourceSnapshotDigest !== planned.sourceSnapshotDigest
      || record.materialDigest !== planned.materialDigest
    ) reasons.push("retention_binding_mismatch");

    compareRetentionSet(record.retainedSubjectRefIds, planned.retainedSubjectRefIds, reasons);
    compareRetentionSet(record.retainedAliasIds, planned.retainedAliasIds, reasons);
    compareRetentionSet(record.retainedDeletionTombstoneIds, planned.retainedDeletionTombstoneIds, reasons);
    compareSuppressionManifest(
      record.suppressionManifestSubjectRefIds,
      planned.suppressionManifestSubjectRefIds,
      reasons,
    );

    if (record.recordedAt !== planned.recordedAt) reasons.push("retention_boundary_time_invalid");
    const expectedPredecessor = index === 0 ? null : actual[index - 1].digest;
    if (record.predecessorDigest !== expectedPredecessor
      || record.predecessorDigest !== planned.predecessorDigest) {
      reasons.push("retention_boundary_chain_invalid");
    }
    if (record.digest !== await digestBoundaryRecord(record)) {
      reasons.push("retention_boundary_digest_invalid");
    }
  }
}

function compareRetentionSet(actual: readonly string[], expected: readonly string[], reasons: string[]) {
  if (sameStrings(actual, expected)) return;
  reasons.push("retention_manifest_mismatch");
  if (expected.some((entry) => !actual.includes(entry))) reasons.push("retention_gap");
  if (actual.some((entry) => !expected.includes(entry))) reasons.push("unbound_retention_material");
}

function compareSuppressionManifest(
  actual: readonly string[],
  expected: readonly string[],
  reasons: string[],
) {
  if (sameStrings(actual, expected)) return;
  reasons.push("suppression_manifest_mismatch");
  if (expected.some((entry) => !actual.includes(entry))) reasons.push("suppression_manifest_gap");
  if (actual.some((entry) => !expected.includes(entry))) reasons.push("unbound_suppression_manifest_material");
}

async function digestBoundaryRecord(record: BoundaryRecord) {
  const unsigned = {
    id: record.id,
    kind: record.kind,
    sequence: record.sequence,
    lineageId: record.lineageId,
    operationId: record.operationId,
    operationDigest: record.operationDigest,
    workspaceId: record.workspaceId,
    companyId: record.companyId,
    sourceSnapshotId: record.sourceSnapshotId,
    sourceSnapshotDigest: record.sourceSnapshotDigest,
    retainedSubjectRefIds: record.retainedSubjectRefIds,
    retainedAliasIds: record.retainedAliasIds,
    retainedDeletionTombstoneIds: record.retainedDeletionTombstoneIds,
    suppressionManifestSubjectRefIds: record.suppressionManifestSubjectRefIds,
    materialDigest: record.materialDigest,
    predecessorDigest: record.predecessorDigest,
    recordedAt: record.recordedAt,
  };
  return sha256(JSON.stringify(unsigned));
}

function normalizeIntent(value: unknown): IntentSnapshot {
  const input = exactRecord(value, [
    "id", "lineageId", "operationId", "operationDigest", "workspaceId", "companyId",
    "sourceSnapshotId", "sourceSnapshotDigest", "sourceSubjectRefIds", "sourceAliasIds",
    "sourceDeletionTombstoneIds", "deletionEventId", "deletionEventDigest",
    "resultingDeletionTombstoneId", "importBundleId", "importBundleDigest",
    "importedSubjectRefIds", "importedAliasIds", "importedDeletionTombstoneIds",
    "exportManifestId", "archiveManifestId", "restoreOperationId", "createdAt", "completedAt",
  ]);
  const sourceSubjectRefIds = sortedIds(input.sourceSubjectRefIds, 1, 2_048);
  const sourceAliasIds = sortedIds(input.sourceAliasIds, 1, 2_048);
  const sourceDeletionTombstoneIds = sortedIds(input.sourceDeletionTombstoneIds, 0, 2_048);
  const importedSubjectRefIds = sortedIds(input.importedSubjectRefIds, 1, 2_048);
  const importedAliasIds = sortedIds(input.importedAliasIds, 1, 2_048);
  const importedDeletionTombstoneIds = sortedIds(input.importedDeletionTombstoneIds, 1, 2_048);
  assertDisjoint(sourceSubjectRefIds, importedSubjectRefIds);
  assertDisjoint(sourceAliasIds, importedAliasIds);
  assertDisjoint(sourceDeletionTombstoneIds, importedDeletionTombstoneIds);
  const resultingDeletionTombstoneId = syntheticId(input.resultingDeletionTombstoneId);
  if (sourceDeletionTombstoneIds.includes(resultingDeletionTombstoneId)
    || importedDeletionTombstoneIds.includes(resultingDeletionTombstoneId)) invalid();
  const createdAt = timestamp(input.createdAt);
  const completedAt = timestamp(input.completedAt);
  if (createdAt > Number.MAX_SAFE_INTEGER - 5 || completedAt < createdAt + 5) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    lineageId: syntheticId(input.lineageId),
    operationId: syntheticId(input.operationId),
    operationDigest: digest(input.operationDigest),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    sourceSnapshotId: syntheticId(input.sourceSnapshotId),
    sourceSnapshotDigest: digest(input.sourceSnapshotDigest),
    sourceSubjectRefIds,
    sourceAliasIds,
    sourceDeletionTombstoneIds,
    deletionEventId: syntheticId(input.deletionEventId),
    deletionEventDigest: digest(input.deletionEventDigest),
    resultingDeletionTombstoneId,
    importBundleId: syntheticId(input.importBundleId),
    importBundleDigest: digest(input.importBundleDigest),
    importedSubjectRefIds,
    importedAliasIds,
    importedDeletionTombstoneIds,
    exportManifestId: syntheticId(input.exportManifestId),
    archiveManifestId: syntheticId(input.archiveManifestId),
    restoreOperationId: syntheticId(input.restoreOperationId),
    createdAt,
    completedAt,
  });
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "sourceCurrent", "deletionAppendOnly", "importUnionOnly",
    "exportSuppressionExcluded", "archiveComplete", "restoreEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    sourceCurrent: booleanValue(input.sourceCurrent),
    deletionAppendOnly: booleanValue(input.deletionAppendOnly),
    importUnionOnly: booleanValue(input.importUnionOnly),
    exportSuppressionExcluded: booleanValue(input.exportSuppressionExcluded),
    archiveComplete: booleanValue(input.archiveComplete),
    restoreEffectsDisabled: booleanValue(input.restoreEffectsDisabled),
  });
}

function normalizeObservedState(value: unknown): readonly BoundaryRecord[] {
  const state = exactRecord(value, ["records"]);
  return deepFreeze(denseArray(state.records, 0, 6).map(normalizeBoundaryRecord));
}

function normalizeBoundaryRecord(value: unknown): BoundaryRecord {
  const input = exactRecord(value, [
    "id", "kind", "sequence", "lineageId", "operationId", "operationDigest",
    "workspaceId", "companyId", "sourceSnapshotId", "sourceSnapshotDigest",
    "retainedSubjectRefIds", "retainedAliasIds", "retainedDeletionTombstoneIds",
    "suppressionManifestSubjectRefIds", "materialDigest", "predecessorDigest",
    "recordedAt", "digest",
  ]);
  return deepFreeze({
    id: syntheticId(input.id),
    kind: enumValue(input.kind, BOUNDARY_KINDS),
    sequence: boundarySequence(input.sequence),
    lineageId: syntheticId(input.lineageId),
    operationId: syntheticId(input.operationId),
    operationDigest: digest(input.operationDigest),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    sourceSnapshotId: syntheticId(input.sourceSnapshotId),
    sourceSnapshotDigest: digest(input.sourceSnapshotDigest),
    retainedSubjectRefIds: sortedIds(input.retainedSubjectRefIds, 1, 4_096),
    retainedAliasIds: sortedIds(input.retainedAliasIds, 1, 4_096),
    retainedDeletionTombstoneIds: sortedIds(input.retainedDeletionTombstoneIds, 1, 4_096),
    suppressionManifestSubjectRefIds: sortedIds(input.suppressionManifestSubjectRefIds, 0, 4_096),
    materialDigest: digest(input.materialDigest),
    predecessorDigest: input.predecessorDigest === null ? null : digest(input.predecessorDigest),
    recordedAt: timestamp(input.recordedAt),
    digest: digest(input.digest),
  });
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

function sortedUnique(values: readonly string[]) {
  return deepFreeze([...new Set(values)].sort());
}

function assertDisjoint(left: readonly string[], right: readonly string[]) {
  if (left.some((entry) => right.includes(entry))) invalid();
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

function boundarySequence(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 5) invalid();
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
