import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  countRows,
  createD1Fixture,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const ORIGIN = "http://localhost:8788";
const PEPPER = "local-progression-handler-pepper-at-least-32-bytes";
const IDENTITY = { email: "owner@example.invalid", displayName: "Local owner" };

test("advance_local_interview is closed to the guarded local-demo handler and fails stale or hostile requests without domain writes", async () => {
  const fixture = await createD1Fixture("local-interview-handler-boundary");
  try {
    await applyMigrations(fixture.database);
    const [interview, commercial, handler] = await Promise.all([
      fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/interview-handler.ts", import.meta.url).pathname),
    ]);
    const principal = await interview.principalFromIdentity(IDENTITY.email, IDENTITY.displayName, PEPPER);
    let state = await interview.bootstrapInterview(fixture.database, principal);
    await commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: key(1) });
    const answer = await interview.submitInterviewAnswer(fixture.database, principal, {
      questionId: state.question.id, expectedRevision: state.question.revision, answer: "write_correction",
      value: { excerpt: "Local baseline" }, reason: "Explicit local baseline.", idempotencyKey: key(2),
    });
    state = await interview.recordInterviewDecision(fixture.database, principal, {
      answerId: answer.answer.id, expectedSessionRevision: answer.session.revision,
      expectedQuestionRevision: answer.question.revision, decision: "accept", idempotencyKey: key(3),
    });
    assert.equal(state.status, "confirmed");
    const before = await snapshotForbiddenOperationalRows(fixture.database);

    const local = dependencies(fixture.database, IDENTITY, true);
    const localGet = await handler.handleInterviewGet(local);
    const localBody = await localGet.json();
    assert.equal(localBody.localProgression.status, "ready");
    assert.equal(localBody.localProgression.next.requiresOwnerInput, true);
    assert.equal(localBody.localProgression.next.recommendation, null);
    let cookie = cookieFrom(localGet);

    const disabled = dependencies(fixture.database, IDENTITY, false);
    const disabledGet = await handler.handleInterviewGet(disabled);
    const disabledBody = await disabledGet.clone().json();
    assert.equal("localProgression" in disabledBody, false);
    const domainBeforeDisabled = await domainCounts(fixture.database);
    const disabledResponse = await handler.handleInterviewPost(mutation({
      action: "advance_local_interview", idempotencyKey: key(10), expectedQueueDigest: localBody.localProgression.queueDigest,
    }, cookieFrom(disabledGet)), disabled);
    assert.equal(disabledResponse.status, 404);
    assert.deepEqual(await domainCounts(fixture.database), domainBeforeDisabled);

    assert.equal((await handler.handleInterviewPost(mutation({
      action: "advance_local_interview", idempotencyKey: key(11), expectedQueueDigest: localBody.localProgression.queueDigest,
    }, cookie, { origin: "https://attacker.example" }), local)).status, 403);
    assert.deepEqual(await domainCounts(fixture.database), domainBeforeDisabled);

    cookie = cookieFrom(await handler.handleInterviewGet(local));
    assert.equal((await handler.handleInterviewPost(mutation({
      action: "advance_local_interview", idempotencyKey: key(12), expectedQueueDigest: localBody.localProgression.queueDigest, forgedRecommendation: "attacker",
    }, cookie), local)).status, 409);
    assert.deepEqual(await domainCounts(fixture.database), domainBeforeDisabled);

    await fixture.database.prepare("UPDATE products SET revision = revision + 1").run();
    cookie = cookieFrom(await handler.handleInterviewGet(local));
    const staleBaseline = await domainCounts(fixture.database);
    assert.equal((await handler.handleInterviewPost(mutation({
      action: "advance_local_interview", idempotencyKey: key(13), expectedQueueDigest: localBody.localProgression.queueDigest,
    }, cookie), local)).status, 409);
    assert.deepEqual(await domainCounts(fixture.database), staleBaseline);

    const refreshed = await handler.handleInterviewGet(local);
    const refreshedBody = await refreshed.clone().json();
    const advanced = await handler.handleInterviewPost(mutation({
      action: "advance_local_interview", idempotencyKey: key(14), expectedQueueDigest: refreshedBody.localProgression.queueDigest,
    }, cookieFrom(refreshed)), local);
    assert.equal(advanced.status, 200);
    const active = await advanced.json();
    assert.equal(active.status, "active");
    assert.equal(active.question.requiresOwnerInput, true);
    assert.equal(active.question.recommendationDetail, null);

    const outsider = dependencies(fixture.database, { email: "outsider@example.invalid", displayName: "Outsider" }, true);
    assert.equal((await handler.handleInterviewGet(outsider)).status, 404);
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("route and browser transport derive local progression only from the existing server guard", async () => {
  const [interviewRoute, knowledgeRoute, transport, identity] = await Promise.all([
    readFile(new URL("../app/api/interview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge/mutation-transport.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/runtime-identity.ts", import.meta.url), "utf8"),
  ]);
  assert.match(interviewRoute, /enableLocalDemoProgression: isLocalDemoRequest\(request, bindings\)/);
  assert.match(knowledgeRoute, /enableLocalDemoProgression: isLocalDemoRequest\(request, bindings\)/);
  assert.match(transport, /"advance_local_interview"/);
  for (const invariant of [/import\.meta\.env\.DEV/, /LOCAL_DEMO === "1"/, /TRUSTED_IDENTITY_PROVIDER === "local-demo"/, /isLoopbackHostname/]) assert.match(identity, invariant);
  assert.doesNotMatch(interviewRoute + knowledgeRoute, /process\.env\.LOCAL_DEMO|authenticated-user-email/i);
});

test("the real interview route admits the guarded loopback command and rejects non-local composition", async () => {
  const fixture = await createD1Fixture("local-interview-real-route");
  let routeVite;
  try {
    await applyMigrations(fixture.database);
    const [interview, commercial] = await Promise.all([
      fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname),
    ]);
    const principal = await interview.principalFromIdentity("local-owner@prospector.invalid", "Local Demo Owner", PEPPER);
    let state = await interview.bootstrapInterview(fixture.database, principal);
    await commercial.initializeCommercialModel(fixture.database, principal, { idempotencyKey: key(40) });
    const answer = await interview.submitInterviewAnswer(fixture.database, principal, {
      questionId: state.question.id, expectedRevision: state.question.revision, answer: "write_correction",
      value: { excerpt: "Route baseline" }, reason: "Disposable real-route proof.", idempotencyKey: key(41),
    });
    await interview.recordInterviewDecision(fixture.database, principal, {
      answerId: answer.answer.id, expectedSessionRevision: answer.session.revision,
      expectedQuestionRevision: answer.question.revision, decision: "accept", idempotencyKey: key(42),
    });
    globalThis.__prospectorRouteTestEnv = {
      DB: fixture.database, OWNER_SUBJECT_PEPPER: PEPPER, PILOT_OWNER_EMAIL: "local-owner@prospector.invalid",
      TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1",
    };
    routeVite = await createServer({ configFile: false, logLevel: "silent", plugins: [{
      name: "test-cloudflare-workers",
      resolveId(id) { if (id === "cloudflare:workers") return "\0test-cloudflare-workers"; },
      load(id) { if (id === "\0test-cloudflare-workers") return "export const env = globalThis.__prospectorRouteTestEnv"; },
    }] });
    const route = await routeVite.ssrLoadModule(new URL("../app/api/interview/route.ts", import.meta.url).pathname);
    const get = await route.GET(new Request(`${ORIGIN}/api/interview`));
    assert.equal(get.status, 200);
    const projection = await get.clone().json();
    assert.equal(projection.localProgression.status, "ready");
    const command = {
      action: "advance_local_interview", idempotencyKey: key(43), expectedQueueDigest: projection.localProgression.queueDigest,
    };
    const cookie = cookieFrom(get);
    assert.equal((await route.POST(mutation(command, cookie, { origin: "https://attacker.example" }))).status, 404, "the runtime identity admission rejects hostile mutation origin without consuming CSRF");
    const post = await route.POST(mutation(command, cookie));
    assert.equal(post.status, 200);
    assert.equal((await post.json()).status, "active");
    const nextCookie = cookieFrom(post);
    const malformed = new Request(`${ORIGIN}/api/interview`, { method: "POST", headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "x-prospector-intent": "interview-mutation", cookie: nextCookie, "content-type": "application/json" }, body: "{" });
    assert.equal((await route.POST(malformed)).status, 400);
    assert.equal((await route.POST(mutation(command, nextCookie))).status, 403, "CSRF is consumed before bounded-body dispatch");

    globalThis.__prospectorRouteTestEnv.LOCAL_DEMO = undefined;
    globalThis.__prospectorRouteTestEnv.TRUSTED_IDENTITY_PROVIDER = "sites";
    assert.equal((await route.GET(new Request("https://hosted.example/api/interview"))).status, 404);
  } finally {
    delete globalThis.__prospectorRouteTestEnv;
    if (routeVite) await routeVite.close();
    await fixture.dispose();
  }
});

test("local interview UI requires written owner input and exposes only an explicit Continue action", async () => {
  const fixture = await createD1Fixture("local-interview-ui-contract");
  try {
    const { ConsensusInterviewView, LocalInterviewContinueControl } = await fixture.vite.ssrLoadModule(new URL("../app/knowledge/consensus-interview.tsx", import.meta.url).pathname);
    const destination = { id: "company-1", type: "company", parentId: null, name: "Generic Company", lifecycle: "active", revision: 1 };
    const common = {
      destinations: [destination], answerOperationKey: "answer", decisionOperationKey: "decision",
      onSubmitAnswer() {}, onRecordDecision() {}, onAdvance() {},
    };
    const question = {
      id: "iq_aaaaaaaaaaaaaaaaaaaaaaaa", revision: 1, ordinal: 2,
      prompt: "What should PROspector know about this Company?", premise: "No reliable evidence was recorded.",
      inference: "Owner input is missing.", provenance: "Local deterministic queue.",
      recommendation: "Owner input is required; no recommendation was generated.", evidenceFindings: [],
      inferenceDetail: { label: "Inference", value: "Owner input is missing." }, recommendationDetail: null,
      destination: { scopeType: "company", id: destination.id }, prerequisiteKnowledge: [], requiresOwnerInput: true,
    };
    const active = renderToStaticMarkup(React.createElement(ConsensusInterviewView, {
      ...common,
      state: { status: "active", displayName: "Owner", workspace: { id: "workspace-1", companyName: "Generic Company" }, session: { id: "session-1", revision: 4 }, question },
    }));
    assert.match(active, /Use recommendation<\/label>/);
    assert.match(active, /type="radio"[^>]*disabled=""[^>]*>Use recommendation/);
    assert.match(active, /Owner-confirmed value<input required=""/);
    assert.match(active, /No recommendation was generated\. Owner input is required\./);

    const confirmed = renderToStaticMarkup(React.createElement(ConsensusInterviewView, {
      ...common,
      state: {
        status: "confirmed", displayName: "Owner", workspace: { id: "workspace-1", companyName: "Generic Company" },
        confirmed: { knowledgeVersionId: null, value: { decision: "reject" }, confirmedAt: 1_700_000_000_000, auditEventId: "audit-1" },
        localProgression: { mode: "local_demo", status: "ready", queueDigest: "a".repeat(64), completedSlots: 1, totalSlots: 5, next: { label: "Product", destination: { scopeType: "product", id: "product-1", locator: "Generic Product" }, knowledgeKind: "capability", requiresOwnerInput: true, recommendation: null } },
      },
    }));
    assert.match(confirmed, />Continue interview<\/button>/);
    assert.match(confirmed, /Continue to Product: Generic Product/);
    assert.doesNotMatch(confirmed, /automatically/i);

    const progression = {
      mode: "local_demo", status: "ready", queueDigest: "b".repeat(64), completedSlots: 2, totalSlots: 7,
      next: { label: "Market Play", destination: { scopeType: "market_play", id: "play-hostile", locator: `<img src=x onerror="attack()">` }, knowledgeKind: "market", requiresOwnerInput: true, recommendation: null },
    };
    const dispatched = [];
    const control = LocalInterviewContinueControl({ progression, onAdvance(command) { dispatched.push(command); } });
    const button = findReactElement(control, (element) => element.type === "button");
    assert.ok(button);
    button.props.onClick();
    assert.deepEqual(dispatched, [{ expectedQueueDigest: "b".repeat(64), operationKey: "interview-advance" }], "one explicit click dispatches exactly one bounded command");
    const pendingControl = LocalInterviewContinueControl({ progression, pendingAction: `advance:${progression.queueDigest}`, onAdvance() { assert.fail("pending control cannot dispatch"); } });
    const pendingButton = findReactElement(pendingControl, (element) => element.type === "button");
    assert.equal(pendingButton.props.disabled, true);
    assert.equal(pendingButton.props.children, "Opening next question…");
    const hostileHtml = renderToStaticMarkup(control);
    assert.match(hostileHtml, /&lt;img src=x onerror=&quot;attack\(\)&quot;&gt;/);
    assert.doesNotMatch(hostileHtml, /<img src=x/);
  } finally {
    await fixture.dispose();
  }
});

test("client rejects malformed local progression and question authority instead of exposing mutation controls", async () => {
  const fixture = await createD1Fixture("local-interview-client-validation");
  try {
    const { normalizeProjection } = await fixture.vite.ssrLoadModule(new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url).pathname);
    const node = { id: "company-1", type: "company", parentId: null, name: "Generic Company", revision: 1 };
    const base = {
      commercial: { path: [node], products: [], plays: [], profiles: [], offers: [] }, library: [], drift: [], replacements: [],
      interview: {
        status: "confirmed", displayName: "Owner", workspace: { id: "workspace-1", companyName: "Generic Company" },
        confirmed: { knowledgeVersionId: null, value: {}, confirmedAt: 1, auditEventId: "audit-1" },
        localProgression: { mode: "local_demo", status: "ready", queueDigest: "a".repeat(64), completedSlots: 1, totalSlots: 2, next: { label: "Product", destination: { scopeType: "product", id: "product-1", locator: "Product" }, knowledgeKind: "capability", requiresOwnerInput: true, recommendation: null } },
      },
    };
    assert.equal(normalizeProjection(base).interview.status, "confirmed");
    const malformed = [
      mutate(base, (value) => { value.interview.localProgression.queueDigest = "bad"; }),
      mutate(base, (value) => { value.interview.localProgression.completedSlots = 2; }),
      mutate(base, (value) => { value.interview.localProgression.next.recommendation = { excerpt: "forged" }; }),
      mutate(base, (value) => { value.interview.localProgression.extra = true; }),
      mutate(base, (value) => { value.interview.localProgression.status = "complete"; }),
      mutate(base, (value) => { value.interview.status = "active"; value.interview.session = { id: "session-1", revision: 1 }; value.interview.question = activeQuestion(); delete value.interview.confirmed; delete value.interview.localProgression; delete value.interview.question.requiresOwnerInput; }),
      mutate(base, (value) => { value.interview.status = "active"; value.interview.session = { id: "session-1", revision: 1 }; value.interview.question = { ...activeQuestion(), knowledgeKind: "" }; delete value.interview.confirmed; delete value.interview.localProgression; }),
    ];
    for (const value of malformed) assert.throws(() => normalizeProjection(value), /malformed_interview_projection/);
  } finally {
    await fixture.dispose();
  }
});

function dependencies(database, identity, enableLocalDemoProgression) {
  return {
    database, subjectPepper: PEPPER, pilotOwnerEmail: IDENTITY.email,
    csrfCookieMode: "local-demo", enableLocalDemoProgression,
    getIdentity: async () => identity,
  };
}

function mutation(body, cookie, extra = {}) {
  return new Request(`${ORIGIN}/api/interview`, {
    method: "POST",
    headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "x-prospector-intent": "interview-mutation", cookie, "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
}

function cookieFrom(response) {
  const header = response.headers.get("set-cookie") ?? "";
  assert.match(header, /^prospector-local-csrf=/);
  return header.split(";", 1)[0];
}

async function domainCounts(database) {
  return Object.fromEntries(await Promise.all(["interview_sessions", "interview_questions", "interview_answers", "interview_confirmations", "sources", "source_excerpts", "knowledge_proposals", "proposal_decisions", "knowledge_items", "knowledge_versions", "authority_commands", "audit_events", "offers"].map(async (table) => [table, await countRows(database, table)])));
}

function key(sequence) { return `01990001-0000-7000-8000-${String(sequence).padStart(12, "0")}`; }

function findReactElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children) { const found = findReactElement(child, predicate); if (found) return found; }
  return null;
}

function mutate(value, change) { const copy = structuredClone(value); change(copy); return copy; }
function activeQuestion() {
  return { id: "question-1", revision: 1, ordinal: 1, evidenceFindings: [], prerequisiteKnowledge: [], inferenceDetail: null, recommendationDetail: null, destination: null, requiresOwnerInput: true, knowledgeKind: "identity" };
}
