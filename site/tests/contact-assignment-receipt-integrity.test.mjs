import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_800_000_000_000;
const DIGEST = "a".repeat(64);

test("a verification receipt is usable only by its exact committed assignment context", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [evidence, eligibility] = await Promise.all([
      vite.ssrLoadModule(new URL("../domain/contact-evidence.ts", import.meta.url).pathname),
      vite.ssrLoadModule(new URL("../domain/contact-eligibility.ts", import.meta.url).pathname),
    ]);
    const raw = envelope();
    const verifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async ({ envelope: verifiedEnvelope }) => verdict(verifiedEnvelope),
    );
    const receipt = await evidence.executeContactVerification(
      verifier,
      verificationRequest(raw),
    );
    assert.ok(receipt);

    const exact = evidence.ingestContactEvidence(committedAssignment(), raw, receipt);
    assert.equal(exact.accepted, true);
    assert.deepEqual(exact.observation.verificationAuthority, {
      assignmentId: "assignment-binding",
      prospectId: "prospect-binding",
      role: "economic_buyer",
      quoteRevision: 3,
      verifierId: "server-verifier",
      verifierVersion: "v1",
      verdictReference: "verdict-binding",
      verdictDigest: "c".repeat(64),
    });
    assert.deepEqual(exact.observation.assignmentContext, {
      assignmentId: "assignment-binding",
      prospectId: "prospect-binding",
      role: "economic_buyer",
      quoteRevision: 3,
    });
    assert.equal(
      eligibility.projectContactEligibility(eligibilityInput(exact.observation)).state,
      "ContactReady",
    );

    for (const [name, patch] of [
      ["assignment", { assignmentId: "assignment-other" }],
      ["prospect", { prospectId: "prospect-other" }],
      ["role", { role: "champion" }],
      ["quote revision", { quoteRevision: 4 }],
    ]) {
      const result = evidence.ingestContactEvidence(
        committedAssignment(patch),
        raw,
        receipt,
      );
      assert.deepEqual(
        result,
        { accepted: false, reason: "invalid_verification_authority" },
        name,
      );
      const projection = eligibility.projectContactEligibility(eligibilityInput(null));
      assert.equal(projection.eligible, false, name);
      assert.notEqual(projection.state, "ContactReady", name);
    }

    assert.deepEqual(
      evidence.ingestContactEvidence(baseAssignment(), raw, receipt),
      { accepted: false, reason: "invalid_verification_authority" },
      "a base contact scope cannot stand in for committed assignment authority",
    );
  } finally {
    await vite.close();
  }
});

function baseAssignment() {
  return {
    workspaceId: "workspace-binding",
    contactId: "contact-binding",
    profileConfigurationId: "config-binding",
    profileConfigurationDigest: DIGEST,
    providerAuthority: {
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-binding",
    },
  };
}

function committedAssignment(patch = {}) {
  return {
    assignmentId: "assignment-binding",
    prospectId: "prospect-binding",
    role: "economic_buyer",
    quoteRevision: 3,
    ...baseAssignment(),
    ...patch,
  };
}

function verificationRequest(raw) {
  const assignment = committedAssignment();
  return {
    assignmentId: assignment.assignmentId,
    prospectId: assignment.prospectId,
    role: assignment.role,
    assignment: {
      workspaceId: assignment.workspaceId,
      contactId: assignment.contactId,
      profileConfigurationId: assignment.profileConfigurationId,
      profileConfigurationDigest: assignment.profileConfigurationDigest,
      providerId: assignment.providerAuthority.providerId,
      providerVersion: assignment.providerAuthority.providerVersion,
      catalogRef: assignment.providerAuthority.catalogRef,
      quoteRevision: assignment.quoteRevision,
    },
    envelope: raw,
  };
}

function envelope() {
  return {
    id: "observation-binding",
    workspaceId: "workspace-binding",
    contactId: "contact-binding",
    profileConfigurationId: "config-binding",
    profileConfigurationDigest: DIGEST,
    kind: "email",
    value: "contact@example.test",
    confidence: 1,
    provenance: {
      sourceReference: "source-binding",
      excerpt: "synthetic business source",
      objectReference: "object-binding",
      contentHash: "b".repeat(64),
      retrievedAt: NOW - 2_000,
    },
    observedAt: NOW - 1_000,
    lineage: { parentObservationId: null },
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
    target: { workspaceId: "workspace-binding", contactId: "contact-binding" },
    points: observation ? [observation] : [],
    strategy: { configurationId: "config-binding", configurationDigest: DIGEST },
    authority: {
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
