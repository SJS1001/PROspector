import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const root = new URL("../", import.meta.url);
const contractUrl = new URL("../domain/local-demo-composition.ts", import.meta.url);
const admissionUrl = new URL("../app/local-demo/_admission.ts", import.meta.url);

const validBindings = {
  OWNER_SUBJECT_PEPPER: "local-demo-owner-pepper-for-test-only",
  PILOT_OWNER_EMAIL: "local-owner@prospector.invalid",
  TRUSTED_IDENTITY_PROVIDER: "local-demo",
  LOCAL_DEMO: "1",
};

test("the canonical composition is deterministic, immutable, ordered Phase 4 through 7, and zero-effect", async () => {
  await withVite(async (vite) => {
    const contract = await vite.ssrLoadModule(contractUrl.pathname);
    const first = await contract.readLocalDemoComposition();
    const second = await contract.readLocalDemoComposition();
    assert.equal(first, second);
    assert.equal(first.ownerProspectApproval.reviewedProspectId, first.prospect.id);
    assert.equal(first.ownerProspectApproval.reviewedProspectDigest, first.prospect.immutableDigest);
    const stages = [first.ownerProspectApproval, first.contactSuggestion, first.verificationIntent, first.contactReady, first.package, first.message, first.suppression, first.manualCallOutcome, first.morningBrief, first.weeklyPreview, first.crmPreview, first.portabilityPreview];
    for (let index = 2; index < stages.length; index += 1) {
      assert.equal(stages[index].predecessorId, stages[index - 1].id);
      assert.equal(stages[index].predecessorDigest, stages[index - 1].immutableDigest);
    }
    assert.equal(stages[1].predecessorId, stages[0].id);
    assert.equal(stages[1].predecessorDigest, stages[0].immutableDigest);
    for (const stage of stages) {
      assert.match(stage.immutableDigest, /^sha256:[a-f0-9]{64}$/u);
      assert.equal(Object.isFrozen(stage), true);
    }
    assert.deepEqual(first.effects, { persistence: false, browserStorage: false, network: false, providerInvocation: false, outbound: false, export: false, effectCount: 0 });
    assert.equal(first.manualCallOutcome.outcome, "not_attempted");
    assert.equal(first.morningBrief.actionableCount, 0);
    assert.equal(first.crmPreview.materializationAuthorized, false);
    assert.equal(first.portabilityPreview.restoreAuthorized, false);
    assert.equal(await contract.validateLocalDemoComposition(structuredClone(first)), true);
    const forged = structuredClone(first);
    forged.portabilityPreview.predecessorDigest = "sha256:" + "0".repeat(64);
    assert.equal(await contract.validateLocalDemoComposition(forged), false);
  });
});

test("composition admission rejects cross-origin, stale control material, wrong workspace or owner, missing flags, and non-loopback", async () => {
  globalThis.__localDemoBindings = validBindings;
  await withVite(async (vite) => {
    const admission = await vite.ssrLoadModule(admissionUrl.pathname);
    const request = (url = "http://127.0.0.1:8788/api/local-demo/composition", headers = {}) => new Request(url, { method: "POST", headers: { origin: new URL(url).origin, ...headers } });
    assert.equal(await admission.admitLocalDemoCompositionRead(request()), true);
    const denied = [
      request("http://127.0.0.1:8788/api/local-demo/composition", { origin: "http://127.0.0.1:8789" }),
      request("http://127.0.0.1:8788/api/local-demo/composition", { "x-csrf-token": "stale" }),
      request("http://127.0.0.1:8788/api/local-demo/composition", { "x-local-demo-authority-revision": "stale" }),
      request("http://127.0.0.1:8788/api/local-demo/composition", { "x-local-demo-workspace": "other" }),
      request("http://127.0.0.1:8788/api/local-demo/composition", { "x-local-demo-owner": "other" }),
      new Request("http://127.0.0.1:8788/api/local-demo/composition", { method: "POST", headers: { origin: "http://127.0.0.1:8788", "content-type": "application/json" }, body: "{}" }),
      request("https://example.test/api/local-demo/composition"),
    ];
    for (const candidate of denied) assert.equal(await admission.admitLocalDemoCompositionRead(candidate), false);

    for (const patch of [
      { LOCAL_DEMO: undefined },
      { LOCAL_DEMO: "true" },
      { TRUSTED_IDENTITY_PROVIDER: undefined },
      { TRUSTED_IDENTITY_PROVIDER: "cloudflare-access" },
      { CLOUDFLARE_ACCESS_ISSUER: "https://access.example.test", CLOUDFLARE_ACCESS_AUDIENCE: "audience" },
      { PILOT_OWNER_EMAIL: "wrong-owner@prospector.invalid" },
    ]) {
      globalThis.__localDemoBindings = { ...validBindings, ...patch };
      vite.moduleGraph.invalidateAll();
      const fresh = await vite.ssrLoadModule(admissionUrl.pathname);
      assert.equal(await fresh.admitLocalDemoCompositionRead(request()), false);
    }
  }, true);
  delete globalThis.__localDemoBindings;
});

test("route admission precedes scenario import and the read surface exposes no mutation or effect seam", async () => {
  const route = await readFile(new URL("app/api/local-demo/composition/route.localdemo", root), "utf8");
  const handler = await readFile(new URL("app/api/local-demo/composition/_handler.ts", root), "utf8");
  const screen = await readFile(new URL("app/local-demo/_screen.tsx", root), "utf8");
  assert.ok(route.indexOf("await admitLocalDemoCompositionRead(request)") < route.indexOf("await import(\"./_handler\")"));
  assert.doesNotMatch(route, /export async function GET/u);
  assert.doesNotMatch(handler, /\b(?:DB|D1Database|R2Bucket|fetch|insert|update|delete|reconcile|write|csrf)\s*\(/iu);
  assert.doesNotMatch(handler, /handleLocalDemoCompositionRead\s*\([^)]/u);
  assert.doesNotMatch(screen, /crm-csv-codec|TextEncoder|TextDecoder|\.text\b|byteLength|sha256|encoding/iu);
  for (const marker of ["Morning Brief", "Manual-call outcome", "Portability compatibility", "Effects:"]) assert.match(screen, new RegExp(marker, "u"));
});

async function withVite(assertion, mockRuntime = false) {
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: mockRuntime ? [{
      name: "local-demo-runtime-mocks",
      resolveId(id) {
        if (id === "cloudflare:workers") return "\0local-demo-workers";
        if (id === "next/headers") return "\0local-demo-headers";
        return null;
      },
      load(id) {
        if (id === "\0local-demo-workers") return "export const env = new Proxy({}, { get: (_, key) => globalThis.__localDemoBindings[key] });";
        if (id === "\0local-demo-headers") return "export async function headers(){ return new Headers({host:'127.0.0.1:8788'}); }";
        return null;
      },
    }] : [],
  });
  try { await assertion(vite); } finally { await vite.close(); }
}
