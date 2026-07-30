import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

export const MIGRATION_FILENAMES = [
  "0000_jittery_meteorite.sql",
  "0001_true_spencer_smythe.sql",
  "0002_eager_supreme_intelligence.sql",
  "0003_acoustic_magik.sql",
  "0004_consensus_knowledge.sql",
  "0005_even_mastermind.sql",
  "0006_private-proof-run-binding.sql",
];

const LEGACY_MIGRATION_FILENAMES = MIGRATION_FILENAMES.slice(0, 4);
const appliedMigrations = new WeakMap();

export const FORBIDDEN_OPERATIONAL_TABLES = [
  "profile_readiness_activations",
  "prospecting_schedules",
  "prospecting_runs",
  "runner_assignments",
  "runner_connections",
  "runs",
  "accounts",
  "targets",
  "signals",
  "candidates",
  "prospects",
  "contacts",
  "schedules",
  "approval_grants",
  "provider_grants",
  "provider_calls",
  "outreach_packages",
  "outreach_package_approvals",
  "message_versions",
  "message_approvals",
  "message_dispatches",
  "manual_calls",
  "export_jobs",
  "external_effects",
];

export async function createD1Fixture(name = "prospector-authority-test") {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: name },
  });
  return {
    vite,
    miniflare,
    database: await miniflare.getD1Database("DB"),
    async dispose() {
      await vite.close();
      await miniflare.dispose();
    },
  };
}

export async function applyMigrations(database, filenames = MIGRATION_FILENAMES) {
  assert.deepEqual(filenames, MIGRATION_FILENAMES, "Authority fixtures require the exact 0000-0006 migration chain");
  await applyMigrationFiles(database, filenames);
}

async function applyLegacyMigrations(database) {
  await applyMigrationFiles(database, LEGACY_MIGRATION_FILENAMES);
}

async function applyMigrationFiles(database, filenames) {
  let applied = appliedMigrations.get(database);
  if (!applied) {
    applied = new Set();
    appliedMigrations.set(database, applied);
  }
  for (const filename of filenames) {
    if (applied.has(filename)) continue;
    const sql = await readFile(new URL(`../../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
    applied.add(filename);
  }
}

export async function seedBoundHistorian(database) {
  await applyLegacyMigrations(database);
  return seedHistorian(database, { suffix: "bound", proposalDigest: "proposal-bound-digest" });
}

export async function seedLegacyUnboundHistorian(database) {
  await applyLegacyMigrations(database);
  return seedHistorian(database, { suffix: "unbound", proposalDigest: "legacy-unbound" });
}

export async function seedCoexistenceHistorian(database) {
  await applyLegacyMigrations(database);
  const bound = await seedHistorian(database, { suffix: "coexist-bound", proposalDigest: "proposal-bound-digest" });
  const legacy = await seedHistorian(database, { suffix: "coexist-unbound", proposalDigest: "legacy-unbound" });
  return { bound, legacy };
}

async function seedHistorian(database, { suffix, proposalDigest }) {
  const now = 1_700_000_000_000;
  const workspaceId = `workspace-${suffix}`;
  const sessionId = `session-${suffix}`;
  const questionId = `question-${suffix}`;
  const answerId = `answer-${suffix}`;
  const knowledgeVersionId = `knowledge-${suffix}`;
  const confirmationId = `confirmation-${suffix}`;
  await database.batch([
    database.prepare("INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)").bind(workspaceId, "Digitalrain", `owner-${suffix}`, now, now),
    database.prepare("INSERT INTO interview_sessions (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id, state, active_question_id) VALUES (?, ?, ?, ?, 3, 'company', ?, 'completed', NULL)").bind(sessionId, workspaceId, now, now, workspaceId),
    database.prepare("INSERT INTO interview_questions (id, workspace_id, created_at, updated_at, revision, session_id, version, prompt, research_json, recommendation, status) VALUES (?, ?, ?, ?, 1, ?, 1, ?, ?, ?, 'closed')").bind(questionId, workspaceId, now, now, sessionId, "Historian readiness question", '{"source":"synthetic"}', "Confirm readiness"),
    database.prepare("INSERT INTO knowledge_versions (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id, kind, value_json, status, source_digest) VALUES (?, ?, ?, ?, 1, 'company', ?, 'historian_readiness', ?, 'confirmed', ?)").bind(knowledgeVersionId, workspaceId, now, now, workspaceId, '{"classification":"partial_readiness","score":1}', proposalDigest),
    database.prepare("INSERT INTO interview_answers (id, workspace_id, session_id, question_id, question_revision, choice, correction_json, idempotency_key, created_at, operation_digest, proposal_json, proposal_digest) VALUES (?, ?, ?, ?, 1, 'accept_recommendation', NULL, ?, ?, ?, ?, ?)").bind(answerId, workspaceId, sessionId, questionId, `answer-key-${suffix}`, now, `answer-operation-${suffix}`, '{"classification":"partial_readiness","score":1}', proposalDigest),
    database.prepare("INSERT INTO interview_confirmations (id, workspace_id, session_id, question_id, answer_id, decision, knowledge_version_id, idempotency_key, created_at, operation_digest) VALUES (?, ?, ?, ?, ?, 'accept', ?, ?, ?, ?)").bind(confirmationId, workspaceId, sessionId, questionId, answerId, knowledgeVersionId, `confirmation-key-${suffix}`, now, `confirmation-operation-${suffix}`),
    database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'interview.confirmed', 'knowledge_version', ?, ?, ?)").bind(`audit-${suffix}`, workspaceId, `owner-${suffix}`, knowledgeVersionId, '{"synthetic":true,"digest":"historian"}', now),
  ]);
  return { workspaceId, sessionId, questionId, answerId, confirmationId, knowledgeVersionId, proposalDigest };
}

export async function snapshotForbiddenOperationalRows(database) {
  const snapshot = {};
  for (const table of FORBIDDEN_OPERATIONAL_TABLES) {
    const exists = await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first();
    snapshot[table] = exists
      ? { present: true, count: await countRows(database, table) }
      : { present: false, count: null };
  }
  return snapshot;
}

export async function assertForbiddenOperationalRowsUnchanged(database, before) {
  assert.deepEqual(await snapshotForbiddenOperationalRows(database), before, "Phase 3 authority commands must not create downstream operational effects");
}

export async function countRows(database, table, where = "1 = 1", bindings = []) {
  const row = await database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).bind(...bindings).first();
  return Number(row.count);
}

export async function runRace(commands) {
  return Promise.allSettled(commands.map((command) => command()));
}
