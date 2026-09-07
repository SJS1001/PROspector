import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createD1Fixture } from "./helpers/d1.mjs";

const SCOPE = Object.freeze({ workspaceId: "workspace-one", principalSubject: "owner-one", secret: "pagination-test-secret-at-least-32-bytes", capabilityEpoch: "e".repeat(64) });
const NOW = 1_900_000_000_000;

test("Contacts cursors are exact, feed-specific, scope-bound, rotated-secret-safe, and high-water stable", async () => {
  const fixture = await createD1Fixture("contacts-pagination-cursors");
  try {
    const pagination = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-pagination.ts", import.meta.url).pathname);
    const first = await pagination.parseContactsPagination(new Request("https://prospector.test/api/contacts"), SCOPE, NOW);
    assert.deepEqual(first.contacts, { highWater: null, after: null, generation: null, authorityDigest: null });
    const rows = Array.from({ length: 21 }, (_, index) => ({ time: NOW - 1 - index, id: `contact-page-${String(index).padStart(2, "0")}` }));
    const highWater = rows[0];
    const info = await pagination.pageInfo("contacts", SCOPE, { highWater, after: null, generation: 7, authorityDigest: null }, 200, rows);
    assert.deepEqual({ schema: info.schema, limit: info.limit, total: info.total, returned: info.returned, hasNext: info.hasNext }, { schema: "contacts-page-info/v1", limit: 20, total: 200, returned: 20, hasNext: true });
    assert.ok(info.nextCursor && info.nextCursor.length <= 768);
    const second = await pagination.parseContactsPagination(new Request(`https://prospector.test/api/contacts?contactsCursor=${encodeURIComponent(info.nextCursor)}`), SCOPE, NOW + 100_000);
    assert.deepEqual(second.contacts.highWater, highWater);
    assert.deepEqual(second.contacts.after, rows[19]);
    assert.equal(second.contacts.generation, 7);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-handler.ts", import.meta.url).pathname);
    const observation = { kind: "email", verificationClass: "mailbox_verified", method: "mailbox_verification", verifiedAt: NOW - 100 };
    assert.equal(handler.toPublicContactObservation(observation, NOW).freshness, "current");
    assert.equal(handler.toPublicContactObservation(observation, NOW + 30 * 24 * 60 * 60 * 1000).freshness, "stale", "an unchanged old cursor cannot preserve freshness as request time advances");
    assert.deepEqual(second.contacts.highWater, highWater, "authority traversal remains fixed while freshness advances independently");
    assert.equal(handler.validateReferencedObservationIds(Array.from({ length: 2_000 }, (_, index) => `observation-${index}`)).length, 2_000);
    assert.throws(() => handler.validateReferencedObservationIds(Array.from({ length: 2_001 }, (_, index) => `observation-${index}`)), /contact_page_observation_bound_exceeded/);
    await assert.rejects(() => pagination.parseContactsPagination(new Request(`https://prospector.test/api/contacts?contactsCursor=${info.nextCursor}`), SCOPE, highWater.time - 1), /invalid_contacts_cursor/);
    for (const url of ["https://prospector.test/api/contacts?unknown=x", `https://prospector.test/api/contacts?contactsCursor=${info.nextCursor}&contactsCursor=${info.nextCursor}`, "https://prospector.test/api/contacts?contactsCursor=malformed", `https://prospector.test/api/contacts?identityCursor=${info.nextCursor}`]) await assert.rejects(() => pagination.parseContactsPagination(new Request(url), SCOPE), /invalid_contacts_cursor/);
    for (const changedScope of [{ ...SCOPE, workspaceId: "workspace-two" }, { ...SCOPE, principalSubject: "owner-two" }, { ...SCOPE, secret: "rotated-pagination-secret-at-least-32-bytes" }]) await assert.rejects(() => pagination.parseContactsPagination(new Request(`https://prospector.test/api/contacts?contactsCursor=${info.nextCursor}`), changedScope), /invalid_contacts_cursor/);
    await assert.rejects(() => pagination.parseContactsPagination(new Request(`https://prospector.test/api/contacts?contactsCursor=${info.nextCursor}`), { ...SCOPE, capabilityEpoch: "f".repeat(64) }, NOW + 100_000), /contacts_page_drifted/);
    const [encoded, signature] = info.nextCursor.split("."); const tampered = `${encoded.slice(0, -1)}${encoded.endsWith("A") ? "B" : "A"}.${signature}`;
    await assert.rejects(() => pagination.parseContactsPagination(new Request(`https://prospector.test/api/contacts?contactsCursor=${tampered}`), SCOPE), /invalid_contacts_cursor/);
  } finally { await fixture.dispose(); }
});

test("Contacts page metadata enforces exact 0/20/21/large invariants and sentinel validity", async () => {
  const fixture = await createD1Fixture("contacts-pagination-metadata");
  try {
    const pagination = await fixture.vite.ssrLoadModule(new URL("../domain/contacts-pagination.ts", import.meta.url).pathname);
    const rows = Array.from({ length: 21 }, (_, index) => ({ time: NOW - index, id: `identity-${String(index).padStart(2, "0")}` })); const cursor = { highWater: rows[0], after: null, generation: 0, authorityDigest: null };
    assert.deepEqual(await pagination.pageInfo("identity", SCOPE, cursor, 0, []), { schema: "contacts-page-info/v1", limit: 20, total: 0, returned: 0, hasNext: false, nextCursor: null });
    assert.equal((await pagination.pageInfo("identity", SCOPE, cursor, 20, rows.slice(0, 20))).hasNext, false);
    assert.equal((await pagination.pageInfo("identity", SCOPE, cursor, 21, rows)).hasNext, true);
    assert.equal((await pagination.pageInfo("identity", SCOPE, cursor, 100_000, rows)).total, 100_000);
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, cursor, 20, rows), /invalid_contacts_cursor/);
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, cursor, 19, rows.slice(0, 20)), /invalid_contacts_cursor/);
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, cursor, 21, [...rows.slice(0, 20), { time: -1, id: "bad-sentinel" }]), /invalid_contacts_cursor/);
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, { highWater: null, after: null, generation: 0, authorityDigest: null }, 21, rows), /invalid_contacts_cursor/);
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, cursor, 21, [rows[1], rows[0], ...rows.slice(2)]), /invalid_contacts_cursor/, "unordered rows are rejected");
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, cursor, 21, [rows[0], rows[0], ...rows.slice(2)]), /invalid_contacts_cursor/, "duplicate rows are rejected");
    const continuation = { ...cursor, after: rows[5] };
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, continuation, 21, rows.slice(5)), /invalid_contacts_cursor/, "a row equal to after is rejected");
    await assert.rejects(() => pagination.pageInfo("identity", SCOPE, continuation, 21, rows.slice(4)), /invalid_contacts_cursor/, "a row newer than after is rejected");
  } finally { await fixture.dispose(); }
});

test("client page navigation keeps feed cursors independent and disables all controls while loading", async () => {
  const fixture = await createD1Fixture("contacts-pagination-client");
  try {
    const workspace = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contacts-workspace.tsx", import.meta.url).pathname);
    const initial = { contacts: { current: null, previous: [] }, identity: { current: null, previous: [] }, approved: { current: null, previous: [] } };
    const contacts = workspace.moveContactsPage(initial, "contacts", "next", "a".repeat(30) + "." + "b".repeat(30)); assert.ok(contacts); assert.equal(contacts.identity.current, null);
    const identity = workspace.moveContactsPage(contacts, "identity", "next", "c".repeat(30) + "." + "d".repeat(30)); const url = workspace.contactsPageUrl(identity);
    assert.match(url, /contactsCursor=/); assert.match(url, /identityCursor=/); assert.doesNotMatch(url, /approvedCursor=/);
    const back = workspace.moveContactsPage(identity, "contacts", "previous", null); assert.equal(back.contacts.current, null); assert.equal(back.identity.current, identity.identity.current); assert.equal(workspace.moveContactsPage(back, "contacts", "previous", null), null);
    const html = renderToStaticMarkup(React.createElement(workspace.ContactsPageControls, { label: "Contacts", info: { schema: "contacts-page-info/v1", limit: 20, total: 21, returned: 20, hasNext: true, nextCursor: "a".repeat(30) + "." + "b".repeat(30) }, canGoBack: true, loading: true, onPrevious() {}, onNext() {} }));
    assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
    let release; const delayed = new Promise((resolve) => { release = resolve; }); let identityState = { identityConfirmed: "merge-one", primarySelections: { "merge-one": "contact-one" } };
    const beginDelayedLoad = async () => { identityState = workspace.resetIdentityForAuthorityRefresh(); await delayed; };
    const loading = beginDelayedLoad(); assert.deepEqual(identityState, { identityConfirmed: null, primarySelections: {} }, "identity authority is cleared synchronously before a delayed page response"); release(); await loading;
    const ready = { active: true, authorityReady: true, pending: false, pageLoading: false, confirmed: true, merge: true, candidateCount: 2, selectedPrimaryValid: true };
    assert.equal(workspace.canRequestIdentity(ready), true);
    for (const blocked of [{ authorityReady: false }, { pending: true }, { pageLoading: true }, { active: false }, { confirmed: false }, { merge: false }, { candidateCount: 1 }, { selectedPrimaryValid: false }]) assert.equal(workspace.canRequestIdentity({ ...ready, ...blocked }), false, JSON.stringify(blocked));
    const workspaceSource = await readFile(new URL("../app/prospects/contacts-workspace.tsx", import.meta.url), "utf8");
    assert.ok(workspaceSource.indexOf("setIdentityConfirmed(identityReset.identityConfirmed)") < workspaceSource.indexOf("await fetchContactsProjection(fetch, locations)"), "the component clears identity confirmation before awaiting navigation");
    const navigationGuard = workspace.createIdentityAuthorityGuard(); navigationGuard.finishRefresh(true); let navigationPosts = 0; let releaseNavigation;
    const delayedNavigation = new Promise((resolve) => { releaseNavigation = resolve; });
    const navigate = async () => { navigationGuard.beginRefresh(); await delayedNavigation; navigationGuard.finishRefresh(true); };
    const navigating = navigate(); if (navigationGuard.tryBeginMutation()) navigationPosts += 1;
    assert.equal(navigationPosts, 0, "a queued stale identity action cannot POST after navigation begins"); releaseNavigation(); await navigating;
    const mutationGuard = workspace.createIdentityAuthorityGuard(); mutationGuard.finishRefresh(true); let mutationPosts = 0;
    if (mutationGuard.tryBeginMutation()) mutationPosts += 1;
    if (mutationGuard.tryBeginMutation()) mutationPosts += 1;
    assert.equal(mutationPosts, 1, "row B cannot POST while row A identity mutation is pending");
    assert.match(workspaceSource, /tryBeginMutation\(\)[\s\S]*setIdentityPending\(true\)[\s\S]*postContactsCommandOnce/);
  } finally { await fixture.dispose(); }
});

test("page settlement verification uses two fixed set queries beyond twenty and enforces a per-reservation 101-row sentinel", async () => {
  const fixture = await createD1Fixture("contacts-pagination-settlement-set");
  try {
    const attestation = await fixture.vite.ssrLoadModule(new URL("../domain/contact-settlement-attestor.ts", import.meta.url).pathname); const persistence = await fixture.vite.ssrLoadModule(new URL("../domain/contact-settlement-persistence.ts", import.meta.url).pathname);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("pagination settlement test secret 0001"), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); const attestor = attestation.bindContactSettlementAttestor({ active: { keyId: "pagination-key", key }, verificationOnly: [] });
    const ids = Array.from({ length: 25 }, (_, index) => `reservation-${index}`); let statements = 0;
    const database = { prepare(sql) { statements += 1; return { bind() { return { async all() { if (sql.includes("terminal.observation_ids_json") && !sql.includes("row_number")) return { results: ids.map((id, index) => ({ reservation_id: id, terminal_observation_ids_json: JSON.stringify([`observation-${index}`]) })) }; return { results: [] }; } }; } }; } };
    assert.equal((await persistence.verifyPersistedContactSettlements(database, attestor, "workspace-one", [])).size, 0); assert.equal(statements, 0);
    const verified = await persistence.verifyPersistedContactSettlements(database, attestor, "workspace-one", ids); assert.equal(statements, 2); assert.equal(verified.size, 25); assert.equal([...verified.values()].every((value) => value === false), true);
    let singleSql = ""; const tooMany = Array.from({ length: 101 }, (_, index) => ({ reservation_id: "reservation-one", observation_id: `observation-${index}` }));
    const sentinelDatabase = { prepare(sql) { singleSql = sql; return { bind() { return { async all() { return { results: tooMany }; } }; } }; } };
    assert.equal(await persistence.verifyPersistedContactSettlement(sentinelDatabase, attestor, "workspace-one", "reservation-one"), false); assert.match(singleSql, /LIMIT 101/);
  } finally { await fixture.dispose(); }
});

test("0018 upgrades populated paging tables and each exact ordering avoids a temporary sort", async () => {
  const fixture = await createD1Fixture("contacts-pagination-indexes");
  try {
    for (const statement of [
      "CREATE TABLE workspaces (id TEXT PRIMARY KEY, owner_subject TEXT NOT NULL)",
      "CREATE TABLE contact_eligibility_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, projected_at INTEGER NOT NULL)",
      "CREATE TABLE identity_suggestions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_subject TEXT NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE TABLE profile_prospects (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL, active INTEGER NOT NULL, state TEXT NOT NULL)",
      "CREATE TABLE typed_configurations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE prospecting_candidates (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE qualification_assessments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE contact_point_observations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE contact_evidence_assignments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE contact_verification_receipts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE enrichment_reservations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE enrichment_reservation_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "CREATE TABLE phase_activation_gates (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)",
      "INSERT INTO workspaces VALUES ('workspace-one','owner-one')",
      "INSERT INTO workspaces VALUES ('workspace-two','owner-one')",
      "INSERT INTO contact_eligibility_snapshots VALUES ('snapshot-one','workspace-one',100)",
      "INSERT INTO identity_suggestions VALUES ('suggestion-one','workspace-one','owner-one',100)",
      "INSERT INTO profile_prospects VALUES ('prospect-one','workspace-one',100,1,'approved')",
    ]) await fixture.database.prepare(statement).run();
    const migration = await readFile(new URL("../drizzle/0018_massive_blizzard.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await fixture.database.prepare(statement).run();
    const plans = [
      ["contact_eligibility_snapshot_page_idx", "SELECT id FROM contact_eligibility_snapshots WHERE workspace_id=? ORDER BY projected_at DESC,id DESC LIMIT 21", ["workspace-one"]],
      ["identity_suggestion_owner_page_idx", "SELECT id FROM identity_suggestions WHERE workspace_id=? AND owner_subject=? ORDER BY created_at DESC,id DESC LIMIT 21", ["workspace-one", "owner-one"]],
      ["profile_prospect_approved_page_idx", "SELECT id FROM profile_prospects WHERE workspace_id=? AND active=1 AND state='approved' ORDER BY updated_at DESC,id DESC LIMIT 21", ["workspace-one"]],
    ];
    for (const [indexName, sql, bindings] of plans) {
      const detail = (await fixture.database.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...bindings).all()).results.map((row) => String(row.detail)).join("\n");
      assert.match(detail, new RegExp(indexName)); assert.doesNotMatch(detail, /USE TEMP B-TREE/);
    }
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 0, identity_generation: 0, approved_generation: 0 }, "upgrade backfills an untouched workspace deterministically");
    await fixture.database.prepare("INSERT INTO contact_point_observations VALUES ('observation-two','workspace-one')").run();
    await fixture.database.prepare("UPDATE identity_suggestions SET created_at=101 WHERE id='suggestion-one'").run();
    await fixture.database.prepare("DELETE FROM qualification_assessments WHERE id='missing'").run();
    await fixture.database.prepare("INSERT INTO qualification_assessments VALUES ('assessment-two','workspace-one')").run();
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 1, identity_generation: 1, approved_generation: 1 }, "import-compatible trigger statements bump exact feed generations");
    await fixture.database.prepare("INSERT INTO phase_activation_gates VALUES ('gate-one','workspace-one')").run();
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 2, identity_generation: 2, approved_generation: 2 }, "gate insertion invalidates every feed");
    await fixture.database.prepare("UPDATE phase_activation_gates SET workspace_id='workspace-two' WHERE id='gate-one'").run();
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 3, identity_generation: 3, approved_generation: 3 }, "gate workspace moves invalidate the old workspace");
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-two'").first(), { contacts_generation: 1, identity_generation: 1, approved_generation: 1 }, "gate workspace moves invalidate the new workspace");
    await fixture.database.prepare("DELETE FROM phase_activation_gates WHERE id='gate-one'").run();
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-two'").first(), { contacts_generation: 2, identity_generation: 2, approved_generation: 2 }, "gate deletion invalidates every feed");
    await fixture.database.prepare("UPDATE profile_prospects SET workspace_id='workspace-two' WHERE id='prospect-one'").run();
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 4, identity_generation: 3, approved_generation: 4 }, "profile moves invalidate both affected feeds in the old workspace");
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-two'").first(), { contacts_generation: 3, identity_generation: 2, approved_generation: 3 }, "profile moves invalidate both affected feeds in the new workspace");
    await fixture.database.prepare("INSERT INTO typed_configurations VALUES ('configuration-two','workspace-one')").run();
    await fixture.database.prepare("UPDATE typed_configurations SET workspace_id='workspace-two' WHERE id='configuration-two'").run();
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 6, identity_generation: 3, approved_generation: 6 }, "configuration moves invalidate old workspace projections");
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-two'").first(), { contacts_generation: 4, identity_generation: 2, approved_generation: 4 }, "configuration moves invalidate new workspace projections");
    await fixture.database.prepare("UPDATE contact_point_observations SET workspace_id='workspace-two' WHERE id='observation-two'").run();
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 7, identity_generation: 3, approved_generation: 6 }, "feed-specific source moves invalidate the old Contacts feed only");
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-two'").first(), { contacts_generation: 5, identity_generation: 2, approved_generation: 4 }, "feed-specific source moves invalidate the new Contacts feed only");
    await assert.rejects(() => fixture.database.prepare("UPDATE contacts_projection_generations SET contacts_generation=9007199254740991 WHERE workspace_id='workspace-one'").run(), /CHECK constraint failed/, "Number.MAX_SAFE_INTEGER is outside the exact generation domain");
    await fixture.database.prepare("UPDATE contacts_projection_generations SET contacts_generation=9007199254740990,identity_generation=9007199254740990,approved_generation=9007199254740990 WHERE workspace_id='workspace-one'").run();
    await assert.rejects(() => fixture.database.prepare("INSERT INTO phase_activation_gates VALUES ('gate-overflow','workspace-one')").run(), /contacts projection generation exhausted/, "generation exhaustion aborts deterministically before integer precision is lost");
    assert.deepEqual(await fixture.database.prepare("SELECT contacts_generation,identity_generation,approved_generation FROM contacts_projection_generations WHERE workspace_id='workspace-one'").first(), { contacts_generation: 9007199254740990, identity_generation: 9007199254740990, approved_generation: 9007199254740990 });
    await assert.rejects(() => fixture.database.prepare("UPDATE contacts_projection_generations SET contacts_generation=1.5 WHERE workspace_id='workspace-one'").run(), /CHECK constraint failed/);
    assert.deepEqual((await fixture.database.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally { await fixture.dispose(); }
});
