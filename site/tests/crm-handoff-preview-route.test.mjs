import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../app/api/local-demo/crm-handoff-preview/route.ts", import.meta.url);
const handlerUrl = new URL("../app/api/local-demo/crm-handoff-preview/_handler.ts", import.meta.url);

test("the legacy CRM preview stays development-only and metadata-only", async () => {
  const route = await readFile(routeUrl, "utf8");
  const handler = await readFile(handlerUrl, "utf8");
  assert.match(route, /if \(import\.meta\.env\.DEV\)/u);
  assert.match(route, /await import\("\.\/_handler"\)/u);
  assert.doesNotMatch(route, /export async function GET/u);
  for (const required of ["metadataOnly: true", "materializationAuthorized: false", "admittedRowCount: 0", "exportAuthorized: false", "downloadAuthorized: false"]) assert.match(handler, new RegExp(required, "u"));
  assert.match(handler, /isLocalDemoRequest/u);
  assert.match(handler, /sameOrigin/u);
  assert.match(handler, /admitPilotOwner/u);
});

test("no reachable CRM preview source imports or materializes CSV", async () => {
  const handler = await readFile(handlerUrl, "utf8");
  for (const forbidden of ["crm-csv-codec", "encodeCrmCsv", "TextEncoder", "TextDecoder", "byteLength", "sha256", "recordSeparator", "contact_value", "request.json", "request.text", "request.formData", "Content-Disposition", "createObjectURL", "writeFile", "fetch("]) {
    assert.equal(handler.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(handler, /\b(?:DB|D1Database|R2Bucket|MailPort|provider|dispatch|reconcile)\b/u);
});
