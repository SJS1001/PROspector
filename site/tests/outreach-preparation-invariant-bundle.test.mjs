import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_001_100_000;
const DIGESTS = [..."123456789abc"].map((value) => value.repeat(64));
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});
const KINDS = Object.freeze([
  "package_artifact",
  "message_artifact",
  "approval_suppression",
  "dispatch_recheck",
  "originated_stop",
  "delivery_unknown",
  "suppression_before_success",
  "manual_call",
  "audit_append",
  "identity_resolution",
  "identity_receipts",
  "suppression_retention",
]);
const STATUSES = Object.freeze({
  package_artifact: "synthetic_outreach_package_artifact",
  message_artifact: "synthetic_outreach_message_artifact",
  approval_suppression: "synthetic_outreach_preparation_projection",
  dispatch_recheck: "synthetic_recheck_passed_no_authority",
  originated_stop: "synthetic_stop_classified_no_authority",
  delivery_unknown: "synthetic_reconciliation_classified_no_authority",
  suppression_before_success: "synthetic_suppression_commit_required_no_authority",
  manual_call: "synthetic_manual_call_outcome_commit_required_no_authority",
  audit_append: "synthetic_audit_append_required_no_authority",
  identity_resolution: "synthetic_suppression_identity_resolution_projected_no_authority",
  identity_receipts: "synthetic_suppression_identity_atomic_commit_required_no_authority",
  suppression_retention: "synthetic_suppression_retention_manifest_required_no_authority",
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      bundle: await vite.ssrLoadModule(new URL(
        "../preparation/outreach-invariant-bundle.ts",
        import.meta.url,
      ).pathname),
      artifacts: await vite.ssrLoadModule(new URL("../preparation/outreach-artifacts.ts", import.meta.url).pathname),
      resolution: await vite.ssrLoadModule(new URL(
        "../preparation/suppression-identity-resolution.ts",
        import.meta.url,
      ).pathname),
      receipts: await vite.ssrLoadModule(new URL(
        "../preparation/suppression-identity-receipts.ts",
        import.meta.url,
      ).pathname),
      retention: await vite.ssrLoadModule(new URL(
        "../preparation/suppression-retention-manifest.ts",
        import.meta.url,
      ).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function nodes(digests = DIGESTS, subjectIds = {}) {
  const dependencies = [
    [],
    [digests[0]],
    [digests[0], digests[1]],
    [digests[0], digests[1], digests[2]],
    [digests[3]],
    [digests[1], digests[3]],
    [digests[1], digests[2]],
    [digests[0], digests[2]],
    [digests[2], digests[3], digests[4], digests[5], digests[6], digests[7]],
    [digests[2]],
    [digests[9]],
    [digests[10]],
  ];
  return KINDS.map((kind, index) => ({
    kind,
    id: `synthetic-invariant-${kind.replaceAll("_", "-")}`,
    digest: digests[index],
    subjectId: subjectIds[kind] ?? `synthetic-${kind.replaceAll("_", "-")}`,
    subjectDigest: digests[index],
    status: STATUSES[kind],
    dependencyDigests: dependencies[index],
  }));
}

function bundleInput(patch = {}) {
  return {
    id: "synthetic-outreach-invariant-bundle",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: "d".repeat(64),
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    nodes: nodes(),
    createdAt: NOW,
    completedAt: NOW + 100,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 200,
    scopeCurrent: true,
    artifactsCurrent: true,
    approvalsCurrent: true,
    dispatchCurrent: true,
    stopStateCurrent: true,
    deliveryStateCurrent: true,
    suppressionStateCurrent: true,
    manualCallStateCurrent: true,
    auditStateCurrent: true,
    identityStateCurrent: true,
    receiptStateCurrent: true,
    retentionStateCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

function evaluationInput(artifact, patch = {}) {
  return {
    bundleArtifact: artifact,
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

test("invariant bundles are deterministic, deeply frozen, digest-only, and zero-effect", async () => {
  const { vite, bundle } = await load();
  try {
    const first = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput());
    const reordered = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput({
      nodes: [...nodes()].reverse().map((entry) => ({
        ...entry,
        dependencyDigests: [...entry.dependencyDigests].reverse(),
      })),
    }));
    assert.equal(first.digest, reordered.digest);
    assert.equal(first.kind, "synthetic_outreach_invariant_bundle");
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.snapshot.nodes), true);
    assert.equal(Object.isFrozen(first.snapshot.nodes[0]), true);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    for (const field of [
      "phaseExecutionAuthorized", "runtimeCompositionAuthorized", "persistenceAuthorized",
      "exportAuthorized", "archiveAuthorized", "restoreAuthorized", "providerInvocationAuthorized",
    ]) assert.equal(first[field], false, field);
  } finally {
    await vite.close();
  }
});

test("the complete canonical DAG binds every preparation branch without claiming occurrence", async () => {
  const { vite, bundle } = await load();
  try {
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput());
    assert.deepEqual(artifact.snapshot.nodes.map((entry) => entry.kind), KINDS);
    assert.deepEqual(artifact.graph.roots, [DIGESTS[0]]);
    assert.deepEqual(artifact.graph.terminalDigests, [DIGESTS[8], DIGESTS[11]]);
    assert.deepEqual(artifact.graph.branches, {
      emailDispatch: [DIGESTS[3], DIGESTS[5]],
      stopAndSuppression: [DIGESTS[4], DIGESTS[6]],
      manualCall: [DIGESTS[7]],
      identityAndRetention: [DIGESTS[9], DIGESTS[10], DIGESTS[11]],
    });
    assert.equal(artifact.graph.simultaneousOccurrenceClaimed, false);
    assert.equal(artifact.graph.runtimeReachable, false);
  } finally {
    await vite.close();
  }
});

test("a complete current tuple projects compatibility but no phase, runtime, or effect authority", async () => {
  const { vite, bundle } = await load();
  try {
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput());
    const decision = await bundle.evaluateSyntheticOutreachInvariantBundle(evaluationInput(artifact));
    assert.equal(decision.status, "synthetic_outreach_invariants_current_no_authority");
    assert.deepEqual(decision.reasonCodes, []);
    assert.equal(decision.bundleId, artifact.id);
    assert.equal(decision.bundleDigest, artifact.digest);
    assert.deepEqual(decision.nodeDigests, DIGESTS);
    assert.equal(decision.simultaneousOccurrenceClaimed, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    for (const field of [
      "phaseExecutionAuthorized", "runtimeCompositionAuthorized", "persistenceAuthorized",
      "exportAuthorized", "archiveAuthorized", "restoreAuthorized", "providerInvocationAuthorized",
    ]) assert.equal(decision[field], false, field);
  } finally {
    await vite.close();
  }
});

test("every current-authority failure rejects independently", async () => {
  const { vite, bundle } = await load();
  try {
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput());
    const cases = [
      ["invariant_scope_not_current", { scopeCurrent: false }],
      ["invariant_artifacts_not_current", { artifactsCurrent: false }],
      ["invariant_approvals_not_current", { approvalsCurrent: false }],
      ["invariant_dispatch_not_current", { dispatchCurrent: false }],
      ["invariant_stop_state_not_current", { stopStateCurrent: false }],
      ["invariant_delivery_state_not_current", { deliveryStateCurrent: false }],
      ["invariant_suppression_state_not_current", { suppressionStateCurrent: false }],
      ["invariant_manual_call_state_not_current", { manualCallStateCurrent: false }],
      ["invariant_audit_state_not_current", { auditStateCurrent: false }],
      ["invariant_identity_state_not_current", { identityStateCurrent: false }],
      ["invariant_receipt_state_not_current", { receiptStateCurrent: false }],
      ["invariant_retention_state_not_current", { retentionStateCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await bundle.evaluateSyntheticOutreachInvariantBundle(evaluationInput(artifact, {
        currentAuthority: authority(patch),
      }));
      assert.equal(decision.status, "synthetic_outreach_invariants_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("any current scope, artifact, subject, or dependency change invalidates the bundle", async () => {
  const { vite, bundle } = await load();
  try {
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput());
    const changed = [
      bundleInput({ profileConfigurationDigest: "e".repeat(64) }),
      bundleInput({ prospectId: "synthetic-other-prospect" }),
      replaceNode(bundleInput(), "dispatch_recheck", { subjectId: "synthetic-other-dispatch" }),
      replaceNode(bundleInput(), "dispatch_recheck", { subjectDigest: "e".repeat(64) }),
    ];
    for (const currentBundle of changed) {
      const decision = await bundle.evaluateSyntheticOutreachInvariantBundle(evaluationInput(artifact, { currentBundle }));
      assert.equal(decision.status, "synthetic_outreach_invariants_rejected");
      assert.equal(decision.reasonCodes.includes("invariant_bundle_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("missing, duplicate, extra, wrong-kind, wrong-status, and cross-branch dependency sets reject", async () => {
  const { vite, bundle } = await load();
  try {
    const base = bundleInput();
    const invalid = [
      { ...base, nodes: base.nodes.slice(1) },
      { ...base, nodes: [...base.nodes, base.nodes[0]] },
      { ...base, nodes: base.nodes.map((entry, index) => index === 1 ? { ...entry, kind: "package_artifact" } : entry) },
      replaceNode(base, "dispatch_recheck", { status: "synthetic_recheck_rejected" }),
      replaceNode(base, "dispatch_recheck", { dependencyDigests: [DIGESTS[0], DIGESTS[1]] }),
      replaceNode(base, "manual_call", { dependencyDigests: [DIGESTS[3]] }),
      replaceNode(base, "suppression_retention", { dependencyDigests: [DIGESTS[3], DIGESTS[10]] }),
    ];
    for (const value of invalid) {
      await assert.rejects(
        bundle.buildSyntheticOutreachInvariantBundle(value),
        /synthetic_outreach_invariant_bundle_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("duplicate node identities or digests cannot collapse independent boundaries", async () => {
  const { vite, bundle } = await load();
  try {
    const base = bundleInput();
    for (const patch of [
      { id: base.nodes[0].id },
      { digest: base.nodes[0].digest },
    ]) {
      await assert.rejects(
        bundle.buildSyntheticOutreachInvariantBundle(replaceNode(base, "message_artifact", patch)),
        /synthetic_outreach_invariant_bundle_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("separate invariant nodes may intentionally share one subject reference", async () => {
  const { vite, bundle } = await load();
  try {
    const manual = bundleInput().nodes.find((entry) => entry.kind === "manual_call");
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(replaceNode(
      bundleInput(),
      "audit_append",
      { subjectId: manual.subjectId, subjectDigest: manual.subjectDigest },
    ));
    const audit = artifact.snapshot.nodes.find((entry) => entry.kind === "audit_append");
    assert.equal(audit.subjectId, manual.subjectId);
    assert.equal(audit.subjectDigest, manual.subjectDigest);
    assert.notEqual(audit.id, manual.id);
    assert.notEqual(audit.digest, manual.digest);
  } finally {
    await vite.close();
  }
});

test("time boundaries are exact and evaluation before completion rejects", async () => {
  const { vite, bundle } = await load();
  try {
    await assert.rejects(
      bundle.buildSyntheticOutreachInvariantBundle(bundleInput({ completedAt: NOW - 1 })),
      /synthetic_outreach_invariant_bundle_invalid/,
    );
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput());
    const before = await bundle.evaluateSyntheticOutreachInvariantBundle(evaluationInput(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW + 99 }),
    }));
    const at = await bundle.evaluateSyntheticOutreachInvariantBundle(evaluationInput(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW + 100 }),
    }));
    assert.equal(before.reasonCodes.includes("evaluation_precedes_invariant_completion"), true);
    assert.equal(at.status, "synthetic_outreach_invariants_current_no_authority");
  } finally {
    await vite.close();
  }
});

test("a forged artifact copy cannot enter evaluation", async () => {
  const { vite, bundle } = await load();
  try {
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput());
    await assert.rejects(
      bundle.evaluateSyntheticOutreachInvariantBundle(evaluationInput({ ...artifact })),
      /synthetic_outreach_invariant_bundle_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("hostile shapes, raw values, sparse arrays, accessors, proxies, and extras fail closed", async () => {
  const { vite, bundle } = await load();
  try {
    const accessor = Object.defineProperty(bundleInput(), "companyId", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const sparse = bundleInput();
    sparse.nodes = [, ...sparse.nodes];
    for (const value of [
      accessor,
      new Proxy(bundleInput(), { ownKeys() { throw new Error("must-not-run"); } }),
      sparse,
      { ...bundleInput(), rawEmail: "person@example.com" },
      { ...bundleInput(), phone: "+14165550123" },
      { ...bundleInput(), credential: "not-allowed" },
      { ...bundleInput(), providerPayload: "not-allowed" },
      replaceNode(bundleInput(), "dispatch_recheck", { dependencyDigests: [, DIGESTS[0]] }),
    ]) {
      await assert.rejects(
        bundle.buildSyntheticOutreachInvariantBundle(value),
        /synthetic_outreach_invariant_bundle_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

function packageInput() {
  return {
    id: "synthetic-package",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: "d".repeat(64),
    qualificationEvidenceHashes: ["1".repeat(64)],
    sourceHashes: ["2".repeat(64)],
    recommendedAngle: "Synthetic operational-efficiency discussion",
    claimGuardrailVersionIds: ["synthetic-guardrail"],
    selectedContactPoints: [{
      id: "synthetic-contact-point-email",
      kind: "email",
      value: "prospect@example.invalid",
      verificationClass: "mailbox_verified",
      freshUntil: NOW + 10_000,
    }],
    messageVersionIds: ["synthetic-message"],
    createdAt: NOW,
  };
}

function messageInput(packageDigest) {
  return {
    id: "synthetic-message",
    packageId: "synthetic-package",
    packageDigest,
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: "d".repeat(64),
    sender: { from: "owner@example.invalid", replyTo: "reply@example.invalid" },
    recipients: { to: ["prospect@example.invalid"], cc: [], bcc: [] },
    subject: "[SYNTHETIC] Operational efficiency",
    textBody: "Synthetic preparation body.",
    htmlBody: "<p>Synthetic preparation body.</p>",
    links: [],
    attachments: [],
    threadId: null,
    replyToMessageId: null,
    intendedSendAt: NOW + 1_000,
    timezone: "UTC",
  };
}

function identityCandidate() {
  return {
    id: "synthetic-suppression-resolution",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    transition: {
      kind: "merge",
      id: "synthetic-identity-transition",
      digest: "3".repeat(64),
      primaryIdentityId: "synthetic-identity-a",
      secondaryIdentityIds: ["synthetic-identity-b"],
      associationIds: ["synthetic-association-a"],
    },
    identityBindings: [
      { identityId: "synthetic-identity-a", identityKind: "contact", subjectRefIds: ["synthetic-ref-email"] },
      { identityId: "synthetic-identity-b", identityKind: "contact", subjectRefIds: [] },
    ],
    companySubjectRefIds: ["synthetic-ref-company"],
    subjects: [
      {
        refId: "synthetic-ref-company",
        tombstoneId: "synthetic-tombstone-company",
        kind: "company",
        channel: "all",
        scopeIdentityId: "synthetic-company",
        valueDigest: "4".repeat(64),
        effectiveAt: NOW - 10,
      },
      {
        refId: "synthetic-ref-email",
        tombstoneId: "synthetic-tombstone-email",
        kind: "exact_email",
        channel: "email",
        scopeIdentityId: "synthetic-identity-a",
        valueDigest: "5".repeat(64),
        effectiveAt: NOW - 10,
      },
    ],
    createdAt: NOW,
  };
}

test("real preparation builders can feed only their synthetic IDs and digests into the bundle", async () => {
  const { vite, bundle, artifacts, resolution, receipts, retention } = await load();
  try {
    const packageArtifact = await artifacts.buildSyntheticOutreachPackage(packageInput());
    const messageArtifact = await artifacts.buildSyntheticMessageVersion(messageInput(packageArtifact.digest));
    const candidateInput = identityCandidate();
    const candidate = await resolution.buildSyntheticSuppressionIdentityCandidate(candidateInput);
    const resolutionDecision = await resolution.evaluateSyntheticSuppressionIdentityResolution({
      candidateArtifact: candidate,
      currentCandidate: candidateInput,
      currentAuthority: {
        evaluatedAt: NOW + 10,
        identityChangeCurrent: true,
        suppressionIndexAvailable: true,
        historicalAliasesRetained: true,
        tombstonesAppendOnly: true,
      },
    });
    const receipt = await receipts.buildSyntheticSuppressionIdentityReceiptIntent({
      id: "synthetic-receipt-intent",
      transactionId: "synthetic-receipt-transaction",
      operationId: "synthetic-receipt-operation",
      operationDigest: "6".repeat(64),
      workspaceId: "synthetic-workspace",
      companyId: "synthetic-company",
      candidateId: candidate.id,
      candidateDigest: candidate.digest,
      transitionId: candidate.snapshot.transition.id,
      transitionDigest: candidate.snapshot.transition.digest,
      preservedSubjectRefIds: resolutionDecision.preservedSubjectRefIds,
      destinationIdentityIds: resolutionDecision.destinationIdentityIds,
      associationIds: candidate.snapshot.transition.associationIds,
      createdAt: NOW + 20,
      committedAt: NOW + 30,
    });
    const retentionIntent = await retention.buildSyntheticSuppressionRetentionManifestIntent({
      id: "synthetic-retention-intent",
      lineageId: "synthetic-retention-lineage",
      operationId: "synthetic-retention-operation",
      operationDigest: receipt.receiptPlan.completionDigest,
      workspaceId: "synthetic-workspace",
      companyId: "synthetic-company",
      sourceSnapshotId: candidate.id,
      sourceSnapshotDigest: candidate.digest,
      sourceSubjectRefIds: resolutionDecision.preservedSubjectRefIds,
      sourceAliasIds: ["synthetic-alias"],
      sourceDeletionTombstoneIds: ["synthetic-deletion-existing"],
      deletionEventId: "synthetic-deletion-event",
      deletionEventDigest: "7".repeat(64),
      resultingDeletionTombstoneId: "synthetic-deletion-new",
      importBundleId: "synthetic-import-bundle",
      importBundleDigest: "8".repeat(64),
      importedSubjectRefIds: ["synthetic-ref-imported"],
      importedAliasIds: ["synthetic-alias-imported"],
      importedDeletionTombstoneIds: ["synthetic-deletion-imported"],
      exportManifestId: "synthetic-export-manifest",
      archiveManifestId: "synthetic-archive-manifest",
      restoreOperationId: "synthetic-restore-operation",
      createdAt: NOW + 40,
      completedAt: NOW + 50,
    });
    const digests = [...DIGESTS];
    digests[0] = packageArtifact.digest;
    digests[1] = messageArtifact.digest;
    digests[9] = candidate.digest;
    digests[10] = receipt.digest;
    digests[11] = retentionIntent.digest;
    const artifact = await bundle.buildSyntheticOutreachInvariantBundle(bundleInput({
      nodes: nodes(digests, {
        package_artifact: packageArtifact.id,
        message_artifact: messageArtifact.id,
        identity_resolution: candidate.id,
        identity_receipts: receipt.id,
        suppression_retention: retentionIntent.id,
      }),
    }));
    assert.equal(artifact.snapshot.nodes[0].digest, packageArtifact.digest);
    assert.equal(artifact.snapshot.nodes[1].digest, messageArtifact.digest);
    assert.equal(receipt.snapshot.candidateDigest, candidate.digest);
    assert.equal(retentionIntent.snapshot.operationDigest, receipt.receiptPlan.completionDigest);
    assert.equal(artifact.snapshot.nodes[11].digest, retentionIntent.digest);
    const serialized = JSON.stringify(artifact);
    assert.equal(serialized.includes("@"), false);
    assert.equal(serialized.includes("+1"), false);
  } finally {
    await vite.close();
  }
});

test("the invariant module has no runtime, persistence, provider, network, or effect seam", async () => {
  const source = await readFile(new URL(
    "../preparation/outreach-invariant-bundle.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(source.includes("simultaneousOccurrenceClaimed: false"), true);
  assert.equal(source.includes("providerInvocationAuthorized: false"), true);
  assert.equal(source.includes("runtimeCompositionAuthorized: false"), true);
});
