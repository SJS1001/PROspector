/**
 * Adversarial cover for the local-demo CRM handoff preview.
 *
 * The preview is an owner-authorized narrow exception to the Phase 7 stop
 * condition. These tests hold it to the exact fence it was granted under, and
 * to the property that matters most: it demonstrates fictional serialization
 * without loosening production rejection.
 *
 * Source-level, because the handler binds `cloudflare:workers` and only exists
 * inside a DEV branch; the runtime behaviour of the fence predicate it uses is
 * covered separately by the identity and local-demo boundary suites.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE_URL = new URL("../app/api/local-demo/crm-handoff-preview/route.ts", import.meta.url);
const HANDLER_URL = new URL("../app/api/local-demo/crm-handoff-preview/_handler.ts", import.meta.url);
const CONTRACT_URL = new URL("../domain/crm-handoff-projection.ts", import.meta.url);

test("the route is development-only and answers 404 in production", async () => {
  const route = await readFile(ROUTE_URL, "utf8");
  // Positive-form gate: `if (DEV && ...)` folds to `if (false)` so rollup drops
  // the chunk. A negative form would leave the handler in the bundle.
  assert.match(route, /if \(import\.meta\.env\.DEV\) \{/u);
  assert.match(route, /await import\("\.\/_handler"\)/u);
  assert.match(route, /status: 404/u);
  // The handler must not be statically imported, or it survives into dist/.
  assert.doesNotMatch(route, /^import .*_handler/mu);
  // GET must not exist: the same-origin check only guards non-GET.
  assert.doesNotMatch(route, /export async function GET/u);
  assert.match(route, /export async function POST/u);
});

test("every granted fence is present and none is substituted for a weaker one", async () => {
  const handler = await readFile(HANDLER_URL, "utf8");

  // isLocalDemoRequest is the shared fence: DEV + local-demo provider +
  // LOCAL_DEMO=1 + Access disabled + loopback host. Using it rather than an
  // inline copy means the fence cannot drift from the identity module.
  assert.match(handler, /import \{[\s\S]*?isLocalDemoRequest[\s\S]*?\} from "\.\.\/\.\.\/\.\.\/runtime-identity"/u);
  assert.match(handler, /if \(!isLocalDemoRequest\(request, bindings\)\) return notFound\(\);/u);

  // Same-origin for the mutation-shaped request, and owner admission after it.
  assert.match(handler, /if \(!sameOrigin\(request\)\) return notFound\(\);/u);
  assert.match(handler, /new URL\(origin\)\.origin === new URL\(request\.url\)\.origin/u);
  assert.match(handler, /await admitPilotOwner\(\s*await runtimeIdentity\(request, bindings\)/u);

  // A missing origin header must fail closed rather than be treated as same-origin.
  assert.match(handler, /if \(!origin\) return false;/u);

  // Admission failure is a 404, never a 200 with a partial body.
  assert.match(handler, /\} catch \{\s*return notFound\(\);\s*\}/u);
});

test("the preview cannot reach real data, a file, a download, or a provider", async () => {
  const handler = await readFile(HANDLER_URL, "utf8");

  // No persistence or storage binding of any kind.
  for (const forbidden of [
    "DB", "D1Database", "R2Bucket", "FILES", "INSERT INTO", "prepare(",
    "createObjectURL", "writeFile", "node:fs",
    "fetch(", "mailto:", "googleapis", "attachment",
  ]) assert.equal(handler.includes(forbidden), false, `handler must not reference ${forbidden}`);
  // The doc comment names Content-Disposition to say it is never set, so assert
  // no quoted header key exists rather than that the phrase is absent.
  assert.doesNotMatch(handler, /["']Content-Disposition["']/u, "no Content-Disposition header may be set");

  // It accepts no caller-supplied rows, so it cannot serialize real data.
  assert.doesNotMatch(handler, /request\.json\(\)|request\.text\(\)|request\.formData\(\)/u);

  // The fictional fixture is built in the handler, not read from anywhere.
  assert.match(handler, /function fictionalCandidates\(\)/u);
  assert.match(handler, /example\.test/u);
  assert.match(handler, /\+1555555\d{4}/u, "phone numbers stay in the reserved fictional range");

  // The response states its own lack of authority rather than implying it.
  for (const denial of [
    "exportAuthorized: false",
    "deliveryAuthorized: false",
    "downloadAuthorized: false",
    "persistenceAuthorized: false",
    "providerInvocationAuthorized: false",
    "fictional: true",
  ]) assert.equal(handler.includes(denial), true, `response must carry ${denial}`);
});

test("the preview does not loosen production rejection", async () => {
  const handler = await readFile(HANDLER_URL, "utf8");
  const contract = await readFile(CONTRACT_URL, "utf8");

  // The decision still runs through the real seam.
  assert.match(handler, /projectCrmHandoff\(\{ evaluatedAt: DEMO_NOW, candidates \}\)/u);
  assert.match(contract, /recheckForCrmExport\(/u);

  // The contract admits only on an unblocked recheck. Nothing in the handler
  // may fabricate an admission or override the boundary.
  assert.match(contract, /if \(recheck\.blocked\) reasonCodes\.push\("crm_export_recheck_blocked"\);/u);
  assert.doesNotMatch(handler, /blocked\s*[:=]\s*false/u);
  assert.doesNotMatch(handler, /admitted\s*[:=]\s*\[[^\]]/u, "the handler must not construct admitted rows");

  // The serialized rows are declared unadmitted, so the preview cannot be read
  // as evidence that the boundary opened.
  assert.match(handler, /previewRowsAreFictionalAndUnadmitted: true/u);
  assert.match(handler, /decision's admitted rows/u);

  // recheckForCrmExport must stay unconditionally blocked in the ordinary path.
  const eligibility = await readFile(
    new URL("../domain/contact-eligibility.ts", import.meta.url), "utf8",
  );
  assert.match(eligibility, /blocked: true/u);
  assert.match(
    eligibility,
    /export function recheckForCrmExport\(input: unknown\): DownstreamRecheck \{ return blockedRecheck\("crm_export", input\); \}/u,
  );
});

test("the preview seam imports no preparation module", async () => {
  for (const url of [ROUTE_URL, HANDLER_URL, CONTRACT_URL]) {
    const source = await readFile(url, "utf8");
    for (const match of source.matchAll(/\bfrom\s*["']([^"']+)["']/gu)) {
      assert.doesNotMatch(
        match[1],
        /(?:^|\/)preparation(?:\/|$)/u,
        `${url.pathname} must not import ${match[1]}`,
      );
    }
  }
});
