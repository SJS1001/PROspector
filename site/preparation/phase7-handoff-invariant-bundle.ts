type Effects = Readonly<{
  historyMutations: 0;
  rowReads: 0;
  csvSerializations: 0;
  byteMaterializations: 0;
  checksumCalculations: 0;
  durableMutations: 0;
  exportMutations: 0;
  deliveryInvocations: 0;
  downloadInvocations: 0;
  providerCalls: 0;
}>;

const NODE_KINDS = [
  "handoff_eligibility",
  "handoff_request_version",
  "handoff_manifest_intent",
  "csv_policy_definition",
  "csv_materialization_precondition",
  "csv_artifact_version_intent",
] as const;
type NodeKind = (typeof NODE_KINDS)[number];

const ARTIFACT_KIND_BY_NODE: Readonly<Record<NodeKind, string>> = Object.freeze({
  handoff_eligibility: "synthetic_phase7_handoff_eligibility_candidate",
  handoff_request_version: "synthetic_phase7_handoff_request_candidate",
  handoff_manifest_intent: "synthetic_phase7_handoff_manifest_intent",
  csv_policy_definition: "synthetic_phase7_csv_policy_definition",
  csv_materialization_precondition: "synthetic_phase7_csv_materialization_precondition",
  csv_artifact_version_intent: "synthetic_phase7_csv_artifact_version_intent",
});

type InvariantNode = Readonly<{
  kind: NodeKind;
  id: string;
  digest: string;
  artifactKind: string;
  dependencyDigests: readonly string[];
}>;

type BundleSnapshot = Readonly<{
  id: string;
  nodes: readonly InvariantNode[];
  createdAt: number;
  completedAt: number;
}>;

type InvariantGraph = Readonly<{
  rootDigests: readonly string[];
  terminalDigests: readonly string[];
  handoffFlowDigests: readonly string[];
  candidateOccurrenceClaimed: false;
  runtimeReachable: false;
}>;

export type SyntheticPhase7HandoffInvariantBundle = Readonly<{
  kind: "synthetic_phase7_handoff_invariant_bundle";
  id: string;
  digest: string;
  snapshot: BundleSnapshot;
  graph: InvariantGraph;
  candidateOccurrenceClaimed: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
  versionCreationAuthorized: false;
  historyMutationAuthorized: false;
  rowAccessAuthorized: false;
  csvSerializationAuthorized: false;
  byteMaterializationAuthorized: false;
  checksumCalculationAuthorized: false;
  persistenceAuthorized: false;
  deliveryAuthorized: false;
  downloadAuthorized: false;
  exportAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

type CurrentAuthority = Readonly<{
  evaluatedAt: number;
  eligibilityCurrent: boolean;
  requestVersionCurrent: boolean;
  manifestIntentCurrent: boolean;
  csvPolicyDefinitionCurrent: boolean;
  materializationPreconditionCurrent: boolean;
  artifactVersionIntentCurrent: boolean;
  dependencyGraphCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const bundles = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  historyMutations: 0,
  rowReads: 0,
  csvSerializations: 0,
  byteMaterializations: 0,
  checksumCalculations: 0,
  durableMutations: 0,
  exportMutations: 0,
  deliveryInvocations: 0,
  downloadInvocations: 0,
  providerCalls: 0,
});

/**
 * Canonicalizes the closed dependency graph over all safe synthetic Phase 7
 * handoff candidates. It authenticates no occurrence and grants no authority.
 */
export async function buildSyntheticPhase7HandoffInvariantBundle(
  value: unknown,
): Promise<SyntheticPhase7HandoffInvariantBundle> {
  try {
    const snapshot = normalizeBundle(value);
    const graph = buildGraph(snapshot.nodes);
    const artifact: SyntheticPhase7HandoffInvariantBundle = deepFreeze({
      kind: "synthetic_phase7_handoff_invariant_bundle",
      id: snapshot.id,
      digest: await sha256Ascii(JSON.stringify({ snapshot, graph })),
      snapshot,
      graph,
      candidateOccurrenceClaimed: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      versionCreationAuthorized: false,
      historyMutationAuthorized: false,
      rowAccessAuthorized: false,
      csvSerializationAuthorized: false,
      byteMaterializationAuthorized: false,
      checksumCalculationAuthorized: false,
      persistenceAuthorized: false,
      deliveryAuthorized: false,
      downloadAuthorized: false,
      exportAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    bundles.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_handoff_invariant_bundle_invalid");
  }
}

/**
 * Rechecks only whether the closed synthetic graph remains current. A current
 * projection still cannot execute a plan, create an artifact, or cause an
 * effect.
 */
export async function evaluateSyntheticPhase7HandoffInvariantBundle(value: unknown) {
  try {
    const input = exactRecord(value, ["bundleArtifact", "currentBundle", "currentAuthority"]);
    if (!bundles.has(input.bundleArtifact as object)) invalid();
    const artifact = input.bundleArtifact as SyntheticPhase7HandoffInvariantBundle;
    const current = await buildSyntheticPhase7HandoffInvariantBundle(input.currentBundle);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("phase7_handoff_invariant_bundle_changed");
    if (authority.evaluatedAt < artifact.snapshot.completedAt) {
      reasons.push("evaluation_precedes_phase7_handoff_bundle");
    }
    if (!authority.eligibilityCurrent) reasons.push("handoff_eligibility_not_current");
    if (!authority.requestVersionCurrent) reasons.push("handoff_request_version_not_current");
    if (!authority.manifestIntentCurrent) reasons.push("handoff_manifest_intent_not_current");
    if (!authority.csvPolicyDefinitionCurrent) reasons.push("csv_policy_definition_not_current");
    if (!authority.materializationPreconditionCurrent) {
      reasons.push("csv_materialization_precondition_not_current");
    }
    if (!authority.artifactVersionIntentCurrent) {
      reasons.push("csv_artifact_version_intent_not_current");
    }
    if (!authority.dependencyGraphCurrent) {
      reasons.push("phase7_handoff_dependency_graph_not_current");
    }
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    const reasonCodes = deepFreeze([...new Set(reasons)].sort(compareText));
    return deepFreeze({
      kind: "synthetic_phase7_handoff_invariant_bundle_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_phase7_handoff_invariants_current_no_authority" as const
        : "synthetic_phase7_handoff_invariants_rejected" as const,
      bundleId: artifact.id,
      bundleDigest: artifact.digest,
      nodeDigests: deepFreeze(artifact.snapshot.nodes.map((node) => node.digest)),
      currentBundleClaimed: reasonCodes.length === 0,
      candidateOccurrenceClaimed: false as const,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
      versionCreationAuthorized: false as const,
      historyMutationAuthorized: false as const,
      rowAccessAuthorized: false as const,
      csvSerializationAuthorized: false as const,
      byteMaterializationAuthorized: false as const,
      checksumCalculationAuthorized: false as const,
      persistenceAuthorized: false as const,
      deliveryAuthorized: false as const,
      downloadAuthorized: false as const,
      exportAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      reasonCodes,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_phase7_handoff_invariant_bundle_decision_invalid");
  }
}

function normalizeBundle(value: unknown): BundleSnapshot {
  const input = exactRecord(value, ["id", "nodes", "createdAt", "completedAt"]);
  const createdAt = timestamp(input.createdAt);
  const completedAt = timestamp(input.completedAt);
  if (completedAt < createdAt) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    nodes: normalizeNodes(input.nodes),
    createdAt,
    completedAt,
  });
}

function normalizeNodes(value: unknown) {
  const nodes = denseArray(value, NODE_KINDS.length, NODE_KINDS.length)
    .map(normalizeNode)
    .sort((left, right) => NODE_KINDS.indexOf(left.kind) - NODE_KINDS.indexOf(right.kind));
  if (nodes.some((node, index) => node.kind !== NODE_KINDS[index])) invalid();
  assertUnique(nodes.map((node) => node.id));
  assertUnique(nodes.map((node) => node.digest));

  const byKind = Object.fromEntries(nodes.map((node) => [node.kind, node])) as Record<
    NodeKind,
    InvariantNode
  >;
  const expected = expectedDependencies(byKind);
  for (const node of nodes) {
    if (!sameStrings(node.dependencyDigests, expected[node.kind])) invalid();
  }
  return deepFreeze(nodes);
}

function normalizeNode(value: unknown): InvariantNode {
  const input = exactRecord(value, ["kind", "id", "digest", "artifactKind", "dependencyDigests"]);
  const kind = enumValue(input.kind, NODE_KINDS);
  if (input.artifactKind !== ARTIFACT_KIND_BY_NODE[kind]) invalid();
  return deepFreeze({
    kind,
    id: syntheticId(input.id),
    digest: digest(input.digest),
    artifactKind: ARTIFACT_KIND_BY_NODE[kind],
    dependencyDigests: sortedDigests(input.dependencyDigests, 0, NODE_KINDS.length),
  });
}

function expectedDependencies(nodes: Record<NodeKind, InvariantNode>) {
  const dependencies: Record<NodeKind, readonly string[]> = {
    handoff_eligibility: [],
    handoff_request_version: [nodes.handoff_eligibility.digest],
    handoff_manifest_intent: [
      nodes.handoff_eligibility.digest,
      nodes.handoff_request_version.digest,
    ],
    csv_policy_definition: [],
    csv_materialization_precondition: [
      nodes.handoff_manifest_intent.digest,
      nodes.csv_policy_definition.digest,
    ],
    csv_artifact_version_intent: [
      nodes.handoff_request_version.digest,
      nodes.handoff_manifest_intent.digest,
      nodes.csv_policy_definition.digest,
      nodes.csv_materialization_precondition.digest,
    ],
  };
  return Object.fromEntries(Object.entries(dependencies).map(([kind, digests]) => (
    [kind, deepFreeze([...digests].sort(compareText))]
  ))) as Record<NodeKind, readonly string[]>;
}

function buildGraph(nodes: readonly InvariantNode[]): InvariantGraph {
  const byKind = Object.fromEntries(nodes.map((node) => [node.kind, node])) as Record<
    NodeKind,
    InvariantNode
  >;
  return deepFreeze({
    rootDigests: [
      byKind.handoff_eligibility.digest,
      byKind.csv_policy_definition.digest,
    ].sort(compareText),
    terminalDigests: [byKind.csv_artifact_version_intent.digest],
    handoffFlowDigests: NODE_KINDS.map((kind) => byKind[kind].digest),
    candidateOccurrenceClaimed: false,
    runtimeReachable: false,
  });
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "eligibilityCurrent", "requestVersionCurrent", "manifestIntentCurrent",
    "csvPolicyDefinitionCurrent", "materializationPreconditionCurrent",
    "artifactVersionIntentCurrent", "dependencyGraphCurrent", "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    eligibilityCurrent: booleanValue(input.eligibilityCurrent),
    requestVersionCurrent: booleanValue(input.requestVersionCurrent),
    manifestIntentCurrent: booleanValue(input.manifestIntentCurrent),
    csvPolicyDefinitionCurrent: booleanValue(input.csvPolicyDefinitionCurrent),
    materializationPreconditionCurrent: booleanValue(input.materializationPreconditionCurrent),
    artifactVersionIntentCurrent: booleanValue(input.artifactVersionIntentCurrent),
    dependencyGraphCurrent: booleanValue(input.dependencyGraphCurrent),
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

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const indexes = [...Array(value.length).keys()].map(String);
  const actual = Object.keys(descriptors).filter((key) => key !== "length");
  if (actual.sort().join("\0") !== [...indexes].sort().join("\0")) invalid();
  return indexes.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    return descriptor.value;
  });
}

function sortedDigests(value: unknown, minimum: number, maximum: number) {
  const values = denseArray(value, minimum, maximum).map(digest);
  assertUnique(values);
  return deepFreeze(values.sort(compareText));
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertUnique(values: readonly string[]) {
  if (new Set(values).size !== values.length) invalid();
}

function enumValue<const T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
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
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) {
    invalid();
  }
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
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
