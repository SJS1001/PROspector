import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-09-02T16:00:00.000Z");
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const ZERO_EFFECTS = Object.freeze({
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
    const preconditions = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-csv-materialization-precondition.ts",
      import.meta.url,
    ).pathname);
    return { vite, preconditions };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-csv-materialization-precondition-v1",
    handoffManifestIntentId: "synthetic-handoff-manifest-intent-v1",
    handoffManifestIntentDigest: DIGEST_A,
    csvPolicyDefinitionId: "synthetic-csv-policy-definition-v1",
    csvPolicyDefinitionDigest: DIGEST_B,
    createdAt: NOW,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 1_000,
    manifestIntentCurrent: true,
    csvPolicyDefinitionCurrent: true,
    eligibilityCurrent: true,
    requestVersionCurrent: true,
    configurationCurrent: true,
    exportDefinitionCurrent: true,
    suppressionCurrent: true,
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

test("materialization precondition candidates are deterministic, frozen, and zero-effect", async () => {
  const { vite, preconditions } = await load();
  try {
    const first = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    const second = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    assert.equal(first.digest, second.digest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(first.materializationPreconditionClaimed, false);
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

test("the candidate binds only manifest-intent and CSV-policy identities and digests", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    assert.deepEqual(Object.keys(artifact.snapshot), [
      "id",
      "handoffManifestIntentId",
      "handoffManifestIntentDigest",
      "csvPolicyDefinitionId",
      "csvPolicyDefinitionDigest",
      "createdAt",
    ]);
    assert.equal(artifact.snapshot.handoffManifestIntentDigest, DIGEST_A);
    assert.equal(artifact.snapshot.csvPolicyDefinitionDigest, DIGEST_B);
  } finally {
    await vite.close();
  }
});

test("current preconditions project readiness but grant no materialization authority", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    const decision = await preconditions.evaluateSyntheticCsvMaterializationPrecondition(
      decisionInput(artifact),
    );
    assert.equal(decision.status, "synthetic_csv_materialization_preconditions_current_no_authority");
    assert.equal(decision.preconditionsCurrentClaimed, true);
    assert.equal(decision.candidateId, artifact.id);
    assert.equal(decision.candidateDigest, artifact.digest);
    assert.equal(decision.handoffManifestIntentId, artifact.snapshot.handoffManifestIntentId);
    assert.equal(decision.handoffManifestIntentDigest, DIGEST_A);
    assert.equal(decision.csvPolicyDefinitionId, artifact.snapshot.csvPolicyDefinitionId);
    assert.equal(decision.csvPolicyDefinitionDigest, DIGEST_B);
    assert.deepEqual(decision.reasonCodes, []);
    for (const key of [
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
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("every current-authority predicate fails closed independently", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    const cases = [
      ["handoff_manifest_intent_not_current", { manifestIntentCurrent: false }],
      ["csv_policy_definition_not_current", { csvPolicyDefinitionCurrent: false }],
      ["handoff_eligibility_not_current", { eligibilityCurrent: false }],
      ["handoff_request_version_not_current", { requestVersionCurrent: false }],
      ["handoff_configuration_not_current", { configurationCurrent: false }],
      ["handoff_export_definition_not_current", { exportDefinitionCurrent: false }],
      ["handoff_suppression_not_current", { suppressionCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await preconditions.evaluateSyntheticCsvMaterializationPrecondition(
        decisionInput(artifact, { currentAuthority: authority(patch) }),
      );
      assert.equal(decision.status, "synthetic_csv_materialization_preconditions_rejected", reason);
      assert.equal(decision.preconditionsCurrentClaimed, false, reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("candidate identity, either digest, or creation-time drift rejects", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    for (const currentCandidate of [
      candidateInput({ id: "synthetic-csv-materialization-precondition-v2" }),
      candidateInput({ handoffManifestIntentDigest: "c".repeat(64) }),
      candidateInput({ csvPolicyDefinitionDigest: "d".repeat(64) }),
      candidateInput({ createdAt: NOW + 1 }),
    ]) {
      const decision = await preconditions.evaluateSyntheticCsvMaterializationPrecondition(
        decisionInput(artifact, { currentCandidate }),
      );
      assert.equal(decision.status, "synthetic_csv_materialization_preconditions_rejected");
      assert.equal(decision.reasonCodes.includes("csv_materialization_precondition_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("evaluation before the precondition candidate rejects", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    const decision = await preconditions.evaluateSyntheticCsvMaterializationPrecondition(
      decisionInput(artifact, { currentAuthority: authority({ evaluatedAt: NOW - 1 }) }),
    );
    assert.equal(decision.status, "synthetic_csv_materialization_preconditions_rejected");
    assert.equal(
      decision.reasonCodes.includes("evaluation_precedes_csv_materialization_precondition"),
      true,
    );
  } finally {
    await vite.close();
  }
});

test("malformed identifiers, digests, and timestamps reject", async () => {
  const { vite, preconditions } = await load();
  try {
    for (const patch of [
      { id: "" },
      { handoffManifestIntentId: "manifest-1" },
      { csvPolicyDefinitionId: "policy-1" },
      { handoffManifestIntentDigest: "A".repeat(64) },
      { csvPolicyDefinitionDigest: "b".repeat(63) },
      { createdAt: 0 },
      { createdAt: 1.5 },
    ]) {
      await assert.rejects(
        preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput(patch)),
        /synthetic_phase7_csv_materialization_precondition_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("raw values, rows, bytes, checksums, persistence, providers, and extras reject", async () => {
  const { vite, preconditions } = await load();
  try {
    for (const extra of [
      { email: "person@example.com" },
      { phone: "+14165550123" },
      { row: {} },
      { rows: [] },
      { csvBytes: new Uint8Array() },
      { checksum: "e".repeat(64) },
      { persistedRecordId: "synthetic-record" },
      { providerHandle: "synthetic-provider" },
    ]) {
      await assert.rejects(
        preconditions.buildSyntheticCsvMaterializationPrecondition({ ...candidateInput(), ...extra }),
        /synthetic_phase7_csv_materialization_precondition_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("hostile records, accessors, proxies, symbols, and arrays reject without trusting getters", async () => {
  const { vite, preconditions } = await load();
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
    ]) {
      await assert.rejects(
        preconditions.buildSyntheticCsvMaterializationPrecondition(value),
        /synthetic_phase7_csv_materialization_precondition_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("a forged branded-looking candidate cannot enter evaluation", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    await assert.rejects(
      preconditions.evaluateSyntheticCsvMaterializationPrecondition(decisionInput({ ...artifact })),
      /synthetic_phase7_csv_materialization_precondition_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("authority shape is exact, boolean, data-only, and fail-closed", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    const getter = Object.defineProperty(authority(), "eligibilityCurrent", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    for (const currentAuthority of [
      { ...authority(), extra: true },
      Object.fromEntries(Object.entries(authority()).filter(([key]) => key !== "suppressionCurrent")),
      { ...authority(), requestVersionCurrent: 1 },
      getter,
      new Proxy(authority(), { ownKeys() { throw new Error("must-not-run"); } }),
    ]) {
      await assert.rejects(
        preconditions.evaluateSyntheticCsvMaterializationPrecondition(
          decisionInput(artifact, { currentAuthority }),
        ),
        /synthetic_phase7_csv_materialization_precondition_decision_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("multiple failures are stable, sorted, and never elevate authority", async () => {
  const { vite, preconditions } = await load();
  try {
    const artifact = await preconditions.buildSyntheticCsvMaterializationPrecondition(candidateInput());
    const decision = await preconditions.evaluateSyntheticCsvMaterializationPrecondition(
      decisionInput(artifact, {
        currentCandidate: candidateInput({ csvPolicyDefinitionDigest: "f".repeat(64) }),
        currentAuthority: authority({
          eligibilityCurrent: false,
          suppressionCurrent: false,
          externalEffectsDisabled: false,
        }),
      }),
    );
    assert.deepEqual(decision.reasonCodes, [...decision.reasonCodes].sort());
    assert.deepEqual(decision.reasonCodes, [
      "csv_materialization_precondition_changed",
      "external_effects_not_disabled",
      "handoff_eligibility_not_current",
      "handoff_suppression_not_current",
    ]);
    assert.equal(decision.preconditionsCurrentClaimed, false);
    assert.equal(decision.rowAccessAuthorized, false);
    assert.equal(decision.csvSerializationAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("the precondition module has no runtime, row, byte, persistence, provider, or effect seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-csv-materialization-precondition.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
    "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition", "Digitalrain", "Mining",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  for (const claim of [
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
