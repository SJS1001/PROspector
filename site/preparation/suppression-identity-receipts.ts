type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

const RECEIPT_KINDS = [
  "identity_transition",
  "suppression_index",
  "eligibility_invalidation",
  "audit_append",
  "transaction_complete",
] as const;
type ReceiptKind = (typeof RECEIPT_KINDS)[number];

type IntentSnapshot = Readonly<{
  id: string;
  transactionId: string;
  operationId: string;
  operationDigest: string;
  workspaceId: string;
  companyId: string;
  candidateId: string;
  candidateDigest: string;
  transitionId: string;
  transitionDigest: string;
  preservedSubjectRefIds: readonly string[];
  destinationIdentityIds: readonly string[];
  associationIds: readonly string[];
  createdAt: number;
  committedAt: number;
}>;

type ReceiptRecord = Readonly<{
  id: string;
  kind: ReceiptKind;
  sequence: number;
  transactionId: string;
  operationId: string;
  operationDigest: string;
  workspaceId: string;
  companyId: string;
  candidateId: string;
  candidateDigest: string;
  transitionId: string;
  transitionDigest: string;
  materialDigest: string;
  predecessorDigest: string | null;
  committedAt: number;
  digest: string;
}>;

export type SyntheticSuppressionIdentityReceiptIntent = Readonly<{
  kind: "synthetic_suppression_identity_receipt_intent";
  id: string;
  digest: string;
  snapshot: IntentSnapshot;
  receiptPlan: Readonly<{
    records: readonly ReceiptRecord[];
    completionDigest: string;
  }>;
  identityMutationAuthorized: false;
  suppressionMutationAuthorized: false;
  auditPersistenceAuthorized: false;
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

/**
 * Builds a deterministic description of one indivisible synthetic receipt set.
 * It cannot write any record or authorize a caller to do so.
 */
export async function buildSyntheticSuppressionIdentityReceiptIntent(
  value: unknown,
): Promise<SyntheticSuppressionIdentityReceiptIntent> {
  try {
    const snapshot = normalizeIntent(value);
    const records = await buildReceiptPlan(snapshot);
    const receiptPlan = deepFreeze({
      records,
      completionDigest: records[records.length - 1].digest,
    });
    const artifact: SyntheticSuppressionIdentityReceiptIntent = deepFreeze({
      kind: "synthetic_suppression_identity_receipt_intent",
      id: snapshot.id,
      digest: await sha256(JSON.stringify({ snapshot, receiptPlan })),
      snapshot,
      receiptPlan,
      identityMutationAuthorized: false,
      suppressionMutationAuthorized: false,
      auditPersistenceAuthorized: false,
      persistenceAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    intentArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_suppression_identity_receipt_intent_invalid");
  }
}

/**
 * Classifies an empty or exactly complete durable receipt view. Partial,
 * reordered, transplanted, stale, or otherwise ambiguous views always reject.
 */
export async function evaluateSyntheticSuppressionIdentityReceipts(value: unknown) {
  try {
    const input = exactRecord(value, [
      "intentArtifact", "currentIntent", "currentAuthority", "durableState",
    ]);
    if (!intentArtifacts.has(input.intentArtifact as object)) invalid();
    const artifact = input.intentArtifact as SyntheticSuppressionIdentityReceiptIntent;
    const currentIntent = await buildSyntheticSuppressionIdentityReceiptIntent(input.currentIntent);
    const authority = normalizeAuthority(input.currentAuthority);
    const durableRecords = normalizeDurableState(input.durableState);
    const expectedRecords = artifact.receiptPlan.records;
    const reasons: string[] = [];

    if (currentIntent.digest !== artifact.digest) {
      reasons.push("suppression_identity_receipt_intent_changed");
    }
    if (!authority.identityResolutionCurrent) reasons.push("identity_resolution_not_current");
    if (!authority.suppressionUnionCurrent) reasons.push("suppression_union_not_current");
    if (!authority.tombstonesAppendOnly) reasons.push("tombstones_not_append_only");
    if (!authority.auditAvailable) reasons.push("audit_unavailable");
    if (authority.evaluatedAt < artifact.snapshot.createdAt) reasons.push("evaluation_precedes_intent");
    if (durableRecords.length > 0 && authority.evaluatedAt < artifact.snapshot.committedAt) {
      reasons.push("evaluation_precedes_commit");
    }

    if (durableRecords.length !== 0 && durableRecords.length !== expectedRecords.length) {
      reasons.push("partial_atomic_receipt_set");
    } else if (durableRecords.length === expectedRecords.length) {
      await compareCompleteReceiptSet(durableRecords, expectedRecords, reasons);
    }

    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    const exactDurableSet = durableRecords.length === expectedRecords.length && reasonCodes.length === 0;
    const status = reasonCodes.length > 0
      ? "synthetic_suppression_identity_receipts_rejected" as const
      : exactDurableSet
        ? "synthetic_suppression_identity_atomic_commit_already_durable_no_authority" as const
        : "synthetic_suppression_identity_atomic_commit_required_no_authority" as const;

    return deepFreeze({
      kind: "synthetic_suppression_identity_receipt_decision" as const,
      status,
      intentId: artifact.id,
      intentDigest: artifact.digest,
      transactionId: artifact.snapshot.transactionId,
      operationId: artifact.snapshot.operationId,
      operationDigest: artifact.snapshot.operationDigest,
      candidateId: artifact.snapshot.candidateId,
      candidateDigest: artifact.snapshot.candidateDigest,
      completionDigest: artifact.receiptPlan.completionDigest,
      requiredAtomicRecordKinds: status === "synthetic_suppression_identity_atomic_commit_required_no_authority"
        ? deepFreeze([...RECEIPT_KINDS])
        : deepFreeze([] as ReceiptKind[]),
      durableReceiptDigests: exactDurableSet
        ? deepFreeze(durableRecords.map((record) => record.digest))
        : deepFreeze([] as string[]),
      reasonCodes,
      identityMutationAuthorized: false as const,
      suppressionMutationAuthorized: false as const,
      auditPersistenceAuthorized: false as const,
      persistenceAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_suppression_identity_receipts_invalid");
  }
}

async function buildReceiptPlan(snapshot: IntentSnapshot): Promise<readonly ReceiptRecord[]> {
  const indexMaterial = await sha256(JSON.stringify({
    candidateDigest: snapshot.candidateDigest,
    preservedSubjectRefIds: snapshot.preservedSubjectRefIds,
    destinationIdentityIds: snapshot.destinationIdentityIds,
  }));
  const invalidationMaterial = await sha256(JSON.stringify({
    candidateDigest: snapshot.candidateDigest,
    associationIds: snapshot.associationIds,
  }));
  const auditMaterial = await sha256(JSON.stringify({
    operationDigest: snapshot.operationDigest,
    candidateDigest: snapshot.candidateDigest,
    transitionDigest: snapshot.transitionDigest,
  }));
  const initialMaterials = [
    snapshot.transitionDigest,
    indexMaterial,
    invalidationMaterial,
    auditMaterial,
  ];
  const records: ReceiptRecord[] = [];
  for (let index = 0; index < initialMaterials.length; index += 1) {
    records.push(await buildReceipt(
      snapshot,
      RECEIPT_KINDS[index],
      index + 1,
      initialMaterials[index],
      records.at(-1)?.digest ?? null,
    ));
  }
  const completionMaterial = await sha256(JSON.stringify(records.map((record) => record.digest)));
  records.push(await buildReceipt(
    snapshot,
    "transaction_complete",
    5,
    completionMaterial,
    records[3].digest,
  ));
  return deepFreeze(records);
}

async function buildReceipt(
  snapshot: IntentSnapshot,
  kind: ReceiptKind,
  sequence: number,
  materialDigest: string,
  predecessorDigest: string | null,
): Promise<ReceiptRecord> {
  const idDigest = await sha256(JSON.stringify({
    transactionId: snapshot.transactionId,
    kind,
    sequence,
  }));
  const unsigned = {
    id: `synthetic-receipt-${idDigest.slice(0, 40)}`,
    kind,
    sequence,
    transactionId: snapshot.transactionId,
    operationId: snapshot.operationId,
    operationDigest: snapshot.operationDigest,
    workspaceId: snapshot.workspaceId,
    companyId: snapshot.companyId,
    candidateId: snapshot.candidateId,
    candidateDigest: snapshot.candidateDigest,
    transitionId: snapshot.transitionId,
    transitionDigest: snapshot.transitionDigest,
    materialDigest,
    predecessorDigest,
    committedAt: snapshot.committedAt,
  };
  return deepFreeze({ ...unsigned, digest: await sha256(JSON.stringify(unsigned)) });
}

async function compareCompleteReceiptSet(
  actual: readonly ReceiptRecord[],
  expected: readonly ReceiptRecord[],
  reasons: string[],
) {
  for (let index = 0; index < expected.length; index += 1) {
    const record = actual[index];
    const planned = expected[index];
    if (record.kind !== planned.kind || record.sequence !== planned.sequence || record.id !== planned.id) {
      reasons.push("receipt_order_invalid");
    }
    if (record.transactionId !== planned.transactionId) reasons.push("receipt_transaction_mismatch");
    if (
      record.operationId !== planned.operationId
      || record.operationDigest !== planned.operationDigest
      || record.workspaceId !== planned.workspaceId
      || record.companyId !== planned.companyId
      || record.candidateId !== planned.candidateId
      || record.candidateDigest !== planned.candidateDigest
      || record.transitionId !== planned.transitionId
      || record.transitionDigest !== planned.transitionDigest
      || record.materialDigest !== planned.materialDigest
    ) {
      reasons.push("receipt_binding_mismatch");
    }
    if (record.committedAt !== planned.committedAt) reasons.push("receipt_time_invalid");
    const expectedPredecessor = index === 0 ? null : actual[index - 1].digest;
    if (record.predecessorDigest !== expectedPredecessor
      || record.predecessorDigest !== planned.predecessorDigest) {
      reasons.push("receipt_chain_invalid");
    }
    if (record.digest !== await digestReceipt(record)) reasons.push("receipt_digest_invalid");
  }
}

async function digestReceipt(record: ReceiptRecord) {
  const unsigned = {
    id: record.id,
    kind: record.kind,
    sequence: record.sequence,
    transactionId: record.transactionId,
    operationId: record.operationId,
    operationDigest: record.operationDigest,
    workspaceId: record.workspaceId,
    companyId: record.companyId,
    candidateId: record.candidateId,
    candidateDigest: record.candidateDigest,
    transitionId: record.transitionId,
    transitionDigest: record.transitionDigest,
    materialDigest: record.materialDigest,
    predecessorDigest: record.predecessorDigest,
    committedAt: record.committedAt,
  };
  return sha256(JSON.stringify(unsigned));
}

function normalizeIntent(value: unknown): IntentSnapshot {
  const input = exactRecord(value, [
    "id", "transactionId", "operationId", "operationDigest", "workspaceId", "companyId",
    "candidateId", "candidateDigest", "transitionId", "transitionDigest",
    "preservedSubjectRefIds", "destinationIdentityIds", "associationIds", "createdAt", "committedAt",
  ]);
  const createdAt = timestamp(input.createdAt);
  const committedAt = timestamp(input.committedAt);
  if (committedAt <= createdAt) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    transactionId: syntheticId(input.transactionId),
    operationId: syntheticId(input.operationId),
    operationDigest: digest(input.operationDigest),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    candidateId: syntheticId(input.candidateId),
    candidateDigest: digest(input.candidateDigest),
    transitionId: syntheticId(input.transitionId),
    transitionDigest: digest(input.transitionDigest),
    preservedSubjectRefIds: sortedIds(input.preservedSubjectRefIds, 1, 2_048),
    destinationIdentityIds: sortedIds(input.destinationIdentityIds, 1, 2_048),
    associationIds: sortedIds(input.associationIds, 1, 2_048),
    createdAt,
    committedAt,
  });
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "identityResolutionCurrent", "suppressionUnionCurrent",
    "tombstonesAppendOnly", "auditAvailable",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    identityResolutionCurrent: booleanValue(input.identityResolutionCurrent),
    suppressionUnionCurrent: booleanValue(input.suppressionUnionCurrent),
    tombstonesAppendOnly: booleanValue(input.tombstonesAppendOnly),
    auditAvailable: booleanValue(input.auditAvailable),
  });
}

function normalizeDurableState(value: unknown): readonly ReceiptRecord[] {
  const state = exactRecord(value, ["records"]);
  return deepFreeze(denseArray(state.records, 0, 6).map(normalizeReceiptRecord));
}

function normalizeReceiptRecord(value: unknown): ReceiptRecord {
  const input = exactRecord(value, [
    "id", "kind", "sequence", "transactionId", "operationId", "operationDigest",
    "workspaceId", "companyId", "candidateId", "candidateDigest", "transitionId",
    "transitionDigest", "materialDigest", "predecessorDigest", "committedAt", "digest",
  ]);
  const predecessorDigest = input.predecessorDigest === null ? null : digest(input.predecessorDigest);
  return deepFreeze({
    id: syntheticId(input.id),
    kind: enumValue(input.kind, RECEIPT_KINDS),
    sequence: sequence(input.sequence),
    transactionId: syntheticId(input.transactionId),
    operationId: syntheticId(input.operationId),
    operationDigest: digest(input.operationDigest),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    candidateId: syntheticId(input.candidateId),
    candidateDigest: digest(input.candidateDigest),
    transitionId: syntheticId(input.transitionId),
    transitionDigest: digest(input.transitionDigest),
    materialDigest: digest(input.materialDigest),
    predecessorDigest,
    committedAt: timestamp(input.committedAt),
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

function sequence(value: unknown) {
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
