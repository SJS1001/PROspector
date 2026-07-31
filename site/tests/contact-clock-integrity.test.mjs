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

async function loadModules(vite) {
  const evidence = await vite.ssrLoadModule(
    new URL("../domain/contact-evidence.ts", import.meta.url).pathname,
  );
  const eligibility = await vite.ssrLoadModule(
    new URL("../domain/contact-eligibility.ts", import.meta.url).pathname,
  );
  return [evidence, eligibility];
}

async function admittedObservation(evidence) {
  const assignment = {
    assignmentId: "assignment-synthetic",
    prospectId: "prospect-synthetic",
    role: "champion",
    quoteRevision: 1,
    workspaceId: "workspace-synthetic",
    contactId: "contact-synthetic",
    profileConfigurationId: "config-synthetic",
    profileConfigurationDigest: DIGEST,
    providerAuthority: {
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-synthetic",
    },
  };
  const envelope = {
    id: "observation-synthetic",
    workspaceId: assignment.workspaceId,
    contactId: assignment.contactId,
    profileConfigurationId: assignment.profileConfigurationId,
    profileConfigurationDigest: assignment.profileConfigurationDigest,
    kind: "email",
    value: "contact@example.test",
    confidence: 1,
    provenance: {
      sourceReference: "synthetic-source",
      excerpt: "synthetic published business address",
      objectReference: "synthetic-object",
      contentHash: "b".repeat(64),
      retrievedAt: NOW - 2_000,
    },
    observedAt: NOW - 1_000,
    lineage: { parentObservationId: null },
  };
  const verifier = evidence.bindContactEvidenceVerifier(
    { verifierId: "server-verifier", verifierVersion: "v1" },
    async () => ({
      observationId: envelope.id,
      workspaceId: assignment.workspaceId,
      contactId: assignment.contactId,
      profileConfigurationId: assignment.profileConfigurationId,
      profileConfigurationDigest: assignment.profileConfigurationDigest,
      kind: envelope.kind,
      normalizedValue: envelope.value,
      contentHash: envelope.provenance.contentHash,
      verificationClass: "mailbox_verified",
      method: "mailbox_verification",
      verifiedAt: NOW - 1_500,
      providerId: assignment.providerAuthority.providerId,
      providerVersion: assignment.providerAuthority.providerVersion,
      catalogRef: assignment.providerAuthority.catalogRef,
      verdictReference: "verdict-synthetic",
      verdictDigest: "c".repeat(64),
    }),
  );
  const receipt = await evidence.executeContactVerification(verifier, {
    assignmentId: "assignment-synthetic",
    prospectId: "prospect-synthetic",
    role: "champion",
    assignment: {
      workspaceId: assignment.workspaceId,
      contactId: assignment.contactId,
      profileConfigurationId: assignment.profileConfigurationId,
      profileConfigurationDigest: assignment.profileConfigurationDigest,
      providerId: assignment.providerAuthority.providerId,
      providerVersion: assignment.providerAuthority.providerVersion,
      catalogRef: assignment.providerAuthority.catalogRef,
      quoteRevision: 1,
    },
    envelope,
  });
  const ingested = evidence.ingestContactEvidence(assignment, envelope, receipt);
  assert.equal(ingested.accepted, true);
  return ingested.observation;
}

function eligibleInput(observation) {
  return {
    target: {
      workspaceId: "workspace-synthetic",
      prospectId: "prospect-synthetic",
      contactId: "contact-synthetic",
    },
    points: [observation],
    strategy: {
      configurationId: "config-synthetic",
      configurationDigest: DIGEST,
    },
    authority: {
      prospectId: "prospect-synthetic",
      configurationId: "config-synthetic",
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

function assertClockBlocked(eligibility, input, label) {
  const projection = eligibility.projectContactEligibility(input);
  assert.equal(projection.state, "NeedsReview", label);
  assert.equal(projection.eligible, false, label);
  assert.ok(projection.reasonCodes.includes("invalid_evaluation_time"), label);
  for (const recheck of [
    eligibility.recheckForPackageApproval(input),
    eligibility.recheckForCrmExport(input),
    eligibility.recheckForClickToCall(input),
    eligibility.recheckForFinalSend(input),
  ]) {
    assert.equal(recheck.blocked, true, label);
    assert.equal(recheck.eligibility.eligible, false, label);
    assert.deepEqual(recheck.effectsBefore, ZERO_EFFECTS, label);
    assert.deepEqual(recheck.effectsAfter, ZERO_EFFECTS, label);
  }
}

test("missing, malformed, nonpositive, fractional, unsafe, and proxy clocks fail closed", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [evidence, eligibility] = await loadModules(vite);
    const observation = await admittedObservation(evidence);
    const baseline = eligibleInput(observation);
    assert.equal(eligibility.projectContactEligibility(baseline).state, "ContactReady");

    const missing = { ...baseline };
    delete missing.now;
    const invalidClocks = [
      ["missing", missing],
      ["undefined", { ...baseline, now: undefined }],
      ["null", { ...baseline, now: null }],
      ["zero", { ...baseline, now: 0 }],
      ["negative", { ...baseline, now: -1 }],
      ["fractional", { ...baseline, now: NOW + 0.5 }],
      ["unsafe", { ...baseline, now: Number.MAX_SAFE_INTEGER + 1 }],
      ["NaN", { ...baseline, now: Number.NaN }],
      ["infinity", { ...baseline, now: Number.POSITIVE_INFINITY }],
      ["string", { ...baseline, now: String(NOW) }],
      ["proxy", { ...baseline, now: new Proxy(new Number(NOW), {}) }],
    ];
    for (const [label, input] of invalidClocks) {
      assertClockBlocked(eligibility, input, label);
    }
  } finally {
    await vite.close();
  }
});

test("clock accessors and hostile descriptor proxies fail closed without being evaluated", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [evidence, eligibility] = await loadModules(vite);
    const observation = await admittedObservation(evidence);
    const accessorInput = eligibleInput(observation);
    let getterCalls = 0;
    Object.defineProperty(accessorInput, "now", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return NOW;
      },
    });
    assertClockBlocked(eligibility, accessorInput, "accessor");
    assert.equal(getterCalls, 0, "clock getter must never run");

    const hostileProxy = new Proxy(eligibleInput(observation), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor trap");
      },
    });
    assertClockBlocked(eligibility, hostileProxy, "descriptor proxy");
  } finally {
    await vite.close();
  }
});
