import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createServer } from "vite";

test("Anthropic workspace selection is validated, saved, projected, and sent only to Anthropic", async (t) => {
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true },
    appType: "custom",
  });
  t.after(() => server.close());
  const { completeJson } = await server.ssrLoadModule("/src/lib/server/llm.ts");
  const { putSecret, connectionFlags } = await server.ssrLoadModule("/src/lib/server/secrets.ts");
  const { anthropicWorkspaceId } = await server.ssrLoadModule("/src/lib/domain/llm.ts");
  const saved = { llm_provider: "anthropic", llm_key: "fictional-key" };
  const sql = async (parts, ...values) => {
    const query = parts.join("?").trim();
    if (query.startsWith("insert into operator_secrets")) {
      saved[values[1]] = values[2];
      return [];
    }
    if (query.startsWith("delete from operator_secrets")) {
      delete saved[values[1]];
      return [];
    }
    if (query.startsWith("select value"))
      return saved[values[1]] ? [{ value: saved[values[1]] }] : [];
    if (query.startsWith("select name"))
      return Object.entries(saved).map(([name, value]) => ({ name, value }));
    if (query.includes("from operating_state")) return [];
    throw new Error(`Unexpected SQL: ${query}`);
  };
  const requests = [];
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, ...init });
    return new Response(
      JSON.stringify(
        fail
          ? {
              error: {
                message:
                  "This API key is not scoped to a workspace; include the anthropic-workspace-id header",
              },
            }
          : {
              content: [{ text: '{"ok":true}' }],
              choices: [{ message: { content: '{"ok":true}' } }],
            },
      ),
      { status: fail ? 400 : 200 },
    );
  });
  assert.equal(anthropicWorkspaceId(" wrkspc_example123 "), "wrkspc_example123");
  assert.throws(() => anthropicWorkspaceId("wrkspc_bad\r\nheader"), /valid Anthropic workspace/);
  assert.throws(() => anthropicWorkspaceId("not-a-workspace"), /valid Anthropic workspace/);
  await putSecret(
    sql,
    "fictional",
    "llm_workspace_id",
    anthropicWorkspaceId(" wrkspc_example123 "),
  );
  assert.equal((await connectionFlags(sql, "fictional")).llmWorkspaceId, "wrkspc_example123");
  assert.equal(await completeJson(sql, "fictional", "fixture"), '{"ok":true}');
  assert.equal(requests.at(-1).headers["anthropic-workspace-id"], "wrkspc_example123");
  assert.equal(requests.at(-1).headers["x-api-key"], "fictional-key");
  saved.llm_provider = "groq";
  await completeJson(sql, "fictional", "fixture");
  assert.equal(requests.at(-1).headers["anthropic-workspace-id"], undefined);
  saved.llm_provider = "anthropic";
  await putSecret(sql, "fictional", "llm_workspace_id", "");
  assert.equal((await connectionFlags(sql, "fictional")).llmWorkspaceId, "");
  await completeJson(sql, "fictional", "fixture");
  assert.equal(requests.at(-1).headers["anthropic-workspace-id"], undefined);
  fail = true;
  await assert.rejects(completeJson(sql, "fictional", "fixture"), /Open Settings.*workspace ID/);
});
