type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

const NODE_KINDS = [
  "package_artifact",
  "message_artifact",
  "approval_suppression",
  "dispatch_recheck",
  "originated_stop",
  "delivery_unknown",
  "suppression_before_success",
  "manual_call",
  "audit_append",
  "identity_resolution",
  "identity_receipts",
  "suppression_retention",
] as const;
type NodeKind = (typeof NODE_KINDS)[number];

const STATUS_BY_KIND: Readonly<Record<NodeKind, string>> = Object.freeze({
  package_artifact: "synthetic_outreach_package_artifact",
  message_artifact: "synthetic_outreach_message_artifact",
  approval_suppression: "synthetic_outreach_preparation_projection",
  dispatch_recheck: "synthetic_recheck_passed_no_authority",
  originated_stop: "synthetic_stop_classified_no_authority",
  delivery_unknown: "synthetic_reconciliation_classified_no_authority",
  suppression_before_success: "synthetic_suppression_commit_required_no_authority",
  manual_call: "synthetic_manual_call_outcome_commit_required_no_authority",
  audit_append: "synthetic_audit_append_required_no_authority",
  identity_resolution: "synthetic_suppression_identity_resolution_projected_no_authority",
  identity_receipts: "synthetic_suppression_identity_atomic_commit_required_no_authority",
  suppression_retention: "synthetic_suppression_retention_manifest_required_no_authority",
});

type InvariantNode = Readonly<{
  kind: NodeKind;
  id: string;
  digest: string;
  subjectId: string;
  subjectDigest: string;
  status: string;
  dependencyDigests: readonly string[];
}>;

type BundleSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  prospectId: string;
  contactId: string;
  nodes: readonly InvariantNode[];
  createdAt: number;
  completedAt: number;
}>;

type InvariantGraph = Readonly<{
  roots: readonly string[];
  terminalDigests: readonly string[];
  branches: Readonly<{
    emailDispatch: readonly string[];
    stopAndSuppression: readonly string[];
    manualCall: readonly string[];
    identityAndRetention: readonly string[];
  }>;
  simultaneousOccurrenceClaimed: false;
  runtimeReachable: false;
}>;

export type SyntheticOutreachInvariantBundle = Readonly<{
  kind: "synthetic_outreach_invariant_bundle";
  id: string;
  digest: string;
  snapshot: BundleSnapshot;
  graph: InvariantGraph;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
  persistenceAuthorized: false;
  exportAuthorized: false;
  archiveAuthorized: false;
  restoreAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

type CurrentAuthority = Readonly<{
  evaluatedAt: number;
  scopeCurrent: boolean;
  artifactsCurrent: boolean;
  approvalsCurrent: boolean;
  dispatchCurrent: boolean;
  stopStateCurrent: boolean;
  deliveryStateCurrent: boolean;
  suppressionStateCurrent: boolean;
  manualCallStateCurrent: boolean;
  auditStateCurrent: boolean;
  identityStateCurrent: boolean;
  receiptStateCurrent: boolean;
  retentionStateCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const artifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Canonicalizes one compatibility graph over already-modeled synthetic
 * preparation references. It does not claim that any branch occurred and it
 * cannot execute, persist, export, restore, or invoke an effect.
 */
export async function buildSyntheticOutreachInvariantBundle(
  value: unknown,
): Promise<SyntheticOutreachInvariantBundle> {
  try {
    const snapshot = normalizeBundle(value);
    const graph = buildGraph(snapshot.nodes);
    const artifact: SyntheticOutreachInvariantBundle = deepFreeze({
      kind: "synthetic_outreach_invariant_bundle",
      id: snapshot.id,
      digest: await sha256(JSON.stringify({ snapshot, graph })),
      snapshot,
      graph,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      persistenceAuthorized: false,
      exportAuthorized: false,
      archiveAuthorized: false,
      restoreAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    artifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_outreach_invariant_bundle_invalid");
  }
}

/**
 * Rechecks only whether the closed synthetic compatibility graph is current.
 * A successful projection remains explicitly non-authoritative and zero-effect.
 */
export async function evaluateSyntheticOutreachInvariantBundle(value: unknown) {
  try {
    const input = exactRecord(value, ["bundleArtifact", "currentBundle", "currentAuthority"]);
    if (!artifacts.has(input.bundleArtifact as object)) invalid();
    const artifact = input.bundleArtifact as SyntheticOutreachInvariantBundle;
    const current = await buildSyntheticOutreachInvariantBundle(input.currentBundle);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("invariant_bundle_changed");
    if (!authority.scopeCurrent) reasons.push("invariant_scope_not_current");
    if (!authority.artifactsCurrent) reasons.push("invariant_artifacts_not_current");
    if (!authority.approvalsCurrent) reasons.push("invariant_approvals_not_current");
    if (!authority.dispatchCurrent) reasons.push("invariant_dispatch_not_current");
    if (!authority.stopStateCurrent) reasons.push("invariant_stop_state_not_current");
    if (!authority.deliveryStateCurrent) reasons.push("invariant_delivery_state_not_current");
    if (!authority.suppressionStateCurrent) reasons.push("invariant_suppression_state_not_current");
    if (!authority.manualCallStateCurrent) reasons.push("invariant_manual_call_state_not_current");
    if (!authority.auditStateCurrent) reasons.push("invariant_audit_state_not_current");
    if (!authority.identityStateCurrent) reasons.push("invariant_identity_state_not_current");
    if (!authority.receiptStateCurrent) reasons.push("invariant_receipt_state_not_current");
    if (!authority.retentionStateCurrent) reasons.push("invariant_retention_state_not_current");
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");
    if (authority.evaluatedAt < artifact.snapshot.completedAt) {
      reasons.push("evaluation_precedes_invariant_completion");
    }

    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    return deepFreeze({
      kind: "synthetic_outreach_invariant_bundle_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_outreach_invariants_current_no_authority" as const
        : "synthetic_outreach_invariants_rejected" as const,
      bundleId: artifact.id,
      bundleDigest: artifact.digest,
      workspaceId: artifact.snapshot.workspaceId,
      companyId: artifact.snapshot.companyId,
      nodeDigests: deepFreeze(artifact.snapshot.nodes.map((node) => node.digest)),
      terminalDigests: artifact.graph.terminalDigests,
      simultaneousOccurrenceClaimed: false as const,
      reasonCodes,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
      persistenceAuthorized: false as const,
      exportAuthorized: false as const,
      archiveAuthorized: false as const,
      restoreAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_outreach_invariant_bundle_invalid");
  }
}

function normalizeBundle(value: unknown): BundleSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "profileConfigurationId",
    "profileConfigurationDigest", "prospectId", "contactId", "nodes",
    "createdAt", "completedAt",
  ]);
  const nodes = normalizeNodes(input.nodes);
  const createdAt = timestamp(input.createdAt);
  const completedAt = timestamp(input.completedAt);
  if (completedAt < createdAt) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    nodes,
    createdAt,
    completedAt,
  });
}

function normalizeNodes(value: unknown) {
  const nodes = denseArray(value, NODE_KINDS.length, NODE_KINDS.length)
    .map((entry) => normalizeNode(entry))
    .sort((left, right) => NODE_KINDS.indexOf(left.kind) - NODE_KINDS.indexOf(right.kind));
  if (nodes.some((node, index) => node.kind !== NODE_KINDS[index])) invalid();
  assertUnique(nodes.map((node) => node.id));
  assertUnique(nodes.map((node) => node.digest));

  const byKind = Object.fromEntries(nodes.map((node) => [node.kind, node])) as Record<NodeKind, InvariantNode>;
  const expected = expectedDependencies(byKind);
  for (const node of nodes) {
    if (!sameStrings(node.dependencyDigests, expected[node.kind])) invalid();
  }
  return deepFreeze(nodes);
}

function normalizeNode(value: unknown): InvariantNode {
  const input = exactRecord(value, [
    "kind", "id", "digest", "subjectId", "subjectDigest", "status", "dependencyDigests",
  ]);
  const kind = enumValue(input.kind, NODE_KINDS);
  if (input.status !== STATUS_BY_KIND[kind]) invalid();
  return deepFreeze({
    kind,
    id: syntheticId(input.id),
    digest: digest(input.digest),
    subjectId: syntheticId(input.subjectId),
    subjectDigest: digest(input.subjectDigest),
    status: STATUS_BY_KIND[kind],
    dependencyDigests: sortedDigests(input.dependencyDigests, 0, 12),
  });
}

function expectedDependencies(nodes: Record<NodeKind, InvariantNode>): Record<NodeKind, readonly string[]> {
  const dependencies: Record<NodeKind, readonly string[]> = {
    package_artifact: [],
    message_artifact: [nodes.package_artifact.digest],
    approval_suppression: [nodes.package_artifact.digest, nodes.message_artifact.digest],
    dispatch_recheck: [
      nodes.package_artifact.digest,
      nodes.message_artifact.digest,
      nodes.approval_suppression.digest,
    ],
    originated_stop: [nodes.dispatch_recheck.digest],
    delivery_unknown: [nodes.message_artifact.digest, nodes.dispatch_recheck.digest],
    suppression_before_success: [nodes.message_artifact.digest, nodes.approval_suppression.digest],
    manual_call: [nodes.package_artifact.digest, nodes.approval_suppression.digest],
    audit_append: [
      nodes.approval_suppression.digest,
      nodes.dispatch_recheck.digest,
      nodes.originated_stop.digest,
      nodes.delivery_unknown.digest,
      nodes.suppression_before_success.digest,
      nodes.manual_call.digest,
    ],
    identity_resolution: [nodes.approval_suppression.digest],
    identity_receipts: [nodes.identity_resolution.digest],
    suppression_retention: [nodes.identity_receipts.digest],
  };
  return Object.fromEntries(Object.entries(dependencies).map(([kind, values]) => (
    [kind, deepFreeze([...values].sort())]
  ))) as Record<NodeKind, readonly string[]>;
}

function buildGraph(nodes: readonly InvariantNode[]): InvariantGraph {
  const byKind = Object.fromEntries(nodes.map((node) => [node.kind, node])) as Record<NodeKind, InvariantNode>;
  return deepFreeze({
    roots: [byKind.package_artifact.digest],
    terminalDigests: [byKind.audit_append.digest, byKind.suppression_retention.digest].sort(),
    branches: {
      emailDispatch: [byKind.dispatch_recheck.digest, byKind.delivery_unknown.digest],
      stopAndSuppression: [byKind.originated_stop.digest, byKind.suppression_before_success.digest],
      manualCall: [byKind.manual_call.digest],
      identityAndRetention: [
        byKind.identity_resolution.digest,
        byKind.identity_receipts.digest,
        byKind.suppression_retention.digest,
      ],
    },
    simultaneousOccurrenceClaimed: false,
    runtimeReachable: false,
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "scopeCurrent", "artifactsCurrent", "approvalsCurrent",
    "dispatchCurrent", "stopStateCurrent", "deliveryStateCurrent",
    "suppressionStateCurrent", "manualCallStateCurrent", "auditStateCurrent",
    "identityStateCurrent", "receiptStateCurrent", "retentionStateCurrent",
    "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    scopeCurrent: booleanValue(input.scopeCurrent),
    artifactsCurrent: booleanValue(input.artifactsCurrent),
    approvalsCurrent: booleanValue(input.approvalsCurrent),
    dispatchCurrent: booleanValue(input.dispatchCurrent),
    stopStateCurrent: booleanValue(input.stopStateCurrent),
    deliveryStateCurrent: booleanValue(input.deliveryStateCurrent),
    suppressionStateCurrent: booleanValue(input.suppressionStateCurrent),
    manualCallStateCurrent: booleanValue(input.manualCallStateCurrent),
    auditStateCurrent: booleanValue(input.auditStateCurrent),
    identityStateCurrent: booleanValue(input.identityStateCurrent),
    receiptStateCurrent: booleanValue(input.receiptStateCurrent),
    retentionStateCurrent: booleanValue(input.retentionStateCurrent),
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

function sortedDigests(value: unknown, minimum: number, maximum: number) {
  const values = denseArray(value, minimum, maximum).map(digest).sort();
  assertUnique(values);
  return deepFreeze(values);
}

function assertUnique(values: readonly string[]) {
  if (new Set(values).size !== values.length) invalid();
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
