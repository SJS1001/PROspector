import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createServer } from "vite";

test("JEV request contract, validation, safe failures and status", async (t) => {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await server.close();
  });
  const { jevQualifyPage } = await server.ssrLoadModule("/src/lib/server/jev-tasks.ts");
  const { jevFailureMessage } = await server.ssrLoadModule("/src/lib/server/jev.ts");
  const { jevStatus } = await server.ssrLoadModule("/src/lib/domain/jev-status.ts");
  const opts = {
    apiKey: "test-secret",
    accountName: "Test",
    targetName: "Plant",
    url: "https://example.com",
    title: "Test",
    pageText: "Source",
    profileText: "Profile",
  };
  let requested;
  let response;
  let validAnswers;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    requested = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer test-secret");
    const answers = Object.fromEntries(
      Object.entries(requested.questions).map(([id, q]) => {
        if (q.type === "score") {
          assert.ok(Array.isArray(q.criteria), `${id} must use ordered levels`);
          return [id, { score: 1.7, confidence: 0.8 }];
        }
        return [
          id,
          q.type === "choice" ? { choice: "NotQualified", confidence: 0.9 } : { noul: 0.1 },
        ];
      }),
    );
    validAnswers = answers;
    return response || Response.json({ model: "jev-test", answers });
  };
  const result = await jevQualifyPage(opts);
  assert.equal(Object.keys(requested.questions).length, 9);
  assert.equal(result.model, "jev-test");
  assert.equal(result.scores.pain_strength.score, 2);
  assert.equal(result.outcome, "NotQualified");
  for (const invalid of [
    {},
    { answers: {} },
    { answers: null },
    { answers: { pain_strength: { score: 99 } } },
  ]) {
    response = Response.json(invalid);
    await assert.rejects(jevQualifyPage(opts), /incomplete response/);
  }
  for (const patch of [
    { pain_strength: { score: 99, confidence: 0.8 } },
    { pain_strength: { score: 1, confidence: -0.1 } },
    { outcome: { choice: "invented", confidence: 1 } },
    { operating: { noul: 2 } },
  ]) {
    response = Response.json({ answers: { ...validAnswers, ...patch } });
    await assert.rejects(jevQualifyPage(opts), /incomplete response/);
  }
  response = Response.json({ answers: validAnswers, model: {} });
  await assert.rejects(jevQualifyPage(opts), /invalid model/);
  for (const [status, expected] of [
    [401, /saved key/],
    [403, /saved key/],
    [422, /scoring request/],
    [429, /credits/],
    [503, /503/],
  ]) {
    response = Response.json({ message: "secret upstream text test-secret" }, { status });
    await assert.rejects(jevQualifyPage(opts), (error) => {
      assert.match(jevFailureMessage(error), expected);
      assert.doesNotMatch(jevFailureMessage(error), /test-secret/);
      return true;
    });
  }
  globalThis.fetch = async () => {
    throw new DOMException("secret", "TimeoutError");
  };
  await assert.rejects(jevQualifyPage(opts), /timed out/);
  assert.doesNotMatch(jevFailureMessage(new Error("test-secret")), /test-secret/);
  const j = {
    configured: true,
    attempted: 2,
    reviewed: 1,
    applied: 1,
    changed: 0,
    failed: 1,
    savedWithJev: 1,
    errors: [],
  };
  const status = (jev, state = "succeeded") =>
    jevStatus({ status: state, progress: jev ? { jev } : undefined });
  assert.match(status(), /not recorded/);
  assert.match(status({ ...j, configured: false }), /not connected/);
  assert.match(status(j), /scoring used for 1 source · 1 failed/);
  assert.match(status({ ...j, applied: 0 }), /reviewed; basic scoring kept/);
  assert.match(status({ ...j, applied: 0, reviewed: 0 }), /unavailable/);
  assert.match(
    status({ ...j, applied: 0, reviewed: 0, failed: 0 }, "running"),
    /checking evidence/,
  );
  assert.match(status({ ...j, applied: 0, reviewed: 0, failed: 0 }, "failed"), /interrupted/);
  assert.match(status({ ...j, attempted: 0, applied: 0, reviewed: 0, failed: 0 }), /no sources/);
});
