import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("stored Product and Profile choices are preferences only", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const preference = await vite.ssrLoadModule(
      new URL("../app/operator-preference.ts", import.meta.url).pathname,
    );
    const productIds = ["product-a", "product-b"];
    const profileIds = ["profile-a", "profile-b"];
    assert.equal(preference.chooseOperatorPreference("product-b", productIds, "product-a"), "product-b");
    assert.equal(preference.chooseOperatorPreference("profile-b", profileIds, "profile-a"), "profile-b");
    assert.equal(preference.chooseOperatorPreference("stale-product", productIds, "product-a"), "product-a");
    assert.equal(preference.chooseOperatorPreference("stale-profile", profileIds, "profile-a"), "profile-a");
    assert.equal(preference.chooseOperatorPreference("stale-product", productIds, "stale-server"), null);

    const throwing = {
      getItem() { throw new DOMException("denied", "SecurityError"); },
      setItem() { throw new DOMException("denied", "SecurityError"); },
    };
    assert.equal(preference.readOperatorPreference("choice", throwing), null);
    assert.doesNotThrow(() => preference.writeOperatorPreference("choice", "product-b", throwing));
  } finally {
    await vite.close();
  }
});

test("initial loads never send an unverified stored identifier to an authority endpoint", async () => {
  const [discovery, prospecting] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/discovery/discovery-workspace.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/prospecting/prospecting-workspace.tsx", import.meta.url), "utf8")),
  ]);
  assert.match(discovery, /setTimeout\(\(\) => \{ void load\(\); \}/);
  assert.doesNotMatch(discovery, /load\([^)]*readOperatorPreference/);
  assert.match(prospecting, /chooseOperatorPreference[\s\S]*initial\.profiles/);
});
