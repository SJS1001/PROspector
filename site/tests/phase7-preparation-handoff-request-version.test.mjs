import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-09-02T14:30:00.000Z");
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
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
    const versions = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-handoff-request-version.ts",
      import.meta.url,
    ).pathname);
    return { vite, versions };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-handoff-request",
    idempotencyKey: "synthetic-handoff-request-key",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    profileId: "synthetic-profile",
    eligibilityCandidateId: "synthetic-handoff-snapshot",
    eligibilityCandidateDigest: DIGEST_A,
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: DIGEST_B,
    exportDefinitionId: "synthetic-export-definition-v1",
    exportDefinitionDigest: DIGEST_C,
    requestedAt: NOW,
    ...patch,
  };
}

function historyHead(patch = {}) {
  return {
    versionId: "synthetic-handoff-version-four",
    versionNumber: 4,
    versionDigest: DIGEST_D,
    createdAt: NOW - 2_000,
    ...patch,
  };
}

function existingRequest(artifact, patch = {}) {
  return {
    requestId: artifact.id,
    idempotencyKey: artifact.snapshot.idempotencyKey,
    requestDigest: artifact.digest,
    versionId: "synthetic-handoff-version-four",
    versionNumber: 4,
    versionDigest: DIGEST_D,
    createdAt: NOW + 1_000,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 2_000,
    scopeCurrent: true,
    eligibilityCurrent: true,
    configurationCurrent: true,
    exportDefinitionCurrent: true,
    externalEffectsDisabled: true,
    existingRequest: null,
    historyHead: null,
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

test("request candidates are deterministic, deeply frozen, synthetic, and zero-effect", async () => {
  const { vite, versions } = await load();
  try {
    const first = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    const second = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    assert.equal(first.digest, second.digest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(first.operationalRequestClaimed, false);
    assert.equal(first.phaseExecutionAuthorized, false);
    assert.equal(first.runtimeCompositionAuthorized, false);
    assert.equal(first.versionCreationAuthorized, false);
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

test("an empty history projects immutable version one without authorizing creation", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    const decision = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact));
    assert.equal(decision.status, "synthetic_handoff_version_required_no_authority");
    assert.equal(decision.wouldRequireNewImmutableVersion, true);
    assert.equal(decision.requiredVersionNumber, 1);
    assert.equal(decision.replayedVersion, null);
    assert.deepEqual(decision.reasonCodes, []);
    assert.equal(decision.versionCreationAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("a new request after a history head projects exactly the next version", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    const decision = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
      currentAuthority: authority({ historyHead: historyHead() }),
    }));
    assert.equal(decision.status, "synthetic_handoff_version_required_no_authority");
    assert.equal(decision.requiredVersionNumber, 5);
    assert.equal(decision.historyHeadDigest, DIGEST_D);
  } finally {
    await vite.close();
  }
});

test("an exact idempotency receipt replays the original immutable version", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    const receipt = existingRequest(artifact);
    const head = historyHead({ createdAt: receipt.createdAt });
    const decision = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
      currentAuthority: authority({ existingRequest: receipt, historyHead: head }),
    }));
    assert.equal(decision.status, "synthetic_handoff_version_replayed_no_authority");
    assert.equal(decision.wouldRequireNewImmutableVersion, false);
    assert.equal(decision.requiredVersionNumber, null);
    assert.deepEqual(decision.replayedVersion, {
      versionId: receipt.versionId,
      versionNumber: receipt.versionNumber,
      versionDigest: receipt.versionDigest,
    });
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("same idempotency key with any changed request semantics rejects as conflict", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    for (const patch of [
      { requestId: "synthetic-other-request" },
      { requestDigest: DIGEST_D },
      { idempotencyKey: "synthetic-other-key" },
    ]) {
      const receipt = existingRequest(artifact, patch);
      const decision = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
        currentAuthority: authority({
          existingRequest: receipt,
          historyHead: historyHead({ createdAt: receipt.createdAt }),
        }),
      }));
      assert.equal(decision.status, "synthetic_handoff_version_rejected");
      assert.equal(decision.reasonCodes.includes("handoff_idempotency_conflict"), true);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("changed eligibility with a new request identity projects a new immutable version", async () => {
  const { vite, versions } = await load();
  try {
    const changed = candidateInput({
      id: "synthetic-handoff-request-two",
      idempotencyKey: "synthetic-handoff-request-key-two",
      eligibilityCandidateId: "synthetic-handoff-snapshot-two",
      eligibilityCandidateDigest: DIGEST_D,
      requestedAt: NOW + 1_000,
    });
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(changed);
    const decision = await versions.evaluateSyntheticHandoffRequestVersion({
      candidate: artifact,
      currentCandidate: changed,
      currentAuthority: authority({ evaluatedAt: NOW + 3_000, historyHead: historyHead() }),
    });
    assert.equal(decision.status, "synthetic_handoff_version_required_no_authority");
    assert.equal(decision.requiredVersionNumber, 5);
    assert.deepEqual(decision.reasonCodes, []);
  } finally {
    await vite.close();
  }
});

test("candidate or request-definition drift rejects without a version projection", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    for (const currentCandidate of [
      candidateInput({ eligibilityCandidateDigest: DIGEST_D }),
      candidateInput({ profileConfigurationDigest: DIGEST_D }),
      candidateInput({ exportDefinitionDigest: DIGEST_D }),
    ]) {
      const decision = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
        currentCandidate,
      }));
      assert.equal(decision.status, "synthetic_handoff_version_rejected");
      assert.equal(decision.reasonCodes.includes("handoff_request_candidate_changed"), true);
      assert.equal(decision.requiredVersionNumber, null);
    }
  } finally {
    await vite.close();
  }
});

test("every current-authority failure rejects independently", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    const cases = [
      ["handoff_scope_not_current", { scopeCurrent: false }],
      ["handoff_eligibility_not_current", { eligibilityCurrent: false }],
      ["handoff_configuration_not_current", { configurationCurrent: false }],
      ["handoff_export_definition_not_current", { exportDefinitionCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
      ["evaluation_precedes_handoff_request", { evaluatedAt: NOW - 1 }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
        currentAuthority: authority(patch),
      }));
      assert.equal(decision.status, "synthetic_handoff_version_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("history and receipt consistency failures reject rather than rewriting history", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    const receipt = existingRequest(artifact);
    const cases = [
      ["handoff_history_head_missing", null, receipt],
      ["handoff_history_precedes_replay", historyHead({ versionNumber: 3 }), receipt],
      ["handoff_history_head_conflict", historyHead({ versionDigest: DIGEST_A, createdAt: receipt.createdAt }), receipt],
      ["handoff_receipt_precedes_request", historyHead(), existingRequest(artifact, { createdAt: NOW - 1 })],
      ["handoff_receipt_from_future", historyHead({ createdAt: NOW + 3_000 }), existingRequest(artifact, { createdAt: NOW + 3_000 })],
    ];
    for (const [reason, head, existing] of cases) {
      const decision = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
        currentAuthority: authority({ existingRequest: existing, historyHead: head }),
      }));
      assert.equal(decision.status, "synthetic_handoff_version_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.wouldRequireNewImmutableVersion, false);
    }
  } finally {
    await vite.close();
  }
});

test("version numbers and chronology are bounded before projection", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    for (const currentAuthority of [
      authority({ historyHead: historyHead({ versionNumber: 0 }) }),
      authority({ historyHead: historyHead({ versionNumber: 1_000_000_001 }) }),
      authority({
        existingRequest: existingRequest(artifact, { versionNumber: 0 }),
        historyHead: historyHead(),
      }),
    ]) {
      await assert.rejects(
        versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, { currentAuthority })),
        /synthetic_phase7_handoff_request_version_decision_invalid/,
      );
    }
    const future = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
      currentAuthority: authority({ historyHead: historyHead({ createdAt: NOW + 3_000 }) }),
    }));
    assert.equal(future.status, "synthetic_handoff_version_rejected");
    assert.equal(future.reasonCodes.includes("handoff_history_from_future"), true);
    const exhausted = await versions.evaluateSyntheticHandoffRequestVersion(decisionInput(artifact, {
      currentAuthority: authority({ historyHead: historyHead({ versionNumber: 1_000_000_000 }) }),
    }));
    assert.equal(exhausted.status, "synthetic_handoff_version_rejected");
    assert.equal(exhausted.reasonCodes.includes("handoff_version_space_exhausted"), true);
  } finally {
    await vite.close();
  }
});

test("hostile shapes, raw values, sparse data, accessors, proxies, and extras fail closed", async () => {
  const { vite, versions } = await load();
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
      { ...candidateInput(), csvRows: [] },
      { ...candidateInput(), bytes: new Uint8Array() },
      { ...candidateInput(), providerPayload: {} },
      { ...candidateInput(), requestedAt: 0 },
      { ...candidateInput(), eligibilityCandidateDigest: "not-a-digest" },
    ]) {
      await assert.rejects(
        versions.buildSyntheticHandoffRequestCandidate(value),
        /synthetic_phase7_handoff_request_candidate_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("a forged request artifact cannot enter version evaluation", async () => {
  const { vite, versions } = await load();
  try {
    const artifact = await versions.buildSyntheticHandoffRequestCandidate(candidateInput());
    await assert.rejects(
      versions.evaluateSyntheticHandoffRequestVersion(decisionInput({ ...artifact })),
      /synthetic_phase7_handoff_request_version_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("the module has no runtime, persistence, bytes, provider, delivery, or export seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-handoff-request-version.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
    "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(source.includes("operationalRequestClaimed: false"), true);
  assert.equal(source.includes("versionCreationAuthorized: false"), true);
  assert.equal(source.includes("csvSerializationAuthorized: false"), true);
  assert.equal(source.includes("deliveryAuthorized: false"), true);
  assert.equal(source.includes("downloadAuthorized: false"), true);
  assert.equal(source.includes("exportAuthorized: false"), true);
  assert.equal(source.includes("runtimeCompositionAuthorized: false"), true);
});
