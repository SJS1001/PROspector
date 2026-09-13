export const MONITORING_SNAPSHOT_SCHEMA = "prospector-monitoring-snapshot/v2" as const;
export const MONITORING_READINESS_SCHEMA = "prospector-monitoring-readiness/v1" as const;

export type MonitoringComponent = "scheduler" | "runner" | "outbox" | "recovery";
export type MonitoringStatus = "healthy" | "degraded" | "blocked";
export type DiagnosticCode =
  | "scheduler_lag"
  | "runner_lag"
  | "outbox_lag"
  | "recovery_lag"
  | "stuck_lease"
  | "repeated_denials"
  | "uncertain_dispatch"
  | "digest_mismatch"
  | "recovery_failure";

type QueueSignal = Readonly<{
  pendingCount: number;
  oldestPendingAt: number | null;
}>;

type ComponentLivenessEvidence = Readonly<{
  component: MonitoringComponent;
  observedAt: number;
}>;

export type MonitoringSnapshot = Readonly<{
  schema: typeof MONITORING_SNAPSHOT_SCHEMA;
  workspaceId: string;
  observedAt: number;
  windowStartedAt: number;
  componentLiveness: Readonly<Record<MonitoringComponent, ComponentLivenessEvidence>>;
  scheduler: QueueSignal;
  runner: QueueSignal & Readonly<{
    expiredLeaseCount: number;
    denialCount: number;
  }>;
  outbox: QueueSignal & Readonly<{
    expiredLeaseCount: number;
    uncertainDispatchCount: number;
    digestMismatchCount: number;
  }>;
  recovery: QueueSignal & Readonly<{
    failureCount: number;
  }>;
}>;

export type MonitoringThresholds = Readonly<{
  degradedLagMs: Readonly<Record<MonitoringComponent, number>>;
  blockedLagMs: Readonly<Record<MonitoringComponent, number>>;
  repeatedDenialCount: number;
  blockedDenialCount: number;
  blockedRecoveryFailureCount: number;
  maximumSnapshotAgeMs: number;
}>;

export type MonitoringDiagnostic = Readonly<{
  component: MonitoringComponent;
  code: DiagnosticCode;
  severity: Exclude<MonitoringStatus, "healthy">;
  count: number;
  ageMs: number | null;
  threshold: number;
  action: string;
}>;

export type MonitoringReadiness = Readonly<{
  schema: typeof MONITORING_READINESS_SCHEMA;
  observedAt: number;
  windowStartedAt: number;
  status: MonitoringStatus;
  ready: boolean;
  externalEffectsAuthorized: false;
  automaticRetryAuthorized: false;
  automaticRecoveryAuthorized: false;
  components: Readonly<Record<MonitoringComponent, MonitoringStatus>>;
  diagnostics: readonly MonitoringDiagnostic[];
}>;

export class MonitoringContractError extends Error {
  readonly code = "monitoring_snapshot_invalid";

  constructor() {
    super("Monitoring snapshot is invalid");
  }
}

export const DEFAULT_MONITORING_THRESHOLDS: MonitoringThresholds = Object.freeze({
  degradedLagMs: Object.freeze({
    scheduler: 5 * 60_000,
    runner: 10 * 60_000,
    outbox: 5 * 60_000,
    recovery: 5 * 60_000,
  }),
  blockedLagMs: Object.freeze({
    scheduler: 30 * 60_000,
    runner: 30 * 60_000,
    outbox: 15 * 60_000,
    recovery: 15 * 60_000,
  }),
  repeatedDenialCount: 3,
  blockedDenialCount: 10,
  blockedRecoveryFailureCount: 3,
  maximumSnapshotAgeMs: 2 * 60_000,
});

const COMPONENTS = ["scheduler", "runner", "outbox", "recovery"] as const;
const ACTIONS: Readonly<Record<DiagnosticCode, string>> = Object.freeze({
  scheduler_lag: "Inspect scheduler admission and the oldest due slot; do not trigger a run automatically.",
  runner_lag: "Inspect runner assignment and ingestion state; do not retry automatically.",
  outbox_lag: "Inspect current outbox authority and lease state; do not dispatch automatically.",
  recovery_lag: "Inspect the recovery queue and current authority before any manual transition.",
  stuck_lease: "Quarantine the expired lease for owner review; do not reassign or dispatch automatically.",
  repeated_denials: "Review the aggregate denial reason at its owning boundary; do not weaken admission.",
  uncertain_dispatch: "Hold the item for manual reconciliation; never resend automatically.",
  digest_mismatch: "Block consumption and investigate immutable lineage using protected records.",
  recovery_failure: "Keep recovery blocked and inspect the latest privacy-safe failure category.",
});

/**
 * Pure, provider-neutral health classifier. The input deliberately contains
 * aggregate counts and timestamps only. It accepts no entity identifiers,
 * payloads, provider metadata, credentials, personal data, or raw digests.
 */
export function evaluateMonitoringReadiness(
  value: unknown,
  expectedWorkspaceId: string,
  now: number,
  thresholds: MonitoringThresholds = DEFAULT_MONITORING_THRESHOLDS,
): MonitoringReadiness {
  const snapshot = validateSnapshot(value, expectedWorkspaceId, now, thresholds);
  const diagnostics: MonitoringDiagnostic[] = [];

  addLagDiagnostic(diagnostics, "scheduler", "scheduler_lag", snapshot.scheduler, snapshot.observedAt, thresholds);
  addLagDiagnostic(diagnostics, "runner", "runner_lag", snapshot.runner, snapshot.observedAt, thresholds);
  addLagDiagnostic(diagnostics, "outbox", "outbox_lag", snapshot.outbox, snapshot.observedAt, thresholds);
  addLagDiagnostic(diagnostics, "recovery", "recovery_lag", snapshot.recovery, snapshot.observedAt, thresholds);

  addCountDiagnostic(diagnostics, "runner", "stuck_lease", snapshot.runner.expiredLeaseCount, 1, 1);
  addCountDiagnostic(diagnostics, "outbox", "stuck_lease", snapshot.outbox.expiredLeaseCount, 1, 1);
  addCountDiagnostic(
    diagnostics,
    "runner",
    "repeated_denials",
    snapshot.runner.denialCount,
    thresholds.repeatedDenialCount,
    thresholds.blockedDenialCount,
  );
  addCountDiagnostic(diagnostics, "outbox", "uncertain_dispatch", snapshot.outbox.uncertainDispatchCount, 1, 1);
  addCountDiagnostic(diagnostics, "outbox", "digest_mismatch", snapshot.outbox.digestMismatchCount, 1, 1);
  addCountDiagnostic(
    diagnostics,
    "recovery",
    "recovery_failure",
    snapshot.recovery.failureCount,
    1,
    thresholds.blockedRecoveryFailureCount,
  );

  diagnostics.sort((left, right) =>
    COMPONENTS.indexOf(left.component) - COMPONENTS.indexOf(right.component)
    || left.code.localeCompare(right.code),
  );
  const components = Object.fromEntries(COMPONENTS.map((component) => [
    component,
    worstStatus(diagnostics.filter((item) => item.component === component).map((item) => item.severity)),
  ])) as Record<MonitoringComponent, MonitoringStatus>;
  const status = worstStatus(Object.values(components));

  return Object.freeze({
    schema: MONITORING_READINESS_SCHEMA,
    observedAt: snapshot.observedAt,
    windowStartedAt: snapshot.windowStartedAt,
    status,
    ready: status === "healthy",
    externalEffectsAuthorized: false,
    automaticRetryAuthorized: false,
    automaticRecoveryAuthorized: false,
    components: Object.freeze(components),
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item))),
  });
}

function addLagDiagnostic(
  diagnostics: MonitoringDiagnostic[],
  component: MonitoringComponent,
  code: DiagnosticCode,
  signal: QueueSignal,
  observedAt: number,
  thresholds: MonitoringThresholds,
) {
  if (signal.pendingCount === 0 || signal.oldestPendingAt === null) return;
  const ageMs = observedAt - signal.oldestPendingAt;
  const degraded = thresholds.degradedLagMs[component];
  if (ageMs < degraded) return;
  const blocked = thresholds.blockedLagMs[component];
  diagnostics.push({
    component,
    code,
    severity: ageMs >= blocked ? "blocked" : "degraded",
    count: signal.pendingCount,
    ageMs,
    threshold: ageMs >= blocked ? blocked : degraded,
    action: ACTIONS[code],
  });
}

function addCountDiagnostic(
  diagnostics: MonitoringDiagnostic[],
  component: MonitoringComponent,
  code: DiagnosticCode,
  count: number,
  degradedAt: number,
  blockedAt: number,
) {
  if (count < degradedAt) return;
  diagnostics.push({
    component,
    code,
    severity: count >= blockedAt ? "blocked" : "degraded",
    count,
    ageMs: null,
    threshold: count >= blockedAt ? blockedAt : degradedAt,
    action: ACTIONS[code],
  });
}

function validateSnapshot(
  value: unknown,
  expectedWorkspaceId: string,
  now: number,
  thresholds: MonitoringThresholds,
): MonitoringSnapshot {
  if (!identifier(expectedWorkspaceId) || !safeTimestamp(now) || !validThresholds(thresholds)) throw new MonitoringContractError();
  const snapshot = exactRecord(value, [
    "schema", "workspaceId", "observedAt", "windowStartedAt", "componentLiveness",
    "scheduler", "runner", "outbox", "recovery",
  ]);
  if (
    !snapshot
    || snapshot.schema !== MONITORING_SNAPSHOT_SCHEMA
    || snapshot.workspaceId !== expectedWorkspaceId
    || !safeTimestamp(snapshot.observedAt)
    || !safeTimestamp(snapshot.windowStartedAt)
    || snapshot.windowStartedAt > snapshot.observedAt
    || snapshot.observedAt > now
    || now - snapshot.observedAt > thresholds.maximumSnapshotAgeMs
  ) throw new MonitoringContractError();

  const componentLiveness = exactRecord(snapshot.componentLiveness, COMPONENTS);
  if (!componentLiveness || !COMPONENTS.every((component) => {
    const evidence = exactRecord(componentLiveness[component], ["component", "observedAt"]);
    return evidence
      && evidence.component === component
      && safeTimestamp(evidence.observedAt)
      && evidence.observedAt <= snapshot.observedAt
      && now - evidence.observedAt <= thresholds.maximumSnapshotAgeMs;
  })) throw new MonitoringContractError();

  const scheduler = queue(snapshot.scheduler, []);
  const runner = queue(snapshot.runner, ["expiredLeaseCount", "denialCount"]);
  const outbox = queue(snapshot.outbox, ["expiredLeaseCount", "uncertainDispatchCount", "digestMismatchCount"]);
  const recovery = queue(snapshot.recovery, ["failureCount"]);
  if (!scheduler || !runner || !outbox || !recovery) throw new MonitoringContractError();
  if ([scheduler, runner, outbox, recovery].some((signal) =>
    signal.oldestPendingAt !== null && signal.oldestPendingAt > snapshot.observedAt
  )) throw new MonitoringContractError();
  return snapshot as unknown as MonitoringSnapshot;
}

function queue(value: unknown, extraKeys: readonly string[]) {
  const record = exactRecord(value, ["pendingCount", "oldestPendingAt", ...extraKeys]);
  if (!record || !safeCount(record.pendingCount)) return null;
  if (record.pendingCount === 0 ? record.oldestPendingAt !== null : !safeTimestamp(record.oldestPendingAt)) return null;
  for (const key of extraKeys) if (!safeCount(record[key])) return null;
  return record;
}

function validThresholds(value: MonitoringThresholds) {
  const root = exactRecord(value, [
    "degradedLagMs", "blockedLagMs", "repeatedDenialCount", "blockedDenialCount",
    "blockedRecoveryFailureCount", "maximumSnapshotAgeMs",
  ]);
  const degraded = root && exactRecord(root.degradedLagMs, COMPONENTS);
  const blocked = root && exactRecord(root.blockedLagMs, COMPONENTS);
  if (!root || !degraded || !blocked) return false;
  if (!COMPONENTS.every((key) => safePositive(degraded[key]) && safePositive(blocked[key]) && blocked[key] >= degraded[key])) return false;
  return safePositive(root.repeatedDenialCount)
    && safePositive(root.blockedDenialCount)
    && root.blockedDenialCount >= root.repeatedDenialCount
    && safePositive(root.blockedRecoveryFailureCount)
    && safePositive(root.maximumSnapshotAgeMs);
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (actual.some((key) => !descriptors[key] || !("value" in descriptors[key]))) return null;
  return value as Record<string, unknown>;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9:_-]+$/.test(value);
}

function safeTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function safeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000;
}

function safePositive(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function worstStatus(statuses: readonly MonitoringStatus[]): MonitoringStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
}
