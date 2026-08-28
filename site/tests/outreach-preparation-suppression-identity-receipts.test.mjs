import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_900_000;
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
    id: "synthetic-suppression-receipt-intent",
    transactionId: "synthetic-identity-suppression-transaction",
    operationId: "synthetic-identity-suppression-operation",
    operationDigest: A,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    candidateId: "synthetic-suppression-resolution",
    candidateDigest: B,
    transitionId: "synthetic-identity-transition",
    transitionDigest: C,
    preservedSubjectRefIds: ["synthetic-ref-email", "synthetic-ref-company"],
    destinationIdentityIds: ["synthetic-identity-new", "synthetic-identity-a"],
    associationIds: ["synthetic-association-b", "synthetic-association-a"],
    createdAt: NOW,
    committedAt: NOW + 100,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 200,
    identityResolutionCurrent: true,
    suppressionUnionCurrent: true,
    tombstonesAppendOnly: true,
    auditAvailable: true,
    ...patch,
  };
}

function input(artifact, patch = {}) {
  return {
    intentArtifact: artifact,
    currentIntent: intent(),
    currentAuthority: authority(),
    durableState: { records: [] },
    ...patch,
  };
}

test("receipt intents are deterministic, deeply frozen, digest-only, and zero-effect", async () => {
  const { vite, receipts } = await load();
  try {
    const first = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    const second = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent({
      preservedSubjectRefIds: [...intent().preservedSubjectRefIds].reverse(),
      destinationIdentityIds: [...intent().destinationIdentityIds].reverse(),
      associationIds: [...intent().associationIds].reverse(),
    }));
    assert.equal(first.digest, second.digest);
    assert.equal(first.kind, "synthetic_suppression_identity_receipt_intent");
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.receiptPlan), true);
    assert.equal(Object.isFrozen(first.receiptPlan.records), true);
    assert.equal(Object.isFrozen(first.receiptPlan.records[0]), true);
    assert.equal(first.identityMutationAuthorized, false);
    assert.equal(first.suppressionMutationAuthorized, false);
    assert.equal(first.auditPersistenceAuthorized, false);
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    const serialized = JSON.stringify(first);
    assert.equal(serialized.includes("@"), false);
    assert.equal(serialized.includes("+1"), false);
  } finally {
    await vite.close();
  }
});

test("the receipt plan is one exact five-record transaction hash chain", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    assert.deepEqual(artifact.receiptPlan.records.map((record) => record.kind), [
      "identity_transition",
      "suppression_index",
      "eligibility_invalidation",
      "audit_append",
      "transaction_complete",
    ]);
    assert.deepEqual(artifact.receiptPlan.records.map((record) => record.sequence), [1, 2, 3, 4, 5]);
    assert.equal(artifact.receiptPlan.records[0].predecessorDigest, null);
    for (let index = 1; index < artifact.receiptPlan.records.length; index += 1) {
      assert.equal(
        artifact.receiptPlan.records[index].predecessorDigest,
        artifact.receiptPlan.records[index - 1].digest,
      );
    }
    assert.equal(
      artifact.receiptPlan.completionDigest,
      artifact.receiptPlan.records.at(-1).digest,
    );
    assert.equal(new Set(artifact.receiptPlan.records.map((record) => record.id)).size, 5);
    const otherTransaction = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent({
      transactionId: "synthetic-other-identity-suppression-transaction",
    }));
    assert.notDeepEqual(
      otherTransaction.receiptPlan.records.map((record) => record.id),
      artifact.receiptPlan.records.map((record) => record.id),
    );
  } finally {
    await vite.close();
  }
});

test("empty durable state projects the complete atomic write without authorizing it", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    const decision = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact));
    assert.equal(decision.status, "synthetic_suppression_identity_atomic_commit_required_no_authority");
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.requiredAtomicRecordKinds, [
      "identity_transition",
      "suppression_index",
      "eligibility_invalidation",
      "audit_append",
      "transaction_complete",
    ]);
    assert.equal(decision.completionDigest, artifact.receiptPlan.completionDigest);
    assert.equal(decision.identityMutationAuthorized, false);
    assert.equal(decision.suppressionMutationAuthorized, false);
    assert.equal(decision.auditPersistenceAuthorized, false);
    assert.equal(decision.persistenceAuthorized, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("only the exact complete durable set replays as already committed", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    const decision = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, {
      durableState: { records: artifact.receiptPlan.records },
    }));
    assert.equal(decision.status, "synthetic_suppression_identity_atomic_commit_already_durable_no_authority");
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.requiredAtomicRecordKinds, []);
    assert.deepEqual(
      decision.durableReceiptDigests,
      artifact.receiptPlan.records.map((record) => record.digest),
    );
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("every partial receipt prefix and subset rejects rather than resuming", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    for (const records of [
      artifact.receiptPlan.records.slice(0, 1),
      artifact.receiptPlan.records.slice(0, 2),
      artifact.receiptPlan.records.slice(0, 3),
      artifact.receiptPlan.records.slice(0, 4),
      [artifact.receiptPlan.records[0], artifact.receiptPlan.records[4]],
    ]) {
      const decision = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, {
        durableState: { records },
      }));
      assert.equal(decision.status, "synthetic_suppression_identity_receipts_rejected");
      assert.equal(decision.reasonCodes.includes("partial_atomic_receipt_set"), true);
      assert.deepEqual(decision.requiredAtomicRecordKinds, []);
      assert.equal(decision.persistenceAuthorized, false);
    }
  } finally {
    await vite.close();
  }
});

test("reordered, duplicated, extra, and wrong-kind complete sets reject", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    const records = artifact.receiptPlan.records;
    for (const changed of [
      [records[1], records[0], ...records.slice(2)],
      [records[0], records[0], ...records.slice(2)],
      [...records, records[4]],
      records.map((record, index) => index === 2 ? { ...record, kind: "audit_append" } : record),
    ]) {
      const decision = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, {
        durableState: { records: changed },
      }));
      assert.equal(decision.status, "synthetic_suppression_identity_receipts_rejected");
      assert.equal(
        decision.reasonCodes.includes("receipt_order_invalid")
          || decision.reasonCodes.includes("partial_atomic_receipt_set"),
        true,
      );
    }
  } finally {
    await vite.close();
  }
});

test("record transplant, binding change, time change, and stale digest all reject", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    const cases = [
      ["receipt_transaction_mismatch", { transactionId: "synthetic-other-transaction" }],
      ["receipt_binding_mismatch", { candidateDigest: D }],
      ["receipt_time_invalid", { committedAt: NOW + 101 }],
      ["receipt_digest_invalid", { digest: D }],
      ["receipt_chain_invalid", { predecessorDigest: D }],
    ];
    for (const [reason, recordPatch] of cases) {
      const records = artifact.receiptPlan.records.map((record, index) => (
        index === 2 ? { ...record, ...recordPatch } : record
      ));
      const decision = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, {
        durableState: { records },
      }));
      assert.equal(decision.status, "synthetic_suppression_identity_receipts_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("a changed current intent cannot reuse a historical receipt plan", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    for (const currentIntent of [
      intent({ operationDigest: D }),
      intent({ candidateDigest: D }),
      intent({ preservedSubjectRefIds: ["synthetic-ref-company"] }),
      intent({ destinationIdentityIds: ["synthetic-identity-a"] }),
      intent({ associationIds: ["synthetic-association-a"] }),
    ]) {
      const decision = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, { currentIntent }));
      assert.equal(decision.status, "synthetic_suppression_identity_receipts_rejected");
      assert.equal(decision.reasonCodes.includes("suppression_identity_receipt_intent_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("every current authority failure rejects both new and replay paths", async () => {
  const { vite, receipts } = await load();
  try {
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    const cases = [
      ["identity_resolution_not_current", { identityResolutionCurrent: false }],
      ["suppression_union_not_current", { suppressionUnionCurrent: false }],
      ["tombstones_not_append_only", { tombstonesAppendOnly: false }],
      ["audit_unavailable", { auditAvailable: false }],
      ["evaluation_precedes_intent", { evaluatedAt: NOW - 1 }],
    ];
    for (const [reason, authorityPatch] of cases) {
      for (const records of [[], artifact.receiptPlan.records]) {
        const decision = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, {
          currentAuthority: authority(authorityPatch),
          durableState: { records },
        }));
        assert.equal(decision.status, "synthetic_suppression_identity_receipts_rejected", reason);
        assert.equal(decision.reasonCodes.includes(reason), true, reason);
      }
    }
  } finally {
    await vite.close();
  }
});

test("commit and evaluation time boundaries are exact and fail closed", async () => {
  const { vite, receipts } = await load();
  try {
    await assert.rejects(
      receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent({ committedAt: NOW })),
      /synthetic_suppression_identity_receipt_intent_invalid/,
    );
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    const beforeCommit = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW + 99 }),
      durableState: { records: artifact.receiptPlan.records },
    }));
    const atCommit = await receipts.evaluateSyntheticSuppressionIdentityReceipts(input(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW + 100 }),
      durableState: { records: artifact.receiptPlan.records },
    }));
    assert.equal(beforeCommit.reasonCodes.includes("evaluation_precedes_commit"), true);
    assert.equal(atCommit.status, "synthetic_suppression_identity_atomic_commit_already_durable_no_authority");
  } finally {
    await vite.close();
  }
});

test("the prior suppression projection contributes only synthetic IDs and digests", async () => {
  const { vite, receipts, resolution } = await load();
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
    const receiptIntent = intent({
      candidateId: candidate.id,
      candidateDigest: candidate.digest,
      transitionId: projection.transitionId,
      transitionDigest: projection.transitionDigest,
      preservedSubjectRefIds: projection.preservedSubjectRefIds,
      destinationIdentityIds: projection.destinationIdentityIds,
      associationIds: projection.associationInvalidations.map((entry) => entry.associationId),
    });
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(receiptIntent);
    const serialized = JSON.stringify(artifact);
    assert.equal(artifact.snapshot.candidateDigest, candidate.digest);
    assert.equal(serialized.includes("person@"), false);
    assert.equal(serialized.includes("+1416"), false);
    assert.equal(serialized.includes("raw"), false);
    assert.deepEqual(artifact.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("hostile shapes, raw fields, forged brands, and runtime-effect seams fail closed", async () => {
  const { vite, receipts } = await load();
  try {
    const accessor = Object.defineProperty(intent(), "candidateDigest", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    for (const value of [
      accessor,
      new Proxy(intent(), { ownKeys() { throw new Error("must-not-run"); } }),
      intent({ preservedSubjectRefIds: [, "synthetic-ref-company"] }),
      { ...intent(), rawAlias: "Synthetic Person" },
      { ...intent(), email: "person@example.com" },
      intent({ operationDigest: "bad" }),
    ]) {
      await assert.rejects(
        receipts.buildSyntheticSuppressionIdentityReceiptIntent(value),
        /synthetic_suppression_identity_receipt_intent_invalid/,
      );
    }
    const artifact = await receipts.buildSyntheticSuppressionIdentityReceiptIntent(intent());
    await assert.rejects(
      receipts.evaluateSyntheticSuppressionIdentityReceipts(input({ ...artifact })),
      /synthetic_suppression_identity_receipts_invalid/,
    );
  } finally {
    await vite.close();
  }

  const source = await readFile(new URL(
    "../preparation/suppression-identity-receipts.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of ["fetch(", "console.", ".prepare(", "INSERT INTO", "logger.", "writeFile("]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("identityMutationAuthorized: false"), true);
  assert.equal(source.includes("suppressionMutationAuthorized: false"), true);
  assert.equal(source.includes("auditPersistenceAuthorized: false"), true);
  assert.equal(source.includes("providerInvocationAuthorized: false"), true);
});

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
