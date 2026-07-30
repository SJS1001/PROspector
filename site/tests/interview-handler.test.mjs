import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

const SUBJECT_PEPPER = "test-only-handler-pepper-with-at-least-32-bytes";
const ORIGIN = "https://prospector.example";

test("interview handler trusts injected identity and enforces one-time owner-bound CSRF", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "prospector-handler-test" },
  });

  try {
    const database = await miniflare.getD1Database("DB");
    await applyMigrations(database);
    const { handleInterviewGet, handleInterviewPost } = await vite.ssrLoadModule(
      new URL("../domain/interview-handler.ts", import.meta.url).pathname,
    );
    const anonymous = dependencies(database, null);
    assert.deepEqual(
      await denied(await handleInterviewGet(anonymous)),
      { error: "private_workspace_unavailable" },
    );
    assert.deepEqual(
      await denied(await handleInterviewPost(mutation("bootstrap", "fake", {
        "oai-authenticated-user-email": "owner@example.com",
      }), anonymous)),
      { error: "private_workspace_unavailable" },
    );

    const owner = dependencies(database, {
      email: "owner@example.com",
      displayName: "Owner",
    });
    let result = await stateResult(await handleInterviewGet(owner));
    let state = result.state;
    let csrfCookie = result.csrfCookie;
    assert.equal(state.status, "uninitialized");
    assert.equal("csrfToken" in state, false);

    assert.equal((await handleInterviewPost(mutation("bootstrap", ""), owner)).status, 403);
    const foreign = mutation("bootstrap", csrfCookie, { origin: "https://attacker.example" });
    assert.equal((await handleInterviewPost(foreign, owner)).status, 403);

    const bootstrapToken = csrfCookie;
    result = await stateResult(await handleInterviewPost(mutation("bootstrap", bootstrapToken), owner));
    state = result.state;
    csrfCookie = result.csrfCookie;
    assert.equal(state.status, "active");
    assert.equal((await handleInterviewPost(mutation("bootstrap", bootstrapToken), owner)).status, 403);

    const outsider = dependencies(database, {
      email: "outsider@example.com",
      displayName: "Outsider",
    });
    const countsBeforeOutsider = await rowCounts(database);
    assert.deepEqual(
      await denied(await handleInterviewGet(outsider)),
      { error: "private_workspace_unavailable" },
    );
    assert.deepEqual(
      await denied(
        await handleInterviewPost(
          mutation("bootstrap", csrfCookie),
          outsider,
        ),
      ),
      { error: "private_workspace_unavailable" },
    );
    assert.deepEqual(await rowCounts(database), countsBeforeOutsider);

    const answerBody = {
      action: "submit_recommendation_answer",
      questionId: state.question.id,
      expectedRevision: state.question.revision,
      idempotencyKey: "0198a4b0-1000-7000-8000-000000000001",
    };
    result = await stateResult(await handleInterviewPost(mutation(answerBody, csrfCookie), owner));
    state = result.state;
    csrfCookie = result.csrfCookie;
    assert.equal(state.status, "awaiting_confirmation");

    result = await stateResult(await handleInterviewPost(mutation({
      action: "confirm_submitted_answer",
      answerId: state.answer.id,
      expectedSessionRevision: state.session.revision,
      idempotencyKey: "0198a4b0-1000-7000-8000-000000000003",
    }, csrfCookie), owner));
    state = result.state;
    assert.equal(state.status, "confirmed");
    assert.equal((await json(await handleInterviewGet(owner))).status, "confirmed");

    const routeSource = await readFile(
      new URL("../app/api/interview/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(routeSource, /getChatGPTUser/);
    assert.doesNotMatch(routeSource, /authenticated-user-email|request\.headers/i);
  } finally {
    await vite.close();
    await miniflare.dispose();
  }
});

function dependencies(database, identity) {
  return {
    database,
    subjectPepper: SUBJECT_PEPPER,
    pilotOwnerEmail: "owner@example.com",
    getIdentity: async () => identity,
  };
}

function mutation(body, csrf, extraHeaders = {}) {
  return new Request(`${ORIGIN}/api/interview`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "x-prospector-intent": "interview-mutation",
      ...(csrf ? { cookie: csrf } : {}),
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(typeof body === "string" ? { action: body } : body),
  });
}

async function json(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

async function stateResult(response) {
  const csrfCookie = response.headers.get("set-cookie") ?? "";
  assert.match(
    csrfCookie,
    /^__Host-prospector-csrf=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=900; HttpOnly; Secure; SameSite=Strict$/,
  );
  return { state: await json(response), csrfCookie: csrfCookie.split(";", 1)[0] };
}

async function denied(response) {
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.doesNotMatch(
    JSON.stringify(body),
    /owner@example|outsider@example|digitalrain|ws_[a-z0-9]|audit|capabilit/i,
  );
  return body;
}

async function rowCounts(database) {
  const tables = [
    "workspaces",
    "interview_sessions",
    "interview_questions",
    "interview_answers",
    "interview_confirmations",
    "knowledge_versions",
    "audit_events",
    "csrf_tokens",
  ];
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        const row = await database
          .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
          .first();
        return [table, Number(row.count)];
      }),
    ),
  );
}

async function applyMigrations(database) {
  for (const filename of [
    "0000_jittery_meteorite.sql",
    "0001_true_spencer_smythe.sql",
    "0002_eager_supreme_intelligence.sql",
    "0003_acoustic_magik.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
  }
}

test("interview handler retains owner-first neutral denials while exposing the generalized actions", async () => {
  const source = await readFile(
    new URL("../domain/interview-handler.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /authenticatedPrincipal\(dependencies\)[\s\S]{0,400}validateSameOriginMutation/);
  assert.match(source, /submit_interview_answer/,
    "missing production behavior: the handler must admit the generalized Stage 1 command");
  assert.match(source, /record_interview_decision/,
    "missing production behavior: the handler must admit the generalized Stage 2 command");
  for (const decision of ["accept", "reject", "correct", "rescope"]) {
    assert.match(source, new RegExp(`\\b${decision}\\b`),
      `missing production behavior: exact ${decision} decision validation`);
  }
});
