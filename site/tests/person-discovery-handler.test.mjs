import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
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
    const allItems = [...payload.people.items, ...secondPayload.people.items];
    assert.deepEqual(allItems.map((item) => item.ordinal).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5], "candidate ordinals are exactly zero-based across the bounded result");
    assert.deepEqual(allItems.find((item) => item.ordinal === 0).provenance, { sourceReference: "https://example.invalid/team/0", excerpt: "Synthetic public role listing", retrievedAt: PERSON_DISCOVERY_NOW });
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
    const terminal = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const terminalPayload = await terminal.json();
    assert.deepEqual(terminalPayload.history.decisions, [{ decisionId: terminalPayload.history.decisions[0].decisionId, runId: payload.people.runId, prospectId: fixture.prospectId, decision: "no_match", candidateId: null, contactId: null }]);
    assert.deepEqual(terminalPayload.history.relevance, [], "a no-match result exposes no verification authority");
    assert.deepEqual(terminalPayload.history.verificationIntents, []);
    assert.deepEqual(terminalPayload.history.staleTrustedObservations, []);

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
    assert.deepEqual(payload.linkableContacts, [], "no unrelated Contact is exposed by the scoped projection");
    assert.equal(payload.people.status, "completed");
    assert.ok(payload.people.runId);
    assert.match(payload.people.resultDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(payload.people.items, []);
    assert.equal(payload.people.pageInfo.returned, 0);
  } finally { await fixture.dispose(); }
});

test("C2 fails closed on malformed or wrong-action service results", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-malformed");
  try {
    await alignOwner(fixture);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const malformed = { start: async () => ({ kind: "accepted", replayed: false }), decide: async () => ({ kind: "blocked", reason: "leaked" }), recordVerificationIntent: async () => ({ kind: "conflict", reason: "leaked" }) };
    const dependencies = deps(fixture, malformed);
    const csrf = csrfCookie(await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), dependencies));
    const response = await handler.handlePersonDiscoveryPost(mutation({ action: "start_person_discovery", prospectId: fixture.prospectId, expectedProspectRevision: fixture.prospectRevision, maxCandidates: 1, maxProvenancePerCandidate: 1, idempotencyKey: "person-discovery-malformed-start" }, csrf), dependencies);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { command: { kind: "blocked", reason: "invalid_service_result" } });
  } finally { await fixture.dispose(); }
});

test("C2 replays each durable command exactly and rejects every changed client field without extra discovery or authority writes", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-replays");
  try {
    await alignOwner(fixture);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    let calls = 0;
    const service = discovery.createPersonDiscoveryService({
      database: fixture.database,
      port: testPort.bindPersonDiscoveryTestPort(async (assignment) => { calls += 1; return completed("replay", assignment.maxCandidates); }),
      now: () => PERSON_DISCOVERY_NOW + 100,
      idFactory: ids("replay"),
    });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    const start = startBody(fixture, "handler-replay-start");
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(start, await csrf(handler, dependencies)), dependencies)).status, 200);
    assert.equal(calls, 1);
    // The exact key can replay after later client-side lifecycle/config drift;
    // the durable request, not the changed client value, is authoritative.
    await fixture.database.prepare("UPDATE profile_prospects SET revision=revision+1 WHERE id=?").bind(fixture.prospectId).run();
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(start, await csrf(handler, dependencies)), dependencies)).status, 200);
    assert.equal(calls, 1, "an exact durable replay does not rediscover");
    for (const changed of [
      { ...start, prospectId: "wrong-prospect" },
      { ...start, expectedProspectRevision: fixture.prospectRevision + 1 },
      { ...start, maxCandidates: 3 },
      { ...start, maxProvenancePerCandidate: 2 },
    ]) {
      const response = await handler.handlePersonDiscoveryPost(mutation(changed, await csrf(handler, dependencies)), dependencies);
      assert.ok([400, 409].includes(response.status), "a changed or shape-invalid decision never replays");
    }
    assert.equal(calls, 1);
    // Restore only the disposable fixture's projection revision so the owner
    // can make a fresh decision against the already durable run.
    await fixture.database.prepare("UPDATE profile_prospects SET revision=? WHERE id=?").bind(fixture.prospectRevision, fixture.prospectId).run();
    // A new semantic request gives the decision a current, independent run;
    // the earlier run remains the replay-after-drift proof above.
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "handler-replay-decision-start", { maxCandidates: 1 }), await csrf(handler, dependencies)), dependencies)).status, 200);
    assert.equal(calls, 2);
    const projection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const payload = await projection.json();
    const candidateId = payload.people.items[0].candidateId;
    const decision = {
      action: "decide_person_discovery", runId: payload.people.runId, expectedResultDigest: payload.history.runs[0].resultDigest,
      decision: "create_new", candidateId, existingContactId: null, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: "handler-replay-decision",
    };
    const decisionReplay = await handler.handlePersonDiscoveryPost(mutation(decision, await csrf(handler, dependencies)), dependencies);
    assert.equal(decisionReplay.status, 200, JSON.stringify(await decisionReplay.json()));
    const counts = await governedCounts(fixture);
    const replayRow = await fixture.database.prepare("SELECT decision.run_id,run.prospect_revision FROM person_discovery_owner_decisions decision JOIN person_discovery_runs run ON run.id=decision.run_id WHERE decision.idempotency_key=?").bind(decision.idempotencyKey).first();
    assert.equal(replayRow.run_id, decision.runId);
    assert.equal(Number(replayRow.prospect_revision), decision.expectedProspectRevision);
    const exactDecisionReplay = await handler.handlePersonDiscoveryPost(mutation(decision, await csrf(handler, dependencies)), dependencies);
    assert.equal(exactDecisionReplay.status, 200, JSON.stringify(await exactDecisionReplay.json()));
    for (const changed of [
      { ...decision, runId: "wrong-run" }, { ...decision, expectedResultDigest: "0".repeat(64) },
      { ...decision, decision: "no_match", candidateId: null }, { ...decision, candidateId: "wrong-candidate" },
      { ...decision, existingContactId: "wrong-contact" }, { ...decision, expectedProspectRevision: fixture.prospectRevision + 1 },
    ]) {
      const response = await handler.handlePersonDiscoveryPost(mutation(changed, await csrf(handler, dependencies)), dependencies);
      assert.ok([400, 409].includes(response.status), "a changed or shape-invalid decision never replays");
    }
    assert.deepEqual(await governedCounts(fixture), counts, "replay/conflict must add no Contact, relevance, intent, or effect row");
    const relevanceId = (await fixture.database.prepare("SELECT id FROM prospect_contact_role_relevance WHERE workspace_id=?").bind(fixture.workspaceId).first()).id;
    const contactRevision = Number((await fixture.database.prepare("SELECT revision FROM contacts WHERE workspace_id=?").bind(fixture.workspaceId).first()).revision);
    const intent = { action: "record_verification_intent", relevanceId, intent: "initial_verification", channel: "email", sourceObservationId: null, expectedProspectRevision: fixture.prospectRevision, expectedContactRevision: contactRevision, idempotencyKey: "handler-replay-intent" };
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(intent, await csrf(handler, dependencies)), dependencies)).status, 200);
    const afterIntent = await governedCounts(fixture);
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(intent, await csrf(handler, dependencies)), dependencies)).status, 200);
    for (const changed of [
      { ...intent, relevanceId: "wrong-relevance" }, { ...intent, intent: "stale_refresh", sourceObservationId: "wrong-source" },
      { ...intent, channel: "phone" }, { ...intent, sourceObservationId: "wrong-source" },
      { ...intent, expectedProspectRevision: fixture.prospectRevision + 1 }, { ...intent, expectedContactRevision: contactRevision + 1 },
    ]) {
      // Keep a shape-valid changed value where necessary: a bad shape is also
      // rejected, but cannot accidentally be mistaken for a replay conflict.
      const response = await handler.handlePersonDiscoveryPost(mutation(changed, await csrf(handler, dependencies)), dependencies);
      assert.ok([400, 409].includes(response.status));
    }
    assert.deepEqual(await governedCounts(fixture), afterIntent);
    assert.equal(calls, 2);
  } finally { await fixture.dispose(); }
});

test("C2 pages five suggestions stably and rejects cursor substitution, tampering, and stale projection generation", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-pages");
  try {
    await alignOwner(fixture);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completed("page", 20)), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("page") });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "handler-pages-start", { maxCandidates: 20 }), await csrf(handler, dependencies)), dependencies)).status, 200);
    let url = `https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`;
    const idsSeen = [];
    let firstCursor;
    for (let page = 0; page < 4; page += 1) {
      const response = await handler.handlePersonDiscoveryGet(new Request(url), dependencies);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.people.pageInfo.limit, 5);
      assert.equal(body.people.pageInfo.returned, 5);
      assert.equal(body.people.items.length, 5);
      idsSeen.push(...body.people.items.map((item) => item.candidateId));
      if (page === 0) firstCursor = body.people.pageInfo.nextCursor;
      assert.equal(body.people.pageInfo.hasNext, page < 3);
      url = body.people.pageInfo.nextCursor ? `https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}&peopleCursor=${encodeURIComponent(body.people.pageInfo.nextCursor)}` : url;
    }
    assert.equal(new Set(idsSeen).size, 20, "high-water pagination neither duplicates nor drops initial candidates");
    const substitute = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=foreign-prospect&peopleCursor=${encodeURIComponent(firstCursor)}`), dependencies);
    assert.equal(substitute.status, 409, "a signed cursor cannot select another Prospect");
    await fixture.database.prepare("UPDATE contacts_projection_generations SET contacts_generation=contacts_generation+1 WHERE workspace_id=?").bind(fixture.workspaceId).run();
    const stale = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}&peopleCursor=${encodeURIComponent(firstCursor)}`), dependencies);
    assert.equal(stale.status, 409, "generation changes invalidate later pages rather than mixing snapshots");
  } finally { await fixture.dispose(); }
});

test("C2 invalidates an old completed cursor when the latest run is requested or needs reconciliation", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-latest-state");
  try {
    await alignOwner(fixture);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    let invocation = 0;
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => (++invocation === 1 ? completed("latest", 6) : { kind: "unknown" })), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("latest") });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "handler-latest-complete", { maxCandidates: 6 }), await csrf(handler, dependencies)), dependencies)).status, 200);
    const first = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const cursor = (await first.json()).people.pageInfo.nextCursor;
    assert.ok(cursor);
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "handler-latest-unknown", { maxCandidates: 5 }), await csrf(handler, dependencies)), dependencies)).status, 200);
    const stale = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}&peopleCursor=${encodeURIComponent(cursor)}`), dependencies);
    assert.equal(stale.status, 409);
    const latest = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    assert.equal((await latest.json()).people.status, "needs_reconciliation");
  } finally { await fixture.dispose(); }
});

test("C2 link_existing accepts only the explicit same-workspace Contact and creates no second identity", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-link");
  try {
    await alignOwner(fixture);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completed("link", 1)), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("link") });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    const company = await fixture.database.prepare("SELECT company_id FROM workspace_companies WHERE workspace_id=? LIMIT 1").bind(fixture.workspaceId).first();
    await fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES ('handler-explicit-contact',?,?,?,1,?,?,'Explicit Contact')").bind(fixture.workspaceId, PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW, company.company_id, "1".repeat(64)).run();
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "handler-link-start", { maxCandidates: 1 }), await csrf(handler, dependencies)), dependencies)).status, 200);
    const projection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const payload = await projection.json();
    const link = { action: "decide_person_discovery", runId: payload.people.runId, expectedResultDigest: payload.history.runs[0].resultDigest, decision: "link_existing", candidateId: payload.people.items[0].candidateId, existingContactId: "handler-explicit-contact", expectedProspectRevision: fixture.prospectRevision, idempotencyKey: "handler-link-decision" };
    assert.equal((await handler.handlePersonDiscoveryPost(mutation(link, await csrf(handler, dependencies)), dependencies)).status, 200);
    assert.equal(await count(fixture, "contacts"), 1);
    assert.equal(await count(fixture, "prospect_contact_role_relevance"), 1);
    const linkedProjection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const linkedPayload = await linkedProjection.json();
    assert.equal(linkedPayload.history.relevance[0].contactRevision, 1);
    assert.equal(linkedPayload.history.relevance[0].contactLabel, "Explicit Contact");
    const replay = await handler.handlePersonDiscoveryPost(mutation(link, await csrf(handler, dependencies)), dependencies);
    assert.equal(replay.status, 200);
    const changed = await handler.handlePersonDiscoveryPost(mutation({ ...link, existingContactId: "wrong-contact" }, await csrf(handler, dependencies)), dependencies);
    assert.equal(changed.status, 409);
    assert.equal(await count(fixture, "contacts"), 1);
  } finally { await fixture.dispose(); }
});

test("C2 rejects hostile transport before service invocation and a valid production-shaped request remains reject-only", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-fences");
  try {
    await alignOwner(fixture);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    let calls = 0;
    const fake = { start: async () => { calls += 1; return { kind: "blocked", reason: "port_unavailable" }; }, decide: async () => { calls += 1; return { kind: "blocked", reason: "invalid_request" }; }, recordVerificationIntent: async () => { calls += 1; return { kind: "blocked", reason: "invalid_request" }; } };
    const dependencies = deps(fixture, fake);
    const body = startBody(fixture, "handler-fences-start");
    const hostile = [
      new Request("https://prospector.invalid/api/contacts/person-discovery", { method: "POST", headers: { origin: "https://evil.invalid", "sec-fetch-site": "cross-site", "x-prospector-intent": "person-discovery-mutation", "content-type": "application/json" }, body: JSON.stringify(body) }),
      new Request("https://prospector.invalid/api/contacts/person-discovery", { method: "POST", headers: { origin: "https://prospector.invalid", "sec-fetch-site": "same-origin", "x-prospector-intent": "wrong", "content-type": "application/json" }, body: JSON.stringify(body) }),
      new Request("https://prospector.invalid/api/contacts/person-discovery", { method: "POST", headers: { origin: "https://prospector.invalid", "sec-fetch-site": "same-origin", "x-prospector-intent": "person-discovery-mutation", "content-type": "text/plain" }, body: JSON.stringify(body) }),
    ];
    for (const request of hostile) assert.ok([403, 415].includes((await handler.handlePersonDiscoveryPost(request, dependencies)).status));
    const oversized = mutation({ ...body, padding: "x".repeat(5000) }, await csrf(handler, dependencies));
    assert.equal((await handler.handlePersonDiscoveryPost(oversized, dependencies)).status, 413);
    const malformed = mutation({ ...body, workspaceId: "forged" }, await csrf(handler, dependencies));
    assert.equal((await handler.handlePersonDiscoveryPost(malformed, dependencies)).status, 400);
    assert.equal(calls, 0);
    const rejectOnly = await handler.handlePersonDiscoveryPost(mutation(body, await csrf(handler, deps(fixture))), deps(fixture));
    assert.deepEqual(await rejectOnly.json(), { error: "person_discovery_capability_unavailable" });
    assert.equal(await count(fixture, "person_discovery_runs"), 0);
    assert.equal(await count(fixture, "contacts"), 0);
    assert.equal(await count(fixture, "prospect_contact_role_relevance"), 0);
    assert.equal(await count(fixture, "contact_verification_intents"), 0);
  } finally { await fixture.dispose(); }
});

test("C2 real route keeps a valid-CSRF production-shaped mutation reject-only", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-real-route");
  let routeVite;
  try {
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
    const principal = await interview.principalFromIdentity("local-owner@prospector.invalid", "Local Demo Owner", "0123456789abcdef0123456789abcdef");
    await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.subject, fixture.workspaceId).run();
    globalThis.__prospectorRouteTestEnv = { DB: fixture.database, OWNER_SUBJECT_PEPPER: "0123456789abcdef0123456789abcdef", PILOT_OWNER_EMAIL: "local-owner@prospector.invalid", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" };
    routeVite = await createServer({ configFile: false, logLevel: "silent", plugins: [{ name: "test-cloudflare-workers", resolveId(id) { if (id === "cloudflare:workers") return "\0test-person-discovery-workers"; }, load(id) { if (id === "\0test-person-discovery-workers") return "export const env = globalThis.__prospectorRouteTestEnv"; } }] });
    const route = await routeVite.ssrLoadModule(new URL("../app/api/contacts/person-discovery/route.ts", import.meta.url).pathname);
    const get = await route.GET(new Request("http://localhost:8788/api/contacts/person-discovery"));
    assert.equal(get.status, 200);
    const cookie = csrfCookie(get);
    const post = await route.POST(new Request("http://localhost:8788/api/contacts/person-discovery", { method: "POST", headers: { origin: "http://localhost:8788", "sec-fetch-site": "same-origin", "x-prospector-intent": "person-discovery-mutation", "content-type": "application/json", cookie }, body: JSON.stringify(startBody(fixture, "handler-real-route-start")) }));
    assert.equal(post.status, 409);
    assert.deepEqual(await post.json(), { error: "person_discovery_capability_unavailable" });
    assert.equal(await count(fixture, "person_discovery_runs"), 0);
  } finally { delete globalThis.__prospectorRouteTestEnv; if (routeVite) await routeVite.close(); await fixture.dispose(); }
});

test("C2 rejects every foreign service outcome shape and reason without exposing it or adding a business row", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-service-shapes");
  try {
    await alignOwner(fixture);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const setupService = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completed("strict", 1)), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("strict") });
    const setupDependencies = deps(fixture, setupService);
    await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "strict-decision-run", { maxCandidates: 1 }), await csrf(handler, setupDependencies)), setupDependencies);
    const firstProjection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setupDependencies);
    const firstPayload = await firstProjection.json();
    const setupDecision = { action: "decide_person_discovery", runId: firstPayload.people.runId, expectedResultDigest: firstPayload.history.runs[0].resultDigest, decision: "create_new", candidateId: firstPayload.people.items[0].candidateId, existingContactId: null, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: "strict-decision-setup" };
    await handler.handlePersonDiscoveryPost(mutation(setupDecision, await csrf(handler, setupDependencies)), setupDependencies);
    const relevanceId = (await fixture.database.prepare("SELECT id FROM prospect_contact_role_relevance WHERE workspace_id=?").bind(fixture.workspaceId).first()).id;
    const contactRevision = Number((await fixture.database.prepare("SELECT revision FROM contacts WHERE workspace_id=?").bind(fixture.workspaceId).first()).revision);
    await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "strict-decision-run-two", { maxCandidates: 1 }), await csrf(handler, setupDependencies)), setupDependencies);
    const secondProjection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setupDependencies);
    const secondPayload = await secondProjection.json();
    const scenarios = [
      ["start_person_discovery", startBody(fixture, "shape-start"), { kind: "blocked", reason: "candidate_unavailable" }],
      ["decide_person_discovery", { action: "decide_person_discovery", runId: secondPayload.people.runId, expectedResultDigest: secondPayload.history.runs[0].resultDigest, decision: "create_new", candidateId: secondPayload.people.items[0].candidateId, existingContactId: null, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: "shape-decision" }, { kind: "conflict", reason: "write_conflict" }],
      ["record_verification_intent", { action: "record_verification_intent", relevanceId, intent: "initial_verification", channel: "email", sourceObservationId: null, expectedProspectRevision: fixture.prospectRevision, expectedContactRevision: contactRevision, idempotencyKey: "shape-intent" }, { kind: "blocked", reason: "port_unavailable" }],
    ];
    const baseline = await protectedCounts(fixture);
    for (const [, body, result] of scenarios) {
      let calls = 0;
      const fake = {
        start: async () => { calls += 1; return result; },
        decide: async () => { calls += 1; return result; },
        recordVerificationIntent: async () => { calls += 1; return result; },
      };
      const response = await handler.handlePersonDiscoveryPost(mutation(body, await csrf(handler, deps(fixture, fake))), deps(fixture, fake));
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { command: { kind: "blocked", reason: "invalid_service_result" } });
      assert.equal(calls, 1);
      assert.deepEqual(await protectedCounts(fixture), baseline);
    }
    for (const malformed of [
      { kind: "accepted", replayed: false, run: {} },
      { kind: "accepted", replayed: false, decision: { id: "x", runId: "y", decisionDigest: "a".repeat(64), decision: "create_new", candidateId: null, contactId: null, relevanceId: null } },
      { kind: "accepted", replayed: false, intent: { id: "x", intentDigest: "a".repeat(64), intent: "initial_verification", channel: "email", freshnessWindowMs: 1, freshnessPolicyDigest: "b".repeat(64), sourceObservationId: null }, providerCallAuthorized: true, contactEvidenceCreated: false },
    ]) {
      let calls = 0;
      const fake = { start: async () => { calls += 1; return malformed; }, decide: async () => { calls += 1; return malformed; }, recordVerificationIntent: async () => { calls += 1; return malformed; } };
      const response = await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, `shape-malformed-${calls}`), await csrf(handler, deps(fixture, fake))), deps(fixture, fake));
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { command: { kind: "blocked", reason: "invalid_service_result" } });
      assert.equal(calls, 1);
      assert.deepEqual(await protectedCounts(fixture), baseline);
    }
    const wrongActionAccepted = [
      [scenarios[0][1], { kind: "accepted", replayed: false, decision: { id: "wrong", runId: "wrong", decisionDigest: "a".repeat(64), decision: "no_match", candidateId: null, contactId: null, relevanceId: null } }],
      [scenarios[1][1], { kind: "accepted", replayed: false, intent: { id: "wrong", intentDigest: "a".repeat(64), intent: "initial_verification", channel: "email", freshnessWindowMs: 1, freshnessPolicyDigest: "b".repeat(64), sourceObservationId: null }, providerCallAuthorized: false, contactEvidenceCreated: false }],
      [scenarios[2][1], { kind: "accepted", replayed: false, run: { id: "wrong", requestDigest: "a".repeat(64), operationKey: "wrong", status: "completed", resultDigest: "b".repeat(64), requestedDeadlineAt: 1, candidates: [] }, providerCallAuthorized: false, contactEvidenceCreated: false }],
    ];
    for (const [body, result] of wrongActionAccepted) {
      let calls = 0;
      const fake = { start: async () => { calls += 1; return result; }, decide: async () => { calls += 1; return result; }, recordVerificationIntent: async () => { calls += 1; return result; } };
      const response = await handler.handlePersonDiscoveryPost(mutation(body, await csrf(handler, deps(fixture, fake))), deps(fixture, fake));
      assert.deepEqual(await response.json(), { command: { kind: "blocked", reason: "invalid_service_result" } });
      assert.equal(calls, 1);
      assert.deepEqual(await protectedCounts(fixture), baseline);
    }
    const actionMatchedMalformed = [
      [scenarios[0][1], { kind: "accepted", replayed: false, run: { id: "bad", requestDigest: "a".repeat(64), operationKey: `pd_${"b".repeat(64)}`, status: "requested", resultDigest: null, reason: null, requestedDeadlineAt: 1, candidates: [] } }],
      [scenarios[0][1], { kind: "accepted", replayed: false, run: { id: "bad", requestDigest: "a".repeat(64), operationKey: `pd_${"b".repeat(64)}`, status: "completed", resultDigest: "c".repeat(64), reason: null, requestedDeadlineAt: 1, candidates: [{}] } }],
      [scenarios[0][1], { kind: "accepted", replayed: false, run: redactedRun("redacted:unrelated-candidate") }],
      [scenarios[0][1], { kind: "accepted", replayed: false, run: redactedRun(`redacted:${"x".repeat(201)}`) }],
      [scenarios[1][1], { kind: "accepted", replayed: false, decision: { id: "bad", runId: "run", decisionDigest: "a".repeat(64), decision: "link_existing", candidateId: "candidate", contactId: null, relevanceId: "relevance" } }],
      [scenarios[2][1], { kind: "accepted", replayed: false, intent: { id: "bad", intentDigest: "a".repeat(64), intent: "stale_refresh", channel: "email", freshnessWindowMs: 1, freshnessPolicyDigest: "b".repeat(64), sourceObservationId: null }, providerCallAuthorized: false, contactEvidenceCreated: false }],
    ];
    for (const [body, result] of actionMatchedMalformed) {
      let calls = 0;
      const fake = { start: async () => { calls += 1; return result; }, decide: async () => { calls += 1; return result; }, recordVerificationIntent: async () => { calls += 1; return result; } };
      const response = await handler.handlePersonDiscoveryPost(mutation(body, await csrf(handler, deps(fixture, fake))), deps(fixture, fake));
      assert.deepEqual(await response.json(), { command: { kind: "blocked", reason: "invalid_service_result" } });
      assert.equal(calls, 1);
      assert.deepEqual(await protectedCounts(fixture), baseline);
    }
  } finally { await fixture.dispose(); }
});

test("C2 handler keeps durable decision and verification-intent replays exact across all authority drift", async () => {
  for (const dimension of ["company", "product", "play", "profile", "prospect", "configuration"]) {
    const fixture = await createPersonDiscoveryFixture(`person-discovery-handler-replay-${dimension}`);
    try {
      const setup = await acceptedDecisionAndIntent(fixture, `drift-${dimension}`);
      const before = await protectedCounts(fixture);
      await applyAuthorityDrift(fixture, dimension);
      assert.equal((await setup.handler.handlePersonDiscoveryPost(mutation(setup.decision, await csrf(setup.handler, setup.dependencies)), setup.dependencies)).status, 200);
      assert.equal((await setup.handler.handlePersonDiscoveryPost(mutation(setup.intent, await csrf(setup.handler, setup.dependencies)), setup.dependencies)).status, 200);
      assert.equal((await setup.handler.handlePersonDiscoveryPost(mutation({ ...setup.decision, candidateId: "different-candidate" }, await csrf(setup.handler, setup.dependencies)), setup.dependencies)).status, 409);
      assert.equal((await setup.handler.handlePersonDiscoveryPost(mutation({ ...setup.intent, channel: "phone" }, await csrf(setup.handler, setup.dependencies)), setup.dependencies)).status, 409);
      assert.equal(setup.calls.value, 1);
      assert.deepEqual(await protectedCounts(fixture), before, `${dimension} replay/conflict stays zero-write`);
    } finally { await fixture.dispose(); }
  }
});

test("C2 handler concurrency, legacy ownership, CSRF replay, expiry, redaction, and stale projection all fail closed", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-concurrent-retention");
  try {
    await alignOwner(fixture);
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    let calls = 0;
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => { calls += 1; return completed("parallel", 6); }), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("parallel") });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    const start = startBody(fixture, "parallel-start", { maxCandidates: 6 });
    const starts = await Promise.all([handler.handlePersonDiscoveryPost(mutation(start, await csrf(handler, dependencies)), dependencies), handler.handlePersonDiscoveryPost(mutation(start, await csrf(handler, dependencies)), dependencies)]);
    assert.deepEqual(starts.map((response) => response.status).sort(), [200, 200]);
    assert.equal(calls, 1, "one concurrent start reaches the fake port");
    assert.equal(await count(fixture, "person_discovery_runs"), 1);
    const first = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
    const payload = await first.json();
    const decision = { action: "decide_person_discovery", runId: payload.people.runId, expectedResultDigest: payload.history.runs[0].resultDigest, decision: "create_new", candidateId: payload.people.items[0].candidateId, existingContactId: null, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: "parallel-decision" };
    const decisions = await Promise.all([handler.handlePersonDiscoveryPost(mutation(decision, await csrf(handler, dependencies)), dependencies), handler.handlePersonDiscoveryPost(mutation(decision, await csrf(handler, dependencies)), dependencies)]);
    assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 200]);
    assert.equal(await count(fixture, "person_discovery_owner_decisions"), 1);
    assert.equal(await count(fixture, "contacts"), 1);
    assert.equal(await count(fixture, "prospect_contact_role_relevance"), 1);
    const beforeCsrfReplay = await protectedCounts(fixture);
    const token = await csrf(handler, dependencies);
    const replayedCsrf = await handler.handlePersonDiscoveryPost(mutation(start, token), dependencies);
    assert.equal(replayedCsrf.status, 200);
    const csrfReplay = await handler.handlePersonDiscoveryPost(mutation(start, token), dependencies);
    assert.equal(csrfReplay.status, 403);
    assert.deepEqual(await protectedCounts(fixture), beforeCsrfReplay, "CSRF replay creates no second durable command");
    const outsider = await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "outsider-post"), await csrf(handler, dependencies)), { ...dependencies, getIdentity: async () => ({ email: "outsider@example.invalid", displayName: "Outsider" }) });
    assert.equal(outsider.status, 404);
    await fixture.database.prepare("UPDATE profile_prospects SET revision=revision+1 WHERE id=? AND workspace_id=?").bind(fixture.prospectId, fixture.workspaceId).run();
    const stale = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), { ...dependencies, now: () => PERSON_DISCOVERY_NOW + 100 });
    assert.equal((await stale.json()).people.status, "stale_authority", "a stale authority is never projected as active discovery authority");
  } finally { await fixture.dispose(); }
});

test("C2 expiry rejects fresh undecided create and link commands atomically at and after retention", async () => {
  for (const [decisionKind, offset] of [["create_new", 0], ["link_existing", 0], ["create_new", 1], ["link_existing", 1]]) {
    const fixture = await createPersonDiscoveryFixture(`person-discovery-handler-expiry-${decisionKind}-${offset}`);
    try {
      await alignOwner(fixture);
      const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
      const issuedAt = PERSON_DISCOVERY_NOW + 100;
      const setup = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completed(`expiry-${decisionKind.replace("_", "-")}-${offset}`, 1)), now: () => issuedAt, idFactory: ids(`expiry-setup-${decisionKind}-${offset}`) });
      const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
      const setupDependencies = deps(fixture, setup);
      assert.equal((await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, `expiry-start-${decisionKind}-${offset}`, { maxCandidates: 1 }), await csrf(handler, setupDependencies)), setupDependencies)).status, 200);
      const projection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setupDependencies);
      const payload = await projection.json();
      const candidateId = payload.people.items[0].candidateId;
      const expiry = Number((await fixture.database.prepare("SELECT payload_expires_at FROM person_discovery_candidates WHERE id=?").bind(candidateId).first()).payload_expires_at);
      let existingContactId = null;
      if (decisionKind === "link_existing") {
        const company = await fixture.database.prepare("SELECT company_id FROM workspace_companies WHERE workspace_id=?").bind(fixture.workspaceId).first();
        existingContactId = `expiry-existing-${offset}`;
        await fixture.database.prepare("INSERT INTO contacts (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name) VALUES (?,?,?, ?,1,?,?,'Existing')").bind(existingContactId, fixture.workspaceId, issuedAt, issuedAt, company.company_id, "f".repeat(64)).run();
      }
      const calls = { value: 0 };
      const expiryService = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => { calls.value += 1; throw new Error("expired candidate must not invoke a port"); }), now: () => expiry + offset, idFactory: ids(`expiry-${decisionKind}-${offset}`) });
      const dependencies = { ...setupDependencies, personDiscoveryService: expiryService, now: () => expiry + offset };
      const before = await protectedCounts(fixture);
      const command = { action: "decide_person_discovery", runId: payload.people.runId, expectedResultDigest: payload.history.runs[0].resultDigest, decision: decisionKind, candidateId, existingContactId, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: `expiry-decision-${decisionKind}-${offset}` };
      const response = await handler.handlePersonDiscoveryPost(mutation(command, await csrf(handler, dependencies)), dependencies);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { command: { kind: "blocked", reason: "candidate_unavailable" } });
      assert.equal(calls.value, 0);
      assert.deepEqual(await protectedCounts(fixture), before);
    } finally { await fixture.dispose(); }
  }
});

test("C2 redaction alone invalidates a freshly minted people cursor and preserves known-person lineage", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-redaction-cursor");
  try {
    const setup = await acceptedDecisionAndIntent(fixture, "redaction-cursor", 6);
    const minted = await setup.handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setup.dependencies);
    const mintedPayload = await minted.json();
    const cursor = mintedPayload.people.pageInfo.nextCursor;
    assert.ok(cursor);
    const cursorUrl = `https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}&peopleCursor=${encodeURIComponent(cursor)}`;
    assert.equal((await setup.handler.handlePersonDiscoveryGet(new Request(cursorUrl), setup.dependencies)).status, 200, "fresh cursor works before redaction");
    const expiry = Number((await fixture.database.prepare("SELECT min(payload_expires_at) expiry FROM person_discovery_candidates WHERE run_id=?").bind(mintedPayload.people.runId).first()).expiry);
    const redactor = (await loadPersonDiscoveryModules(fixture)).discovery.createPersonDiscoveryService({ database: fixture.database, now: () => expiry, idFactory: ids("redaction-cursor") });
    const ownerScope = { workspaceId: fixture.workspaceId, principalSubject: (await fixture.database.prepare("SELECT owner_subject FROM workspaces WHERE id=?").bind(fixture.workspaceId).first()).owner_subject };
    assert.ok((await redactor.redactExpiredPayloads(ownerScope)).redacted >= 1);
    assert.equal((await setup.handler.handlePersonDiscoveryGet(new Request(cursorUrl), setup.dependencies)).status, 409, "only the physical redaction advances the cursor generation");
    const neutral = await setup.handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), { ...setup.dependencies, now: () => expiry });
    const neutralPayload = await neutral.json();
    assert.equal(neutralPayload.people.items[0].state, "payload_unavailable");
    assert.equal(neutralPayload.approvedProspects[0].knownPerson, true);
  } finally { await fixture.dispose(); }
});

test("C2 admits the established legacy owner subject without widening outsider admission", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-legacy-owner");
  try {
    const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
    const principal = await interview.principalFromIdentity("owner@example.invalid", PERSON_DISCOVERY_OWNER.displayName, "0123456789abcdef0123456789abcdef");
    assert.ok(principal.legacySubject);
    await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.legacySubject, fixture.workspaceId).run();
    const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => completed("legacy", 1)), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("legacy") });
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
    const dependencies = deps(fixture, service);
    const get = await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), dependencies);
    assert.equal(get.status, 200);
    const post = await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, "legacy-owner-start", { maxCandidates: 1 }), csrfCookie(get)), dependencies);
    assert.equal(post.status, 200);
    const outsider = await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), { ...dependencies, getIdentity: async () => ({ email: "outsider@example.invalid", displayName: "Outsider" }) });
    assert.equal(outsider.status, 404);
  } finally { await fixture.dispose(); }
});

test("C3 initial read minimizes scoped history and current-authority drift removes old verification locators", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-handler-c3-minimized-current");
  try {
    const setup = await acceptedDecisionAndIntent(fixture, "c3-minimized-current", 1);
    const persisted = await fixture.database.prepare("SELECT run.id run_id,decision.id decision_id,relevance.id relevance_id,relevance.contact_id,intent.id intent_id,intent.source_observation_id FROM prospect_contact_role_relevance relevance JOIN person_discovery_owner_decisions decision ON decision.id=relevance.decision_id JOIN person_discovery_runs run ON run.id=decision.run_id JOIN contact_verification_intents intent ON intent.relevance_id=relevance.id WHERE relevance.workspace_id=?").bind(fixture.workspaceId).first();
    assert.ok(persisted.relevance_id);
    const initial = await setup.handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), setup.dependencies);
    const initialPayload = await initial.json();
    assert.deepEqual(initialPayload.linkableContacts, []);
    assert.deepEqual(initialPayload.history, { runs: [], decisions: [], relevance: [], verificationIntents: [], staleTrustedObservations: [] });
    const initialText = JSON.stringify(initialPayload);
    for (const identifier of [persisted.run_id, persisted.decision_id, persisted.relevance_id, persisted.contact_id, persisted.intent_id]) assert.equal(initialText.includes(identifier), false, `initial selector response excludes unrelated ${identifier}`);
    assert.equal(persisted.source_observation_id, null, "the synthetic initial intent has no source observation identifier to project");
    assert.match(initialPayload.approvedProspects[0].label, /^Approved prospect · [A-Za-z0-9_-]{12} · reviewed \d{4}-\d{2}-\d{2}$/, "bounded labels contain an opaque discriminator");
    assert.equal(initialPayload.approvedProspects[0].label.includes(fixture.prospectId), false, "the selector label does not expose the internal Prospect ID");

    const current = await setup.handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setup.dependencies);
    const currentPayload = await current.json();
    assert.equal(currentPayload.approvedProspects[0].knownPerson, true);
    assert.deepEqual(Object.keys(currentPayload.history.relevance[0]).sort(), ["contactId", "contactLabel", "contactRevision", "current", "decisionId", "prospectId", "relevanceId", "roleTitle", "verificationChannels"].sort());
    assert.equal(currentPayload.history.relevance[0].current, true);
    assert.deepEqual(currentPayload.history.relevance[0].verificationChannels, ["email", "phone"]);
    assert.deepEqual(currentPayload.history.verificationIntents[0], { intentId: currentPayload.history.verificationIntents[0].intentId, relevanceId: persisted.relevance_id, intent: "initial_verification", channel: "email", sourceObservationId: null, effect: "intent_only" });

    const newerRunId = "c3-current-no-match-run";
    const newerResultDigest = "3".repeat(64);
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO person_discovery_runs (id,workspace_id,owner_subject,prospect_id,profile_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,workspace_revision,max_candidates,max_provenance_per_candidate,idempotency_key,operation_key,request_digest,requested_deadline_at,created_at) SELECT ?,workspace_id,owner_subject,prospect_id,profile_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,workspace_revision,1,max_provenance_per_candidate,?,?,?,?,? FROM person_discovery_runs WHERE id=? AND workspace_id=?").bind(newerRunId, "c3-current-no-match-start", `pd_${"1".repeat(64)}`, "1".repeat(64), PERSON_DISCOVERY_NOW + 30_200, PERSON_DISCOVERY_NOW + 200, currentPayload.people.runId, fixture.workspaceId),
      fixture.database.prepare("INSERT INTO person_discovery_run_events (id,workspace_id,run_id,durable_revision,state,candidate_count,result_digest,reason,created_at) VALUES (?, ?, ?, 1, 'requested', 0, NULL, NULL, ?)").bind("c3-current-no-match-requested", fixture.workspaceId, newerRunId, PERSON_DISCOVERY_NOW + 200),
      fixture.database.prepare("INSERT INTO person_discovery_run_events (id,workspace_id,run_id,durable_revision,state,candidate_count,result_digest,reason,created_at) VALUES (?, ?, ?, 2, 'completed', 0, ?, NULL, ?)").bind("c3-current-no-match-completed", fixture.workspaceId, newerRunId, newerResultDigest, PERSON_DISCOVERY_NOW + 201),
    ]);
    const secondRun = await setup.handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setup.dependencies);
    const secondPayload = await secondRun.json();
    const noMatch = { action: "decide_person_discovery", runId: secondPayload.people.runId, expectedResultDigest: secondPayload.people.resultDigest, decision: "no_match", candidateId: null, existingContactId: null, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: "c3-current-no-match-decision" };
    const noMatchResponse = await setup.handler.handlePersonDiscoveryPost(mutation(noMatch, await csrf(setup.handler, setup.dependencies)), setup.dependencies);
    assert.equal(noMatchResponse.status, 200, JSON.stringify(await noMatchResponse.clone().json()));
    const noMatchProjection = await setup.handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setup.dependencies);
    const noMatchPayload = await noMatchProjection.json();
    assert.equal(noMatchPayload.approvedProspects[0].knownPerson, false, "an older linked person is not advertised after the latest current run records no-match");
    assert.equal(noMatchPayload.history.decisions.length, 1);
    assert.equal(noMatchPayload.history.decisions[0].decision, "no_match");
    assert.deepEqual(noMatchPayload.history.relevance, [], "an older current-lineage relevance is not projected after the latest run records no-match");
    assert.deepEqual(noMatchPayload.history.verificationIntents, []);
    assert.deepEqual(noMatchPayload.history.staleTrustedObservations, []);

    const company = await fixture.database.prepare("SELECT company_id FROM workspace_companies WHERE workspace_id=? LIMIT 1").bind(fixture.workspaceId).first();
    await fixture.database.prepare("UPDATE companies SET status='paused' WHERE id=? AND workspace_id=?").bind(company.company_id, fixture.workspaceId).run();
    const drifted = await setup.handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), setup.dependencies);
    const driftedPayload = await drifted.json();
    assert.deepEqual(driftedPayload.history, { runs: [], decisions: [], relevance: [], verificationIntents: [], staleTrustedObservations: [] });
    assert.deepEqual(driftedPayload.linkableContacts, []);
    assert.equal(JSON.stringify(driftedPayload).includes(persisted.relevance_id), false, "old relevance never crosses the client boundary after ancestor drift");
    assert.equal(JSON.stringify(driftedPayload).includes(persisted.intent_id), false);
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
async function csrf(handler, dependencies) { return csrfCookie(await handler.handlePersonDiscoveryGet(new Request("https://prospector.invalid/api/contacts/person-discovery"), dependencies)); }
function startBody(fixture, idempotencyKey, overrides = {}) { return { action: "start_person_discovery", prospectId: fixture.prospectId, expectedProspectRevision: fixture.prospectRevision, maxCandidates: 2, maxProvenancePerCandidate: 1, idempotencyKey, ...overrides }; }
async function governedCounts(fixture) { return Object.freeze({ contacts: await count(fixture, "contacts"), relevance: await count(fixture, "prospect_contact_role_relevance"), intents: await count(fixture, "contact_verification_intents"), evidence: await count(fixture, "contact_point_observations"), effects: await count(fixture, "contact_eligibility_snapshots") }); }
async function protectedCounts(fixture) { return Object.freeze({ runs: await count(fixture, "person_discovery_runs"), decisions: await count(fixture, "person_discovery_owner_decisions"), contacts: await count(fixture, "contacts"), relevance: await count(fixture, "prospect_contact_role_relevance"), intents: await count(fixture, "contact_verification_intents"), commands: await count(fixture, "authority_commands"), audits: await count(fixture, "audit_events"), effects: await count(fixture, "contact_eligibility_snapshots") }); }
async function alignOwner(fixture) {
  const interview = await fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname);
  const principal = await interview.principalFromIdentity("owner@example.invalid", PERSON_DISCOVERY_OWNER.displayName, "0123456789abcdef0123456789abcdef");
  await fixture.database.prepare("UPDATE workspaces SET owner_subject=? WHERE id=?").bind(principal.subject, fixture.workspaceId).run();
}
async function acceptedDecisionAndIntent(fixture, prefix, maxCandidates = 1) {
  await alignOwner(fixture);
  const { discovery, testPort } = await loadPersonDiscoveryModules(fixture);
  const calls = { value: 0 };
  const service = discovery.createPersonDiscoveryService({ database: fixture.database, port: testPort.bindPersonDiscoveryTestPort(async () => { calls.value += 1; return completed(prefix, maxCandidates); }), now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids(prefix) });
  const handler = await fixture.vite.ssrLoadModule(new URL("../domain/person-discovery-handler.ts", import.meta.url).pathname);
  const dependencies = deps(fixture, service);
  assert.equal((await handler.handlePersonDiscoveryPost(mutation(startBody(fixture, `${prefix}-start`, { maxCandidates }), await csrf(handler, dependencies)), dependencies)).status, 200);
  const projection = await handler.handlePersonDiscoveryGet(new Request(`https://prospector.invalid/api/contacts/person-discovery?prospectId=${fixture.prospectId}`), dependencies);
  const payload = await projection.json();
  const decision = { action: "decide_person_discovery", runId: payload.people.runId, expectedResultDigest: payload.history.runs[0].resultDigest, decision: "create_new", candidateId: payload.people.items[0].candidateId, existingContactId: null, expectedProspectRevision: fixture.prospectRevision, idempotencyKey: `${prefix}-decision` };
  assert.equal((await handler.handlePersonDiscoveryPost(mutation(decision, await csrf(handler, dependencies)), dependencies)).status, 200);
  const relevanceId = (await fixture.database.prepare("SELECT id FROM prospect_contact_role_relevance WHERE workspace_id=?").bind(fixture.workspaceId).first()).id;
  const contactRevision = Number((await fixture.database.prepare("SELECT revision FROM contacts WHERE workspace_id=?").bind(fixture.workspaceId).first()).revision);
  const intent = { action: "record_verification_intent", relevanceId, intent: "initial_verification", channel: "email", sourceObservationId: null, expectedProspectRevision: fixture.prospectRevision, expectedContactRevision: contactRevision, idempotencyKey: `${prefix}-intent` };
  assert.equal((await handler.handlePersonDiscoveryPost(mutation(intent, await csrf(handler, dependencies)), dependencies)).status, 200);
  return { handler, dependencies, decision, intent, calls };
}
async function applyAuthorityDrift(fixture, dimension) {
  if (dimension === "company") {
    const row = await fixture.database.prepare("SELECT company_id FROM workspace_companies WHERE workspace_id=?").bind(fixture.workspaceId).first();
    return fixture.database.prepare("UPDATE companies SET status='paused' WHERE id=? AND workspace_id=?").bind(row.company_id, fixture.workspaceId).run();
  }
  if (dimension === "product") {
    const row = await fixture.database.prepare("SELECT play.product_id FROM customer_profiles profile JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id WHERE profile.id=? AND profile.workspace_id=?").bind(fixture.profileId, fixture.workspaceId).first();
    return fixture.database.prepare("UPDATE products SET lifecycle='paused' WHERE id=? AND workspace_id=?").bind(row.product_id, fixture.workspaceId).run();
  }
  if (dimension === "play") {
    const row = await fixture.database.prepare("SELECT play_id FROM customer_profiles WHERE id=? AND workspace_id=?").bind(fixture.profileId, fixture.workspaceId).first();
    return fixture.database.prepare("UPDATE market_plays SET lifecycle='paused' WHERE id=? AND workspace_id=?").bind(row.play_id, fixture.workspaceId).run();
  }
  if (dimension === "profile") return fixture.database.prepare("UPDATE customer_profiles SET lifecycle='paused' WHERE id=? AND workspace_id=?").bind(fixture.profileId, fixture.workspaceId).run();
  if (dimension === "prospect") return fixture.database.prepare("UPDATE profile_prospects SET revision=revision+1 WHERE id=? AND workspace_id=?").bind(fixture.prospectId, fixture.workspaceId).run();
  return fixture.database.prepare("UPDATE typed_configurations SET active=0 WHERE id=? AND workspace_id=?").bind(fixture.configurationId, fixture.workspaceId).run();
}
function mutation(body, cookie) { return new Request("https://prospector.invalid/api/contacts/person-discovery", { method: "POST", headers: { origin: "https://prospector.invalid", "sec-fetch-site": "same-origin", "x-prospector-intent": "person-discovery-mutation", "content-type": "application/json", cookie }, body: JSON.stringify(body) }); }
function csrfCookie(response) { const raw = response.headers.get("set-cookie"); const match = raw?.match(/prospector-local-csrf=([^;]+)/); assert.ok(match); return `prospector-local-csrf=${match[1]}`; }
function completed(key, count = 1) { return { kind: "completed", candidates: Array.from({ length: count }, (_, index) => ({ displayName: `Synthetic ${key} ${index}`, roleTitle: "Operations", roleSummary: "Synthetic role summary", provenance: [{ sourceReference: `https://example.invalid/team/${index}`, excerpt: "Synthetic public role listing", retrievedAt: PERSON_DISCOVERY_NOW }] })) }; }
function redactedRun(candidateKey) {
  const requestDigest = "a".repeat(64);
  return {
    id: "redacted-run", requestDigest, operationKey: `pd_${requestDigest}`, status: "completed", resultDigest: "b".repeat(64), reason: null, requestedDeadlineAt: 1,
    candidates: [{ id: "redacted-candidate", ordinal: 0, candidateKey, displayName: "[redacted]", roleTitle: "[redacted]", roleSummary: "[redacted]", candidateDigest: "c".repeat(64), payloadExpiresAt: 1, redactedAt: 1,
      provenance: [{ id: "redacted-provenance", ordinal: 0, sourceReference: "[redacted]", excerpt: "[redacted]", sourceDigest: "d".repeat(64), excerptDigest: "e".repeat(64), retrievedAt: 1, provenanceDigest: "f".repeat(64), payloadExpiresAt: 1, redactedAt: 1 }],
    }],
  };
}
function ids(prefix) { let count = 0; return () => `${prefix}-${++count}`; }
async function count(fixture, table) { return Number((await fixture.database.prepare(`SELECT count(*) count FROM ${table}`).first()).count); }
