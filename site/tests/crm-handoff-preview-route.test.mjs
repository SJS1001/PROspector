import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/local-demo/crm-handoff-preview/route.ts", import.meta.url);
const handlerUrl = new URL("../app/api/local-demo/crm-handoff-preview/_handler.ts", import.meta.url);

test("the redundant legacy CRM preview route and handler are unreachable", async () => {
  await assert.rejects(access(routeUrl), { code: "ENOENT" });
  await assert.rejects(access(handlerUrl), { code: "ENOENT" });
});
