import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-08-28T16:00:00.000Z");
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  exportMutations: 0,
  csvSerializations: 0,
  deliveryInvocations: 0,
  durableMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const handoff = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-handoff-eligibility.ts",
      import.meta.url,
    ).pathname);
    return { vite, handoff };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function prospect(id = "synthetic-prospect-one", patch = {}) {
  return {
    id,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    profileId: "synthetic-profile",
    qualificationDigest: DIGEST_A,
    status: "export_ready",
    packageId: `synthetic-package-${id.slice("synthetic-prospect-".length)}`,
    packageDigest: DIGEST_B,
    packageApprovalId: `synthetic-approval-${id.slice("synthetic-prospect-".length)}`,
    packageApprovalDigest: DIGEST_C,
    packageApprovalExpiresAt: NOW + 60_000,
    packageCurrent: true,
    packageApproved: true,
    configurationCurrent: true,
    disqualified: false,
    highRiskDrift: false,
    deleted: false,
    ...patch,
  };
}

function point(id = "synthetic-point-one", prospectId = "synthetic-prospect-one", patch = {}) {
  const suffix = id.slice("synthetic-point-".length);
  return {
    id,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    profileId: "synthetic-profile",
    prospectId,
    contactId: `synthetic-contact-${suffix}`,
    identityDigest: DIGEST_A,
    kind: "email",
    verificationClass: "mailbox_verified",
    verificationMethodDigest: DIGEST_B,
    verificationEvidenceDigest: DIGEST_C,
    verifiedAt: NOW - 60_000,
    freshUntil: NOW + 60_000,
    identityCurrent: true,
    suppressionMatchRefIds: [],
    ...patch,
  };
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-handoff-snapshot",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    productId: "synthetic-product",
    marketPlayId: "synthetic-market-play",
    profileId: "synthetic-profile",
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: DIGEST_A,
    evaluatedAt: NOW,
    prospects: [prospect()],
    contactPoints: [point()],
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW,
    scopeCurrent: true,
    upstreamProjectionsCurrent: true,
    packageAuthorityCurrent: true,
    identityAuthorityCurrent: true,
    verificationAuthorityCurrent: true,
    suppressionAuthorityCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

function evaluationInput(candidate, patch = {}) {
  return {
    candidate,
    currentCandidate: candidateInput(),
    currentAuthority: authority(),
    ...patch,
  };
}

test("builds a deterministic frozen snapshot with literal zero authority and effects", async () => {
  const { vite, handoff } = await load();
  try {
    const first = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput());
    const second = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput());
    assert.equal(first.digest, second.digest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.projection.includedRows), true);
    assert.equal(first.operationalHandoffClaimed, false);
    assert.equal(first.phaseExecutionAuthorized, false);
    assert.equal(first.runtimeCompositionAuthorized, false);
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.csvSerializationAuthorized, false);
    assert.equal(first.deliveryAuthorized, false);
    assert.equal(first.exportAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("counts unique Prospects separately from eligible contact rows", async () => {
  const { vite, handoff } = await load();
  try {
    const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
      contactPoints: [point("synthetic-point-two"), point("synthetic-point-one")],
    }));
    assert.equal(artifact.projection.uniqueProspectCount, 1);
    assert.equal(artifact.projection.eligibleContactRowCount, 2);
    assert.deepEqual(
      artifact.projection.includedRows.map((row) => [row.prospectId, row.contactPointId]),
      [
        ["synthetic-prospect-one", "synthetic-point-one"],
        ["synthetic-prospect-one", "synthetic-point-two"],
      ],
    );
  } finally {
    await vite.close();
  }
});

test("deduplicates only stable Prospect plus contact-point identity", async () => {
  const { vite, handoff } = await load();
  try {
    const duplicate = point();
    const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
      contactPoints: [duplicate, { ...duplicate }],
    }));
    assert.equal(artifact.projection.eligibleContactRowCount, 1);
    assert.deepEqual(artifact.projection.exclusions, [{
      prospectId: "synthetic-prospect-one",
      contactId: "synthetic-contact-one",
      contactPointId: "synthetic-point-one",
      reasonCodes: ["duplicate_contact_point"],
    }]);
    await assert.rejects(
      handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
        contactPoints: [duplicate, { ...duplicate, verificationEvidenceDigest: DIGEST_A }],
      })),
      /synthetic_phase7_handoff_eligibility_candidate_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("every stale or revoked upstream prospect predicate excludes independently", async () => {
  const { vite, handoff } = await load();
  try {
    const cases = [
      ["scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["prospect_not_export_ready", { status: "needs_review" }],
      ["package_not_current", { packageCurrent: false }],
      ["package_not_approved", { packageApproved: false }],
      ["package_approval_expired", { packageApprovalExpiresAt: NOW }],
      ["configuration_not_current", { configurationCurrent: false }],
      ["prospect_disqualified", { disqualified: true }],
      ["high_risk_drift", { highRiskDrift: true }],
      ["prospect_deleted", { deleted: true }],
    ];
    for (const [reason, patch] of cases) {
      const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
        prospects: [prospect("synthetic-prospect-one", patch)],
      }));
      assert.equal(artifact.projection.eligibleContactRowCount, 0, reason);
      assert.equal(artifact.projection.exclusions[0].reasonCodes.includes(reason), true, reason);
    }
  } finally {
    await vite.close();
  }
});

test("contact identity, verification class, freshness, and suppression all fail closed", async () => {
  const { vite, handoff } = await load();
  try {
    const cases = [
      ["scope_mismatch", { companyId: "synthetic-other-company" }],
      ["identity_not_current", { identityCurrent: false }],
      ["verification_not_eligible", { verificationClass: "generated" }],
      ["verification_not_eligible", { verificationClass: "mx_only" }],
      ["verification_stale", { freshUntil: NOW }],
      ["suppressed", { suppressionMatchRefIds: ["synthetic-suppression-exact"] }],
    ];
    for (const [reason, patch] of cases) {
      const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
        contactPoints: [point("synthetic-point-one", "synthetic-prospect-one", patch)],
      }));
      assert.equal(artifact.projection.eligibleContactRowCount, 0, reason);
      assert.equal(artifact.projection.exclusions[0].reasonCodes.includes(reason), true, reason);
    }
  } finally {
    await vite.close();
  }
});

test("suppressed contact points appear only as non-contactable synthetic references", async () => {
  const { vite, handoff } = await load();
  try {
    const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
      contactPoints: [point("synthetic-point-one", "synthetic-prospect-one", {
        suppressionMatchRefIds: [
          "synthetic-suppression-domain",
          "synthetic-suppression-contact",
          "synthetic-suppression-company",
        ],
      })],
    }));
    assert.deepEqual(artifact.projection.includedRows, []);
    assert.deepEqual(artifact.projection.nonContactableManifestRefs, [{
      prospectId: "synthetic-prospect-one",
      contactId: "synthetic-contact-one",
      contactPointId: "synthetic-point-one",
      suppressionMatchRefIds: [
        "synthetic-suppression-company",
        "synthetic-suppression-contact",
        "synthetic-suppression-domain",
      ],
      reason: "suppressed_non_contactable",
    }]);
  } finally {
    await vite.close();
  }
});

test("mailbox-verified and source-verified are the only eligible classes", async () => {
  const { vite, handoff } = await load();
  try {
    const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
      contactPoints: [
        point("synthetic-point-email", "synthetic-prospect-one", { verificationClass: "mailbox_verified" }),
        point("synthetic-point-phone", "synthetic-prospect-one", {
          kind: "phone",
          verificationClass: "source_verified",
        }),
      ],
    }));
    assert.equal(artifact.projection.eligibleContactRowCount, 2);
    assert.deepEqual(artifact.projection.includedRows.map((row) => row.verificationClass), [
      "mailbox_verified",
      "source_verified",
    ]);
  } finally {
    await vite.close();
  }
});

test("generic company and market labels never control eligibility", async () => {
  const { vite, handoff } = await load();
  try {
    const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput({
      companyId: "synthetic-marine-company",
      productId: "synthetic-vessel-product",
      marketPlayId: "synthetic-marine-market-play",
      prospects: [prospect("synthetic-prospect-one", { companyId: "synthetic-marine-company" })],
      contactPoints: [point("synthetic-point-one", "synthetic-prospect-one", {
        companyId: "synthetic-marine-company",
      })],
    }));
    assert.equal(artifact.projection.uniqueProspectCount, 1);
    assert.equal(artifact.projection.eligibleContactRowCount, 1);
  } finally {
    await vite.close();
  }
});

test("every current-authority drift reason rejects with zero effects", async () => {
  const { vite, handoff } = await load();
  try {
    const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput());
    const cases = [
      ["handoff_scope_not_current", { scopeCurrent: false }],
      ["handoff_upstream_projections_not_current", { upstreamProjectionsCurrent: false }],
      ["handoff_package_authority_not_current", { packageAuthorityCurrent: false }],
      ["handoff_identity_authority_not_current", { identityAuthorityCurrent: false }],
      ["handoff_verification_authority_not_current", { verificationAuthorityCurrent: false }],
      ["handoff_suppression_authority_not_current", { suppressionAuthorityCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await handoff.evaluateSyntheticHandoffEligibilityCandidate(evaluationInput(
        artifact,
        { currentAuthority: authority(patch) },
      ));
      assert.equal(decision.status, "synthetic_handoff_eligibility_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.exportAuthorized, false);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("candidate drift, time regression, and forged artifacts fail closed", async () => {
  const { vite, handoff } = await load();
  try {
    const artifact = await handoff.buildSyntheticHandoffEligibilityCandidate(candidateInput());
    const changed = await handoff.evaluateSyntheticHandoffEligibilityCandidate(evaluationInput(artifact, {
      currentCandidate: candidateInput({ contactPoints: [] }),
    }));
    assert.equal(changed.reasonCodes.includes("handoff_candidate_changed"), true);
    const early = await handoff.evaluateSyntheticHandoffEligibilityCandidate(evaluationInput(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW - 1 }),
    }));
    assert.equal(early.reasonCodes.includes("evaluation_precedes_handoff_candidate"), true);
    await assert.rejects(
      handoff.evaluateSyntheticHandoffEligibilityCandidate(evaluationInput({ ...artifact })),
      /synthetic_phase7_handoff_eligibility_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("hostile, raw-identity, sparse, accessor, proxy, and extra shapes fail closed", async () => {
  const { vite, handoff } = await load();
  try {
    const accessor = Object.defineProperty(candidateInput(), "workspaceId", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const sparse = candidateInput();
    sparse.contactPoints = [, point()];
    for (const value of [
      accessor,
      new Proxy(candidateInput(), { ownKeys() { throw new Error("must-not-run"); } }),
      sparse,
      { ...candidateInput(), email: "person@example.com" },
      { ...candidateInput(), phone: "+14165550123" },
      { ...candidateInput(), csvBytes: "" },
      { ...candidateInput(), providerPayload: {} },
      { ...candidateInput(), evaluatedAt: 0 },
      { ...candidateInput(), contactPoints: [point("synthetic-point-one", "synthetic-prospect-one", { verifiedAt: NOW + 1 })] },
    ]) {
      await assert.rejects(
        handoff.buildSyntheticHandoffEligibilityCandidate(value),
        /synthetic_phase7_handoff_eligibility_candidate_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("the module has no runtime, persistence, CSV, provider, delivery, or effect seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-handoff-eligibility.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
    "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(source.includes("operationalHandoffClaimed: false"), true);
  assert.equal(source.includes("csvSerializationAuthorized: false"), true);
  assert.equal(source.includes("deliveryAuthorized: false"), true);
  assert.equal(source.includes("exportAuthorized: false"), true);
  assert.equal(source.includes("runtimeCompositionAuthorized: false"), true);
});
