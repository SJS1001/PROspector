import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const contractUrl = resolve(root, "domain/local-demo-composition.ts");
const handlerUrl = resolve(root, "app/api/local-demo/composition/_handler.ts");
const identityUrl = resolve(root, "app/runtime-identity.ts");
const pilotAccessUrl = resolve(root, "domain/pilot-access.ts");

const localBindings = Object.freeze({
  OWNER_SUBJECT_PEPPER: "local-demo-owner-pepper-for-test-only",
  PILOT_OWNER_EMAIL: "local-owner@prospector.invalid",
  TRUSTED_IDENTITY_PROVIDER: "local-demo",
  LOCAL_DEMO: "1",
});

const localRequest = (origin = "http://127.0.0.1:8788") => new Request(
  `${origin}/api/local-demo/composition`,
  { headers: { origin } },
);

function calls() {
  return {
    localDemoFence: 0,
    identity: 0,
    ownerAdmission: 0,
    compositionRead: 0,
    graphValidation: 0,
    persistence: 0,
    provider: 0,
    network: 0,
    outbound: 0,
    export: 0,
  };
}

function harness(modules, bindings = localBindings, identityOverride, compositionOverride) {
  const observed = calls();
  return {
    observed,
    dependencies: {
      bindings,
      isLocalDemoRequest(request, suppliedBindings) {
        observed.localDemoFence += 1;
        return modules.identity.isLocalDemoRequest(request, suppliedBindings);
      },
      async runtimeIdentity(request, suppliedBindings) {
        observed.identity += 1;
        return identityOverride ?? modules.identity.runtimeIdentity(request, suppliedBindings);
      },
      async admitPilotOwner(identity, owner, pepper) {
        observed.ownerAdmission += 1;
        return modules.pilotAccess.admitPilotOwner(identity, owner, pepper);
      },
      async readLocalDemoComposition() {
        observed.compositionRead += 1;
        return compositionOverride ?? modules.contract.readLocalDemoComposition();
      },
      async validateLocalDemoComposition(candidate) {
        observed.graphValidation += 1;
        return modules.contract.validateLocalDemoComposition(candidate);
      },
    },
  };
}

async function responseBody(response) {
  return response.json();
}

test("the fixed composition preserves the authorized fictional predecessor chain", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { readLocalDemoComposition } = await vite.ssrLoadModule(contractUrl);
    const scenario = await readLocalDemoComposition();
    assert.equal(await readLocalDemoComposition(), scenario, "the graph is fixed and has no caller input");
    assert.deepEqual(scenario.scope, {
      company: "Northwind Sample Works", product: "Sample Operations Console",
      marketPlay: "Fictional regional operations teams", profile: "Fictional maintenance planning profile",
    });
    assert.deepEqual(scenario.ownerProspectApproval, {
      id: "local-demo-owner-prospect-approval-v1",
      immutableDigest: scenario.ownerProspectApproval.immutableDigest,
      reviewedProspectId: scenario.prospect.id,
      reviewedProspectDigest: scenario.prospect.immutableDigest,
      decision: "approved",
      provenance: "fictional owner Prospect approval",
    });
    for (const stage of [scenario.prospect, scenario.ownerProspectApproval]) {
      assert.match(stage.immutableDigest, /^sha256:[a-f0-9]{64}$/);
      assert.equal(stage.immutableDigest, await independentDigest(stage));
    }
    const chain = [
      scenario.contactSuggestion,
      scenario.verificationIntent,
      scenario.contactReady,
      scenario.package,
      scenario.message,
      scenario.suppression,
      scenario.weeklyPreview,
      scenario.crmPreview,
    ];
    assert.equal(chain[0].predecessorId, scenario.ownerProspectApproval.id);
    assert.equal(chain[0].predecessorDigest, scenario.ownerProspectApproval.immutableDigest);
    for (let index = 1; index < chain.length; index += 1) {
      assert.equal(chain[index].predecessorId, chain[index - 1].id);
      assert.equal(chain[index].predecessorDigest, chain[index - 1].immutableDigest);
    }
    assert.deepEqual(chain.map((stage) => stage.id), [
      "local-demo-contact-suggestion-v1",
      "local-demo-verification-intent-v1",
      "local-demo-contact-ready-v1",
      "local-demo-package-v1",
      "local-demo-message-v1",
      "local-demo-suppression-v1",
      "local-demo-weekly-preview-v1",
      "local-demo-crm-preview-v1",
    ]);
    for (const stage of chain) {
      assert.match(stage.immutableDigest, /^sha256:[a-f0-9]{64}$/);
      assert.equal(stage.immutableDigest, await independentDigest(stage));
    }
    assert.equal(scenario.verificationIntent.providerInvocation, false);
    assert.equal(scenario.verificationIntent.verified, false);
    assert.equal(scenario.contactReady.shapedOnly, true);
    assert.equal(scenario.contactReady.admitted, false);
    assert.equal(scenario.crmPreview.downloadAuthorized, false);
    assert.deepEqual(scenario.effects, {
      persistence: false, browserStorage: false, network: false, providerInvocation: false,
      outbound: false, export: false, effectCount: 0,
    });
    for (const value of [scenario, scenario.ownerProspectApproval, ...chain]) assert.ok(Object.isFrozen(value));
  } finally {
    await vite.close();
  }
});

test("the composition handler executes every deny boundary without effects", async () => {
  globalThis.__prospectorCompositionTestEnv = {};
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [{
      name: "composition-cloudflare-workers",
      resolveId(id) {
        return id === "cloudflare:workers" ? "\0composition-cloudflare-workers" : null;
      },
      load(id) {
        return id === "\0composition-cloudflare-workers"
          ? "export const env = globalThis.__prospectorCompositionTestEnv;"
          : null;
      },
    }],
  });
  try {
    const modules = {
      contract: await vite.ssrLoadModule(contractUrl),
      identity: await vite.ssrLoadModule(identityUrl),
      pilotAccess: await vite.ssrLoadModule(pilotAccessUrl),
      handler: await vite.ssrLoadModule(handlerUrl),
    };
    const noEffects = {
      localDemoFence: 1,
      identity: 0,
      ownerAdmission: 0,
      compositionRead: 0,
      graphValidation: 0,
      persistence: 0,
      provider: 0,
      network: 0,
      outbound: 0,
      export: 0,
    };
    const denied = [
      ["LOCAL_DEMO absent", localRequest(), { ...localBindings, LOCAL_DEMO: undefined }],
      ["LOCAL_DEMO wrong", localRequest(), { ...localBindings, LOCAL_DEMO: "true" }],
      ["provider wrong", localRequest(), { ...localBindings, TRUSTED_IDENTITY_PROVIDER: "cloudflare-access" }],
      ["Access configured", localRequest(), {
        ...localBindings,
        CLOUDFLARE_ACCESS_ISSUER: "https://access.example.test",
        CLOUDFLARE_ACCESS_AUDIENCE: "local-demo-access-audience",
      }],
      ["non-loopback host", localRequest("https://prospector.example") , localBindings],
    ];
    for (const [name, request, bindings] of denied) {
      const attempt = harness(modules, bindings);
      const response = await modules.handler.handleLocalDemoComposition(request, attempt.dependencies);
      assert.equal(response.status, 404, name);
      assert.equal(response.headers.get("cache-control"), "no-store", name);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", name);
      assert.deepEqual(await responseBody(response), { error: "not_found" }, name);
      assert.deepEqual(attempt.observed, noEffects, name);
    }

    for (const [name, request] of [
      ["missing Origin", new Request("http://127.0.0.1:8788/api/local-demo/composition")],
      ["malformed Origin", new Request("http://127.0.0.1:8788/api/local-demo/composition", { headers: { origin: "not an origin" } })],
      ["cross-origin Origin", new Request("http://127.0.0.1:8788/api/local-demo/composition", { headers: { origin: "http://127.0.0.1:8789" } })],
    ]) {
      const attempt = harness(modules);
      const response = await modules.handler.handleLocalDemoComposition(request, attempt.dependencies);
      assert.equal(response.status, 404, name);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", name);
      assert.deepEqual(await responseBody(response), { error: "not_found" }, name);
      assert.deepEqual(attempt.observed, noEffects, name);
    }

    const wrongOwner = harness(modules, localBindings, {
      email: "other-owner@prospector.invalid",
      displayName: "Wrong fictional owner",
    });
    const wrongOwnerResponse = await modules.handler.handleLocalDemoComposition(localRequest(), wrongOwner.dependencies);
    assert.equal(wrongOwnerResponse.status, 404);
    assert.equal(wrongOwnerResponse.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await responseBody(wrongOwnerResponse), { error: "not_found" });
    assert.deepEqual(wrongOwner.observed, {
      ...noEffects,
      identity: 1,
      ownerAdmission: 1,
    });

    const malformedBindings = [
      ["missing PILOT_OWNER_EMAIL", { ...localBindings, PILOT_OWNER_EMAIL: undefined }, 0],
      ["malformed PILOT_OWNER_EMAIL", { ...localBindings, PILOT_OWNER_EMAIL: "not-an-email" }, 1],
      ["missing OWNER_SUBJECT_PEPPER", { ...localBindings, OWNER_SUBJECT_PEPPER: undefined }, 0],
      ["short OWNER_SUBJECT_PEPPER", { ...localBindings, OWNER_SUBJECT_PEPPER: "too-short" }, 1],
    ];
    for (const [name, bindings, expectedAdmission] of malformedBindings) {
      const attempt = harness(modules, bindings);
      const response = await modules.handler.handleLocalDemoComposition(localRequest(), attempt.dependencies);
      assert.equal(response.status, 404, name);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", name);
      assert.deepEqual(await responseBody(response), { error: "not_found" }, name);
      assert.deepEqual(attempt.observed, {
        ...noEffects,
        identity: expectedAdmission,
        ownerAdmission: expectedAdmission,
      }, name);
    }
  } finally {
    await vite.close();
    delete globalThis.__prospectorCompositionTestEnv;
  }
});

test("the composition handler returns its immutable graph only after every authorization boundary", async () => {
  globalThis.__prospectorCompositionTestEnv = {};
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [{
      name: "composition-cloudflare-workers-success",
      resolveId(id) {
        return id === "cloudflare:workers" ? "\0composition-cloudflare-workers-success" : null;
      },
      load(id) {
        return id === "\0composition-cloudflare-workers-success"
          ? "export const env = globalThis.__prospectorCompositionTestEnv;"
          : null;
      },
    }],
  });
  try {
    const modules = {
      contract: await vite.ssrLoadModule(contractUrl),
      identity: await vite.ssrLoadModule(identityUrl),
      pilotAccess: await vite.ssrLoadModule(pilotAccessUrl),
      handler: await vite.ssrLoadModule(handlerUrl),
    };
    const accepted = harness(modules);
    const response = await modules.handler.handleLocalDemoComposition(localRequest(), accepted.dependencies);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await responseBody(response), await modules.contract.readLocalDemoComposition());
    assert.deepEqual(accepted.observed, {
      localDemoFence: 1,
      identity: 1,
      ownerAdmission: 1,
      compositionRead: 1,
      graphValidation: 1,
      persistence: 0,
      provider: 0,
      network: 0,
      outbound: 0,
      export: 0,
    });
  } finally {
    await vite.close();
    delete globalThis.__prospectorCompositionTestEnv;
  }
});

test("the handler rejects every mismatched predecessor ID and digest before serialization", async () => {
  globalThis.__prospectorCompositionTestEnv = {};
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [{
      name: "composition-cloudflare-workers-chain",
      resolveId(id) { return id === "cloudflare:workers" ? "\0composition-cloudflare-workers-chain" : null; },
      load(id) { return id === "\0composition-cloudflare-workers-chain" ? "export const env = globalThis.__prospectorCompositionTestEnv;" : null; },
    }],
  });
  try {
    const modules = {
      contract: await vite.ssrLoadModule(contractUrl),
      identity: await vite.ssrLoadModule(identityUrl),
      pilotAccess: await vite.ssrLoadModule(pilotAccessUrl),
      handler: await vite.ssrLoadModule(handlerUrl),
    };
    const canonical = await modules.contract.readLocalDemoComposition();
    for (const field of ["reviewedProspectId", "reviewedProspectDigest"]) {
      const changed = structuredClone(canonical);
      changed.ownerProspectApproval[field] = field === "reviewedProspectId"
        ? "wrong-prospect"
        : `sha256:${"0".repeat(64)}`;
      await assertGraphDenied(modules, changed, `ownerProspectApproval.${field}`);
    }
    for (const stageName of ["contactSuggestion", "verificationIntent", "contactReady", "package", "message", "suppression", "weeklyPreview", "crmPreview"]) {
      for (const field of ["predecessorId", "predecessorDigest"]) {
        const changed = structuredClone(canonical);
        changed[stageName][field] = field === "predecessorId" ? "wrong-predecessor" : `sha256:${"0".repeat(64)}`;
        await assertGraphDenied(modules, changed, `${stageName}.${field}`);
      }
    }
  } finally {
    await vite.close();
    delete globalThis.__prospectorCompositionTestEnv;
  }
});

async function independentDigest(stage) {
  const fields = { ...stage };
  delete fields.immutableDigest;
  const bytes = new TextEncoder().encode(canonicalJson(fields));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function assertGraphDenied(modules, changed, label) {
  const attempt = harness(modules, localBindings, undefined, changed);
  const response = await modules.handler.handleLocalDemoComposition(localRequest(), attempt.dependencies);
  assert.equal(response.status, 404, label);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", label);
  assert.deepEqual(await responseBody(response), { error: "not_found" }, label);
  assert.deepEqual(attempt.observed, {
    localDemoFence: 1,
    identity: 1,
    ownerAdmission: 1,
    compositionRead: 1,
    graphValidation: 1,
    persistence: 0,
    provider: 0,
    network: 0,
    outbound: 0,
    export: 0,
  }, label);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
