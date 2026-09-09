import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const contractUrl = resolve(root, "domain/local-demo-composition.ts");
const routeUrl = resolve(root, "app/api/local-demo/composition/route.ts");
const handlerUrl = resolve(root, "app/api/local-demo/composition/_handler.ts");

test("the fixed composition has every fictional journey input in authority order", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { readLocalDemoComposition } = await vite.ssrLoadModule(contractUrl);
    const scenario = readLocalDemoComposition();
    assert.equal(readLocalDemoComposition(), scenario, "the fixed graph is not rebuilt from input");
    assert.deepEqual(scenario.scope, {
      company: "Northwind Sample Works", product: "Sample Operations Console",
      marketPlay: "Fictional regional operations teams", profile: "Fictional maintenance planning profile",
    });
    assert.deepEqual(scenario.prospects.map((row) => row.qualification), ["qualified", "rejected", "deferred"]);
    assert.deepEqual(scenario.contacts.map((row) => row.state), ["ContactSuggestion", "NonContactable", "ContactReady"]);
    assert.equal(scenario.contacts[2].shapedOnly, true);
    assert.equal(scenario.contacts[2].eligible, false);
    assert.deepEqual(scenario.package, { reviewedAfter: "qualified", exact: true, admitted: false });
    assert.deepEqual(scenario.message, { reviewedAfter: "package", exact: true, admitted: false });
    assert.deepEqual(scenario.suppression, { recheckedAfter: "message", outcome: "blocked" });
    assert.equal(scenario.weeklyPreview.realAdmissionCount, 0);
    assert.equal(scenario.crmPreview.realAdmissionCount, 0);
    assert.equal(scenario.crmPreview.downloadAuthorized, false);
    assert.deepEqual(scenario.effects, {
      persistence: false, browserStorage: false, network: false, providerInvocation: false,
      outbound: false, export: false, effectCount: 0,
    });
    assert.ok(Object.isFrozen(scenario));
    assert.ok(Object.isFrozen(scenario.contacts));
    assert.ok(Object.isFrozen(scenario.contacts[0]));
  } finally {
    await vite.close();
  }
});

test("the composition read seam is dev-only, loopback/same-origin/owner guarded, and storage-free", async () => {
  const [route, handler] = await Promise.all([readFile(routeUrl, "utf8"), readFile(handlerUrl, "utf8")]);
  assert.match(route, /export async function GET\(request: Request\)/u);
  assert.match(route, /if \(import\.meta\.env\.DEV\) \{/u);
  assert.match(route, /await import\("\.\/_handler"\)/u);
  assert.doesNotMatch(route, /^import .*_handler/mu);
  assert.match(route, /status: 404/u);
  assert.match(handler, /if \(!isLocalDemoRequest\(request, bindings\)\) return notFound\(\);/u);
  assert.match(handler, /if \(!sameOrigin\(request\)\) return notFound\(\);/u);
  assert.match(handler, /if \(!origin\) return false;/u);
  assert.match(handler, /await admitPilotOwner\(/u);
  assert.match(handler, /await runtimeIdentity\(request, bindings\)/u);
  assert.match(handler, /cache-control": "no-store/u);
  for (const forbidden of ["DB", "D1Database", "R2Bucket", "prepare(", "INSERT INTO", "fetch(", "request.json(", "request.text(", "localStorage", "sessionStorage", "writeFile", "node:fs", "provider"]) {
    assert.equal(handler.includes(forbidden), false, `read seam must not reference ${forbidden}`);
  }
});
