import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  countRows,
  createD1Fixture,
  FORBIDDEN_OPERATIONAL_TABLES,
  MIGRATION_FILENAMES,
  runRace,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const FIXED_NOW = 1_780_000_000_000;
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
  subject: "product-readiness-owner",
  legacySubject: "product-readiness-legacy",
  displayName: "Product readiness owner",
};
const outsider = {
  subject: "product-readiness-outsider",
  legacySubject: "product-readiness-outsider-legacy",
  displayName: "Outsider",
};

function key(sequence) {
  return `0198a4b0-0000-7000-8000-${String(sequence).padStart(12, "0")}`;
}

function exactVersions(versions) {
  return versions
    .map((version) => ({ id: version.id, digest: version.digest }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function loadDomains(fixture) {
  const [commercial, knowledge, readiness, replacement] = await Promise.all([
    fixture.vite.ssrLoadModule(
      new URL("../domain/commercial-model.ts", import.meta.url).pathname,
    ),
    fixture.vite.ssrLoadModule(
      new URL("../domain/knowledge.ts", import.meta.url).pathname,
    ),
    fixture.vite.ssrLoadModule(
      new URL("../domain/product-readiness.ts", import.meta.url).pathname,
    ),
    fixture.vite.ssrLoadModule(
      new URL("../domain/replacement.ts", import.meta.url).pathname,
    ),
  ]);
  return { commercial, knowledge, readiness, replacement };
}

async function seedProductAuthority(
  fixture,
  { confirmedCategories = REQUIRED_CATEGORIES, removeDescendants = false } = {},
) {
  await applyMigrations(fixture.database);
  const domains = await loadDomains(fixture);
  const model = await domains.commercial.initializeCommercialModel(
    fixture.database,
    owner,
    { idempotencyKey: key(300) },
  );
  const product = model.products.find((node) => node.name === "ONE");
  assert.ok(product, "the Phase 2 commercial aggregate must expose ONE");

  const confirmed = [];
  const proposed = [];
  for (const [index, category] of REQUIRED_CATEGORIES.entries()) {
    const proposal = await domains.knowledge.createKnowledgeProposal(
      fixture.database,
      owner,
      {
        origin: "owner_edit",
        destination: { scopeType: "product", id: product.id, locator: "ONE" },
        kind: category,
        value: { excerpt: `Confirmed ${category.replaceAll("_", " ")} policy.` },
        source: {
          reference: `opaque:product-policy:${category}`,
          custody: "owner-confirmed synthetic test authority",
          retrievedAt: FIXED_NOW,
        },
        privacy: "private",
        license: { use: "internal_review_only" },
        reuseEligibility: "company_only",
        idempotencyKey: key(310 + index * 2),
      },
    );
    proposed.push(proposal);
    if (confirmedCategories.includes(category)) {
      const decision = await domains.knowledge.reviewKnowledgeProposal(
        fixture.database,
        owner,
        {
          proposalId: proposal.id,
          decision: "accept",
          expectedRevision: proposal.revision,
          idempotencyKey: key(311 + index * 2),
        },
      );
      confirmed.push({ ...decision.version, category });
    }
  }

  // Knowledge commands intentionally ensure the Phase 2 commercial seed exists.
  // Remove descendants after those commands so this fixture proves Product
  // readiness is independent of Market Play and Profile existence.
  if (removeDescendants) {
    await fixture.database
      .prepare(
        "DELETE FROM customer_profiles WHERE play_id IN (SELECT id FROM market_plays WHERE product_id = ?)",
      )
      .bind(product.id)
      .run();
    await fixture.database
      .prepare("DELETE FROM market_plays WHERE product_id = ?")
      .bind(product.id)
      .run();
  }

  const row = await fixture.database
    .prepare("SELECT id, lifecycle, revision FROM products WHERE id = ?")
    .bind(product.id)
    .first();
  return { ...domains, product: row, confirmed, proposed };
}

function readyInput(authority, idempotencyKey = key(400)) {
  return {
    productId: authority.product.id,
    expectedProductRevision: Number(authority.product.revision),
    confirmedVersions: exactVersions(authority.confirmed),
    idempotencyKey,
  };
}

async function countWhere(database, table, where = "1 = 1", bindings = []) {
  const row = await database
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`)
    .bind(...bindings)
    .first();
  return Number(row.count);
}

test("migration/schema/forbidden Phase 3 authority is additive, constrained, and downstream-empty", async () => {
  const fixture = await createD1Fixture("product-discovery-schema");
  try {
    await applyMigrations(fixture.database);
    assert.ok(MIGRATION_FILENAMES.some((name) => /^0005_[a-z0-9_]+\.sql$/.test(name)));
    assert.ok(MIGRATION_FILENAMES.some((name) => /^0006_[a-z0-9_-]+\.sql$/.test(name)));

    const requiredTables = [
      "product_discovery_configuration_prerequisites",
      "product_discovery_schedules",
      "product_discovery_runs",
      "product_discovery_run_events",
      "product_discovery_submissions",
      "market_play_proposals",
      "market_play_proposal_versions",
      "market_play_proposal_evidence",
      "market_play_proposal_decisions",
      "market_play_proposal_lineage",
      "product_configuration_lineage",
      "private_synthetic_proof_authorizations",
      "private_synthetic_proof_consumptions",
    ];
    const schemaRows = await fixture.database
      .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')")
      .all();
    const schemaNames = new Set(schemaRows.results.map((row) => row.name));
    assert.deepEqual(requiredTables.filter((name) => !schemaNames.has(name)), []);

    for (const guard of [
      "product_discovery_active_schedule_unique",
      "product_discovery_run_trigger_unique",
      "market_play_proposal_active_fingerprint_unique",
      "market_play_proposal_decision_version_unique",
      "private_synthetic_proof_consumption_authorization_unique",
      "product_discovery_prerequisite_immutable_update",
      "product_discovery_submission_immutable_update",
      "market_play_proposal_version_immutable_update",
      "market_play_proposal_decision_immutable_update",
      "private_synthetic_proof_authorization_scope_insert",
      "private_synthetic_proof_authorization_immutable_update",
      "private_synthetic_proof_consumption_scope_insert",
      "private_synthetic_proof_consumption_immutable_update",
    ]) assert.equal(schemaNames.has(guard), true, `missing database guard ${guard}`);

    const now = FIXED_NOW;
    const digestA = "a".repeat(64);
    const digestB = "b".repeat(64);
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES ('schema-workspace-a', 'A', 'schema-owner-a', ?, ?, 1)").bind(now, now),
      fixture.database.prepare("INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES ('schema-workspace-b', 'B', 'schema-owner-b', ?, ?, 1)").bind(now, now),
      fixture.database.prepare("INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) VALUES ('schema-product-a', 'schema-workspace-a', ?, ?, 1, NULL, 'A Product', 'draft')").bind(now, now),
      fixture.database.prepare("INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) VALUES ('schema-product-b', 'schema-workspace-b', ?, ?, 1, NULL, 'B Product', 'draft')").bind(now, now),
      fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('schema-config-a', 'schema-workspace-a', ?, ?, 1, NULL, 'product', 'schema-product-a', 'product_discovery', ?, '{}', 1)").bind(now, now, digestA),
      fixture.database.prepare("INSERT INTO knowledge_versions (id, workspace_id, created_at, updated_at, revision, knowledge_item_id, proposal_id, decision_id, authority_command_id, predecessor_version_id, scope_type, scope_id, kind, value_json, value_digest, status, source_digest) VALUES ('schema-version-a', 'schema-workspace-a', ?, ?, 1, NULL, NULL, NULL, NULL, NULL, 'product', 'schema-product-a', 'capability', '{}', ?, 'confirmed', ?)").bind(now, now, digestA, digestA),
      fixture.database.prepare("INSERT INTO knowledge_versions (id, workspace_id, created_at, updated_at, revision, knowledge_item_id, proposal_id, decision_id, authority_command_id, predecessor_version_id, scope_type, scope_id, kind, value_json, value_digest, status, source_digest) VALUES ('schema-version-b', 'schema-workspace-b', ?, ?, 1, NULL, NULL, NULL, NULL, NULL, 'product', 'schema-product-b', 'capability', '{}', ?, 'confirmed', ?)").bind(now, now, digestB, digestB),
    ]);
    await assert.rejects(
      fixture.database.prepare("INSERT INTO product_discovery_configuration_prerequisites (id, workspace_id, product_id, configuration_id, knowledge_version_id, knowledge_version_digest, category, ordinal, created_at) VALUES ('cross-scope', 'schema-workspace-a', 'schema-product-a', 'schema-config-a', 'schema-version-b', ?, 'capability', 0, ?)").bind(digestB, now).run(),
      /invalid product discovery prerequisite authority/i,
    );
    await fixture.database.prepare("INSERT INTO product_discovery_configuration_prerequisites (id, workspace_id, product_id, configuration_id, knowledge_version_id, knowledge_version_digest, category, ordinal, created_at) VALUES ('valid-prerequisite', 'schema-workspace-a', 'schema-product-a', 'schema-config-a', 'schema-version-a', ?, 'capability', 0, ?)").bind(digestA, now).run();
    await assert.rejects(
      fixture.database.prepare("UPDATE product_discovery_configuration_prerequisites SET ordinal = 1 WHERE id = 'valid-prerequisite'").run(),
      /immutable/i,
    );
    await assert.rejects(
      fixture.database.prepare("UPDATE products SET lifecycle = 'ready', revision = revision + 1 WHERE id = 'schema-product-a'").run(),
      /complete confirmed product discovery configuration required/i,
    );
    await fixture.database.prepare("INSERT INTO product_discovery_schedules (id, workspace_id, created_at, updated_at, revision, product_id, configuration_id, configuration_digest, cadence, schedule_key, timezone, next_run_at, last_successful_watermark, execution_state, active, operation_digest, idempotency_key) VALUES ('schema-schedule-a', 'schema-workspace-a', ?, ?, 1, 'schema-product-a', 'schema-config-a', ?, 'monthly', 'monthly:product:schema-product-a', 'America/Toronto', ?, NULL, 'blocked_missing_capability', 1, ?, 'schema-schedule-key-a')").bind(now, now, digestA, now, "c".repeat(64)).run();
    await assert.rejects(
      fixture.database.prepare("INSERT INTO product_discovery_schedules (id, workspace_id, created_at, updated_at, revision, product_id, configuration_id, configuration_digest, cadence, schedule_key, timezone, next_run_at, last_successful_watermark, execution_state, active, operation_digest, idempotency_key) VALUES ('schema-schedule-b', 'schema-workspace-a', ?, ?, 1, 'schema-product-a', 'schema-config-a', ?, 'monthly', 'monthly:product:schema-product-a:duplicate', 'America/Toronto', ?, NULL, 'blocked_missing_capability', 1, ?, 'schema-schedule-key-b')").bind(now, now, digestA, now, "d".repeat(64)).run(),
      /unique/i,
    );

    const foreignKeyViolations = await fixture.database.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(foreignKeyViolations.results, []);
    assert.equal(
      requiredTables.some((table) => FORBIDDEN_OPERATIONAL_TABLES.includes(table)),
      false,
      "Phase 3 proposal authority must remain distinct from Phase 4-7 operational tables",
    );
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-01 Product readiness is a pure exhaustive nine-category confirmed-authority checklist", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("product-readiness-checklist");
  try {
    const { readiness } = await loadDomains(fixture);
    assert.equal(typeof readiness.evaluateProductReadiness, "function");
    assert.deepEqual(readiness.PRODUCT_READINESS_CATEGORIES, REQUIRED_CATEGORIES);

    const product = { id: "product-one", revision: 7, lifecycle: "draft" };
    const untrusted = readiness.evaluateProductReadiness({
      product,
      knowledge: REQUIRED_CATEGORIES.map((category, index) => ({
        id: `untrusted-${category}`,
        digest: `${index}`.repeat(64).slice(0, 64),
        category,
        scopeType: "product",
        scopeId: product.id,
        status: index === 0 ? "confirmed" : "proposed",
        authority: index === 0 ? "fixture_text" : "knowledge_proposal",
      })),
      clientFlags: Object.fromEntries(REQUIRED_CATEGORIES.map((category) => [category, true])),
    });
    assert.equal(untrusted.complete, false);
    assert.deepEqual(untrusted.missingCategories, REQUIRED_CATEGORIES);
    assert.equal(untrusted.items.every((item) => item.status === "missing"), true);
    assert.deepEqual(untrusted.confirmedVersions, []);

    const confirmed = [...REQUIRED_CATEGORIES]
      .reverse()
      .map((category, index) => ({
        id: `version-${String(20 - index).padStart(2, "0")}`,
        digest: `${(index + 1).toString(16)}`.repeat(64).slice(0, 64),
        category,
        scopeType: "product",
        scopeId: product.id,
        status: "confirmed",
        authority: "confirmed_knowledge_version",
      }));
    const complete = readiness.evaluateProductReadiness({ product, knowledge: confirmed });
    assert.equal(complete.complete, true);
    assert.deepEqual(complete.missingCategories, []);
    assert.deepEqual(
      complete.items.map((item) => item.category),
      REQUIRED_CATEGORIES,
      "the visible checklist order is fixed and server-owned",
    );
    assert.deepEqual(
      complete.confirmedVersions,
      confirmed
        .map(({ id, digest, category }) => ({ id, digest, category }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      "the immutable prerequisite set is exact and sorted",
    );
  } finally {
    await fixture.dispose();
  }
});

test("D-01/D-03 Proposed Knowledge and client flags cannot satisfy readiness, while zero descendants can", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("product-readiness-authority");
  try {
    const authority = await seedProductAuthority(fixture, {
      confirmedCategories: [],
      removeDescendants: true,
    });
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const incomplete = await authority.readiness.readProductReadiness(
      fixture.database,
      owner,
      authority.product.id,
    );
    assert.equal(incomplete.status, "incomplete");
    assert.deepEqual(incomplete.missingCategories, REQUIRED_CATEGORIES);
    assert.equal(incomplete.checklist.every((item) => item.status === "missing"), true);
    assert.deepEqual(incomplete.confirmedVersions, []);

    await assert.rejects(
      authority.readiness.makeProductReady(fixture.database, owner, {
        productId: authority.product.id,
        expectedProductRevision: authority.product.revision,
        confirmedVersions: authority.proposed.map((proposal) => ({
          id: proposal.id,
          digest: proposal.digest,
        })),
        clientReady: true,
        categoriesConfirmed: REQUIRED_CATEGORIES,
        fixtureText: "all categories are ready",
        idempotencyKey: key(401),
      }),
      /confirmed|incomplete|authority/i,
    );
    assert.equal(await countRows(fixture.database, "market_plays"), 0);
    assert.equal(await countRows(fixture.database, "customer_profiles"), 0);
    assert.equal(await countRows(fixture.database, "offers"), 0);
    assert.equal(
      await countWhere(
        fixture.database,
        "typed_configurations",
        "owner_type = 'product' AND owner_id = ? AND kind = 'product_discovery'",
        [authority.product.id],
      ),
      0,
    );
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-02 Ready atomically records one immutable configuration, initial intent, manual availability, monthly intent, and audit", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("product-ready-atomic");
  try {
    const authority = await seedProductAuthority(fixture, { removeDescendants: true });
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const input = readyInput(authority, key(410));
    const ready = await authority.readiness.makeProductReady(
      fixture.database,
      owner,
      input,
    );

    assert.equal(ready.status, "ready");
    assert.equal(ready.product.id, authority.product.id);
    assert.equal(ready.product.lifecycle, "ready");
    assert.equal(ready.configuration.immutable, true);
    assert.match(ready.configuration.digest, /^[a-f0-9]{64}$/);
    assert.equal(ready.configuration.active, true);
    assert.equal(
      ready.initialRun.triggerKey,
      `initial:product:${authority.product.id}:${ready.configuration.id}`,
    );
    assert.equal(ready.initialRun.executionState, "blocked_missing_capability");
    assert.deepEqual(ready.manualDiscovery, {
      available: true,
      executionState: "blocked_missing_capability",
    });
    assert.equal(ready.monthlySchedule.cadence, "monthly");
    assert.equal(ready.monthlySchedule.executionState, "blocked_missing_capability");
    assert.equal(ready.descendants.marketPlays, 0);
    assert.equal(ready.descendants.customerProfiles, 0);
    assert.equal(ready.descendants.offers, 0);

    const configuration = await fixture.database
      .prepare(
        "SELECT digest, manifest_json, active FROM typed_configurations WHERE id = ?",
      )
      .bind(ready.configuration.id)
      .first();
    assert.equal(configuration.digest, ready.configuration.digest);
    assert.equal(Number(configuration.active), 1);
    assert.deepEqual(
      JSON.parse(configuration.manifest_json).confirmedVersions,
      input.confirmedVersions,
      "the persisted configuration freezes the exact sorted Version ID/digest set",
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_runs",
        "product_id = ? AND trigger_key = ?",
        [authority.product.id, ready.initialRun.triggerKey],
      ),
      1,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_schedules",
        "product_id = ? AND cadence = 'monthly'",
        [authority.product.id],
      ),
      1,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "audit_events",
        "action = 'product.ready' AND subject_id = ?",
        [authority.product.id],
      ),
      1,
    );
    assert.deepEqual(
      await authority.readiness.makeProductReady(fixture.database, owner, input),
      ready,
      "a lost response replays the authoritative winner",
    );
    assert.deepEqual(
      await authority.readiness.readProductReadiness(
        fixture.database,
        owner,
        authority.product.id,
      ),
      ready,
    );
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-02 stale, incomplete, digest-mismatched, conflicting-key, outsider, and concurrent Ready commands fail closed", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("product-ready-conflicts");
  try {
    const authority = await seedProductAuthority(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const base = readyInput(authority, key(420));

    await assert.rejects(
      authority.readiness.makeProductReady(fixture.database, owner, {
        ...base,
        expectedProductRevision: base.expectedProductRevision + 1,
      }),
      /stale|revision/i,
    );
    await assert.rejects(
      authority.readiness.makeProductReady(fixture.database, owner, {
        ...base,
        confirmedVersions: base.confirmedVersions.slice(1),
        idempotencyKey: key(421),
      }),
      /exact|confirmed|incomplete/i,
    );
    await assert.rejects(
      authority.readiness.makeProductReady(fixture.database, owner, {
        ...base,
        confirmedVersions: base.confirmedVersions.map((version, index) =>
          index === 0 ? { ...version, digest: "f".repeat(64) } : version,
        ),
        idempotencyKey: key(422),
      }),
      /digest|exact|confirmed/i,
    );
    await assert.rejects(
      authority.readiness.makeProductReady(fixture.database, outsider, {
        ...base,
        idempotencyKey: key(423),
      }),
      /workspace|product|authority|unavailable/i,
    );

    const raced = await runRace([
      () =>
        authority.readiness.makeProductReady(fixture.database, owner, {
          ...base,
          idempotencyKey: key(424),
        }),
      () =>
        authority.readiness.makeProductReady(fixture.database, owner, {
          ...base,
          idempotencyKey: key(425),
        }),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(raced.filter((result) => result.status === "rejected").length, 1);
    const winner = raced.find((result) => result.status === "fulfilled").value;
    assert.equal(
      await countWhere(
        fixture.database,
        "typed_configurations",
        "owner_type = 'product' AND owner_id = ? AND kind = 'product_discovery' AND active = 1",
        [authority.product.id],
      ),
      1,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_runs",
        "product_id = ? AND trigger_kind = 'initial'",
        [authority.product.id],
      ),
      1,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_schedules",
        "product_id = ? AND cadence = 'monthly'",
        [authority.product.id],
      ),
      1,
    );
    const winningKey = raced.findIndex((result) => result.status === "fulfilled") === 0
      ? key(424)
      : key(425);
    assert.deepEqual(
      await authority.readiness.makeProductReady(fixture.database, owner, {
        ...base,
        idempotencyKey: winningKey,
      }),
      winner,
    );
    await assert.rejects(
      authority.readiness.makeProductReady(fixture.database, owner, {
        ...base,
        idempotencyKey: winningKey,
        confirmedVersions: base.confirmedVersions.slice(1),
      }),
      /idempotency|operation/i,
    );
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-02/D-04 a failed atomic statement, paused/archive state, or authority-unknown Product leaves no partial readiness", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("product-ready-fail-closed");
  try {
    const authority = await seedProductAuthority(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const input = readyInput(authority, key(430));

    await fixture.database
      .prepare(
        `CREATE TRIGGER fail_product_ready_audit
         BEFORE INSERT ON audit_events
         WHEN NEW.action = 'product.ready'
         BEGIN SELECT RAISE(ABORT, 'injected product ready failure'); END`,
      )
      .run();
    await assert.rejects(
      authority.readiness.makeProductReady(fixture.database, owner, input),
      /ready|failure|reload|conflict/i,
    );
    await fixture.database.prepare("DROP TRIGGER fail_product_ready_audit").run();
    const unchangedProduct = await fixture.database
      .prepare("SELECT lifecycle, revision FROM products WHERE id = ?")
      .bind(authority.product.id)
      .first();
    assert.deepEqual(unchangedProduct, {
      lifecycle: "draft",
      revision: authority.product.revision,
    });
    assert.equal(
      await countWhere(
        fixture.database,
        "typed_configurations",
        "owner_type = 'product' AND owner_id = ? AND kind = 'product_discovery'",
        [authority.product.id],
      ),
      0,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_runs",
        "product_id = ?",
        [authority.product.id],
      ),
      0,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_schedules",
        "product_id = ?",
        [authority.product.id],
      ),
      0,
    );

    for (const [index, lifecycle] of ["paused", "archived"].entries()) {
      await fixture.database
        .prepare("UPDATE products SET lifecycle = ?, revision = revision + 1 WHERE id = ?")
        .bind(lifecycle, authority.product.id)
        .run();
      const current = await fixture.database
        .prepare("SELECT revision FROM products WHERE id = ?")
        .bind(authority.product.id)
        .first();
      await assert.rejects(
        authority.readiness.makeProductReady(fixture.database, owner, {
          ...input,
          expectedProductRevision: current.revision,
          idempotencyKey: key(431 + index),
        }),
        new RegExp(lifecycle, "i"),
      );
    }
    await assert.rejects(
      authority.readiness.readProductReadiness(
        fixture.database,
        owner,
        "missing-product",
      ),
      /product|unavailable|authority/i,
    );
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-04 exhausted initial discovery becomes Needs attention without readiness rollback or a second run", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("product-ready-needs-attention");
  try {
    const authority = await seedProductAuthority(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const ready = await authority.readiness.makeProductReady(
      fixture.database,
      owner,
      readyInput(authority, key(440)),
    );
    const outcomeInput = {
      runId: ready.initialRun.id,
      expectedRunRevision: ready.initialRun.revision,
      outcome: "exhausted",
      reason: "fixed synthetic attempts exhausted",
      idempotencyKey: key(441),
    };
    const attention = await authority.readiness.markInitialDiscoveryNeedsAttention(
      fixture.database,
      owner,
      outcomeInput,
    );
    assert.equal(attention.status, "needs_attention");
    assert.equal(attention.run.id, ready.initialRun.id);
    assert.equal(attention.product.lifecycle, "ready");
    assert.deepEqual(
      await authority.readiness.markInitialDiscoveryNeedsAttention(
        fixture.database,
        owner,
        outcomeInput,
      ),
      attention,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_runs",
        "product_id = ? AND trigger_kind = 'initial'",
        [authority.product.id],
      ),
      1,
    );
    assert.equal(
      (
        await fixture.database
          .prepare("SELECT lifecycle FROM products WHERE id = ?")
          .bind(authority.product.id)
          .first()
      ).lifecycle,
      "ready",
    );
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("D-04 confirmed Product replacement activation creates one immutable material-change trigger lineage and nothing downstream", async (t) => {
  t.mock.method(Date, "now", () => FIXED_NOW);
  const fixture = await createD1Fixture("product-ready-material-change");
  try {
    const authority = await seedProductAuthority(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const ready = await authority.readiness.makeProductReady(
      fixture.database,
      owner,
      readyInput(authority, key(450)),
    );
    const current = authority.confirmed.find((version) => version.category === "capability");
    const proposed = await authority.knowledge.createKnowledgeProposal(
      fixture.database,
      owner,
      {
        origin: "owner_edit",
        destination: { scopeType: "product", id: authority.product.id },
        kind: "capability",
        value: { excerpt: "Materially changed confirmed capability policy." },
        source: {
          reference: "opaque:product-policy:capability-replacement",
          custody: "owner-confirmed synthetic test authority",
          retrievedAt: FIXED_NOW,
        },
        privacy: "private",
        license: { use: "internal_review_only" },
        reuseEligibility: "company_only",
        idempotencyKey: key(451),
      },
    );
    await assert.rejects(
      authority.readiness.consumeProductReplacementActivation(
        fixture.database,
        owner,
        {
          proposalId: proposed.id,
          expectedProductRevision: ready.product.revision,
          idempotencyKey: key(452),
        },
      ),
      /activation|confirmed|replacement/i,
    );
    const changed = await authority.knowledge.reviewKnowledgeProposal(
      fixture.database,
      owner,
      {
        proposalId: proposed.id,
        decision: "accept",
        expectedRevision: proposed.revision,
        idempotencyKey: key(453),
      },
    );
    const eligible = (
      await authority.replacement.readEligibleReplacementCandidates(
        fixture.database,
        owner,
      )
    ).find(
      (item) =>
        item.currentVersionId === current.id &&
        item.proposedVersionId === changed.version.id,
    );
    assert.ok(
      eligible?.candidate,
      "the replacement candidate must be created from the exact server projection",
    );
    const candidate = await authority.replacement.createReplacementCandidate(
      fixture.database,
      owner,
      { ...eligible.candidate, idempotencyKey: key(454) },
    );
    const drift = await fixture.database
      .prepare(
        "SELECT kd.proposal_id, kp.revision FROM knowledge_drifts kd JOIN knowledge_proposals kp ON kp.id = kd.proposal_id AND kp.workspace_id = kd.workspace_id WHERE kd.proposed_version_id = ? AND kd.workspace_id = (SELECT workspace_id FROM products WHERE id = ?) LIMIT 1",
      )
      .bind(changed.version.id, authority.product.id)
      .first();
    await authority.knowledge.reviewKnowledgeProposal(
      fixture.database,
      owner,
      {
        proposalId: drift.proposal_id,
        decision: "accept",
        expectedRevision: drift.revision,
        idempotencyKey: key(458),
      },
    );
    const reviewedCandidate = await authority.replacement.readReplacementState(
      fixture.database,
      owner,
      candidate.id,
    );
    const activated = await authority.replacement.activateReplacement(
      fixture.database,
      owner,
      {
        candidateId: candidate.id,
        impactDigest: candidate.impactDigest,
        expectedOwnerRevision: ready.configuration.revision,
        expectedCandidateRevision: reviewedCandidate.revision,
        idempotencyKey: key(455),
      },
    );
    assert.equal(activated.status, "activated");
    const activation = await fixture.database
      .prepare(
        "SELECT id, previous_configuration_id, next_configuration_id FROM configuration_activations WHERE replacement_candidate_id = ?",
      )
      .bind(candidate.id)
      .first();
    assert.equal(activation.previous_configuration_id, ready.configuration.id);
    assert.equal(activation.next_configuration_id, candidate.candidateConfigurationId);

    const events = await runRace([
      () =>
        authority.readiness.consumeProductReplacementActivation(
          fixture.database,
          owner,
          {
            activationId: activation.id,
            expectedProductRevision: ready.product.revision,
            idempotencyKey: key(456),
          },
        ),
      () =>
        authority.readiness.consumeProductReplacementActivation(
          fixture.database,
          owner,
          {
            activationId: activation.id,
            expectedProductRevision: ready.product.revision,
            idempotencyKey: key(457),
          },
        ),
    ]);
    assert.equal(events.every((event) => event.status === "fulfilled"), true);
    const [first, second] = events.map((event) => event.value);
    assert.equal(first.materialChangeRun.id, second.materialChangeRun.id);
    assert.equal(
      first.materialChangeRun.triggerKey,
      `material-change:product:${authority.product.id}:${candidate.candidateConfigurationId}`,
    );
    assert.equal(first.materialChangeRun.executionState, "blocked_missing_capability");
    assert.deepEqual(first.configurationLineage, {
      activationId: activation.id,
      predecessorConfigurationId: ready.configuration.id,
      successorConfigurationId: candidate.candidateConfigurationId,
      immutable: true,
    });
    assert.equal(
      await countWhere(
        fixture.database,
        "product_discovery_runs",
        "product_id = ? AND trigger_kind = 'material_change'",
        [authority.product.id],
      ),
      1,
    );
    assert.equal(
      await countWhere(
        fixture.database,
        "product_configuration_lineage",
        "replacement_activation_id = ?",
        [activation.id],
      ),
      1,
    );
    assert.deepEqual(
      await authority.readiness.consumeProductReplacementActivation(
        fixture.database,
        owner,
        {
          activationId: activation.id,
          expectedProductRevision: ready.product.revision,
          idempotencyKey: key(456),
        },
      ),
      first,
    );
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});
