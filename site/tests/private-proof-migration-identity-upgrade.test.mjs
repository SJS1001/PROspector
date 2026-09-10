import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { CANONICAL_MIGRATION_FILENAMES } from "../scripts/migration-chain.mjs";

const PREDECESSOR = "0019_person_discovery.sql";
const SUCCESSOR = "0020_private-synthetic-proof-migration-identity.sql";

test("0020 backfills legacy authorizations and enforces canonical immutable identities", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    await applyThrough(database, PREDECESSOR);
    const now = 1_780_000_000_000;
    const configurationDigest = "a".repeat(64);
    database.prepare(
      "INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)",
    ).run("legacy-workspace", "Synthetic migration fixture", "legacy-owner", now, now);
    database.prepare(
      "INSERT INTO products (id, workspace_id, created_at, updated_at, revision, name, lifecycle) VALUES (?, ?, ?, ?, 1, ?, 'ready')",
    ).run("legacy-product", "legacy-workspace", now, now, "Legacy product");
    database.prepare(
      `INSERT INTO typed_configurations
       (id, workspace_id, created_at, updated_at, revision, owner_type, owner_id,
        kind, digest, manifest_json, active)
       VALUES (?, ?, ?, ?, 1, 'product', ?, 'product_discovery', ?, '{}', 1)`,
    ).run("legacy-configuration", "legacy-workspace", now, now, "legacy-product", configurationDigest);
    database.prepare(
      `INSERT INTO product_discovery_runs
       (id, workspace_id, created_at, updated_at, revision, product_id,
        configuration_id, configuration_digest, trigger_kind, trigger_key,
        source_event_id, started_at, window_lower_exclusive, window_upper_inclusive,
        last_successful_watermark, successful_watermark, manifest_json,
        manifest_digest, policy_snapshot_json, policy_snapshot_digest,
        execution_state, operation_digest, idempotency_key, completed_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'initial', ?, NULL, ?, NULL, ?, NULL,
               NULL, '{}', ?, '{}', ?, 'blocked_missing_capability', ?, ?, NULL)`,
    ).run(
      "legacy-run", "legacy-workspace", now, now, "legacy-product",
      "legacy-configuration", configurationDigest,
      "initial:product:legacy-product:legacy-configuration", now, now,
      "b".repeat(64), "c".repeat(64), "d".repeat(64), "legacy-run-idempotency",
    );
    database.prepare(
      `INSERT INTO interview_sessions
       (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id, state, active_question_id)
       VALUES (?, ?, ?, ?, 1, 'product', ?, 'confirmed', NULL)`,
    ).run("legacy-session", "legacy-workspace", now, now, "legacy-product");
    database.prepare(
      `INSERT INTO interview_questions
       (id, workspace_id, created_at, updated_at, revision, session_id, version,
        prompt, research_json, recommendation, status)
       VALUES (?, ?, ?, ?, 1, ?, 1, ?, '{}', ?, 'confirmed')`,
    ).run(
      "legacy-question", "legacy-workspace", now, now, "legacy-session",
      "Authorize the legacy synthetic proof?", "Accept only this synthetic fixture.",
    );
    database.prepare(
      `INSERT INTO knowledge_versions
       (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id,
        kind, value_json, status, source_digest)
       VALUES (?, ?, ?, ?, 1, 'product', ?, ?, '{}', 'confirmed', ?)`,
    ).run(
      "legacy-version", "legacy-workspace", now, now, "legacy-product",
      "private-hosted-synthetic-proposal-proof", "e".repeat(64),
    );
    database.prepare(
      `INSERT INTO interview_answers
       (id, workspace_id, session_id, question_id, question_revision, choice,
        correction_json, idempotency_key, operation_digest, proposal_json,
        proposal_digest, created_at)
       VALUES (?, ?, ?, ?, 1, 'accept', NULL, ?, ?, '{}', ?, ?)`,
    ).run(
      "legacy-answer", "legacy-workspace", "legacy-session", "legacy-question",
      "legacy-answer-idempotency", "f".repeat(64), "0".repeat(64), now,
    );
    database.prepare(
      `INSERT INTO interview_confirmations
       (id, workspace_id, session_id, question_id, answer_id, decision,
        knowledge_version_id, idempotency_key, operation_digest, created_at)
       VALUES (?, ?, ?, ?, ?, 'accept', ?, ?, ?, ?)`,
    ).run(
      "legacy-confirmation", "legacy-workspace", "legacy-session", "legacy-question",
      "legacy-answer", "legacy-version", "legacy-confirmation-idempotency",
      "1".repeat(64), now,
    );
    database.prepare(
      `INSERT INTO private_synthetic_proof_authorizations
       (id, workspace_id, owner_subject_id, product_id, expected_product_revision,
        interview_confirmation_id, confirmed_knowledge_version_id, run_id,
        configuration_id, configuration_digest, reviewed_source_revision,
        migration_digest, fixture_digest, fixture_provenance, evidence_reference,
        capability, authorization_digest, expires_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "legacy-authorization", "legacy-workspace", "legacy-owner", "legacy-product",
      "legacy-confirmation", "legacy-version", "legacy-run", "legacy-configuration",
      configurationDigest, "b".repeat(40), "c".repeat(64), "d".repeat(64),
      "synthetic_private_proof:legacy:v1", "opaque:legacy-proof",
      "private-hosted-synthetic-proposal-proof", "e".repeat(64), now + 1, now,
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);

    await applyThrough(database, SUCCESSOR, PREDECESSOR);

    const columns = database.prepare("PRAGMA table_info(private_synthetic_proof_authorizations)").all();
    const identity = columns.find((column) => column.name === "migration_identity");
    assert.ok(identity);
    assert.equal(Number(identity.notnull), 1);
    assert.equal(identity.dflt_value, "'legacy-unbound'");
    assert.equal(
      database.prepare("SELECT migration_identity FROM private_synthetic_proof_authorizations WHERE id = ?").get("legacy-authorization").migration_identity,
      "legacy-unbound",
    );

    await assert.rejects(
      Promise.resolve().then(() => database.prepare(
        `INSERT INTO private_synthetic_proof_authorizations
         (id, workspace_id, owner_subject_id, product_id, expected_product_revision,
          interview_confirmation_id, confirmed_knowledge_version_id, run_id,
          configuration_id, configuration_digest, reviewed_source_revision,
          migration_digest, fixture_digest, fixture_provenance, evidence_reference,
          capability, authorization_digest, expires_at, created_at, migration_identity)
         SELECT 'invalid-authorization', workspace_id, owner_subject_id, product_id,
                expected_product_revision, interview_confirmation_id,
                confirmed_knowledge_version_id, run_id, configuration_id,
                configuration_digest, reviewed_source_revision, migration_digest,
                fixture_digest, fixture_provenance,
                'opaque:invalid-proof', capability, ?, expires_at, created_at
                , 'legacy-unbound'
         FROM private_synthetic_proof_authorizations WHERE id = 'legacy-authorization'`,
      ).run("f".repeat(64))),
      /invalid private synthetic proof migration identity/u,
    );

    database.prepare(
      `INSERT INTO private_synthetic_proof_authorizations
       (id, workspace_id, owner_subject_id, product_id, expected_product_revision,
        interview_confirmation_id, confirmed_knowledge_version_id, run_id,
        configuration_id, configuration_digest, reviewed_source_revision,
        migration_digest, fixture_digest, fixture_provenance, evidence_reference,
        capability, authorization_digest, expires_at, created_at, migration_identity)
       SELECT 'canonical-authorization', workspace_id, owner_subject_id, product_id,
              expected_product_revision, interview_confirmation_id,
              confirmed_knowledge_version_id, run_id, configuration_id,
              configuration_digest, reviewed_source_revision, migration_digest,
              fixture_digest, fixture_provenance,
              'opaque:canonical-proof', capability, ?, expires_at, created_at
              , 'canonical-chain-0020-private-synthetic-proof-migration-identity'
       FROM private_synthetic_proof_authorizations WHERE id = 'legacy-authorization'`,
    ).run("0".repeat(64));
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    await assert.rejects(
      Promise.resolve().then(() => database.prepare(
        "UPDATE private_synthetic_proof_authorizations SET migration_identity = ? WHERE id = ?",
      ).run("canonical-chain-0021-replacement", "canonical-authorization")),
      /migration identity is immutable/u,
    );
  } finally {
    database.close();
  }
});

async function applyThrough(database, finalFilename, afterFilename = null) {
  const finalIndex = CANONICAL_MIGRATION_FILENAMES.indexOf(finalFilename);
  const afterIndex = afterFilename === null ? -1 : CANONICAL_MIGRATION_FILENAMES.indexOf(afterFilename);
  assert.notEqual(finalIndex, -1);
  assert.ok(finalIndex > afterIndex);
  for (const filename of CANONICAL_MIGRATION_FILENAMES.slice(afterIndex + 1, finalIndex + 1)) {
    const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
}
