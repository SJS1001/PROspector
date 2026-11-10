import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const AS_OF = "2026-03-16T03:59:59.999Z";
const DIGEST = "a".repeat(64);
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
      weekly: await vite.ssrLoadModule(new URL(
        "../domain/weekly-outcome.ts",
        import.meta.url,
      ).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function auditRef(prospectId, sequence) {
  return { id: `audit-${prospectId}-${sequence}`, digest: DIGEST };
}

function created(occurredAt = "2026-01-01T05:00:00.000Z") {
  return { kind: "prospect_created", occurredAt, initialState: "Candidate" };
}

function transition(occurredAt, fromState, toState) {
  return { kind: "state_transition", occurredAt, fromState, toState };
}

function contact(occurredAt, contactId) {
  return { kind: "contact_linked", occurredAt, contactId };
}

function loss(occurredAt, category, contactId = null) {
  return { kind: "loss", occurredAt, category, contactId };
}

function history(prospectId, specifications, patch = {}) {
  return {
    prospectId,
    workspaceId: "workspace-main",
    companyId: "company-main",
    productId: "product-main",
    marketPlayId: "play-main",
    profileId: "profile-operating",
    events: specifications.map((specification, index) => ({
      eventId: `event-${prospectId}-${index + 1}`,
      sequence: index + 1,
      auditRef: auditRef(prospectId, index + 1),
      ...specification,
    })),
    ...patch,
  };
}

function input(histories, patch = {}) {
  return {
    scope: {
      workspaceId: "workspace-main",
      companyId: "company-main",
      productId: "product-main",
      marketPlayId: "play-main",
      profileId: "profile-operating",
      profileLifecycle: "Operating",
    },
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

function exportPath(occurredAt) {
  return [
    created(),
    transition("2026-02-01T05:00:00.000Z", "Candidate", "Qualified"),
    transition("2026-02-02T05:00:00.000Z", "Qualified", "Approved"),
    transition("2026-02-03T05:00:00.000Z", "Approved", "ContactReady"),
    transition("2026-02-04T05:00:00.000Z", "ContactReady", "PackageReady"),
    transition(occurredAt, "PackageReady", "ExportReady"),
  ];
}

test("counts only each stable Prospect's first-ever ExportReady transition at exact week boundaries", async () => {
  const { vite, weekly } = await load();
  try {
    const monday = history("prospect-monday", [
      ...exportPath("2026-03-09T04:00:00.000Z"),
      contact("2026-03-10T12:00:00.000Z", "contact-a"),
      contact("2026-03-10T12:01:00.000Z", "contact-b"),
    ]);
    const sundayPath = exportPath(AS_OF);
    const sunday = history("prospect-sunday", [
      ...sundayPath.slice(0, -1),
      contact("2026-03-15T12:00:00.000Z", "contact-c"),
      sundayPath.at(-1),
    ]);
    const reentered = history("prospect-reentered", [
      ...exportPath("2026-03-09T03:59:59.999Z"),
      transition("2026-03-10T12:00:00.000Z", "ExportReady", "NeedsReview"),
      loss("2026-03-10T12:00:00.000Z", "reversal"),
      transition("2026-03-11T12:00:00.000Z", "NeedsReview", "ExportReady"),
      contact("2026-03-12T12:00:00.000Z", "contact-a"),
    ]);
    const notReady = history("prospect-contact-ready", [
      created(),
      transition("2026-03-10T10:00:00.000Z", "Candidate", "Qualified"),
      transition("2026-03-10T11:00:00.000Z", "Qualified", "Approved"),
      transition("2026-03-10T12:00:00.000Z", "Approved", "ContactReady"),
    ]);
    const result = weekly.reduceWeeklyOutcome(input([
      reentered, notReady, sunday, monday,
    ]));

    assert.equal(result.status, "available");
    assert.deepEqual(result.week, {
      timeZone: "America/Toronto",
      startsOn: "monday",
      start: {
        localDate: "2026-03-09",
        instant: "2026-03-09T04:00:00.000Z",
        utcOffsetMinutes: -240,
      },
      endLocalDate: "2026-03-15",
      endExclusive: {
        localDate: "2026-03-16",
        instant: "2026-03-16T04:00:00.000Z",
        utcOffsetMinutes: -240,
      },
      evaluatedLocalDate: "2026-03-15",
      evaluatedUtcOffsetMinutes: -240,
    });
    assert.equal(result.target, 7);
    assert.deepEqual(result.cohort.map((entry) => entry.prospectId), [
      "prospect-monday", "prospect-sunday",
    ]);
    assert.equal(result.counts.newlyExportReadyProspectCount, 2);
    assert.equal(result.counts.remainingProspectsToTarget, 5);
    assert.equal(result.counts.distinctStableProspectCount, 4);
    assert.equal(result.counts.distinctStableContactCount, 3);
    assert.equal(result.losses.reversal.eventCount, 1);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.cohort), true);
  } finally {
    await vite.close();
  }
});

test("projects spring-forward and fall-back weeks with their distinct boundary offsets", async () => {
  const { vite, weekly } = await load();
  try {
    const springAsOf = "2026-03-09T03:59:59.999Z";
    const spring = weekly.reduceWeeklyOutcome(input([], {
      asOf: springAsOf,
      coverage: { from: "prospect_origin", through: springAsOf, prospectIds: [] },
    }));
    assert.equal(spring.status, "available");
    assert.deepEqual(spring.week.start, {
      localDate: "2026-03-02",
      instant: "2026-03-02T05:00:00.000Z",
      utcOffsetMinutes: -300,
    });
    assert.deepEqual(spring.week.endExclusive, {
      localDate: "2026-03-09",
      instant: "2026-03-09T04:00:00.000Z",
      utcOffsetMinutes: -240,
    });

    const fallAsOf = "2026-11-02T04:59:59.999Z";
    const fall = weekly.reduceWeeklyOutcome(input([], {
      asOf: fallAsOf,
      coverage: { from: "prospect_origin", through: fallAsOf, prospectIds: [] },
    }));
    assert.equal(fall.status, "available");
    assert.deepEqual(fall.week.start, {
      localDate: "2026-10-26",
      instant: "2026-10-26T04:00:00.000Z",
      utcOffsetMinutes: -240,
    });
    assert.deepEqual(fall.week.endExclusive, {
      localDate: "2026-11-02",
      instant: "2026-11-02T05:00:00.000Z",
      utcOffsetMinutes: -300,
    });
  } finally {
    await vite.close();
  }
});

test("keeps all ten loss categories and their Prospect/contact counts independent", async () => {
  const { vite, weekly } = await load();
  try {
    const events = [created(), contact("2026-03-09T12:00:00.000Z", "contact-one")];
    LOSS_CATEGORIES.forEach((category, index) => {
      events.push(loss(
        `2026-03-${String(10 + Math.floor(index / 4)).padStart(2, "0")}T${String(index % 4).padStart(2, "0")}:00:00.000Z`,
        category,
        index % 2 === 0 ? "contact-one" : "contact-two",
      ));
    });
    const result = weekly.reduceWeeklyOutcome(input([history("prospect-losses", events)]));
    assert.equal(result.status, "available");
    assert.deepEqual(Object.keys(result.losses), LOSS_CATEGORIES);
    for (const category of LOSS_CATEGORIES) {
      assert.equal(result.losses[category].eventCount, 1, category);
      assert.equal(result.losses[category].distinctProspectCount, 1, category);
      assert.equal(result.losses[category].distinctContactCount, 1, category);
    }
    assert.equal(result.counts.newlyExportReadyProspectCount, 0);
    assert.equal(result.counts.distinctStableContactCount, 1);
  } finally {
    await vite.close();
  }
});

test("Approved and ContactReady never imply ExportReady", async () => {
  const { vite, weekly } = await load();
  try {
    const approved = history("prospect-approved", [
      created(),
      transition("2026-03-10T12:00:00.000Z", "Candidate", "Qualified"),
      transition("2026-03-10T13:00:00.000Z", "Qualified", "Approved"),
    ]);
    const contactReady = history("prospect-ready-contact", [
      created(),
      transition("2026-03-10T12:00:00.000Z", "Candidate", "Qualified"),
      transition("2026-03-10T13:00:00.000Z", "Qualified", "Approved"),
      transition("2026-03-10T14:00:00.000Z", "Approved", "ContactReady"),
    ]);
    const result = weekly.reduceWeeklyOutcome(input([approved, contactReady]));
    assert.equal(result.status, "available");
    assert.equal(result.counts.newlyExportReadyProspectCount, 0);
    assert.deepEqual(result.cohort, []);
  } finally {
    await vite.close();
  }
});

test("Draft and alternate non-Mining hierarchies are data-driven exclusions and scope", async () => {
  const { vite, weekly } = await load();
  try {
    const nonMining = history("prospect-logistics", [
      ...exportPath("2026-03-11T12:00:00.000Z"),
      contact("2026-03-12T12:00:00.000Z", "contact-logistics"),
    ], {
      companyId: "company-logistics",
      productId: "product-routing",
      marketPlayId: "play-port-operators",
      profileId: "profile-terminal-operators",
    });
    const genericScope = {
      workspaceId: "workspace-main",
      companyId: "company-logistics",
      productId: "product-routing",
      marketPlayId: "play-port-operators",
      profileId: "profile-terminal-operators",
      profileLifecycle: "Operating",
    };
    const operating = weekly.reduceWeeklyOutcome(input([nonMining], { scope: genericScope }));
    assert.equal(operating.status, "available");
    assert.equal(operating.counts.newlyExportReadyProspectCount, 1);
    assert.equal(operating.scope.marketPlayId, "play-port-operators");

    const draft = weekly.reduceWeeklyOutcome(input([nonMining], {
      scope: { ...genericScope, profileLifecycle: "Draft" },
    }));
    assert.equal(draft.status, "available");
    assert.equal(draft.profileIncluded, false);
    assert.deepEqual(draft.exclusions, ["profile_not_operating"]);
    assert.equal(draft.counts.distinctStableProspectCount, 0);
    assert.equal(draft.counts.distinctStableContactCount, 0);
    assert.equal(draft.counts.newlyExportReadyProspectCount, 0);
    for (const category of LOSS_CATEGORIES) assert.equal(draft.losses[category].eventCount, 0);
  } finally {
    await vite.close();
  }
});

test("rejects complete history snapshots above the aggregate event bound", async () => {
  const { vite, weekly } = await load();
  try {
    const historyCount = 11;
    const eventsPerHistory = Math.ceil((weekly.WEEKLY_OUTCOME_MAX_TOTAL_EVENTS + 1) / historyCount);
    assert.ok(eventsPerHistory <= weekly.WEEKLY_OUTCOME_MAX_EVENTS_PER_PROSPECT);
    const histories = Array.from({ length: historyCount }, (_, historyIndex) => history(
      `prospect-event-cap-${historyIndex}`,
      [
        created(),
        ...Array.from({ length: eventsPerHistory - 1 }, (_, eventIndex) => contact(
          "2026-03-10T12:00:00.000Z",
          `contact-event-cap-${historyIndex}-${eventIndex}`,
        )),
      ],
    ));
    const result = weekly.reduceWeeklyOutcome(input(histories));
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.reasonCodes, ["history_event_limit_exceeded"]);
    assert.equal(result.counts, null);
    assert.equal(result.losses, null);
  } finally {
    await vite.close();
  }
});

test("missing or incomplete origin-to-asOf coverage is unavailable, never zero-success", async () => {
  const { vite, weekly } = await load();
  try {
    const complete = history("prospect-complete", [created()]);
    const cases = [
      input([complete], {
        coverage: { from: "prospect_origin", through: AS_OF, prospectIds: [] },
      }),
      input([], {
        coverage: { from: "prospect_origin", through: AS_OF, prospectIds: ["prospect-missing"] },
      }),
      input([complete], {
        coverage: { from: "partial_window", through: AS_OF, prospectIds: ["prospect-complete"] },
      }),
      input([complete], {
        coverage: {
          from: "prospect_origin",
          through: "2026-03-16T03:59:59.998Z",
          prospectIds: ["prospect-complete"],
        },
      }),
    ];
    for (const value of cases) {
      const result = weekly.reduceWeeklyOutcome(value);
      assert.equal(result.status, "unavailable");
      assert.deepEqual(result.reasonCodes, ["history_coverage_incomplete"]);
      assert.equal(result.counts, null);
      assert.equal(result.losses, null);
      assert.deepEqual(result.cohort, []);
    }
  } finally {
    await vite.close();
  }
});

test("future events and malformed histories fail closed as unavailable", async () => {
  const { vite, weekly } = await load();
  try {
    const future = history("prospect-future", [
      created(),
      transition("2026-03-16T04:00:00.000Z", "Candidate", "ExportReady"),
    ]);
    const futureResult = weekly.reduceWeeklyOutcome(input([future]));
    assert.equal(futureResult.status, "unavailable");
    assert.deepEqual(futureResult.reasonCodes, ["history_contains_future_event"]);
    assert.equal(futureResult.counts, null);

    const noOrigin = history("prospect-no-origin", [
      transition("2026-03-10T12:00:00.000Z", "Candidate", "Qualified"),
    ]);
    assert.deepEqual(
      weekly.reduceWeeklyOutcome(input([noOrigin])).reasonCodes,
      ["history_stream_incomplete"],
    );

    const sequenceGap = history("prospect-gap", [created(), contact(
      "2026-03-10T12:00:00.000Z",
      "contact-gap",
    )]);
    sequenceGap.events[1].sequence = 3;
    assert.deepEqual(
      weekly.reduceWeeklyOutcome(input([sequenceGap])).reasonCodes,
      ["history_sequence_incomplete"],
    );

    const discontinuous = history("prospect-discontinuous", [
      created(),
      transition("2026-03-10T12:00:00.000Z", "Approved", "ExportReady"),
    ]);
    assert.deepEqual(
      weekly.reduceWeeklyOutcome(input([discontinuous])).reasonCodes,
      ["history_state_discontinuous"],
    );
  } finally {
    await vite.close();
  }
});

test("cross-scope, extra-field, sparse, and accessor-backed inputs fail closed", async () => {
  const { vite, weekly } = await load();
  try {
    const foreign = history("prospect-foreign", [created()], { workspaceId: "workspace-other" });
    assert.deepEqual(
      weekly.reduceWeeklyOutcome(input([foreign])).reasonCodes,
      ["history_scope_mismatch"],
    );

    const extra = input([]);
    extra.exportReady = true;
    assert.deepEqual(
      weekly.reduceWeeklyOutcome(extra).reasonCodes,
      ["history_input_malformed"],
    );

    const sparse = input([]);
    sparse.histories = [,];
    assert.deepEqual(
      weekly.reduceWeeklyOutcome(sparse).reasonCodes,
      ["history_input_malformed"],
    );

    for (const field of ["histories", "prospectIds", "events"]) {
      const tagged = input([history("prospect-tagged", [created()])]);
      const array = field === "histories" ? tagged.histories
        : field === "prospectIds" ? tagged.coverage.prospectIds : tagged.histories[0].events;
      array[Symbol("unknown")] = "unexpected";
      assert.deepEqual(weekly.reduceWeeklyOutcome(tagged).reasonCodes,
        ["history_input_malformed"], `${field} rejects symbol-backed extras`);
    }
    assert.equal(Object.isFrozen(weekly.WEEKLY_OUTCOME_LOSS_CATEGORIES), true);

    const accessor = Object.defineProperty(input([]), "histories", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    assert.deepEqual(
      weekly.reduceWeeklyOutcome(accessor).reasonCodes,
      ["history_input_malformed"],
    );
  } finally {
    await vite.close();
  }
});

// -- 07-01 Task 1 additions: target arithmetic, cohort evidence, reversal, scope --

const LOGISTICS_HIERARCHY = {
  companyId: "company-logistics",
  productId: "product-routing",
  marketPlayId: "play-port-operators",
  profileId: "profile-terminal-operators",
};

function logisticsScope(patch = {}) {
  return { workspaceId: "workspace-main", ...LOGISTICS_HIERARCHY, profileLifecycle: "Operating", ...patch };
}

test("seven Prospects with more than seven contact rows count seven, leave zero remaining, and never count contacts toward the target", async () => {
  const { vite, weekly } = await load();
  try {
    const histories = Array.from({ length: 7 }, (_, index) => history(`prospect-seven-${index}`, [
      ...exportPath(`2026-03-${String(9 + (index % 5)).padStart(2, "0")}T15:00:00.000Z`),
      contact("2026-03-14T12:00:00.000Z", `contact-${index}-a`),
      contact("2026-03-14T12:01:00.000Z", `contact-${index}-b`),
    ]));
    const result = weekly.reduceWeeklyOutcome(input(histories));
    assert.equal(result.status, "available");
    assert.equal(result.counts.newlyExportReadyProspectCount, 7);
    assert.equal(result.counts.remainingProspectsToTarget, 0);
    assert.equal(result.counts.distinctStableContactCount, 14);
    assert.ok(result.counts.distinctStableContactCount > result.target);

    // One Prospect with seven contacts is still one toward the target.
    const lone = history("prospect-lone", [
      ...exportPath("2026-03-10T15:00:00.000Z"),
      ...Array.from({ length: 7 }, (_, i) => contact(`2026-03-10T16:0${i}:00.000Z`, `lone-contact-${i}`)),
    ]);
    const loneResult = weekly.reduceWeeklyOutcome(input([lone]));
    assert.equal(loneResult.counts.newlyExportReadyProspectCount, 1);
    assert.equal(loneResult.counts.remainingProspectsToTarget, 6);
    assert.equal(loneResult.counts.distinctStableContactCount, 7);
  } finally {
    await vite.close();
  }
});

test("the remaining count never goes negative when the week exceeds seven", async () => {
  const { vite, weekly } = await load();
  try {
    const histories = Array.from({ length: 9 }, (_, index) => history(`prospect-over-${index}`, exportPath(`2026-03-10T1${index}:00:00.000Z`)));
    const result = weekly.reduceWeeklyOutcome(input(histories));
    assert.equal(result.counts.newlyExportReadyProspectCount, 9);
    assert.equal(result.counts.remainingProspectsToTarget, 0);
  } finally {
    await vite.close();
  }
});

test("a first Export-ready in an earlier week is never recounted by a later reversal and re-export", async () => {
  const { vite, weekly } = await load();
  try {
    const earlier = history("prospect-earlier", [
      ...exportPath("2026-03-03T15:00:00.000Z"),
      transition("2026-03-10T12:00:00.000Z", "ExportReady", "NeedsReview"),
      loss("2026-03-10T12:00:00.000Z", "reversal"),
      transition("2026-03-11T12:00:00.000Z", "NeedsReview", "ExportReady"),
    ]);
    const result = weekly.reduceWeeklyOutcome(input([earlier]));
    assert.equal(result.counts.newlyExportReadyProspectCount, 0);
    assert.deepEqual(result.cohort, []);
    assert.equal(result.losses.reversal.eventCount, 1, "the reversal stays visible");
    assert.equal(result.losses.reversal.distinctProspectCount, 1);
    assert.equal(result.counts.distinctStableProspectCount, 1);

    // Reversal in the same week keeps the Prospect counted once and the loss visible.
    const sameWeek = history("prospect-same-week", [
      ...exportPath("2026-03-09T15:00:00.000Z"),
      transition("2026-03-10T12:00:00.000Z", "ExportReady", "NeedsReview"),
      loss("2026-03-10T12:00:00.000Z", "reversal"),
      transition("2026-03-11T12:00:00.000Z", "NeedsReview", "ExportReady"),
    ]);
    const sameResult = weekly.reduceWeeklyOutcome(input([sameWeek]));
    assert.equal(sameResult.counts.newlyExportReadyProspectCount, 1);
    assert.equal(sameResult.cohort[0].occurredAt, "2026-03-09T15:00:00.000Z");
    assert.equal(sameResult.losses.reversal.eventCount, 1);
  } finally {
    await vite.close();
  }
});

test("each cohort entry stores its first-transition audit reference and the Toronto offset in force", async () => {
  const { vite, weekly } = await load();
  try {
    const result = weekly.reduceWeeklyOutcome(input([
      history("prospect-audit", exportPath("2026-03-12T14:30:00.000Z")),
    ]));
    const [entry] = result.cohort;
    assert.equal(entry.prospectId, "prospect-audit");
    assert.equal(entry.firstExportReadyEventId, "event-prospect-audit-6");
    assert.deepEqual(entry.auditRef, { id: "audit-prospect-audit-6", digest: DIGEST });
    assert.equal(entry.occurredAt, "2026-03-12T14:30:00.000Z");
    assert.equal(entry.localDate, "2026-03-12");
    assert.equal(entry.utcOffsetMinutes, -240);

    const winterAsOf = "2026-02-02T04:59:59.999Z";
    const winter = weekly.reduceWeeklyOutcome(input([
      history("prospect-winter", [
        { ...created(), occurredAt: "2025-12-01T05:00:00.000Z" },
        transition("2026-01-05T05:00:00.000Z", "Candidate", "Qualified"),
        transition("2026-01-06T05:00:00.000Z", "Qualified", "Approved"),
        transition("2026-01-07T05:00:00.000Z", "Approved", "ContactReady"),
        transition("2026-01-08T05:00:00.000Z", "ContactReady", "PackageReady"),
        transition("2026-01-28T14:30:00.000Z", "PackageReady", "ExportReady"),
      ]),
    ], {
      asOf: winterAsOf,
      coverage: { from: "prospect_origin", through: winterAsOf, prospectIds: ["prospect-winter"] },
    }));
    assert.equal(winter.status, "available");
    assert.equal(winter.cohort[0].utcOffsetMinutes, -300);
    assert.equal(winter.cohort[0].localDate, "2026-01-28");
  } finally {
    await vite.close();
  }
});

test("a UTC-Monday instant that is still the previous Toronto Sunday belongs to the earlier week", async () => {
  const { vite, weekly } = await load();
  try {
    // 2026-03-16T01:00Z is Sunday 21:00 in Toronto (EDT), so it is in the week ending 2026-03-15.
    const asOf = "2026-03-16T03:59:59.999Z";
    const lateSunday = history("prospect-late-sunday", exportPath("2026-03-16T01:00:00.000Z"));
    const result = weekly.reduceWeeklyOutcome(input([lateSunday], { asOf, coverage: { from: "prospect_origin", through: asOf, prospectIds: ["prospect-late-sunday"] } }));
    assert.equal(result.cohort.length, 1);
    assert.equal(result.cohort[0].localDate, "2026-03-15");

    // One millisecond later is Toronto Monday: next week, so the earlier week no longer holds it.
    const nextAsOf = "2026-03-16T04:00:00.000Z";
    const monday = weekly.reduceWeeklyOutcome(input([lateSunday], { asOf: nextAsOf, coverage: { from: "prospect_origin", through: nextAsOf, prospectIds: ["prospect-late-sunday"] } }));
    assert.equal(monday.week.start.localDate, "2026-03-16");
    assert.deepEqual(monday.cohort, []);
    assert.equal(monday.counts.newlyExportReadyProspectCount, 0);
  } finally {
    await vite.close();
  }
});

test("a second non-Mining hierarchy projects independently and a mixed-hierarchy snapshot is refused rather than summed", async () => {
  const { vite, weekly } = await load();
  try {
    const logisticsHistory = (id, at) => history(id, exportPath(at), LOGISTICS_HIERARCHY);
    const logistics = weekly.reduceWeeklyOutcome(input([
      logisticsHistory("prospect-port-1", "2026-03-10T15:00:00.000Z"),
      logisticsHistory("prospect-port-2", "2026-03-11T15:00:00.000Z"),
    ], { scope: logisticsScope() }));
    const main = weekly.reduceWeeklyOutcome(input([
      history("prospect-main-1", exportPath("2026-03-10T15:00:00.000Z")),
    ]));
    assert.equal(logistics.counts.newlyExportReadyProspectCount, 2);
    assert.equal(main.counts.newlyExportReadyProspectCount, 1);
    assert.deepEqual(logistics.cohort.map((entry) => entry.prospectId), ["prospect-port-1", "prospect-port-2"]);
    assert.equal(logistics.scope.companyId, "company-logistics");

    const mixed = weekly.reduceWeeklyOutcome(input([
      history("prospect-main-1", exportPath("2026-03-10T15:00:00.000Z")),
      logisticsHistory("prospect-port-1", "2026-03-10T15:00:00.000Z"),
    ]));
    assert.equal(mixed.status, "unavailable");
    assert.deepEqual(mixed.reasonCodes, ["history_scope_mismatch"]);
    assert.equal(mixed.counts, null);

    // The hierarchy is data: the same histories under a Draft logistics profile contribute nothing.
    const draft = weekly.reduceWeeklyOutcome(input([
      logisticsHistory("prospect-port-1", "2026-03-10T15:00:00.000Z"),
    ], { scope: logisticsScope({ profileLifecycle: "Draft" }) }));
    assert.equal(draft.profileIncluded, false);
    assert.equal(draft.counts.newlyExportReadyProspectCount, 0);
  } finally {
    await vite.close();
  }
});

test("the reducer derives success from history only: CSV rows, export counts, or current state fields are rejected", async () => {
  const { vite, weekly } = await load();
  try {
    const base = history("prospect-csv", exportPath("2026-03-10T15:00:00.000Z"));
    for (const extra of [
      { csvRows: 7 },
      { exportedContactRows: 14 },
      { currentState: "ExportReady" },
      { newlyExportReadyProspectCount: 7 },
    ]) {
      const result = weekly.reduceWeeklyOutcome(input([{ ...base, ...extra }]));
      assert.equal(result.status, "unavailable", JSON.stringify(extra));
      assert.equal(result.counts, null, JSON.stringify(extra));
    }
    const topLevel = weekly.reduceWeeklyOutcome(input([base], { csvRowCount: 14 }));
    assert.equal(topLevel.status, "unavailable");
    assert.equal(topLevel.counts, null);
  } finally {
    await vite.close();
  }
});

test("the reducer is pure: frozen input is not mutated, repeat calls match, and input order does not change the result", async () => {
  const { vite, weekly } = await load();
  try {
    const histories = [
      history("prospect-b", [...exportPath("2026-03-11T15:00:00.000Z"), contact("2026-03-11T16:00:00.000Z", "contact-b")]),
      history("prospect-a", [...exportPath("2026-03-10T15:00:00.000Z"), contact("2026-03-10T16:00:00.000Z", "contact-a")]),
    ];
    const deepFreeze = (value) => {
      if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
      return value;
    };
    const frozen = deepFreeze(input(histories));
    const snapshot = JSON.stringify(frozen);
    const first = weekly.reduceWeeklyOutcome(frozen);
    const second = weekly.reduceWeeklyOutcome(frozen);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(frozen), snapshot);
    const reversed = weekly.reduceWeeklyOutcome(input([...histories].reverse()));
    assert.deepEqual(reversed.cohort, first.cohort);
    assert.deepEqual(reversed.counts, first.counts);
    assert.deepEqual(first.cohort.map((entry) => entry.prospectId), ["prospect-a", "prospect-b"]);
  } finally {
    await vite.close();
  }
});

// 07-10: the weekday 06:00 America/Toronto schedule is a Phase 4 run time, not a
// week boundary. The weekly cohort starts at local Monday midnight, so an
// Export-ready transition before Monday's 06:00 run still belongs to that week,
// and the reducer never reads a schedule, run, or runner field.
test("the weekly window is local Monday midnight, not the weekday 06:00 schedule time, and schedule input is refused", async () => {
  const { vite, weekly } = await load();
  try {
    const asOf = "2026-03-23T03:59:59.999Z"; // Sunday 23:59:59.999 EDT, end of the week of 2026-03-16
    const coverage = (ids) => ({ from: "prospect_origin", through: asOf, prospectIds: ids });
    const beforeRun = history("prospect-before-run", exportPath("2026-03-16T09:59:59.999Z")); // Monday 05:59:59.999 EDT
    const atRun = history("prospect-at-run", exportPath("2026-03-16T10:00:00.000Z")); // Monday 06:00 EDT
    const lastWeek = history("prospect-last-sunday", exportPath("2026-03-16T03:59:59.999Z")); // Sunday 23:59:59.999 EDT
    const result = weekly.reduceWeeklyOutcome(input([beforeRun, atRun, lastWeek], { asOf, coverage: coverage(["prospect-before-run", "prospect-at-run", "prospect-last-sunday"]) }));
    assert.equal(result.status, "available");
    assert.equal(result.week.start.localDate, "2026-03-16");
    assert.equal(result.week.start.instant, "2026-03-16T04:00:00.000Z");
    assert.deepEqual(result.cohort.map((entry) => entry.prospectId).sort(), ["prospect-at-run", "prospect-before-run"]);
    assert.equal(result.counts.newlyExportReadyProspectCount, 2);
    // The reducer takes no schedule, run, or runner input: any such field fails closed.
    for (const field of ["schedule", "scheduledAt", "runId", "runner", "nextRunAt"]) {
      const refused = weekly.reduceWeeklyOutcome({ ...input([atRun], { asOf, coverage: coverage(["prospect-at-run"]) }), [field]: "2026-03-16T10:00:00.000Z" });
      assert.equal(refused.status, "unavailable", field);
    }
  } finally {
    await vite.close();
  }
});
