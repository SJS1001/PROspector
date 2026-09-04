import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-03-16T03:59:00.000Z");
const ZERO_EFFECTS = Object.freeze({
  scheduleMutations: 0,
  runnerCalls: 0,
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});
const LOSS_KINDS = Object.freeze([
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
]);

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      weekly: await vite.ssrLoadModule(new URL(
        "../preparation/phase7-weekly-outcome.ts",
        import.meta.url,
      ).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function transition(id, prospectId, occurredAt, patch = {}) {
  return {
    id,
    prospectId,
    profileId: "synthetic-profile-operating",
    kind: "export_ready",
    occurredAt,
    auditRefId: `synthetic-audit-${id.slice("synthetic-".length)}`,
    auditDigest: "a".repeat(64),
    ...patch,
  };
}

function loss(kind, index, patch = {}) {
  return {
    id: `synthetic-loss-${kind.replaceAll("_", "-")}-${index}`,
    prospectId: `synthetic-loss-prospect-${index}`,
    profileId: "synthetic-profile-operating",
    kind,
    occurredAt: NOW - index,
    auditRefId: `synthetic-loss-audit-${index}`,
    auditDigest: String((index % 9) + 1).repeat(64),
    ...patch,
  };
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-weekly-outcome",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    productId: "synthetic-product",
    marketPlayId: "synthetic-market-play",
    profileId: "synthetic-profile-operating",
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: "f".repeat(64),
    profileLifecycle: "operating",
    timezone: "America/Toronto",
    weekStartsOn: "monday",
    weeklyTarget: 7,
    evaluatedAt: NOW,
    transitions: [
      transition("synthetic-transition-a", "synthetic-prospect-a", Date.parse("2026-03-09T04:30:00.000Z")),
      transition("synthetic-transition-b", "synthetic-prospect-b", Date.parse("2026-03-16T03:30:00.000Z")),
      transition("synthetic-transition-c-old", "synthetic-prospect-c", Date.parse("2026-03-09T03:30:00.000Z")),
      transition("synthetic-transition-c-reexport", "synthetic-prospect-c", Date.parse("2026-03-11T17:00:00.000Z")),
    ],
    losses: LOSS_KINDS.map((kind, index) => loss(kind, index + 1)),
    ...patch,
  };
}

function currentAuthority(patch = {}) {
  return {
    evaluatedAt: NOW + 10_000,
    scopeCurrent: true,
    configurationCurrent: true,
    historyComplete: true,
    transitionProvenanceCurrent: true,
    timezonePolicyCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

function evaluationInput(candidateArtifact, patch = {}) {
  return {
    candidateArtifact,
    currentCandidate: candidateInput(),
    currentAuthority: currentAuthority(),
    ...patch,
  };
}

test("weekly outcome candidates are deterministic, deeply frozen, synthetic, and zero-effect", async () => {
  const { vite, weekly } = await load();
  try {
    const first = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput());
    const reordered = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput({
      transitions: [...candidateInput().transitions].reverse(),
      losses: [...candidateInput().losses].reverse(),
    }));
    assert.equal(first.digest, reordered.digest);
    assert.equal(first.kind, "synthetic_phase7_weekly_outcome_candidate");
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.projection.cohort), true);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
    assert.equal(first.operationalOutcomeClaimed, false);
    for (const field of [
      "phaseExecutionAuthorized", "runtimeCompositionAuthorized", "scheduleAuthorized",
      "runnerAuthorized", "persistenceAuthorized", "exportAuthorized",
      "providerInvocationAuthorized",
    ]) assert.equal(first[field], false, field);
  } finally {
    await vite.close();
  }
});

test("Toronto Monday-Sunday counting uses each Prospect's first transition only", async () => {
  const { vite, weekly } = await load();
  try {
    const artifact = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput());
    assert.deepEqual(artifact.projection.week, {
      timezone: "America/Toronto",
      startsOn: "monday",
      startLocalDate: "2026-03-09",
      endLocalDate: "2026-03-15",
      evaluatedLocalDate: "2026-03-15",
      evaluatedOffsetMinutes: -240,
    });
    assert.equal(artifact.projection.weeklyTarget, 7);
    assert.equal(artifact.projection.newlyExportReadyCount, 2);
    assert.equal(artifact.projection.remainingToTarget, 5);
    assert.deepEqual(
      artifact.projection.cohort.map((entry) => entry.prospectId),
      ["synthetic-prospect-a", "synthetic-prospect-b"],
    );
    assert.equal(artifact.projection.cohort[0].utcOffsetMinutes, -240);
    assert.equal(artifact.projection.cohort[1].localDate, "2026-03-15");
    assert.equal(artifact.projection.cohort.some((entry) => entry.prospectId === "synthetic-prospect-c"), false);
  } finally {
    await vite.close();
  }
});

test("DST fall-back preserves the local week and the offset of each first transition", async () => {
  const { vite, weekly } = await load();
  try {
    const evaluatedAt = Date.parse("2026-11-09T04:59:00.000Z");
    const artifact = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput({
      evaluatedAt,
      transitions: [
        transition("synthetic-transition-fall-a", "synthetic-prospect-fall-a", Date.parse("2026-11-02T05:30:00.000Z")),
        transition("synthetic-transition-fall-b", "synthetic-prospect-fall-b", Date.parse("2026-11-09T04:30:00.000Z")),
      ],
      losses: [],
    }));
    assert.equal(artifact.projection.week.startLocalDate, "2026-11-02");
    assert.equal(artifact.projection.week.endLocalDate, "2026-11-08");
    assert.equal(artifact.projection.week.evaluatedOffsetMinutes, -300);
    assert.deepEqual(artifact.projection.cohort.map((entry) => entry.utcOffsetMinutes), [-300, -300]);
  } finally {
    await vite.close();
  }
});

test("all bounded funnel losses remain separate and never inflate the outcome", async () => {
  const { vite, weekly } = await load();
  try {
    const artifact = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput());
    assert.equal(artifact.projection.newlyExportReadyCount, 2);
    assert.deepEqual(Object.keys(artifact.projection.losses), LOSS_KINDS);
    for (const kind of LOSS_KINDS) {
      assert.equal(artifact.projection.losses[kind].count, 1, kind);
      assert.equal(artifact.projection.losses[kind].eventIds.length, 1, kind);
    }
  } finally {
    await vite.close();
  }
});

test("Draft profiles are visibly excluded without changing generic behavior", async () => {
  const { vite, weekly } = await load();
  try {
    const draft = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput({
      profileLifecycle: "draft",
    }));
    assert.equal(draft.projection.profileIncluded, false);
    assert.deepEqual(draft.projection.blockedReasons, ["profile_not_operating"]);
    assert.equal(draft.projection.newlyExportReadyCount, 0);
    assert.equal(draft.projection.remainingToTarget, 7);
    for (const kind of LOSS_KINDS) assert.equal(draft.projection.losses[kind].count, 0);

    const generic = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput({
      companyId: "synthetic-second-company",
      productId: "synthetic-second-product",
      marketPlayId: "synthetic-second-play",
      profileId: "synthetic-profile-operating",
      timezone: "UTC",
      evaluatedAt: Date.parse("2026-03-11T16:00:00.000Z"),
      transitions: [transition(
        "synthetic-transition-generic",
        "synthetic-prospect-generic",
        Date.parse("2026-03-09T00:01:00.000Z"),
      )],
      losses: [],
    }));
    assert.equal(generic.projection.newlyExportReadyCount, 1);
    assert.equal(generic.projection.week.timezone, "UTC");
  } finally {
    await vite.close();
  }
});

test("a complete current synthetic tuple remains non-authoritative and zero-effect", async () => {
  const { vite, weekly } = await load();
  try {
    const artifact = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput());
    const decision = await weekly.evaluateSyntheticWeeklyOutcomeCandidate(evaluationInput(artifact));
    assert.equal(decision.status, "synthetic_weekly_outcome_current_no_authority");
    assert.deepEqual(decision.reasonCodes, []);
    assert.equal(decision.candidateDigest, artifact.digest);
    assert.equal(decision.operationalOutcomeClaimed, false);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
    for (const field of [
      "phaseExecutionAuthorized", "runtimeCompositionAuthorized", "scheduleAuthorized",
      "runnerAuthorized", "persistenceAuthorized", "exportAuthorized",
      "providerInvocationAuthorized",
    ]) assert.equal(decision[field], false, field);
  } finally {
    await vite.close();
  }
});

test("every current-authority failure rejects independently", async () => {
  const { vite, weekly } = await load();
  try {
    const artifact = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput());
    const cases = [
      ["weekly_scope_not_current", { scopeCurrent: false }],
      ["weekly_configuration_not_current", { configurationCurrent: false }],
      ["weekly_history_incomplete", { historyComplete: false }],
      ["weekly_transition_provenance_not_current", { transitionProvenanceCurrent: false }],
      ["weekly_timezone_policy_not_current", { timezonePolicyCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, patch] of cases) {
      const decision = await weekly.evaluateSyntheticWeeklyOutcomeCandidate(evaluationInput(artifact, {
        currentAuthority: currentAuthority(patch),
      }));
      assert.equal(decision.status, "synthetic_weekly_outcome_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("candidate, transition, target, timezone, or evaluation-time drift rejects", async () => {
  const { vite, weekly } = await load();
  try {
    const artifact = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput());
    for (const currentCandidate of [
      candidateInput({ weeklyTarget: 8 }),
      candidateInput({ timezone: "UTC" }),
      candidateInput({ transitions: candidateInput().transitions.slice(0, 2) }),
    ]) {
      const decision = await weekly.evaluateSyntheticWeeklyOutcomeCandidate(evaluationInput(artifact, { currentCandidate }));
      assert.equal(decision.status, "synthetic_weekly_outcome_rejected");
      assert.equal(decision.reasonCodes.includes("weekly_candidate_changed"), true);
    }
    const early = await weekly.evaluateSyntheticWeeklyOutcomeCandidate(evaluationInput(artifact, {
      currentAuthority: currentAuthority({ evaluatedAt: NOW - 1 }),
    }));
    assert.equal(early.reasonCodes.includes("evaluation_precedes_weekly_candidate"), true);
  } finally {
    await vite.close();
  }
});

test("duplicate, cross-profile, invalid timezone, target, and time shapes fail closed", async () => {
  const { vite, weekly } = await load();
  try {
    const base = candidateInput();
    const invalid = [
      { ...base, transitions: [...base.transitions, base.transitions[0]] },
      { ...base, losses: [...base.losses, base.losses[0]] },
      { ...base, transitions: [transition("synthetic-transition-foreign", "synthetic-prospect-x", NOW, { profileId: "synthetic-other-profile" })] },
      { ...base, losses: [loss("rejected", 20, { profileId: "synthetic-other-profile" })] },
      { ...base, timezone: "Not/A-Timezone" },
      { ...base, weekStartsOn: "sunday" },
      { ...base, weeklyTarget: 0 },
      { ...base, weeklyTarget: 1.5 },
      { ...base, evaluatedAt: 0 },
      { ...base, transitions: [transition("synthetic-transition-future", "synthetic-prospect-future", NOW + 1)] },
      { ...base, losses: [loss("rejected", 21, { occurredAt: NOW + 1 })] },
    ];
    for (const value of invalid) {
      await assert.rejects(
        weekly.buildSyntheticWeeklyOutcomeCandidate(value),
        /synthetic_phase7_weekly_outcome_candidate_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("hostile shapes, raw identities, sparse arrays, accessors, proxies, and extras fail closed", async () => {
  const { vite, weekly } = await load();
  try {
    const accessor = Object.defineProperty(candidateInput(), "workspaceId", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const sparse = candidateInput();
    sparse.transitions = [, ...sparse.transitions];
    for (const value of [
      accessor,
      new Proxy(candidateInput(), { ownKeys() { throw new Error("must-not-run"); } }),
      sparse,
      { ...candidateInput(), rawEmail: "person@example.com" },
      { ...candidateInput(), phone: "+14165550123" },
      { ...candidateInput(), csvRows: [] },
      { ...candidateInput(), providerPayload: {} },
    ]) {
      await assert.rejects(
        weekly.buildSyntheticWeeklyOutcomeCandidate(value),
        /synthetic_phase7_weekly_outcome_candidate_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("a forged artifact copy cannot enter evaluation", async () => {
  const { vite, weekly } = await load();
  try {
    const artifact = await weekly.buildSyntheticWeeklyOutcomeCandidate(candidateInput());
    await assert.rejects(
      weekly.evaluateSyntheticWeeklyOutcomeCandidate(evaluationInput({ ...artifact })),
      /synthetic_phase7_weekly_outcome_candidate_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("the preparation module has no runtime, persistence, export, provider, or effect seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-weekly-outcome.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(source.includes("operationalOutcomeClaimed: false"), true);
  assert.equal(source.includes("scheduleAuthorized: false"), true);
  assert.equal(source.includes("exportAuthorized: false"), true);
  assert.equal(source.includes("runtimeCompositionAuthorized: false"), true);
});
