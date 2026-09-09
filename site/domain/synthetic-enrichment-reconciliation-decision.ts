/**
 * Pure, synthetic decision for closing an uncertain enrichment reservation.
 *
 * `executeEnrichmentOperation` records `needs_reconciliation` when an invoked
 * provider result is uncertain or unusable, when invocation may have thrown,
 * or when settlement cannot be durably confirmed. That is deliberately
 * correct: the locked Phase 5 decisions forbid retry, provider switch, and
 * silent expiry extension for an uncertain charge. This module describes how
 * those statement-applicable reservations could be honestly closed so their
 * worst-case units and cost need not remain reserved forever.
 *
 * This module fills exactly that description gap and nothing else. It consumes
 * only fictional material — an already-recorded uncertain reservation subject,
 * one owner-transcribed out-of-band provider billing statement, and the current
 * durable authority — and projects at most one of two future states: settle the
 * documented billable amount, or release a documented no-charge reservation.
 * Everything else holds.
 *
 * It has no persistence, repository, route, browser, provider-port, credential,
 * contact-coordinate, or external-effect dependency. Even an accepted result
 * grants no write, spend, retry, provider-switch, expiry-extension, or
 * contact-evidence-promotion authority, and every effect counter is literally
 * zero. Runtime and production compose it nowhere.
 */

type Effects = Readonly<{
  providerCalls: 0;
  spendAuthorizations: 0;
  reservationMutations: 0;
  budgetMutations: 0;
  contactEvidenceMutations: 0;
  retryInvocations: 0;
}>;

type StatementReconcilableReason =
  | "timeout"
  | "ambiguous"
  | "invalid_provider_outcome"
  | "invalid_evidence"
  | "provider_throw"
  | "settlement_failure";
type StatementOutcome = "documented_charge" | "documented_no_charge" | "undocumented";
type DurableTerminalState = "reserved" | "invoking" | "settled" | "released" | "needs_reconciliation";

type ReconciliationSubjectSnapshot = Readonly<{
  reservationId: string;
  workspaceId: string;
  ownerSubject: string;
  grantId: string;
  operationKey: string;
  providerId: string;
  providerVersion: string;
  catalogRef: string;
  quoteRevision: number;
  configurationId: string;
  configurationDigest: string;
  operation: "business_contact_lookup/v1";
  terminalState: "needs_reconciliation";
  terminalReason: StatementReconcilableReason;
  durableRevision: number;
  acknowledgementDigest: string;
  reservedUnits: number;
  reservedCostMinor: number;
  currency: string;
  recordedAt: number;
}>;

type BillingStatementSnapshot = Readonly<{
  statementId: string;
  reservationId: string;
  workspaceId: string;
  grantId: string;
  operationKey: string;
  providerId: string;
  providerVersion: string;
  catalogRef: string;
  quoteRevision: number;
  outcome: StatementOutcome;
  documentedUnits: number;
  documentedCostMinor: number;
  currency: string;
  statementReference: string;
  observedAt: number;
}>;

type CurrentReconciliationAuthority = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  admittedOwner: boolean;
  reservationId: string;
  durableState: DurableTerminalState;
  durableRevision: number;
  acknowledgementDigest: string;
  grantConsumed: boolean;
  configurationId: string;
  configurationDigest: string;
  ownerReviewedStatement: boolean;
  externalEffectsDisabled: boolean;
  evaluatedAt: number;
}>;

export type SyntheticUncertainReservation = Readonly<{
  kind: "synthetic_uncertain_enrichment_reservation";
  digest: string;
  snapshot: ReconciliationSubjectSnapshot;
  persistenceAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

export type SyntheticProviderBillingStatement = Readonly<{
  kind: "synthetic_provider_billing_statement";
  digest: string;
  snapshot: BillingStatementSnapshot;
  providerEvidence: false;
  persistenceAuthorized: false;
  effects: Effects;
}>;

export type SyntheticReconciliationDecision = Readonly<{
  kind: "synthetic_enrichment_reconciliation_decision";
  status: "synthetic_reconciliation_resolvable" | "synthetic_reconciliation_held";
  projectedFutureState: "settled" | "released" | "needs_reconciliation";
  projectedTerminalReason: "partial" | "rejected" | StatementReconcilableReason;
  reservationId: string;
  subjectDigest: string;
  statementId: string;
  statementDigest: string;
  resolutionDigest: string;
  projectedDocumentedUnits: number;
  projectedDocumentedCostMinor: number;
  projectedReleasedUnits: number;
  projectedReleasedCostMinor: number;
  currency: string;
  ownerActionRequired: boolean;
  reasonCodes: readonly string[];
  persistenceAuthorized: false;
  retryAuthorized: false;
  providerSwitchAuthorized: false;
  expiryExtensionAuthorized: false;
  providerInvocationAuthorized: false;
  budgetIncreaseAuthorized: false;
  contactEvidencePromotionAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const OPERATION_KEY = /^op_[a-f0-9]{64}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const SEMANTIC_VERSION = /^synthetic-v[0-9]{1,4}$/u;
const MAX_UNITS = 1_000;
const MAX_COST_MINOR = 10_000_000;

/**
 * Runtime reconciliation reasons for which a provider request was attempted or
 * may have been attempted. The two pre-invocation reasons are deliberately
 * absent because no provider billing statement can exist for them.
 */
export const SYNTHETIC_STATEMENT_RECONCILABLE_REASONS = Object.freeze([
  "timeout",
  "ambiguous",
  "invalid_provider_outcome",
  "invalid_evidence",
  "provider_throw",
  "settlement_failure",
] as const) as readonly StatementReconcilableReason[];

const uncertainReservations = new WeakSet<object>();
const billingStatements = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  spendAuthorizations: 0,
  reservationMutations: 0,
  budgetMutations: 0,
  contactEvidenceMutations: 0,
  retryInvocations: 0,
});

/**
 * Canonicalizes one already-recorded synthetic uncertain reservation. This
 * describes durable state that a caller claims to have observed; it neither
 * reads nor writes any store.
 */
export async function buildSyntheticUncertainReservation(value: unknown): Promise<SyntheticUncertainReservation> {
  try {
    const snapshot = normalizeSubject(value);
    const artifact: SyntheticUncertainReservation = deepFreeze({
      kind: "synthetic_uncertain_enrichment_reservation" as const,
      digest: await sha256(canonical({ schema: "synthetic-uncertain-enrichment-reservation/v1", ...snapshot })),
      snapshot,
      persistenceAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
    uncertainReservations.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_uncertain_enrichment_reservation_invalid");
  }
}

/**
 * Canonicalizes one fictional owner-transcribed provider billing statement.
 * A billing statement documents money only. It is never contact evidence and
 * can never carry a verification class, so `providerEvidence` stays false.
 */
export async function buildSyntheticProviderBillingStatement(value: unknown): Promise<SyntheticProviderBillingStatement> {
  try {
    const snapshot = normalizeStatement(value);
    const artifact: SyntheticProviderBillingStatement = deepFreeze({
      kind: "synthetic_provider_billing_statement" as const,
      digest: await sha256(canonical({ schema: "synthetic-provider-billing-statement/v1", ...snapshot })),
      snapshot,
      providerEvidence: false as const,
      persistenceAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
    billingStatements.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_provider_billing_statement_invalid");
  }
}

/**
 * Decides whether one uncertain reservation could honestly be closed.
 *
 * Reject by default: only an admitted owner, an unchanged `needs_reconciliation`
 * row at its exact recorded revision and acknowledgement digest, and one exactly
 * bound documented statement can describe a future `settled` or `released`
 * transition. Every other input holds the reservation. No result ever authorizes
 * a retry, a provider switch, an expiry extension, a budget increase, a
 * persistence write, or promotion of contact evidence.
 */
export async function decideSyntheticEnrichmentReconciliation(value: unknown): Promise<SyntheticReconciliationDecision> {
  try {
    const input = exactRecord(value, ["reservation", "statement", "currentAuthority"]);
    if (!uncertainReservations.has(input.reservation as object)) invalid();
    if (!billingStatements.has(input.statement as object)) invalid();
    const reservation = input.reservation as SyntheticUncertainReservation;
    const statement = input.statement as SyntheticProviderBillingStatement;
    const current = normalizeAuthority(input.currentAuthority);
    const subject = reservation.snapshot;
    const documented = statement.snapshot;
    const reasons: string[] = [];

    if (current.reservationId !== subject.reservationId) reasons.push("reservation_scope_mismatch");
    if (current.workspaceId !== subject.workspaceId) reasons.push("workspace_scope_mismatch");
    if (current.ownerSubject !== subject.ownerSubject) reasons.push("owner_scope_mismatch");
    if (!current.admittedOwner) reasons.push("owner_not_admitted");
    if (current.durableState !== "needs_reconciliation") reasons.push("reservation_not_uncertain");
    if (current.durableRevision !== subject.durableRevision) reasons.push("durable_revision_changed");
    if (current.acknowledgementDigest !== subject.acknowledgementDigest) reasons.push("acknowledgement_digest_changed");
    if (!current.grantConsumed) reasons.push("grant_not_consumed");
    if (current.configurationId !== subject.configurationId) reasons.push("configuration_scope_mismatch");
    if (current.configurationDigest !== subject.configurationDigest) reasons.push("configuration_digest_mismatch");
    if (!current.ownerReviewedStatement) reasons.push("owner_statement_review_missing");
    if (!current.externalEffectsDisabled) reasons.push("external_effects_not_disabled");

    if (documented.reservationId !== subject.reservationId) reasons.push("statement_reservation_mismatch");
    if (documented.workspaceId !== subject.workspaceId) reasons.push("statement_workspace_mismatch");
    if (documented.grantId !== subject.grantId) reasons.push("statement_grant_mismatch");
    if (documented.operationKey !== subject.operationKey) reasons.push("statement_operation_key_mismatch");
    if (documented.providerId !== subject.providerId) reasons.push("statement_provider_mismatch");
    if (documented.providerVersion !== subject.providerVersion) reasons.push("statement_provider_version_mismatch");
    if (documented.catalogRef !== subject.catalogRef) reasons.push("statement_catalog_mismatch");
    if (documented.quoteRevision !== subject.quoteRevision) reasons.push("statement_quote_revision_mismatch");
    if (documented.currency !== subject.currency) reasons.push("statement_currency_mismatch");
    if (documented.observedAt < subject.recordedAt) reasons.push("statement_precedes_uncertainty");
    if (documented.observedAt > current.evaluatedAt) reasons.push("statement_from_future");

    if (documented.outcome === "undocumented") reasons.push("charge_undocumented");
    if (documented.outcome === "documented_no_charge"
      && (documented.documentedUnits !== 0 || documented.documentedCostMinor !== 0)) {
      reasons.push("no_charge_statement_documents_amount");
    }
    if (documented.outcome === "documented_charge") {
      if (documented.documentedUnits < 1) reasons.push("documented_units_absent");
      if (documented.documentedUnits > subject.reservedUnits) reasons.push("documented_units_exceed_reservation");
      if (documented.documentedCostMinor > subject.reservedCostMinor) reasons.push("documented_cost_exceeds_reservation");
    }

    const rejected = reasons.length > 0;
    const settling = !rejected && documented.outcome === "documented_charge";
    const releasing = !rejected && documented.outcome === "documented_no_charge";
    // A documented charge settles only its documented billable amount. Any
    // remaining worst-case reservation is released, never carried forward as
    // spare authority for another operation.
    const projectedDocumentedUnits = settling ? documented.documentedUnits : 0;
    const projectedDocumentedCostMinor = settling ? documented.documentedCostMinor : 0;
    const projectedReleasedUnits = rejected ? 0 : subject.reservedUnits - projectedDocumentedUnits;
    const projectedReleasedCostMinor = rejected ? 0 : subject.reservedCostMinor - projectedDocumentedCostMinor;
    const projectedFutureState = settling ? "settled" as const : releasing ? "released" as const : "needs_reconciliation" as const;
    // `partial` is the only honest settlement reason here: the operation's
    // contact outcome was never observed, so nothing may be recorded completed.
    const projectedTerminalReason = settling ? "partial" as const : releasing ? "rejected" as const : subject.terminalReason;
    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    const resolutionDigest = await sha256(canonical({
      schema: "synthetic-enrichment-reconciliation-decision/v1",
      subjectDigest: reservation.digest,
      statementDigest: statement.digest,
      projectedFutureState,
      projectedTerminalReason,
      projectedDocumentedUnits,
      projectedDocumentedCostMinor,
      projectedReleasedUnits,
      projectedReleasedCostMinor,
      reasonCodes: [...reasonCodes],
    }));

    return deepFreeze({
      kind: "synthetic_enrichment_reconciliation_decision" as const,
      status: rejected ? "synthetic_reconciliation_held" as const : "synthetic_reconciliation_resolvable" as const,
      projectedFutureState,
      projectedTerminalReason,
      reservationId: subject.reservationId,
      subjectDigest: reservation.digest,
      statementId: documented.statementId,
      statementDigest: statement.digest,
      resolutionDigest,
      projectedDocumentedUnits,
      projectedDocumentedCostMinor,
      projectedReleasedUnits,
      projectedReleasedCostMinor,
      currency: subject.currency,
      ownerActionRequired: rejected,
      reasonCodes,
      persistenceAuthorized: false as const,
      retryAuthorized: false as const,
      providerSwitchAuthorized: false as const,
      expiryExtensionAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      budgetIncreaseAuthorized: false as const,
      contactEvidencePromotionAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_enrichment_reconciliation_invalid");
  }
}

function normalizeSubject(value: unknown): ReconciliationSubjectSnapshot {
  const input = exactRecord(value, [
    "reservationId", "workspaceId", "ownerSubject", "grantId", "operationKey",
    "providerId", "providerVersion", "catalogRef", "quoteRevision",
    "configurationId", "configurationDigest", "operation", "terminalState", "terminalReason",
    "durableRevision", "acknowledgementDigest", "reservedUnits", "reservedCostMinor",
    "currency", "recordedAt",
  ]);
  const reservedUnits = boundedInteger(input.reservedUnits, 1, MAX_UNITS);
  const reservedCostMinor = boundedInteger(input.reservedCostMinor, 0, MAX_COST_MINOR);
  return deepFreeze({
    reservationId: syntheticId(input.reservationId),
    workspaceId: syntheticId(input.workspaceId),
    ownerSubject: syntheticId(input.ownerSubject),
    grantId: syntheticId(input.grantId),
    operationKey: operationKey(input.operationKey),
    providerId: syntheticId(input.providerId),
    providerVersion: syntheticVersion(input.providerVersion),
    catalogRef: syntheticId(input.catalogRef),
    quoteRevision: boundedInteger(input.quoteRevision, 1, MAX_UNITS),
    configurationId: syntheticId(input.configurationId),
    configurationDigest: digest(input.configurationDigest),
    operation: enumValue(input.operation, ["business_contact_lookup/v1"] as const),
    terminalState: enumValue(input.terminalState, ["needs_reconciliation"] as const),
    terminalReason: enumValue(input.terminalReason, SYNTHETIC_STATEMENT_RECONCILABLE_REASONS),
    durableRevision: boundedInteger(input.durableRevision, 1, Number.MAX_SAFE_INTEGER),
    acknowledgementDigest: digest(input.acknowledgementDigest),
    reservedUnits,
    reservedCostMinor,
    currency: currency(input.currency),
    recordedAt: boundedInteger(input.recordedAt, 1, Number.MAX_SAFE_INTEGER),
  });
}

function normalizeStatement(value: unknown): BillingStatementSnapshot {
  const input = exactRecord(value, [
    "statementId", "reservationId", "workspaceId", "grantId", "operationKey",
    "providerId", "providerVersion", "catalogRef", "quoteRevision", "outcome",
    "documentedUnits", "documentedCostMinor", "currency", "statementReference", "observedAt",
  ]);
  return deepFreeze({
    statementId: syntheticId(input.statementId),
    reservationId: syntheticId(input.reservationId),
    workspaceId: syntheticId(input.workspaceId),
    grantId: syntheticId(input.grantId),
    operationKey: operationKey(input.operationKey),
    providerId: syntheticId(input.providerId),
    providerVersion: syntheticVersion(input.providerVersion),
    catalogRef: syntheticId(input.catalogRef),
    quoteRevision: boundedInteger(input.quoteRevision, 1, MAX_UNITS),
    outcome: enumValue(input.outcome, ["documented_charge", "documented_no_charge", "undocumented"] as const),
    documentedUnits: boundedInteger(input.documentedUnits, 0, MAX_UNITS),
    documentedCostMinor: boundedInteger(input.documentedCostMinor, 0, MAX_COST_MINOR),
    currency: currency(input.currency),
    statementReference: syntheticId(input.statementReference),
    observedAt: boundedInteger(input.observedAt, 1, Number.MAX_SAFE_INTEGER),
  });
}

function normalizeAuthority(value: unknown): CurrentReconciliationAuthority {
  const input = exactRecord(value, [
    "workspaceId", "ownerSubject", "admittedOwner", "reservationId", "durableState",
    "durableRevision", "acknowledgementDigest", "grantConsumed", "configurationId",
    "configurationDigest", "ownerReviewedStatement", "externalEffectsDisabled", "evaluatedAt",
  ]);
  return deepFreeze({
    workspaceId: syntheticId(input.workspaceId),
    ownerSubject: syntheticId(input.ownerSubject),
    admittedOwner: booleanValue(input.admittedOwner),
    reservationId: syntheticId(input.reservationId),
    durableState: enumValue(input.durableState, ["reserved", "invoking", "settled", "released", "needs_reconciliation"] as const),
    durableRevision: boundedInteger(input.durableRevision, 1, Number.MAX_SAFE_INTEGER),
    acknowledgementDigest: digest(input.acknowledgementDigest),
    grantConsumed: booleanValue(input.grantConsumed),
    configurationId: syntheticId(input.configurationId),
    configurationDigest: digest(input.configurationDigest),
    ownerReviewedStatement: booleanValue(input.ownerReviewedStatement),
    externalEffectsDisabled: booleanValue(input.externalEffectsDisabled),
    evaluatedAt: boundedInteger(input.evaluatedAt, 1, Number.MAX_SAFE_INTEGER),
  });
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  if (Object.keys(descriptors).sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function canonical(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function syntheticVersion(value: unknown) {
  if (typeof value !== "string" || !SEMANTIC_VERSION.test(value)) invalid();
  return value;
}

function operationKey(value: unknown) {
  if (typeof value !== "string" || !OPERATION_KEY.test(value)) invalid();
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function currency(value: unknown) {
  if (typeof value !== "string" || !CURRENCY.test(value)) invalid();
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid();
  return value as T[number];
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
