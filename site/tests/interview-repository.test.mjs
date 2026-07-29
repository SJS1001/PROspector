import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

const SUBJECT_PEPPER = "test-only-subject-pepper-with-at-least-32-bytes";

test("owner-scoped interview separates answer submission from confirmation", async () => {
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
      SUBJECT_PEPPER,
    );
    const outsider = await domain.principalFromIdentity(
      "other@example.com",
      "Other Owner",
      SUBJECT_PEPPER,
    );
    assert.doesNotMatch(owner.subject, /@|owner|example/i);
    assert.equal(owner.subject.length, 64);

    assert.equal((await domain.readInterviewState(database, owner)).status, "uninitialized");
    assert.equal((await domain.readInterviewState(database, outsider)).status, "uninitialized");

    const active = await domain.bootstrapInterview(database, owner);
    assert.equal(active.status, "active");
    assert.match(active.question.provenance, /policy question/i);
    assert.equal((await domain.bootstrapInterview(database, owner)).status, "active");
    assert.equal(await count(database, "workspaces"), 1);
    assert.equal(await count(database, "interview_sessions"), 1);
    assert.equal(await count(database, "interview_questions"), 1);
    assert.equal(await count(database, "audit_events"), 1);

    const answerInput = {
      questionId: active.question.id,
      expectedRevision: active.question.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000001",
    };
    const awaiting = await domain.submitRecommendationAnswer(database, owner, answerInput);
    assert.equal(awaiting.status, "awaiting_confirmation");
    assert.equal(awaiting.session.revision, 2);
    assert.equal(await count(database, "interview_answers"), 1);
    assert.equal(await count(database, "interview_confirmations"), 0);
    assert.equal(await count(database, "knowledge_versions"), 0);
    assert.equal(await count(database, "audit_events"), 2);
    assert.deepEqual(
      await domain.submitRecommendationAnswer(database, owner, answerInput),
      awaiting,
    );
    await assert.rejects(
      domain.submitRecommendationAnswer(database, owner, {
        ...answerInput,
        expectedRevision: 99,
      }),
      (error) => error?.code === "interview_conflict",
    );

    const confirmationInput = {
      answerId: awaiting.answer.id,
      expectedSessionRevision: awaiting.session.revision,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000002",
    };
    const confirmed = await domain.confirmSubmittedAnswer(
      database,
      owner,
      confirmationInput,
    );
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.confirmed.value.score, 1);
    assert.equal(confirmed.confirmed.value.classification, "partial_readiness");
    assert.deepEqual(
      await domain.confirmSubmittedAnswer(database, owner, confirmationInput),
      confirmed,
    );
    assert.equal(await count(database, "interview_answers"), 1);
    assert.equal(await count(database, "interview_confirmations"), 1);
    assert.equal(await count(database, "knowledge_versions"), 1);
    assert.equal(await count(database, "audit_events"), 3);
    await assert.rejects(
      domain.confirmSubmittedAnswer(database, owner, {
        ...confirmationInput,
        expectedSessionRevision: 77,
      }),
      (error) => error?.code === "interview_conflict",
    );

    const outsiderActive = await domain.bootstrapInterview(database, outsider);
    assert.equal(outsiderActive.status, "active");
    assert.notEqual(outsiderActive.workspace.id, active.workspace.id);
    await assert.rejects(
      domain.submitRecommendationAnswer(database, outsider, {
        ...answerInput,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000003",
      }),
      (error) => error?.code === "interview_conflict",
    );

    const answerRace = await Promise.allSettled([
      domain.submitRecommendationAnswer(database, outsider, {
        questionId: outsiderActive.question.id,
        expectedRevision: outsiderActive.question.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000004",
      }),
      domain.submitRecommendationAnswer(database, outsider, {
        questionId: outsiderActive.question.id,
        expectedRevision: outsiderActive.question.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000005",
      }),
    ]);
    assert.equal(answerRace.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(answerRace.filter((result) => result.status === "rejected").length, 1);

    const outsiderAwaiting = await domain.readInterviewState(database, outsider);
    assert.equal(outsiderAwaiting.status, "awaiting_confirmation");
    const confirmationRace = await Promise.allSettled([
      domain.confirmSubmittedAnswer(database, outsider, {
        answerId: outsiderAwaiting.answer.id,
        expectedSessionRevision: outsiderAwaiting.session.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000006",
      }),
      domain.confirmSubmittedAnswer(database, outsider, {
        answerId: outsiderAwaiting.answer.id,
        expectedSessionRevision: outsiderAwaiting.session.revision,
        idempotencyKey: "0198a4b0-0000-7000-8000-000000000007",
      }),
    ]);
    assert.equal(confirmationRace.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(confirmationRace.filter((result) => result.status === "rejected").length, 1);
    assert.equal((await domain.readInterviewState(database, outsider)).status, "confirmed");
    assert.equal((await domain.readInterviewState(database, owner)).status, "confirmed");
    assert.equal(await count(database, "interview_answers"), 2);
    assert.equal(await count(database, "interview_confirmations"), 2);
    assert.equal(await count(database, "knowledge_versions"), 2);

    const auditRows = await database
      .prepare("SELECT actor_id, detail_json FROM audit_events ORDER BY created_at")
      .all();
    assert.equal(auditRows.results.every((row) => row.actor_id.length === 64), true);
    assert.doesNotMatch(JSON.stringify(auditRows.results), /owner@example|other@example|historian connectivity demonstrates/i);
  } finally {
    await vite.close();
    await miniflare.dispose();
  }
});

export async function applyMigrations(database) {
  for (const filename of [
    "0000_jittery_meteorite.sql",
    "0001_true_spencer_smythe.sql",
    "0002_eager_supreme_intelligence.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
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
