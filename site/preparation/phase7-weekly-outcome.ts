type Effects = Readonly<{
  scheduleMutations: 0;
  runnerCalls: 0;
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

const PROFILE_LIFECYCLES = ["operating", "draft"] as const;
const LOSS_KINDS = [
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
type ProfileLifecycle = (typeof PROFILE_LIFECYCLES)[number];
type LossKind = (typeof LOSS_KINDS)[number];

type Transition = Readonly<{
  id: string;
  prospectId: string;
  profileId: string;
  kind: "export_ready";
  occurredAt: number;
  auditRefId: string;
  auditDigest: string;
}>;

type LossEvent = Readonly<{
  id: string;
  prospectId: string;
  profileId: string;
  kind: LossKind;
  occurredAt: number;
  auditRefId: string;
  auditDigest: string;
}>;

type CandidateSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  companyId: string;
  productId: string;
  marketPlayId: string;
  profileId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  profileLifecycle: ProfileLifecycle;
  timezone: string;
  weekStartsOn: "monday";
  weeklyTarget: number;
  evaluatedAt: number;
  transitions: readonly Transition[];
  losses: readonly LossEvent[];
}>;

type CohortEntry = Readonly<{
  prospectId: string;
  firstTransitionId: string;
  occurredAt: number;
  localDate: string;
  utcOffsetMinutes: number;
  auditRefId: string;
  auditDigest: string;
}>;

type WeekProjection = Readonly<{
  timezone: string;
  startsOn: "monday";
  startLocalDate: string;
  endLocalDate: string;
  evaluatedLocalDate: string;
  evaluatedOffsetMinutes: number;
}>;

type LossProjection = Readonly<Record<LossKind, Readonly<{
  count: number;
  eventIds: readonly string[];
  auditRefIds: readonly string[];
}>>>;

type WeeklyProjection = Readonly<{
  week: WeekProjection;
  profileIncluded: boolean;
  blockedReasons: readonly string[];
  weeklyTarget: number;
  newlyExportReadyCount: number;
  remainingToTarget: number;
  cohort: readonly CohortEntry[];
  losses: LossProjection;
}>;

export type SyntheticWeeklyOutcomeCandidate = Readonly<{
  kind: "synthetic_phase7_weekly_outcome_candidate";
  id: string;
  digest: string;
  snapshot: CandidateSnapshot;
  projection: WeeklyProjection;
  operationalOutcomeClaimed: false;
  historyCompletenessProven: false;
  phaseExecutionAuthorized: false;
  runtimeCompositionAuthorized: false;
  scheduleAuthorized: false;
  runnerAuthorized: false;
  persistenceAuthorized: false;
  exportAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

type CurrentAuthority = Readonly<{
  evaluatedAt: number;
  scopeCurrent: boolean;
  configurationCurrent: boolean;
  historyComplete: boolean;
  transitionProvenanceCurrent: boolean;
  timezonePolicyCurrent: boolean;
  externalEffectsDisabled: boolean;
}>;

type LocalDateInfo = Readonly<{
  localDate: string;
  weekStartLocalDate: string;
  weekEndLocalDate: string;
  utcOffsetMinutes: number;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const DAY_MS = 86_400_000;
const WEEKDAY_INDEX: Readonly<Record<string, number>> = Object.freeze({
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
});
const candidates = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  scheduleMutations: 0,
  runnerCalls: 0,
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Builds one synthetic weekly-outcome candidate. Modeled transition references
 * are not operational evidence, and the result cannot schedule, persist,
 * export, invoke a provider, or execute a Phase 7 plan.
 */
export async function buildSyntheticWeeklyOutcomeCandidate(
  value: unknown,
): Promise<SyntheticWeeklyOutcomeCandidate> {
  try {
    const snapshot = normalizeCandidate(value);
    const projection = projectWeeklyOutcome(snapshot);
    const artifact: SyntheticWeeklyOutcomeCandidate = deepFreeze({
      kind: "synthetic_phase7_weekly_outcome_candidate",
      id: snapshot.id,
      digest: await sha256(JSON.stringify({ snapshot, projection })),
      snapshot,
      projection,
      operationalOutcomeClaimed: false,
      historyCompletenessProven: false,
      phaseExecutionAuthorized: false,
      runtimeCompositionAuthorized: false,
      scheduleAuthorized: false,
      runnerAuthorized: false,
      persistenceAuthorized: false,
      exportAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    candidates.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_phase7_weekly_outcome_candidate_invalid");
  }
}

/**
 * Rechecks the closed synthetic inputs. Even a current tuple remains a
 * non-operational, zero-effect preparation decision.
 */
export async function evaluateSyntheticWeeklyOutcomeCandidate(value: unknown) {
  try {
    const input = exactRecord(value, [
      "candidateArtifact", "currentCandidate", "currentAuthority",
    ]);
    if (!candidates.has(input.candidateArtifact as object)) invalid();
    const artifact = input.candidateArtifact as SyntheticWeeklyOutcomeCandidate;
    const current = await buildSyntheticWeeklyOutcomeCandidate(input.currentCandidate);
    const authority = normalizeAuthority(input.currentAuthority);
    const reasons: string[] = [];

    if (current.digest !== artifact.digest) reasons.push("weekly_candidate_changed");
    if (!authority.scopeCurrent) reasons.push("weekly_scope_not_current");
    if (!authority.configurationCurrent) reasons.push("weekly_configuration_not_current");
    if (!authority.historyComplete) reasons.push("weekly_history_incomplete");
    if (!authority.transitionProvenanceCurrent) {
      reasons.push("weekly_transition_provenance_not_current");
    }
    if (!authority.timezonePolicyCurrent) reasons.push("weekly_timezone_policy_not_current");
    if (!authority.externalEffectsDisabled) reasons.push("external_effects_not_disabled");
    if (authority.evaluatedAt < artifact.snapshot.evaluatedAt) {
      reasons.push("evaluation_precedes_weekly_candidate");
    }

    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    return deepFreeze({
      kind: "synthetic_phase7_weekly_outcome_decision" as const,
      status: reasonCodes.length === 0
        ? "synthetic_weekly_outcome_current_no_authority" as const
        : "synthetic_weekly_outcome_rejected" as const,
      candidateId: artifact.id,
      candidateDigest: artifact.digest,
      workspaceId: artifact.snapshot.workspaceId,
      profileId: artifact.snapshot.profileId,
      profileConfigurationId: artifact.snapshot.profileConfigurationId,
      week: artifact.projection.week,
      newlyExportReadyCount: artifact.projection.newlyExportReadyCount,
      cohortProspectIds: deepFreeze(artifact.projection.cohort.map((entry) => entry.prospectId)),
      reasonCodes,
      operationalOutcomeClaimed: false as const,
      historyCompletenessProven: false as const,
      phaseExecutionAuthorized: false as const,
      runtimeCompositionAuthorized: false as const,
      scheduleAuthorized: false as const,
      runnerAuthorized: false as const,
      persistenceAuthorized: false as const,
      exportAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_phase7_weekly_outcome_candidate_invalid");
  }
}

function normalizeCandidate(value: unknown): CandidateSnapshot {
  const input = exactRecord(value, [
    "id", "workspaceId", "companyId", "productId", "marketPlayId", "profileId",
    "profileConfigurationId", "profileConfigurationDigest", "profileLifecycle",
    "timezone", "weekStartsOn", "weeklyTarget", "evaluatedAt", "transitions", "losses",
  ]);
  const profileId = syntheticId(input.profileId);
  const evaluatedAt = timestamp(input.evaluatedAt);
  const transitions = normalizeTransitions(input.transitions, profileId, evaluatedAt);
  const losses = normalizeLosses(input.losses, profileId, evaluatedAt);
  return deepFreeze({
    id: syntheticId(input.id),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    productId: syntheticId(input.productId),
    marketPlayId: syntheticId(input.marketPlayId),
    profileId,
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    profileLifecycle: enumValue(input.profileLifecycle, PROFILE_LIFECYCLES),
    timezone: timezone(input.timezone),
    weekStartsOn: exactString(input.weekStartsOn, "monday"),
    weeklyTarget: boundedInteger(input.weeklyTarget, 1, 10_000),
    evaluatedAt,
    transitions,
    losses,
  });
}

function normalizeTransitions(
  value: unknown,
  profileId: string,
  evaluatedAt: number,
): readonly Transition[] {
  const transitions = denseArray(value, 0, 4_096).map((entry) => {
    const input = exactRecord(entry, [
      "id", "prospectId", "profileId", "kind", "occurredAt", "auditRefId", "auditDigest",
    ]);
    const normalized: Transition = deepFreeze({
      id: syntheticId(input.id),
      prospectId: syntheticId(input.prospectId),
      profileId: syntheticId(input.profileId),
      kind: exactString(input.kind, "export_ready"),
      occurredAt: timestamp(input.occurredAt),
      auditRefId: syntheticId(input.auditRefId),
      auditDigest: digest(input.auditDigest),
    });
    if (normalized.profileId !== profileId || normalized.occurredAt > evaluatedAt) invalid();
    return normalized;
  });
  assertUnique(transitions.map((entry) => entry.id));
  assertUnique(transitions.map((entry) => entry.auditRefId));
  return deepFreeze(transitions.sort(compareOccurredId));
}

function normalizeLosses(
  value: unknown,
  profileId: string,
  evaluatedAt: number,
): readonly LossEvent[] {
  const losses = denseArray(value, 0, 4_096).map((entry) => {
    const input = exactRecord(entry, [
      "id", "prospectId", "profileId", "kind", "occurredAt", "auditRefId", "auditDigest",
    ]);
    const normalized: LossEvent = deepFreeze({
      id: syntheticId(input.id),
      prospectId: syntheticId(input.prospectId),
      profileId: syntheticId(input.profileId),
      kind: enumValue(input.kind, LOSS_KINDS),
      occurredAt: timestamp(input.occurredAt),
      auditRefId: syntheticId(input.auditRefId),
      auditDigest: digest(input.auditDigest),
    });
    if (normalized.profileId !== profileId || normalized.occurredAt > evaluatedAt) invalid();
    return normalized;
  });
  assertUnique(losses.map((entry) => entry.id));
  assertUnique(losses.map((entry) => entry.auditRefId));
  return deepFreeze(losses.sort((left, right) => (
    LOSS_KINDS.indexOf(left.kind) - LOSS_KINDS.indexOf(right.kind)
    || compareOccurredId(left, right)
  )));
}

function projectWeeklyOutcome(snapshot: CandidateSnapshot): WeeklyProjection {
  const evaluated = localDateInfo(snapshot.evaluatedAt, snapshot.timezone);
  const profileIncluded = snapshot.profileLifecycle === "operating";
  const blockedReasons = deepFreeze(profileIncluded ? [] : ["profile_not_operating"]);
  const firstByProspect = new Map<string, Transition>();
  for (const entry of snapshot.transitions) {
    if (!firstByProspect.has(entry.prospectId)) firstByProspect.set(entry.prospectId, entry);
  }
  const cohort = profileIncluded
    ? [...firstByProspect.values()].flatMap((entry): CohortEntry[] => {
      const local = localDateInfo(entry.occurredAt, snapshot.timezone);
      if (local.weekStartLocalDate !== evaluated.weekStartLocalDate) return [];
      return [deepFreeze({
        prospectId: entry.prospectId,
        firstTransitionId: entry.id,
        occurredAt: entry.occurredAt,
        localDate: local.localDate,
        utcOffsetMinutes: local.utcOffsetMinutes,
        auditRefId: entry.auditRefId,
        auditDigest: entry.auditDigest,
      })];
    }).sort((left, right) => left.occurredAt - right.occurredAt
      || compareText(left.prospectId, right.prospectId))
    : [];
  const losses = buildLossProjection(snapshot, evaluated.weekStartLocalDate, profileIncluded);
  return deepFreeze({
    week: {
      timezone: snapshot.timezone,
      startsOn: "monday",
      startLocalDate: evaluated.weekStartLocalDate,
      endLocalDate: evaluated.weekEndLocalDate,
      evaluatedLocalDate: evaluated.localDate,
      evaluatedOffsetMinutes: evaluated.utcOffsetMinutes,
    },
    profileIncluded,
    blockedReasons,
    weeklyTarget: snapshot.weeklyTarget,
    newlyExportReadyCount: cohort.length,
    remainingToTarget: Math.max(snapshot.weeklyTarget - cohort.length, 0),
    cohort: deepFreeze(cohort),
    losses,
  });
}

function buildLossProjection(
  snapshot: CandidateSnapshot,
  currentWeekStart: string,
  profileIncluded: boolean,
): LossProjection {
  return deepFreeze(Object.fromEntries(LOSS_KINDS.map((kind) => {
    const entries = profileIncluded
      ? snapshot.losses.filter((entry) => (
        entry.kind === kind
        && localDateInfo(entry.occurredAt, snapshot.timezone).weekStartLocalDate === currentWeekStart
      ))
      : [];
    return [kind, deepFreeze({
      count: entries.length,
      eventIds: deepFreeze(entries.map((entry) => entry.id)),
      auditRefIds: deepFreeze(entries.map((entry) => entry.auditRefId)),
    })];
  }))) as LossProjection;
}

function normalizeAuthority(value: unknown): CurrentAuthority {
  const input = exactRecord(value, [
    "evaluatedAt", "scopeCurrent", "configurationCurrent", "historyComplete",
    "transitionProvenanceCurrent", "timezonePolicyCurrent", "externalEffectsDisabled",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    scopeCurrent: booleanValue(input.scopeCurrent),
    configurationCurrent: booleanValue(input.configurationCurrent),
    historyComplete: booleanValue(input.historyComplete),
    transitionProvenanceCurrent: booleanValue(input.transitionProvenanceCurrent),
    timezonePolicyCurrent: booleanValue(input.timezonePolicyCurrent),
    externalEffectsDisabled: booleanValue(input.externalEffectsDisabled),
  });
}

function localDateInfo(value: number, zone: string): LocalDateInfo {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZoneName: "longOffset",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const weekdayIndex = WEEKDAY_INDEX[parts.weekday];
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month)
    || !Number.isSafeInteger(day) || weekdayIndex === undefined) invalid();
  const localDateEpoch = Date.UTC(year, month - 1, day);
  const weekStartEpoch = localDateEpoch - weekdayIndex * DAY_MS;
  return deepFreeze({
    localDate: utcDate(localDateEpoch),
    weekStartLocalDate: utcDate(weekStartEpoch),
    weekEndLocalDate: utcDate(weekStartEpoch + 6 * DAY_MS),
    utcOffsetMinutes: offsetMinutes(parts.timeZoneName),
  });
}

function offsetMinutes(value: string) {
  if (value === "GMT" || value === "UTC") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(value);
  if (!match) invalid();
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

function utcDate(value: number) {
  const date = new Date(value);
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

function timezone(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) invalid();
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: value })
      .resolvedOptions().timeZone;
    if (canonical !== value) invalid();
    return value;
  } catch {
    invalid();
  }
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const keys = Object.keys(descriptors);
  if (keys.sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const expected = [...Array(value.length).keys()].map(String);
  const actual = Object.keys(descriptors).filter((key) => key !== "length");
  if (actual.sort().join("\0") !== expected.sort().join("\0")) invalid();
  return expected.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    return descriptor.value;
  });
}

function compareOccurredId(
  left: { occurredAt: number; id: string },
  right: { occurredAt: number; id: string },
) {
  return left.occurredAt - right.occurredAt || compareText(left.id, right.id);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) {
    invalid();
  }
  return value as number;
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid();
  }
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function exactString<const T extends string>(value: unknown, expected: T): T {
  if (value !== expected) invalid();
  return expected;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid();
  return value as T[number];
}

function assertUnique(values: readonly string[]) {
  if (new Set(values).size !== values.length) invalid();
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalid(): never {
  throw new Error("invalid");
}
