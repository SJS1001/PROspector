import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_800_000;
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
      module: await vite.ssrLoadModule(new URL(
        "../preparation/suppression-identity-resolution.ts",
        import.meta.url,
      ).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function subjects(phoneIdentityId = "synthetic-identity-b") {
  return [
    {
      refId: "synthetic-ref-company",
      tombstoneId: "synthetic-tombstone-company",
      kind: "company",
      channel: "all",
      scopeIdentityId: "synthetic-company",
      valueDigest: A,
      effectiveAt: NOW - 100,
    },
    {
      refId: "synthetic-ref-email",
      tombstoneId: "synthetic-tombstone-email",
      kind: "exact_email",
      channel: "email",
      scopeIdentityId: "synthetic-identity-a",
      valueDigest: B,
      effectiveAt: NOW - 50,
    },
    {
      refId: "synthetic-ref-phone",
      tombstoneId: "synthetic-tombstone-phone",
      kind: "exact_phone",
      channel: "phone",
      scopeIdentityId: phoneIdentityId,
      valueDigest: C,
      effectiveAt: NOW + 500,
    },
  ];
}

function mergeCandidate(patch = {}) {
  return {
    id: "synthetic-suppression-resolution",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    transition: {
      kind: "merge",
      id: "synthetic-identity-transition",
      digest: D,
      primaryIdentityId: "synthetic-identity-a",
      secondaryIdentityIds: ["synthetic-identity-b"],
      associationIds: ["synthetic-association-a", "synthetic-association-b"],
    },
    identityBindings: [
      { identityId: "synthetic-identity-a", identityKind: "contact", subjectRefIds: ["synthetic-ref-email"] },
      { identityId: "synthetic-identity-b", identityKind: "contact", subjectRefIds: ["synthetic-ref-phone"] },
    ],
    companySubjectRefIds: ["synthetic-ref-company"],
    subjects: subjects(),
    createdAt: NOW,
    ...patch,
  };
}

function splitCandidate(patch = {}) {
  return {
    id: "synthetic-suppression-resolution",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    transition: {
      kind: "split",
      id: "synthetic-identity-transition",
      digest: D,
      sourceIdentityId: "synthetic-identity-a",
      newIdentityId: "synthetic-identity-new",
      retainedAssociationIds: ["synthetic-association-a"],
      movedAssociationIds: ["synthetic-association-b"],
    },
    identityBindings: [
      {
        identityId: "synthetic-identity-a",
        identityKind: "contact",
        subjectRefIds: ["synthetic-ref-email", "synthetic-ref-phone"],
      },
    ],
    companySubjectRefIds: ["synthetic-ref-company"],
    subjects: subjects("synthetic-identity-a"),
    createdAt: NOW,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 100,
    identityChangeCurrent: true,
    suppressionIndexAvailable: true,
    historicalAliasesRetained: true,
    tombstonesAppendOnly: true,
    ...patch,
  };
}

test("suppression identity candidates canonicalize deeply frozen digest-only state", async () => {
  const { vite, module } = await load();
  try {
    const first = await module.buildSyntheticSuppressionIdentityCandidate(mergeCandidate());
    const second = await module.buildSyntheticSuppressionIdentityCandidate(mergeCandidate({
      identityBindings: [...mergeCandidate().identityBindings].reverse(),
      subjects: [...subjects()].reverse(),
    }));
    assert.equal(first.digest, second.digest);
    assert.equal(first.kind, "synthetic_suppression_identity_candidate");
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.snapshot.subjects), true);
    assert.equal(Object.isFrozen(first.snapshot.subjects[0]), true);
    assert.equal(first.identityMutationAuthorized, false);
    assert.equal(first.suppressionMutationAuthorized, false);
    assert.equal(first.tombstoneDeletionAuthorized, false);
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

test("merge unions every identity and Company suppression onto the surviving identity", async () => {
  const { vite, module } = await load();
  try {
    const candidate = mergeCandidate();
    const artifact = await module.buildSyntheticSuppressionIdentityCandidate(candidate);
    const decision = await module.evaluateSyntheticSuppressionIdentityResolution({
      candidateArtifact: artifact,
      currentCandidate: candidate,
      currentAuthority: authority(),
    });
    assert.equal(decision.status, "synthetic_suppression_identity_resolution_projected_no_authority");
    assert.deepEqual(decision.sourceIdentityIds, ["synthetic-identity-a", "synthetic-identity-b"]);
    assert.deepEqual(decision.preservedSubjectRefIds, [
      "synthetic-ref-company", "synthetic-ref-email", "synthetic-ref-phone",
    ]);
    assert.deepEqual(decision.destinationProjections, [{
      identityId: "synthetic-identity-a",
      applicableSubjectRefIds: ["synthetic-ref-company", "synthetic-ref-email", "synthetic-ref-phone"],
      effectiveSubjectRefIds: ["synthetic-ref-company", "synthetic-ref-email"],
      emailBlocked: true,
      phoneBlocked: true,
    }]);
    assert.deepEqual(decision.retiredIdentityMappings, [{
      retiredIdentityId: "synthetic-identity-b",
      survivingIdentityId: "synthetic-identity-a",
    }]);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("split carries the complete suppression union to both identities without guessing", async () => {
  const { vite, module } = await load();
  try {
    const candidate = splitCandidate();
    const artifact = await module.buildSyntheticSuppressionIdentityCandidate(candidate);
    const decision = await module.evaluateSyntheticSuppressionIdentityResolution({
      candidateArtifact: artifact,
      currentCandidate: candidate,
      currentAuthority: authority(),
    });
    assert.equal(decision.status, "synthetic_suppression_identity_resolution_projected_no_authority");
    assert.equal(decision.splitConservativeCarryForwardRequired, true);
    assert.deepEqual(decision.destinationProjections.map((entry) => entry.identityId), [
      "synthetic-identity-a", "synthetic-identity-new",
    ]);
    for (const projection of decision.destinationProjections) {
      assert.deepEqual(projection.applicableSubjectRefIds, [
        "synthetic-ref-company", "synthetic-ref-email", "synthetic-ref-phone",
      ]);
      assert.equal(projection.emailBlocked, true);
      assert.equal(projection.phoneBlocked, true);
    }
    assert.deepEqual(decision.associationInvalidations, [
      { associationId: "synthetic-association-a", projection: "NonContactable" },
      { associationId: "synthetic-association-b", projection: "NonContactable" },
    ]);
    assert.equal(decision.identityMutationAuthorized, false);
    assert.equal(decision.suppressionMutationAuthorized, false);
  } finally {
    await vite.close();
  }
});

test("future tombstones remain preserved and become effective only at their boundary", async () => {
  const { vite, module } = await load();
  try {
    const candidate = mergeCandidate({
      companySubjectRefIds: [],
      identityBindings: [
        { identityId: "synthetic-identity-a", identityKind: "contact", subjectRefIds: [] },
        { identityId: "synthetic-identity-b", identityKind: "contact", subjectRefIds: ["synthetic-ref-phone"] },
      ],
      subjects: [subjects()[2]],
    });
    const artifact = await module.buildSyntheticSuppressionIdentityCandidate(candidate);
    const before = await module.evaluateSyntheticSuppressionIdentityResolution({
      candidateArtifact: artifact,
      currentCandidate: candidate,
      currentAuthority: authority({ evaluatedAt: NOW + 499 }),
    });
    const atBoundary = await module.evaluateSyntheticSuppressionIdentityResolution({
      candidateArtifact: artifact,
      currentCandidate: candidate,
      currentAuthority: authority({ evaluatedAt: NOW + 500 }),
    });
    assert.deepEqual(before.preservedSubjectRefIds, ["synthetic-ref-phone"]);
    assert.equal(before.destinationProjections[0].phoneBlocked, false);
    assert.equal(before.associationInvalidations[0].projection, "NeedsReview");
    assert.equal(atBoundary.destinationProjections[0].phoneBlocked, true);
    assert.equal(atBoundary.associationInvalidations[0].projection, "NonContactable");
  } finally {
    await vite.close();
  }
});

test("all suppression kinds enforce their exact provider-neutral channel", async () => {
  const { vite, module } = await load();
  try {
    const cases = [
      ["company", "all"],
      ["organization", "all"],
      ["contact", "all"],
      ["exact_email", "email"],
      ["confirmed_email_domain", "email"],
      ["exact_phone", "phone"],
    ];
    for (const [kind, channel] of cases) {
      const subject = {
        refId: "synthetic-ref-one",
        tombstoneId: "synthetic-tombstone-one",
        kind,
        channel,
        scopeIdentityId: kind === "company" ? "synthetic-company" : "synthetic-identity-a",
        valueDigest: A,
        effectiveAt: NOW,
      };
      const candidate = mergeCandidate({
        identityBindings: [
          {
            identityId: "synthetic-identity-a",
            identityKind: kind === "organization" ? "organization" : "contact",
            subjectRefIds: kind === "company" ? [] : [subject.refId],
          },
          { identityId: "synthetic-identity-b", identityKind: "contact", subjectRefIds: [] },
        ],
        companySubjectRefIds: kind === "company" ? [subject.refId] : [],
        subjects: [subject],
      });
      const artifact = await module.buildSyntheticSuppressionIdentityCandidate(candidate);
      assert.equal(artifact.snapshot.subjects[0].kind, kind);
    }
    await assert.rejects(
      module.buildSyntheticSuppressionIdentityCandidate(mergeCandidate({
        subjects: [{ ...subjects()[1], channel: "all" }],
        companySubjectRefIds: [],
        identityBindings: [
          { identityId: "synthetic-identity-a", identityKind: "contact", subjectRefIds: ["synthetic-ref-email"] },
          { identityId: "synthetic-identity-b", identityKind: "contact", subjectRefIds: [] },
        ],
      })),
      /synthetic_suppression_identity_candidate_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("every authority failure rejects without weakening the projected union", async () => {
  const { vite, module } = await load();
  try {
    const candidate = mergeCandidate();
    const artifact = await module.buildSyntheticSuppressionIdentityCandidate(candidate);
    const cases = [
      ["identity_change_not_current", { identityChangeCurrent: false }],
      ["suppression_index_unavailable", { suppressionIndexAvailable: false }],
      ["historical_aliases_not_retained", { historicalAliasesRetained: false }],
      ["tombstones_not_append_only", { tombstonesAppendOnly: false }],
      ["evaluation_precedes_candidate", { evaluatedAt: NOW - 1 }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await module.evaluateSyntheticSuppressionIdentityResolution({
        candidateArtifact: artifact,
        currentCandidate: candidate,
        currentAuthority: authority(patch),
      });
      assert.equal(decision.status, "synthetic_suppression_identity_resolution_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.preservedSubjectRefIds, [
        "synthetic-ref-company", "synthetic-ref-email", "synthetic-ref-phone",
      ]);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("changed transition, binding, subject, or Company reach cannot reuse an artifact", async () => {
  const { vite, module } = await load();
  try {
    const candidate = mergeCandidate();
    const artifact = await module.buildSyntheticSuppressionIdentityCandidate(candidate);
    for (const currentCandidate of [
      mergeCandidate({ transition: { ...candidate.transition, digest: A } }),
      mergeCandidate({
        identityBindings: [
          { identityId: "synthetic-identity-a", identityKind: "contact", subjectRefIds: [] },
          { identityId: "synthetic-identity-b", identityKind: "contact", subjectRefIds: ["synthetic-ref-email", "synthetic-ref-phone"] },
        ],
        subjects: subjects().map((entry) => (
          entry.kind === "exact_email" ? { ...entry, scopeIdentityId: "synthetic-identity-b" } : entry
        )),
      }),
      mergeCandidate({ subjects: subjects().map((entry) => (
        entry.refId === "synthetic-ref-email" ? { ...entry, valueDigest: D } : entry
      )) }),
      mergeCandidate({
        companySubjectRefIds: [],
        subjects: subjects().filter((entry) => entry.kind !== "company"),
      }),
    ]) {
      const decision = await module.evaluateSyntheticSuppressionIdentityResolution({
        candidateArtifact: artifact,
        currentCandidate,
        currentAuthority: authority(),
      });
      assert.equal(decision.status, "synthetic_suppression_identity_resolution_rejected");
      assert.equal(decision.reasonCodes.includes("suppression_identity_candidate_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("merge and split topology rejects collisions, omissions, overlap, and foreign bindings", async () => {
  const { vite, module } = await load();
  try {
    const merge = mergeCandidate();
    const split = splitCandidate();
    for (const candidate of [
      mergeCandidate({ transition: { ...merge.transition, secondaryIdentityIds: [merge.transition.primaryIdentityId] } }),
      mergeCandidate({ identityBindings: [merge.identityBindings[0]] }),
      splitCandidate({ transition: { ...split.transition, newIdentityId: split.transition.sourceIdentityId } }),
      splitCandidate({ transition: {
        ...split.transition,
        retainedAssociationIds: ["synthetic-association-a"],
        movedAssociationIds: ["synthetic-association-a"],
      } }),
      splitCandidate({ identityBindings: [{
        identityId: "synthetic-foreign-identity",
        identityKind: "contact",
        subjectRefIds: ["synthetic-ref-email", "synthetic-ref-phone"],
      }] }),
    ]) {
      await assert.rejects(
        module.buildSyntheticSuppressionIdentityCandidate(candidate),
        /synthetic_suppression_identity_candidate_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("subject references are closed, unique, complete, and Company-bound", async () => {
  const { vite, module } = await load();
  try {
    for (const candidate of [
      mergeCandidate({ companySubjectRefIds: ["synthetic-ref-missing"] }),
      mergeCandidate({ companySubjectRefIds: ["synthetic-ref-email"] }),
      mergeCandidate({ identityBindings: [
        { identityId: "synthetic-identity-a", identityKind: "contact", subjectRefIds: ["synthetic-ref-email", "synthetic-ref-email"] },
        { identityId: "synthetic-identity-b", identityKind: "contact", subjectRefIds: ["synthetic-ref-phone"] },
      ] }),
      mergeCandidate({ subjects: [...subjects(), { ...subjects()[2], tombstoneId: "synthetic-tombstone-copy" }] }),
      mergeCandidate({ subjects: [...subjects(), {
        refId: "synthetic-ref-orphan",
        tombstoneId: "synthetic-tombstone-orphan",
        kind: "contact",
        channel: "all",
        scopeIdentityId: "synthetic-identity-a",
        valueDigest: D,
        effectiveAt: NOW,
      }] }),
      mergeCandidate({ subjects: subjects().map((entry) => (
        entry.kind === "company" ? { ...entry, scopeIdentityId: "synthetic-other-company" } : entry
      )) }),
      mergeCandidate({ subjects: subjects().map((entry) => (
        entry.kind === "exact_email" ? { ...entry, scopeIdentityId: "synthetic-identity-b" } : entry
      )) }),
      mergeCandidate({ subjects: subjects().map((entry) => (
        entry.kind === "exact_email" ? { ...entry, kind: "organization", channel: "all" } : entry
      )) }),
    ]) {
      await assert.rejects(
        module.buildSyntheticSuppressionIdentityCandidate(candidate),
        /synthetic_suppression_identity_candidate_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("raw identity values, real IDs, malformed digests, and extra fields fail closed", async () => {
  const { vite, module } = await load();
  try {
    for (const candidate of [
      { ...mergeCandidate(), email: "person@example.com" },
      { ...mergeCandidate(), phone: "+14165550123" },
      mergeCandidate({ workspaceId: "real-workspace" }),
      mergeCandidate({ transition: { ...mergeCandidate().transition, digest: "bad" } }),
      mergeCandidate({ subjects: subjects().map((entry, index) => (
        index === 0 ? { ...entry, reason: "raw reason" } : entry
      )) }),
    ]) {
      await assert.rejects(
        module.buildSyntheticSuppressionIdentityCandidate(candidate),
        /synthetic_suppression_identity_candidate_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("accessors, proxies, sparse arrays, forged brands, and symbol extras fail closed", async () => {
  const { vite, module } = await load();
  try {
    const accessor = Object.defineProperty(mergeCandidate(), "createdAt", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const symbolExtra = mergeCandidate();
    symbolExtra[Symbol("forged")] = true;
    for (const candidate of [
      accessor,
      new Proxy(mergeCandidate(), { ownKeys() { throw new Error("must-not-run"); } }),
      mergeCandidate({ subjects: [, subjects()[0]] }),
      symbolExtra,
    ]) {
      await assert.rejects(
        module.buildSyntheticSuppressionIdentityCandidate(candidate),
        /synthetic_suppression_identity_candidate_invalid/,
      );
    }
    const candidate = mergeCandidate();
    const artifact = await module.buildSyntheticSuppressionIdentityCandidate(candidate);
    await assert.rejects(
      module.evaluateSyntheticSuppressionIdentityResolution({
        candidateArtifact: { ...artifact },
        currentCandidate: candidate,
        currentAuthority: authority(),
      }),
      /synthetic_suppression_identity_resolution_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("the resolver has no database, logger, provider, network, or runtime composition seam", async () => {
  const source = await readFile(new URL(
    "../preparation/suppression-identity-resolution.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "logger.", "writeFile(", "identity-resolution",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("identityMutationAuthorized: false"), true);
  assert.equal(source.includes("suppressionMutationAuthorized: false"), true);
  assert.equal(source.includes("tombstoneDeletionAuthorized: false"), true);
  assert.equal(source.includes("providerInvocationAuthorized: false"), true);
});
