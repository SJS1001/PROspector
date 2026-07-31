import assert from "node:assert/strict";
import test from "node:test";

import {
  applyControlledEnrichmentBaseMigrations,
  applyControlledEnrichmentUpgrade,
  applyMigrations,
  createD1Fixture,
} from "./helpers/d1.mjs";

const NOW = 1_790_000_000_000;

async function schemaNames(database, type) {
  return (await database.prepare(
    "SELECT name FROM sqlite_master WHERE type=? ORDER BY name",
  ).bind(type).all()).results.map((row) => row.name);
}

async function insertGate(database, workspaceId, capability, suffix) {
  return database.prepare(
    `INSERT INTO phase_activation_gates (
      id,workspace_id,capability,authorization_reference,target_project_deployment,
      reviewed_source_digest,migration_identity_status,post_migration_evidence_reference,
      independent_review_reference,deployed_boundary_proof_reference,tuple_digest,accepted_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    `gate-${suffix}`, workspaceId, capability, `authorization-${suffix}`, `deployment-${suffix}`,
    `${suffix.padEnd(64, "a").slice(0, 64)}`, `migration-${suffix}`, `post-migration-${suffix}`,
    `review-${suffix}`, `boundary-${suffix}`, `${suffix.padEnd(64, "b").slice(0, 64)}`, NOW, NOW,
  ).run();
}

test("0009 upgrades the exact deployed 0008 schema and restores every prior trigger", async () => {
  const fixture = await createD1Fixture("migration-0009-upgrade");
  try {
    await applyControlledEnrichmentBaseMigrations(fixture.database);
    await fixture.database.prepare(
      "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('upgrade-0009','Upgrade','owner-0009',?,?,4)",
    ).bind(NOW, NOW).run();
    const preservedWorkspace = await fixture.database.prepare(
      "SELECT * FROM workspaces WHERE id='upgrade-0009'",
    ).first();
    const triggersBefore = await schemaNames(fixture.database, "trigger");
    const oldGrantColumns = (await fixture.database.prepare("PRAGMA table_info(runner_spend_grants)").all()).results.map((row) => row.name);
    assert.equal(oldGrantColumns.includes("source_revision"), false);

    await applyControlledEnrichmentUpgrade(fixture.database);

    assert.deepEqual(
      await fixture.database.prepare("SELECT * FROM workspaces WHERE id='upgrade-0009'").first(),
      preservedWorkspace,
    );
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
    const triggersAfter = await schemaNames(fixture.database, "trigger");
    for (const trigger of triggersBefore) {
      assert.ok(triggersAfter.includes(trigger), `0009 must preserve trigger ${trigger}`);
    }
    for (const trigger of [
      "contact_verification_receipt_scope_guard",
      "immutable_contact_verification_receipts_update",
      "immutable_contact_verification_receipts_delete",
      "runner_spend_grant_scope_guard",
      "runner_budget_account_scope_guard",
      "runner_budget_account_update_guard",
      "runner_reservation_scope_guard",
      "contact_eligibility_scope_guard",
      "identity_suggestion_shape_guard",
      "identity_candidate_shape_guard",
      "identity_decision_shape_guard",
      "identity_lineage_shape_guard",
    ]) assert.ok(triggersAfter.includes(trigger), `0009 must install trigger ${trigger}`);
    assert.ok((await schemaNames(fixture.database, "index")).includes("identity_lineage_edge_unique"));
    const eligibilityTrigger = await fixture.database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='contact_eligibility_scope_guard'",
    ).first();
    assert.match(eligibilityTrigger.sql, /projected_at\s*<\s*o\.verified_at\s*\+\s*2592000000/);
    assert.match(eligibilityTrigger.sql, /projected_at\s*<\s*o\.verified_at\s*\+\s*7776000000/);

    const grantColumns = (await fixture.database.prepare("PRAGMA table_info(runner_spend_grants)").all()).results.map((row) => row.name);
    for (const column of ["source_revision", "idempotency_key", "request_digest", "authority_command_id", "audit_event_id"]) {
      assert.ok(grantColumns.includes(column), `runner_spend_grants.${column} must exist after 0009`);
    }
    const accountColumns = (await fixture.database.prepare("PRAGMA table_info(runner_budget_accounts)").all()).results.map((row) => row.name);
    for (const column of ["created_by_grant_id", "authority_command_id", "audit_event_id", "account_digest"]) {
      assert.ok(accountColumns.includes(column), `runner_budget_accounts.${column} must exist after 0009`);
    }
    const observationColumns = (await fixture.database.prepare("PRAGMA table_info(contact_point_observations)").all()).results.map((row) => row.name);
    assert.ok(observationColumns.includes("verification_receipt_id"));
    assert.equal(
      (await fixture.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_verification_receipts'").first())?.name,
      "contact_verification_receipts",
    );
    const staleNames = (await fixture.database.prepare(
      "SELECT name,sql FROM sqlite_master WHERE sql LIKE '%__new_runner_%'",
    ).all()).results;
    assert.deepEqual(staleNames, [], "renamed tables must not remain in constraints or schema SQL");
  } finally {
    await fixture.dispose();
  }
});

test("0009 fresh chain keeps every capability gate fail-closed", async () => {
  const fixture = await createD1Fixture("migration-0009-fresh");
  try {
    await applyMigrations(fixture.database);
    await fixture.database.prepare(
      "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('fresh-0009','Fresh','owner-0009',?,?,1)",
    ).bind(NOW, NOW).run();
    await fixture.database.batch([
      fixture.database.prepare(
        "INSERT INTO companies (id,workspace_id,created_at,updated_at,revision,name,status) VALUES ('impact-company','fresh-0009',?,?,1,'Impact','active')",
      ).bind(NOW, NOW),
      fixture.database.prepare(
        "INSERT INTO products (id,workspace_id,created_at,updated_at,revision,company_id,name,lifecycle) VALUES ('impact-product','fresh-0009',?,?,1,'impact-company','Impact Product','ready')",
      ).bind(NOW, NOW),
      fixture.database.prepare(
        "INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES ('impact-play','fresh-0009',?,?,1,'impact-product','Impact Play','active')",
      ).bind(NOW, NOW),
      fixture.database.prepare(
        "INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('impact-c1','fresh-0009',?,?,1,'impact-company',?,'Impact One')",
      ).bind(NOW, NOW, "1".repeat(64)),
      fixture.database.prepare(
        "INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('impact-c2','fresh-0009',?,?,1,'impact-company',?,'Impact Two')",
      ).bind(NOW, NOW, "2".repeat(64)),
      fixture.database.prepare(
        "INSERT INTO contact_relevance (id,workspace_id,created_at,updated_at,revision,play_id,contact_id,relevance_json) VALUES ('impact-association','fresh-0009',?,?,1,'impact-play','impact-c1','{}')",
      ).bind(NOW, NOW),
      fixture.database.prepare(
        `INSERT INTO identity_suggestions (
          id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,
          source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,
          retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at
        ) VALUES ('impact-suggestion','fresh-0009','owner-0009','contact','merge',2,
          '{"impact-c1":1,"impact-c2":1}','["impact-c1","impact-c2"]',
          '["impact-c1","impact-c2"]','[]','[]',NULL,?,?)`,
      ).bind("3".repeat(64), NOW),
      fixture.database.prepare(
        "INSERT INTO identity_suggestion_candidates (id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal) VALUES ('impact-child-1','fresh-0009','impact-suggestion','impact-c1',1,0)",
      ),
      fixture.database.prepare(
        "INSERT INTO identity_suggestion_candidates (id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal) VALUES ('impact-child-2','fresh-0009','impact-suggestion','impact-c2',1,1)",
      ),
    ]);
    await assert.rejects(
      insertGate(fixture.database, "fresh-0009", "consensus_knowledge", "consensus"),
      /trusted server authorization anchor/,
    );
    await assert.rejects(
      insertGate(fixture.database, "fresh-0009", "unknown_capability", "unknown"),
      /trusted server authorization anchor/,
    );
    await assert.rejects(
      insertGate(fixture.database, "fresh-0009", "controlled_enrichment", "controlled"),
      /trusted server authorization anchor/,
    );
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO identity_suggestions (
          id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,
          source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,
          retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at
        ) VALUES ('incomplete-merge','fresh-0009','owner-0009','contact','merge',1,
          '{"only-one":1}','["only-one"]','["only-one"]','[]','[]',NULL,?,?)`,
      ).bind("c".repeat(64), NOW).run(),
      /invalid identity suggestion cardinality/,
    );
    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO identity_suggestions (
          id,workspace_id,owner_subject,subject_kind,kind,revision,candidate_revisions_json,
          source_lineage_ids_json,retained_identity_lineage_ids_json,retained_aliases_json,
          retained_suppression_subject_refs_json,proposed_partition_json,suggestion_digest,created_at
        ) VALUES ('empty-split','fresh-0009','owner-0009','contact','split',1,
          '{"split-source":1}','["split-source"]','["split-source"]','[]','[]',
          '{"moveAssociationIds":[],"newIdentityId":"new-identity","sourceId":"split-source"}',?,?)`,
      ).bind("d".repeat(64), NOW).run(),
      /invalid identity split partition/,
    );
    const impactInsert = (id, associationId, subjectId, relevanceId, scope = "market_play") => fixture.database.prepare(
      `INSERT INTO identity_suggestion_impacts
        (id,workspace_id,suggestion_id,association_id,scope,relevance_id,subject_id,impact_digest)
       VALUES (?,'fresh-0009','impact-suggestion',?,?,?,?,?)`,
    ).bind(
      id,
      associationId,
      scope,
      relevanceId,
      subjectId,
      Array.from(id, (character) => character.codePointAt(0).toString(16).padStart(2, "0")).join("").padEnd(64, "a").slice(0, 64),
    );
    for (const [id, associationId, subjectId, relevanceId, scope] of [
      ["impact-missing", "missing-association", "impact-c1", "impact-play", "market_play"],
      ["impact-wrong-subject", "impact-association", "impact-c2", "impact-play", "market_play"],
      ["impact-wrong-relevance", "impact-association", "impact-c1", "other-play", "market_play"],
      ["impact-wrong-kind", "impact-association", "impact-c1", "impact-play", "customer_profile"],
    ]) {
      await assert.rejects(impactInsert(id, associationId, subjectId, relevanceId, scope).run(), /invalid identity impact scope/);
    }
    await impactInsert("impact-valid", "impact-association", "impact-c1", "impact-play").run();
    assert.equal(Number((await fixture.database.prepare(
      "SELECT count(*) AS count FROM phase_activation_gates WHERE workspace_id='fresh-0009'",
    ).first()).count), 0);
    assert.equal(Number((await fixture.database.prepare(
      "SELECT count(*) AS count FROM identity_suggestions WHERE workspace_id='fresh-0009'",
    ).first()).count), 1);
    assert.equal(Number((await fixture.database.prepare(
      "SELECT count(*) AS count FROM identity_suggestion_impacts WHERE workspace_id='fresh-0009'",
    ).first()).count), 1);
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    await fixture.dispose();
  }
});

test("0009 refuses to fabricate authority for nonempty legacy runner ledgers", async () => {
  const fixture = await createD1Fixture("migration-0009-legacy-runner-guard");
  try {
    await applyControlledEnrichmentBaseMigrations(fixture.database);
    await fixture.database.prepare(
      "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('legacy-runner','Legacy','owner-legacy',?,?,1)",
    ).bind(NOW, NOW).run();
    await fixture.database.prepare(
      `INSERT INTO runner_spend_grants (
        id,workspace_id,owner_subject,provider_id,model,catalog_ref,run_type,scope_id,
        per_run_cost_minor,monthly_cost_minor,currency,max_retries,grant_digest,nonce,expires_at,created_at
      ) VALUES ('legacy-grant','legacy-runner','owner-legacy','provider','model','catalog','type','scope',1,1,'CAD',0,?,?,?,?)`,
    ).bind("a".repeat(64), "legacy-nonce", NOW + 1_000, NOW).run();
    await assert.rejects(
      applyControlledEnrichmentUpgrade(fixture.database),
      /trusted server authorization anchor/,
      "0009 must stop instead of inventing command, audit, or account lineage",
    );
    assert.equal(
      await fixture.database.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='contact_verification_receipts'",
      ).first(),
      null,
      "the first-statement guard must leave no partially applied 0009 schema",
    );
  } finally {
    await fixture.dispose();
  }
});
