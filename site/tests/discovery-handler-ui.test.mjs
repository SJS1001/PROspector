import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

const CATEGORIES = [
  "Capabilities",
  "Limitations",
  "Delivery",
  "Proof",
  "Ownership",
  "Claim guardrails",
  "Source policy",
  "Market-discovery policy",
  "Default runner policy",
];
const BOUNDARY = "This is a Product-level market suggestion, not an accepted Customer Profile. Explore opens a Draft Market Play interview; it does not make a Profile Ready or start prospecting.";
const UNKNOWN = "Authoritative discovery results could not be verified. Reload this view.";
const READ_ERROR = "Authoritative Product discovery could not be loaded. No readiness, run, or proposal authority has changed. Reload this view.";

async function productionSource(relative, behavior) {
  try {
    return await readFile(new URL(relative, import.meta.url), "utf8");
  } catch {
    assert.fail(`missing production behavior: ${behavior}`);
  }
}

test("D-12 discovery HTTP boundary admits the configured owner before parsing and keeps denials neutral", async () => {
  const fixture = await createD1Fixture("discovery-handler-owner-boundary");
  try {
    await applyMigrations(fixture.database);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/discovery-handler.ts", import.meta.url).pathname);
    const pilot = await fixture.vite.ssrLoadModule(new URL("../domain/pilot-access.ts", import.meta.url).pathname);
    const commercial = await fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname);
    const ownerIdentity = { email: "owner@example.com", displayName: "Owner" };
    const dependencies = (identity) => ({
      database: fixture.database,
      subjectPepper: "test-only-discovery-handler-pepper-at-least-32-bytes",
      pilotOwnerEmail: "owner@example.com",
      getIdentity: async () => identity,
    });
    const request = (body, csrf = "", headers = {}) => new Request("https://prospector.example/api/discovery", {
      method: "POST",
      headers: {
        origin: "https://prospector.example",
        "sec-fetch-site": "same-origin",
        "x-prospector-intent": "discovery-mutation",
        "content-type": "application/json",
        ...(csrf ? { cookie: csrf } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    });

    for (const response of [
      await handler.handleDiscoveryGet(new Request("https://prospector.example/api/discovery"), dependencies(null)),
      await handler.handleDiscoveryPost(request({ action: "read_current_state" }), dependencies({ email: "outsider@example.com", displayName: "Outsider" })),
    ]) {
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "private_workspace_unavailable" });
    }

    const owner = await pilot.admitPilotOwner(ownerIdentity, "owner@example.com", "test-only-discovery-handler-pepper-at-least-32-bytes");
    await commercial.initializeCommercialModel(fixture.database, owner, { idempotencyKey: "0198b5c0-0000-7000-8000-000000009001" });
    const get = await handler.handleDiscoveryGet(new Request("https://prospector.example/api/discovery"), dependencies(ownerIdentity));
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("cache-control"), "no-store");
    assert.equal(get.headers.get("x-content-type-options"), "nosniff");
    const csrf = (get.headers.get("set-cookie") ?? "").split(";", 1)[0];
    const state = await get.json();
    assert.ok(Array.isArray(state.products));
    assert.equal(state.selectedProductId, null);

    await fixture.database.prepare(
      "UPDATE workspaces SET owner_subject = ? WHERE owner_subject = ?",
    ).bind(owner.legacySubject, owner.subject).run();
    const legacyGet = await handler.handleDiscoveryGet(new Request("https://prospector.example/api/discovery"), dependencies(ownerIdentity));
    assert.equal(legacyGet.status, 200, "the current principal must retain its owner workspace through the legacy subject binding");
    assert.ok(Array.isArray((await legacyGet.json()).products));

    assert.equal((await handler.handleDiscoveryPost(request({ action: "read_current_state" }, csrf, { origin: "https://attacker.example" }), dependencies(ownerIdentity))).status, 403);
    assert.equal((await handler.handleDiscoveryPost(request({ action: "unknown" }, csrf), dependencies(ownerIdentity))).status, 400);
    const replayToken = ((await handler.handleDiscoveryGet(new Request("https://prospector.example/api/discovery"), dependencies(ownerIdentity))).headers.get("set-cookie") ?? "").split(";", 1)[0];
    assert.equal((await handler.handleDiscoveryPost(request({ action: "submit_private_synthetic_proof", productId: "anything", idempotencyKey: "0198b5c0-0000-7000-8000-000000009002" }, replayToken), dependencies(ownerIdentity))).status, 409);
  } finally {
    await fixture.dispose();
  }
});

test("D-12 discovery handler is owner-first, closed, bounded, and replay-safe", async () => {
  const source = await productionSource(
    "../domain/discovery-handler.ts",
    "the owner-bound discovery HTTP handler does not exist",
  );
  assert.match(source, /authenticatedPrincipal\(dependencies\)[\s\S]{0,500}validateSameOriginMutation/);
  assert.match(source, /discovery-mutation/);
  assert.match(source, /8192/);
  assert.match(source, /consumeCsrfToken/);
  for (const action of [
    "read_product_readiness",
    "make_product_ready",
    "start_manual_discovery",
    "activate_private_synthetic_proof_authorization",
    "submit_private_synthetic_proof",
    "decide_proposal",
    "read_current_state",
  ]) assert.match(source, new RegExp(`\\b${action}\\b`), `closed dispatch must include ${action}`);
  assert.match(source, /private_workspace_unavailable/);
  assert.match(source, /cache-control["']?\s*[:,]\s*["']no-store/i);
  assert.match(source, /x-content-type-options["']?\s*[:,]\s*["']nosniff/i);
  assert.match(source, /409/);
  assert.match(source, /413/);
  assert.doesNotMatch(source, /oai-authenticated-user-email|request\.headers.*owner|authorizationText|providerCredential/i);
});

test("D-12 route is trusted-binding wiring only", async () => {
  const source = await productionSource(
    "../app/api/discovery/route.ts",
    "the discovery API route does not exist",
  );
  assert.match(source, /getChatGPTUser/);
  assert.match(source, /handleDiscoveryGet/);
  assert.match(source, /handleDiscoveryPost/);
  for (const binding of ["DB", "PILOT_OWNER_EMAIL", "OWNER_SUBJECT_PEPPER"])
    assert.match(source, new RegExp(`\\b${binding}\\b`));
  assert.doesNotMatch(source, /fetch\(|provider|runner|scheduler|workspaceId\s*[:=]|ownerSubject\s*[:=]/i);
});

test("D-12 private synthetic proof binds immutable server authority and one consumption winner", async () => {
  const source = await productionSource(
    "../domain/discovery-handler.ts",
    "the private synthetic-proof authorization boundary does not exist",
  );
  for (const boundField of [
    "workspace",
    "product",
    "expectedProductRevision",
    "reviewedSourceRevision",
    "migrationDigest",
    "fixtureDigest",
    "provenance",
    "evidenceReference",
    "expiresAt",
    "private-hosted-synthetic-proposal-proof",
  ]) assert.match(source, new RegExp(boundField, "i"), `authorization must bind ${boundField}`);
  assert.match(source, /operationDigest/i);
  assert.match(source, /consum/i);
  assert.doesNotMatch(source, /body\.(owner|workspace|fixtureDigest|migrationDigest|evidenceReference)|fetch\(|https?:\/\//i);
});

test("D-07/D-13 discovery workspace source preserves Product scope and fails closed", async () => {
  const [workspace, app] = await Promise.all([
    productionSource("../app/discovery/discovery-workspace.tsx", "the authoritative discovery workspace does not exist"),
    productionSource("../app/prospector-app.tsx", "the primary application shell does not exist"),
  ]);
  assert.match(app, /Knowledge[\s\S]*Market Discovery[\s\S]*Review Queue/);
  assert.match(app, /Pilot Status/);
  assert.match(workspace, /\/api\/discovery/);
  assert.match(workspace, /credentials:\s*["']same-origin["']/);
  assert.match(workspace, /cache:\s*["']no-store["']/);
  assert.match(workspace, /localStorage/);
  assert.match(workspace, /Product picker|Select a Product/i);
  assert.doesNotMatch(workspace, /selectedPlay|selectedProfile|dangerouslySetInnerHTML/);
  assert.match(workspace, new RegExp(UNKNOWN));
  assert.match(workspace, new RegExp(READ_ERROR));
  assert.match(workspace, /Reload this view/);
  assert.match(workspace, /private-hosted-synthetic-proposal-proof|non-network synthetic proof/i);
});

test("D-01 rendered readiness shows all nine server-derived states and immutable references", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    let readinessModule;
    try {
      readinessModule = await vite.ssrLoadModule(new URL("../app/discovery/product-readiness.tsx", import.meta.url).pathname);
    } catch {
      assert.fail("missing production behavior: the ProductReadinessView component does not exist");
    }
    const checklist = CATEGORIES.map((label, index) => ({
      category: label,
      status: index === 0 ? "confirmed" : "missing",
      condition: `${label} policy`,
      versions: index === 0 ? [{ id: "version-capability", digest: "a".repeat(64) }] : [],
    }));
    const html = renderToStaticMarkup(React.createElement(readinessModule.ProductReadinessView, {
      projection: {
        authority: "known",
        product: { id: "product-one", name: "ONE", revision: 7, lifecycle: "draft" },
        checklist,
        completeCount: 1,
        configuration: null,
        initialRun: null,
        monthlySchedule: null,
      },
      pending: null,
      onMakeReady() { throw new Error("disabled readiness must not submit"); },
      onDiscover() { throw new Error("disabled discovery must not submit"); },
    }));
    for (const label of CATEGORIES) assert.match(html, new RegExp(label));
    assert.match(html, /1 of 9 confirmed/);
    assert.match(html, /Complete every confirmed Product policy item before readiness can be activated/);
    assert.match(html, /<button(?=[^>]*disabled)[^>]*>Make Product Ready<\/button>/);
    assert.match(html, /Product: ONE/);
    assert.match(html, /version-capability/);
    assert.match(html, /Available after a Customer Profile is Ready in a later governed phase/);
  } finally {
    await vite.close();
  }
});

test("D-07 proposal rendering is capped, escaped, evidence-rich, and Draft-only", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    let proposalModule;
    try {
      proposalModule = await vite.ssrLoadModule(new URL("../app/discovery/proposal-cards.tsx", import.meta.url).pathname);
    } catch {
      assert.fail("missing production behavior: the ProposalCards component does not exist");
    }
    const proposals = Array.from({ length: 4 }, (_, index) => ({
      id: `proposal-${index + 1}`,
      version: 1,
      digest: `${index + 1}`.repeat(64),
      fingerprint: `${index + 5}`.repeat(64),
      status: "new",
      marketCategory: `Market ${index + 1}`,
      problemFamily: "Operating variability",
      problemMatch: "Bounded problem match",
      audience: "Industrial operators",
      likelyBuyer: "VP Operations",
      examples: ["Evidence example"],
      productFit: "Product fit rationale",
      risks: ["Proof remains synthetic"],
      evidence: [{ reference: "opaque:source", title: "Source", domain: "fixture.invalid", excerpt: "<img src=x onerror=alert(1)>", retrievedAt: 1_780_000_000_000 }],
      inference: "Labelled inference",
      collision: { status: "none" },
      cooldown: null,
      run: { id: "run-one", trigger: "manual" },
      configuration: { id: "configuration-one", digest: "f".repeat(64) },
      product: { id: "product-one", name: "ONE" },
      auditReference: "opaque:audit",
    }));
    const html = renderToStaticMarkup(React.createElement(proposalModule.ProposalCards, {
      authority: "known",
      proposals,
      triggerLabel: "manual",
      pendingProposalId: null,
      onDecision() { throw new Error("SSR must not dispatch decisions"); },
    }));
    assert.match(html, /3 of 3 proposals surfaced for this manual run/);
    assert.match(html, /Market 1/);
    assert.match(html, /Market 3/);
    assert.doesNotMatch(html, /Market 4/);
    assert.match(html, new RegExp(BOUNDARY));
    for (const label of ["Problem match", "Suggested context — not a Customer Profile", "Likely buyer", "Examples", "Product fit", "Risks / limitations", "Evidence", "Inference", "Explore this Market Play", "Defer proposal", "Dismiss proposal"])
      assert.match(html, new RegExp(label));
    assert.doesNotMatch(html, /<img(?:\s|>)/i);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /Ready Profile|Find prospects|Create prospect|Run profile/);
  } finally {
    await vite.close();
  }
});

test("D-07/D-13 authority-unknown UI exposes refresh only and no future-phase authority", async () => {
  const [source, readiness, proposals] = await Promise.all([
    productionSource("../app/discovery/discovery-workspace.tsx", "the fail-closed authority-unknown discovery view does not exist"),
    productionSource("../app/discovery/product-readiness.tsx", "the Product readiness controls do not exist"),
    productionSource("../app/discovery/proposal-cards.tsx", "the proposal decision controls do not exist"),
  ]);
  for (const forbiddenAction of [
    "Make Product Ready",
    "Discover markets",
    "Explore this Market Play",
    "Defer proposal",
    "Dismiss proposal",
  ]) assert.match(`${source}\n${readiness}\n${proposals}`, new RegExp(forbiddenAction));
  assert.match(source, /authorityUnknown|authority_unknown/);
  assert.match(source, /Reload this view/);
  assert.match(`${source}\n${readiness}\n${proposals}`, /Available after a Customer Profile is Ready in a later governed phase/);

  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const proposalModule = await vite.ssrLoadModule(
      new URL("../app/discovery/proposal-cards.tsx", import.meta.url).pathname,
    );
    const html = renderToStaticMarkup(React.createElement(proposalModule.ProposalCards, {
      authority: "unknown",
      proposals: [{ id: "untrusted-proposal", status: "new", marketCategory: "Untrusted market" }],
      triggerLabel: "manual",
      pendingProposalId: null,
      onDecision() { assert.fail("authority-unknown SSR must not expose a decision callback"); },
    }));
    assert.match(html, /could not be verified/i);
    assert.doesNotMatch(html, /<button\b/i, "authority-unknown proposal data must not expose decision controls");
    assert.doesNotMatch(html, /Untrusted market/);
  } finally {
    await vite.close();
  }
});
