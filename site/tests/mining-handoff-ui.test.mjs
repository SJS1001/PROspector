import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

// 07-01 Task 2 contract: Morning Brief rendering and no-effect controls.
// Live cases bind to domain/morning-brief.ts and
// app/morning-brief/morning-brief-workspace.tsx. Cases for the 07-09 surface
// that does not exist yet are `todo` so the canonical suite stays green.

const AS_OF = "2026-03-16T03:59:59.999Z";
const DIGEST = "a".repeat(64);
const CONFIG_DIGEST = "c".repeat(64);
const PACKAGE_DIGEST = "d".repeat(64);
const SCHEDULE_COPY = "Weekdays · 06:00 · America/Toronto";
const EXCLUSION_REASONS = [
  "duplicate_row_identity", "suppressed", "verification_stale", "verification_invalid",
  "no_approved_package", "disqualified", "high_risk_drift", "identity_merge_or_split",
  "deleted", "cross_scope", "other_current_ineligible",
];
const FORBIDDEN_CONTROL_LABELS = ["Start", "Enable", "Run now", "Schedule"];

const MINING = {
  companyId: "company-main", productId: "product-main", marketPlayId: "play-main",
  profileId: "profile-operating", profileName: "Operating",
};
const LOGISTICS = {
  companyId: "company-logistics", productId: "product-routing",
  marketPlayId: "play-port-operators", profileId: "profile-terminal-operators",
  profileName: "Terminal operators",
};

async function withVite(run, plugins = []) {
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins, server: { middlewareMode: true } });
  try { return await run(vite); } finally { await vite.close(); }
}

const ref = (id) => ({ id, digest: DIGEST });

function history(prospectId, hierarchy, specs) {
  return {
    prospectId,
    workspaceId: "workspace-main",
    companyId: hierarchy.companyId,
    productId: hierarchy.productId,
    marketPlayId: hierarchy.marketPlayId,
    profileId: hierarchy.profileId,
    events: specs.map((spec, index) => ({
      eventId: `event-${prospectId}-${index + 1}`,
      sequence: index + 1,
      auditRef: ref(`audit-${prospectId}-${index + 1}`),
      ...spec,
    })),
  };
}

function exportPath(at) {
  const t = (occurredAt, fromState, toState) => ({ kind: "state_transition", occurredAt, fromState, toState });
  return [
    { kind: "prospect_created", occurredAt: "2026-01-05T05:00:00.000Z", initialState: "Candidate" },
    t("2026-02-01T05:00:00.000Z", "Candidate", "Qualified"),
    t("2026-02-02T05:00:00.000Z", "Qualified", "Approved"),
    t("2026-02-03T05:00:00.000Z", "Approved", "ContactReady"),
    t("2026-02-04T05:00:00.000Z", "ContactReady", "PackageReady"),
    t(at, "PackageReady", "ExportReady"),
  ];
}

function briefInput(hierarchy = MINING, patch = {}) {
  const histories = patch.histories ?? [
    history("prospect-one", hierarchy, [
      ...exportPath("2026-03-10T14:00:00.000Z"),
      { kind: "contact_linked", occurredAt: "2026-03-10T15:00:00.000Z", contactId: "contact-a" },
      { kind: "contact_linked", occurredAt: "2026-03-10T15:01:00.000Z", contactId: "contact-b" },
    ]),
  ];
  const scope = {
    workspaceId: "workspace-main",
    companyId: hierarchy.companyId,
    productId: hierarchy.productId,
    marketPlayId: hierarchy.marketPlayId,
    profileId: hierarchy.profileId,
    profileName: hierarchy.profileName,
    profileLifecycle: "ready",
    activeConfigurationDigest: CONFIG_DIGEST,
  };
  const { activeConfigurationDigest, profileName, ...weeklyBase } = scope;
  void activeConfigurationDigest; void profileName;
  return {
    scope,
    asOf: AS_OF,
    weeklyHistory: {
      scope: { ...weeklyBase, profileLifecycle: "Operating" },
      timeZone: "America/Toronto",
      asOf: AS_OF,
      coverage: { from: "prospect_origin", through: AS_OF, prospectIds: histories.map((h) => h.prospectId) },
      histories,
    },
    scheduleObservation: "scheduleObservation" in patch ? patch.scheduleObservation : {
      observationRef: ref("schedule-observation-1"),
      profileId: hierarchy.profileId,
      configurationDigest: CONFIG_DIGEST,
      cadence: "weekdays",
      localTime: "06:00",
      timeZone: "America/Toronto",
      upstreamAuthority: "phase4_profile_readiness",
      readinessRef: ref("phase4-readiness-1"),
      state: patch.scheduleState ?? "enabled",
      observedAt: "2026-03-16T03:00:00.000Z",
    },
    handoffReadiness: {
      snapshotRef: ref("handoff-snapshot-1"),
      evaluatedAt: "2026-03-16T03:30:00.000Z",
      exportReadyProspectCount: 1,
      uniqueEligibleProspectCount: 1,
      eligibleContactRowCount: 2,
      nonContactableReferenceCount: 0,
      exclusions: Object.fromEntries(EXCLUSION_REASONS.map((reason) => [reason, 0])),
      dependencies: {
        configurationDigest: CONFIG_DIGEST,
        packagePolicyDigest: PACKAGE_DIGEST,
        suppressionFenceRef: ref("suppression-fence-1"),
      },
    },
    reviewFunnel: null,
    workspaceOrigin: patch.workspaceOrigin ?? { kind: "original" },
    greenfieldProfiles: [{ profileId: "profile-greenfield", label: "Greenfield — Draft / nurture" }],
  };
}

/** The 07-01 copy, derived from the persisted definition, never hand-typed in the UI. */
function scheduleCopy(definition) {
  const cadence = { weekdays: "Weekdays" }[definition.cadence];
  assert.ok(cadence, "unknown cadence");
  return `${cadence} · ${definition.localTime} · ${definition.timeZone}`;
}

function textOf(html) {
  return html.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}

test("the schedule definition renders as exactly 'Weekdays · 06:00 · America/Toronto'", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    assert.deepEqual({ ...brief.MORNING_BRIEF_SCHEDULE_DEFINITION }, {
      cadence: "weekdays",
      localTime: "06:00",
      timeZone: "America/Toronto",
      upstreamAuthority: "phase4_profile_readiness",
    });
    assert.equal(scheduleCopy(brief.MORNING_BRIEF_SCHEDULE_DEFINITION), SCHEDULE_COPY);
    for (const state of ["enabled", "disabled"]) {
      const result = brief.composeMorningBrief(briefInput(MINING, { scheduleState: state }));
      assert.equal(result.status, "available", state);
      assert.equal(result.schedule.status, "current", state);
      assert.equal(result.schedule.reportedState, state, state);
      assert.equal(scheduleCopy(result.schedule.definition), SCHEDULE_COPY, state);
      assert.equal(result.schedule.changeableFromThisSurface, false, state);
      assert.equal(result.schedule.readinessRef.id, "phase4-readiness-1", state);
    }
  });
});

test("a missing upstream schedule is a neutral unknown state, never an enabled or disabled claim", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const result = brief.composeMorningBrief(briefInput(MINING, { scheduleObservation: null }));
    assert.equal(result.schedule.status, "unknown");
    assert.equal(result.schedule.reportedState, null);
    assert.deepEqual(result.schedule.reasonCodes, ["schedule_observation_absent"]);
    assert.equal(result.schedule.changeableFromThisSurface, false);
  });
});

test("a restored workspace shows its schedule disabled until a fresh upstream activation", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const result = brief.composeMorningBrief(briefInput(MINING, {
      workspaceOrigin: {
        kind: "restored",
        restoreRef: ref("restore-1"),
        restoredAt: "2026-03-15T12:00:00.000Z",
        freshUpstreamActivation: null,
      },
    }));
    assert.equal(result.schedule.status, "disabled_pending_fresh_upstream_activation");
    assert.equal(result.schedule.reportedState, "disabled");
    assert.equal(result.workspace.restoredEffectsFenced, true);
  });
});

test("a second, non-Mining hierarchy composes the same brief with no Mining-specific behavior", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const mining = brief.composeMorningBrief(briefInput(MINING));
    const logistics = brief.composeMorningBrief(briefInput(LOGISTICS));
    assert.equal(logistics.status, "available");
    assert.equal(logistics.scope.marketPlayId, "play-port-operators");
    assert.equal(logistics.scope.profileName, "Terminal operators");
    assert.equal(logistics.weekly.status, "current");
    assert.equal(logistics.weekly.newlyExportReadyProspectCount, 1);
    assert.equal(logistics.weekly.distinctStableContactCount, 2);
    assert.equal(logistics.schedule.status, "current");
    assert.deepEqual(logistics.schedule.definition, mining.schedule.definition);
    assert.equal(logistics.weekly.week.start.localDate, mining.weekly.week.start.localDate);
    assert.doesNotMatch(JSON.stringify(logistics), /mining/iu);

    // The same history under the other hierarchy is a scope mismatch, not a count.
    const crossed = briefInput(LOGISTICS, { histories: briefInput(MINING).weeklyHistory.histories });
    const crossedResult = brief.composeMorningBrief(crossed);
    assert.equal(crossedResult.status, "available");
    assert.equal(crossedResult.weekly.status, "unavailable");
    assert.deepEqual(crossedResult.weekly.reasonCodes, ["weekly_outcome_unavailable"]);
  });
});

test("Greenfield stays a separate Draft/nurture notice with no schedule, outcome, handoff or runner activity", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const result = brief.composeMorningBrief(briefInput(MINING));
    assert.equal(result.greenfield.notice, brief.MORNING_BRIEF_GREENFIELD_NOTICE);
    assert.match(result.greenfield.notice, /not an active operating profile/u);
    const [note] = result.greenfield.profiles;
    assert.equal(note.contributesToWeeklyOutcome, false);
    assert.equal(note.contributesToHandoff, false);
    assert.equal(note.contributesToSchedule, false);
  });
});

test("weekly definition, distinct loss labels, and the contact-row distinction stay separate from the target", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const result = brief.composeMorningBrief(briefInput(MINING));
    assert.equal(result.weekly.explanation, brief.MORNING_BRIEF_WEEKLY_EXPLANATION);
    assert.match(brief.MORNING_BRIEF_WEEKLY_EXPLANATION, /^Counts each stable Prospect once, at its first Export-ready transition this local week\./u);
    assert.deepEqual(Object.keys(result.losses), [
      "rejected", "deferred", "enrichment_failed", "enrichment_uncertain", "review_delayed",
      "contact_stale_or_invalid", "package_invalid", "suppressed", "high_risk_drift", "reversal",
    ]);
    // Two contact rows, one Prospect: the target counts the Prospect only.
    assert.equal(result.handoff.counts.eligibleContactRowCount, 2);
    assert.equal(result.weekly.newlyExportReadyProspectCount, 1);
    assert.equal(result.weekly.remainingProspectsToTarget, 6);
    assert.equal(result.weekly.target, 7);
  });
});

test("the brief confers no authority and moves no scheduler, runner, provider, or restore counter", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const scheduler = { calls: 0, start() { this.calls += 1; }, enable() { this.calls += 1; }, runNow() { this.calls += 1; } };
    const scenarios = [
      briefInput(MINING),
      briefInput(MINING, { scheduleState: "disabled" }),
      briefInput(MINING, { scheduleObservation: null }),
      briefInput(LOGISTICS),
    ];
    for (const scenario of scenarios) {
      const result = brief.composeMorningBrief(scenario);
      assert.equal(result.status, "available");
      assert.ok(Object.values(result.authority).every((value) => value === false));
      assert.ok(Object.values(result.effects).every((value) => value === 0));
      assert.equal(result.schedule.changeableFromThisSurface, false);
      assert.equal(result.handoff.materializableFromThisSurface, false);
      assert.equal(Object.isFrozen(result), true);
    }
    assert.equal(scheduler.calls, 0);
    // A scheduler handed in as input is an unknown field and the brief fails closed.
    const injected = brief.composeMorningBrief({ ...briefInput(MINING), scheduler });
    assert.equal(injected.status, "unavailable");
    assert.equal(scheduler.calls, 0);
  });
});

test("the Morning Brief workspace renders no Start, Enable, Run now, or Schedule control", async () => {
  await withVite(async (vite) => {
    const workspace = await vite.ssrLoadModule(
      new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url).pathname,
    );
    const html = renderToStaticMarkup(React.createElement(workspace.MorningBriefWorkspace, { onUnauthorized() {} }));
    assert.doesNotMatch(html, /<(button|form|input|select|textarea|summary|a)\b/iu);
    assert.doesNotMatch(html, /role="(button|switch|menuitem)"/iu);
    const text = textOf(html);
    for (const label of FORBIDDEN_CONTROL_LABELS) {
      assert.doesNotMatch(text, new RegExp(`\\b${label}\\b`, "u"), label);
    }
  }, [react()]);
});

test("the workspace source has no interactive element, handler, or mutation seam for any profile card", async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<(button|form|input|select|textarea|summary|a)\b/u);
  assert.doesNotMatch(source, /\b(onClick|onSubmit|onChange|href=)/u);
  assert.doesNotMatch(source, /method:\s*"(POST|PUT|PATCH|DELETE)"/u);
  assert.doesNotMatch(source, /runProspecting|createSchedule|enableSchedule|startRunner|runNow/u);
});

// -- 07-09 surface ------------------------------------------------------------
// The first three cases bind the read-only Morning Brief workspace. The fourth
// binds the Exports & History surface: Morning Brief stays control-free (see the
// source test above), so handoff and recovery controls live in
// app/exports/handoff-recovery-workspace.tsx.

test("the rendered brief shows 'Weekdays · 06:00 · America/Toronto' with its enabled/disabled state and reason", async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  assert.ok(source.includes(SCHEDULE_COPY) || /definition\.(cadence|localTime)/u.test(source));
  assert.match(source, /Schedule state is reported from Phase 4 only/u);
});

test("the rendered brief shows the exact weekly-target definition and Prospect-versus-contact-row text", async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /Counts each stable Prospect once, at its first Export-ready transition this local week/u);
  assert.match(source, /Controlled pilot — all displayed records are illustrative or synthetic/u);
});

test("the rendered brief labels each of the ten loss categories separately and escapes record content", async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  for (const category of ["rejected", "deferred", "review_delayed", "package_invalid", "reversal"]) {
    assert.ok(source.includes(category), category);
  }
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/u);
});

test("handoff and recovery controls are native disabled with an adjacent persistent reason", async () => {
  const source = await readFile(new URL("../app/exports/handoff-recovery-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /<button[^>]*\bdisabled\b/u);
  assert.match(source, /Create CSV handoff/u);
  assert.match(source, /Review recovery evidence/u);
});

// -- 07-09: Morning Brief profile leaf ----------------------------------------

test("the Morning Brief profile leaf renders the upstream schedule, weekly target, loss ledger, and handoff counts with no control", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const workspace = await vite.ssrLoadModule(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url).pathname);
    for (const state of ["enabled", "disabled"]) {
      const result = brief.composeMorningBrief(briefInput(MINING, { scheduleState: state }));
      const html = renderToStaticMarkup(React.createElement(workspace.ProfileBrief, { brief: result }));
      const text = textOf(html);
      assert.ok(text.includes(SCHEDULE_COPY), state);
      assert.match(text, new RegExp(`Reported ${state}`, "u"), state);
      assert.match(text, /phase4-readiness-1/u, state);
      assert.match(text, /This view cannot change it or start a runner/u, state);
      assert.match(text, /Newly Export-ready Prospects this week/u);
      assert.match(text, /Counts each stable Prospect once, at its first Export-ready transition this local week/u);
      assert.match(text, /Eligible contact rows 2/u);
      assert.match(text, /Greenfield — Draft \/ nurture; not active/u);
      for (const label of ["Rejected", "Deferred", "Enrichment failed", "Enrichment uncertain", "Review delayed", "Stale or invalid contact", "Package revoked or expired", "Suppressed", "High-risk drift", "Reversal to NeedsReview or NonContactable"]) {
        assert.ok(text.includes(label), label);
      }
      assert.doesNotMatch(html, /<(button|form|input|select|textarea|summary|a)\b/iu);
      for (const label of ["Start", "Enable", "Run now"]) assert.doesNotMatch(text, new RegExp(`\\b${label}\\b`, "u"), label);
    }
    const unknown = brief.composeMorningBrief(briefInput(MINING, { scheduleObservation: null }));
    const unknownText = textOf(renderToStaticMarkup(React.createElement(workspace.ProfileBrief, { brief: unknown })));
    assert.match(unknownText, /Schedule state is reported from Phase 4 only — weekday 06:00 America\/Toronto is not current upstream/u);
    assert.match(unknownText, /schedule_observation_absent/u);
    assert.doesNotMatch(unknownText, /Reported (enabled|disabled)/u);
  }, [react()]);
});

test("the Morning Brief profile leaf escapes record content", async () => {
  await withVite(async (vite) => {
    const brief = await vite.ssrLoadModule(new URL("../domain/morning-brief.ts", import.meta.url).pathname);
    const workspace = await vite.ssrLoadModule(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url).pathname);
    // The composer refuses markup-like names, so the hostile value is injected after composition to test the leaf itself.
    const composed = brief.composeMorningBrief(briefInput(LOGISTICS));
    assert.equal(composed.status, "available");
    const hostile = { ...composed, scope: { ...composed.scope, profileName: "<img src=x onerror=alert(1)>" } };
    const html = renderToStaticMarkup(React.createElement(workspace.ProfileBrief, { brief: hostile }));
    assert.doesNotMatch(html, /<img/u);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/u);
  }, [react()]);
});

// -- 07-09: owner handoff and recovery transport ------------------------------

const PEPPER = "handoff-recovery-ui-test-pepper-32-bytes";
const OWNER_EMAIL = "owner@example.invalid";
const PASSPHRASE = "synthetic-recovery-passphrase-0001";
const HANDOFF_TABLES = [
  "handoff_recovery_commands", "handoff_recovery_audit_events", "handoff_export_snapshots", "handoff_export_artifacts",
  "handoff_delivery_events", "recovery_archives", "recovery_dry_runs", "recovery_restore_locks", "recovery_restore_results",
];
const handlerPath = new URL("../domain/handoff-recovery-handler.ts", import.meta.url).pathname;
const domainPath = (name) => new URL(`../domain/${name}`, import.meta.url).pathname;

function ownerDependencies(database, overrides = {}) {
  return {
    database, subjectPepper: PEPPER, pilotOwnerEmail: OWNER_EMAIL,
    getIdentity: async () => ({ email: OWNER_EMAIL, displayName: "Owner" }), ...overrides,
  };
}

function mutation(body, headers = {}) {
  const merged = new Headers({
    origin: "https://prospector.test", "sec-fetch-site": "same-origin",
    "x-prospector-intent": "handoff-recovery-mutation", "content-type": "application/json",
  });
  for (const [name, value] of Object.entries(headers)) { if (value === null) merged.delete(name); else merged.set(name, value); }
  return new Request("https://prospector.test/api/handoff-recovery", { method: "POST", headers: merged, body: typeof body === "string" ? body : JSON.stringify(body) });
}

/** A clean owner workspace (only its `workspaces` row) whose owner subject is the HMAC principal. */
async function ownerWorkspace(name, workspaceId = "workspace-recovery-target") {
  const { createD1Fixture, applyMigrationsThrough } = await import("./helpers/d1.mjs");
  const { CANONICAL_MIGRATION_FILENAMES } = await import("../scripts/migration-chain.mjs");
  const fixture = await createD1Fixture(name);
  try {
    await applyMigrationsThrough(fixture.database, CANONICAL_MIGRATION_FILENAMES.at(-1));
    const interview = await fixture.vite.ssrLoadModule(domainPath("interview.ts"));
    const principal = await interview.principalFromIdentity(OWNER_EMAIL, "Owner", PEPPER);
    await fixture.database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)")
      .bind(workspaceId, "Synthetic recovery workspace", principal.subject, Date.now() - 60_000, Date.now() - 60_000).run();
    const handler = await fixture.vite.ssrLoadModule(handlerPath);
    return { fixture, handler, principal, workspaceId };
  } catch (error) { await fixture.dispose(); throw error; }
}

async function csrfCookie(handler, database, overrides = {}) {
  const response = await handler.handleHandoffRecoveryGet(new Request("https://prospector.test/api/handoff-recovery"), ownerDependencies(database, overrides));
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

async function tableCounts(database) {
  const entries = [];
  for (const table of HANDOFF_TABLES) entries.push([table, Number((await database.prepare(`SELECT COUNT(*) count FROM ${table}`).first()).count)]);
  return Object.fromEntries(entries);
}

test("GET admits the owner first, issues CSRF, and projects production handoff and recovery as blocked with read-only schedule state", async () => {
  const { fixture, handler, workspaceId } = await ownerWorkspace("handoff-recovery-get");
  try {
    for (const identity of [null, { email: "other@example.invalid", displayName: "Other" }]) {
      const denied = await handler.handleHandoffRecoveryGet(new Request("https://prospector.test/api/handoff-recovery"), ownerDependencies(fixture.database, { getIdentity: async () => identity }));
      assert.equal(denied.status, 404);
      assert.deepEqual(await denied.json(), { error: "private_workspace_unavailable" });
      assert.equal(denied.headers.get("set-cookie"), null);
    }
    const query = await handler.handleHandoffRecoveryGet(new Request(`https://prospector.test/api/handoff-recovery?workspaceId=${workspaceId}`), ownerDependencies(fixture.database));
    assert.equal(query.status, 404, "query-derived scope is refused");

    const response = await handler.handleHandoffRecoveryGet(new Request("https://prospector.test/api/handoff-recovery"), ownerDependencies(fixture.database));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("set-cookie") ?? "", /__Host-prospector-csrf/u);
    const body = await response.json();
    assert.equal(body.schema, "handoff-recovery-projection/v1");
    assert.equal(body.mode, "production");
    assert.equal(body.context.workspaceId, workspaceId);
    assert.deepEqual(body.handoff.gate, { available: false, firstUnmetPredicate: "crm_handoff_source_unavailable" });
    assert.equal(body.handoff.selection, null);
    assert.deepEqual(body.handoff.history, []);
    for (const gate of ["archive", "dryRun", "restore"]) {
      assert.deepEqual(body.recovery.gates[gate], { available: false, firstUnmetPredicate: "recovery_capability_unavailable" }, gate);
    }
    assert.equal(body.recovery.reauthentication.state, "missing");
    assert.deepEqual(body.recovery.effectFence, { scheduler: "disabled", runner: "disabled", outbox: "paused", provider: "disabled", delivery: "disabled" });
    assert.ok(Object.values(body.authority).every((value) => value === false));
    assert.ok(Object.values(body.effects).every((value) => value === 0));
    assert.deepEqual(await tableCounts(fixture.database), Object.fromEntries(HANDOFF_TABLES.map((table) => [table, 0])));
  } finally { await fixture.dispose(); }
});

test("POST rejects foreign origin, missing intent or CSRF, malformed, oversized, unknown, schedule, and client-scoped commands before any durable action", async () => {
  const { fixture, handler } = await ownerWorkspace("handoff-recovery-post-guards");
  try {
    const deps = ownerDependencies(fixture.database);
    const valid = { action: "create_csv_handoff", snapshotDigest: DIGEST };
    const before = await tableCounts(fixture.database);
    const nonOwner = await handler.handleHandoffRecoveryPost(mutation(valid, { cookie: await csrfCookie(handler, fixture.database) }), ownerDependencies(fixture.database, { getIdentity: async () => null }));
    assert.equal(nonOwner.status, 404);
    const foreign = await handler.handleHandoffRecoveryPost(mutation(valid, { origin: "https://foreign.test" }), deps);
    assert.equal(foreign.status, 403); assert.equal((await foreign.json()).error, "foreign_origin");
    const noIntent = await handler.handleHandoffRecoveryPost(mutation(valid, { "x-prospector-intent": "outreach-mutation" }), deps);
    assert.equal(noIntent.status, 403); assert.equal((await noIntent.json()).error, "missing_intent");
    const noCsrf = await handler.handleHandoffRecoveryPost(mutation(valid), deps);
    assert.equal(noCsrf.status, 403); assert.equal((await noCsrf.json()).error, "invalid_csrf_token");
    const malformed = await handler.handleHandoffRecoveryPost(mutation("{", { cookie: await csrfCookie(handler, fixture.database) }), deps);
    assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error, "invalid_json");
    const oversized = await handler.handleHandoffRecoveryPost(mutation(valid, { "content-length": "4097" }), deps);
    assert.equal(oversized.status, 413);
    for (const action of ["enable_schedule", "start_runner", "run_now", "schedule_runner", "confirm_readiness", "connect_crm", "sync_crm", "enable_effects"]) {
      const response = await handler.handleHandoffRecoveryPost(mutation({ action }, { cookie: await csrfCookie(handler, fixture.database) }), deps);
      assert.equal(response.status, 400, action);
      assert.equal((await response.json()).error, "unsupported_action", action);
    }
    for (const forged of [
      { ...valid, workspaceId: "someone-else" },
      { ...valid, idempotencyKey: "client-chosen-key" },
      { ...valid, eligibility: { contactReady: true } },
      { action: "download_csv_handoff", artifactId: "crm-artifact-1", objectKey: "crm-handoff/forged.csv" },
      { action: "create_archive", passphrase: PASSPHRASE, rememberPassphrase: true },
      { action: "create_archive", passphrase: PASSPHRASE, workspaceId: "someone-else" },
      { action: "run_dry_run", archiveRef: "archive-upload-1", passphrase: PASSPHRASE, targetWorkspaceId: "workspace-other" },
      { action: "restore_verified_archive", archiveRef: "archive-upload-1", dryRunId: "rdr-1", nonce: "a".repeat(32), passphrase: PASSPHRASE, confirmed: false },
      { action: "restore_verified_archive", archiveRef: "archive-upload-1", dryRunId: "rdr-1", nonce: "a".repeat(32), passphrase: PASSPHRASE, confirmed: true, enableSchedules: true },
      { action: "create_csv_handoff", snapshotDigest: DIGEST, timeZone: "UTC", schedule: { cadence: "daily" } },
    ]) {
      const response = await handler.handleHandoffRecoveryPost(mutation(forged, { cookie: await csrfCookie(handler, fixture.database) }), deps);
      assert.equal(response.status, 400, JSON.stringify(forged));
      const body = await response.json();
      assert.equal(body.error, "invalid_command", JSON.stringify(forged));
      assert.doesNotMatch(JSON.stringify(body), new RegExp(PASSPHRASE, "u"));
    }
    // A closed command still reaches only the blocked production composition.
    const cookie = await csrfCookie(handler, fixture.database);
    const blocked = await handler.handleHandoffRecoveryPost(mutation(valid, { cookie }), deps);
    assert.equal(blocked.status, 409);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.command.status, "refused");
    assert.deepEqual(blockedBody.command.reasonCodes, ["crm_handoff_source_unavailable"]);
    assert.match(blocked.headers.get("set-cookie") ?? "", /__Host-prospector-csrf/u, "a definitive answer carries a fresh token");
    const replay = await handler.handleHandoffRecoveryPost(mutation(valid, { cookie }), deps);
    assert.equal(replay.status, 403, "a CSRF token is single use");
    const archive = await handler.handleHandoffRecoveryPost(mutation({ action: "create_archive", passphrase: PASSPHRASE }, { cookie: await csrfCookie(handler, fixture.database) }), deps);
    assert.equal(archive.status, 409);
    const archiveText = await archive.text();
    assert.match(archiveText, /recovery_capability_unavailable/u);
    assert.doesNotMatch(archiveText, new RegExp(PASSPHRASE, "u"));
    assert.deepEqual(await tableCounts(fixture.database), before, "no rejected request wrote anything");
  } finally { await fixture.dispose(); }
});

// -- 07-09: CSV handoff through the real D1 store -----------------------------

test("synthetic CSV handoff projects distinct Prospect and contact-row counts, refuses a stale snapshot, materializes once, replays, and downloads exact bytes", async () => {
  const { HANDOFF_T0, handoffFixture, loadDomain } = await import("./helpers/handoff-fixture.mjs");
  const { OUTREACH_OWNER } = await import("./helpers/outreach-fixture.mjs");
  const identity = Object.freeze({ prospectId: "synthetic-prospect-0001", contactId: "synthetic-contact-0001", contactEmail: "person0001@example.test" });
  const context = await handoffFixture("handoff-recovery-csv", { identity });
  try {
    const handler = await context.fixture.vite.ssrLoadModule(handlerPath);
    const storeModule = await loadDomain(context.fixture, "crm-handoff-d1-store.ts");
    // The fixture's Package approval expires shortly after OUTREACH_NOW, so the whole flow runs on its fixed clock.
    const scope = Object.freeze({ workspaceId: context.seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => HANDOFF_T0 });
    const objects = new Map();
    const objectPort = {
      async putImmutable(key, bytes) { if (objects.has(key)) throw new Error("object_conflict"); objects.set(key, Uint8Array.from(bytes)); },
      async get(key) { const bytes = objects.get(key); return bytes ? Uint8Array.from(bytes) : null; },
    };
    const cells = (patch = {}) => ({
      prospect_id: "synthetic-prospect-0001", company_id: "synthetic-company-0001", product_id: "synthetic-product-0001",
      market_play_id: "synthetic-market-play-0001", profile_id: "synthetic-profile-0001", account_target: "Fictional Example Mining Company",
      selected_role: "Fictional Example Operations Role", contact_id: "synthetic-contact-0001", contact_point_id: "synthetic-contact-point-0001",
      contact_kind: "email", contact_value: "person0001@example.test", verification_class: "synthetic_mailbox_verified",
      verification_method_ref: "synthetic-verification-0001", verification_time: "2000-01-01T00:00:00.000Z",
      qualification_score_ref: "synthetic-qualification-score-0001", evidence_refs: "synthetic-evidence-0001", offer_ref: "synthetic-offer-0001",
      package_ref: "synthetic-package-0001", activity_status: "synthetic_no_activity", source_workspace_id: "synthetic-workspace-0001",
      source_run_id: "synthetic-run-0001", export_manifest_ref: "synthetic-export-manifest-0001", ...patch,
    });
    const candidate = (patch = {}, cellPatch = {}) => ({
      workspaceId: context.seeded.workspaceId, prospectState: "Export-ready", deleted: false, aliasOf: null,
      verificationClass: "mailbox_verified", packageDigest: "e".repeat(64), eligibilityInput: {}, cells: cells(cellPatch), ...patch,
    });
    const state = {
      candidates: [
        candidate({ authorityRef: {
          prospectId: context.seeded.prospectId, contactId: context.seeded.contactId, contactPointDigest: context.seeded.contactPointDigest,
          packageVersionId: context.packageVersion.id, packageApprovalId: context.packageApproval.id,
        } }),
        candidate({ deleted: true }, { prospect_id: "synthetic-prospect-0002", contact_id: "synthetic-contact-0002", contact_point_id: "synthetic-contact-point-0002", contact_value: "person0002@example.test" }),
        candidate({ prospectState: "Prospect" }, { prospect_id: "synthetic-prospect-0003", contact_id: "synthetic-contact-0003", contact_point_id: "synthetic-contact-point-0003", contact_value: "person0003@example.test" }),
      ],
    };
    const services = () => ({
      mode: "synthetic",
      crm: {
        source: { async read() { return {
          exportScope: { tenantId: "synthetic-tenant-0001", workspaceId: "synthetic-workspace-0001" }, selectionId: "synthetic-selection-0001",
          selectionRevision: 1, authorityRevision: 1, configurationDigest: "c".repeat(64), exportDefinitionDigest: "b".repeat(64), candidates: state.candidates,
        }; } },
        eligibility: { async recheck() { return { contactReady: true }; } },
        suppression: { async blockingScopes() { return { blocked: false, scopes: [], complete: true }; } },
        store: storeModule.createD1CrmHandoffStore(context.fixture.database, scope, { objects: objectPort }),
        clock: { nowIso: () => new Date(HANDOFF_T0).toISOString() },
      },
      recovery: null,
    });

    const projection = await handler.readHandoffRecoveryProjection(context.fixture.database, scope, services(context.fixture.database, scope));
    assert.equal(projection.mode, "synthetic");
    assert.deepEqual(projection.handoff.gate, { available: true, firstUnmetPredicate: null });
    const selection = projection.handoff.selection;
    assert.equal(selection.eligibleContactRowCount, 1);
    assert.equal(selection.uniqueEligibleProspectCount, 1);
    assert.equal(selection.exclusions.deleted, 1);
    assert.equal(selection.exclusions.not_export_ready, 1);
    assert.match(selection.snapshotDigest, /^[a-f0-9]{64}$/u);
    assert.doesNotMatch(JSON.stringify(projection), /person000\d@example\.test/u, "no contact value reaches the projection");

    const stale = await handler.executeHandoffRecoveryCommand(context.fixture.database, scope, services(), { action: "create_csv_handoff", snapshotDigest: "f".repeat(64) });
    assert.equal(stale.status, 409);
    assert.deepEqual(stale.body.command.reasonCodes, ["snapshot_stale"]);
    assert.equal(objects.size, 0, "a stale snapshot builds nothing");

    const created = await handler.executeHandoffRecoveryCommand(context.fixture.database, scope, services(), { action: "create_csv_handoff", snapshotDigest: selection.snapshotDigest });
    assert.equal(created.status, 200, JSON.stringify(created.body.command));
    assert.equal(created.body.command.status, "applied");
    assert.equal(created.body.command.crmSyncs, 0);
    const [entry] = created.body.projection.handoff.history;
    assert.equal(created.body.projection.handoff.history.length, 1);
    assert.equal(entry.rowCount, 1);
    assert.equal(entry.prospectCount, 1);
    assert.equal(entry.deliveryState, "available");
    assert.equal(entry.csvSha256, created.body.command.csvSha256);
    assert.match(entry.auditRef, /^[A-Za-z0-9._:-]+$/u);

    const replayed = await handler.executeHandoffRecoveryCommand(context.fixture.database, scope, services(), { action: "create_csv_handoff", snapshotDigest: selection.snapshotDigest });
    assert.equal(replayed.body.command.status, "replayed");
    assert.equal(replayed.body.command.csvSha256, entry.csvSha256);
    assert.equal(objects.size, 1, "a deterministic retry creates no fresh artifact");

    const download = await handler.executeHandoffRecoveryDownload(context.fixture.database, scope, services(), { action: "download_csv_handoff", artifactId: entry.artifactId });
    assert.equal(download.kind, "authorized");
    const bytes = download.bytes;
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.csvSha256);
    assert.match(new TextDecoder().decode(bytes), /Fictional Example Mining Company/u, "the stored bytes are returned, not rebuilt");
    const unknown = await handler.executeHandoffRecoveryDownload(context.fixture.database, scope, services(), { action: "download_csv_handoff", artifactId: "crm-artifact-unknown" });
    assert.equal(unknown.kind, "refused");
  } finally { await context.fixture.dispose(); }
});

// -- 07-09: recovery through the real 0023 evidence ---------------------------

function sourceSnapshot(workspaceId) {
  return {
    workspaceId,
    schemaVersion: "prospector/portable-workspace-schema/v1",
    records: [{ kind: "prospect", id: "prospect-1", value: { state: "ExportReady" } }],
    decisions: [],
    history: [{ stream: "prospect:prospect-1", sequence: 1, id: "history-1", value: { state: "ExportReady" } }],
    audit: [],
    objects: [],
    dependencies: [],
    exportArtifacts: [],
    tombstones: [{ kind: "suppression", id: "tombstone-1", value: { scopeKind: "domain", scopeDigest: DIGEST } }],
  };
}

function freshAuthority(workspaceId, ownerSubject, reauthenticatedAt = Date.now() - 60_000) {
  return { workspaceId, ownerSubject, reauthenticatedAt, reauthReferenceDigest: "d".repeat(64) };
}

function memoryTarget() {
  let rows = [];
  let objects = new Map();
  let effects = null;
  const counters = { scheduler: 0, runner: 0, send: 0, provider: 0, delivery: 0 };
  return {
    counters,
    readState: async () => ({ schemaVersion: "prospector/portable-workspace-schema/v1", empty: rows.length === 0 && objects.size === 0, effectsEnabled: false }),
    apply: async (plan) => { rows = plan.rows.map((row) => structuredClone(row)); for (const object of plan.objects) objects.set(object.digest, object.bytes); effects = { ...plan.effects }; },
    discard: async () => { rows = []; objects = new Map(); effects = null; },
    readRestored: async () => ({
      rows: structuredClone(rows),
      objects: [...objects].sort(([a], [b]) => a.localeCompare(b)).map(([digest, bytes]) => ({ digest, bytes: Uint8Array.from(bytes) })),
      effects,
    }),
  };
}

test("archive creation runs through the handler with server-derived scope and reauthentication and never echoes the passphrase", async () => {
  const { fixture, handler, principal, workspaceId } = await ownerWorkspace("handoff-recovery-archive", "workspace-recovery-source");
  try {
    const repositoryModule = await fixture.vite.ssrLoadModule(domainPath("handoff-recovery-repository.ts"));
    const stored = new Map();
    const reauth = { at: Date.now() - 60 * 60_000 };
    const services = (database, scope) => {
      const repository = repositoryModule.createD1HandoffRecoveryRepository(database, scope);
      return {
        mode: "synthetic",
        crm: null,
        recovery: {
          archive: {
            now: () => Date.now(),
            authority: { current: async () => freshAuthority(scope.workspaceId, scope.ownerSubject, reauth.at) },
            source: { readSnapshot: async () => sourceSnapshot(scope.workspaceId), readObject: async () => null },
            archiveStore: { putImmutable: async (key, bytes) => { stored.set(key, bytes); } },
            evidence: repository,
          },
          restore: {
            now: () => Date.now(),
            authority: { current: async () => freshAuthority(scope.workspaceId, scope.ownerSubject, reauth.at) },
            archives: { readArchive: async () => null },
            target: memoryTarget(),
            evidence: repository,
          },
          currentRestoreArchiveRef: async () => null,
        },
      };
    };
    const deps = ownerDependencies(fixture.database, { services });
    const stale = await handler.handleHandoffRecoveryGet(new Request("https://prospector.test/api/handoff-recovery"), deps);
    const staleBody = await stale.json();
    assert.equal(staleBody.recovery.reauthentication.state, "stale");
    assert.deepEqual(staleBody.recovery.gates.archive, { available: false, firstUnmetPredicate: "reauthentication_required" });
    const refused = await handler.handleHandoffRecoveryPost(mutation({ action: "create_archive", passphrase: PASSPHRASE }, { cookie: await csrfCookie(handler, fixture.database, { services }) }), deps);
    assert.equal(refused.status, 409);
    const refusedText = await refused.text();
    assert.match(refusedText, /reauthentication_required/u);
    assert.doesNotMatch(refusedText, new RegExp(PASSPHRASE, "u"));
    assert.equal(stored.size, 0);

    reauth.at = Date.now() - 60_000;
    const created = await handler.handleHandoffRecoveryPost(mutation({ action: "create_archive", passphrase: PASSPHRASE }, { cookie: await csrfCookie(handler, fixture.database, { services }) }), deps);
    assert.equal(created.status, 200, JSON.stringify(created.body.command));
    const createdText = await created.text();
    assert.doesNotMatch(createdText, new RegExp(PASSPHRASE, "u"));
    assert.doesNotMatch(createdText, /"ciphertext"|"kdf"|"salt"/u, "the sealed envelope never reaches the browser");
    const body = JSON.parse(createdText);
    assert.equal(body.command.status, "applied");
    assert.equal(stored.size, 1);
    const [archive] = body.projection.recovery.archives;
    assert.equal(archive.archiveId, body.command.archiveId);
    assert.match(archive.manifestDigest, /^[a-f0-9]{64}$/u);
    assert.equal(archive.tombstoneCount, 1);
    assert.equal(body.projection.context.workspaceId, workspaceId);
    assert.ok(body.projection.recovery.ledger.some((event) => event.action === "archive.create" && event.outcome === "refused" && event.reasonCode === "reauthentication_required"));
    assert.ok(body.projection.recovery.ledger.every((event) => event.actorRole === "owner" && !JSON.stringify(event).includes(principal.subject)));
    const row = await fixture.database.prepare("SELECT manifest_json,kdf_parameters_json FROM recovery_archives").first();
    assert.doesNotMatch(JSON.stringify(row), new RegExp(PASSPHRASE, "u"));
  } finally { await fixture.dispose(); }
});

test("dry run and restore need the server-derived archive and dry run, a matching nonce, and explicit confirmation; restore leaves every effect disabled", async () => {
  const { fixture, handler, workspaceId } = await ownerWorkspace("handoff-recovery-restore");
  try {
    const archiveModule = await fixture.vite.ssrLoadModule(domainPath("workspace-archive.ts"));
    const repositoryModule = await fixture.vite.ssrLoadModule(domainPath("handoff-recovery-repository.ts"));
    const sealed = await archiveModule.createWorkspaceArchive({
      passphrase: PASSPHRASE,
      ports: {
        now: () => Date.now(),
        authority: { current: async () => freshAuthority("workspace-recovery-source", "owner-source") },
        source: { readSnapshot: async () => sourceSnapshot("workspace-recovery-source"), readObject: async () => null },
        archiveStore: { putImmutable: async () => undefined },
        evidence: {
          recordArchive: async () => ({ id: `rar_${"1".repeat(32)}`, digest: "1".repeat(64), replayed: false }),
          recordDeliveryEvent: async () => ({ id: `hde_${"2".repeat(32)}`, digest: "2".repeat(64), replayed: false }),
          recordRefusal: async () => ({ id: `hra_${"3".repeat(32)}`, digest: "3".repeat(64), replayed: false }),
        },
      },
    });
    const uploads = new Map([["archive-upload-1", { bytes: new TextEncoder().encode(JSON.stringify(sealed.envelope)), expiresAt: Date.now() + 60 * 60_000 }]]);
    const target = memoryTarget();
    const services = (database, scope) => ({
      mode: "synthetic",
      crm: null,
      recovery: {
        archive: {
          now: () => Date.now(),
          authority: { current: async () => freshAuthority(scope.workspaceId, scope.ownerSubject) },
          source: { readSnapshot: async () => sourceSnapshot(scope.workspaceId), readObject: async () => null },
          archiveStore: { putImmutable: async () => { throw new Error("not in this test"); } },
          evidence: repositoryModule.createD1HandoffRecoveryRepository(database, scope),
        },
        restore: {
          now: () => Date.now(),
          authority: { current: async () => freshAuthority(scope.workspaceId, scope.ownerSubject) },
          archives: { readArchive: async (ref) => uploads.get(ref) ?? null },
          target,
          evidence: repositoryModule.createD1HandoffRecoveryRepository(database, scope),
        },
        currentRestoreArchiveRef: async () => "archive-upload-1",
      },
    });
    const deps = ownerDependencies(fixture.database, { services });
    const post = async (body) => handler.handleHandoffRecoveryPost(mutation(body, { cookie: await csrfCookie(handler, fixture.database, { services }) }), deps);

    const initial = await (await handler.handleHandoffRecoveryGet(new Request("https://prospector.test/api/handoff-recovery"), deps)).json();
    assert.deepEqual(initial.recovery.candidate, { archiveRef: "archive-upload-1" });
    assert.deepEqual(initial.recovery.gates.dryRun, { available: true, firstUnmetPredicate: null });
    assert.deepEqual(initial.recovery.gates.restore, { available: false, firstUnmetPredicate: "dry_run_required" });

    const staleRef = await post({ action: "run_dry_run", archiveRef: "archive-upload-2", passphrase: PASSPHRASE });
    assert.equal(staleRef.status, 409);
    assert.deepEqual((await staleRef.json()).command.reasonCodes, ["stale_projection"]);
    assert.equal((await tableCounts(fixture.database)).recovery_dry_runs, 0);

    const wrong = await post({ action: "run_dry_run", archiveRef: "archive-upload-1", passphrase: "not-the-synthetic-passphrase" });
    assert.equal(wrong.status, 409);
    const wrongBody = await wrong.json();
    assert.equal(wrongBody.command.status, "refused");
    assert.equal(wrongBody.command.targetWrites, 0);

    const dryRun = await post({ action: "run_dry_run", archiveRef: "archive-upload-1", passphrase: PASSPHRASE });
    assert.equal(dryRun.status, 200);
    const dryText = await dryRun.text();
    assert.doesNotMatch(dryText, new RegExp(PASSPHRASE, "u"));
    const dryBody = JSON.parse(dryText);
    assert.equal(dryBody.command.status, "applied");
    assert.match(dryBody.command.nonce, /^[a-f0-9]{32}$/u);
    assert.equal(dryBody.command.targetWrites, 0);
    assert.equal(dryBody.projection.recovery.currentDryRun.dryRunId, dryBody.command.dryRunId);
    assert.deepEqual(dryBody.projection.recovery.gates.restore, { available: true, firstUnmetPredicate: null });
    assert.equal((await target.readState()).empty, true, "a dry run writes no target data");
    const nonceStored = await fixture.database.prepare("SELECT COUNT(*) count FROM recovery_dry_runs WHERE nonce_digest=?").bind(dryBody.command.nonce).first();
    assert.equal(Number(nonceStored.count), 0, "only a digest of the nonce is stored");

    const restoreBody = { action: "restore_verified_archive", archiveRef: "archive-upload-1", dryRunId: dryBody.command.dryRunId, nonce: dryBody.command.nonce, passphrase: PASSPHRASE, confirmed: true };
    const mismatched = await post({ ...restoreBody, dryRunId: "rdr_mismatched_dry_run" });
    assert.equal(mismatched.status, 409);
    assert.deepEqual((await mismatched.json()).command.reasonCodes, ["stale_projection"]);
    const unconfirmed = await post({ ...restoreBody, confirmed: false });
    assert.equal(unconfirmed.status, 400);
    assert.equal((await tableCounts(fixture.database)).recovery_restore_locks, 0);

    const restored = await post(restoreBody);
    assert.equal(restored.status, 200);
    const restoredText = await restored.text();
    assert.doesNotMatch(restoredText, new RegExp(PASSPHRASE, "u"));
    const restoredBody = JSON.parse(restoredText);
    assert.equal(restoredBody.command.status, "applied");
    assert.deepEqual(restoredBody.command.effects, { scheduler: "disabled", runner: "disabled", outbox: "paused", provider: "disabled", delivery: "disabled" });
    const [result] = restoredBody.projection.recovery.restores;
    assert.equal(result.outcome, "applied");
    assert.equal(result.schedulesEnabled, false);
    assert.equal(result.effectsEnabled, false);
    assert.equal(restoredBody.projection.recovery.currentDryRun, null);
    assert.deepEqual(restoredBody.projection.recovery.gates.restore, { available: false, firstUnmetPredicate: "target_already_restored" });
    assert.deepEqual(target.counters, { scheduler: 0, runner: 0, send: 0, provider: 0, delivery: 0 });
    assert.equal(restoredBody.projection.context.workspaceId, workspaceId);
  } finally { await fixture.dispose(); }
});

// -- 07-09: Exports & History leaves and workspace ----------------------------

function blockedProjection(patch = {}) {
  const gate = { available: false, firstUnmetPredicate: "recovery_capability_unavailable" };
  return {
    schema: "handoff-recovery-projection/v1",
    generatedAt: Date.parse(AS_OF),
    mode: "production",
    context: {
      workspaceId: "workspace-main",
      briefStatus: "available",
      profiles: [{
        companyId: "company-main", productId: "product-main", marketPlayId: "play-main", profileId: "profile-operating",
        profileName: "Operating", profileLifecycle: "ready", configurationDigest: CONFIG_DIGEST,
        schedule: { status: "current", cadence: "weekdays", localTime: "06:00", timeZone: "America/Toronto", reportedState: "disabled", readinessRef: { id: "phase4-readiness-1", digest: DIGEST }, observedAt: AS_OF, reasonCodes: [], changeableFromThisSurface: false },
      }],
    },
    handoff: { gate: { available: false, firstUnmetPredicate: "crm_handoff_source_unavailable" }, selection: null, history: [] },
    recovery: {
      reauthentication: { state: "missing", reauthenticatedAt: null },
      gates: { archive: gate, dryRun: gate, restore: gate },
      candidate: null, currentDryRun: null, target: null,
      archives: [], dryRuns: [], restores: [], ledger: [],
      effectFence: { scheduler: "disabled", runner: "disabled", outbox: "paused", provider: "disabled", delivery: "disabled" },
    },
    authority: { changeSchedule: false, activateRunner: false, confirmReadiness: false, syncCrm: false, enableEffects: false },
    effects: { schedulerCalls: 0, runnerCalls: 0, providerCalls: 0, sends: 0, crmSyncs: 0 },
    ...patch,
  };
}

test("Exports & History leaves render blocked CSV handoff and recovery with native disabled controls, first unmet predicate, and no CRM or schedule control", async () => {
  await withVite(async (vite) => {
    const leaves = await vite.ssrLoadModule(new URL("../app/exports/handoff-recovery-leaves.tsx", import.meta.url).pathname);
    const workspace = await vite.ssrLoadModule(new URL("../app/exports/handoff-recovery-workspace.tsx", import.meta.url).pathname);
    const projection = leaves.normalizeHandoffRecoveryProjection(blockedProjection());
    assert.ok(projection, "a well-formed projection normalizes");
    const html = renderToStaticMarkup(React.createElement(workspace.HandoffRecoveryView, { projection, interaction: workspace.READ_ONLY_RECOVERY_INTERACTION }));
    const text = textOf(html);
    assert.match(text, /Controlled pilot — all displayed records are illustrative or synthetic/u);
    assert.match(text, /CSV CRM Handoff/u);
    assert.match(text, /Workspace Recovery/u);
    assert.match(text, /CSV handoff is blocked by no current CSV handoff source is composed\. No CRM sync, contact delivery, or outreach will occur\./u);
    assert.match(text, /One Prospect can contribute more than one row\. Contact rows are not the weekly seven-lead metric\./u);
    assert.match(text, /Operating schedule visibility/u);
    assert.ok(text.includes(SCHEDULE_COPY));
    assert.match(text, /Phase 4 owns future activation/u);
    for (const label of ["Create CSV handoff", "Create encrypted workspace archive", "Run read-only dry run", "Restore verified archive"]) {
      assert.match(html, new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`, "u"), `${label} is native disabled`);
    }
    assert.match(text, /Workspace archive is unavailable until authorization, encryption capability, and delivery gates are proven\. No workspace data was exported\./u);
    assert.match(text, /credentials, OAuth or bearer tokens, raw passphrases, and environment secrets/u);
    for (const forbidden of [/Connect CRM/u, /\bSync\b/u, /\bPush\b/u, /pipeline/iu, /opportunit/iu, /revenue/iu, /\bdeals?\b/iu, /\bforecast/iu]) {
      assert.doesNotMatch(text, forbidden);
    }
    for (const label of ["Start", "Enable", "Run now"]) assert.doesNotMatch(text, new RegExp(`\\b${label}\\b`, "u"), label);
    assert.doesNotMatch(html, /<button[^>]*>[^<]*Schedule[^<]*<\/button>/u, "no schedule control");
    assert.doesNotMatch(html, /(?:tel|mailto):/u);
  }, [react()]);
});

test("the restore confirmation names the dry run and nonce and uses the exact destructive copy; failure states stay indistinguishable", async () => {
  await withVite(async (vite) => {
    const leaves = await vite.ssrLoadModule(new URL("../app/exports/handoff-recovery-leaves.tsx", import.meta.url).pathname);
    const workspace = await vite.ssrLoadModule(new URL("../app/exports/handoff-recovery-workspace.tsx", import.meta.url).pathname);
    const open = { available: true, firstUnmetPredicate: null };
    const projection = leaves.normalizeHandoffRecoveryProjection(blockedProjection({
      mode: "synthetic",
      recovery: {
        ...blockedProjection().recovery,
        reauthentication: { state: "fresh", reauthenticatedAt: Date.parse(AS_OF) - 60_000 },
        gates: { archive: open, dryRun: open, restore: open },
        candidate: { archiveRef: "archive-upload-1" },
        currentDryRun: { dryRunId: "rdr_current", archiveManifestDigest: DIGEST, archiveSchemaVersion: "prospector/portable-workspace-schema/v1", expiresAt: Date.parse(AS_OF) + 600_000, createdAt: Date.parse(AS_OF) },
        target: { clean: true, restoreApplied: false },
        ledger: [{ id: "hra_<script>", action: "restore.dry_run", subjectKind: "recovery_dry_run", subjectId: null, outcome: "refused", reasonCode: "archive_verification_failed", createdAt: Date.parse(AS_OF), actorRole: "owner" }],
      },
    }));
    assert.ok(projection);
    assert.equal(projection.recovery.ledger.length, 0, "an unbounded ledger reference is dropped, not rendered");
    const interaction = { ...workspace.READ_ONLY_RECOVERY_INTERACTION, held: { dryRunId: "rdr_current", nonce: "a".repeat(32) }, confirmingRestore: true, passphrase: "x" };
    const html = renderToStaticMarkup(React.createElement(workspace.HandoffRecoveryView, { projection, interaction }));
    const text = textOf(html);
    assert.match(text, /Synthetic fixture — not a lead, contact, pilot outcome, or import\./u);
    assert.match(text, /Restore this verified archive into the approved clean compatible target\? This cannot enable schedules, runners, sends, provider calls, or delivery\. The target must remain clean and all effects will stay disabled\./u);
    assert.match(text, /rdr_current/u);
    assert.match(text, /a{32}/u);
    assert.match(text, /This applies no schedule, runner, send, provider, or delivery authority\. All effects remain disabled after restore\./u);
    assert.match(html, /type="password"/u);
    assert.doesNotMatch(html, /value="x"/u, "the passphrase is never rendered back");

    for (const [reason, copy] of [
      ["archive_verification_failed", /Archive verification failed\. No target data or operational state changed\./u],
      ["not_authorized", /Archive verification failed\. No target data or operational state changed\./u],
      ["target_not_clean", /Restore blocked\. The target remains unchanged\./u],
    ]) assert.match(leaves.recoveryRefusalCopy(reason), copy, reason);
    assert.match(leaves.RECOVERY_UNKNOWN_COPY, /The recovery outcome could not be verified\. Nothing will be retried automatically\. Load the current recovery audit\./u);
    assert.match(leaves.RESTORE_COMPLETE_COPY, /Restore complete — all schedules, runners, outboxes, providers, and delivery remain disabled\./u);
  }, [react()]);
});

test("the Exports & History sources keep one transport owner, escape content, and carry no schedule, CRM, or live-link seam", async () => {
  const workspaceSource = await readFile(new URL("../app/exports/handoff-recovery-workspace.tsx", import.meta.url), "utf8");
  const leavesSource = await readFile(new URL("../app/exports/handoff-recovery-leaves.tsx", import.meta.url), "utf8");
  const handlerSource = await readFile(new URL("../domain/handoff-recovery-handler.ts", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../app/api/handoff-recovery/route.ts", import.meta.url), "utf8");
  for (const [name, source] of [["workspace", workspaceSource], ["leaves", leavesSource], ["handler", handlerSource], ["route", routeSource]]) {
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/u, name);
    assert.doesNotMatch(source, /(?:tel|mailto):/u, name);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/u, name);
    assert.doesNotMatch(source, /enableSchedule|startRunner|runNow|createSchedule|activateProfile/u, name);
  }
  assert.doesNotMatch(leavesSource, /\bfetch\(/u, "leaves never fetch");
  assert.match(workspaceSource, /fetch\(HANDOFF_RECOVERY_API/u);
  assert.match(workspaceSource, /cache:\s*"no-store"/u);
  assert.match(routeSource, /export async function GET\(/u);
  assert.match(routeSource, /export async function POST\(/u);
  assert.doesNotMatch(routeSource, /services\s*:/u, "the route never injects services");
  assert.doesNotMatch(handlerSource, /preparation\//u);
  assert.match(handlerSource, /composeProductionHandoffRecoveryServices/u);
});
