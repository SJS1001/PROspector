import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

test("owner-scoped interview persists one idempotent confirmed decision and audit", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "prospector-interview-test" },
  });

  try {
    const database = await miniflare.getD1Database("DB");
    await applyMigrations(database);
    const domain = await vite.ssrLoadModule(
      new URL("../domain/interview.ts", import.meta.url).pathname,
    );

    const owner = await domain.principalFromIdentity(
      "Owner@Example.com",
      "Test Owner",
    );
    const outsider = await domain.principalFromIdentity(
      "other@example.com",
      "Other Owner",
    );
    assert.doesNotMatch(owner.subject, /@|owner|example/i);

    assert.equal((await domain.readInterviewState(database, owner)).status, "uninitialized");
    assert.equal((await domain.readInterviewState(database, outsider)).status, "uninitialized");

    const active = await domain.bootstrapInterview(database, owner);
    assert.equal(active.status, "active");
    assert.equal(active.question.revision, 1);
    assert.equal((await domain.bootstrapInterview(database, owner)).status, "active");
    assert.equal(await count(database, "workspaces"), 1);
    assert.equal(await count(database, "interview_sessions"), 1);
    assert.equal(await count(database, "interview_questions"), 1);
    assert.equal(await count(database, "audit_events"), 1);

    const input = {
      questionId: active.question.id,
      expectedRevision: active.question.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000001",
    };
    const confirmed = await domain.confirmRecommendation(database, owner, input);
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.confirmed.value.score, 1);
    assert.equal(confirmed.confirmed.value.classification, "partial_readiness");

    const retry = await domain.confirmRecommendation(database, owner, input);
    assert.deepEqual(retry, confirmed);
    assert.equal(await count(database, "interview_answers"), 1);
    assert.equal(await count(database, "interview_confirmations"), 1);
    assert.equal(await count(database, "knowledge_versions"), 1);
    assert.equal(await count(database, "audit_events"), 2);

    await assert.rejects(
      domain.confirmRecommendation(database, owner, {
        ...input,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000002",
      }),
      (error) => error?.code === "interview_conflict",
    );

    assert.equal((await domain.readInterviewState(database, outsider)).status, "uninitialized");
    const audit = await database
      .prepare("SELECT actor_id, detail_json FROM audit_events WHERE action = ?")
      .bind("interview.recommendation_confirmed")
      .first();
    assert.equal(audit.actor_id, owner.subject);
    assert.doesNotMatch(audit.detail_json, /owner@example|historian|rationale/i);
  } finally {
    await vite.close();
    await miniflare.dispose();
  }
});

async function applyMigrations(database) {
  for (const filename of [
    "0000_jittery_meteorite.sql",
    "0001_true_spencer_smythe.sql",
  ]) {
    const sql = await readFile(
      new URL(`../drizzle/${filename}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
  }
}

async function count(database, table) {
  const allowed = new Set([
    "workspaces",
    "interview_sessions",
    "interview_questions",
    "interview_answers",
    "interview_confirmations",
    "knowledge_versions",
    "audit_events",
  ]);
  if (!allowed.has(table)) throw new Error("Unexpected test table");
  const row = await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row.count);
}
