import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-09-02T16:15:00.000Z");
const DIGESTS = Object.freeze(["a", "b", "c", "d", "e", "f"].map((value) => value.repeat(64)));
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
    const intents = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-csv-artifact-version-intent.ts",
      import.meta.url,
    ).pathname);
    return { vite, intents };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-csv-artifact-version-intent-v1",
    materializationPreconditionId: "synthetic-csv-materialization-precondition-v1",
    materializationPreconditionDigest: DIGESTS[0],
    handoffRequestId: "synthetic-handoff-request-v1",
    handoffRequestDigest: DIGESTS[1],
    versionIntentId: "synthetic-handoff-version-intent-v1",
    versionIntentDigest: DIGESTS[2],
    handoffManifestIntentId: "synthetic-handoff-manifest-intent-v1",
    handoffManifestIntentDigest: DIGESTS[3],
    csvPolicyDefinitionId: "synthetic-csv-policy-definition-v1",
    csvPolicyDefinitionDigest: DIGESTS[4],
    intendedVersionNumber: 1,
    createdAt: NOW,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 1_000,
    materializationPreconditionCurrent: true,
    requestVersionCurrent: true,
    manifestIntentCurrent: true,
    csvPolicyDefinitionCurrent: true,
    intendedVersionCurrent: true,
    historyHeadCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

function decisionInput(candidate, patch = {}) {
  return {
    candidate,
    currentCandidate: candidateInput(),
    currentAuthority: authority(),
    ...patch,
  };
}

test("artifact-version intents are deterministic, frozen, digest-only, and zero-effect", async () => {
  const { vite, intents } = await load();
  try {
    const first = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    const second = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    assert.equal(first.digest, second.digest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(first.artifactVersionClaimed, false);
    assert.equal(first.versionCreationAuthorized, false);
    assert.equal(first.historyMutationAuthorized, false);
    assert.equal(first.rowAccessAuthorized, false);
    assert.equal(first.csvSerializationAuthorized, false);
    assert.equal(first.byteMaterializationAuthorized, false);
    assert.equal(first.checksumCalculationAuthorized, false);
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.deliveryAuthorized, false);
    assert.equal(first.downloadAuthorized, false);
    assert.equal(first.exportAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("the intent binds only synthetic dependency references and one intended version", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    assert.deepEqual(Object.keys(artifact.snapshot), [
      "id",
      "materializationPreconditionId",
      "materializationPreconditionDigest",
      "handoffRequestId",
      "handoffRequestDigest",
      "versionIntentId",
      "versionIntentDigest",
      "handoffManifestIntentId",
      "handoffManifestIntentDigest",
      "csvPolicyDefinitionId",
      "csvPolicyDefinitionDigest",
      "intendedVersionNumber",
      "createdAt",
    ]);
    assert.equal(artifact.snapshot.intendedVersionNumber, 1);
  } finally {
    await vite.close();
  }
});

test("a current tuple projects only a current version intent with no authority", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    const decision = await intents.evaluateSyntheticCsvArtifactVersionIntent(decisionInput(artifact));
    assert.equal(decision.status, "synthetic_csv_artifact_version_intent_current_no_authority");
    assert.equal(decision.currentIntentClaimed, true);
    assert.equal(decision.candidateId, artifact.id);
    assert.equal(decision.candidateDigest, artifact.digest);
    assert.equal(decision.intendedVersionNumber, 1);
    assert.equal(decision.artifactVersionClaimed, false);
    for (const key of [
      "versionCreationAuthorized",
      "historyMutationAuthorized",
      "rowAccessAuthorized",
      "csvSerializationAuthorized",
      "byteMaterializationAuthorized",
      "checksumCalculationAuthorized",
      "persistenceAuthorized",
      "deliveryAuthorized",
      "downloadAuthorized",
      "exportAuthorized",
      "providerInvocationAuthorized",
    ]) assert.equal(decision[key], false, key);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("every current dependency and history predicate fails closed independently", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    const cases = [
      ["csv_materialization_precondition_not_current", { materializationPreconditionCurrent: false }],
      ["handoff_request_version_not_current", { requestVersionCurrent: false }],
      ["handoff_manifest_intent_not_current", { manifestIntentCurrent: false }],
      ["csv_policy_definition_not_current", { csvPolicyDefinitionCurrent: false }],
      ["intended_version_not_current", { intendedVersionCurrent: false }],
      ["handoff_history_head_not_current", { historyHeadCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await intents.evaluateSyntheticCsvArtifactVersionIntent(
        decisionInput(artifact, { currentAuthority: authority(patch) }),
      );
      assert.equal(decision.status, "synthetic_csv_artifact_version_intent_rejected", reason);
      assert.equal(decision.currentIntentClaimed, false, reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("every dependency reference, version, and creation time is digest-bound", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    const cases = [
      { materializationPreconditionDigest: DIGESTS[5] },
      { handoffRequestDigest: DIGESTS[5] },
      { versionIntentDigest: DIGESTS[5] },
      { handoffManifestIntentDigest: DIGESTS[5] },
      { csvPolicyDefinitionDigest: DIGESTS[5] },
      { intendedVersionNumber: 2 },
      { createdAt: NOW + 1 },
    ];
    for (const patch of cases) {
      const decision = await intents.evaluateSyntheticCsvArtifactVersionIntent(
        decisionInput(artifact, { currentCandidate: candidateInput(patch) }),
      );
      assert.equal(decision.status, "synthetic_csv_artifact_version_intent_rejected");
      assert.equal(decision.reasonCodes.includes("csv_artifact_version_intent_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("evaluation before intent creation rejects", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    const decision = await intents.evaluateSyntheticCsvArtifactVersionIntent(decisionInput(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW - 1 }),
    }));
    assert.equal(decision.status, "synthetic_csv_artifact_version_intent_rejected");
    assert.equal(decision.reasonCodes.includes("evaluation_precedes_csv_artifact_version_intent"), true);
  } finally {
    await vite.close();
  }
});

test("identifiers, digests, versions, and timestamps are closed and bounded", async () => {
  const { vite, intents } = await load();
  try {
    for (const patch of [
      { id: "" },
      { materializationPreconditionId: "precondition-1" },
      { handoffRequestId: "request-1" },
      { versionIntentId: "version-1" },
      { handoffManifestIntentId: "manifest-1" },
      { csvPolicyDefinitionId: "policy-1" },
      { materializationPreconditionDigest: "A".repeat(64) },
      { handoffRequestDigest: "b".repeat(63) },
      { intendedVersionNumber: 0 },
      { intendedVersionNumber: 1.5 },
      { intendedVersionNumber: 1_000_000_001 },
      { createdAt: 0 },
    ]) await assert.rejects(
      intents.buildSyntheticCsvArtifactVersionIntent(candidateInput(patch)),
      /synthetic_phase7_csv_artifact_version_intent_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("raw values, rows, bytes, checksums, records, provider handles, and extras reject", async () => {
  const { vite, intents } = await load();
  try {
    for (const extra of [
      { email: "person@example.com" },
      { phone: "+14165550123" },
      { rows: [] },
      { csvBytes: new Uint8Array() },
      { checksum: DIGESTS[5] },
      { persistedVersionId: "synthetic-version-v1" },
      { providerHandle: "synthetic-provider" },
    ]) await assert.rejects(
      intents.buildSyntheticCsvArtifactVersionIntent({ ...candidateInput(), ...extra }),
      /synthetic_phase7_csv_artifact_version_intent_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("hostile records, accessors, proxies, symbols, and arrays fail closed", async () => {
  const { vite, intents } = await load();
  try {
    const accessor = Object.defineProperty(candidateInput(), "createdAt", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const symbolRecord = candidateInput();
    symbolRecord[Symbol("hidden")] = true;
    for (const value of [
      accessor,
      new Proxy(candidateInput(), { ownKeys() { throw new Error("must-not-run"); } }),
      Object.assign(Object.create(null), candidateInput()),
      symbolRecord,
      [],
      null,
    ]) await assert.rejects(
      intents.buildSyntheticCsvArtifactVersionIntent(value),
      /synthetic_phase7_csv_artifact_version_intent_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("a forged intent cannot enter current-state evaluation", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    await assert.rejects(
      intents.evaluateSyntheticCsvArtifactVersionIntent(decisionInput({ ...artifact })),
      /synthetic_phase7_csv_artifact_version_intent_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("authority shape is exact, boolean, data-only, and fail-closed", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    const accessor = Object.defineProperty(authority(), "historyHeadCurrent", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    for (const currentAuthority of [
      { ...authority(), extra: true },
      Object.fromEntries(Object.entries(authority()).filter(([key]) => key !== "historyHeadCurrent")),
      { ...authority(), intendedVersionCurrent: 1 },
      accessor,
      new Proxy(authority(), { ownKeys() { throw new Error("must-not-run"); } }),
    ]) await assert.rejects(
      intents.evaluateSyntheticCsvArtifactVersionIntent(
        decisionInput(artifact, { currentAuthority }),
      ),
      /synthetic_phase7_csv_artifact_version_intent_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("multiple failures are stable, sorted, and cannot elevate authority", async () => {
  const { vite, intents } = await load();
  try {
    const artifact = await intents.buildSyntheticCsvArtifactVersionIntent(candidateInput());
    const decision = await intents.evaluateSyntheticCsvArtifactVersionIntent(decisionInput(artifact, {
      currentCandidate: candidateInput({ intendedVersionNumber: 2 }),
      currentAuthority: authority({
        historyHeadCurrent: false,
        requestVersionCurrent: false,
        externalEffectsDisabled: false,
      }),
    }));
    assert.deepEqual(decision.reasonCodes, [...decision.reasonCodes].sort());
    assert.deepEqual(decision.reasonCodes, [
      "csv_artifact_version_intent_changed",
      "external_effects_not_disabled",
      "handoff_history_head_not_current",
      "handoff_request_version_not_current",
    ]);
    assert.equal(decision.currentIntentClaimed, false);
    assert.equal(decision.versionCreationAuthorized, false);
    assert.equal(decision.historyMutationAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("the intent module has no runtime, history, row, byte, persistence, provider, or effect seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-csv-artifact-version-intent.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
    "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition", "Digitalrain", "Mining",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  for (const claim of [
    "artifactVersionClaimed: false",
    "versionCreationAuthorized: false",
    "historyMutationAuthorized: false",
    "rowAccessAuthorized: false",
    "csvSerializationAuthorized: false",
    "byteMaterializationAuthorized: false",
    "checksumCalculationAuthorized: false",
    "persistenceAuthorized: false",
    "deliveryAuthorized: false",
    "downloadAuthorized: false",
    "exportAuthorized: false",
    "providerInvocationAuthorized: false",
  ]) assert.equal(source.includes(claim), true, claim);
});
