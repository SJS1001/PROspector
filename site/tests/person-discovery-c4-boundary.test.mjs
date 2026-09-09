import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { browserAcceptanceWorkerConfig } from "../scripts/browser-acceptance-boundary.mjs";
import { PERSON_DISCOVERY_C4_BINDING_NAME, PERSON_DISCOVERY_C4_BINDING_VALUE, PERSON_DISCOVERY_C4_MIGRATIONS, personDiscoveryC4Bindings } from "../scripts/person-discovery-browser-boundary.mjs";
import { createServer } from "vite";
import { applyPersonDiscoveryMigrations, countRows, createD1Fixture, snapshotForbiddenOperationalRows } from "./helpers/d1.mjs";

const root = resolve(import.meta.dirname, "..");
test("C4 is a separate full-chain exact-binding browser lane", async () => {
  assert.equal(PERSON_DISCOVERY_C4_MIGRATIONS.length, 20);
  assert.equal(PERSON_DISCOVERY_C4_MIGRATIONS[0], "0000_jittery_meteorite.sql");
  assert.equal(PERSON_DISCOVERY_C4_MIGRATIONS.at(-1), "0019_person_discovery.sql");
  assert.equal(browserAcceptanceWorkerConfig({ d1: "DB", r2: "R2" }).vars[PERSON_DISCOVERY_C4_BINDING_NAME], undefined);
  assert.equal(browserAcceptanceWorkerConfig({ d1: "DB", r2: "R2" }, personDiscoveryC4Bindings()).vars[PERSON_DISCOVERY_C4_BINDING_NAME], PERSON_DISCOVERY_C4_BINDING_VALUE);
  assert.throws(() => browserAcceptanceWorkerConfig({ d1: "DB", r2: "R2" }, { PROSPECTOR_UNREVIEWED_BINDING: "value" }), /invalid additional browser acceptance binding/);
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  assert.equal(manifest.scripts["test:browser"], "node scripts/run-browser-acceptance.mjs");
  assert.equal(manifest.scripts["test:browser:person-discovery"], "node scripts/run-person-discovery-browser-acceptance.mjs");
});

test("runtime composition stays deterministic, secretless, loopback-only, and zero-network", async () => {
  const source = await readFile(resolve(root, "domain/person-discovery-c4-acceptance.ts"), "utf8");
  for (const invariant of ["import.meta.env.DEV", "synthetic-zero-network-c4-v1", "TRUSTED_IDENTITY_PROVIDER", "LOCAL_DEMO", "127.0.0.1", "synthetic_acceptance"]) assert.match(source, new RegExp(invariant.replaceAll(".", "\\.")));
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|credential|process\.env|provider[_-]?(?:key|token|secret)/i);
  const route = await readFile(resolve(root, "app/api/contacts/person-discovery/route.ts"), "utf8");
  assert.match(route, /createPersonDiscoveryC4Service\(request, bindings, database\)/);
  const seed = await readFile(resolve(root, "app/api/local-demo/person-discovery-c4/_handler.ts"), "utf8");
  assert.match(seed, /personDiscoveryC4Enabled/);
  assert.match(seed, /runtimeIdentity\(request, bindings\)/);
  assert.match(seed, /validateSameOriginMutation\(request, "person-discovery-c4-seed", 0\)/);
  assert.match(seed, /status: 404/);
});

test("C4 verifier admits only the exact canonical local enrichment chain and excludes every external-effect family", async () => {
  const source = await readFile(resolve(root, "scripts/verify-person-discovery-c4.mjs"), "utf8");
  for (const name of ["contact_point_observations", "contact_eligibility_snapshots", "contact_verification_receipts", "enrichment_grants", "enrichment_reservations", "provider_quotes", "phase_activation_gates", "runner_spend_grants", "outreach_messages", "outreach_outbox_items", "prospecting_schedules", "product_discovery_schedules", "_mf_objects"]) assert.match(source, new RegExp(name));
  assert.match(source, /ContactReady/);
  assert.match(source, /documented_cost_minor: 0/);
});

test("verification composition is a local adapter seam with no network or credential primitive", async () => {
  const source = await readFile(resolve(root, "domain/person-discovery-c4-verification.ts"), "utf8");
  for (const expected of [
    "createD1ContactsCommandService", "bindContactProviderPort", "bindContactEvidenceVerifier",
    "persistPersonDiscoveryC4ContactEligibilitySnapshot", "contact_verification_intents", "ContactReady",
  ]) assert.match(source, new RegExp(expected));
  assert.doesNotMatch(source, /DROP\s+TRIGGER|CREATE\s+TRIGGER|phase_activation_gates/i,
    "the synthetic consumer must not mutate or fabricate activation evidence");
  const persistence = await readFile(resolve(root, "domain/contact-eligibility-persistence.ts"), "utf8");
  assert.match(persistence, /persistCurrentContactEligibilitySnapshot[\s\S]*controlledEnrichmentActivated/);
  assert.match(persistence, /persistPersonDiscoveryC4ContactEligibilitySnapshot[\s\S]*import\.meta\.env\.DEV/);
  assert.match(persistence, /validateSameOriginMutation\(request, PERSON_DISCOVERY_C4_VERIFICATION_INTENT, 1024\)/);
  for (const forbidden of ["fetch(", "http://", "https://", "process.env", "Authorization", "Bearer "])
    assert.equal(source.includes(forbidden), false, forbidden);
  assert.doesNotMatch(source, /INSERT(?:\s+OR\s+\w+)?\s+INTO\s+(?:contact_eligibility_snapshots|contact_point_observations|contact_verification_receipts|enrichment_grants|enrichment_reservations)/i,
    "the consumer must not hand-construct canonical enrichment or ContactReady outputs");
  const route = await readFile(resolve(root, "app/api/local-demo/person-discovery-c4/verification/route.ts"), "utf8");
  assert.match(route, /import\.meta\.env\.DEV/);
  assert.match(route, /status: 404/);
  const handler = await readFile(resolve(root, "app/api/local-demo/person-discovery-c4/verification/_handler.ts"), "utf8");
  assert.ok(handler.indexOf("personDiscoveryC4Enabled(request, bindings)") < handler.indexOf("consumeCsrfToken("), "the exact local gate must close before any durable mutation");
});

test("C4 seed creates one explicit Approved Prospect with no schedule", async () => {
  const fixture = await createD1Fixture("c4-seed-boundary");
  try {
    await applyPersonDiscoveryMigrations(fixture.database);
    const acceptanceModule = await fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-acceptance.ts"));
    const seeded = await acceptanceModule.seedPersonDiscoveryC4(fixture.database, "local-owner@prospector.invalid", "synthetic-browser-acceptance-pepper-32-bytes-minimum");
    assert.deepEqual(seeded, { status: "ready", prospectId: "c4-approved-prospect" });
    assert.equal(Number((await fixture.database.prepare("SELECT COUNT(*) count FROM profile_prospects WHERE id='c4-approved-prospect' AND state='approved' AND active=1").first()).count), 1);
    assert.equal(Number((await fixture.database.prepare("SELECT COUNT(*) count FROM prospecting_schedules").first()).count), 0);
    const joined = await fixture.database.prepare(`SELECT p.workspace_id,p.profile_id,p.candidate_id,p.assessment_id,p.state,p.active,profile.lifecycle profile_lifecycle,play.lifecycle play_lifecycle,product.lifecycle product_lifecycle,cfg.id configuration_id,cfg.active configuration_active,candidate.configuration_id candidate_configuration,candidate.status candidate_status,assessment.configuration_id assessment_configuration,assessment.configuration_digest assessment_digest,assessment.outcome,review.decision
      FROM profile_prospects p JOIN customer_profiles profile ON profile.id=p.profile_id AND profile.workspace_id=p.workspace_id JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id JOIN typed_configurations cfg ON cfg.workspace_id=p.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=p.profile_id AND cfg.kind='profile_effective' AND cfg.active=1 JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id AND candidate.profile_id=p.profile_id JOIN qualification_assessments assessment ON assessment.id=p.assessment_id AND assessment.workspace_id=p.workspace_id AND assessment.candidate_id=candidate.id JOIN prospect_review_decisions review ON review.prospect_id=p.id AND review.workspace_id=p.workspace_id AND review.assessment_id=p.assessment_id WHERE p.id='c4-approved-prospect'`).first();
    assert.ok(joined, "C4 authority ancestry must join");
    assert.equal(joined.candidate_configuration, joined.configuration_id, JSON.stringify(joined));
    assert.equal(joined.assessment_configuration, joined.configuration_id, JSON.stringify(joined));
    assert.equal(joined.assessment_digest, "5".repeat(64), JSON.stringify(joined));
    const [handler, acceptance] = await Promise.all([
      fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-handler.ts")),
      fixture.vite.ssrLoadModule(resolve(root, "domain/person-discovery-c4-acceptance.ts")),
    ]);
    const guardedRequest = new Request("http://127.0.0.1:8788/api/contacts/person-discovery");
    for (const bindings of [
      {},
      { PROSPECTOR_PERSON_DISCOVERY_C4: "synthetic-zero-network-c4-v1", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "0" },
      { PROSPECTOR_PERSON_DISCOVERY_C4: "synthetic-zero-network-c4-v1", TRUSTED_IDENTITY_PROVIDER: "access", LOCAL_DEMO: "1" },
      { PROSPECTOR_PERSON_DISCOVERY_C4: "wrong", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" },
    ]) assert.equal(acceptance.createPersonDiscoveryC4Service(guardedRequest, bindings, fixture.database), undefined);
    assert.equal(acceptance.createPersonDiscoveryC4Service(new Request("https://prospector.example/api/contacts/person-discovery"), { PROSPECTOR_PERSON_DISCOVERY_C4: "synthetic-zero-network-c4-v1", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" }, fixture.database), undefined);
    const service = acceptance.createPersonDiscoveryC4Service(new Request("http://127.0.0.1:8788/api/contacts/person-discovery"), { PROSPECTOR_PERSON_DISCOVERY_C4: "synthetic-zero-network-c4-v1", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" }, fixture.database);
    assert.ok(service);
    const response = await handler.handlePersonDiscoveryGet(new Request("http://127.0.0.1:8788/api/contacts/person-discovery"), { database: fixture.database, subjectPepper: "synthetic-browser-acceptance-pepper-32-bytes-minimum", pilotOwnerEmail: "local-owner@prospector.invalid", csrfCookieMode: "local-demo", getIdentity: async () => ({ email: "local-owner@prospector.invalid", displayName: "Local Demo Owner" }), personDiscoveryService: service });
    assert.equal(response.status, 200);
    const projection = await response.json();
    assert.equal(projection.capability, "test_composed_only");
    assert.deepEqual(projection.approvedProspects.map((row) => row.prospectId), ["c4-approved-prospect"]);
  } finally { await fixture.dispose(); }
});

test("the C4 seed route refuses a mutation that is not proven same-origin", async () => {
  const fixture = await createD1Fixture("c4-seed-same-origin");
  let routeVite;
  try {
    await applyPersonDiscoveryMigrations(fixture.database);
    globalThis.__prospectorRouteTestEnv = {
      DB: fixture.database,
      OWNER_SUBJECT_PEPPER: "synthetic-browser-acceptance-pepper-32-bytes-minimum",
      PILOT_OWNER_EMAIL: "local-owner@prospector.invalid",
      TRUSTED_IDENTITY_PROVIDER: "local-demo",
      LOCAL_DEMO: "1",
      [PERSON_DISCOVERY_C4_BINDING_NAME]: PERSON_DISCOVERY_C4_BINDING_VALUE,
    };
    routeVite = await createServer({ configFile: false, logLevel: "silent", plugins: [{
      name: "test-cloudflare-workers",
      resolveId(id) { if (id === "cloudflare:workers") return "\0test-cloudflare-workers"; },
      load(id) { if (id === "\0test-cloudflare-workers") return "export const env = globalThis.__prospectorRouteTestEnv"; },
    }] });
    const route = await routeVite.ssrLoadModule(resolve(root, "app/api/local-demo/person-discovery-c4/route.ts"));
    const seedOrigin = "http://127.0.0.1:8788";
    const seedUrl = `${seedOrigin}/api/local-demo/person-discovery-c4`;
    const before = await snapshotForbiddenOperationalRows(fixture.database);

    // Correct C4 bindings and a loopback URL, but `sec-fetch-site` is absent,
    // so the mutation is not proven same-origin. The route answers with its own
    // uniform not-found surface and seeds nothing.
    const refused = await route.POST(new Request(seedUrl, {
      method: "POST",
      headers: { origin: seedOrigin, "content-type": "application/json", "x-prospector-intent": "person-discovery-c4-seed" },
    }));
    assert.equal(refused.status, 404);
    assert.deepEqual(await refused.json(), { error: "not_found" });
    assert.equal(await countRows(fixture.database, "profile_prospects"), 0);
    assert.deepEqual(await snapshotForbiddenOperationalRows(fixture.database), before);

    // The exact header set the browser acceptance lane sends is still admitted.
    const accepted = await route.POST(new Request(seedUrl, {
      method: "POST",
      headers: { origin: seedOrigin, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-prospector-intent": "person-discovery-c4-seed" },
    }));
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { status: "ready", prospectId: "c4-approved-prospect" });
  } finally {
    delete globalThis.__prospectorRouteTestEnv;
    if (routeVite) await routeVite.close();
    await fixture.dispose();
  }
});
