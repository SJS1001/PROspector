import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import { createD1Fixture } from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";
import { applyOutreachMigrations } from "./helpers/outreach-fixture.mjs";
import {
  addSenderConnection, CLOCK, count, MODULES, OUTREACH_NOW, recordRecipientAuthority,
  seedOutreachWorkspace, syntheticServices, UNSUBSCRIBE_TOKEN,
} from "./helpers/outreach-ui-fixture.mjs";

// Lane G (06-08, local): the owner Outreach command handler, the public
// unsubscribe route and the Outreach workspace. Synthetic data and fake ports
// only. Production composition wires the always-refusing Phase 5 rechecks, the
// phone action stays disabled, and nothing reaches a provider.

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const PEPPER = "outreach-ui-test-pepper-at-least-32-bytes";
const OWNER_EMAIL = "owner@example.invalid";

function ownerDependencies(database, overrides = {}) {
  return {
    database, subjectPepper: PEPPER, pilotOwnerEmail: OWNER_EMAIL,
    getIdentity: async () => ({ email: OWNER_EMAIL, displayName: "Owner" }), ...overrides,
  };
}

function mutation(body, headers = {}) {
  const merged = new Headers({ origin: "https://prospector.test", "sec-fetch-site": "same-origin", "x-prospector-intent": "outreach-mutation", "content-type": "application/json" });
  for (const [name, value] of Object.entries(headers)) { if (value === null) merged.delete(name); else merged.set(name, value); }
  return new Request("https://prospector.test/api/outreach", { method: "POST", headers: merged, body: typeof body === "string" ? body : JSON.stringify(body) });
}

/** A real owner workspace whose owner subject is the HMAC principal, so the HTTP admission path is exercised end to end. */
async function ownerWorkspace(name) {
  const fixture = await createD1Fixture(name);
  try {
    await applyOutreachMigrations(fixture.database);
    const interview = await fixture.vite.ssrLoadModule(MODULES.interview);
    const principal = await interview.principalFromIdentity(OWNER_EMAIL, "Owner", PEPPER);
    const seeded = await seedProfileAuthority(fixture, principal, OUTREACH_NOW);
    const handler = await fixture.vite.ssrLoadModule(MODULES.handler);
    return { fixture, handler, principal, seeded };
  } catch (error) { await fixture.dispose(); throw error; }
}

async function csrfCookie(handler, database) {
  const response = await handler.handleOutreachGet(new Request("https://prospector.test/api/outreach"), ownerDependencies(database));
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

async function seededWorkspace(name, options) {
  const fixture = await createD1Fixture(name);
  try {
    const context = await seedOutreachWorkspace(fixture, options);
    const handler = await fixture.vite.ssrLoadModule(MODULES.handler);
    return { fixture, handler, context };
  } catch (error) { await fixture.dispose(); throw error; }
}

async function outreachRowCounts(fixture) {
  const tables = ["outreach_package_approvals", "outreach_message_approvals", "outreach_outbox_items", "outreach_suppression_tombstones", "outreach_stop_events"];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await count(fixture, table)])));
}

// ---------------------------------------------------------------------------
// Owner transport
// ---------------------------------------------------------------------------

test("Outreach GET admits the owner first, issues a CSRF cookie, and projects disabled phone and refused gates", async () => {
  const { fixture, handler } = await ownerWorkspace("outreach-ui-get");
  try {
    const denied = await handler.handleOutreachGet(new Request("https://prospector.test/api/outreach"), ownerDependencies(fixture.database, { getIdentity: async () => null }));
    assert.equal(denied.status, 404);
    assert.deepEqual(await denied.json(), { error: "private_workspace_unavailable" });
    assert.equal(denied.headers.get("set-cookie"), null);
    const foreign = await handler.handleOutreachGet(new Request("https://prospector.test/api/outreach"), ownerDependencies(fixture.database, { getIdentity: async () => ({ email: "other@example.invalid", displayName: "Other" }) }));
    assert.equal(foreign.status, 404, "a non-owner sees the same neutral denial");

    const response = await handler.handleOutreachGet(new Request("https://prospector.test/api/outreach"), ownerDependencies(fixture.database));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") ?? "", /__Host-prospector-csrf/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.schema, "outreach-projection/v1");
    assert.deepEqual(body.gates.phone, { enabled: false, reason: "owner_uat_pending" });
    assert.equal(body.gates.approval.available, false);
    assert.equal(body.gates.queue.available, false);
    assert.match(body.gates.approval.reason, /contact readiness/i);
    assert.deepEqual(body.effects, { providerCalls: 0 });
    for (const list of ["packages", "messages", "calls", "suppressions", "stops", "delivery"]) assert.deepEqual(body[list], [], `${list} starts empty`);
  } finally { await fixture.dispose(); }
});

test("Outreach POST rejects foreign origin, missing intent, missing CSRF, malformed, oversized, unknown and client-scoped commands before any effect", async () => {
  const { fixture, handler } = await ownerWorkspace("outreach-ui-post-guards");
  try {
    const before = await outreachRowCounts(fixture);
    const valid = { action: "record_suppression", subjectKind: "company", channel: "all", reason: "owner_request", confirmed: true, idempotencyKey: "guard-suppression-key" };
    const deps = ownerDependencies(fixture.database);
    const nonOwner = await handler.handleOutreachPost(mutation(valid, { cookie: await csrfCookie(handler, fixture.database) }), ownerDependencies(fixture.database, { getIdentity: async () => null }));
    assert.equal(nonOwner.status, 404);
    const foreign = await handler.handleOutreachPost(mutation(valid, { origin: "https://foreign.test" }), deps);
    assert.equal(foreign.status, 403); assert.equal((await foreign.json()).error, "foreign_origin");
    const crossSite = await handler.handleOutreachPost(mutation(valid, { "sec-fetch-site": "cross-site" }), deps);
    assert.equal(crossSite.status, 403);
    const noIntent = await handler.handleOutreachPost(mutation(valid, { "x-prospector-intent": "contacts-mutation" }), deps);
    assert.equal(noIntent.status, 403); assert.equal((await noIntent.json()).error, "missing_intent");
    const noCsrf = await handler.handleOutreachPost(mutation(valid), deps);
    assert.equal(noCsrf.status, 403); assert.equal((await noCsrf.json()).error, "invalid_csrf_token");
    const malformed = await handler.handleOutreachPost(mutation("{", { cookie: await csrfCookie(handler, fixture.database) }), deps);
    assert.equal(malformed.status, 400);
    const oversized = await handler.handleOutreachPost(mutation(valid, { "content-length": "4097" }), deps);
    assert.equal(oversized.status, 413);
    const unknown = await handler.handleOutreachPost(mutation({ action: "send_now", messageApprovalId: "x-approval" }, { cookie: await csrfCookie(handler, fixture.database) }), deps);
    assert.equal(unknown.status, 400); assert.equal((await unknown.json()).error, "unsupported_action");
    for (const forged of [
      { ...valid, workspaceId: "someone-else" },
      { ...valid, ownerSubject: "forged-owner" },
      { action: "queue_message", messageApprovalId: "ui-approval", senderConnectionId: "forged-sender" },
      { action: "queue_message", messageApprovalId: "ui-approval", providerResponse: { accepted: true } },
      { action: "approve_package", packageVersionId: "ui-version", reviewedDigest: "a".repeat(64), idempotencyKey: "approve-key-1", approval: { authority: "crm_eligibility_only" } },
      { action: "record_call_outcome", packageApprovalId: "pa-1", phoneObservationId: "ob-1", expectedDecisionDigest: "a".repeat(64), outcome: "connected", notes: "ok", idempotencyKey: "call-key-1", confirmedPhoneE164: "+14165550100" },
      { ...valid, confirmed: false },
      { ...valid, subjectKind: "exact_email" },
    ]) {
      const response = await handler.handleOutreachPost(mutation(forged, { cookie: await csrfCookie(handler, fixture.database) }), deps);
      assert.equal(response.status, 400, `${JSON.stringify(forged)} is not a closed owner command`);
      assert.equal((await response.json()).error, "invalid_command");
    }
    assert.deepEqual(await outreachRowCounts(fixture), before, "no rejected request wrote anything");
  } finally { await fixture.dispose(); }
});

test("a CSRF token is single use: the replayed cookie is refused and nothing is written twice", async () => {
  const { fixture, handler } = await ownerWorkspace("outreach-ui-csrf-single-use");
  try {
    const deps = ownerDependencies(fixture.database);
    const cookie = await csrfCookie(handler, fixture.database);
    const command = { action: "record_suppression", subjectKind: "company", channel: "all", reason: "owner_request", confirmed: true, idempotencyKey: "company-suppression-key" };
    const first = await handler.handleOutreachPost(mutation(command, { cookie }), deps);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.command.status, "applied");
    assert.match(first.headers.get("set-cookie") ?? "", /__Host-prospector-csrf/, "a definitive answer carries a fresh token");
    assert.equal(firstBody.projection.suppressions.length, 1);
    assert.equal(firstBody.projection.suppressions[0].subjectKind, "company");
    const replay = await handler.handleOutreachPost(mutation(command, { cookie }), deps);
    assert.equal(replay.status, 403);
    assert.equal((await replay.json()).error, "invalid_csrf_token");
    assert.equal(await count(fixture, "outreach_suppression_tombstones"), 1);
  } finally { await fixture.dispose(); }
});

// ---------------------------------------------------------------------------
// Production composition (always-refusing rechecks)
// ---------------------------------------------------------------------------

test("production composition refuses package and message approval through the Phase 5 recheck and writes nothing", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-production-approval", { approvePackage: false });
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    assert.equal(services.mode, "production");
    const before = await outreachRowCounts(fixture);
    const result = await handler.executeOutreachCommand(fixture.database, context.scope, services, {
      action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: context.packageVersion.digest, idempotencyKey: "prod-package-approval",
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.command.status, "refused");
    assert.ok(result.body.command.reasonCodes.includes("contact_recheck_blocked"), JSON.stringify(result.body.command.reasonCodes));
    assert.equal(result.body.command.providerCalls, 0);
    assert.equal(result.body.projection.packages.length, 1, "the refusal carries a reloaded projection");
    assert.deepEqual(await outreachRowCounts(fixture), before);

    const wrongDigest = await handler.executeOutreachCommand(fixture.database, context.scope, services, {
      action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: "f".repeat(64), idempotencyKey: "prod-package-approval-2",
    });
    assert.ok(wrongDigest.body.command.reasonCodes.includes("reviewed_digest_mismatch"));
  } finally { await fixture.dispose(); }
});

test("production composition refuses message approval and queueing; no outbox item or provider call exists", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-production-queue");
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    const message = await handler.executeOutreachCommand(fixture.database, context.scope, services, {
      action: "approve_message", messageVersionId: context.messageVersion.id, reviewedDigest: context.messageVersion.digest,
      packageApprovalId: context.packageApproval.id, acknowledgementDigest: "a".repeat(64), idempotencyKey: "prod-message-approval",
    });
    assert.equal(message.status, 409);
    assert.equal(message.body.command.status, "refused");
    assert.ok(message.body.command.reasonCodes.includes("package_approval_not_current"));

    const noSender = await handler.executeOutreachCommand(fixture.database, context.scope, services, { action: "queue_message", messageApprovalId: context.messageApproval.id });
    assert.equal(noSender.status, 409);
    assert.deepEqual(noSender.body.command.reasonCodes, ["gmail_unavailable"], "without a server-known sender nothing is queued");
    await addSenderConnection(fixture, context);
    const blocked = await handler.executeOutreachCommand(fixture.database, context.scope, services, { action: "queue_message", messageApprovalId: context.messageApproval.id });
    assert.equal(blocked.status, 409);
    assert.deepEqual(blocked.body.command.reasonCodes, ["current_authority_unavailable"], "the final-send recheck refuses");
    assert.equal(await count(fixture, "outreach_outbox_items"), 0);
    assert.equal(await count(fixture, "outreach_message_approval_consumptions"), 0);
  } finally { await fixture.dispose(); }
});

test("production projection lists the exact package and message with digests, a refused approval check, and a disabled phone", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-production-projection");
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    const projection = await handler.readOutreachProjection(fixture.database, context.scope, services);
    const [card] = projection.packages;
    assert.equal(card.packageVersionId, context.packageVersion.id);
    assert.equal(card.artifactDigest, context.packageVersion.digest);
    assert.equal(card.latest, true);
    assert.equal(card.callScript, "Synthetic offline call script.");
    assert.equal(card.approval.id, context.packageApproval.id);
    assert.equal(card.approval.authority, "crm_eligibility_only");
    assert.equal(card.approval.current.crmEligible, false, "the stored approval is not current under the blocked recheck");
    assert.ok(card.approval.current.reasonCodes.includes("contact_recheck_blocked"));
    const [message] = projection.messages;
    assert.equal(message.messageVersionId, context.messageVersion.id);
    assert.equal(message.artifactDigest, context.messageVersion.digest);
    assert.deepEqual(message.to, ["verified@example.invalid"]);
    assert.equal(message.approval.id, context.messageApproval.id);
    assert.equal(message.recipientAuthority.acknowledgementDigest, context.recipientAuthority.digest);
    assert.equal(message.recipientAuthority.unsubscribeStatus, "working");
    assert.equal(message.outbox, null);
    const [call] = projection.calls;
    assert.equal(call.packageApprovalId, context.packageApproval.id);
    assert.equal(call.phoneObservationId, context.seeded.phoneObservationId);
    assert.equal(call.decision.eligible, false);
    assert.deepEqual(call.phoneAction, { enabled: false, reason: "not_eligible" });
    assert.equal(JSON.stringify(projection).includes(context.seeded.phoneNumber), false, "the phone number is never projected");
    assert.equal(JSON.stringify(projection).includes(context.unsubscribeTokenDigest), false, "the unsubscribe token digest is never projected");
  } finally { await fixture.dispose(); }
});

// ---------------------------------------------------------------------------
// Manual call outcome and D-8
// ---------------------------------------------------------------------------

async function callCard(handler, fixture, context, services) {
  const projection = await handler.readOutreachProjection(fixture.database, context.scope, services);
  return projection.calls[0];
}

test("D-8: do_not_call with the owner-confirmed number writes the contact and number tombstones before the outcome, in production", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-dnc-number");
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    const card = await callCard(handler, fixture, context, services);
    const result = await handler.executeOutreachCommand(fixture.database, context.scope, services, {
      action: "record_call_outcome", packageApprovalId: card.packageApprovalId, phoneObservationId: card.phoneObservationId,
      expectedDecisionDigest: card.decision.decisionDigest, outcome: "do_not_call", notes: "Asked not to be called again.",
      idempotencyKey: "dnc-with-number", confirmedPhoneE164: "+1 416 555 0100",
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.command.status, "applied");
    assert.deepEqual(result.body.command.suppression, { contactPhoneBlocked: true, numberBlocked: true });
    assert.equal(result.body.command.providerCalls, 0);
    const tombstones = (await fixture.database.prepare("SELECT subject_kind,subject_digest,channel,created_at FROM outreach_suppression_tombstones ORDER BY subject_kind").all()).results;
    assert.deepEqual(tombstones.map((row) => [row.subject_kind, row.channel]), [["contact", "phone"], ["e164_phone", "phone"]]);
    assert.equal(tombstones.find((row) => row.subject_kind === "e164_phone").subject_digest, context.seeded.phoneContactPointDigest);
    const outcome = await fixture.database.prepare("SELECT created_at FROM authority_commands WHERE command_type='manual_call.outcome'").first();
    assert.ok(tombstones.every((row) => Number(row.created_at) <= Number(outcome.created_at)), "suppression is written before the outcome");
    assert.ok(result.body.projection.suppressions.some((row) => row.subjectKind === "e164_phone" && row.reason === "do_not_call"));
  } finally { await fixture.dispose(); }
});

test("D-8: a confirmed number that does not match the stored phone digest is refused with no tombstone and no outcome", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-dnc-mismatch");
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    const card = await callCard(handler, fixture, context, services);
    for (const wrong of ["+14165550199", "4165550100", "not a number"]) {
      const result = await handler.executeOutreachCommand(fixture.database, context.scope, services, {
        action: "record_call_outcome", packageApprovalId: card.packageApprovalId, phoneObservationId: card.phoneObservationId,
        expectedDecisionDigest: card.decision.decisionDigest, outcome: "do_not_call", notes: "Asked not to be called again.",
        idempotencyKey: `dnc-mismatch-${wrong.length}`, confirmedPhoneE164: wrong,
      });
      assert.equal(result.status, 409, wrong);
      assert.deepEqual(result.body.command.reasonCodes, ["phone_confirmation_mismatch"]);
    }
    assert.equal(await count(fixture, "outreach_suppression_tombstones"), 0);
    assert.equal(await count(fixture, "authority_commands", "command_type='manual_call.outcome'"), 0);
  } finally { await fixture.dispose(); }
});

test("do_not_call without a confirmed number still blocks the contact's phone and says the number is not blocked", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-dnc-contact-only");
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    const card = await callCard(handler, fixture, context, services);
    const result = await handler.executeOutreachCommand(fixture.database, context.scope, services, {
      action: "record_call_outcome", packageApprovalId: card.packageApprovalId, phoneObservationId: card.phoneObservationId,
      expectedDecisionDigest: card.decision.decisionDigest, outcome: "do_not_call", notes: "Asked not to be called again.", idempotencyKey: "dnc-contact-only",
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.command.suppression, { contactPhoneBlocked: true, numberBlocked: false });
  } finally { await fixture.dispose(); }
});

test("in production any outcome other than do_not_call is refused because the phone is not eligible", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-call-refused");
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    const card = await callCard(handler, fixture, context, services);
    const result = await handler.executeOutreachCommand(fixture.database, context.scope, services, {
      action: "record_call_outcome", packageApprovalId: card.packageApprovalId, phoneObservationId: card.phoneObservationId,
      expectedDecisionDigest: card.decision.decisionDigest, outcome: "connected", notes: "Spoke briefly.", idempotencyKey: "connected-refused",
    });
    assert.equal(result.status, 409);
    assert.deepEqual(result.body.command.reasonCodes, ["stale_or_ineligible"]);
    assert.equal(await count(fixture, "authority_commands", "command_type='manual_call.outcome'"), 0);
  } finally { await fixture.dispose(); }
});

// ---------------------------------------------------------------------------
// Owner suppression
// ---------------------------------------------------------------------------

test("owner suppression derives its subject on the server, replays by key, and refuses invalid values", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-suppression");
  try {
    const services = handler.composeProductionOutreachServices(fixture.database, context.scope);
    const run = (body) => handler.executeOutreachCommand(fixture.database, context.scope, services, body);
    const email = { action: "record_suppression", subjectKind: "exact_email", value: " Verified@Example.invalid ", channel: "email", reason: "owner_request", confirmed: true, idempotencyKey: "suppress-email" };
    const first = await run(email);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.command.status, "applied");
    const replay = await run(email);
    assert.equal(replay.body.command.status, "replayed");
    assert.equal(await count(fixture, "outreach_suppression_tombstones"), 1);
    const contact = await run({ action: "record_suppression", subjectKind: "contact", value: context.seeded.contactId, channel: "all", reason: "explicit_opt_out", confirmed: true, idempotencyKey: "suppress-contact" });
    assert.equal(contact.status, 200);
    const stored = await fixture.database.prepare("SELECT subject_digest FROM outreach_suppression_tombstones WHERE subject_kind='contact'").first();
    assert.equal(stored.subject_digest, "6".repeat(64), "the contact identity digest comes from D1, not the browser");
    const unknownContact = await run({ action: "record_suppression", subjectKind: "contact", value: "not-a-contact", channel: "all", reason: "owner_request", confirmed: true, idempotencyKey: "suppress-unknown" });
    assert.equal(unknownContact.status, 409);
    assert.deepEqual(unknownContact.body.command.reasonCodes, ["unknown_contact"]);
    for (const invalid of [
      { subjectKind: "exact_email", value: "not-an-email", channel: "email" },
      { subjectKind: "e164_phone", value: "416-555-0100", channel: "phone" },
      { subjectKind: "confirmed_email_domain", value: "localhost", channel: "email" },
      { subjectKind: "e164_phone", value: "+14165550100", channel: "email" },
    ]) {
      const result = await run({ action: "record_suppression", reason: "owner_request", confirmed: true, idempotencyKey: "suppress-invalid", ...invalid });
      assert.equal(result.status, 400, JSON.stringify(invalid));
    }
    const domain = await run({ action: "record_suppression", subjectKind: "confirmed_email_domain", value: "example.invalid", channel: "email", reason: "owner_request", confirmed: true, idempotencyKey: "suppress-domain" });
    assert.equal(domain.status, 200);
    const projection = domain.body.projection;
    assert.deepEqual(projection.suppressions.map((row) => row.subjectKind).sort(), ["confirmed_email_domain", "contact", "exact_email"]);
    assert.equal(JSON.stringify(projection.suppressions).includes("verified@example.invalid"), false, "suppression rows never carry the value");
  } finally { await fixture.dispose(); }
});

// ---------------------------------------------------------------------------
// Synthetic composition: the handler wires the trusted services end to end
// ---------------------------------------------------------------------------

test("with test-only synthetic readiness the handler approves the package, then the message, then queues one Pending item with zero provider calls", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-synthetic-path", { approvePackage: false });
  try {
    const services = (await syntheticServices(fixture, context))(fixture.database, context.scope);
    const run = (body) => handler.executeOutreachCommand(fixture.database, context.scope, services, body);
    const pkg = await run({ action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: context.packageVersion.digest, idempotencyKey: "synthetic-package-approval" });
    assert.equal(pkg.status, 200, JSON.stringify(pkg.body));
    assert.equal(pkg.body.command.status, "applied");
    assert.equal(pkg.body.command.authority, "crm_eligibility_only");
    assert.equal(await count(fixture, "outreach_message_approvals"), 0, "package approval approves no message");
    const replay = await run({ action: "approve_package", packageVersionId: context.packageVersion.id, reviewedDigest: context.packageVersion.digest, idempotencyKey: "synthetic-package-approval" });
    assert.equal(replay.body.command.status, "replayed");
    const packageApprovalId = pkg.body.command.approvalId;
    const authority = await recordRecipientAuthority(context, packageApprovalId);
    const message = await run({
      action: "approve_message", messageVersionId: context.messageVersion.id, reviewedDigest: context.messageVersion.digest,
      packageApprovalId, acknowledgementDigest: authority.digest, idempotencyKey: "synthetic-message-approval",
    });
    assert.equal(message.status, 200, JSON.stringify(message.body));
    assert.equal(message.body.command.authority, "exact_message_only");
    assert.equal(await count(fixture, "outreach_outbox_items"), 0, "message approval queues nothing");
    await addSenderConnection(fixture, context);
    const queued = await run({ action: "queue_message", messageApprovalId: message.body.command.approvalId });
    assert.equal(queued.status, 200, JSON.stringify(queued.body));
    assert.equal(queued.body.command.status, "applied");
    assert.equal(queued.body.command.providerCalls, 0);
    const again = await run({ action: "queue_message", messageApprovalId: message.body.command.approvalId });
    assert.equal(again.body.command.status, "replayed");
    assert.equal(await count(fixture, "outreach_outbox_items"), 1);
    const states = (await fixture.database.prepare("SELECT state FROM outreach_outbox_events").all()).results.map((row) => row.state);
    assert.deepEqual(states, ["pending"]);
    const delivery = again.body.projection.delivery;
    assert.equal(delivery.length, 1);
    assert.equal(delivery[0].state, "pending");
    assert.equal(again.body.projection.messages[0].outbox.state, "pending");
  } finally { await fixture.dispose(); }
});

test("an unsubscribe after queueing cancels the pending item before reporting success", async () => {
  const { fixture, handler, context } = await seededWorkspace("outreach-ui-unsubscribe-cancels");
  try {
    const services = (await syntheticServices(fixture, context))(fixture.database, context.scope);
    await addSenderConnection(fixture, context);
    const queued = await handler.executeOutreachCommand(fixture.database, context.scope, services, { action: "queue_message", messageApprovalId: context.messageApproval.id });
    assert.equal(queued.body.command.status, "applied");
    const unsubscribe = await fixture.vite.ssrLoadModule(MODULES.unsubscribe);
    const limiter = unsubscribe.createInMemoryRateLimiter({ limit: 5, windowMs: 60_000, now: () => CLOCK });
    const response = await unsubscribe.handlePublicUnsubscribePost(new Request("https://prospector.test/api/unsubscribe", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: UNSUBSCRIBE_TOKEN }).toString(),
    }), { database: fixture.database, limiter, now: () => CLOCK + 1 });
    assert.equal(response.status, 200);
    const states = (await fixture.database.prepare("SELECT state FROM outreach_outbox_events ORDER BY revision").all()).results.map((row) => row.state);
    assert.deepEqual(states, ["pending", "cancelled"]);
    assert.equal(await count(fixture, "outreach_suppression_tombstones", "reason='unsubscribe'"), 1);
  } finally { await fixture.dispose(); }
});

// ---------------------------------------------------------------------------
// Public unsubscribe
// ---------------------------------------------------------------------------

test("public unsubscribe returns one generic answer for valid, replayed, unknown and malformed tokens, and writes only for a valid one", async () => {
  const { fixture, context } = await seededWorkspace("outreach-ui-unsubscribe-generic");
  try {
    const unsubscribe = await fixture.vite.ssrLoadModule(MODULES.unsubscribe);
    const stopRules = await fixture.vite.ssrLoadModule(MODULES.stopRules);
    const limiter = unsubscribe.createInMemoryRateLimiter({ limit: 100, windowMs: 60_000, now: () => CLOCK });
    const deps = { database: fixture.database, limiter, now: () => CLOCK + 1 };
    const post = (body, type = "application/json") => unsubscribe.handlePublicUnsubscribePost(new Request("https://prospector.test/api/unsubscribe", {
      method: "POST", headers: { "content-type": type, "cf-connecting-ip": "203.0.113.7" }, body,
    }), deps);
    const answers = [];
    for (const body of [
      JSON.stringify({ token: "unknown-token-0123456789abcdef0123456789" }),
      JSON.stringify({ token: "short" }),
      JSON.stringify({ token: UNSUBSCRIBE_TOKEN, extra: true }),
      "{not json",
      JSON.stringify({ token: UNSUBSCRIBE_TOKEN }),
      JSON.stringify({ token: UNSUBSCRIBE_TOKEN }),
    ]) {
      const response = await post(body);
      answers.push({ status: response.status, body: await response.text(), cache: response.headers.get("cache-control") });
    }
    const forms = await post(new URLSearchParams({ token: UNSUBSCRIBE_TOKEN }).toString(), "application/x-www-form-urlencoded");
    answers.push({ status: forms.status, body: await forms.text(), cache: forms.headers.get("cache-control") });
    const oversized = await post(JSON.stringify({ token: "x".repeat(4000) }));
    answers.push({ status: oversized.status, body: await oversized.text(), cache: oversized.headers.get("cache-control") });
    assert.equal(new Set(answers.map((answer) => JSON.stringify(answer))).size, 1, JSON.stringify(answers));
    assert.equal(answers[0].status, 200);
    assert.deepEqual(JSON.parse(answers[0].body), { message: stopRules.UNSUBSCRIBE_ACKNOWLEDGEMENT });
    assert.equal(answers[0].cache, "no-store");
    assert.equal(await count(fixture, "outreach_suppression_tombstones", "reason='unsubscribe'"), 1, "only the valid token wrote, once");
    assert.equal(answers[0].body.includes(context.seeded.contactId), false);
  } finally { await fixture.dispose(); }
});

test("public unsubscribe is rate limited before any read and the limited answer equals the unavailable answer", async () => {
  const fixture = await createD1Fixture("outreach-ui-unsubscribe-rate");
  try {
    const unsubscribe = await fixture.vite.ssrLoadModule(MODULES.unsubscribe);
    let reads = 0;
    const database = { prepare(sql) { reads += 1; return fixture.database.prepare(sql); }, batch: fixture.database.batch.bind(fixture.database) };
    const limiter = unsubscribe.createInMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: () => CLOCK });
    const post = (deps) => unsubscribe.handlePublicUnsubscribePost(new Request("https://prospector.test/api/unsubscribe", {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify({ token: "unknown-token-0123456789abcdef0123456789" }),
    }), deps);
    const deps = { database, limiter, now: () => CLOCK };
    await post(deps);
    const readsAfterFirst = reads;
    const limited = await post(deps);
    assert.equal(reads, readsAfterFirst, "a limited request performs no read");
    const throwing = await post({ database, limiter: { consume() { throw new Error("limiter down"); } }, now: () => CLOCK });
    assert.equal(limited.status, 503);
    assert.equal(throwing.status, 503);
    assert.equal(await limited.text(), await throwing.text(), "rate limited and unavailable are indistinguishable");
  } finally { await fixture.dispose(); }
});

test("the in-memory limiter counts per key in a fixed window and stays bounded", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const unsubscribe = await vite.ssrLoadModule(MODULES.unsubscribe);
    let now = 1_000;
    const limiter = unsubscribe.createInMemoryRateLimiter({ limit: 2, windowMs: 100, maxKeys: 3, now: () => now });
    assert.equal(limiter.consume("a"), true);
    assert.equal(limiter.consume("a"), true);
    assert.equal(limiter.consume("a"), false);
    assert.equal(limiter.consume("b"), true);
    now += 101;
    assert.equal(limiter.consume("a"), true, "a new window resets the count");
    for (const key of ["c", "d", "e", "f"]) limiter.consume(key);
    assert.ok(limiter.size() <= 3, "the key table never grows past its bound");
    assert.throws(() => unsubscribe.createInMemoryRateLimiter({ limit: 0, windowMs: 100 }));
  } finally { await vite.close(); }
});

// ---------------------------------------------------------------------------
// Workspace transport and leaves
// ---------------------------------------------------------------------------

async function withApp(assertion) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const leaves = await vite.ssrLoadModule(new URL("app/prospects/outreach-leaves.tsx", root).pathname);
    const workspace = await vite.ssrLoadModule(new URL("app/prospects/outreach-workspace.tsx", root).pathname);
    await assertion({ leaves, workspace });
  } finally { await vite.close(); }
}

function jsonResponse(status, body) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

function stubFetch(responders) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null, headers: init.headers ?? {} });
    const next = responders.shift();
    if (!next) throw new Error(`unexpected ${init.method ?? "GET"} ${url}`);
    return typeof next === "function" ? next() : next;
  };
  return { fetcher, calls };
}

function sampleProjection(overrides = {}) {
  const digest = (char) => char.repeat(64);
  return {
    schema: "outreach-projection/v1", generatedAt: OUTREACH_NOW, effects: { providerCalls: 0 },
    gates: {
      approval: { available: false, reason: "Approvals are refused until contact readiness checks are accepted." },
      queue: { available: false, reason: "Queueing is refused until contact readiness checks are accepted." },
      phone: { enabled: false, reason: "owner_uat_pending" },
    },
    packages: [{
      packageId: "ui-package", packageVersionId: "pv-1", version: 1, latest: true, artifactDigest: digest("a"), createdAt: OUTREACH_NOW,
      recommendedAngle: "<b>angle</b>", selectedRole: "champion", callScript: "Say <script>alert(1)</script> hello.",
      evidenceCount: 1, claimGuardrailCount: 1, selectedContactPointCount: 2, draftMessageCount: 1,
      bindings: [{ kind: "configuration", id: "cfg-1", digest: digest("b") }],
      approval: { id: "pa-1", approvalDigest: digest("c"), expiresAt: OUTREACH_NOW + 1_000, state: "recorded", authority: "crm_eligibility_only", current: { crmEligible: false, reasonCodes: ["contact_recheck_blocked"] } },
    }],
    messages: [{
      messageId: "ui-message", messageVersionId: "mv-1", version: 1, latest: true, packageVersionId: "pv-1", artifactDigest: digest("d"),
      from: "owner@example.invalid", replyTo: null, to: ["verified@example.invalid"], cc: [], bccCount: 0,
      subject: "<img src=x onerror=alert(1)>", textPreview: "Hello <script>alert(2)</script>", htmlPartPresent: true,
      links: ["https://example.invalid/unsubscribe"], attachments: [{ name: "brief.pdf", mediaType: "application/pdf", digest: digest("e") }],
      intendedSendAt: OUTREACH_NOW + 1_000, timezone: "America/Toronto",
      approval: null,
      recipientAuthority: { packageApprovalId: "pa-1", acknowledgementDigest: digest("f"), validUntil: OUTREACH_NOW + 1_000, unsubscribeStatus: "working", jurisdictionCode: "CA-ON", claimedBasisCode: "legitimate_interest" },
      outbox: null,
    }],
    calls: [{
      packageApprovalId: "pa-1", phoneObservationId: "ob-1", packageArtifactDigest: digest("a"),
      decision: { eligible: false, reasonCodes: ["phone_not_current_verified"], decisionDigest: digest("1") },
      phoneAction: { enabled: false, reason: "not_eligible" },
    }],
    suppressions: [{ id: "st-1", subjectKind: "company", channel: "all", reason: "owner_request", effectiveAt: OUTREACH_NOW, aliasCount: 0 }],
    stops: [],
    delivery: [{ outboxItemId: "ob-item-1", messageVersionId: "mv-1", state: "delivery_unknown", revision: 4, reasonCode: "ambiguous", at: OUTREACH_NOW }],
    ...overrides,
  };
}

test("the Outreach transport never retries after an expired CSRF token and keeps a key only for an unknown outcome", async () => {
  await withApp(async ({ workspace }) => {
    const keys = new Map();
    const command = { action: "record_suppression", subjectKind: "company", channel: "all", reason: "owner_request", confirmed: true };
    let stub = stubFetch([jsonResponse(403, { error: "invalid_csrf_token" })]);
    let outcome = await workspace.postOutreachMutation(stub.fetcher, command, keys);
    assert.equal(outcome.kind, "session_expired");
    assert.equal(stub.calls.length, 1, "exactly one POST and no refresh GET");
    assert.equal(keys.size, 0);

    stub = stubFetch([jsonResponse(503, { error: "outreach_unavailable" })]);
    outcome = await workspace.postOutreachMutation(stub.fetcher, command, keys);
    assert.equal(outcome.kind, "unknown");
    assert.equal(stub.calls.length, 1, "an unknown outcome is never retried automatically");
    const kept = stub.calls[0].body.idempotencyKey;
    assert.equal(keys.size, 1);
    stub = stubFetch([() => { throw new TypeError("network"); }]);
    assert.equal((await workspace.postOutreachMutation(stub.fetcher, command, keys)).kind, "unknown");
    assert.equal(stub.calls[0].body.idempotencyKey, kept, "the owner's own retry of the same intent reuses the key");

    stub = stubFetch([jsonResponse(409, { command: { action: "record_suppression", status: "refused", reasonCodes: ["unknown_contact"], providerCalls: 0 }, projection: sampleProjection() })]);
    outcome = await workspace.postOutreachMutation(stub.fetcher, command, keys);
    assert.equal(outcome.kind, "refused");
    assert.deepEqual(outcome.reasonCodes, ["unknown_contact"]);
    assert.equal(outcome.projection.packages.length, 1);
    assert.equal(keys.size, 0, "a definitive refusal drops the key");

    stub = stubFetch([jsonResponse(200, { command: { action: "queue_message", status: "applied", reasonCodes: [], providerCalls: 0 }, projection: sampleProjection() })]);
    outcome = await workspace.postOutreachMutation(stub.fetcher, { action: "queue_message", messageApprovalId: "ma-1" }, keys);
    assert.equal(outcome.kind, "applied");
    assert.equal("idempotencyKey" in stub.calls[0].body, false, "queue_message carries no client key; the outbox is idempotent by approval");
    assert.equal(stub.calls[0].headers["x-prospector-intent"], "outreach-mutation");

    stub = stubFetch([jsonResponse(404, { error: "private_workspace_unavailable" })]);
    assert.equal((await workspace.postOutreachMutation(stub.fetcher, command, keys)).kind, "unauthorized");
  });
});

test("the Outreach leaves render sections in order, escape every body, keep the phone disabled with a visible reason, and contain no tel: or mailto:", async () => {
  await withApp(async ({ leaves }) => {
    const html = renderToStaticMarkup(React.createElement(leaves.OutreachSections, { projection: leaves.normalizeOutreachProjection(sampleProjection()), interaction: leaves.READ_ONLY_INTERACTION }));
    const order = ["Current outreach eligibility", "Outreach Package review", "Gmail drafts and approvals", "Manual verified phone", "Suppression and stop history", "Delivery and reconciliation history"];
    let last = -1;
    for (const heading of order) { const at = html.indexOf(heading); assert.ok(at > last, `${heading} follows the previous section`); last = at; }
    assert.doesNotMatch(html, /<script|<img|<b>angle/, "bodies, subjects and scripts are escaped data");
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /tel:|mailto:/i);
    assert.doesNotMatch(html, /<a [^>]*href="https:\/\/example\.invalid/, "message links are shown as text, never as live links");
    assert.match(html, /Approve package for CRM eligibility/);
    assert.match(html, /This does not approve or send email\./);
    assert.match(html, /Approve this message for queued Gmail delivery/);
    assert.match(html, /Draft only — no Gmail delivery is authorized\./);
    assert.match(html, /Gmail acceptance could not be confirmed\. PROspector will not resend automatically\./);
    assert.match(html, /Compliance guidance is advisory/);
    assert.match(html, /Derived from approved Outreach Package/);
    const phone = html.match(/<button[^>]*>Open verified business phone<\/button>/)?.[0] ?? "";
    assert.match(phone, /disabled=""/, "the phone action is a native disabled control");
    const describedBy = phone.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(describedBy, "the phone action points at its reason");
    assert.match(html, new RegExp(`id="${describedBy}"[^>]*tabindex="0"[^>]*>[^<]*(owner acceptance|not eligible)`, "i"));
    assert.match(html, /PROspector does not place or record calls/);
    for (const action of ["Approve package for CRM eligibility", "Approve this message for queued Gmail delivery", "Queue for controlled delivery"]) {
      const button = html.match(new RegExp(`<button[^>]*>${action}</button>`))?.[0] ?? "";
      assert.match(button, /disabled=""/, `${action} is disabled while the gate is refused`);
      assert.match(button, /aria-describedby="/, `${action} has an adjacent reason`);
    }
    assert.doesNotMatch(html, /legally approved|consent obtained/i);
  });
});

test("reason codes become plain language and unknown codes stay readable without leaking structure", async () => {
  await withApp(async ({ leaves }) => {
    assert.match(leaves.reasonText("contact_recheck_blocked"), /contact readiness/i);
    assert.match(leaves.reasonText("gmail_unavailable"), /Gmail delivery is unavailable\. No email will be sent\./);
    assert.match(leaves.reasonText("phone_confirmation_mismatch"), /number/i);
    assert.match(leaves.reasonText("dependency_missing:configuration"), /configuration/i);
    assert.equal(typeof leaves.reasonText("something_new"), "string");
    assert.equal(leaves.normalizeOutreachProjection({ schema: "wrong" }), null);
    assert.equal(leaves.normalizeOutreachProjection(sampleProjection({ gates: { ...sampleProjection().gates, phone: { enabled: true, reason: "owner_uat_pending" } } })).gates.phone.enabled, false, "the client can never turn the phone action on");
  });
});

// ---------------------------------------------------------------------------
// Source guards for the new routes
// ---------------------------------------------------------------------------

test("the Outreach routes compose production services only, and no new source carries a provider or dial/mail scheme", async () => {
  const files = [
    "app/api/outreach/route.ts", "app/api/unsubscribe/route.ts", "app/unsubscribe/page.tsx",
    "app/prospects/outreach-workspace.tsx", "app/prospects/outreach-leaves.tsx",
    "domain/outreach-handler.ts", "domain/unsubscribe-handler.ts",
  ];
  for (const file of files) {
    const text = await source(file);
    assert.doesNotMatch(text, /tel:|mailto:/i, `${file} has no dial or mail scheme`);
    assert.doesNotMatch(text, /gmail\.googleapis\.com|GMAIL_[A-Z]/, `${file} has no Gmail endpoint or secret name`);
    assert.doesNotMatch(text, /preparation\//, `${file} does not compose preparation-only code`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${file} never renders raw HTML`);
  }
  const route = await source("app/api/outreach/route.ts");
  assert.match(route, /handleOutreachGet/);
  assert.match(route, /handleOutreachPost/);
  assert.doesNotMatch(route, /services\s*:|syntheticServices|createOutreachPackageService|recheckFor/, "the route never injects services or a readiness port");
  const handler = await source("domain/outreach-handler.ts");
  assert.match(handler, /composeOutreachPackageService/);
  assert.match(handler, /composeMessageVersionService/);
  assert.match(handler, /recheckForFinalSend/);
  assert.match(handler, /blockedClickToCallEligibilityPort/);
  const unsubscribeRoute = await source("app/api/unsubscribe/route.ts");
  assert.match(unsubscribeRoute, /createInMemoryRateLimiter/);
  assert.doesNotMatch(unsubscribeRoute, /export (async )?function GET/, "unsubscribe never mutates on GET");
  const contactEligibility = await source("domain/contact-eligibility.ts");
  assert.match(contactEligibility, /export function recheckForFinalSend\(input: unknown\): DownstreamRecheck \{ return blockedRecheck\("final_send", input\); \}/, "the blocked recheck is unedited");
});

// ---------------------------------------------------------------------------
// Later plans
// ---------------------------------------------------------------------------

test("owner drafts a Package and Message Versions from current evidence in the Outreach workspace", { todo: "06-08 drafting from evidence not implemented (no derivation service yet)" }, () => {});
test("owner reconciles a Delivery unknown item without any resend", { todo: "06-12 not implemented" }, () => {});
test("owner opens a verified business phone after acceptance", { todo: "06-13 Task 3 not implemented" }, () => {});
