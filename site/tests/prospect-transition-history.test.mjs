import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_DISCOVERY_NOW,
  PERSON_DISCOVERY_OWNER,
  createPersonDiscoveryFixture,
} from "./helpers/person-discovery-fixture.mjs";

const ACTOR = "1".repeat(64);

async function setup(name) {
  const fixture = await createPersonDiscoveryFixture(name);
  const history = await fixture.vite.ssrLoadModule(
    new URL("../domain/prospect-transition-history.ts", import.meta.url).pathname,
  );
  return { fixture, history };
}

function command(overrides = {}) {
  return {
    prospectId: "person-discovery-prospect",
    expectedProspectRevision: 1,
    eventKind: "prospect_created",
    priorState: null,
    newState: "Candidate",
    actorKind: "application",
    actorReferenceDigest: ACTOR,
    sourceKind: "qualification",
    reasonCode: "candidate_admitted",
    evidenceReferenceId: "evidence-created",
    evidenceReferenceDigest: "2".repeat(64),
    idempotencyKey: "transition-created",
    occurredAt: PERSON_DISCOVERY_NOW,
    ...overrides,
  };
}

async function record({ history, fixture }, value, now = PERSON_DISCOVERY_NOW + 10_000) {
  return history.recordProspectTransition(
    fixture.database,
    PERSON_DISCOVERY_OWNER.subject,
    value,
    () => now,
  );
}

test("transition writes are tenant-scoped and the schema rejects cross-tenant references", async (t) => {
  const context = await setup("prospect-transition-tenant");
  t.after(() => context.fixture.dispose());

  assert.deepEqual(
    await context.history.recordProspectTransition(
      context.fixture.database,
      "different-owner",
      command(),
      () => PERSON_DISCOVERY_NOW + 10_000,
    ),
    { kind: "blocked", reason: "owner_not_admitted" },
  );
  assert.equal(Number((await context.fixture.database.prepare(
    "SELECT COUNT(*) count FROM prospect_transition_events",
  ).first()).count), 0);
  assert.deepEqual(
    await record(context, command({ actorReferenceDigest: "owner@example.test" })),
    { kind: "blocked", reason: "invalid_request" },
  );

  await context.fixture.database.prepare(
    "INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES ('other-workspace','Other','other-owner',?,?,1)",
  ).bind(PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW).run();
  await assert.rejects(
    context.fixture.database.prepare(
      `INSERT INTO prospect_transition_events (
        id,workspace_id,prospect_id,sequence,event_kind,prior_state,new_state,
        expected_prospect_revision,actor_kind,actor_reference_digest,source_kind,
        reason_code,evidence_reference_id,evidence_reference_digest,idempotency_key,
        operation_digest,occurred_at,created_at
      ) VALUES ('forged','other-workspace','person-discovery-prospect',1,'prospect_created',NULL,'Candidate',1,'application',?,'qualification','candidate_admitted','evidence-forged',?,'forged-key',?,?,?)`,
    ).bind(ACTOR, "3".repeat(64), "4".repeat(64), PERSON_DISCOVERY_NOW, PERSON_DISCOVERY_NOW).run(),
    /exact tenant and prospect revision/u,
  );
});

test("an exact duplicate replays while changed use of the same key conflicts", async (t) => {
  const context = await setup("prospect-transition-replay");
  t.after(() => context.fixture.dispose());
  const input = command();
  const first = await record(context, input);
  const replay = await record(context, input, PERSON_DISCOVERY_NOW + 20_000);
  assert.equal(first.kind, "recorded");
  assert.equal(first.replayed, false);
  assert.equal(replay.kind, "recorded");
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.record, first.record);

  assert.deepEqual(
    await record(context, { ...input, reasonCode: "changed_reason" }),
    { kind: "conflict", reason: "idempotency_conflict" },
  );
  assert.equal(Number((await context.fixture.database.prepare(
    "SELECT COUNT(*) count FROM prospect_transition_events",
  ).first()).count), 1);
});

test("history is append-only, contiguous, chronological, and revision-bound", async (t) => {
  const context = await setup("prospect-transition-order");
  t.after(() => context.fixture.dispose());
  await record(context, command());
  const qualified = command({
    eventKind: "state_transition",
    priorState: "Candidate",
    newState: "Qualified",
    sourceKind: "qualification",
    reasonCode: "qualification_passed",
    evidenceReferenceId: "evidence-qualified",
    evidenceReferenceDigest: "5".repeat(64),
    idempotencyKey: "transition-qualified",
    occurredAt: PERSON_DISCOVERY_NOW + 1_000,
  });
  assert.equal((await record(context, qualified)).kind, "recorded");
  assert.deepEqual(
    await record(context, command({
      eventKind: "state_transition", priorState: "Candidate", newState: "Approved",
      sourceKind: "owner_review", reasonCode: "owner_approved",
      evidenceReferenceId: "evidence-bad-order", evidenceReferenceDigest: "6".repeat(64),
      idempotencyKey: "transition-bad-order", occurredAt: PERSON_DISCOVERY_NOW + 2_000,
    })),
    { kind: "blocked", reason: "history_conflict" },
  );
  assert.deepEqual(
    await record(context, { ...qualified, idempotencyKey: "transition-stale", expectedProspectRevision: 2 }),
    { kind: "blocked", reason: "stale_revision" },
  );
  const rows = (await context.fixture.database.prepare(
    "SELECT sequence,new_state FROM prospect_transition_events ORDER BY sequence",
  ).all()).results;
  assert.deepEqual(rows, [
    { sequence: 1, new_state: "Candidate" },
    { sequence: 2, new_state: "Qualified" },
  ]);
  await assert.rejects(
    context.fixture.database.prepare("UPDATE prospect_transition_events SET reason_code='changed' WHERE sequence=2").run(),
    /immutable/u,
  );
  await assert.rejects(
    context.fixture.database.prepare("DELETE FROM prospect_transition_events WHERE sequence=2").run(),
    /immutable/u,
  );
});

test("weekly reporting consumes durable history and counts only the first ExportReady transition", async (t) => {
  const context = await setup("prospect-transition-report");
  t.after(() => context.fixture.dispose());
  const asOf = new Date(PERSON_DISCOVERY_NOW + 60_000).toISOString();
  const absent = await context.history.readWeeklyOutcomeFromTransitionHistory(
    context.fixture.database,
    PERSON_DISCOVERY_OWNER.subject,
    context.fixture.profileId,
    asOf,
  );
  assert.equal(absent.kind, "reported");
  assert.equal(absent.report.status, "unavailable");
  assert.deepEqual(absent.report.reasonCodes, ["history_stream_incomplete"]);

  const states = ["Candidate", "Qualified", "Approved", "ContactReady", "PackageReady", "ExportReady"];
  await record(context, command());
  for (let index = 1; index < states.length; index += 1) {
    const newState = states[index];
    const result = await record(context, command({
      eventKind: "state_transition",
      priorState: states[index - 1],
      newState,
      actorKind: newState === "Approved" ? "owner" : "application",
      sourceKind: newState === "Approved" ? "owner_review"
        : newState === "ContactReady" ? "contact_verification"
          : newState === "PackageReady" ? "package_readiness"
            : newState === "ExportReady" ? "export_readiness" : "qualification",
      reasonCode: `entered_${newState.replace(/([a-z])([A-Z])/gu, "$1_$2").toLowerCase()}`,
      evidenceReferenceId: `evidence-${index}`,
      evidenceReferenceDigest: String(index + 2).repeat(64),
      idempotencyKey: `transition-${index}`,
      occurredAt: PERSON_DISCOVERY_NOW + index * 1_000,
    }));
    assert.equal(result.kind, "recorded");
  }
  const result = await context.history.readWeeklyOutcomeFromTransitionHistory(
    context.fixture.database,
    PERSON_DISCOVERY_OWNER.subject,
    context.fixture.profileId,
    asOf,
  );
  assert.equal(result.kind, "reported");
  assert.equal(result.report.status, "available");
  assert.equal(result.report.counts.newlyExportReadyProspectCount, 1);
  assert.equal(result.report.cohort[0].prospectId, context.fixture.prospectId);
  assert.equal(result.report.cohort[0].auditRef.id, "evidence-5");
  assert.deepEqual(
    await context.history.readWeeklyOutcomeFromTransitionHistory(
      context.fixture.database,
      "different-owner",
      context.fixture.profileId,
      asOf,
    ),
    { kind: "blocked", reason: "owner_not_admitted" },
  );
});
