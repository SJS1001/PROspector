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

async function modules(vite) {
  return Promise.all([
    vite.ssrLoadModule(new URL("../domain/contact-evidence.ts", import.meta.url).pathname),
    vite.ssrLoadModule(new URL("../domain/contact-eligibility.ts", import.meta.url).pathname),
  ]);
}

function envelope(patch = {}) {
  return {
    id: "observation-boundary",
    workspaceId: "workspace-boundary",
    contactId: "contact-boundary",
    profileConfigurationId: "config-boundary",
    profileConfigurationDigest: DIGEST,
    kind: "email",
    value: "contact@example.test",
    confidence: 1,
    provenance: {
      sourceReference: "source-boundary",
      excerpt: "synthetic business contact",
      objectReference: "object-boundary",
      contentHash: "b".repeat(64),
      retrievedAt: NOW - 2_000,
    },
    observedAt: NOW - 1_000,
    lineage: { parentObservationId: null },
    ...patch,
  };
}

function verificationRequest(raw = envelope()) {
  return {
    assignmentId: "assignment-boundary",
    prospectId: "prospect-boundary",
    role: "champion",
    assignment: {
      workspaceId: "workspace-boundary",
      contactId: "contact-boundary",
      profileConfigurationId: "config-boundary",
      profileConfigurationDigest: DIGEST,
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-boundary",
      quoteRevision: 1,
    },
    envelope: raw,
  };
}

function verdict(raw = envelope()) {
  return {
    observationId: raw.id,
    workspaceId: raw.workspaceId,
    contactId: raw.contactId,
    profileConfigurationId: raw.profileConfigurationId,
    profileConfigurationDigest: raw.profileConfigurationDigest,
    kind: raw.kind,
    normalizedValue: String(raw.value).trim().toLowerCase(),
    contentHash: raw.provenance.contentHash,
    verificationClass: "mailbox_verified",
    method: "mailbox_verification",
    verifiedAt: NOW - 1_500,
    providerId: "synthetic-provider",
    providerVersion: "v1",
    catalogRef: "catalog-boundary",
    verdictReference: "verdict-boundary",
    verdictDigest: "c".repeat(64),
  };
}

function assignment() {
  return {
    assignmentId: "assignment-boundary",
    prospectId: "prospect-boundary",
    role: "champion",
    quoteRevision: 1,
    workspaceId: "workspace-boundary",
    contactId: "contact-boundary",
    profileConfigurationId: "config-boundary",
    profileConfigurationDigest: DIGEST,
    providerAuthority: {
      providerId: "synthetic-provider",
      providerVersion: "v1",
      catalogRef: "catalog-boundary",
    },
  };
}

function authority() {
  return {
    profileAvailable: true,
    configurationCurrent: true,
    drifted: false,
    disqualified: false,
    suppressed: false,
    phase4Approved: true,
    contactCapabilityEnabled: true,
  };
}

test("verification attests one frozen request snapshot and rejects unsafe input without invoking the verifier", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [evidence] = await modules(vite);
    const liveEnvelope = envelope();
    let capturedRequest;
    let releaseVerdict;
    const verifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async (request) => {
        capturedRequest = request;
        return new Promise((resolve) => { releaseVerdict = resolve; });
      },
    );
    const pending = evidence.executeContactVerification(verifier, verificationRequest(liveEnvelope));
    await Promise.resolve();
    assert.equal(Object.isFrozen(capturedRequest), true);
    assert.equal(Object.isFrozen(capturedRequest.assignment), true);
    assert.equal(Object.isFrozen(capturedRequest.envelope), true);
    assert.equal(Object.isFrozen(capturedRequest.envelope.provenance), true);
    liveEnvelope.id = "observation-mutated";
    liveEnvelope.value = "mutated@example.test";
    liveEnvelope.provenance.contentHash = "d".repeat(64);
    releaseVerdict(verdict(liveEnvelope));
    assert.equal(await pending, null, "a post-await mutation cannot change what the frozen request attests");

    let verifierCalls = 0;
    const neverInvoked = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async () => {
        verifierCalls += 1;
        return verdict();
      },
    );
    let getterCalls = 0;
    const accessorRoot = verificationRequest();
    Object.defineProperty(accessorRoot, "assignmentId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "assignment-boundary";
      },
    });
    const accessorEnvelope = verificationRequest();
    Object.defineProperty(accessorEnvelope.envelope, "value", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "contact@example.test";
      },
    });
    const accessorAssignment = verificationRequest();
    Object.defineProperty(accessorAssignment.assignment, "workspaceId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "workspace-boundary";
      },
    });
    const symbolEnvelope = verificationRequest();
    symbolEnvelope.envelope[Symbol("hidden")] = true;
    const customProvenance = verificationRequest();
    customProvenance.envelope.provenance = Object.assign(
      Object.create({ inherited: true }),
      customProvenance.envelope.provenance,
    );
    const sparseLineage = verificationRequest();
    sparseLineage.envelope.lineage = Array(1);
    const cases = [
      ["root accessor", accessorRoot],
      ["assignment accessor", accessorAssignment],
      ["envelope accessor", accessorEnvelope],
      ["root proxy", new Proxy(verificationRequest(), {})],
      ["nested proxy", { ...verificationRequest(), envelope: new Proxy(envelope(), {}) }],
      ["root extra", { ...verificationRequest(), extra: true }],
      ["assignment extra", {
        ...verificationRequest(),
        assignment: { ...verificationRequest().assignment, extra: true },
      }],
      ["envelope extra", verificationRequest(envelope({ extra: true }))],
      ["symbol envelope", symbolEnvelope],
      ["custom provenance prototype", customProvenance],
      ["sparse nested array", sparseLineage],
    ];
    for (const [name, request] of cases) {
      assert.equal(await evidence.executeContactVerification(neverInvoked, request), null, name);
    }
    assert.equal(getterCalls, 0, "no public-input getter is evaluated");
    assert.equal(verifierCalls, 0, "malformed inputs issue no trusted verification work or receipt");

    const stableRaw = envelope();
    const validVerifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async (request) => verdict(request.envelope),
    );
    const receipt = await evidence.executeContactVerification(
      validVerifier,
      verificationRequest(stableRaw),
    );
    assert.ok(receipt, "valid evidence retains the verifier path");
    assert.equal(evidence.ingestContactEvidence(assignment(), stableRaw, receipt).accepted, true);
  } finally {
    await vite.close();
  }
});

test("eligibility deep-snapshots nested inputs and requires complete veto authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const [evidence, eligibility] = await modules(vite);
    const raw = envelope();
    const verifier = evidence.bindContactEvidenceVerifier(
      { verifierId: "server-verifier", verifierVersion: "v1" },
      async (request) => verdict(request.envelope),
    );
    const receipt = await evidence.executeContactVerification(verifier, verificationRequest(raw));
    const admitted = evidence.ingestContactEvidence(assignment(), raw, receipt);
    assert.equal(admitted.accepted, true);
    const baseline = {
      target: { workspaceId: "workspace-boundary", contactId: "contact-boundary" },
      points: [admitted.observation],
      strategy: { configurationId: "config-boundary", configurationDigest: DIGEST },
      authority: authority(),
      now: NOW,
    };
    assert.equal(eligibility.projectContactEligibility(baseline).state, "ContactReady");

    function assertContained(input, label, expectedReason) {
      const projection = eligibility.projectContactEligibility(input);
      assert.equal(projection.eligible, false, label);
      assert.notEqual(projection.state, "ContactReady", label);
      if (expectedReason) assert.ok(projection.reasonCodes.includes(expectedReason), label);
      for (const helper of [
        eligibility.recheckForPackageApproval,
        eligibility.recheckForCrmExport,
        eligibility.recheckForClickToCall,
        eligibility.recheckForFinalSend,
      ]) {
        const recheck = helper(input);
        assert.equal(recheck.blocked, true, label);
        assert.equal(recheck.eligibility.eligible, false, label);
        assert.deepEqual(recheck.effectsBefore, ZERO_EFFECTS, label);
        assert.deepEqual(recheck.effectsAfter, ZERO_EFFECTS, label);
      }
    }

    for (const key of Object.keys(authority())) {
      const incomplete = authority();
      delete incomplete[key];
      assertContained(
        { ...baseline, authority: incomplete },
        `missing authority ${key}`,
        "invalid_contact_authority",
      );
    }
    assertContained(
      { ...baseline, authority: { ...authority(), drifted: "false" } },
      "malformed veto boolean",
      "invalid_contact_authority",
    );

    let getterCalls = 0;
    const targetAccessor = { ...baseline, target: { ...baseline.target } };
    Object.defineProperty(targetAccessor.target, "workspaceId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "workspace-boundary";
      },
    });
    const strategyAccessor = { ...baseline, strategy: { ...baseline.strategy } };
    Object.defineProperty(strategyAccessor.strategy, "configurationDigest", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return DIGEST;
      },
    });
    const authorityAccessor = { ...baseline, authority: authority() };
    Object.defineProperty(authorityAccessor.authority, "suppressed", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return false;
      },
    });
    const sparsePoints = { ...baseline, points: Array(1) };
    const symbolAuthority = { ...baseline, authority: authority() };
    symbolAuthority.authority[Symbol("hidden")] = false;
    const variants = [
      ["target accessor", targetAccessor],
      ["strategy accessor", strategyAccessor],
      ["authority accessor", authorityAccessor],
      ["nested proxy", { ...baseline, authority: new Proxy(authority(), {}) }],
      ["points proxy", { ...baseline, points: new Proxy([admitted.observation], {}) }],
      ["sparse points", sparsePoints],
      ["root extra", { ...baseline, extra: true }],
      ["root symbol", { ...baseline, [Symbol("hidden")]: true }],
      ["authority symbol", symbolAuthority],
      ["custom target prototype", {
        ...baseline,
        target: Object.assign(Object.create({ inherited: true }), baseline.target),
      }],
    ];
    for (const [name, input] of variants) {
      assertContained(input, name, "invalid_contact_input");
    }
    assert.equal(getterCalls, 0, "nested eligibility getters are rejected without evaluation");

    for (const helper of [
      eligibility.recheckForPackageApproval,
      eligibility.recheckForCrmExport,
      eligibility.recheckForClickToCall,
      eligibility.recheckForFinalSend,
    ]) {
      const recheck = helper(baseline);
      assert.equal(recheck.blocked, true, "valid projection remains non-authorizing");
      assert.equal(recheck.eligibility.state, "ContactReady");
      assert.deepEqual(recheck.effectsAfter, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});
