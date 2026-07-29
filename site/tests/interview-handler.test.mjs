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
    assert.equal((await handleInterviewGet(anonymous)).status, 401);
    assert.equal(
      (await handleInterviewPost(mutation("bootstrap", "fake", {
        "oai-authenticated-user-email": "owner@example.com",
      }), anonymous)).status,
      401,
    );

    const owner = dependencies(database, {
      email: "owner@example.com",
      displayName: "Owner",
    });
    let state = await json(await handleInterviewGet(owner));
    assert.equal(state.status, "uninitialized");
    assert.match(state.csrfToken, /^[A-Za-z0-9_-]{43}$/);

    assert.equal((await handleInterviewPost(mutation("bootstrap", ""), owner)).status, 403);
    const foreign = mutation("bootstrap", state.csrfToken, { origin: "https://attacker.example" });
    assert.equal((await handleInterviewPost(foreign, owner)).status, 403);

    const bootstrapToken = state.csrfToken;
    state = await json(await handleInterviewPost(mutation("bootstrap", bootstrapToken), owner));
    assert.equal(state.status, "active");
    assert.equal((await handleInterviewPost(mutation("bootstrap", bootstrapToken), owner)).status, 403);

    const outsider = dependencies(database, {
      email: "outsider@example.com",
      displayName: "Outsider",
    });
    const outsiderInitial = await json(await handleInterviewGet(outsider));
    assert.equal(
      (await handleInterviewPost(mutation("bootstrap", state.csrfToken), outsider)).status,
      403,
    );
    const outsiderActive = await json(
      await handleInterviewPost(mutation("bootstrap", outsiderInitial.csrfToken), outsider),
    );
    assert.equal(outsiderActive.status, "active");

    const answerBody = {
      action: "submit_recommendation_answer",
      questionId: state.question.id,
      expectedRevision: state.question.revision,
      idempotencyKey: "0198a4b0-1000-7000-8000-000000000001",
    };
    state = await json(await handleInterviewPost(mutation(answerBody, state.csrfToken), owner));
    assert.equal(state.status, "awaiting_confirmation");

    const crossOwnerBody = {
      ...answerBody,
      idempotencyKey: "0198a4b0-1000-7000-8000-000000000002",
    };
    const crossOwner = await handleInterviewPost(
      mutation(crossOwnerBody, outsiderActive.csrfToken),
      outsider,
    );
    assert.equal(crossOwner.status, 409);

    state = await json(await handleInterviewPost(mutation({
      action: "confirm_submitted_answer",
      answerId: state.answer.id,
      expectedSessionRevision: state.session.revision,
      idempotencyKey: "0198a4b0-1000-7000-8000-000000000003",
    }, state.csrfToken), owner));
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
      "x-prospector-csrf": csrf,
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
