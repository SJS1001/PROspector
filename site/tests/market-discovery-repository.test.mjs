import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  createD1Fixture,
  runRace,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const FIXED_NOW = 1_780_000_000_000;
const DAY = 24 * 60 * 60 * 1_000;
const REQUIRED_CATEGORIES = [
  "capability",
  "limitation",
  "delivery",
  "proof",
  "ownership",
  "claim_guardrail",
  "source_policy",
  "discovery_policy",
  "default_runner_policy",
];

const owner = {
  subject: "market-discovery-owner",
  legacySubject: "market-discovery-legacy",
  displayName: "Market discovery owner",
};

function key(sequence) {
  return `0198b5c0-0000-7000-8000-${String(sequence).padStart(12, "0")}`;
}

function finding(sequence, overrides = {}) {
  return {
    marketCategory: "heavy-industry",
    audience: "mineral-processing-operators",
    problemFamily: "recovery-variability",
    problemMatch: "Unplanned variability reduces stable mineral recovery.",
    likelyBuyer: "Vice President, Operations",
    examples: ["Concentrator recovery variability", "Ramp-up instability"],
    evidence: [
      {
        reference: `opaque:synthetic-market-evidence:${sequence}`,
        publisher: "Fixed non-network synthetic fixture",
        excerpt: `Bounded synthetic observation ${sequence}.`,
        observedAt: FIXED_NOW - sequence * 1_000,
        materialEvidenceFingerprint: `material-${sequence}`,
      },
    ],
    inference: "The evidence suggests a bounded diagnostic entry point.",
    productFit: "ONE can correlate operating context without replacing control systems.",
    risks: ["Buyer ownership must be confirmed", "Source scope is synthetic"],
    rankScore: 100 - sequence,
    ...overrides,
  };
}

async function loadDomains(fixture) {
  const [commercial, knowledge, readiness, discovery, submission] = await Promise.all([
    fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/product-readiness.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/market-discovery.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/discovery-submission.ts", import.meta.url).pathname),
  ]);
  return { commercial, knowledge, readiness, discovery, submission };
}

async function seedReadyProduct(fixture) {
  await applyMigrations(fixture.database);
  const domains = await loadDomains(fixture);
  const model = await domains.commercial.initializeCommercialModel(fixture.database, owner, {
    idempotencyKey: key(100),
  });
  const product = model.products.find((node) => node.name === "ONE");
  assert.ok(product, "the Phase 2 aggregate must expose the Product scope");

  const confirmedVersions = [];
  for (const [index, category] of REQUIRED_CATEGORIES.entries()) {
    const proposal = await domains.knowledge.createKnowledgeProposal(fixture.database, owner, {
      origin: "owner_edit",
      destination: { scopeType: "product", id: product.id, locator: product.name },
      kind: category,
      value: { excerpt: `Confirmed ${category.replaceAll("_", " ")} policy.` },
      source: {
        reference: `opaque:discovery-policy:${category}`,
        custody: "owner-confirmed synthetic test authority",
        retrievedAt: FIXED_NOW,
      },
      privacy: "private",
      license: { use: "internal_review_only" },
      reuseEligibility: "company_only",
      idempotencyKey: key(110 + index * 2),
    });
    const reviewed = await domains.knowledge.reviewKnowledgeProposal(fixture.database, owner, {
      proposalId: proposal.id,
      decision: "accept",
      expectedRevision: proposal.revision,
      idempotencyKey: key(111 + index * 2),
    });
    confirmedVersions.push({ id: reviewed.version.id, digest: reviewed.version.digest });
  }

  const productRow = await fixture.database
    .prepare("SELECT id, revision FROM products WHERE id = ?")
    .bind(product.id)
    .first();
  const ready = await domains.readiness.makeProductReady(fixture.database, owner, {
    productId: product.id,
    expectedProductRevision: Number(productRow.revision),
    confirmedVersions: confirmedVersions.sort((left, right) => left.id.localeCompare(right.id)),
    idempotencyKey: key(140),
  });
  return { ...domains, productId: product.id, ready };
}

function submissionInput(run, findings, sequence, overrides = {}) {
  return {
    runId: run.id,
    expectedRunRevision: run.revision,
    productId: run.productId,
    configurationId: run.configuration.id,
    configurationDigest: run.configuration.digest,
    provenance: {
      kind: "synthetic_private_proof",
      fixtureDigest: "a".repeat(64),
      sourceRevision: "phase3-red-contract",
      nonNetwork: true,
    },
    status: "complete",
    findings,
    idempotencyKey: key(sequence),
    ...overrides,
  };
}

async function countRows(database, table, where = "1 = 1", bindings = []) {
  const row = await database
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`)
    .bind(...bindings)
    .first();
  return Number(row.count);
}

async function snapshotDescendantAuthority(database, productId) {
  const rows = await database
    .prepare(
      `SELECT 'market_play' AS kind, p.id, p.lifecycle, p.revision
       FROM market_plays p WHERE p.product_id = ?
       UNION ALL
       SELECT 'customer_profile', cp.id, cp.lifecycle, cp.revision
       FROM customer_profiles cp
       JOIN market_plays p ON p.id = cp.play_id
       WHERE p.product_id = ?
       ORDER BY kind, id`,
    )
    .bind(productId, productId)
    .all();
  return rows.results;
}

test("D-05 all Product discovery triggers freeze identity, configuration, policy, window, and replay lineage", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("market-discovery-triggers");
  try {
    const authority = await seedReadyProduct(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const descendants = await snapshotDescendantAuthority(fixture.database, authority.productId);
    const initial = await authority.discovery.readProductDiscoveryRun(
      fixture.database,
      owner,
      authority.ready.initialRun.id,
    );
    assert.equal(
      initial.trigger.key,
      `initial:product:${authority.productId}:${authority.ready.configuration.id}`,
    );

    const lastSuccessfulWatermark = FIXED_NOW - 30 * DAY;
    const triggers = [
      { kind: "monthly", startedAt: FIXED_NOW, sequence: 200 },
      { kind: "manual", startedAt: FIXED_NOW + DAY, sequence: 201 },
      {
        kind: "material_change",
        startedAt: FIXED_NOW + 2 * DAY,
        sequence: 202,
        sourceEventId: "configuration-activation-material-change",
      },
    ];
    for (const trigger of triggers) {
      const run = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
        productId: authority.productId,
        expectedProductRevision: authority.ready.product.revision,
        triggerKind: trigger.kind,
        sourceEventId: trigger.sourceEventId,
        startedAt: trigger.startedAt,
        lastSuccessfulWatermark,
        idempotencyKey: key(trigger.sequence),
      });
      assert.equal(run.productId, authority.productId);
      assert.equal(run.trigger.kind, trigger.kind);
      assert.equal(run.configuration.id, authority.ready.configuration.id);
      assert.equal(run.configuration.digest, authority.ready.configuration.digest);
      assert.deepEqual(run.configuration.manifest, authority.ready.configuration.manifest);
      assert.deepEqual(run.policies, {
        runner: authority.ready.configuration.manifest.runnerPolicy,
        instruction: authority.ready.configuration.manifest.instructionPolicy,
        outputSchema: authority.ready.configuration.manifest.outputSchemaPolicy,
        tools: authority.ready.configuration.manifest.toolPolicy,
        source: authority.ready.configuration.manifest.sourcePolicy,
        discovery: authority.ready.configuration.manifest.discoveryPolicy,
      });
      assert.deepEqual(run.window, {
        lowerExclusive: lastSuccessfulWatermark - DAY,
        upperInclusive: trigger.startedAt,
      });
      assert.equal(run.executionState, "blocked_missing_capability");
      assert.deepEqual(
        await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
          productId: authority.productId,
          expectedProductRevision: authority.ready.product.revision,
          triggerKind: trigger.kind,
          sourceEventId: trigger.sourceEventId,
          startedAt: trigger.startedAt,
          lastSuccessfulWatermark,
          idempotencyKey: key(trigger.sequence),
        }),
        run,
        "a lost response must return the immutable winner",
      );
      assert.deepEqual(
        await authority.discovery.readProductDiscoveryRun(fixture.database, owner, run.id),
        run,
        "historical replay must use the pinned snapshot, not a current pointer",
      );
    }
    assert.deepEqual(await snapshotDescendantAuthority(fixture.database, authority.productId), descendants);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-06 bounded untrusted intake rejects malformed, partial, oversized, or authority-bearing submissions", async () => {
  const fixture = await createD1Fixture("market-discovery-untrusted-intake");
  try {
    const { submission } = await loadDomains(fixture);
    assert.equal(typeof submission.normalizeDiscoverySubmission, "function");
    const base = {
      productId: "product-one",
      runId: "run-one",
      configurationId: "configuration-one",
      provenance: {
        kind: "synthetic_private_proof",
        fixtureDigest: "a".repeat(64),
        sourceRevision: "phase3-red-contract",
        nonNetwork: true,
      },
      status: "complete",
      findings: [finding(1)],
    };
    const normalized = submission.normalizeDiscoverySubmission(base);
    assert.equal(normalized.findings.length, 1);
    assert.equal(normalized.findings[0].evidence[0].excerpt, finding(1).evidence[0].excerpt);
    assert.equal(normalized.provenance.nonNetwork, true);

    for (const malformed of [
      { ...base, findings: undefined },
      { ...base, status: "complete", findings: [{ ...finding(2), evidence: [] }] },
      { ...base, findings: [{ ...finding(3), audience: "" }] },
      { ...base, findings: [{ ...finding(4), ownerSubject: owner.subject }] },
      { ...base, findings: [{ ...finding(5), acceptedCustomerProfile: true }] },
      { ...base, findings: [{ ...finding(6), providerCredential: "must-not-enter" }] },
      { ...base, findings: [finding(7, { problemMatch: "x".repeat(70_000) })] },
      { ...base, findings: Array.from({ length: 501 }, (_, index) => finding(index + 10)) },
      { ...base, provenance: { ...base.provenance, nonNetwork: false } },
      { ...base, provenance: { ...base.provenance, sourceUrl: "https://example.invalid" } },
    ]) {
      assert.throws(
        () => submission.normalizeDiscoverySubmission(malformed),
        /bounded|schema|evidence|authority|credential|fixture|network|submission/i,
      );
    }
  } finally {
    await fixture.dispose();
  }
});

test("D-05/D-07 successful-only watermarks, deterministic ranking, three-card cap, and authority-unknown failure are durable", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("market-discovery-cap-watermark");
  try {
    const authority = await seedReadyProduct(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const descendants = await snapshotDescendantAuthority(fixture.database, authority.productId);
    const run = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "manual",
      startedAt: FIXED_NOW,
      lastSuccessfulWatermark: FIXED_NOW - 10 * DAY,
      idempotencyKey: key(300),
    });
    const incomplete = await authority.discovery.submitDiscoveryFindings(
      fixture.database,
      owner,
      submissionInput(run, [finding(1)], 301, { status: "partial" }),
    );
    assert.equal(incomplete.status, "authority_unknown");
    assert.deepEqual(incomplete.proposals, []);
    assert.equal(incomplete.actionsAvailable, false);
    assert.equal(incomplete.watermark.advanced, false);

    const retryRun = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "manual",
      startedAt: FIXED_NOW + DAY,
      lastSuccessfulWatermark: FIXED_NOW - 10 * DAY,
      idempotencyKey: key(302),
    });
    const ranked = [
      finding(1, { marketCategory: "category-one", rankScore: 60 }),
      finding(2, { marketCategory: "category-two", rankScore: 95 }),
      finding(3, { marketCategory: "category-three", rankScore: 80 }),
      finding(4, { marketCategory: "category-four", rankScore: 70 }),
      finding(5, { marketCategory: "category-five", rankScore: 20 }),
    ];
    const completed = await authority.discovery.submitDiscoveryFindings(
      fixture.database,
      owner,
      submissionInput(retryRun, ranked, 303),
    );
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.proposals.length, 3);
    assert.deepEqual(
      completed.proposals.map((proposal) => proposal.marketCategory),
      ["category-two", "category-three", "category-four"],
      "ranking and the three-proposal ceiling are server deterministic",
    );
    assert.equal(completed.watermark.previous, FIXED_NOW - 10 * DAY);
    assert.equal(completed.watermark.current, retryRun.startedAt);
    assert.equal(completed.watermark.advanced, true);
    assert.deepEqual(
      await authority.discovery.submitDiscoveryFindings(
        fixture.database,
        owner,
        submissionInput(retryRun, ranked, 303),
      ),
      completed,
      "the exact submission operation replays its winner",
    );
    await assert.rejects(
      authority.discovery.submitDiscoveryFindings(
        fixture.database,
        owner,
        submissionInput(retryRun, ranked.slice(0, 1), 303),
      ),
      /idempotency|operation|digest/i,
    );
    assert.equal(
      await countRows(
        fixture.database,
        "market_play_proposals",
        "run_id = ? AND surfaced = 1",
        [retryRun.id],
      ),
      3,
    );
    assert.deepEqual(await snapshotDescendantAuthority(fixture.database, authority.productId), descendants);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-08 fingerprint collisions attach evidence and immutable version/split/merge lineage instead of duplicate active markets", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("market-discovery-fingerprint-lineage");
  try {
    const authority = await seedReadyProduct(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const firstRun = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "manual",
      startedAt: FIXED_NOW,
      idempotencyKey: key(400),
    });
    const first = await authority.discovery.submitDiscoveryFindings(
      fixture.database,
      owner,
      submissionInput(firstRun, [finding(1)], 401),
    );
    const original = first.proposals[0];
    assert.match(original.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(original.version, 1);

    const secondRun = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "monthly",
      startedAt: FIXED_NOW + DAY,
      idempotencyKey: key(402),
    });
    const collisionFinding = finding(2, {
      problemMatch: "A second independent observation confirms recovery variability.",
      rankScore: 99,
    });
    const raced = await runRace([
      () =>
        authority.discovery.submitDiscoveryFindings(
          fixture.database,
          owner,
          submissionInput(secondRun, [collisionFinding], 403),
        ),
      () =>
        authority.discovery.submitDiscoveryFindings(
          fixture.database,
          owner,
          submissionInput(secondRun, [collisionFinding], 403),
        ),
    ]);
    assert.equal(raced.every((result) => result.status === "fulfilled"), true);
    assert.deepEqual(raced[0].value, raced[1].value);
    const collision = raced[0].value.proposals[0];
    assert.equal(collision.id, original.id);
    assert.equal(collision.fingerprint, original.fingerprint);
    assert.equal(collision.version, 2);
    assert.equal(collision.collision.relationship, "evidence_attached");
    assert.equal(collision.evidenceLineage.length, 2);
    assert.equal(
      await countRows(
        fixture.database,
        "market_play_proposals",
        "product_id = ? AND fingerprint = ? AND active = 1",
        [authority.productId, original.fingerprint],
      ),
      1,
    );

    const split = await authority.discovery.correctProposalFingerprint(fixture.database, owner, {
      proposalId: collision.id,
      expectedProposalRevision: collision.revision,
      expectedProposalDigest: collision.digest,
      operation: "split",
      correctedIdentity: {
        marketCategory: collision.marketCategory,
        audience: "mineral-processing-technical-leaders",
        problemFamily: collision.problemFamily,
      },
      reason: "The evidence distinguishes operating and technical buying audiences.",
      idempotencyKey: key(404),
    });
    assert.equal(split.lineage.kind, "split");
    assert.equal(split.lineage.predecessorProposalId, collision.id);
    assert.equal(split.lineage.immutable, true);
    assert.notEqual(split.proposal.fingerprint, collision.fingerprint);

    const merged = await authority.discovery.correctProposalFingerprint(fixture.database, owner, {
      proposalId: split.proposal.id,
      expectedProposalRevision: split.proposal.revision,
      expectedProposalDigest: split.proposal.digest,
      operation: "merge",
      mergeIntoProposalId: collision.id,
      reason: "Owner review confirmed one commercial hypothesis.",
      idempotencyKey: key(405),
    });
    assert.equal(merged.lineage.kind, "merge");
    assert.deepEqual(merged.lineage.sourceProposalIds.sort(), [collision.id, split.proposal.id].sort());
    assert.equal(merged.lineage.immutable, true);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-09/D-10 Explore, Defer, and Dismiss are exact immutable decisions and Explore opens Draft interview only", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("market-discovery-decisions");
  try {
    const authority = await seedReadyProduct(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const descendants = await snapshotDescendantAuthority(fixture.database, authority.productId);
    const run = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "manual",
      startedAt: FIXED_NOW,
      idempotencyKey: key(500),
    });
    const result = await authority.discovery.submitDiscoveryFindings(
      fixture.database,
      owner,
      submissionInput(
        run,
        [
          finding(1, { marketCategory: "category-explore" }),
          finding(2, { marketCategory: "category-defer" }),
          finding(3, { marketCategory: "category-dismiss" }),
        ],
        501,
      ),
    );
    const [exploreProposal, deferProposal, dismissProposal] = result.proposals;
    const exploreInput = {
      proposalId: exploreProposal.id,
      expectedProposalRevision: exploreProposal.revision,
      expectedProposalDigest: exploreProposal.digest,
      decision: "explore",
      reason: "Review this bounded hypothesis through consensus.",
      idempotencyKey: key(502),
    };
    const explored = await authority.discovery.decideMarketPlayProposal(
      fixture.database,
      owner,
      exploreInput,
    );
    assert.equal(explored.decision, "explore");
    assert.equal(explored.immutable, true);
    assert.equal(explored.interview.scopeType, "market_play");
    assert.equal(explored.interview.lifecycle, "draft");
    assert.equal(explored.interview.sourceProposalVersionId, exploreProposal.versionId);
    assert.deepEqual(
      await authority.discovery.decideMarketPlayProposal(fixture.database, owner, exploreInput),
      explored,
    );
    await assert.rejects(
      authority.discovery.decideMarketPlayProposal(fixture.database, owner, {
        ...exploreInput,
        expectedProposalDigest: "f".repeat(64),
      }),
      /digest|reviewed|stale|idempotency/i,
    );

    const deferred = await authority.discovery.decideMarketPlayProposal(fixture.database, owner, {
      proposalId: deferProposal.id,
      expectedProposalRevision: deferProposal.revision,
      expectedProposalDigest: deferProposal.digest,
      decision: "defer",
      reason: "Revisit after the next planning cycle.",
      reviewAt: FIXED_NOW + 90 * DAY,
      idempotencyKey: key(503),
    });
    assert.equal(deferred.decision, "defer");
    assert.equal(deferred.cooldown.days, 90);
    assert.equal(deferred.cooldown.until, FIXED_NOW + 90 * DAY);

    const dismissed = await authority.discovery.decideMarketPlayProposal(fixture.database, owner, {
      proposalId: dismissProposal.id,
      expectedProposalRevision: dismissProposal.revision,
      expectedProposalDigest: dismissProposal.digest,
      decision: "dismiss",
      reason: "The present evidence does not support Product fit.",
      confirmed: true,
      idempotencyKey: key(504),
    });
    assert.equal(dismissed.decision, "dismiss");
    assert.equal(dismissed.cooldown.days, 180);
    assert.equal(dismissed.cooldown.until, FIXED_NOW + 180 * DAY);
    assert.equal(
      await countRows(fixture.database, "market_play_proposal_decisions", "proposal_id IN (?, ?, ?)", [
        exploreProposal.id,
        deferProposal.id,
        dismissProposal.id,
      ]),
      3,
    );
    assert.equal(
      await countRows(fixture.database, "interview_sessions", "id = ? AND scope_type = 'market_play'", [
        explored.interview.id,
      ]),
      1,
    );
    assert.deepEqual(await snapshotDescendantAuthority(fixture.database, authority.productId), descendants);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-09/D-11 stale decision races converge, cooldown repetition stays closed, and only material evidence reopens", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("market-discovery-cooldown-reopen");
  try {
    const authority = await seedReadyProduct(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const initialRun = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "manual",
      startedAt: FIXED_NOW,
      idempotencyKey: key(600),
    });
    const initial = await authority.discovery.submitDiscoveryFindings(
      fixture.database,
      owner,
      submissionInput(initialRun, [finding(1)], 601),
    );
    const proposal = initial.proposals[0];
    const raced = await runRace([
      () =>
        authority.discovery.decideMarketPlayProposal(fixture.database, owner, {
          proposalId: proposal.id,
          expectedProposalRevision: proposal.revision,
          expectedProposalDigest: proposal.digest,
          decision: "defer",
          reason: "Wait for a material change.",
          reviewAt: FIXED_NOW + 90 * DAY,
          idempotencyKey: key(602),
        }),
      () =>
        authority.discovery.decideMarketPlayProposal(fixture.database, owner, {
          proposalId: proposal.id,
          expectedProposalRevision: proposal.revision,
          expectedProposalDigest: proposal.digest,
          decision: "dismiss",
          reason: "Current evidence is insufficient.",
          confirmed: true,
          idempotencyKey: key(603),
        }),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(raced.filter((result) => result.status === "rejected").length, 1);
    assert.equal(
      await countRows(fixture.database, "market_play_proposal_decisions", "proposal_id = ?", [proposal.id]),
      1,
    );

    const laterRun = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "monthly",
      startedAt: FIXED_NOW + 181 * DAY,
      idempotencyKey: key(604),
    });
    const repeated = await authority.discovery.submitDiscoveryFindings(
      fixture.database,
      owner,
      submissionInput(laterRun, [finding(1)], 605),
    );
    assert.equal(repeated.proposals[0].id, proposal.id);
    assert.equal(repeated.proposals[0].reopened, false);
    assert.equal(repeated.proposals[0].status, raced.find((entry) => entry.status === "fulfilled").value.status);
    assert.match(repeated.proposals[0].reopenReason, /repetition|no material change/i);

    const materialRun = await authority.discovery.startProductDiscoveryRun(fixture.database, owner, {
      productId: authority.productId,
      expectedProductRevision: authority.ready.product.revision,
      triggerKind: "material_change",
      sourceEventId: "confirmed-material-evidence-change",
      startedAt: FIXED_NOW + 182 * DAY,
      idempotencyKey: key(606),
    });
    const material = finding(9, {
      productFit: "New cited evidence changes the bounded Product-fit assessment.",
      risks: ["A newly evidenced risk changes the review boundary"],
    });
    const reopened = await authority.discovery.submitDiscoveryFindings(
      fixture.database,
      owner,
      submissionInput(materialRun, [material], 607),
    );
    assert.equal(reopened.proposals[0].id, proposal.id);
    assert.equal(reopened.proposals[0].reopened, true);
    assert.equal(reopened.proposals[0].reopenLineage.predecessorVersionId, proposal.versionId);
    assert.equal(reopened.proposals[0].reopenLineage.changedField, "productFit");
    assert.equal(reopened.proposals[0].reopenLineage.evidenceReference, material.evidence[0].reference);
    assert.equal(reopened.proposals[0].reopenLineage.immutable, true);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});
