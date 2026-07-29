import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { createServer } from "vite";

const ORIGIN = "https://prospector.example";
const OWNER_EMAIL = "owner@example.com";
const SUBJECT_PEPPER = "test-only-pilot-pepper-with-at-least-32-bytes";

test("only the configured pilot owner reaches workspace state", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "prospector-pilot-access-test" },
  });

  try {
    const database = await miniflare.getD1Database("DB");
    await applyMigrations(database);
    const { handleInterviewGet, handleInterviewPost } = await vite.ssrLoadModule(
      new URL("../domain/interview-handler.ts", import.meta.url).pathname,
    );

    const owner = dependencies(database, {
      email: "  Owner@Example.COM ",
      displayName: "Owner",
    });
    let ownerState = await responseJson(await handleInterviewGet(owner), 200);
    ownerState = await responseJson(
      await handleInterviewPost(mutation("bootstrap", ownerState.csrfToken), owner),
      200,
    );
    assert.equal(ownerState.status, "active");

    const before = await rowCounts(database);
    for (const deniedDependencies of [
      dependencies(database, null),
      dependencies(database, {
        email: "outsider@example.com",
        displayName: "Outsider",
      }),
    ]) {
      const deniedGet = await handleInterviewGet(deniedDependencies);
      assert.deepEqual(
        await responseJson(deniedGet, 404),
        { error: "private_workspace_unavailable" },
      );

      const deniedPost = await handleInterviewPost(
        mutation("bootstrap", "not-an-owner-token"),
        deniedDependencies,
      );
      assert.deepEqual(
        await responseJson(deniedPost, 404),
        { error: "private_workspace_unavailable" },
      );
    }

    assert.deepEqual(await rowCounts(database), before);
  } finally {
    await vite.close();
    await miniflare.dispose();
  }
});

function dependencies(database, identity) {
  return {
    database,
    subjectPepper: SUBJECT_PEPPER,
    pilotOwnerEmail: OWNER_EMAIL,
    getIdentity: async () => identity,
  };
}

function mutation(action, csrfToken) {
  return new Request(`${ORIGIN}/api/interview`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "x-prospector-intent": "interview-mutation",
      "x-prospector-csrf": csrfToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
}

async function responseJson(response, expectedStatus) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  if (expectedStatus !== 200) {
    assert.doesNotMatch(
      JSON.stringify(body),
      /owner@example|outsider@example|digitalrain|workspace|audit|capabilit/i,
    );
  }
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
