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
    const assessment = qualification.evaluateMiningQualification({
      configurationDigest: "a".repeat(64),
      rubricDigest: "b".repeat(64),
      evaluationVersion: qualification.MINING_EVALUATION_VERSION,
      candidateId: "candidate",
      accountId: "account",
      targetId: "target",
      offerId: "offer",
      accountFit: 2,
      painStrength: 2,
      timingUrgency: 1,
      dataReadiness: 1,
      commercialViability: 1,
      requiredEvidence: ["target", "pain", "timing", "operation", "offer"],
      sources: [{
        id: "candidate:source",
        tier: 1,
        independenceGroup: "origin:example.com",
        retrievedAt: 1_780_000_000_000,
        recency: "current",
        material: true,
      }],
    });
    assert.equal(assessment.outcome, "Passed");
    assert.equal(assessment.candidateId, "candidate");
    assert.equal(assessment.freshestMaterialEvent, 1_780_000_000_000);
    const source = await sourcePolicy.validateSourceObservation({ tier1Origins: ["example.com"], tier2Origins: [], materialSignalKinds: ["signal"] }, { url: "https://news.example.com/a", retrievedAt: 1_780_000_000_000, observedAt: 1_780_000_000_000, excerpt: "<script>", kind: "signal" }, 1_780_000_000_000);
    assert.equal(source.tier, 1); assert.match(source.excerpt, /&lt;/);
    await assert.rejects(() => runnerPort.createRejectOnlyRunnerPort().deliver({}), /unavailable/);
    await assert.rejects(() => retrieval.createRejectOnlyRetrievalPort().retrieve({}), /unavailable/);
    const after = await snapshotForbiddenOperationalRows(fixture.database);
    assert.deepEqual(after, before);
  } finally { await fixture.dispose(); }
});

test("owner handler consumes and rotates its HttpOnly CSRF cookie across exact profile reads", async () => {
  const fixture = await createD1Fixture("phase4-handler-csrf");
  try {
    await applyMigrations(fixture.database);
    const identity = {
      email: "phase4-owner@example.com",
      displayName: "Phase 4 owner",
    };
    const subjectPepper = "phase4-handler-test-pepper-material-at-least-thirty-two-bytes";
    const access = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/prospecting-handler.ts", import.meta.url).pathname);
    const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
    const principal = await access.admitPilotOwner(identity, identity.email, subjectPepper);
    const model = await commercial.initializeCommercialModel(fixture.database, principal, {
      idempotencyKey: "0198f400-0000-7000-8000-000000000301",
    });
    const profile = model.profiles.find((entry) => entry.name === "Operating");
    assert.ok(profile);
    const dependencies = {
      database: fixture.database,
      subjectPepper,
      pilotOwnerEmail: identity.email,
      async getIdentity() { return identity; },
    };
    const baseUrl = `https://prospector.test/api/prospecting?profileId=${encodeURIComponent(profile.id)}`;
    const initial = await handler.handleProspectingGet(new Request(baseUrl), dependencies);
    assert.equal(initial.status, 200);
    const firstCookie = csrfCookie(initial);

    const post = (cookie) => handler.handleProspectingPost(new Request(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: "https://prospector.test",
        "sec-fetch-site": "same-origin",
        "x-prospector-intent": handler.PROSPECTING_MUTATION_INTENT,
      },
      body: JSON.stringify({
        action: "read_profile_readiness",
        profileId: profile.id,
      }),
    }), dependencies);

    const first = await post(firstCookie);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const firstProjection = await first.json();
    assert.equal(firstProjection.readiness.profile.id, profile.id);
    const rotatedCookie = csrfCookie(first);
    assert.notEqual(rotatedCookie, firstCookie);

    const replay = await post(firstCookie);
    assert.equal(replay.status, 403);
    assert.deepEqual(await replay.json(), { error: "invalid_csrf_token" });

    const second = await post(rotatedCookie);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).readiness.profile.id, profile.id);
  } finally {
    await fixture.dispose();
  }
});

function csrfCookie(response) {
  const value = response.headers.get("set-cookie");
  const match = /(?:^|,\s*)(__Host-prospector-csrf=[A-Za-z0-9_-]{43})/.exec(value ?? "");
  assert.ok(match, "the owner response must set the opaque HttpOnly CSRF cookie");
  return match[1];
}
