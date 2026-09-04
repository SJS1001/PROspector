import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_800_000_000_000;
const DIGEST = "a".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  packageMutations: 0,
  exportMutations: 0,
  callInvocations: 0,
  sendInvocations: 0,
  suppressionMutations: 0,
});

function envelope(patch = {}) {
  return {
    id: "observation-binding",
    workspaceId: "workspace-binding",
    contactId: "contact-binding",
    profileConfigurationId: "config-binding",
    profileConfigurationDigest: DIGEST,
    kind: "email",
    value: "contact@example.test",
    confidence: 0.75,
    provenance: {
      sourceReference: "source-original",
      excerpt: "original authoritative source excerpt",
      objectReference: "object-original",
      contentHash: "b".repeat(64),
      retrievedAt: NOW - 2_000,
    },
    observedAt: NOW - 1_000,
    lineage: { parentObservationId: null },
    ...patch,
  };
}

function request(raw) {
  return {
    assignmentId: "assignment-binding",
    prospectId: "prospect-binding",
    role: "economic_buyer",
    assignment: {
      workspaceId: "workspace-binding",
      contactId: "contact-binding",
      profileConfigurationId: "config-binding",
      profileConfigurationDigest: DIGEST,
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-binding",
      quoteRevision: 3,
    },
    envelope: raw,
  };
}

function assignment(patch = {}) {
  return {
    assignmentId: "assignment-binding",
    prospectId: "prospect-binding",
    role: "economic_buyer",
    quoteRevision: 3,
    workspaceId: "workspace-binding",
    contactId: "contact-binding",
    profileConfigurationId: "config-binding",
    profileConfigurationDigest: DIGEST,
    providerAuthority: {
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-binding",
    },
    ...patch,
  };
}

function verdict(raw) {
  return {
    observationId: raw.id,
    workspaceId: raw.workspaceId,
    contactId: raw.contactId,
    profileConfigurationId: raw.profileConfigurationId,
    profileConfigurationDigest: raw.profileConfigurationDigest,
    kind: raw.kind,
    normalizedValue: raw.value,
    contentHash: raw.provenance.contentHash,
    verificationClass: "source_verified",
    method: "authoritative_source_reconfirmed",
    verifiedAt: NOW - 1_500,
    providerId: "synthetic-provider",
    providerVersion: "v1",
    catalogRef: "catalog-binding",
    verdictReference: "verdict-binding",
    verdictDigest: "c".repeat(64),
  };
}

function eligibilityInput(observation) {
  return {
    target: { workspaceId: "workspace-binding", prospectId: "prospect-binding", contactId: "contact-binding" },
    points: observation ? [observation] : [],
    strategy: { configurationId: "config-binding", configurationDigest: DIGEST },
    authority: {
      prospectId: "prospect-binding",
      configurationId: "config-binding",
      configurationDigest: DIGEST,
      profileAvailable: true,
      configurationCurrent: true,
      drifted: false,
      disqualified: false,
      suppressed: false,
      phase4Approved: true,
      contactCapabilityEnabled: true,
    },
    now: NOW,
  };
}

test("verification rejects every cross-scope envelope before invoking the verifier", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const evidence = await vite.ssrLoadModule(
      new URL("../domain/contact-evidence.ts", import.meta.url).pathname,
    );
    let calls = 0;
    const verifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async (input) => {
        calls += 1;
        return verdict(input.envelope);
      },
    );
    for (const [name, patch] of [
      ["workspace", { workspaceId: "workspace-other" }],
      ["contact", { contactId: "contact-other" }],
      ["configuration", { profileConfigurationId: "config-other" }],
      ["configuration digest", { profileConfigurationDigest: "d".repeat(64) }],
    ]) {
      assert.equal(
        await evidence.executeContactVerification(verifier, request(envelope(patch))),
        null,
        name,
      );
    }
    assert.equal(
      await evidence.executeContactVerification(
        verifier,
        request(envelope({
          assignmentId: "assignment-other",
          prospectId: "prospect-binding",
        })),
      ),
      null,
      "envelope assignment identity must equal the request",
    );
    assert.equal(calls, 0, "cross-scope evidence never reaches trusted verification");
  } finally {
    await vite.close();
  }
});

test("a branded receipt cannot be transplanted across provenance, confidence, time, lineage, or authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const evidence = await vite.ssrLoadModule(
      new URL("../domain/contact-evidence.ts", import.meta.url).pathname,
    );
    const eligibility = await vite.ssrLoadModule(
      new URL("../domain/contact-eligibility.ts", import.meta.url).pathname,
    );
    const original = envelope();
    const verifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async (input) => verdict(input.envelope),
    );
    const receipt = await evidence.executeContactVerification(verifier, request(original));
    assert.ok(receipt);

    const exact = evidence.ingestContactEvidence(assignment(), original, receipt);
    assert.equal(exact.accepted, true, "the exact bound envelope remains valid");
    assert.equal(
      eligibility.projectContactEligibility(eligibilityInput(exact.observation)).state,
      "ContactReady",
    );

    const transplants = [
      ["source reference", envelope({
        provenance: { ...original.provenance, sourceReference: "source-transplanted" },
      })],
      ["excerpt", envelope({
        provenance: { ...original.provenance, excerpt: "transplanted source excerpt" },
      })],
      ["object reference", envelope({
        provenance: { ...original.provenance, objectReference: "object-transplanted" },
      })],
      ["confidence", envelope({ confidence: 0.99 })],
      ["observed time", envelope({ observedAt: NOW - 900 })],
      ["lineage", envelope({ lineage: { parentObservationId: "observation-parent-other" } })],
    ];
    for (const [name, transplanted] of transplants) {
      const result = evidence.ingestContactEvidence(assignment(), transplanted, receipt);
      assert.deepEqual(
        result,
        { accepted: false, reason: "invalid_verification_authority" },
        name,
      );
      const projection = eligibility.projectContactEligibility(eligibilityInput(null));
      assert.notEqual(projection.state, "ContactReady", name);
      assert.equal(projection.eligible, false, name);
      for (const helper of [
        eligibility.recheckForPackageApproval,
        eligibility.recheckForCrmExport,
        eligibility.recheckForClickToCall,
        eligibility.recheckForFinalSend,
      ]) {
        const recheck = helper(eligibilityInput(null));
        assert.equal(recheck.blocked, true, name);
        assert.equal(recheck.eligibility.eligible, false, name);
        assert.deepEqual(recheck.effectsBefore, ZERO_EFFECTS, name);
        assert.deepEqual(recheck.effectsAfter, ZERO_EFFECTS, name);
      }
    }

    assert.equal(
      evidence.ingestContactEvidence(assignment({
        providerAuthority: {
          providerId: "synthetic-provider-other",
          providerVersion: "v1",
          catalogRef: "catalog-binding",
        },
      }), original, receipt).accepted,
      false,
      "receipt authority cannot move to another provider assignment",
    );

    const callerOwned = envelope();
    const callerReceipt = await evidence.executeContactVerification(verifier, request(callerOwned));
    callerOwned.provenance.excerpt = "mutated after receipt issuance";
    assert.deepEqual(
      evidence.ingestContactEvidence(assignment(), callerOwned, callerReceipt),
      { accepted: false, reason: "invalid_verification_authority" },
      "post-issuance caller mutation invalidates the exact binding",
    );
  } finally {
    await vite.close();
  }
});
