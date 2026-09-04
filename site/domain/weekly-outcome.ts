export const WEEKLY_OUTCOME_TIME_ZONE = "America/Toronto" as const;
export const WEEKLY_OUTCOME_TARGET = 7 as const;

export const WEEKLY_OUTCOME_LOSS_CATEGORIES = [
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
] as const;

export type WeeklyOutcomeLossCategory =
  (typeof WEEKLY_OUTCOME_LOSS_CATEGORIES)[number];

export type ProspectState =
  | "Candidate"
  | "Qualified"
  | "NotQualified"
  | "InsufficientEvidence"
  | "Disqualified"
  | "Approved"
  | "Rejected"
  | "Deferred"
  | "ContactReady"
  | "PackageReady"
  | "ExportReady"
  | "Contacted"
  | "NeedsReview"
  | "NonContactable";

export type WeeklyOutcomeScope = Readonly<{
  workspaceId: string;
  companyId: string;
  productId: string;
  marketPlayId: string;
  profileId: string;
  profileLifecycle: "Operating" | "Draft";
}>;

export type AuditReference = Readonly<{
  id: string;
  digest: string;
}>;

type HistoryEventBase = Readonly<{
  eventId: string;
  sequence: number;
  occurredAt: string;
  auditRef: AuditReference;
}>;

export type ProspectHistoryEvent =
  | (HistoryEventBase & Readonly<{
    kind: "prospect_created";
    initialState: "Candidate";
  }>)
  | (HistoryEventBase & Readonly<{
    kind: "state_transition";
    fromState: ProspectState;
    toState: ProspectState;
  }>)
  | (HistoryEventBase & Readonly<{
    kind: "contact_linked";
    contactId: string;
  }>)
  | (HistoryEventBase & Readonly<{
    kind: "loss";
    category: WeeklyOutcomeLossCategory;
    contactId: string | null;
  }>);

export type ProspectHistory = Readonly<{
  prospectId: string;
  workspaceId: string;
  companyId: string;
  productId: string;
  marketPlayId: string;
  profileId: string;
  events: readonly ProspectHistoryEvent[];
}>;

/**
 * `from: "prospect_origin"` means the adapter supplied every event from each
 * listed Prospect's creation through the exact evaluation instant. The
 * reducer verifies stream membership, origin, sequence, chronology, and state
 * continuity; it does not establish database provenance itself.
 */
export type WeeklyOutcomeHistoryInput = Readonly<{
  scope: WeeklyOutcomeScope;
  timeZone: typeof WEEKLY_OUTCOME_TIME_ZONE;
  asOf: string;
  coverage: Readonly<{
    from: "prospect_origin";
    through: string;
    prospectIds: readonly string[];
  }>;
  histories: readonly ProspectHistory[];
}>;

export type WeeklyOutcomeUnavailableReason =
  | "history_input_malformed"
  | "history_coverage_incomplete"
  | "history_scope_mismatch"
  | "history_stream_incomplete"
  | "history_sequence_incomplete"
  | "history_chronology_invalid"
  | "history_state_discontinuous"
  | "history_contains_future_event";

type ZonedInstant = Readonly<{
  localDate: string;
  instant: string;
  utcOffsetMinutes: number;
}>;

export type WeeklyOutcomeWeek = Readonly<{
  timeZone: typeof WEEKLY_OUTCOME_TIME_ZONE;
  startsOn: "monday";
  start: ZonedInstant;
  endLocalDate: string;
  endExclusive: ZonedInstant;
  evaluatedLocalDate: string;
  evaluatedUtcOffsetMinutes: number;
}>;

export type WeeklyOutcomeCohortEntry = Readonly<{
  prospectId: string;
  firstExportReadyEventId: string;
  occurredAt: string;
  localDate: string;
  utcOffsetMinutes: number;
  auditRef: AuditReference;
}>;

export type WeeklyOutcomeLossEntry = Readonly<{
  eventId: string;
  prospectId: string;
  contactId: string | null;
  occurredAt: string;
  localDate: string;
  utcOffsetMinutes: number;
  auditRef: AuditReference;
}>;

export type WeeklyOutcomeLossProjection = Readonly<Record<
  WeeklyOutcomeLossCategory,
  Readonly<{
    eventCount: number;
    distinctProspectCount: number;
    distinctContactCount: number;
    events: readonly WeeklyOutcomeLossEntry[];
  }>
>>;

export type WeeklyOutcomeAvailable = Readonly<{
  status: "available";
  scope: WeeklyOutcomeScope;
  asOf: string;
  week: WeeklyOutcomeWeek;
  profileIncluded: boolean;
  exclusions: readonly ("profile_not_operating")[];
  target: typeof WEEKLY_OUTCOME_TARGET;
  counts: Readonly<{
    distinctStableProspectCount: number;
    distinctStableContactCount: number;
    newlyExportReadyProspectCount: number;
    remainingProspectsToTarget: number;
  }>;
  cohort: readonly WeeklyOutcomeCohortEntry[];
  losses: WeeklyOutcomeLossProjection;
}>;

export type WeeklyOutcomeUnavailable = Readonly<{
  status: "unavailable";
  timeZone: typeof WEEKLY_OUTCOME_TIME_ZONE;
  target: typeof WEEKLY_OUTCOME_TARGET;
  reasonCodes: readonly WeeklyOutcomeUnavailableReason[];
  week: null;
  counts: null;
  cohort: readonly [];
  losses: null;
}>;

export type WeeklyOutcomeResult = WeeklyOutcomeAvailable | WeeklyOutcomeUnavailable;

const STATES: readonly ProspectState[] = [
  "Candidate", "Qualified", "NotQualified", "InsufficientEvidence", "Disqualified",
  "Approved", "Rejected", "Deferred", "ContactReady", "PackageReady", "ExportReady",
  "Contacted", "NeedsReview", "NonContactable",
];
const ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DAY_MS = 86_400_000;
const WEEKDAY_INDEX: Readonly<Record<string, number>> = Object.freeze({
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
});

class UnavailableHistory extends Error {
  constructor(readonly reason: WeeklyOutcomeUnavailableReason) {
    super(reason);
  }
}

/**
 * Reduces a complete authoritative history snapshot into the read-only weekly
 * outcome projection consumed by a future Morning Brief. It performs no I/O,
 * persistence, qualification, eligibility inference, or operational action.
 */
export function reduceWeeklyOutcome(input: WeeklyOutcomeHistoryInput): WeeklyOutcomeResult {
  try {
    const normalized = normalizeInput(input);
    return project(normalized);
  } catch (error) {
    return unavailable(error instanceof UnavailableHistory
      ? error.reason
      : "history_input_malformed");
  }
}

function normalizeInput(value: unknown): WeeklyOutcomeHistoryInput {
  const input = exactRecord(value, ["scope", "timeZone", "asOf", "coverage", "histories"]);
  const scope = normalizeScope(input.scope);
  if (input.timeZone !== WEEKLY_OUTCOME_TIME_ZONE) malformed();
  ensureTimeZoneAvailable(WEEKLY_OUTCOME_TIME_ZONE);
  const asOf = instant(input.asOf);
  const coverage = exactRecord(input.coverage, ["from", "through", "prospectIds"]);
  if (coverage.from !== "prospect_origin") incompleteCoverage();
  const through = instant(coverage.through);
  if (through !== asOf) incompleteCoverage();
  const prospectIds = denseArray(coverage.prospectIds).map(stableId);
  unique(prospectIds, "history_coverage_incomplete");
  const histories = denseArray(input.histories).map((entry) => normalizeHistory(entry, scope, asOf));
  unique(histories.map((entry) => entry.prospectId), "history_coverage_incomplete");
  if (!sameMembers(prospectIds, histories.map((entry) => entry.prospectId))) incompleteCoverage();
  const eventIds = histories.flatMap((entry) => entry.events.map((event) => event.eventId));
  const auditIds = histories.flatMap((entry) => entry.events.map((event) => event.auditRef.id));
  unique(eventIds, "history_stream_incomplete");
  unique(auditIds, "history_stream_incomplete");
  return deepFreeze({
    scope,
    timeZone: WEEKLY_OUTCOME_TIME_ZONE,
    asOf,
    coverage: { from: "prospect_origin", through, prospectIds: sortText(prospectIds) },
    histories: [...histories].sort((left, right) => compareText(left.prospectId, right.prospectId)),
  });
}

function normalizeScope(value: unknown): WeeklyOutcomeScope {
  const input = exactRecord(value, [
    "workspaceId", "companyId", "productId", "marketPlayId", "profileId",
    "profileLifecycle",
  ]);
  if (input.profileLifecycle !== "Operating" && input.profileLifecycle !== "Draft") malformed();
  return deepFreeze({
    workspaceId: stableId(input.workspaceId),
    companyId: stableId(input.companyId),
    productId: stableId(input.productId),
    marketPlayId: stableId(input.marketPlayId),
    profileId: stableId(input.profileId),
    profileLifecycle: input.profileLifecycle,
  });
}

function normalizeHistory(value: unknown, scope: WeeklyOutcomeScope, asOf: string): ProspectHistory {
  const input = exactRecord(value, [
    "prospectId", "workspaceId", "companyId", "productId", "marketPlayId", "profileId",
    "events",
  ]);
  const history = {
    prospectId: stableId(input.prospectId),
    workspaceId: stableId(input.workspaceId),
    companyId: stableId(input.companyId),
    productId: stableId(input.productId),
    marketPlayId: stableId(input.marketPlayId),
    profileId: stableId(input.profileId),
    events: denseArray(input.events).map(normalizeEvent),
  };
  for (const key of ["workspaceId", "companyId", "productId", "marketPlayId", "profileId"] as const) {
    if (history[key] !== scope[key]) fail("history_scope_mismatch");
  }
  validateStream(history.events, asOf);
  return deepFreeze(history);
}

function normalizeEvent(value: unknown): ProspectHistoryEvent {
  const discriminant = exactRecordAtLeast(value, ["kind"]);
  const kind = discriminant.kind;
  if (kind === "prospect_created") {
    const input = exactRecord(value, [
      "eventId", "sequence", "occurredAt", "auditRef", "kind", "initialState",
    ]);
    if (input.initialState !== "Candidate") malformed();
    return deepFreeze({ ...eventBase(input), kind, initialState: "Candidate" });
  }
  if (kind === "state_transition") {
    const input = exactRecord(value, [
      "eventId", "sequence", "occurredAt", "auditRef", "kind", "fromState", "toState",
    ]);
    const fromState = state(input.fromState);
    const toState = state(input.toState);
    if (fromState === toState) fail("history_state_discontinuous");
    return deepFreeze({ ...eventBase(input), kind, fromState, toState });
  }
  if (kind === "contact_linked") {
    const input = exactRecord(value, [
      "eventId", "sequence", "occurredAt", "auditRef", "kind", "contactId",
    ]);
    return deepFreeze({ ...eventBase(input), kind, contactId: stableId(input.contactId) });
  }
  if (kind === "loss") {
    const input = exactRecord(value, [
      "eventId", "sequence", "occurredAt", "auditRef", "kind", "category", "contactId",
    ]);
    const category = lossCategory(input.category);
    const contactId = input.contactId === null ? null : stableId(input.contactId);
    return deepFreeze({ ...eventBase(input), kind, category, contactId });
  }
  malformed();
}

function eventBase(input: Record<string, unknown>): HistoryEventBase {
  return {
    eventId: stableId(input.eventId),
    sequence: positiveInteger(input.sequence),
    occurredAt: instant(input.occurredAt),
    auditRef: normalizeAuditRef(input.auditRef),
  };
}

function normalizeAuditRef(value: unknown): AuditReference {
  const input = exactRecord(value, ["id", "digest"]);
  if (typeof input.digest !== "string" || !DIGEST.test(input.digest)) malformed();
  return deepFreeze({ id: stableId(input.id), digest: input.digest });
}

function validateStream(events: readonly ProspectHistoryEvent[], asOf: string) {
  if (events.length === 0 || events[0].kind !== "prospect_created") {
    fail("history_stream_incomplete");
  }
  let priorTime = -1;
  let currentState: ProspectState = "Candidate";
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index + 1) fail("history_sequence_incomplete");
    const time = Date.parse(event.occurredAt);
    if (time > Date.parse(asOf)) fail("history_contains_future_event");
    if (time < priorTime) fail("history_chronology_invalid");
    priorTime = time;
    if (index > 0 && event.kind === "prospect_created") fail("history_stream_incomplete");
    if (event.kind === "state_transition") {
      if (event.fromState !== currentState) fail("history_state_discontinuous");
      currentState = event.toState;
    }
  }
}

function project(input: WeeklyOutcomeHistoryInput): WeeklyOutcomeAvailable {
  const week = projectWeek(input.asOf);
  const profileIncluded = input.scope.profileLifecycle === "Operating";
  const cohort: WeeklyOutcomeCohortEntry[] = [];
  const stableContacts = new Set<string>();
  const lossEvents = new Map<WeeklyOutcomeLossCategory, WeeklyOutcomeLossEntry[]>(
    WEEKLY_OUTCOME_LOSS_CATEGORIES.map((category) => [category, []]),
  );

  for (const history of input.histories) {
    for (const event of history.events) {
      if (event.kind === "contact_linked") stableContacts.add(event.contactId);
      if (profileIncluded && event.kind === "loss" && inWeek(event.occurredAt, week)) {
        const local = localDateInfo(event.occurredAt);
        lossEvents.get(event.category)?.push(deepFreeze({
          eventId: event.eventId,
          prospectId: history.prospectId,
          contactId: event.contactId,
          occurredAt: event.occurredAt,
          localDate: local.localDate,
          utcOffsetMinutes: local.utcOffsetMinutes,
          auditRef: event.auditRef,
        }));
      }
    }
    if (!profileIncluded) continue;
    const firstExportReady = history.events.find((event) => (
      event.kind === "state_transition" && event.toState === "ExportReady"
    ));
    if (!firstExportReady || !inWeek(firstExportReady.occurredAt, week)) continue;
    const local = localDateInfo(firstExportReady.occurredAt);
    cohort.push(deepFreeze({
      prospectId: history.prospectId,
      firstExportReadyEventId: firstExportReady.eventId,
      occurredAt: firstExportReady.occurredAt,
      localDate: local.localDate,
      utcOffsetMinutes: local.utcOffsetMinutes,
      auditRef: firstExportReady.auditRef,
    }));
  }

  cohort.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || compareText(left.prospectId, right.prospectId));
  const projectLoss = (category: WeeklyOutcomeLossCategory) => {
    const events = lossEvents.get(category) ?? [];
    events.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
      || compareText(left.eventId, right.eventId));
    return deepFreeze({
      eventCount: events.length,
      distinctProspectCount: new Set(events.map((event) => event.prospectId)).size,
      distinctContactCount: new Set(events.flatMap((event) => (
        event.contactId === null ? [] : [event.contactId]
      ))).size,
      events,
    });
  };
  const losses: WeeklyOutcomeLossProjection = deepFreeze({
    rejected: projectLoss("rejected"),
    deferred: projectLoss("deferred"),
    enrichment_failed: projectLoss("enrichment_failed"),
    enrichment_uncertain: projectLoss("enrichment_uncertain"),
    review_delayed: projectLoss("review_delayed"),
    contact_stale_or_invalid: projectLoss("contact_stale_or_invalid"),
    package_invalid: projectLoss("package_invalid"),
    suppressed: projectLoss("suppressed"),
    high_risk_drift: projectLoss("high_risk_drift"),
    reversal: projectLoss("reversal"),
  });

  return deepFreeze({
    status: "available",
    scope: input.scope,
    asOf: input.asOf,
    week,
    profileIncluded,
    exclusions: profileIncluded ? [] : ["profile_not_operating"],
    target: WEEKLY_OUTCOME_TARGET,
    counts: {
      distinctStableProspectCount: input.histories.length,
      distinctStableContactCount: stableContacts.size,
      newlyExportReadyProspectCount: cohort.length,
      remainingProspectsToTarget: Math.max(WEEKLY_OUTCOME_TARGET - cohort.length, 0),
    },
    cohort,
    losses,
  });
}

function projectWeek(asOf: string): WeeklyOutcomeWeek {
  const evaluated = localDateInfo(asOf);
  const localEpoch = parseLocalDate(evaluated.localDate);
  const startEpoch = localEpoch - evaluated.weekdayIndex * DAY_MS;
  const startLocalDate = utcDate(startEpoch);
  const endLocalDate = utcDate(startEpoch + 6 * DAY_MS);
  const endExclusiveLocalDate = utcDate(startEpoch + 7 * DAY_MS);
  return deepFreeze({
    timeZone: WEEKLY_OUTCOME_TIME_ZONE,
    startsOn: "monday",
    start: zonedMidnight(startLocalDate),
    endLocalDate,
    endExclusive: zonedMidnight(endExclusiveLocalDate),
    evaluatedLocalDate: evaluated.localDate,
    evaluatedUtcOffsetMinutes: evaluated.utcOffsetMinutes,
  });
}

function inWeek(occurredAt: string, week: WeeklyOutcomeWeek) {
  const localDate = localDateInfo(occurredAt).localDate;
  return localDate >= week.start.localDate && localDate <= week.endLocalDate;
}

function localDateInfo(value: string | number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: WEEKLY_OUTCOME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZoneName: "longOffset",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  const weekdayIndex = WEEKDAY_INDEX[parts.weekday];
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  if (weekdayIndex === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(localDate)) malformed();
  return {
    localDate,
    weekdayIndex,
    utcOffsetMinutes: offsetMinutes(parts.timeZoneName),
  };
}

function zonedMidnight(localDate: string): ZonedInstant {
  const naiveUtc = parseLocalDate(localDate);
  let candidate = naiveUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = localDateInfo(candidate).utcOffsetMinutes;
    candidate = naiveUtc - offset * 60_000;
  }
  const resolved = localDateInfo(candidate);
  if (resolved.localDate !== localDate) malformed();
  return deepFreeze({
    localDate,
    instant: new Date(candidate).toISOString(),
    utcOffsetMinutes: resolved.utcOffsetMinutes,
  });
}

function offsetMinutes(value: string | undefined) {
  if (value === "GMT" || value === "UTC") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(value ?? "");
  if (!match) malformed();
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

function unavailable(reason: WeeklyOutcomeUnavailableReason): WeeklyOutcomeUnavailable {
  return deepFreeze({
    status: "unavailable",
    timeZone: WEEKLY_OUTCOME_TIME_ZONE,
    target: WEEKLY_OUTCOME_TARGET,
    reasonCodes: [reason],
    week: null,
    counts: null,
    cohort: [],
    losses: null,
  });
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) malformed();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) malformed();
  const actual = Object.keys(descriptors);
  if (actual.length !== keys.length || !sameMembers(actual, keys)) malformed();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !("value" in descriptor)) malformed();
    result[key] = descriptor.value;
  }
  return result;
}

function exactRecordAtLeast(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) malformed();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !("value" in descriptor)) malformed();
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10_000) malformed();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  const actual = Object.keys(descriptors).filter((key) => key !== "length");
  if (!sameMembers(expected, actual)) malformed();
  return expected.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !("value" in descriptor)) malformed();
    return descriptor.value;
  });
}

function stableId(value: unknown) {
  if (typeof value !== "string" || !ID.test(value)) malformed();
  return value;
}

function instant(value: unknown) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) malformed();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) malformed();
  return value;
}

function positiveInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) {
    malformed();
  }
  return value as number;
}

function state(value: unknown): ProspectState {
  if (typeof value !== "string" || !STATES.includes(value as ProspectState)) malformed();
  return value as ProspectState;
}

function lossCategory(value: unknown): WeeklyOutcomeLossCategory {
  if (typeof value !== "string"
    || !WEEKLY_OUTCOME_LOSS_CATEGORIES.includes(value as WeeklyOutcomeLossCategory)) malformed();
  return value as WeeklyOutcomeLossCategory;
}

function ensureTimeZoneAvailable(value: string) {
  try {
    if (new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone !== value) {
      malformed();
    }
  } catch {
    malformed();
  }
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcDate(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && [...left].sort(compareText).every((value, index) => value === [...right].sort(compareText)[index]);
}

function unique(values: readonly string[], reason: WeeklyOutcomeUnavailableReason) {
  if (new Set(values).size !== values.length) fail(reason);
}

function sortText(values: readonly string[]) {
  return [...values].sort(compareText);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function incompleteCoverage(): never {
  fail("history_coverage_incomplete");
}

function malformed(): never {
  fail("history_input_malformed");
}

function fail(reason: WeeklyOutcomeUnavailableReason): never {
  throw new UnavailableHistory(reason);
}
