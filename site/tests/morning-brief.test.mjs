import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const AS_OF = "2026-03-16T03:59:59.999Z";
const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);
const CONFIG_DIGEST = "c".repeat(64);
const PACKAGE_DIGEST = "d".repeat(64);

const EXCLUSION_REASONS = [
  "duplicate_row_identity",
  "suppressed",
  "verification_stale",
  "verification_invalid",
  "no_approved_package",
  "disqualified",
  "high_risk_drift",
  "identity_merge_or_split",
  "deleted",
  "cross_scope",
  "other_current_ineligible",
];

const LOSS_CATEGORIES = [
  "rejected",
  "deferred",
  "enrichment_failed",
  "enrichment_uncertain",
  "review_delayed",
  "contact_stale_or_invalid",
  "package_invalid",
  "suppressed",
  "high_risk_drift",
  "reversal",
];

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      brief: await vite.ssrLoadModule(
        new URL("../domain/morning-brief.ts", import.meta.url).pathname,
      ),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

async function compose(patch = {}, { transform } = {}) {
  const { vite, brief } = await load();
  try {
    const value = transform ? transform(input(patch)) : input(patch);
    return { result: brief.composeMorningBrief(value), brief };
  } finally {
    await vite.close();
  }
}

function scope(patch = {}) {
  return {
    workspaceId: "workspace-main",
    companyId: "company-main",
    productId: "product-main",
    marketPlayId: "play-main",
    profileId: "profile-operating",
    profileName: "Operating",
    profileLifecycle: "ready",
    activeConfigurationDigest: CONFIG_DIGEST,
    ...patch,
  };
}

function reference(id, digest = DIGEST) {
  return { id, digest };
}

function event(prospectId, index, specification) {
  return {
    eventId: `event-${prospectId}-${index + 1}`,
    sequence: index + 1,
    auditRef: reference(`audit-${prospectId}-${index + 1}`),
    ...specification,
  };
}

function exportPath(occurredAt) {
  return [
    { kind: "prospect_created", occurredAt: "2026-01-05T05:00:00.000Z", initialState: "Candidate" },
    { kind: "state_transition", occurredAt: "2026-02-01T05:00:00.000Z", fromState: "Candidate", toState: "Qualified" },
    { kind: "state_transition", occurredAt: "2026-02-02T05:00:00.000Z", fromState: "Qualified", toState: "Approved" },
    { kind: "state_transition", occurredAt: "2026-02-03T05:00:00.000Z", fromState: "Approved", toState: "ContactReady" },
    { kind: "state_transition", occurredAt: "2026-02-04T05:00:00.000Z", fromState: "ContactReady", toState: "PackageReady" },
    { kind: "state_transition", occurredAt, fromState: "PackageReady", toState: "ExportReady" },
  ];
}

function history(prospectId, specifications, patch = {}) {
  return {
    prospectId,
    workspaceId: "workspace-main",
    companyId: "company-main",
    productId: "product-main",
    marketPlayId: "play-main",
    profileId: "profile-operating",
    events: specifications.map((specification, index) => event(prospectId, index, specification)),
    ...patch,
  };
}

function defaultHistories() {
  return [
    history("prospect-one", [
      ...exportPath("2026-03-10T14:00:00.000Z"),
      { kind: "contact_linked", occurredAt: "2026-03-10T15:00:00.000Z", contactId: "contact-a" },
      { kind: "contact_linked", occurredAt: "2026-03-10T15:01:00.000Z", contactId: "contact-b" },
    ]),
    history("prospect-two", [
      ...exportPath("2026-03-12T14:00:00.000Z"),
      { kind: "contact_linked", occurredAt: "2026-03-12T15:00:00.000Z", contactId: "contact-c" },
    ]),
    history("prospect-lost", [
      { kind: "prospect_created", occurredAt: "2026-01-05T05:00:00.000Z", initialState: "Candidate" },
      { kind: "state_transition", occurredAt: "2026-03-11T14:00:00.000Z", fromState: "Candidate", toState: "Rejected" },
      { kind: "loss", occurredAt: "2026-03-11T14:00:00.000Z", category: "rejected", contactId: null },
    ]),
  ];
}

// The weekly reducer owns a narrower scope record than the brief: it has no
// active configuration digest.
function weeklyScope(patch = {}) {
  const value = scope(patch);
  delete value.activeConfigurationDigest;
  delete value.profileName;
  // The reducer models Operating/Draft; the brief carries the persisted
  // draft/ready/paused/archived enum. They are separate vocabularies.
  value.profileLifecycle = patch.weeklyLifecycle ?? "Operating";
  return value;
}

function weeklyHistory(patch = {}, scopePatch = {}) {
  const histories = patch.histories ?? defaultHistories();
  return {
    scope: weeklyScope(scopePatch),
    timeZone: "America/Toronto",
    asOf: AS_OF,
    coverage: {
      from: "prospect_origin",
      through: AS_OF,
      prospectIds: histories.map((entry) => entry.prospectId),
    },
    histories,
    ...patch,
  };
}

function scheduleObservation(patch = {}) {
  return {
    observationRef: reference("schedule-observation-1"),
    profileId: "profile-operating",
    configurationDigest: CONFIG_DIGEST,
    cadence: "weekdays",
    localTime: "06:00",
    timeZone: "America/Toronto",
    upstreamAuthority: "phase4_profile_readiness",
    readinessRef: reference("phase4-readiness-1"),
    state: "enabled",
    observedAt: "2026-03-16T03:00:00.000Z",
    ...patch,
  };
}

function exclusions(patch = {}) {
  return Object.fromEntries(EXCLUSION_REASONS.map((reason) => [reason, patch[reason] ?? 0]));
}

function handoffReadiness(patch = {}) {
  return {
    snapshotRef: reference("handoff-snapshot-1"),
    evaluatedAt: "2026-03-16T03:30:00.000Z",
    exportReadyProspectCount: 2,
    uniqueEligibleProspectCount: 2,
    eligibleContactRowCount: 3,
    nonContactableReferenceCount: 1,
    exclusions: exclusions({ suppressed: 1, duplicate_row_identity: 2 }),
    dependencies: {
      configurationDigest: CONFIG_DIGEST,
      packagePolicyDigest: PACKAGE_DIGEST,
      suppressionFenceRef: reference("suppression-fence-1"),
    },
    ...patch,
  };
}

function input(patch = {}) {
  return {
    scope: scope(patch.scope),
    asOf: AS_OF,
    weeklyHistory: weeklyHistory(patch.weeklyHistory, patch.scope),
    scheduleObservation: "scheduleObservation" in patch
      ? patch.scheduleObservation
      : scheduleObservation(),
    handoffReadiness: "handoffReadiness" in patch
      ? patch.handoffReadiness
      : handoffReadiness(),
    reviewFunnel: "reviewFunnel" in patch ? patch.reviewFunnel : null,
    workspaceOrigin: "workspaceOrigin" in patch ? patch.workspaceOrigin : { kind: "original" },
    greenfieldProfiles: patch.greenfieldProfiles ?? [
      { profileId: "profile-greenfield", label: "Greenfield — Draft / nurture" },
    ],
  };
}

test("composes the weekly cohort, separate handoff counts, and a current upstream schedule with zero authority", async () => {
  const { result, brief } = await compose();

  assert.equal(result.status, "available");
  assert.equal(result.generatedAt, AS_OF);
  assert.equal(result.pilotNotice, brief.MORNING_BRIEF_PILOT_NOTICE);

  assert.equal(result.weekly.status, "current");
  assert.equal(result.weekly.target, 7);
  assert.equal(result.weekly.timeZone, "America/Toronto");
  assert.equal(result.weekly.week.start.localDate, "2026-03-09");
  assert.equal(result.weekly.week.endLocalDate, "2026-03-15");
  assert.equal(result.weekly.newlyExportReadyProspectCount, 2);
  assert.equal(result.weekly.remainingProspectsToTarget, 5);
  assert.equal(result.weekly.distinctStableContactCount, 3);
  assert.equal(result.weekly.profileIncluded, true);
  assert.equal(result.weekly.explanation, brief.MORNING_BRIEF_WEEKLY_EXPLANATION);
  assert.deepEqual(
    result.weekly.cohort.map((entry) => entry.prospectId),
    ["prospect-one", "prospect-two"],
  );
  assert.deepEqual(
    result.weekly.cohort.map((entry) => entry.auditRef.id),
    ["audit-prospect-one-6", "audit-prospect-two-6"],
  );

  assert.deepEqual(Object.keys(result.losses).sort(), [...LOSS_CATEGORIES].sort());
  assert.equal(result.losses.rejected.eventCount, 1);
  assert.equal(result.losses.rejected.distinctProspectCount, 1);
  assert.equal(result.losses.reversal.eventCount, 0);
  // Losses are reported beside the cohort and never fold into it.
  assert.equal(result.weekly.newlyExportReadyProspectCount, 2);

  assert.equal(result.schedule.status, "current");
  assert.equal(result.schedule.reportedState, "enabled");
  assert.deepEqual(result.schedule.definition, brief.MORNING_BRIEF_SCHEDULE_DEFINITION);
  assert.deepEqual(result.schedule.definition, {
    cadence: "weekdays",
    localTime: "06:00",
    timeZone: "America/Toronto",
    upstreamAuthority: "phase4_profile_readiness",
  });
  assert.equal(result.schedule.readinessRef.id, "phase4-readiness-1");
  assert.deepEqual(result.schedule.reasonCodes, []);
  assert.equal(result.schedule.changeableFromThisSurface, false);

  assert.equal(result.handoff.status, "current");
  // The contact-row count is deliberately distinct from the weekly metric.
  assert.equal(result.handoff.counts.eligibleContactRowCount, 3);
  assert.equal(result.handoff.counts.uniqueEligibleProspectCount, 2);
  assert.notEqual(
    result.handoff.counts.eligibleContactRowCount,
    result.weekly.newlyExportReadyProspectCount,
  );
  assert.equal(result.handoff.counts.nonContactableReferenceCount, 1);
  assert.equal(result.handoff.exclusions.suppressed, 1);
  assert.equal(result.handoff.exclusions.duplicate_row_identity, 2);
  assert.deepEqual(Object.keys(result.handoff.exclusions).sort(), [...EXCLUSION_REASONS].sort());
  assert.equal(result.handoff.dependencies.packagePolicyDigest, PACKAGE_DIGEST);
  assert.equal(result.handoff.materializableFromThisSurface, false);

  assert.deepEqual(result.workspace, {
    status: "current",
    origin: "original",
    restoreRef: null,
    restoredEffectsFenced: false,
    freshUpstreamActivationRef: null,
    reasonCodes: [],
  });
  // Review funnel is absent by default and must never imply a zero cohort.
  assert.equal(result.funnel.status, "unavailable");
  assert.deepEqual(result.funnel.reasonCodes, ["funnel_review_history_absent"]);
  assert.equal(result.funnel.countsExportReadyOutcomes, false);
  assert.equal(result.greenfield.notice, brief.MORNING_BRIEF_GREENFIELD_NOTICE);
  assert.deepEqual(result.greenfield.profiles, [{
    profileId: "profile-greenfield",
    label: "Greenfield — Draft / nurture",
    contributesToWeeklyOutcome: false,
    contributesToHandoff: false,
    contributesToSchedule: false,
  }]);

  assert.deepEqual(result.authority, {
    changeSchedule: false,
    activateRunner: false,
    readEligibilityRows: false,
    materializeExport: false,
    deliverExport: false,
    createArchive: false,
    verifyRecovery: false,
    applyRestore: false,
    invokeProvider: false,
    persist: false,
  });
  assert.ok(Object.values(result.authority).every((value) => value === false));
  assert.ok(Object.values(result.effects).every((value) => value === 0));
  assert.deepEqual(Object.keys(result.effects).sort(), [
    "archivesCreated", "deliveries", "exportBytesCreated", "exportChecksumsCreated",
    "networkCalls", "persistedRecords", "providerCalls", "restoresApplied",
    "runnerCalls", "schedulerCalls", "targetWrites",
  ]);

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.weekly));
  assert.ok(Object.isFrozen(result.handoff.counts));
  assert.ok(Object.isFrozen(result.greenfield.profiles[0]));
  assert.throws(() => {
    result.handoff.counts.eligibleContactRowCount = 99;
  }, TypeError);
});

test("a restored workspace reports the schedule disabled pending a fresh upstream activation", async () => {
  const pending = await compose({
    workspaceOrigin: {
      kind: "restored",
      restoreRef: reference("restore-1"),
      restoredAt: "2026-03-15T12:00:00.000Z",
      freshUpstreamActivation: null,
    },
  });

  assert.equal(pending.result.status, "available");
  assert.equal(pending.result.schedule.status, "disabled_pending_fresh_upstream_activation");
  // The source observation said enabled; the restored target must not inherit it.
  assert.equal(pending.result.schedule.reportedState, "disabled");
  assert.deepEqual(pending.result.schedule.reasonCodes, [
    "workspace_restored_pending_fresh_upstream_activation",
  ]);
  assert.deepEqual(pending.result.workspace, {
    status: "current",
    origin: "restored",
    restoreRef: { id: "restore-1", digest: DIGEST },
    restoredEffectsFenced: true,
    freshUpstreamActivationRef: null,
    reasonCodes: [],
  });
  assert.equal(pending.result.authority.applyRestore, false);
  assert.equal(pending.result.authority.verifyRecovery, false);
  assert.equal(pending.result.effects.restoresApplied, 0);

  const activated = await compose({
    workspaceOrigin: {
      kind: "restored",
      restoreRef: reference("restore-1"),
      restoredAt: "2026-03-15T12:00:00.000Z",
      freshUpstreamActivation: {
        activationRef: reference("phase4-activation-9"),
        activatedAt: "2026-03-15T18:00:00.000Z",
      },
    },
  });
  assert.equal(activated.result.schedule.status, "current");
  assert.equal(activated.result.schedule.reportedState, "enabled");
  assert.deepEqual(activated.result.schedule.reasonCodes, []);
  assert.equal(
    activated.result.workspace.freshUpstreamActivationRef.id,
    "phase4-activation-9",
  );
  assert.equal(activated.result.workspace.restoredEffectsFenced, true);

  for (const [name, activatedAt] of [
    ["not after the restore", "2026-03-15T11:00:00.000Z"],
    ["exactly at the restore", "2026-03-15T12:00:00.000Z"],
    ["after the evaluation instant", "2026-03-16T04:00:00.000Z"],
  ]) {
    const stale = await compose({
      workspaceOrigin: {
        kind: "restored",
        restoreRef: reference("restore-1"),
        restoredAt: "2026-03-15T12:00:00.000Z",
        freshUpstreamActivation: {
          activationRef: reference("phase4-activation-9"),
          activatedAt,
        },
      },
    });
    assert.equal(
      stale.result.schedule.status,
      "disabled_pending_fresh_upstream_activation",
      name,
    );
    assert.equal(stale.result.workspace.freshUpstreamActivationRef, null, name);
  }
});

test("absent, drifted, misdefined, foreign, future, and stale schedule evidence never reports a state", async () => {
  const absent = await compose({ scheduleObservation: null });
  assert.equal(absent.result.schedule.status, "unknown");
  assert.equal(absent.result.schedule.reportedState, null);
  assert.equal(absent.result.schedule.observationRef, null);
  assert.deepEqual(absent.result.schedule.reasonCodes, ["schedule_observation_absent"]);

  const cases = [
    ["schedule_definition_mismatch", { cadence: "daily" }],
    ["schedule_definition_mismatch", { localTime: "07:00" }],
    ["schedule_definition_mismatch", { timeZone: "UTC" }],
    ["schedule_scope_mismatch", { profileId: "profile-greenfield" }],
    ["schedule_configuration_drift", { configurationDigest: OTHER_DIGEST }],
    ["schedule_upstream_authority_invalid", { upstreamAuthority: "phase7_morning_brief" }],
    ["schedule_observation_in_future", { observedAt: "2026-03-16T04:00:00.000Z" }],
    ["schedule_observation_stale", { observedAt: "2026-03-15T03:00:00.000Z" }],
  ];
  for (const [reason, patch] of cases) {
    const { result } = await compose({ scheduleObservation: scheduleObservation(patch) });
    assert.equal(result.status, "available", reason);
    assert.equal(result.schedule.status, "blocked", reason);
    assert.equal(result.schedule.reportedState, null, reason);
    assert.deepEqual(result.schedule.reasonCodes, [reason], reason);
    assert.equal(result.schedule.changeableFromThisSurface, false, reason);
  }

  const boundary = await compose({
    scheduleObservation: scheduleObservation({ observedAt: "2026-03-15T03:59:59.999Z" }),
  });
  assert.equal(boundary.result.schedule.status, "current");

  const combined = await compose({
    scheduleObservation: scheduleObservation({
      configurationDigest: OTHER_DIGEST,
      observedAt: "2026-03-15T03:00:00.000Z",
    }),
    workspaceOrigin: {
      kind: "restored",
      restoreRef: reference("restore-1"),
      restoredAt: "2026-03-15T12:00:00.000Z",
      freshUpstreamActivation: null,
    },
  });
  assert.equal(combined.result.schedule.status, "blocked");
  assert.deepEqual(combined.result.schedule.reasonCodes, [
    "schedule_configuration_drift",
    "schedule_observation_stale",
    "workspace_restored_pending_fresh_upstream_activation",
  ]);
});

test("absent, stale, future, drifted, or self-inconsistent handoff readiness withholds every count", async () => {
  const absent = await compose({ handoffReadiness: null });
  assert.equal(absent.result.handoff.status, "blocked");
  assert.equal(absent.result.handoff.counts, null);
  assert.equal(absent.result.handoff.exclusions, null);
  assert.equal(absent.result.handoff.dependencies, null);
  assert.deepEqual(absent.result.handoff.reasonCodes, ["handoff_preview_absent"]);

  const cases = [
    ["handoff_snapshot_in_future", { evaluatedAt: "2026-03-16T04:00:00.000Z" }],
    ["handoff_snapshot_stale", { evaluatedAt: "2026-03-15T03:00:00.000Z" }],
    ["handoff_configuration_drift", {
      dependencies: {
        configurationDigest: OTHER_DIGEST,
        packagePolicyDigest: PACKAGE_DIGEST,
        suppressionFenceRef: reference("suppression-fence-1"),
      },
    }],
    ["handoff_counts_inconsistent", { uniqueEligibleProspectCount: 4 }],
    ["handoff_counts_inconsistent", {
      exportReadyProspectCount: 1, uniqueEligibleProspectCount: 2,
    }],
    ["handoff_counts_inconsistent", {
      uniqueEligibleProspectCount: 0, eligibleContactRowCount: 3,
    }],
  ];
  for (const [reason, patch] of cases) {
    const { result } = await compose({ handoffReadiness: handoffReadiness(patch) });
    assert.equal(result.status, "available", reason);
    assert.equal(result.handoff.status, "blocked", reason);
    assert.equal(result.handoff.counts, null, reason);
    assert.equal(result.handoff.exclusions, null, reason);
    assert.equal(result.handoff.dependencies, null, reason);
    assert.deepEqual(result.handoff.reasonCodes, [reason], reason);
    // A blocked handoff panel still leaves the weekly outcome readable.
    assert.equal(result.weekly.status, "current", reason);
    assert.equal(result.weekly.newlyExportReadyProspectCount, 2, reason);
  }

  const empty = await compose({
    handoffReadiness: handoffReadiness({
      exportReadyProspectCount: 0,
      uniqueEligibleProspectCount: 0,
      eligibleContactRowCount: 0,
      nonContactableReferenceCount: 0,
      exclusions: exclusions({ suppressed: 4 }),
    }),
  });
  assert.equal(empty.result.handoff.status, "current");
  assert.equal(empty.result.handoff.counts.eligibleContactRowCount, 0);
  assert.equal(empty.result.handoff.exclusions.suppressed, 4);
});

test("unavailable, out-of-scope, out-of-time, absent, or forged weekly history disables only that section", async () => {
  const cases = [
    ["truncated coverage", (value) => ({
      ...value,
      weeklyHistory: {
        ...value.weeklyHistory,
        coverage: { ...value.weeklyHistory.coverage, prospectIds: ["prospect-one"] },
      },
    }), ["weekly_outcome_unavailable"], ["history_coverage_incomplete"]],
    ["foreign scope", (value) => ({
      ...value,
      weeklyHistory: {
        ...value.weeklyHistory,
        scope: { ...value.weeklyHistory.scope, workspaceId: "workspace-other" },
      },
    }), ["weekly_history_scope_mismatch"], []],
    ["clock skew", (value) => ({
      ...value,
      weeklyHistory: { ...value.weeklyHistory, asOf: "2026-03-16T03:59:59.998Z" },
    }), ["weekly_history_as_of_mismatch"], []],
    // A caller may not hand the brief a ready-made "available" projection.
    ["forged projection", (value) => ({
      ...value,
      weeklyHistory: {
        status: "available", scope: value.weeklyHistory.scope, asOf: AS_OF, week: null,
        profileIncluded: true, exclusions: [], target: 7,
        counts: {
          distinctStableProspectCount: 7, distinctStableContactCount: 7,
          newlyExportReadyProspectCount: 7, remainingProspectsToTarget: 0,
        },
        cohort: [], losses: {},
      },
    }), ["weekly_outcome_unavailable"], ["history_input_malformed"]],
    // The persisted-read case: no Export-ready transition history exists.
    ["absent history", (value) => ({ ...value, weeklyHistory: null }),
      ["weekly_history_absent"], []],
  ];

  for (const [name, transform, reasonCodes, weeklyReasonCodes] of cases) {
    const { result } = await compose({}, { transform });
    // The brief still renders: only the weekly section is withheld.
    assert.equal(result.status, "available", name);
    assert.equal(result.weekly.status, "unavailable", name);
    assert.deepEqual(result.weekly.reasonCodes, reasonCodes, name);
    assert.deepEqual(result.weekly.weeklyReasonCodes, weeklyReasonCodes, name);
    assert.equal(result.weekly.newlyExportReadyProspectCount, null, name);
    assert.deepEqual(result.weekly.cohort, [], name);
    assert.equal(result.losses, null, name);
    // Everything else stays readable.
    assert.equal(result.scope.profileName, "Operating", name);
    assert.equal(result.schedule.status, "current", name);
    assert.equal(result.handoff.status, "current", name);
    assert.ok(Object.values(result.authority).every((value) => value === false), name);
    assert.ok(Object.values(result.effects).every((value) => value === 0), name);
  }
});

test("a supplied review funnel is reported beside the weekly section and never as an Export-ready outcome", async () => {
  const { result, brief } = await compose({
    weeklyHistory: undefined,
    reviewFunnel: {
      windowStart: "2026-03-09T05:00:00.000Z",
      windowEndExclusive: "2026-03-16T04:00:00.000Z",
      decisions: { approve: 5, reject: 2, defer: 1 },
      distinctReviewedProspectCount: 6,
      cooldownsStarted: 1,
      reentryEvents: { review_due: 2, material_signal: 1, hard_gate_disproved: 0 },
    },
  }, { transform: (value) => ({ ...value, weeklyHistory: null }) });

  assert.equal(result.status, "available");
  assert.equal(result.funnel.status, "current");
  assert.equal(result.funnel.note, brief.MORNING_BRIEF_FUNNEL_NOTE);
  assert.deepEqual(result.funnel.decisions, { approve: 5, reject: 2, defer: 1 });
  assert.equal(result.funnel.distinctReviewedProspectCount, 6);
  assert.equal(result.funnel.countsExportReadyOutcomes, false);

  // Five approvals must not become five Export-ready Prospects.
  assert.equal(result.weekly.status, "unavailable");
  assert.equal(result.weekly.newlyExportReadyProspectCount, null);
  assert.equal(result.weekly.remainingProspectsToTarget, null);
  assert.notEqual(result.funnel.decisions.approve, result.weekly.newlyExportReadyProspectCount);

  // More distinct Prospects than decisions is incoherent and rejects.
  const incoherent = await compose({
    reviewFunnel: {
      windowStart: "2026-03-09T05:00:00.000Z",
      windowEndExclusive: "2026-03-16T04:00:00.000Z",
      decisions: { approve: 1, reject: 0, defer: 0 },
      distinctReviewedProspectCount: 4,
      cooldownsStarted: 0,
      reentryEvents: { review_due: 0, material_signal: 0, hard_gate_disproved: 0 },
    },
  });
  assert.equal(incoherent.result.status, "unavailable");
  assert.deepEqual(incoherent.result.reasonCodes, ["morning_brief_input_malformed"]);
});

test("an absent workspace origin reports the restore section unavailable with the effect fence closed", async () => {
  const { result } = await compose({ workspaceOrigin: null });
  assert.equal(result.status, "available");
  assert.equal(result.workspace.status, "unavailable");
  assert.deepEqual(result.workspace.reasonCodes, ["workspace_origin_not_persisted"]);
  assert.equal(result.workspace.origin, null);
  // Unknown origin is fenced, never assumed to be an original workspace.
  assert.equal(result.workspace.restoredEffectsFenced, true);
  assert.equal(result.authority.applyRestore, false);
  assert.equal(result.effects.restoresApplied, 0);
});

test("a Draft profile scope contributes no cohort, contacts, or losses", async () => {
  const { result } = await compose({}, {
    transform: (value) => ({
      ...value,
      weeklyHistory: {
        ...value.weeklyHistory,
        scope: { ...value.weeklyHistory.scope, profileLifecycle: "Draft" },
      },
    }),
  });

  assert.equal(result.status, "available");
  assert.equal(result.weekly.status, "current");
  assert.equal(result.weekly.profileIncluded, false);
  assert.deepEqual(result.weekly.exclusions, ["profile_not_operating"]);
  assert.equal(result.weekly.newlyExportReadyProspectCount, 0);
  assert.equal(result.weekly.distinctStableProspectCount, 0);
  assert.equal(result.weekly.distinctStableContactCount, 0);
  assert.equal(result.weekly.remainingProspectsToTarget, 7);
  assert.deepEqual(result.weekly.cohort, []);
  for (const category of LOSS_CATEGORIES) {
    assert.equal(result.losses[category].eventCount, 0, category);
  }
});

test("hostile, malformed, and non-plain input shapes fail closed", async () => {
  const { vite, brief } = await load();
  try {
    const accessor = input();
    Object.defineProperty(accessor.scope, "workspaceId", {
      get: () => "workspace-main",
      enumerable: true,
      configurable: true,
    });

    // A proxy that reports an accessor descriptor cannot pass as a data record.
    const proxied = input();
    proxied.handoffReadiness = new Proxy(handoffReadiness(), {
      getOwnPropertyDescriptor: (target, key) => (key === "evaluatedAt"
        ? { get: () => "2026-03-16T03:30:00.000Z", enumerable: true, configurable: true }
        : Reflect.getOwnPropertyDescriptor(target, key)),
    });

    const symbolKeyed = input();
    symbolKeyed.scheduleObservation = { ...scheduleObservation(), [Symbol("x")]: 1 };

    const sparse = input();
    const holes = [];
    holes.length = 2;
    sparse.greenfieldProfiles = holes;

    const nullPrototype = input();
    nullPrototype.workspaceOrigin = Object.assign(Object.create(null), { kind: "original" });

    const cases = [
      ["accessor-backed scope field", accessor],
      ["proxied handoff preview", proxied],
      ["symbol-keyed schedule observation", symbolKeyed],
      ["sparse greenfield array", sparse],
      ["null-prototype workspace origin", nullPrototype],
      ["extra top-level field", { ...input(), extra: 1 }],
      ["missing top-level field", (() => {
        const value = input();
        delete value.greenfieldProfiles;
        return value;
      })()],
      ["extra scope field", { ...input(), scope: { ...scope(), extra: 1 } }],
      ["unknown profile lifecycle", { ...input(), scope: scope({ profileLifecycle: "Retired" }) }],
      ["malformed configuration digest", {
        ...input(), scope: scope({ activeConfigurationDigest: "not-a-digest" }),
      }],
      ["uppercase digest", {
        ...input(), scope: scope({ activeConfigurationDigest: "A".repeat(64) }),
      }],
      ["malformed evaluation instant", { ...input(), asOf: "2026-03-16T03:59:59Z" }],
      ["unknown schedule state", {
        ...input(), scheduleObservation: scheduleObservation({ state: "paused" }),
      }],
      ["missing exclusion reason", {
        ...input(),
        handoffReadiness: handoffReadiness({
          exclusions: (() => {
            const value = exclusions();
            delete value.suppressed;
            return value;
          })(),
        }),
      }],
      ["unknown exclusion reason", {
        ...input(),
        handoffReadiness: handoffReadiness({ exclusions: { ...exclusions(), invented: 1 } }),
      }],
      ["fractional count", {
        ...input(), handoffReadiness: handoffReadiness({ eligibleContactRowCount: 2.5 }),
      }],
      ["negative count", {
        ...input(), handoffReadiness: handoffReadiness({ nonContactableReferenceCount: -1 }),
      }],
      ["count above the cap", {
        ...input(),
        handoffReadiness: handoffReadiness({
          exportReadyProspectCount: 1_000_001,
          uniqueEligibleProspectCount: 0,
          eligibleContactRowCount: 0,
        }),
      }],
      ["numeric string count", {
        ...input(), handoffReadiness: handoffReadiness({ eligibleContactRowCount: "3" }),
      }],
      ["unknown workspace origin kind", {
        ...input(), workspaceOrigin: { kind: "cloned" },
      }],
      ["restore dated after the evaluation instant", {
        ...input(),
        workspaceOrigin: {
          kind: "restored",
          restoreRef: reference("restore-1"),
          restoredAt: "2026-03-16T05:00:00.000Z",
          freshUpstreamActivation: null,
        },
      }],
      ["greenfield profile duplicating the operating profile", {
        ...input(),
        greenfieldProfiles: [{ profileId: "profile-operating", label: "Greenfield" }],
      }],
      ["duplicate greenfield profiles", {
        ...input(),
        greenfieldProfiles: [
          { profileId: "profile-greenfield", label: "Greenfield" },
          { profileId: "profile-greenfield", label: "Greenfield again" },
        ],
      }],
      ["greenfield array beyond the cap", {
        ...input(),
        greenfieldProfiles: Array.from({ length: 65 }, (_, index) => ({
          profileId: `profile-greenfield-${index}`,
          label: "Greenfield",
        })),
      }],
      ["array instead of the input record", []],
      ["null input", null],
    ];

    for (const [name, value] of cases) {
      const result = brief.composeMorningBrief(value);
      assert.equal(result.status, "unavailable", name);
      assert.deepEqual(result.reasonCodes, ["morning_brief_input_malformed"], name);
      assert.ok(Object.values(result.effects).every((counter) => counter === 0), name);
    }
  } finally {
    await vite.close();
  }
});

test("identifier-shaped raw contact values are rejected rather than reported", async () => {
  const { vite, brief } = await load();
  try {
    const cases = [
      ["phone-shaped workspace id", { ...input(), scope: scope({ workspaceId: "workspace-4165551234" }) }],
      ["phone-shaped profile id", { ...input(), scope: scope({ profileId: "profile-4165551234" }) }],
      ["phone-shaped schedule observation reference", {
        ...input(),
        scheduleObservation: scheduleObservation({
          observationRef: reference("observation-4165551234"),
        }),
      }],
      ["phone-shaped greenfield label", {
        ...input(),
        greenfieldProfiles: [{ profileId: "profile-greenfield", label: "Greenfield 4165551234" }],
      }],
      ["phone-shaped snapshot reference", {
        ...input(),
        handoffReadiness: handoffReadiness({ snapshotRef: reference("snapshot-4165551234") }),
      }],
    ];

    for (const [name, value] of cases) {
      const result = brief.composeMorningBrief(value);
      assert.equal(result.status, "unavailable", name);
      assert.deepEqual(
        result.reasonCodes,
        ["morning_brief_raw_identity_value_present"],
        name,
      );
      assert.equal(result.scope, null, name);
      assert.equal(result.handoff, null, name);
    }

    // An address separator never reaches the identity fence: the stable-ID and
    // label grammars exclude it outright.
    const withAt = brief.composeMorningBrief({
      ...input(),
      scope: scope({ workspaceId: "owner@example" }),
    });
    assert.equal(withAt.status, "unavailable");
    assert.deepEqual(withAt.reasonCodes, ["morning_brief_input_malformed"]);
  } finally {
    await vite.close();
  }
});

test("the module composes no port, provider, effect, or preparation dependency", async () => {
  const source = await (await import("node:fs/promises"))
    .readFile(new URL("../domain/morning-brief.ts", import.meta.url), "utf8");

  for (const pattern of [
    /\bfetch\s*\(/u,
    /\bnode:/u,
    /\bcrypto\b/u,
    /\bprocess\./u,
    /\bD1\b/u,
    /\bR2\b/u,
    /preparation\//u,
    /gmail|twilio|sendgrid|nodemailer/iu,
    /passphrase|password|secret|token|credential/iu,
    /\bsetTimeout\b|\bsetInterval\b/u,
  ]) {
    assert.doesNotMatch(source, pattern, `morning-brief.ts must not reference ${pattern}`);
  }

  const imports = [...source.matchAll(/^import\s[\s\S]*?from\s+"([^"]+)";$/gmu)]
    .map((match) => match[1]);
  assert.deepEqual(imports, ["./weekly-outcome"]);
});
