import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-09-02T15:00:00.000Z");
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
const DIGEST_E = "e".repeat(64);
const DIGEST_F = "f".repeat(64);
const DIGEST_0 = "0".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  historyMutations: 0,
  durableMutations: 0,
  csvSerializations: 0,
  exportMutations: 0,
  deliveryInvocations: 0,
  downloadInvocations: 0,
  providerCalls: 0,
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const manifests = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-handoff-manifest-intent.ts",
      import.meta.url,
    ).pathname);
    return { vite, manifests };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-handoff-manifest-intent",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    profileId: "synthetic-profile",
    eligibilityCandidateId: "synthetic-handoff-snapshot",
    eligibilityCandidateDigest: DIGEST_A,
    handoffRequestId: "synthetic-handoff-request",
    handoffRequestDigest: DIGEST_B,
    versionIntentId: "synthetic-handoff-version-five",
    versionIntentDigest: DIGEST_C,
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: DIGEST_D,
    exportDefinitionId: "synthetic-export-definition-v1",
    exportDefinitionDigest: DIGEST_E,
    uniqueProspectCount: 1,
    eligibleContactRowCount: 2,
    exclusionCount: 3,
    exclusionLedgerDigest: DIGEST_F,
    nonContactableReferenceCount: 1,
    nonContactableManifestDigest: DIGEST_0,
    schemaVersion: 1,
    createdAt: NOW,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 1_000,
    scopeCurrent: true,
    eligibilityCurrent: true,
    requestVersionCurrent: true,
    configurationCurrent: true,
    exportDefinitionCurrent: true,
    countsCurrent: true,
    exclusionLedgerCurrent: true,
    nonContactableManifestCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

function decisionInput(artifact, patch = {}) {
  return {
    candidate: artifact,
    currentCandidate: candidateInput(),
    currentAuthority: authority(),
    ...patch,
  };
}

test("manifest intents are deterministic, deeply frozen, digest-only, and zero-effect", async () => {
  const { vite, manifests } = await load();
  try {
    const first = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    const second = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    assert.equal(first.digest, second.digest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(first.manifestClaimed, false);
    assert.equal(first.checksumClaimed, false);
    assert.equal(first.phaseExecutionAuthorized, false);
    assert.equal(first.runtimeCompositionAuthorized, false);
    assert.equal(first.versionCreationAuthorized, false);
    assert.equal(first.historyMutationAuthorized, false);
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.csvSerializationAuthorized, false);
    assert.equal(first.deliveryAuthorized, false);
    assert.equal(first.downloadAuthorized, false);
    assert.equal(first.exportAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("manifest counts keep unique Prospects, rows, exclusions, and non-contactable references distinct", async () => {
  const { vite, manifests } = await load();
  try {
    const artifact = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    assert.equal(artifact.snapshot.uniqueProspectCount, 1);
    assert.equal(artifact.snapshot.eligibleContactRowCount, 2);
    assert.equal(artifact.snapshot.exclusionCount, 3);
    assert.equal(artifact.snapshot.nonContactableReferenceCount, 1);

    const empty = await manifests.buildSyntheticHandoffManifestIntent(candidateInput({
      id: "synthetic-empty-handoff-manifest-intent",
      uniqueProspectCount: 0,
      eligibleContactRowCount: 0,
      exclusionCount: 0,
      nonContactableReferenceCount: 0,
    }));
    assert.equal(empty.snapshot.uniqueProspectCount, 0);
    assert.equal(empty.snapshot.eligibleContactRowCount, 0);
  } finally {
    await vite.close();
  }
});

test("manifest count relationships and schema version fail closed", async () => {
  const { vite, manifests } = await load();
  try {
    for (const patch of [
      { uniqueProspectCount: 2, eligibleContactRowCount: 1 },
      { uniqueProspectCount: -1 },
      { eligibleContactRowCount: 1.5 },
      { exclusionCount: 1_000_000_001 },
      { exclusionCount: 0, nonContactableReferenceCount: 1 },
      { nonContactableReferenceCount: Number.MAX_SAFE_INTEGER },
      { schemaVersion: 0 },
      { schemaVersion: 2 },
    ]) {
      await assert.rejects(
        manifests.buildSyntheticHandoffManifestIntent(candidateInput(patch)),
        /synthetic_phase7_handoff_manifest_intent_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("every mutable bound reference, digest, count, and creation time changes the intent digest", async () => {
  const { vite, manifests } = await load();
  try {
    const baseline = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    const changes = [
      { eligibilityCandidateId: "synthetic-handoff-snapshot-two" },
      { eligibilityCandidateDigest: DIGEST_F },
      { handoffRequestId: "synthetic-handoff-request-two" },
      { handoffRequestDigest: DIGEST_F },
      { versionIntentId: "synthetic-handoff-version-six" },
      { versionIntentDigest: DIGEST_F },
      { profileConfigurationId: "synthetic-profile-configuration-two" },
      { profileConfigurationDigest: DIGEST_F },
      { exportDefinitionId: "synthetic-export-definition-v2" },
      { exportDefinitionDigest: DIGEST_F },
      { uniqueProspectCount: 2, eligibleContactRowCount: 2 },
      { eligibleContactRowCount: 3 },
      { exclusionCount: 4 },
      { exclusionLedgerDigest: DIGEST_A },
      { nonContactableReferenceCount: 2 },
      { nonContactableManifestDigest: DIGEST_A },
      { createdAt: NOW + 1 },
    ];
    for (const patch of changes) {
      const changed = await manifests.buildSyntheticHandoffManifestIntent(candidateInput(patch));
      assert.notEqual(changed.digest, baseline.digest, JSON.stringify(patch));
    }
  } finally {
    await vite.close();
  }
});

test("a completely current manifest intent projects only current synthetic intent with no authority", async () => {
  const { vite, manifests } = await load();
  try {
    const artifact = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    const decision = await manifests.evaluateSyntheticHandoffManifestIntent(decisionInput(artifact));
    assert.equal(decision.status, "synthetic_handoff_manifest_intent_current_no_authority");
    assert.equal(decision.candidateId, artifact.id);
    assert.equal(decision.candidateDigest, artifact.digest);
    assert.equal(decision.currentIntentClaimed, true);
    assert.equal(decision.manifestClaimed, false);
    assert.equal(decision.checksumClaimed, false);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.csvSerializationAuthorized, false);
    assert.equal(decision.deliveryAuthorized, false);
    assert.equal(decision.downloadAuthorized, false);
    assert.equal(decision.exportAuthorized, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("every current-authority failure rejects independently", async () => {
  const { vite, manifests } = await load();
  try {
    const artifact = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    const cases = [
      ["handoff_scope_not_current", { scopeCurrent: false }],
      ["handoff_eligibility_not_current", { eligibilityCurrent: false }],
      ["handoff_request_version_not_current", { requestVersionCurrent: false }],
      ["handoff_configuration_not_current", { configurationCurrent: false }],
      ["handoff_export_definition_not_current", { exportDefinitionCurrent: false }],
      ["handoff_counts_not_current", { countsCurrent: false }],
      ["handoff_exclusion_ledger_not_current", { exclusionLedgerCurrent: false }],
      ["handoff_non_contactable_manifest_not_current", { nonContactableManifestCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await manifests.evaluateSyntheticHandoffManifestIntent(decisionInput(artifact, {
        currentAuthority: authority(patch),
      }));
      assert.equal(decision.status, "synthetic_handoff_manifest_intent_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.currentIntentClaimed, false, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("any candidate drift rejects without claiming a current manifest intent", async () => {
  const { vite, manifests } = await load();
  try {
    const artifact = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    for (const currentCandidate of [
      candidateInput({ eligibilityCandidateDigest: DIGEST_F }),
      candidateInput({ handoffRequestDigest: DIGEST_F }),
      candidateInput({ versionIntentDigest: DIGEST_F }),
      candidateInput({ eligibleContactRowCount: 3 }),
      candidateInput({ nonContactableManifestDigest: DIGEST_A }),
    ]) {
      const decision = await manifests.evaluateSyntheticHandoffManifestIntent(decisionInput(artifact, {
        currentCandidate,
      }));
      assert.equal(decision.status, "synthetic_handoff_manifest_intent_rejected");
      assert.equal(decision.reasonCodes.includes("handoff_manifest_intent_changed"), true);
      assert.equal(decision.currentIntentClaimed, false);
    }
  } finally {
    await vite.close();
  }
});

test("evaluation before intent creation rejects without weakening time bounds", async () => {
  const { vite, manifests } = await load();
  try {
    const artifact = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    const decision = await manifests.evaluateSyntheticHandoffManifestIntent(decisionInput(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW - 1 }),
    }));
    assert.equal(decision.status, "synthetic_handoff_manifest_intent_rejected");
    assert.equal(decision.reasonCodes.includes("evaluation_precedes_handoff_manifest_intent"), true);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("a forged manifest intent cannot enter current-state evaluation", async () => {
  const { vite, manifests } = await load();
  try {
    const artifact = await manifests.buildSyntheticHandoffManifestIntent(candidateInput());
    await assert.rejects(
      manifests.evaluateSyntheticHandoffManifestIntent(decisionInput({ ...artifact })),
      /synthetic_phase7_handoff_manifest_intent_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("hostile shapes, raw values, bytes, rows, checksums, providers, and extras fail closed", async () => {
  const { vite, manifests } = await load();
  try {
    const accessor = Object.defineProperty(candidateInput(), "workspaceId", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    for (const value of [
      accessor,
      new Proxy(candidateInput(), { ownKeys() { throw new Error("must-not-run"); } }),
      { ...candidateInput(), email: "person@example.com" },
      { ...candidateInput(), phone: "+14165550123" },
      { ...candidateInput(), rows: [] },
      { ...candidateInput(), csvBytes: new Uint8Array() },
      { ...candidateInput(), checksum: DIGEST_A },
      { ...candidateInput(), providerHandle: "synthetic-provider" },
      { ...candidateInput(), createdAt: 0 },
      { ...candidateInput(), exclusionLedgerDigest: "not-a-digest" },
    ]) {
      await assert.rejects(
        manifests.buildSyntheticHandoffManifestIntent(value),
        /synthetic_phase7_handoff_manifest_intent_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("the public snapshot exposes only the bounded digest-and-count contract", async () => {
  const { vite, manifests } = await load();
  try {
    const artifact = await manifests.buildSyntheticHandoffManifestIntent(candidateInput({
      companyId: "synthetic-generic-organization",
      profileId: "synthetic-generic-market-profile",
    }));
    assert.deepEqual(Object.keys(artifact.snapshot), [
      "id", "workspaceId", "companyId", "profileId", "eligibilityCandidateId",
      "eligibilityCandidateDigest", "handoffRequestId", "handoffRequestDigest",
      "versionIntentId", "versionIntentDigest", "profileConfigurationId",
      "profileConfigurationDigest", "exportDefinitionId", "exportDefinitionDigest",
      "uniqueProspectCount", "eligibleContactRowCount", "exclusionCount",
      "exclusionLedgerDigest", "nonContactableReferenceCount",
      "nonContactableManifestDigest", "schemaVersion", "createdAt",
    ]);
    assert.equal(JSON.stringify(artifact).includes("person@"), false);
    assert.equal(JSON.stringify(artifact).includes("+1416"), false);
  } finally {
    await vite.close();
  }
});

test("a branded request candidate contributes only its synthetic ID and digest", async () => {
  const { vite, manifests } = await load();
  try {
    const requests = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-handoff-request-version.ts",
      import.meta.url,
    ).pathname);
    const request = await requests.buildSyntheticHandoffRequestCandidate({
      id: "synthetic-handoff-request",
      idempotencyKey: "synthetic-handoff-request-key",
      workspaceId: "synthetic-workspace",
      companyId: "synthetic-company",
      profileId: "synthetic-profile",
      eligibilityCandidateId: "synthetic-handoff-snapshot",
      eligibilityCandidateDigest: DIGEST_A,
      profileConfigurationId: "synthetic-profile-configuration",
      profileConfigurationDigest: DIGEST_D,
      exportDefinitionId: "synthetic-export-definition-v1",
      exportDefinitionDigest: DIGEST_E,
      requestedAt: NOW - 1,
    });
    const intent = await manifests.buildSyntheticHandoffManifestIntent(candidateInput({
      handoffRequestId: request.id,
      handoffRequestDigest: request.digest,
    }));
    assert.equal(intent.snapshot.handoffRequestId, request.id);
    assert.equal(intent.snapshot.handoffRequestDigest, request.digest);
    assert.equal(Object.hasOwn(intent.snapshot, "requestSnapshot"), false);
  } finally {
    await vite.close();
  }
});

test("the module has no runtime, persistence, bytes, checksum, provider, delivery, or export seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-handoff-manifest-intent.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
    "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(source.includes("manifestClaimed: false"), true);
  assert.equal(source.includes("checksumClaimed: false"), true);
  assert.equal(source.includes("historyMutationAuthorized: false"), true);
  assert.equal(source.includes("csvSerializationAuthorized: false"), true);
  assert.equal(source.includes("deliveryAuthorized: false"), true);
  assert.equal(source.includes("downloadAuthorized: false"), true);
  assert.equal(source.includes("exportAuthorized: false"), true);
  assert.equal(source.includes("providerInvocationAuthorized: false"), true);
});
