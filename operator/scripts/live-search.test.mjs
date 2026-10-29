import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createServer } from "vite";

test("live search validates tool execution, continuations and candidate responses", async (t) => {
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true },
    appType: "custom",
  });
  t.after(() => server.close());
  const { anthropicSearch } = await server.ssrLoadModule("/src/lib/server/anthropic-search.ts");
  const { parseCandidates } = await server.ssrLoadModule("/src/lib/server/search-response.ts");
  const config = {
    model: "fixture-model",
    apiKey: "fixture-secret",
    workspaceId: "wrkspc_fixture",
  };
  const result = {
    type: "web_search_tool_result",
    content: [
      { type: "web_search_result", url: "https://example.com", encrypted_content: "opaque" },
    ],
  };
  const answer = { type: "text", text: '{"candidates":[]}' };
  let body = { content: [result, answer], stop_reason: "end_turn" };
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, ...init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body));
  });
  await t.test("tool-first response extracts text and reports actual searches", async () => {
    const counts = [];
    assert.equal(await anthropicSearch(config, "prompt", async (n) => counts.push(n)), answer.text);
    assert.deepEqual(counts, [1]);
    assert.equal(requests.at(-1).headers["anthropic-workspace-id"], config.workspaceId);
    assert.equal(requests.at(-1).redirect, "error");
    assert.equal(requests.at(-1).body.tools[0].max_uses, 5);
  });
  await t.test("paused tool content continues unchanged and is bounded", async () => {
    body = { content: [result], stop_reason: "pause_turn" };
    const before = requests.length;
    await assert.rejects(anthropicSearch(config, "prompt"), /more time/);
    assert.equal(requests.length - before, 2);
    assert.deepEqual(requests.at(-1).body.messages[1], { role: "assistant", content: [result] });
  });
  await t.test(
    "no search, truncation, missing content and HTTP200 tool errors fail explicitly",
    async () => {
      for (const invalid of [
        { content: [answer], stop_reason: "end_turn" },
        { content: [result, answer], stop_reason: "max_tokens" },
        {},
        {
          content: [
            {
              type: "web_search_tool_result",
              content: { type: "web_search_tool_result_error", error_code: "unavailable" },
            },
            answer,
          ],
          stop_reason: "end_turn",
        },
      ]) {
        body = invalid;
        await assert.rejects(anthropicSearch(config, "prompt"));
      }
    },
  );
  await t.test("valid empty list is distinct from malformed, missing and ill-typed results", () => {
    assert.deepEqual(parseCandidates('{"candidates":[]}', 12), []);
    for (const raw of [
      "",
      "no matches",
      "{}",
      '{"candidates":null}',
      '{"candidates":{}}',
      '{"candidates":[{}]}',
      '{"candidates":[{"accountName":"A","url":"http://example.com"}]}',
      '{"candidates":[{"accountName":"A","url":"https://example.com","notes":{"x":2}}]}',
      '{"candidates":[',
    ])
      assert.throws(() => parseCandidates(raw, 12));
    const raw =
      "```json\n" +
      JSON.stringify({
        candidates: [
          {
            accountName: "A",
            targetName: "Plant",
            url: "https://example.com",
            notes: { account_fit: "plant" },
          },
        ],
      }) +
      "\n```";
    assert.equal(parseCandidates(raw, 12)[0].targetName, "Plant");
    assert.equal(parseCandidates(raw, 0).length, 0);
  });
});
