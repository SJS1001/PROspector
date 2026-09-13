import { canonicalDigest } from "./enrichment-grant-issuance";
import {
  reduceWeeklyOutcome,
  WEEKLY_OUTCOME_TIME_ZONE,
  type ProspectHistoryEvent,
  type ProspectState,
  type WeeklyOutcomeResult,
} from "./weekly-outcome";

const STATES = Object.freeze([
  "Candidate", "Qualified", "NotQualified", "InsufficientEvidence", "Disqualified",
  "Approved", "Rejected", "Deferred", "ContactReady", "PackageReady", "ExportReady",
  "Contacted", "NeedsReview", "NonContactable",
] as const satisfies readonly ProspectState[]);
const ACTOR_KINDS = Object.freeze(["owner", "application", "runner", "import"] as const);
const SOURCE_KINDS = Object.freeze([
  "qualification", "owner_review", "contact_verification", "package_readiness",
  "export_readiness", "reconciliation",
] as const);
const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const REASON = /^[a-z0-9](?:[a-z0-9._:-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

type TransitionCommand = Readonly<{
  prospectId: string;
  expectedProspectRevision: number;
  eventKind: "prospect_created" | "state_transition";
  priorState: ProspectState | null;
  newState: ProspectState;
  actorKind: (typeof ACTOR_KINDS)[number];
  actorReferenceDigest: string;
  sourceKind: (typeof SOURCE_KINDS)[number];
  reasonCode: string;
  evidenceReferenceId: string;
  evidenceReferenceDigest: string;
  idempotencyKey: string;
  occurredAt: number;
}>;

export type ProspectTransitionRecord = TransitionCommand & Readonly<{
  id: string;
  workspaceId: string;
  sequence: number;
  operationDigest: string;
  createdAt: number;
}>;

export type RecordProspectTransitionResult =
  | Readonly<{ kind: "recorded"; record: ProspectTransitionRecord; replayed: boolean }>
  | Readonly<{ kind: "blocked"; reason: "invalid_request" | "owner_not_admitted" | "stale_revision" | "history_conflict" }>
  | Readonly<{ kind: "conflict"; reason: "idempotency_conflict" }>;

type ProspectScopeRow = {
  workspace_id: string;
  prospect_revision: number;
};

type TransitionRow = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  sequence: number;
  event_kind: string;
  prior_state: string | null;
  new_state: string;
  expected_prospect_revision: number;
  actor_kind: string;
  actor_reference_digest: string;
  source_kind: string;
  reason_code: string;
  evidence_reference_id: string;
  evidence_reference_digest: string;
  idempotency_key: string;
  operation_digest: string;
  occurred_at: number;
  created_at: number;
};

export async function recordProspectTransition(
  database: D1Database,
  ownerSubject: string,
  commandValue: unknown,
  clock: () => number = Date.now,
): Promise<RecordProspectTransitionResult> {
  const command = normalizeCommand(commandValue);
  const createdAt = clock();
  if (!command || !bounded(ownerSubject, 320) || !safeTime(createdAt)
    || command.occurredAt > createdAt) return blocked("invalid_request");

  const scope = await database.prepare(
    `SELECT prospect.workspace_id,prospect.revision prospect_revision
     FROM workspaces workspace
     JOIN profile_prospects prospect ON prospect.workspace_id=workspace.id AND prospect.id=?
     WHERE workspace.owner_subject=? LIMIT 2`,
  ).bind(command.prospectId, ownerSubject).all<ProspectScopeRow>();
  if (scope.results.length !== 1) return blocked("owner_not_admitted");
  const workspaceId = scope.results[0].workspace_id;

  const existing = await readByIdempotency(database, workspaceId, command.idempotencyKey);
  if (existing) return replayResult(existing, command, workspaceId);
  if (Number(scope.results[0].prospect_revision) !== command.expectedProspectRevision) {
    return blocked("stale_revision");
  }

  const prior = await database.prepare(
    `SELECT * FROM prospect_transition_events
     WHERE workspace_id=? AND prospect_id=? ORDER BY sequence DESC LIMIT 1`,
  ).bind(workspaceId, command.prospectId).first<TransitionRow>();
  const sequence = prior ? Number(prior.sequence) + 1 : 1;
  if (!validNext(command, prior)) return blocked("history_conflict");

  const operationDigest = await canonicalDigest(operationMaterial(workspaceId, sequence, command));
  const record: ProspectTransitionRecord = Object.freeze({
    id: `pte-${operationDigest}`,
    workspaceId,
    sequence,
    operationDigest,
    createdAt,
    ...command,
  });
  try {
    await database.prepare(
      `INSERT INTO prospect_transition_events (
        id,workspace_id,prospect_id,sequence,event_kind,prior_state,new_state,
        expected_prospect_revision,actor_kind,actor_reference_digest,source_kind,
        reason_code,evidence_reference_id,evidence_reference_digest,idempotency_key,
        operation_digest,occurred_at,created_at
      ) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE EXISTS (
          SELECT 1 FROM workspaces workspace
          JOIN profile_prospects prospect ON prospect.workspace_id=workspace.id
          WHERE workspace.id=? AND workspace.owner_subject=? AND prospect.id=?
            AND prospect.revision=?
        )`,
    ).bind(
      record.id, workspaceId, record.prospectId, record.sequence, record.eventKind,
      record.priorState, record.newState, record.expectedProspectRevision, record.actorKind,
      record.actorReferenceDigest, record.sourceKind, record.reasonCode,
      record.evidenceReferenceId, record.evidenceReferenceDigest, record.idempotencyKey,
      record.operationDigest, record.occurredAt, record.createdAt,
      workspaceId, ownerSubject, record.prospectId, record.expectedProspectRevision,
    ).run();
    const persisted = await readByIdempotency(database, workspaceId, command.idempotencyKey);
    return persisted && exactRecordMatch(persisted, record)
      ? Object.freeze({ kind: "recorded", record: fromRow(persisted), replayed: false })
      : blocked("history_conflict");
  } catch {
    const winner = await readByIdempotency(database, workspaceId, command.idempotencyKey);
    return winner ? replayResult(winner, command, workspaceId) : blocked("history_conflict");
  }
}

export type ReadWeeklyOutcomeResult =
  | Readonly<{ kind: "reported"; report: WeeklyOutcomeResult }>
  | Readonly<{ kind: "blocked"; reason: "invalid_request" | "owner_not_admitted" | "profile_not_reportable" }>;

type ReportRow = TransitionRow & {
  prospect_created_at: number;
  company_id: string;
  product_id: string;
  market_play_id: string;
  profile_id: string;
  profile_lifecycle: string;
};

export async function readWeeklyOutcomeFromTransitionHistory(
  database: D1Database,
  ownerSubject: string,
  profileId: string,
  asOf: string,
): Promise<ReadWeeklyOutcomeResult> {
  if (!bounded(ownerSubject, 320) || !stableId(profileId) || !instant(asOf)) {
    return Object.freeze({ kind: "blocked", reason: "invalid_request" });
  }
  const asOfMs = Date.parse(asOf);
  const scope = await database.prepare(
    `SELECT workspace.id workspace_id,company.id company_id,product.id product_id,
      play.id market_play_id,profile.id profile_id,profile.lifecycle profile_lifecycle
     FROM workspaces workspace
     JOIN companies company ON company.workspace_id=workspace.id
     JOIN products product ON product.workspace_id=workspace.id AND product.company_id=company.id
     JOIN market_plays play ON play.workspace_id=workspace.id AND play.product_id=product.id
     JOIN customer_profiles profile ON profile.workspace_id=workspace.id AND profile.play_id=play.id
     WHERE workspace.owner_subject=? AND profile.id=? LIMIT 2`,
  ).bind(ownerSubject, profileId).all<Omit<ReportRow, keyof TransitionRow | "prospect_created_at">>();
  if (scope.results.length !== 1) {
    return Object.freeze({ kind: "blocked", reason: "owner_not_admitted" });
  }
  const authority = scope.results[0];
  if (authority.profile_lifecycle !== "ready" && authority.profile_lifecycle !== "draft") {
    return Object.freeze({ kind: "blocked", reason: "profile_not_reportable" });
  }
  const rows = await database.prepare(
    `SELECT event.id,event.workspace_id,prospect.id prospect_id,event.sequence,
      event.event_kind,event.prior_state,event.new_state,event.expected_prospect_revision,
      event.actor_kind,event.actor_reference_digest,event.source_kind,event.reason_code,
      event.evidence_reference_id,event.evidence_reference_digest,event.idempotency_key,
      event.operation_digest,event.occurred_at,event.created_at,
      prospect.created_at prospect_created_at,
      company.id company_id,product.id product_id,play.id market_play_id,
      profile.id profile_id,profile.lifecycle profile_lifecycle
     FROM profile_prospects prospect
     JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=prospect.workspace_id
     JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id
     JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id
     JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
     LEFT JOIN prospect_transition_events event ON event.prospect_id=prospect.id
       AND event.workspace_id=prospect.workspace_id AND event.occurred_at<=?
     WHERE prospect.workspace_id=? AND prospect.profile_id=? AND prospect.created_at<=?
     ORDER BY prospect.id ASC,event.sequence ASC`,
  ).bind(asOfMs, authority.workspace_id, profileId, asOfMs).all<ReportRow>();

  const histories = new Map<string, { row: ReportRow; events: ProspectHistoryEvent[] }>();
  for (const row of rows.results) {
    const bucket = histories.get(row.prospect_id) ?? {
      row,
      events: [] as ProspectHistoryEvent[],
    };
    if (row.id !== null) bucket.events.push(toHistoryEvent(row));
    histories.set(row.prospect_id, bucket);
  }
  const prospectIds = [...histories.keys()].sort(compareText);
  const report = reduceWeeklyOutcome({
    scope: {
      workspaceId: authority.workspace_id,
      companyId: authority.company_id,
      productId: authority.product_id,
      marketPlayId: authority.market_play_id,
      profileId: authority.profile_id,
      profileLifecycle: authority.profile_lifecycle === "ready" ? "Operating" : "Draft",
    },
    timeZone: WEEKLY_OUTCOME_TIME_ZONE,
    asOf,
    coverage: { from: "prospect_origin", through: asOf, prospectIds },
    histories: prospectIds.map((prospectId) => {
      const entry = histories.get(prospectId)!;
      return {
        prospectId,
        workspaceId: authority.workspace_id,
        companyId: authority.company_id,
        productId: authority.product_id,
        marketPlayId: authority.market_play_id,
        profileId: authority.profile_id,
        events: entry.events,
      };
    }),
  });
  return Object.freeze({ kind: "reported", report });
}

function toHistoryEvent(row: ReportRow): ProspectHistoryEvent {
  const base = {
    eventId: row.id,
    sequence: Number(row.sequence),
    occurredAt: new Date(Number(row.occurred_at)).toISOString(),
    auditRef: { id: row.evidence_reference_id, digest: row.evidence_reference_digest },
  };
  return row.event_kind === "prospect_created"
    ? Object.freeze({ ...base, kind: "prospect_created" as const, initialState: "Candidate" as const })
    : Object.freeze({ ...base, kind: "state_transition" as const, fromState: row.prior_state as ProspectState, toState: row.new_state as ProspectState });
}

async function replayResult(
  row: TransitionRow,
  command: TransitionCommand,
  workspaceId: string,
): Promise<RecordProspectTransitionResult> {
  const digest = await canonicalDigest(operationMaterial(workspaceId, Number(row.sequence), command));
  if (row.operation_digest !== digest || !rowMatchesCommand(row, command)) {
    return Object.freeze({ kind: "conflict", reason: "idempotency_conflict" });
  }
  return Object.freeze({ kind: "recorded", record: fromRow(row), replayed: true });
}

function validNext(command: TransitionCommand, prior: TransitionRow | null): boolean {
  if (!prior) {
    return command.eventKind === "prospect_created"
      && command.priorState === null && command.newState === "Candidate";
  }
  return command.eventKind === "state_transition"
    && command.priorState === prior.new_state
    && command.newState !== command.priorState
    && command.occurredAt >= Number(prior.occurred_at);
}

function operationMaterial(workspaceId: string, sequence: number, command: TransitionCommand) {
  return {
    schema: "prospect-transition/v1",
    workspaceId,
    prospectId: command.prospectId,
    sequence,
    eventKind: command.eventKind,
    priorState: command.priorState,
    newState: command.newState,
    expectedProspectRevision: command.expectedProspectRevision,
    actorKind: command.actorKind,
    actorReferenceDigest: command.actorReferenceDigest,
    sourceKind: command.sourceKind,
    reasonCode: command.reasonCode,
    evidenceReferenceId: command.evidenceReferenceId,
    evidenceReferenceDigest: command.evidenceReferenceDigest,
    occurredAt: command.occurredAt,
  };
}

function normalizeCommand(value: unknown): TransitionCommand | null {
  const input = exactRecord(value, [
    "prospectId", "expectedProspectRevision", "eventKind", "priorState", "newState",
    "actorKind", "actorReferenceDigest", "sourceKind", "reasonCode",
    "evidenceReferenceId", "evidenceReferenceDigest", "idempotencyKey", "occurredAt",
  ]);
  if (!input || !stableId(input.prospectId) || !positiveInteger(input.expectedProspectRevision)
    || (input.eventKind !== "prospect_created" && input.eventKind !== "state_transition")
    || (input.priorState !== null && !state(input.priorState)) || !state(input.newState)
    || !member(input.actorKind, ACTOR_KINDS) || !digest(input.actorReferenceDigest)
    || !member(input.sourceKind, SOURCE_KINDS) || !reason(input.reasonCode)
    || !stableId(input.evidenceReferenceId) || !digest(input.evidenceReferenceDigest)
    || !stableId(input.idempotencyKey) || !safeTime(input.occurredAt)) return null;
  return Object.freeze(input as TransitionCommand);
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) return null;
  const actual = Object.keys(descriptors);
  if (actual.length !== keys.length || !sameMembers(actual, keys)) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !("value" in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function rowMatchesCommand(row: TransitionRow, command: TransitionCommand) {
  return row.prospect_id === command.prospectId
    && Number(row.expected_prospect_revision) === command.expectedProspectRevision
    && row.event_kind === command.eventKind && row.prior_state === command.priorState
    && row.new_state === command.newState && row.actor_kind === command.actorKind
    && row.actor_reference_digest === command.actorReferenceDigest
    && row.source_kind === command.sourceKind && row.reason_code === command.reasonCode
    && row.evidence_reference_id === command.evidenceReferenceId
    && row.evidence_reference_digest === command.evidenceReferenceDigest
    && row.idempotency_key === command.idempotencyKey
    && Number(row.occurred_at) === command.occurredAt;
}

function exactRecordMatch(row: TransitionRow, record: ProspectTransitionRecord) {
  return row.operation_digest === record.operationDigest && rowMatchesCommand(row, record)
    && row.id === record.id && row.workspace_id === record.workspaceId
    && Number(row.sequence) === record.sequence && Number(row.created_at) === record.createdAt;
}

function fromRow(row: TransitionRow): ProspectTransitionRecord {
  return Object.freeze({
    id: row.id, workspaceId: row.workspace_id, prospectId: row.prospect_id,
    sequence: Number(row.sequence), eventKind: row.event_kind as TransitionCommand["eventKind"],
    priorState: row.prior_state as ProspectState | null, newState: row.new_state as ProspectState,
    expectedProspectRevision: Number(row.expected_prospect_revision),
    actorKind: row.actor_kind as TransitionCommand["actorKind"],
    actorReferenceDigest: row.actor_reference_digest,
    sourceKind: row.source_kind as TransitionCommand["sourceKind"], reasonCode: row.reason_code,
    evidenceReferenceId: row.evidence_reference_id,
    evidenceReferenceDigest: row.evidence_reference_digest,
    idempotencyKey: row.idempotency_key, operationDigest: row.operation_digest,
    occurredAt: Number(row.occurred_at), createdAt: Number(row.created_at),
  });
}

async function readByIdempotency(database: D1Database, workspaceId: string, key: string) {
  return database.prepare(
    "SELECT * FROM prospect_transition_events WHERE workspace_id=? AND idempotency_key=? LIMIT 2",
  ).bind(workspaceId, key).first<TransitionRow>();
}

function state(value: unknown): value is ProspectState {
  return typeof value === "string" && STATES.includes(value as ProspectState);
}

function member<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function stableId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function reason(value: unknown): value is string {
  return typeof value === "string" && REASON.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function safeTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function instant(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  const sortedRight = [...right].sort(compareText);
  return left.length === right.length
    && [...left].sort(compareText).every((value, index) => value === sortedRight[index]);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function blocked(reason: Extract<RecordProspectTransitionResult, { kind: "blocked" }>["reason"]): RecordProspectTransitionResult {
  return Object.freeze({ kind: "blocked", reason });
}
