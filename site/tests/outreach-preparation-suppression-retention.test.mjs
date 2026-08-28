import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_001_000_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      retention: await vite.ssrLoadModule(new URL(
        "../preparation/suppression-retention-manifest.ts",
        import.meta.url,
      ).pathname),
      receipts: await vite.ssrLoadModule(new URL(
        "../preparation/suppression-identity-receipts.ts",
        import.meta.url,
      ).pathname),
      resolution: await vite.ssrLoadModule(new URL(
        "../preparation/suppression-identity-resolution.ts",
        import.meta.url,
      ).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function intent(patch = {}) {
  return {
    id: "synthetic-retention-intent",
    lineageId: "synthetic-retention-lineage",
    operationId: "synthetic-retention-operation",
    operationDigest: A,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    sourceSnapshotId: "synthetic-source-snapshot",
    sourceSnapshotDigest: B,
    sourceSubjectRefIds: ["synthetic-ref-phone", "synthetic-ref-company"],
    sourceAliasIds: ["synthetic-alias-a"],
    sourceDeletionTombstoneIds: ["synthetic-deletion-existing"],
    deletionEventId: "synthetic-deletion-event",
    deletionEventDigest: C,
    resultingDeletionTombstoneId: "synthetic-deletion-new",
    importBundleId: "synthetic-import-bundle",
    importBundleDigest: D,
    importedSubjectRefIds: ["synthetic-ref-email"],
    importedAliasIds: ["synthetic-alias-imported"],
    importedDeletionTombstoneIds: ["synthetic-deletion-imported"],
    exportManifestId: "synthetic-export-suppression-manifest",
    archiveManifestId: "synthetic-archive-manifest",
    restoreOperationId: "synthetic-restore-operation",
    createdAt: NOW,
    completedAt: NOW + 10,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 20,
    sourceCurrent: true,
    deletionAppendOnly: true,
    importUnionOnly: true,
    exportSuppressionExcluded: true,
    archiveComplete: true,
    restoreEffectsDisabled: true,
    ...patch,
  };
}

function input(artifact, patch = {}) {
  return {
    intentArtifact: artifact,
    currentIntent: intent(),
    currentAuthority: authority(),
    observedState: { records: [] },
    ...patch,
  };
}

test("retention intents are deterministic, deeply frozen, minimized, and zero-effect", async () => {
  const { vite, retention } = await load();
  try {
    const first = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const second = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent({
      sourceSubjectRefIds: [...intent().sourceSubjectRefIds].reverse(),
      importedSubjectRefIds: [...intent().importedSubjectRefIds].reverse(),
    }));
    assert.equal(first.digest, second.digest);
    assert.equal(first.kind, "synthetic_suppression_retention_manifest_intent");
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.boundaryPlan), true);
    assert.equal(Object.isFrozen(first.boundaryPlan.records), true);
    assert.equal(Object.isFrozen(first.boundaryPlan.records[0]), true);
    assert.equal(first.deletionAuthorized, false);
    assert.equal(first.importAuthorized, false);
    assert.equal(first.exportAuthorized, false);
    assert.equal(first.archiveAuthorized, false);
    assert.equal(first.restoreAuthorized, false);
    assert.equal(first.persistenceAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    const serialized = JSON.stringify(first);
    assert.equal(serialized.includes("@"), false);
    assert.equal(serialized.includes("+1"), false);
  } finally {
    await vite.close();
  }
});

test("the boundary plan preserves one exact append-only lineage through five stages", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const records = artifact.boundaryPlan.records;
    assert.deepEqual(records.map((record) => record.kind), [
      "delete", "import", "export", "archive", "restore",
    ]);
    assert.deepEqual(records.map((record) => record.sequence), [1, 2, 3, 4, 5]);
    assert.deepEqual(records[0].retainedSubjectRefIds, [
      "synthetic-ref-company", "synthetic-ref-phone",
    ]);
    assert.deepEqual(records[0].retainedDeletionTombstoneIds, [
      "synthetic-deletion-existing", "synthetic-deletion-new",
    ]);
    const unionSubjects = ["synthetic-ref-company", "synthetic-ref-email", "synthetic-ref-phone"];
    for (const record of records.slice(1)) assert.deepEqual(record.retainedSubjectRefIds, unionSubjects);
    assert.deepEqual(records[2].suppressionManifestSubjectRefIds, unionSubjects);
    assert.deepEqual(records[3].suppressionManifestSubjectRefIds, unionSubjects);
    assert.deepEqual(records[4].suppressionManifestSubjectRefIds, unionSubjects);
    assert.deepEqual(records[0].suppressionManifestSubjectRefIds, []);
    assert.deepEqual(records[1].suppressionManifestSubjectRefIds, []);
    assert.equal(records[0].predecessorDigest, null);
    for (let index = 1; index < records.length; index += 1) {
      assert.equal(records[index].predecessorDigest, records[index - 1].digest);
    }
    assert.equal(artifact.boundaryPlan.completionDigest, records.at(-1).digest);
    assert.equal(new Set(records.map((record) => record.id)).size, 5);
    const other = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent({
      lineageId: "synthetic-other-retention-lineage",
    }));
    assert.notDeepEqual(other.boundaryPlan.records.map((record) => record.id), records.map((record) => record.id));
  } finally {
    await vite.close();
  }
});

test("empty observation projects the complete manifest without authorizing any boundary", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact));
    assert.equal(decision.status, "synthetic_suppression_retention_manifest_required_no_authority");
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.requiredBoundaryKinds, ["delete", "import", "export", "archive", "restore"]);
    assert.equal(decision.contactableExportAuthorized, false);
    assert.equal(decision.restoreReleaseAuthorized, false);
    assert.equal(decision.persistenceAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("only the exact complete lineage verifies as observed", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
      observedState: { records: artifact.boundaryPlan.records },
    }));
    assert.equal(decision.status, "synthetic_suppression_retention_manifest_verified_no_authority");
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.requiredBoundaryKinds, []);
    assert.deepEqual(decision.observedBoundaryDigests, artifact.boundaryPlan.records.map((record) => record.digest));
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("every partial boundary prefix or subset rejects rather than resuming", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    for (const records of [
      artifact.boundaryPlan.records.slice(0, 1),
      artifact.boundaryPlan.records.slice(0, 2),
      artifact.boundaryPlan.records.slice(0, 3),
      artifact.boundaryPlan.records.slice(0, 4),
      [artifact.boundaryPlan.records[0], artifact.boundaryPlan.records[4]],
    ]) {
      const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
        observedState: { records },
      }));
      assert.equal(decision.status, "synthetic_suppression_retention_manifest_rejected");
      assert.equal(decision.reasonCodes.includes("partial_retention_boundary_set"), true);
      assert.deepEqual(decision.requiredBoundaryKinds, []);
    }
  } finally {
    await vite.close();
  }
});

test("reordered, duplicated, extra, and wrong-kind complete sets reject", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const records = artifact.boundaryPlan.records;
    for (const changed of [
      [records[1], records[0], ...records.slice(2)],
      [records[0], records[0], ...records.slice(2)],
      [...records, records[4]],
      records.map((record, index) => index === 2 ? { ...record, kind: "archive" } : record),
    ]) {
      const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
        observedState: { records: changed },
      }));
      assert.equal(decision.status, "synthetic_suppression_retention_manifest_rejected");
      assert.equal(
        decision.reasonCodes.includes("retention_boundary_order_invalid")
          || decision.reasonCodes.includes("partial_retention_boundary_set"),
        true,
      );
    }
  } finally {
    await vite.close();
  }
});

test("dropping any subject, alias, or deletion tombstone from any later stage rejects", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    for (const [index, patch] of [
      [0, { retainedSubjectRefIds: ["synthetic-ref-company"] }],
      [1, { retainedAliasIds: ["synthetic-alias-a"] }],
      [4, { retainedDeletionTombstoneIds: ["synthetic-deletion-existing", "synthetic-deletion-new"] }],
    ]) {
      const records = artifact.boundaryPlan.records.map((record, recordIndex) => (
        recordIndex === index ? { ...record, ...patch } : record
      ));
      const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
        observedState: { records },
      }));
      assert.equal(decision.status, "synthetic_suppression_retention_manifest_rejected");
      assert.equal(decision.reasonCodes.includes("retention_gap"), true);
    }
  } finally {
    await vite.close();
  }
});

test("export, archive, and restore must carry the complete non-contactable suppression manifest", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    for (const index of [2, 3, 4]) {
      const records = artifact.boundaryPlan.records.map((record, recordIndex) => (
        recordIndex === index
          ? { ...record, suppressionManifestSubjectRefIds: ["synthetic-ref-company"] }
          : record
      ));
      const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
        observedState: { records },
      }));
      assert.equal(decision.status, "synthetic_suppression_retention_manifest_rejected");
      assert.equal(decision.reasonCodes.includes("suppression_manifest_gap"), true);
      assert.equal(decision.contactableExportAuthorized, false);
    }
  } finally {
    await vite.close();
  }
});

test("scope, lineage, time, digest, and predecessor transplants reject with exact reasons", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const cases = [
      ["retention_lineage_mismatch", { lineageId: "synthetic-other-lineage" }],
      ["retention_scope_mismatch", { workspaceId: "synthetic-other-workspace" }],
      ["retention_binding_mismatch", { sourceSnapshotDigest: D }],
      ["retention_boundary_time_invalid", { recordedAt: NOW + 9 }],
      ["retention_boundary_digest_invalid", { digest: D }],
      ["retention_boundary_chain_invalid", { predecessorDigest: D }],
    ];
    for (const [reason, recordPatch] of cases) {
      const records = artifact.boundaryPlan.records.map((record, index) => (
        index === 3 ? { ...record, ...recordPatch } : record
      ));
      const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
        observedState: { records },
      }));
      assert.equal(decision.status, "synthetic_suppression_retention_manifest_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
    }
  } finally {
    await vite.close();
  }
});

test("a changed current intent cannot reuse a historical retention plan", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    for (const currentIntent of [
      intent({ operationDigest: D }),
      intent({ sourceSnapshotDigest: C }),
      intent({ importedSubjectRefIds: ["synthetic-ref-domain"] }),
      intent({ importedAliasIds: ["synthetic-alias-other"] }),
      intent({ deletionEventId: "synthetic-other-deletion-event" }),
      intent({ importBundleId: "synthetic-other-import-bundle" }),
      intent({ archiveManifestId: "synthetic-other-archive-manifest" }),
    ]) {
      const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, { currentIntent }));
      assert.equal(decision.status, "synthetic_suppression_retention_manifest_rejected");
      assert.equal(decision.reasonCodes.includes("suppression_retention_intent_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("every current authority failure rejects both empty and complete observations", async () => {
  const { vite, retention } = await load();
  try {
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const cases = [
      ["retention_source_not_current", { sourceCurrent: false }],
      ["deletion_not_append_only", { deletionAppendOnly: false }],
      ["import_not_union_only", { importUnionOnly: false }],
      ["export_suppression_exclusion_unproven", { exportSuppressionExcluded: false }],
      ["archive_incomplete", { archiveComplete: false }],
      ["restore_effects_not_disabled", { restoreEffectsDisabled: false }],
      ["evaluation_precedes_retention_intent", { evaluatedAt: NOW - 1 }],
    ];
    for (const [reason, authorityPatch] of cases) {
      for (const records of [[], artifact.boundaryPlan.records]) {
        const decision = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
          currentAuthority: authority(authorityPatch),
          observedState: { records },
        }));
        assert.equal(decision.status, "synthetic_suppression_retention_manifest_rejected", reason);
        assert.equal(decision.reasonCodes.includes(reason), true, reason);
      }
    }
  } finally {
    await vite.close();
  }
});

test("completion and evaluation time boundaries are exact and fail closed", async () => {
  const { vite, retention } = await load();
  try {
    await assert.rejects(
      retention.buildSyntheticSuppressionRetentionManifestIntent(intent({ completedAt: NOW + 4 })),
      /synthetic_suppression_retention_manifest_intent_invalid/,
    );
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    const before = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW + 9 }),
      observedState: { records: artifact.boundaryPlan.records },
    }));
    const at = await retention.evaluateSyntheticSuppressionRetentionManifest(input(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW + 10 }),
      observedState: { records: artifact.boundaryPlan.records },
    }));
    assert.equal(before.reasonCodes.includes("evaluation_precedes_retention_completion"), true);
    assert.equal(at.status, "synthetic_suppression_retention_manifest_verified_no_authority");
  } finally {
    await vite.close();
  }
});

test("identity resolution and atomic receipts feed only synthetic IDs and digests into retention", async () => {
  const { vite, retention, receipts, resolution } = await load();
  try {
    const candidateInput = resolutionCandidate();
    const candidate = await resolution.buildSyntheticSuppressionIdentityCandidate(candidateInput);
    const projection = await resolution.evaluateSyntheticSuppressionIdentityResolution({
      candidateArtifact: candidate,
      currentCandidate: candidateInput,
      currentAuthority: {
        evaluatedAt: NOW - 800,
        identityChangeCurrent: true,
        suppressionIndexAvailable: true,
        historicalAliasesRetained: true,
        tombstonesAppendOnly: true,
      },
    });
    const receiptInput = receiptIntent(candidate, projection);
    const receipt = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(receiptInput);
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent({
      operationDigest: receipt.receiptPlan.completionDigest,
      sourceSnapshotId: candidate.id,
      sourceSnapshotDigest: candidate.digest,
      sourceSubjectRefIds: projection.preservedSubjectRefIds,
      importedSubjectRefIds: ["synthetic-ref-phone"],
    }));
    const serialized = JSON.stringify(artifact);
    assert.equal(artifact.snapshot.operationDigest, receipt.receiptPlan.completionDigest);
    assert.equal(serialized.includes("person@"), false);
    assert.equal(serialized.includes("+1416"), false);
    assert.equal(serialized.includes("raw"), false);
    assert.deepEqual(artifact.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("hostile shapes, raw values, forged brands, and runtime-effect seams fail closed", async () => {
  const { vite, retention } = await load();
  try {
    const accessor = Object.defineProperty(intent(), "sourceSnapshotDigest", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    for (const value of [
      accessor,
      new Proxy(intent(), { ownKeys() { throw new Error("must-not-run"); } }),
      intent({ sourceSubjectRefIds: [, "synthetic-ref-company"] }),
      { ...intent(), rawEmail: "person@example.com" },
      { ...intent(), passphrase: "not-allowed" },
      { ...intent(), archiveBytes: "not-allowed" },
      intent({ operationDigest: "bad" }),
    ]) {
      await assert.rejects(
        retention.buildSyntheticSuppressionRetentionManifestIntent(value),
        /synthetic_suppression_retention_manifest_intent_invalid/,
      );
    }
    const artifact = await retention.buildSyntheticSuppressionRetentionManifestIntent(intent());
    await assert.rejects(
      retention.evaluateSyntheticSuppressionRetentionManifest(input({ ...artifact })),
      /synthetic_suppression_retention_manifest_invalid/,
    );
  } finally {
    await vite.close();
  }

  const source = await readFile(new URL(
    "../preparation/suppression-retention-manifest.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of ["fetch(", "console.", ".prepare(", "INSERT INTO", "logger.", "writeFile("]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  for (const flag of [
    "deletionAuthorized: false", "importAuthorized: false", "exportAuthorized: false",
    "archiveAuthorized: false", "restoreAuthorized: false", "providerInvocationAuthorized: false",
  ]) assert.equal(source.includes(flag), true, flag);
});

function receiptIntent(candidate, projection) {
  return {
    id: "synthetic-suppression-receipt-intent",
    transactionId: "synthetic-identity-suppression-transaction",
    operationId: "synthetic-identity-suppression-operation",
    operationDigest: A,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    candidateId: candidate.id,
    candidateDigest: candidate.digest,
    transitionId: projection.transitionId,
    transitionDigest: projection.transitionDigest,
    preservedSubjectRefIds: projection.preservedSubjectRefIds,
    destinationIdentityIds: projection.destinationIdentityIds,
    associationIds: projection.associationInvalidations.map((entry) => entry.associationId),
    createdAt: NOW - 700,
    committedAt: NOW - 600,
  };
}

function resolutionCandidate() {
  return {
    id: "synthetic-suppression-resolution",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    transition: {
      kind: "split",
      id: "synthetic-identity-transition",
      digest: C,
      sourceIdentityId: "synthetic-identity-a",
      newIdentityId: "synthetic-identity-new",
      retainedAssociationIds: ["synthetic-association-a"],
      movedAssociationIds: ["synthetic-association-b"],
    },
    identityBindings: [{
      identityId: "synthetic-identity-a",
      identityKind: "contact",
      subjectRefIds: ["synthetic-ref-email"],
    }],
    companySubjectRefIds: ["synthetic-ref-company"],
    subjects: [
      {
        refId: "synthetic-ref-company",
        tombstoneId: "synthetic-tombstone-company",
        kind: "company",
        channel: "all",
        scopeIdentityId: "synthetic-company",
        valueDigest: A,
        effectiveAt: NOW - 1_000,
      },
      {
        refId: "synthetic-ref-email",
        tombstoneId: "synthetic-tombstone-email",
        kind: "exact_email",
        channel: "email",
        scopeIdentityId: "synthetic-identity-a",
        valueDigest: B,
        effectiveAt: NOW - 1_000,
      },
    ],
    createdAt: NOW - 900,
  };
}
