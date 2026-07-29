import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

test("capability projection requires current complete accepted evidence", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const {
      CAPABILITY_IDS,
      projectCapabilityState,
    } = await vite.ssrLoadModule(
      new URL("../domain/capabilities.ts", import.meta.url).pathname,
    );
    const now = Date.parse("2026-07-29T16:00:00.000Z");

    assert.equal(
      projectCapabilityState({
        capabilityId: CAPABILITY_IDS.objectStorage,
        prerequisite: { available: false, reason: "Storage binding is unavailable." },
        evidence: null,
        now,
      }).status,
      "blocked",
    );
    assert.equal(
      projectCapabilityState({
        capabilityId: CAPABILITY_IDS.objectStorage,
        prerequisite: { available: true },
        evidence: null,
        now,
      }).status,
      "unproven",
    );
    assert.equal(
      projectCapabilityState({
        capabilityId: CAPABILITY_IDS.objectStorage,
        prerequisite: { available: true },
        evidence: proof({ checkedAt: now - 1_000 }),
        now,
      }).status,
      "proven",
    );

    for (const evidence of [
      proof({ checkedAt: now - 25 * 60 * 60 * 1_000 }),
      proof({ checkedAt: now - 1_000, steps: { absence: false } }),
      proof({ checkedAt: now - 1_000, outcome: "failed" }),
    ]) {
      assert.notEqual(
        projectCapabilityState({
          capabilityId: CAPABILITY_IDS.objectStorage,
          prerequisite: { available: true },
          evidence,
          now,
        }).status,
        "proven",
      );
    }

    const source = await readFile(
      new URL("../domain/capabilities.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /export type CapabilityStatus\s*=\s*"proven"\s*\|\s*"blocked"\s*\|\s*"unproven"/,
    );
    assert.doesNotMatch(source, /Boolean\s*\(\s*FILES\s*\).*proven/is);
  } finally {
    await vite.close();
  }
});

function proof(overrides = {}) {
  return {
    reference: "evidence_safe_reference",
    checkedAt: Date.now(),
    outcome: "passed",
    steps: {
      put: true,
      read: true,
      digest: true,
      delete: true,
      absence: true,
      ...overrides.steps,
    },
    ...overrides,
  };
}
