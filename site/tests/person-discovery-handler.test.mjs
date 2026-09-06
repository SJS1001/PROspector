import assert from "node:assert/strict";
import test from "node:test";
import { PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_OWNER, createPersonDiscoveryFixture, loadPersonDiscoveryModules } from "./helpers/person-discovery-fixture.mjs";

test("C2 admits only the owner, derives discovery authority server-side, and projects suggestions through a signed people cursor", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler");
  try {
    await alignOwner(fixture);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    let calls = 0;
    const service = discovery.createPersonDiscoveryService({
      database: fixture.database,
      port: testPort.bindPersonDiscoveryTestPort(async () => { calls += 1; return completed("handler", 6); }),
      now: () => PERSON_DISCOVERY_NOW + 100,
      idFactory: ids("handler"),
    });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    const initial = await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), dependencies);
    assert.equal(initial.status, 200);
    const cookie = csrfCookie(initial);
    const body = { action: "start_person_discovery", prospectId: fixture.prospectId, expectedProspectRevision: fixture.prospectRevision, maxCandidates: 6, maxProvenancePerCandidate: 1, idempotencyKey: "person-discovery-handler-start" };
    const started = await handler.handlePersonDiscoveryPost(mutation(body, cookie), dependencies);
    assert.equal(started.status, 200);
    assert.deepEqual(await started.json(), { command: { kind: "accepted", replayed: false } });
    assert.equal(calls, 1);

    const projected = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const payload = await projected.json();
    assert.equal(payload.people.status, "completed");
    assert.equal(payload.people.items.length, 5);
    assert.equal(payload.people.items[0].state, "suggestion_not_contact");
    assert.equal(payload.people.items[0].eligible, false);
    assert.equal(await count(fixture, "contacts"), 0, "projection never promotes a candidate to Contact");
    assert.ok(payload.people.pageInfo.nextCursor, "six bounded candidates require a real second page");
    const second = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}&peopleCursor=${encodeURIComponent(payload.people.pageInfo.nextCursor)}`), dependencies);
    const secondPayload = await second.json();
    assert.equal(secondPayload.people.items.length, 1);
    const tampered = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}&peopleCursor=x${payload.people.pageInfo.nextCursor}`), dependencies);
    assert.equal(tampered.status, 400, "a modified people cursor is rejected before projection");

    const expiry = PERSON_DISCOVERY_NOW + 100 + 90 * 24 * 60 * 60 * 1000;
    const expired = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), { ...dependencies, now: () => expiry });
    const expiredPayload = await expired.json();
    assert.equal(expiredPayload.people.items[0].state, "payload_unavailable");
    assert.equal("displayName" in expiredPayload.people.items[0], false, "expired candidate payload never leaks at read time");

    const decisionToken = csrfCookie(await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), dependencies));
    const noMatch = await handler.handlePersonDiscoveryPost(mutation({ action: "decide_person_discovery", runId: payload.people.runId, expectedResultDigest: payload.history.runs[0].resultDigest, decision: "no_match", candidateId: null, existingContactId: null, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: "person-discovery-handler-no-match" }, decisionToken), dependencies);
    assert.equal(noMatch.status, 200);
    assert.equal((await noMatch.json()).command.kind, "accepted");
    assert.equal(await count(fixture, "contacts"), 0, "no_match cannot manufacture a Contact");

    const bad = await handler.handlePersonDiscoveryPost(mutation({ ...body, idempotencyKey: "person-discovery-handler-bad", workspaceId: "forged" }, csrfCookie(await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), dependencies))), dependencies);
    assert.equal(bad.status, 400);
    assert.equal(calls, 1, "closed body rejection occurs before fake invocation");
  } finally { await fixture.dispose(); }
});

test("C2 production-shaped composition is reject-only and outsider paths disclose no authority or make no fake call", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-denied");
  try {
    await alignOwner(fixture);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const unavailable = await handler.handlePersonDiscoveryPost(new Request("https://prospector.invalid/api/contacts/person-discovery", { method: "POST", headers: { origin: "https://prospector.invalid", "sec-fetch-site": "same-origin", "x-prospector-intent": "person-discovery-mutation", "content-type": "application/json" }, body: JSON.stringify({ action: "start_person_discovery" }) }), deps(fixture));
    assert.equal(unavailable.status, 403, "a missing CSRF token fails before reject-only runtime evaluation");
    const outsider = await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), { ...deps(fixture), getIdentity: async () => ({ email: "outsider@example.invalid", displayName: "Outsider" }) });
    assert.equal(outsider.status, 404);
    assert.deepEqual(await outsider.json(), { error: "private_workspace_unavailable" });
    assert.equal(await count(fixture, "person_discovery_runs"), 0);
  } finally { await fixture.dispose(); }
});

test("C2 preserves a completed zero-candidate run instead of rewriting it as not started", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-zero");
  try {
    await alignOwner(fixture);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => ({ kind: "completed", candidates: [] })), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("zero") });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    const csrf = csrfCookie(await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), dependencies));
    const start = await handler.handlePersonDiscoveryPost(mutation({ action: "start_person_discovery", prospectId: fixture.prospectId, expectedProspectRevision: fixture.prospectRevision, maxCandidates: 1, maxProvenancePerCandidate: 1, idempotencyKey: "person-discovery-zero-start" }, csrf), dependencies);
    assert.equal(start.status, 200);
    const projection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const payload = await projection.json();
    assert.equal(payload.people.status, "completed");
    assert.ok(payload.people.runId);
    assert.match(payload.people.resultDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(payload.people.items, []);
    assert.equal(payload.people.pageInfo.returned, 0);
  } finally { await fixture.dispose(); }
});

function deps(fixture, personDiscoveryService) {
  return {
    database: fixture.database,
    subjectPepper: "0123456789abcdef0123456789abcdef",
    pilotOwnerEmail: "owner@example.invalid",
    csrfCookieMode: "local-demo",
    getIdentity: async () => ({ email: "owner@example.invalid", displayName: PERSON_DISCOVERY_OWNER.displayName }),
    ...(personDiscoveryService ? { personDiscoveryService } : {}),
  };
}
async function alignOwner(fixture) {
  const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
  const principal = await interview.principalFromIdentity("owner@example.invalid", PERSON_DISCOVERY_OWNER.displayName, "0123456789abcdef0123456789abcdef");
  await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.subject, fixture.workspaceId).run();
}
function mutation(body, cookie) { return new Request("https://prospector.invalid/api/contacts/person-discovery", { method: "POST", headers: { origin: "https://prospector.invalid", "sec-fetch-site": "same-origin", "x-prospector-intent": "person-discovery-mutation", "content-type": "application/json", cookie }, body: JSON.stringify(body) }); }
function csrfCookie(response) { const raw = response.headers.get("set-cookie"); const match = raw?.match(/prospector-local-csrf=([^;]+)/); assert.ok(match); return `prospector-local-csrf=${match[1]}`; }
function completed(key, count = 1) { return { kind: "completed", candidates: Array.from({ length: count }, (_, index) => ({ displayName: `Synthetic ${key} ${index}`, roleTitle: "Operations", roleSummary: "Synthetic role summary", provenance: [{ sourceReference: `https://example.invalid/team/${index}`, excerpt: "Synthetic public role listing", retrievedAt: PERSON_DISCOVERY_NOW }] })) }; }
function ids(prefix) { let count = 0; return () => `${prefix}-${++count}`; }
async function count(fixture, table) { return Number((await fixture.database.prepare(`SELECT count(*) count FROM ${table}`).first()).count); }
