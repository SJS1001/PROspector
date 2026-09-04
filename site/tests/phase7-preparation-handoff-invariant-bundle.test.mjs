import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-09-02T16:35:00.000Z");
const DIGESTS = Object.freeze(["1", "2", "3", "4", "5", "6"].map((value) => value.repeat(64)));
const KINDS = Object.freeze([
  "handoff_eligibility",
  "handoff_request_version",
  "handoff_manifest_intent",
  "csv_policy_definition",
  "csv_materialization_precondition",
  "csv_artifact_version_intent",
]);
const ARTIFACT_KINDS = Object.freeze({
  handoff_eligibility: "synthetic_phase7_handoff_eligibility_candidate",
  handoff_request_version: "synthetic_phase7_handoff_request_candidate",
  handoff_manifest_intent: "synthetic_phase7_handoff_manifest_intent",
  csv_policy_definition: "synthetic_phase7_csv_policy_definition",
  csv_materialization_precondition: "synthetic_phase7_csv_materialization_precondition",
  csv_artifact_version_intent: "synthetic_phase7_csv_artifact_version_intent",
});
const ZERO_EFFECTS = Object.freeze({
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

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const bundles = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-handoff-invariant-bundle.ts",
      import.meta.url,
    ).pathname);
    return { vite, bundles };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function nodes(digests = DIGESTS) {
  const dependencies = [
    [],
    [digests[0]],
    [digests[0], digests[1]],
    [],
    [digests[2], digests[3]],
    [digests[1], digests[2], digests[3], digests[4]],
  ];
  return KINDS.map((kind, index) => ({
    kind,
    id: `synthetic-${kind.replaceAll("_", "-")}-v1`,
    digest: digests[index],
    artifactKind: ARTIFACT_KINDS[kind],
    dependencyDigests: dependencies[index],
  }));
}

function bundleInput(patch = {}) {
  return {
    id: "synthetic-phase7-handoff-invariant-bundle-v1",
    nodes: nodes(),
    createdAt: NOW,
    completedAt: NOW + 100,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 200,
    eligibilityCurrent: true,
    requestVersionCurrent: true,
    manifestIntentCurrent: true,
    csvPolicyDefinitionCurrent: true,
    materializationPreconditionCurrent: true,
    artifactVersionIntentCurrent: true,
    dependencyGraphCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

function evaluationInput(bundleArtifact, patch = {}) {
  return {
    bundleArtifact,
    currentBundle: bundleInput(),
    currentAuthority: authority(),
    ...patch,
  };
}

function replaceNode(input, kind, patch) {
  return {
    ...input,
    nodes: input.nodes.map((entry) => entry.kind === kind ? { ...entry, ...patch } : entry),
  };
}

test("handoff invariant bundles are deterministic, deeply frozen, and zero-effect", async () => {
  const { vite, bundles } = await load();
  try {
    const first = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    const reordered = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput({
      nodes: [...nodes()].reverse().map((entry) => ({
        ...entry,
        dependencyDigests: [...entry.dependencyDigests].reverse(),
      })),
    }));
    assert.equal(first.digest, reordered.digest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.snapshot.nodes), true);
    assert.equal(first.candidateOccurrenceClaimed, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    for (const key of [
      "phaseExecutionAuthorized", "runtimeCompositionAuthorized", "versionCreationAuthorized",
      "historyMutationAuthorized", "rowAccessAuthorized", "csvSerializationAuthorized",
      "byteMaterializationAuthorized", "checksumCalculationAuthorized", "persistenceAuthorized",
      "deliveryAuthorized", "downloadAuthorized", "exportAuthorized", "providerInvocationAuthorized",
    ]) assert.equal(first[key], false, key);
  } finally {
    await vite.close();
  }
});

test("the canonical graph closes the exact handoff dependency chain", async () => {
  const { vite, bundles } = await load();
  try {
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    assert.deepEqual(artifact.snapshot.nodes.map((entry) => entry.kind), KINDS);
    assert.deepEqual(artifact.graph.rootDigests, [DIGESTS[0], DIGESTS[3]]);
    assert.deepEqual(artifact.graph.terminalDigests, [DIGESTS[5]]);
    assert.deepEqual(artifact.graph.handoffFlowDigests, DIGESTS);
    assert.equal(artifact.graph.runtimeReachable, false);
    assert.equal(artifact.graph.candidateOccurrenceClaimed, false);
  } finally {
    await vite.close();
  }
});

test("a completely current graph projects compatibility without authority", async () => {
  const { vite, bundles } = await load();
  try {
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    const decision = await bundles.evaluateSyntheticPhase7HandoffInvariantBundle(
      evaluationInput(artifact),
    );
    assert.equal(decision.status, "synthetic_phase7_handoff_invariants_current_no_authority");
    assert.equal(decision.currentBundleClaimed, true);
    assert.equal(decision.bundleId, artifact.id);
    assert.equal(decision.bundleDigest, artifact.digest);
    assert.deepEqual(decision.nodeDigests, DIGESTS);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    for (const key of [
      "phaseExecutionAuthorized", "runtimeCompositionAuthorized", "versionCreationAuthorized",
      "historyMutationAuthorized", "rowAccessAuthorized", "csvSerializationAuthorized",
      "byteMaterializationAuthorized", "checksumCalculationAuthorized", "persistenceAuthorized",
      "deliveryAuthorized", "downloadAuthorized", "exportAuthorized", "providerInvocationAuthorized",
    ]) assert.equal(decision[key], false, key);
  } finally {
    await vite.close();
  }
});

test("every candidate and graph-current predicate rejects independently", async () => {
  const { vite, bundles } = await load();
  try {
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    const cases = [
      ["handoff_eligibility_not_current", { eligibilityCurrent: false }],
      ["handoff_request_version_not_current", { requestVersionCurrent: false }],
      ["handoff_manifest_intent_not_current", { manifestIntentCurrent: false }],
      ["csv_policy_definition_not_current", { csvPolicyDefinitionCurrent: false }],
      ["csv_materialization_precondition_not_current", { materializationPreconditionCurrent: false }],
      ["csv_artifact_version_intent_not_current", { artifactVersionIntentCurrent: false }],
      ["phase7_handoff_dependency_graph_not_current", { dependencyGraphCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await bundles.evaluateSyntheticPhase7HandoffInvariantBundle(
        evaluationInput(artifact, { currentAuthority: authority(patch) }),
      );
      assert.equal(decision.status, "synthetic_phase7_handoff_invariants_rejected", reason);
      assert.equal(decision.currentBundleClaimed, false, reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("any node identity, digest, artifact kind, or time drift invalidates the bundle", async () => {
  const { vite, bundles } = await load();
  try {
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    const changedDigests = [...DIGESTS];
    changedDigests[3] = "a".repeat(64);
    for (const currentBundle of [
      replaceNode(bundleInput(), "handoff_eligibility", { id: "synthetic-other-eligibility" }),
      bundleInput({ nodes: nodes(changedDigests) }),
      bundleInput({ createdAt: NOW + 1, completedAt: NOW + 101 }),
    ]) {
      const decision = await bundles.evaluateSyntheticPhase7HandoffInvariantBundle(
        evaluationInput(artifact, { currentBundle }),
      );
      assert.equal(decision.status, "synthetic_phase7_handoff_invariants_rejected");
      assert.equal(decision.reasonCodes.includes("phase7_handoff_invariant_bundle_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("missing, duplicate, extra, wrong-kind, wrong-artifact, and wrong-edge graphs reject", async () => {
  const { vite, bundles } = await load();
  try {
    const base = bundleInput();
    for (const value of [
      { ...base, nodes: base.nodes.slice(1) },
      { ...base, nodes: [...base.nodes, base.nodes[0]] },
      replaceNode(base, "handoff_request_version", { kind: "handoff_eligibility" }),
      replaceNode(base, "handoff_request_version", { artifactKind: "synthetic-other-artifact" }),
      replaceNode(base, "handoff_request_version", { dependencyDigests: [] }),
      replaceNode(base, "csv_materialization_precondition", { dependencyDigests: [DIGESTS[3]] }),
      replaceNode(base, "csv_artifact_version_intent", {
        dependencyDigests: [DIGESTS[0], DIGESTS[1], DIGESTS[2], DIGESTS[3], DIGESTS[4]],
      }),
    ]) await assert.rejects(
      bundles.buildSyntheticPhase7HandoffInvariantBundle(value),
      /synthetic_phase7_handoff_invariant_bundle_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("duplicate candidate identities or digests cannot collapse boundaries", async () => {
  const { vite, bundles } = await load();
  try {
    const base = bundleInput();
    for (const patch of [
      { id: base.nodes[0].id },
      { digest: base.nodes[0].digest },
    ]) await assert.rejects(
      bundles.buildSyntheticPhase7HandoffInvariantBundle(
        replaceNode(base, "handoff_request_version", patch),
      ),
      /synthetic_phase7_handoff_invariant_bundle_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("time boundaries are exact and evaluation before completion rejects", async () => {
  const { vite, bundles } = await load();
  try {
    await assert.rejects(
      bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput({ completedAt: NOW - 1 })),
      /synthetic_phase7_handoff_invariant_bundle_invalid/,
    );
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    const before = await bundles.evaluateSyntheticPhase7HandoffInvariantBundle(
      evaluationInput(artifact, { currentAuthority: authority({ evaluatedAt: NOW + 99 }) }),
    );
    const exact = await bundles.evaluateSyntheticPhase7HandoffInvariantBundle(
      evaluationInput(artifact, { currentAuthority: authority({ evaluatedAt: NOW + 100 }) }),
    );
    assert.equal(before.reasonCodes.includes("evaluation_precedes_phase7_handoff_bundle"), true);
    assert.equal(exact.status, "synthetic_phase7_handoff_invariants_current_no_authority");
  } finally {
    await vite.close();
  }
});

test("a forged bundle copy cannot enter evaluation", async () => {
  const { vite, bundles } = await load();
  try {
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    await assert.rejects(
      bundles.evaluateSyntheticPhase7HandoffInvariantBundle(evaluationInput({ ...artifact })),
      /synthetic_phase7_handoff_invariant_bundle_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("hostile shapes, raw values, rows, bytes, persistence, providers, and extras reject", async () => {
  const { vite, bundles } = await load();
  try {
    const accessor = Object.defineProperty(bundleInput(), "completedAt", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const sparse = bundleInput();
    sparse.nodes = [, ...sparse.nodes.slice(1)];
    for (const value of [
      accessor,
      new Proxy(bundleInput(), { ownKeys() { throw new Error("must-not-run"); } }),
      sparse,
      { ...bundleInput(), email: "person@example.com" },
      { ...bundleInput(), phone: "+14165550123" },
      { ...bundleInput(), rows: [] },
      { ...bundleInput(), csvBytes: new Uint8Array() },
      { ...bundleInput(), persistedVersionId: "synthetic-version" },
      { ...bundleInput(), providerHandle: "synthetic-provider" },
    ]) await assert.rejects(
      bundles.buildSyntheticPhase7HandoffInvariantBundle(value),
      /synthetic_phase7_handoff_invariant_bundle_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("authority input is exact, boolean, data-only, and fail-closed", async () => {
  const { vite, bundles } = await load();
  try {
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    const accessor = Object.defineProperty(authority(), "dependencyGraphCurrent", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    for (const currentAuthority of [
      { ...authority(), extra: true },
      Object.fromEntries(Object.entries(authority()).filter(([key]) => key !== "dependencyGraphCurrent")),
      { ...authority(), eligibilityCurrent: 1 },
      accessor,
      new Proxy(authority(), { ownKeys() { throw new Error("must-not-run"); } }),
    ]) await assert.rejects(
      bundles.evaluateSyntheticPhase7HandoffInvariantBundle(
        evaluationInput(artifact, { currentAuthority }),
      ),
      /synthetic_phase7_handoff_invariant_bundle_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("multiple failures are stable, sorted, and never elevate authority", async () => {
  const { vite, bundles } = await load();
  try {
    const artifact = await bundles.buildSyntheticPhase7HandoffInvariantBundle(bundleInput());
    const changedDigests = [...DIGESTS];
    changedDigests[3] = "a".repeat(64);
    const decision = await bundles.evaluateSyntheticPhase7HandoffInvariantBundle(
      evaluationInput(artifact, {
        currentBundle: bundleInput({ nodes: nodes(changedDigests) }),
        currentAuthority: authority({
          eligibilityCurrent: false,
          dependencyGraphCurrent: false,
          externalEffectsDisabled: false,
        }),
      }),
    );
    assert.deepEqual(decision.reasonCodes, [...decision.reasonCodes].sort());
    assert.deepEqual(decision.reasonCodes, [
      "external_effects_not_disabled",
      "handoff_eligibility_not_current",
      "phase7_handoff_dependency_graph_not_current",
      "phase7_handoff_invariant_bundle_changed",
    ]);
    assert.equal(decision.currentBundleClaimed, false);
    assert.equal(decision.phaseExecutionAuthorized, false);
    assert.equal(decision.csvSerializationAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("the bundle module has no runtime, history, row, byte, persistence, provider, or effect seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-handoff-invariant-bundle.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
    "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition", "Digitalrain", "Mining",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  for (const claim of [
    "phaseExecutionAuthorized: false", "runtimeCompositionAuthorized: false",
    "versionCreationAuthorized: false", "historyMutationAuthorized: false",
    "rowAccessAuthorized: false", "csvSerializationAuthorized: false",
    "byteMaterializationAuthorized: false", "checksumCalculationAuthorized: false",
    "persistenceAuthorized: false", "deliveryAuthorized: false", "downloadAuthorized: false",
    "exportAuthorized: false", "providerInvocationAuthorized: false",
  ]) assert.equal(source.includes(claim), true, claim);
});
