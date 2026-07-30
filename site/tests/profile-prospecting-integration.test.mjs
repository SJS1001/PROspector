import assert from "node:assert/strict";
import test from "node:test";
import { createD1Fixture, applyMigrations, snapshotForbiddenOperationalRows } from "./helpers/d1.mjs";

test("Phase 4 synthetic lifecycle keeps all external and later-phase effects unavailable", async () => {
  const fixture = await createD1Fixture("phase4-integration");
  try {
    await applyMigrations(fixture.database);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const qualification = await fixture.vite.ssrLoadModule(new URL("../domain/qualification.ts", import.meta.url).pathname);
    const sourcePolicy = await fixture.vite.ssrLoadModule(new URL("../domain/source-policy.ts", import.meta.url).pathname);
    const runnerPort = await fixture.vite.ssrLoadModule(new URL("../domain/ports/runner.ts", import.meta.url).pathname);
    const retrieval = await fixture.vite.ssrLoadModule(new URL("../domain/ports/retrieval.ts", import.meta.url).pathname);
    const assessment = qualification.evaluateMiningQualification({ configurationDigest: "a".repeat(64), candidateId: "candidate", accountId: "account", targetId: "target", offerId: "offer", accountFit: 2, painStrength: 2, timingUrgency: 1, dataReadiness: 1, commercialViability: 1, requiredEvidence: ["target", "pain", "timing", "operation", "offer"], sources: [{ id: "source", tier: 1, independenceGroup: "origin", retrievedAt: 1_780_000_000_000 }] });
    assert.equal(assessment.outcome, "Passed");
    const source = await sourcePolicy.validateSourceObservation({ tier1Origins: ["example.com"], tier2Origins: [], materialSignalKinds: ["signal"] }, { url: "https://news.example.com/a", retrievedAt: 1_780_000_000_000, observedAt: 1_780_000_000_000, excerpt: "<script>", kind: "signal" }, 1_780_000_000_000);
    assert.equal(source.tier, 1); assert.match(source.excerpt, /&lt;/);
    await assert.rejects(() => runnerPort.createRejectOnlyRunnerPort().deliver({}), /unavailable/);
    await assert.rejects(() => retrieval.createRejectOnlyRetrievalPort().retrieve({}), /unavailable/);
    const after = await snapshotForbiddenOperationalRows(fixture.database);
    assert.deepEqual(after, before);
  } finally { await fixture.dispose(); }
});
