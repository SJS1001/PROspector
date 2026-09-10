import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("the screen normalizer rejects admission, materialization, effect, and chain drift", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const view = await vite.ssrLoadModule(new URL("../app/local-demo/_screen.tsx", import.meta.url).pathname);
    const contract = await vite.ssrLoadModule(new URL("../domain/local-demo-composition.ts", import.meta.url).pathname);
    const canonical = structuredClone(await contract.readLocalDemoComposition());
    assert.deepEqual(view.normalizeLocalDemoComposition(canonical), canonical);
    for (const mutate of [
      (value) => { value.crmPreview.realAdmissionCount = 1; },
      (value) => { value.crmPreview.materializationAuthorized = true; },
      (value) => { value.effects.effectCount = 1; },
      (value) => { value.effects.network = true; },
      (value) => { value.morningBrief.predecessorDigest = "stale"; },
    ]) {
      const candidate = structuredClone(canonical);
      mutate(candidate);
      assert.equal(view.normalizeLocalDemoComposition(candidate), null);
    }
  } finally { await vite.close(); }
});
