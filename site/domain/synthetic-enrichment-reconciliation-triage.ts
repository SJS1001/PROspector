/**
 * Pure, synthetic triage for post-claim enrichment reconciliation cases.
 *
 * `executeEnrichmentOperation` reaches `markNeedsReconciliation` only after the
 * repository has atomically claimed an already-committed reservation, and every
 * such call carries one canonical `ReconciliationReason`. The separate
 * statement-based closure decision (`decideSyntheticEnrichmentReconciliation`)
 * answers what a stranded reservation *settles or releases* once an owner has
 * transcribed a provider billing statement, and it admits only the two reasons
 * the provider itself reports.
 *
 * This module answers the question that comes before that one, for all eight
 * canonical reasons: could a provider request even exist for this reason, so
 * that a billing statement is applicable at all, and must durable state be
 * re-read first. It deliberately projects no terminal state, no settled or
 * released amount, and no charge — `settlementAuthority` is literally `"none"`
 * and settlement remains wholly the closure decision's product.
 *
 * The module has no import, persistence, route, provider-port, adapter,
 * browser, credential, or external-effect dependency. It maps already existing
 * immutable synthetic material to a frozen *routing description*; it never
 * closes, settles, releases, retries, re-invokes, or writes anything. The
 * canonical reason union is restated locally rather than imported so this
 * triage cannot compose with the runtime authority; a focused test proves the
 * restatement stays exact.
 */

export type SyntheticEnrichmentReconciliationReason =
  | "timeout"
  | "ambiguous"
  | "provider_port_mismatch"
  | "invalid_provider_outcome"
  | "invalid_assignment"
  | "invalid_evidence"
  | "provider_throw"
  | "settlement_failure";

/** The two `executeEnrichmentOperation` results that leave a case unclosed. */
export type SyntheticEnrichmentReconciliationOutcomeKind =
  | "needs_reconciliation"
  | "reconciliation_persistence_failure";

export type SyntheticEnrichmentProviderInvocation =
  | "not_attempted"
  | "indeterminate"
  | "attempted";

/**
 * Whether an owner-transcribed provider billing statement can exist at all.
 * It cannot for a reason that provably returns before the port is invoked.
 */
export type SyntheticEnrichmentStatementApplicability =
  | "applicable"
  | "inapplicable_no_provider_request";

export type SyntheticEnrichmentTriageRoute =
  | "statement_based_closure_decision"
  | "no_statement_possible"
  | "durable_state_reread_required";

/**
 * The delegate that owns terminal state and amounts. Named by its exported
 * decision function rather than its module path so this reference cannot trip
 * that module's own composition guard.
 */
export const STATEMENT_BASED_CLOSURE_DECISION = "decideSyntheticEnrichmentReconciliation";

/** The exact canonical post-claim reasons, in their authority declaration order. */
export const SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS = Object.freeze([
  "timeout",
  "ambiguous",
  "provider_port_mismatch",
  "invalid_provider_outcome",
  "invalid_assignment",
  "invalid_evidence",
  "provider_throw",
  "settlement_failure",
] as const) as readonly SyntheticEnrichmentReconciliationReason[];

export type SyntheticEnrichmentReconciliationTriageRow = Readonly<{
  reason: SyntheticEnrichmentReconciliationReason;
  providerInvocation: SyntheticEnrichmentProviderInvocation;
  statementApplicability: SyntheticEnrichmentStatementApplicability;
  /** Whether the statement-based closure decision already admits this reason. */
  coveredByStatementDecision: boolean;
  durableStateVerification: "required" | "not_required";
}>;

/**
 * One explicit row per canonical reason. A statement is inapplicable only where
 * the runtime provably returns before `invokePort`, so no provider request and
 * therefore no billing line can exist.
 */
const TRIAGE_TABLE: Readonly<Record<SyntheticEnrichmentReconciliationReason, SyntheticEnrichmentReconciliationTriageRow>> = Object.freeze({
  // Provider reported a lost result. A request was made; the closure decision
  // already admits this reason.
  timeout: row("timeout", "attempted", "applicable", true, "not_required"),
  // Provider reported that it cannot classify its own result.
  ambiguous: row("ambiguous", "attempted", "applicable", true, "not_required"),
  // The port failed its assignment binding check before any call was made.
  provider_port_mismatch: row("provider_port_mismatch", "not_attempted", "inapplicable_no_provider_request", false, "not_required"),
  // A call returned, but its outcome could not be normalized against the
  // assignment. A billing line may still exist.
  invalid_provider_outcome: row("invalid_provider_outcome", "attempted", "applicable", false, "not_required"),
  // The claim itself was invalid or unusable; the port was never reached.
  invalid_assignment: row("invalid_assignment", "not_attempted", "inapplicable_no_provider_request", false, "not_required"),
  // The outcome normalized within caps but no contact evidence was admissible.
  invalid_evidence: row("invalid_evidence", "attempted", "applicable", false, "not_required"),
  // The port threw. The throw may precede or follow a real provider request.
  provider_throw: row("provider_throw", "indeterminate", "applicable", false, "not_required"),
  // A durable settlement write was attempted before reconciliation, so the row
  // must be re-read even though the reconciliation marker was acknowledged.
  settlement_failure: row("settlement_failure", "attempted", "applicable", false, "required"),
});

export const SYNTHETIC_ENRICHMENT_RECONCILIATION_TRIAGE_TABLE = TRIAGE_TABLE;

export type SyntheticEnrichmentReconciliationCase = Readonly<{
  schema: "synthetic-enrichment-reconciliation-case/v1";
  workspaceId: string;
  reservationId: string;
  operationKey: string;
  assignmentDigest: string;
  reason: SyntheticEnrichmentReconciliationReason;
  outcomeKind: SyntheticEnrichmentReconciliationOutcomeKind;
  claimedAt: number;
  observedAt: number;
  caseDigest: string;
}>;

export type SyntheticEnrichmentReconciliationTriage = Readonly<{
  schema: "synthetic-enrichment-reconciliation-triage/v1";
  workspaceId: string;
  reservationId: string;
  operationKey: string;
  assignmentDigest: string;
  reason: SyntheticEnrichmentReconciliationReason;
  outcomeKind: SyntheticEnrichmentReconciliationOutcomeKind;
  durableReconciliationRecorded: boolean;
  providerInvocation: SyntheticEnrichmentProviderInvocation;
  statementApplicability: SyntheticEnrichmentStatementApplicability;
  coveredByStatementDecision: boolean;
  route: SyntheticEnrichmentTriageRoute;
  durableStateVerification: "required" | "not_required";
  settlementAuthority: "none";
  retryAuthority: "none";
  providerCallAuthority: "none";
  persistenceAuthority: "none";
  effectAuthority: "none";
  caseDigest: string;
  triageDigest: string;
}>;

export type SyntheticEnrichmentReconciliationBlockedReason =
  | "invalid_snapshot"
  | "digest_mismatch"
  | "unknown_reason"
  | "unknown_outcome"
  | "non_monotonic_time";

export type SyntheticEnrichmentReconciliationTriageResult = Readonly<
  | { kind: "triaged"; triage: SyntheticEnrichmentReconciliationTriage }
  | { kind: "blocked"; reason: SyntheticEnrichmentReconciliationBlockedReason }
>;

export type SyntheticEnrichmentReconciliationCoverage = Readonly<
  | { kind: "complete"; coveredReasons: readonly SyntheticEnrichmentReconciliationReason[]; ledgerDigest: string }
  | { kind: "incomplete"; missingReasons: readonly SyntheticEnrichmentReconciliationReason[] }
  | { kind: "invalid" }
>;

const DIGEST = /^[0-9a-f]{64}$/u;
const OPERATION_KEY = /^op_[a-f0-9]{64}$/u;
const OUTCOME_KINDS = Object.freeze(["needs_reconciliation", "reconciliation_persistence_failure"] as const);
const CASE_KEYS = Object.freeze([
  "schema",
  "workspaceId",
  "reservationId",
  "operationKey",
  "assignmentDigest",
  "reason",
  "outcomeKind",
  "claimedAt",
  "observedAt",
  "caseDigest",
]);
const TRIAGE_KEYS = Object.freeze([
  "schema",
  "workspaceId",
  "reservationId",
  "operationKey",
  "assignmentDigest",
  "reason",
  "outcomeKind",
  "durableReconciliationRecorded",
  "providerInvocation",
  "statementApplicability",
  "coveredByStatementDecision",
  "route",
  "durableStateVerification",
  "settlementAuthority",
  "retryAuthority",
  "providerCallAuthority",
  "persistenceAuthority",
  "effectAuthority",
  "caseDigest",
  "triageDigest",
]);

/**
 * Routes one synthetic post-claim reconciliation case. Every accepted result is
 * a frozen description with literal zero authority and no terminal state.
 */
export async function triageSyntheticEnrichmentReconciliation(
  value: SyntheticEnrichmentReconciliationCase | unknown,
): Promise<SyntheticEnrichmentReconciliationTriageResult> {
  const snapshot = snapshotCase(value);
  if (!snapshot) return blocked("invalid_snapshot");
  if (!isReconciliationReason(snapshot.reason)) return blocked("unknown_reason");
  if (!isOutcomeKind(snapshot.outcomeKind)) return blocked("unknown_outcome");
  if (snapshot.observedAt <= snapshot.claimedAt) return blocked("non_monotonic_time");
  if (await digestWithout(snapshot, "caseDigest") !== snapshot.caseDigest) return blocked("digest_mismatch");

  const material = triageMaterial({
    workspaceId: snapshot.workspaceId,
    reservationId: snapshot.reservationId,
    operationKey: snapshot.operationKey,
    assignmentDigest: snapshot.assignmentDigest,
    reason: snapshot.reason as SyntheticEnrichmentReconciliationReason,
    outcomeKind: snapshot.outcomeKind as SyntheticEnrichmentReconciliationOutcomeKind,
    caseDigest: snapshot.caseDigest,
  });
  const triage = deepFreeze({
    ...material,
    triageDigest: await digestSyntheticReconciliationMaterial(material),
  }) as SyntheticEnrichmentReconciliationTriage;
  return Object.freeze({ kind: "triaged", triage });
}

/**
 * Proves that a set of already-routed cases covers every canonical post-claim
 * reason exactly once. Any invalid, duplicated, cross-workspace, or re-digested
 * entry rejects the whole ledger.
 */
export async function projectSyntheticEnrichmentReconciliationCoverage(
  value: readonly SyntheticEnrichmentReconciliationTriage[] | unknown,
): Promise<SyntheticEnrichmentReconciliationCoverage> {
  const snapshot = snapshotExactDataGraph(value);
  if (!Array.isArray(snapshot) || snapshot.length < 1 || snapshot.length > 64) {
    return Object.freeze({ kind: "invalid" });
  }
  const seenReasons = new Set<SyntheticEnrichmentReconciliationReason>();
  const seenReservations = new Set<string>();
  const workspaces = new Set<string>();
  const entries: { reason: SyntheticEnrichmentReconciliationReason; triageDigest: string }[] = [];
  for (const candidate of snapshot) {
    const triage = exactRecord(candidate, TRIAGE_KEYS);
    if (!triage || !await validTriage(triage)) return Object.freeze({ kind: "invalid" });
    const reason = triage.reason as SyntheticEnrichmentReconciliationReason;
    const reservationId = triage.reservationId as string;
    if (seenReasons.has(reason) || seenReservations.has(reservationId)) {
      return Object.freeze({ kind: "invalid" });
    }
    seenReasons.add(reason);
    seenReservations.add(reservationId);
    workspaces.add(triage.workspaceId as string);
    entries.push({ reason, triageDigest: triage.triageDigest as string });
  }
  if (workspaces.size !== 1) return Object.freeze({ kind: "invalid" });

  const missing = SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS.filter((reason) => !seenReasons.has(reason));
  if (missing.length > 0) {
    return Object.freeze({ kind: "incomplete", missingReasons: Object.freeze(missing) });
  }
  const ordered: { reason: SyntheticEnrichmentReconciliationReason; triageDigest: string }[] = [];
  for (const reason of SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS) {
    const entry = entries.find((item) => item.reason === reason);
    if (!entry) return Object.freeze({ kind: "invalid" });
    ordered.push({ reason, triageDigest: entry.triageDigest });
  }
  const ledgerDigest = await digestSyntheticReconciliationMaterial({
    schema: "synthetic-enrichment-reconciliation-coverage/v1",
    workspaceId: [...workspaces][0],
    entries: ordered,
    settlementAuthority: "none",
    effectAuthority: "none",
    persistenceAuthority: "none",
  });
  return Object.freeze({
    kind: "complete",
    coveredReasons: SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS,
    ledgerDigest,
  });
}

export async function digestSyntheticReconciliationMaterial(value: unknown): Promise<string> {
  const snapshot = snapshotExactDataGraph(value);
  if (snapshot === null && value !== null) throw new TypeError("invalid_synthetic_reconciliation_material");
  const bytes = new TextEncoder().encode(canonical(snapshot));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type TriageIdentity = Readonly<{
  workspaceId: string;
  reservationId: string;
  operationKey: string;
  assignmentDigest: string;
  reason: SyntheticEnrichmentReconciliationReason;
  outcomeKind: SyntheticEnrichmentReconciliationOutcomeKind;
  caseDigest: string;
}>;

function triageMaterial(input: TriageIdentity) {
  const table = triageRow(input.reason);
  // A `reconciliation_persistence_failure` means even the reconciliation marker
  // is absent, so the durable row may still read `invoking`. The closure
  // decision requires an exact `needs_reconciliation` row, so nothing may be
  // routed to it until durable state is re-read.
  const durableReconciliationRecorded = input.outcomeKind === "needs_reconciliation";
  const durableStateVerification = durableReconciliationRecorded
    ? table.durableStateVerification
    : ("required" as const);
  const route: SyntheticEnrichmentTriageRoute = durableStateVerification === "required"
    ? "durable_state_reread_required"
    : table.statementApplicability === "inapplicable_no_provider_request"
      ? "no_statement_possible"
      : "statement_based_closure_decision";
  return {
    schema: "synthetic-enrichment-reconciliation-triage/v1" as const,
    workspaceId: input.workspaceId,
    reservationId: input.reservationId,
    operationKey: input.operationKey,
    assignmentDigest: input.assignmentDigest,
    reason: input.reason,
    outcomeKind: input.outcomeKind,
    durableReconciliationRecorded,
    providerInvocation: table.providerInvocation,
    statementApplicability: table.statementApplicability,
    coveredByStatementDecision: table.coveredByStatementDecision,
    route,
    durableStateVerification,
    settlementAuthority: "none" as const,
    retryAuthority: "none" as const,
    providerCallAuthority: "none" as const,
    persistenceAuthority: "none" as const,
    effectAuthority: "none" as const,
    caseDigest: input.caseDigest,
  };
}

async function validTriage(triage: Record<string, unknown>): Promise<boolean> {
  if (
    triage.schema !== "synthetic-enrichment-reconciliation-triage/v1"
    || !id(triage.workspaceId)
    || !id(triage.reservationId)
    || !operationKey(triage.operationKey)
    || !digest(triage.assignmentDigest)
    || !isReconciliationReason(triage.reason)
    || !isOutcomeKind(triage.outcomeKind)
    || triage.settlementAuthority !== "none"
    || triage.retryAuthority !== "none"
    || triage.providerCallAuthority !== "none"
    || triage.persistenceAuthority !== "none"
    || triage.effectAuthority !== "none"
    || !digest(triage.caseDigest)
    || !digest(triage.triageDigest)
  ) return false;
  const { triageDigest, ...material } = triage;
  const expected = triageMaterial({
    workspaceId: triage.workspaceId as string,
    reservationId: triage.reservationId as string,
    operationKey: triage.operationKey as string,
    assignmentDigest: triage.assignmentDigest as string,
    reason: triage.reason as SyntheticEnrichmentReconciliationReason,
    outcomeKind: triage.outcomeKind as SyntheticEnrichmentReconciliationOutcomeKind,
    caseDigest: triage.caseDigest as string,
  });
  return canonical(material) === canonical(expected)
    && await digestSyntheticReconciliationMaterial(expected) === triageDigest;
}

function triageRow(reason: SyntheticEnrichmentReconciliationReason): SyntheticEnrichmentReconciliationTriageRow {
  // `reason` is proved to be one of the eight canonical values before this
  // lookup, so no prototype key can reach the frozen table.
  if (!Object.prototype.hasOwnProperty.call(TRIAGE_TABLE, reason)) {
    throw new TypeError("untriaged_reconciliation_reason");
  }
  return TRIAGE_TABLE[reason];
}

function row(
  reason: SyntheticEnrichmentReconciliationReason,
  providerInvocation: SyntheticEnrichmentProviderInvocation,
  statementApplicability: SyntheticEnrichmentStatementApplicability,
  coveredByStatementDecision: boolean,
  durableStateVerification: "required" | "not_required",
): SyntheticEnrichmentReconciliationTriageRow {
  return Object.freeze({
    reason,
    providerInvocation,
    statementApplicability,
    coveredByStatementDecision,
    durableStateVerification,
  });
}

type CaseSnapshot = Readonly<{
  workspaceId: string;
  reservationId: string;
  operationKey: string;
  assignmentDigest: string;
  reason: string;
  outcomeKind: string;
  claimedAt: number;
  observedAt: number;
  caseDigest: string;
}>;

function snapshotCase(value: unknown): CaseSnapshot | null {
  const snapshot = snapshotExactDataGraph(value);
  const record = exactRecord(snapshot, CASE_KEYS);
  if (
    !record
    || record.schema !== "synthetic-enrichment-reconciliation-case/v1"
    || !id(record.workspaceId)
    || !id(record.reservationId)
    || !operationKey(record.operationKey)
    || !digest(record.assignmentDigest)
    || typeof record.reason !== "string"
    || typeof record.outcomeKind !== "string"
    || !positive(record.claimedAt)
    || !positive(record.observedAt)
    || !digest(record.caseDigest)
  ) return null;
  // The frozen underlying object keeps its `schema` field for digest replay;
  // the narrower static type only exposes the validated routing inputs.
  return deepFreeze(record) as unknown as CaseSnapshot;
}

function isReconciliationReason(value: unknown): value is SyntheticEnrichmentReconciliationReason {
  return typeof value === "string"
    && SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS.includes(value as SyntheticEnrichmentReconciliationReason);
}

function isOutcomeKind(value: unknown): value is SyntheticEnrichmentReconciliationOutcomeKind {
  return typeof value === "string"
    && OUTCOME_KINDS.includes(value as SyntheticEnrichmentReconciliationOutcomeKind);
}

async function digestWithout(value: object, key: string): Promise<string> {
  const material = { ...(value as Record<string, unknown>) };
  delete material[key];
  return digestSyntheticReconciliationMaterial(material);
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) return null;
  if (Object.values(descriptors).some((descriptor) => !descriptor.enumerable || "get" in descriptor || "set" in descriptor)) return null;
  return value as Record<string, unknown>;
}

/**
 * Copies an exact JSON-like data graph by reading property descriptors only.
 * Accessors are rejected before invocation. A final native clone probe rejects
 * transparent Proxy wrappers after the graph has proved data-only.
 */
function snapshotExactDataGraph(value: unknown): unknown | null {
  const seen = new WeakSet<object>();
  const copy = (current: unknown, depth: number): unknown => {
    if (depth > 8) throw new TypeError("invalid_data_graph");
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isSafeInteger(current)) return current;
    if (!current || typeof current !== "object" || seen.has(current)) throw new TypeError("invalid_data_graph");
    seen.add(current);
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (Object.getOwnPropertySymbols(current).length > 0) throw new TypeError("invalid_data_graph");
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) throw new TypeError("invalid_data_graph");
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || "get" in lengthDescriptor || "set" in lengthDescriptor
        || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) throw new TypeError("invalid_data_graph");
      const result: unknown[] = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) throw new TypeError("invalid_data_graph");
        result.push(copy(descriptor.value, depth + 1));
      }
      if (Object.keys(descriptors).some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) throw new TypeError("invalid_data_graph");
      return result;
    }
    if (Object.getPrototypeOf(current) !== Object.prototype) throw new TypeError("invalid_data_graph");
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || "get" in descriptor || "set" in descriptor) throw new TypeError("invalid_data_graph");
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  };
  try {
    const snapshot = copy(value, 0);
    // Native structuredClone rejects Proxy objects (including nested Proxies).
    // It runs only after the descriptor walk has established there are no
    // accessors in an ordinary input graph, so it cannot execute a getter.
    structuredClone(value);
    return snapshot;
  } catch {
    return null;
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new TypeError("invalid_synthetic_reconciliation_material");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function id(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 256; }
function digest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function operationKey(value: unknown): value is string { return typeof value === "string" && OPERATION_KEY.test(value); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function blocked(reason: SyntheticEnrichmentReconciliationBlockedReason): SyntheticEnrichmentReconciliationTriageResult {
  return Object.freeze({ kind: "blocked", reason });
}
