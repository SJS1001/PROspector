import assert from "node:assert/strict";
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

// -- 07-09 surface: not implemented in the workspace yet ---------------------

test("the rendered brief shows 'Weekdays · 06:00 · America/Toronto' with its enabled/disabled state and reason", { todo: "07-09 not implemented" }, async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  assert.ok(source.includes(SCHEDULE_COPY) || /definition\.(cadence|localTime)/u.test(source));
  assert.match(source, /Schedule state is reported from Phase 4 only/u);
});

test("the rendered brief shows the exact weekly-target definition and Prospect-versus-contact-row text", { todo: "07-09 not implemented" }, async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /Counts each stable Prospect once, at its first Export-ready transition this local week/u);
  assert.match(source, /Controlled pilot — all displayed records are illustrative or synthetic/u);
});

test("the rendered brief labels each of the ten loss categories separately and escapes record content", { todo: "07-09 not implemented" }, async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  for (const category of ["rejected", "deferred", "review_delayed", "package_invalid", "reversal"]) {
    assert.ok(source.includes(category), category);
  }
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/u);
});

test("handoff and recovery controls are native disabled with an adjacent persistent reason", { todo: "07-09 not implemented" }, async () => {
  const source = await readFile(new URL("../app/morning-brief/morning-brief-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /<button[^>]*\bdisabled\b/u);
  assert.match(source, /Create CSV handoff/u);
  assert.match(source, /Review recovery evidence/u);
});
