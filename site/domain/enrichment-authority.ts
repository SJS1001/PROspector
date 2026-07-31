import { canonicalDigest, deriveOperationKey, type EnrichmentBlockedReason, type EnrichmentGrant, type IssuanceSnapshot, type ProviderQuote } from "./enrichment-grant-issuance";
import type { ContactEvidenceAssignment, ContactObservation } from "./contact-evidence";

export type BudgetAccount = Readonly<{
  authorityType: "enrichment";
  accountId: string;
  scope: "grant" | "profile" | "workspace" | "provider";
  workspaceId: string;
  entityId: string;
  currency: string;
  actualUnits: number;
  reservedUnits: number;
  maxUnits: number;
  actualCostMinor: number;
  reservedCostMinor: number;
  maxCostMinor: number;
}>;
export type AssignedContactEvidence = Readonly<
  Omit<ContactEvidenceAssignment, "providerAuthority"> & {
    assignmentId: string;
    prospectId: string;
    role: "champion" | "economic_buyer" | "general";
  }
>;
export type ReservationAuthority = {
  admitted: boolean; principalSubject: string; workspaceId: string; sourceRevision: number; grant: EnrichmentGrant;
  configuration: { id: string; digest: string; revision: number; current: boolean };
  prospects: Array<{ id: string; state: string; configurationId: string; configurationDigest: string; revision: number }>;
  quote: ProviderQuote; accounts: BudgetAccount[]; evidenceAssignments: AssignedContactEvidence[];
};
export type AuthorizedEnrichmentAssignment = { reservationId: string; workspaceId: string; configurationId: string; configurationDigest: string; operationKey: string; providerId: string; providerVersion: string; catalogRef: string; quoteRevision: number; quoteUnitCostMinor: number; prospectIds: readonly string[]; evidenceAssignments: readonly AssignedContactEvidence[]; operation: "business_contact_lookup/v1"; maxUnits: number; maxCostMinor: number; currency: string; expiresAt: number };
export type EnrichmentReservation = { id: string; grantId: string; workspaceId: string; operationKey: string; status: "reserved" | "invoking" | "settled" | "released" | "needs_reconciliation"; assignment: AuthorizedEnrichmentAssignment };
export type InvocationClaim = { kind: "claimed"; assignment: AuthorizedEnrichmentAssignment; claimedAt: number } | { kind: "blocked"; reason: "unavailable" | "expired" };
export type ReconciliationReason = "timeout" | "ambiguous" | "provider_port_mismatch" | "invalid_provider_outcome" | "invalid_assignment" | "invalid_evidence" | "provider_throw" | "settlement_failure";
export type SettlementWrite = Readonly<{
  state: "settled" | "released";
  documentedUnits: number;
  documentedCostMinor: number;
  reason: "completed" | "partial" | "rejected";
  observations: readonly ContactObservation[];
  settlementDigest: string;
}>;
export type DurableReservationAcknowledgement = Readonly<{
  kind: "durably_recorded";
  reservationId: string;
  terminalState: "settled" | "released" | "needs_reconciliation";
  terminalReason: "completed" | "partial" | "rejected" | ReconciliationReason;
  settlementDigest: string | null;
  observationIds: readonly string[];
  durableRevision: number;
}>;
export type RecoverableInvocation = Readonly<{ reservationId: string; operationKey: string; claimedAt: number; expiresAt: number; status: "invoking" }>;
export type EnrichmentAuthorityRepository = {
  loadReservationAuthority(grantId: string): Promise<ReservationAuthority | null>;
  /** Atomic transaction: consume the single-use grant and enforce every supplied account cap. */
  commitReservation(record: EnrichmentReservation, accounts: readonly BudgetAccount[]): Promise<{ kind: "created"; record: EnrichmentReservation } | { kind: "existing"; record: EnrichmentReservation } | { kind: "blocked" }>;
  /** Atomically rechecks expiresAt > now while moving reserved -> invoking; an expired row is made terminal without returning an assignment. */
  claimCommittedInvocation(reservationId: string, now: number): Promise<InvocationClaim>;
  settleReservation(reservationId: string, settlement: SettlementWrite): Promise<DurableReservationAcknowledgement>;
  markNeedsReconciliation(reservationId: string, reason: ReconciliationReason): Promise<DurableReservationAcknowledgement>;
  /** Recovery workers may inspect stranded invoking rows; this never grants retry or provider-call authority. */
  listInvocationsNeedingRecovery(input: Readonly<{ claimedBefore: number; limit: number }>): Promise<readonly RecoverableInvocation[]>;
};
export type ReserveEnrichmentInput = { grantId: string; principalSubject: string; operationKey: string; now: number };
export type EnrichmentAuthorityBlockedReason = EnrichmentBlockedReason | "grant_unavailable" | "grant_consumed" | "operation_key_mismatch" | "budget_exceeded";
export type ReserveEnrichmentResult = { kind: "reserved"; reservation: EnrichmentReservation; replayed: boolean } | { kind: "blocked"; reason: EnrichmentAuthorityBlockedReason };
export type AdmittedInvocationClaim =
  | Readonly<{ kind: "claimed"; assignment: Readonly<AuthorizedEnrichmentAssignment>; claimedAt: number }>
  | Readonly<{ kind: "blocked"; reason: "unavailable" | "expired" }>
  | Readonly<{ kind: "invalid" }>;

type CommittedAdmission = Readonly<{
  receipt: object;
  assignmentReference: AuthorizedEnrichmentAssignment;
  assignmentSnapshot: Readonly<AuthorizedEnrichmentAssignment>;
}>;
const committedAdmissions = new WeakMap<EnrichmentAuthorityRepository, Map<string, CommittedAdmission>>();
const committedAdmissionReceipts = new WeakSet<object>();

/** Validates all current predicates without mutating. The repository is solely responsible for the atomic cap/consume commit. */
export async function validateEnrichmentAuthority(authority: ReservationAuthority | null, input: ReserveEnrichmentInput): Promise<{ kind: "valid"; assignment: AuthorizedEnrichmentAssignment; accounts: BudgetAccount[] } | { kind: "blocked"; reason: EnrichmentAuthorityBlockedReason }> {
  if (!authority || !validInput(input)) return { kind: "blocked", reason: "grant_unavailable" };
  const { grant, configuration, quote } = authority;
  if (input.grantId !== grant.id) return { kind: "blocked", reason: "grant_unavailable" };
  if (!authority.admitted || authority.principalSubject !== input.principalSubject || grant.tuple.ownerSubject !== input.principalSubject) return { kind: "blocked", reason: "owner_not_admitted" };
  if (grant.status !== "issued") return { kind: "blocked", reason: "grant_consumed" };
  const { digest, ...unsignedTuple } = grant.tuple;
  if (await canonicalDigest(unsignedTuple) !== digest) return { kind: "blocked", reason: "grant_unavailable" };
  if (authority.workspaceId !== grant.workspaceId || authority.workspaceId !== grant.tuple.workspaceId || authority.sourceRevision !== grant.tuple.sourceRevision) return { kind: "blocked", reason: "grant_unavailable" };
  if (grant.tuple.expiresAt <= input.now || quote.expiresAt <= input.now) return { kind: "blocked", reason: "quote_expired" };
  if (!configuration.current || configuration.id !== grant.tuple.configurationId || configuration.digest !== grant.tuple.configurationDigest || configuration.revision !== grant.tuple.configurationRevision) return { kind: "blocked", reason: "configuration_not_current" };
  if (!sameQuote(quote, grant)) return { kind: "blocked", reason: quote.currency !== grant.tuple.currency ? "currency_mismatch" : "quote_unavailable" };
  if (!sameProspects(authority.prospects, grant)) return { kind: "blocked", reason: "prospect_not_approved" };
  if (!validEvidenceAssignments(authority.evidenceAssignments, authority.workspaceId, configuration.id, configuration.digest, grant.tuple.prospectIds, grant.tuple.maxUnits)) return { kind: "blocked", reason: "prospect_not_approved" };
  const snapshot: IssuanceSnapshot = { admitted: authority.admitted, workspaceId: authority.workspaceId, ownerSubject: authority.principalSubject, revision: authority.sourceRevision, configuration, prospects: authority.prospects, quote };
  const derived = await deriveOperationKey({ snapshot, input: { operation: grant.tuple.operation, maxUnits: grant.tuple.maxUnits, maxCostMinor: grant.tuple.maxCostMinor, currency: grant.tuple.currency, expiresAt: grant.tuple.expiresAt }, prospectIds: grant.tuple.prospectIds });
  if (input.operationKey !== grant.tuple.operationKey || derived !== grant.tuple.operationKey) return { kind: "blocked", reason: "operation_key_mismatch" };
  if (!withinAccounts(authority.accounts, grant)) return { kind: "blocked", reason: "budget_exceeded" };
  const reservationId = `er_${grant.tuple.digest.slice(0, 24)}`;
  return { kind: "valid", accounts: authority.accounts.map(copyAccount), assignment: { reservationId, workspaceId: authority.workspaceId, configurationId: configuration.id, configurationDigest: configuration.digest, operationKey: grant.tuple.operationKey, providerId: grant.tuple.providerId, providerVersion: grant.tuple.providerVersion, catalogRef: grant.tuple.catalogRef, quoteRevision: grant.tuple.quoteRevision, quoteUnitCostMinor: grant.tuple.quoteUnitCostMinor, prospectIds: [...grant.tuple.prospectIds], evidenceAssignments: authority.evidenceAssignments.map((item) => ({ ...item })), operation: grant.tuple.operation, maxUnits: grant.tuple.maxUnits, maxCostMinor: grant.tuple.maxCostMinor, currency: grant.tuple.currency, expiresAt: grant.tuple.expiresAt } };
}

export async function reserveEnrichmentOperation(repository: EnrichmentAuthorityRepository, input: ReserveEnrichmentInput): Promise<ReserveEnrichmentResult> {
  const authority = await repository.loadReservationAuthority(input.grantId);
  const checked = await validateEnrichmentAuthority(authority, input);
  if (checked.kind === "blocked") return checked;
  const grant = authority!.grant;
  const record = freezeReservation({
    id: checked.assignment.reservationId,
    grantId: grant.id,
    workspaceId: grant.workspaceId,
    operationKey: checked.assignment.operationKey,
    status: "reserved",
    assignment: checked.assignment,
  });
  const committedResult = await repository.commitReservation(copyReservation(record), checked.accounts);
  const blockedEnvelope = exactDataRecord(committedResult, ["kind"]);
  if (blockedEnvelope?.kind === "blocked") return { kind: "blocked", reason: "budget_exceeded" };
  const committed = exactDataRecord(committedResult, ["kind", "record"]);
  if (
    !committed
    || (committed.kind !== "created" && committed.kind !== "existing")
    || !exactPlainData(committed.record, record)
  ) return { kind: "blocked", reason: "grant_unavailable" };
  admitCommittedReservation(repository, committed.record as EnrichmentReservation);
  return { kind: "reserved", reservation: record, replayed: committed.kind === "existing" };
}

/**
 * Claims only a reservation admitted by this module after an exact successful
 * commit acknowledgement. The receipt is intentionally process-local and
 * unforgeable. Persisted reservations therefore fail closed after rehydration
 * until the authenticated D1 repository can restore equivalent authority.
 */
export async function claimAdmittedCommittedInvocation(
  repository: EnrichmentAuthorityRepository,
  reservationId: string,
  now: number,
): Promise<AdmittedInvocationClaim> {
  const admission = committedAdmissions.get(repository)?.get(reservationId);
  if (!admission || !committedAdmissionReceipts.has(admission.receipt)) {
    return Object.freeze({ kind: "blocked", reason: "unavailable" });
  }
  let rawClaim: unknown;
  try {
    rawClaim = await repository.claimCommittedInvocation(reservationId, now);
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
  const blocked = exactDataRecord(rawClaim, ["kind", "reason"]);
  if (
    blocked?.kind === "blocked"
    && (blocked.reason === "unavailable" || blocked.reason === "expired")
  ) {
    return Object.freeze({ kind: "blocked", reason: blocked.reason });
  }
  const claimed = exactDataRecord(rawClaim, ["kind", "assignment", "claimedAt"]);
  if (
    claimed?.kind !== "claimed"
    || claimed.assignment !== admission.assignmentReference
    || !exactPlainData(claimed.assignment, admission.assignmentSnapshot)
  ) {
    return Object.freeze({ kind: "invalid" });
  }
  return Object.freeze({
    kind: "claimed",
    assignment: admission.assignmentSnapshot,
    claimedAt: claimed.claimedAt as number,
  });
}

function admitCommittedReservation(repository: EnrichmentAuthorityRepository, record: EnrichmentReservation): void {
  const receipt = Object.freeze({});
  committedAdmissionReceipts.add(receipt);
  let admissions = committedAdmissions.get(repository);
  if (!admissions) {
    admissions = new Map();
    committedAdmissions.set(repository, admissions);
  }
  const snapshot = freezeReservation(copyReservation(record)).assignment;
  admissions.set(record.id, Object.freeze({
    receipt,
    assignmentReference: record.assignment,
    assignmentSnapshot: snapshot,
  }));
}

function sameQuote(quote: ProviderQuote, grant: EnrichmentGrant): boolean { const tuple = grant.tuple; return quote.providerId === tuple.providerId && quote.providerVersion === tuple.providerVersion && quote.catalogRef === tuple.catalogRef && quote.revision === tuple.quoteRevision && quote.unitCostMinor === tuple.quoteUnitCostMinor && quote.expiresAt === tuple.quoteExpiresAt && quote.currency === tuple.currency; }
function sameProspects(prospects: ReservationAuthority["prospects"], grant: EnrichmentGrant): boolean { const expected = grant.tuple.prospectIds; const revisions = new Map(grant.tuple.prospectRevisions.map((item) => [item.id, item.revision])); return prospects.length === expected.length && revisions.size === expected.length && prospects.every((prospect) => prospect.state === "approved" && prospect.configurationId === grant.tuple.configurationId && prospect.configurationDigest === grant.tuple.configurationDigest && expected.includes(prospect.id) && revisions.get(prospect.id) === prospect.revision); }
function withinAccounts(accounts: readonly BudgetAccount[], grant: EnrichmentGrant): boolean {
  const expectedEntities = new Map<BudgetAccount["scope"], string>([
    ["grant", grant.id],
    ["profile", grant.tuple.configurationId],
    ["workspace", grant.workspaceId],
    ["provider", grant.tuple.providerId],
  ]);
  if (
    accounts.length !== expectedEntities.size
    || new Set(accounts.map((account) => account.scope)).size !== expectedEntities.size
    || new Set(accounts.map((account) => account.accountId)).size !== expectedEntities.size
  ) return false;
  return accounts.every((account) => {
    const entityId = expectedEntities.get(account.scope);
    return exactBudgetAccount(account)
      && account.authorityType === "enrichment"
      && account.workspaceId === grant.workspaceId
      && entityId !== undefined
      && account.entityId === entityId
      && account.accountId === enrichmentAccountId(grant.workspaceId, account.scope, entityId)
      && account.currency === grant.tuple.currency
      && nonNegative(account.actualUnits)
      && nonNegative(account.reservedUnits)
      && nonNegative(account.maxUnits)
      && nonNegative(account.actualCostMinor)
      && nonNegative(account.reservedCostMinor)
      && nonNegative(account.maxCostMinor)
      && safeSumWithin(account.actualUnits, account.reservedUnits, grant.tuple.maxUnits, account.maxUnits)
      && safeSumWithin(account.actualCostMinor, account.reservedCostMinor, grant.tuple.maxCostMinor, account.maxCostMinor);
  });
}
function copyAccount(account: BudgetAccount): BudgetAccount { return Object.freeze({ ...account }); }
function enrichmentAccountId(workspaceId: string, scope: BudgetAccount["scope"], entityId: string): string {
  return `enrichment:${component(workspaceId)}:${scope}:${component(entityId)}`;
}
function exactBudgetAccount(account: BudgetAccount): boolean {
  if (!account || typeof account !== "object") return false;
  return Object.keys(account).sort().join(",") === "accountId,actualCostMinor,actualUnits,authorityType,currency,entityId,maxCostMinor,maxUnits,reservedCostMinor,reservedUnits,scope,workspaceId"
    && bounded(account.accountId, 1_024)
    && bounded(account.workspaceId, 256)
    && bounded(account.entityId, 256);
}
function safeSumWithin(actual: number, reserved: number, addition: number, maximum: number): boolean {
  return actual <= maximum && reserved <= maximum - actual && addition <= maximum - actual - reserved;
}
function component(value: string): string { return `${value.length}:${value}`; }
function validInput(value: ReserveEnrichmentInput): boolean { return typeof value.grantId === "string" && value.grantId.length > 0 && typeof value.principalSubject === "string" && value.principalSubject.length > 0 && /^op_[a-f0-9]{64}$/.test(value.operationKey) && Number.isSafeInteger(value.now) && value.now > 0; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function validEvidenceAssignments(assignments: readonly AssignedContactEvidence[], workspaceId: string, configurationId: string, configurationDigest: string, prospectIds: readonly string[], maxUnits: number): boolean {
  if (
    !Array.isArray(assignments) ||
    assignments.length < prospectIds.length ||
    assignments.length > maxUnits ||
    assignments.length > 100 ||
    new Set(assignments.map((item) => item.assignmentId)).size !== assignments.length ||
    new Set(assignments.map((item) => item.contactId)).size !== assignments.length ||
    prospectIds.some((prospectId) => !assignments.some((item) => item.prospectId === prospectId))
  ) return false;
  return assignments.every((item) =>
    bounded(item.assignmentId, 256) &&
    prospectIds.includes(item.prospectId) &&
    bounded(item.prospectId, 256) &&
    (item.role === "champion" || item.role === "economic_buyer" || item.role === "general") &&
    item.workspaceId === workspaceId &&
    bounded(item.contactId, 256) &&
    item.profileConfigurationId === configurationId &&
    item.profileConfigurationDigest === configurationDigest
  );
}
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }

function freezeReservation(record: EnrichmentReservation): EnrichmentReservation {
  const evidenceAssignments = Object.freeze(record.assignment.evidenceAssignments.map((item) => Object.freeze({
    assignmentId: item.assignmentId,
    prospectId: item.prospectId,
    role: item.role,
    workspaceId: item.workspaceId,
    contactId: item.contactId,
    profileConfigurationId: item.profileConfigurationId,
    profileConfigurationDigest: item.profileConfigurationDigest,
  })));
  const assignment = Object.freeze({
    reservationId: record.assignment.reservationId,
    workspaceId: record.assignment.workspaceId,
    configurationId: record.assignment.configurationId,
    configurationDigest: record.assignment.configurationDigest,
    operationKey: record.assignment.operationKey,
    providerId: record.assignment.providerId,
    providerVersion: record.assignment.providerVersion,
    catalogRef: record.assignment.catalogRef,
    quoteRevision: record.assignment.quoteRevision,
    quoteUnitCostMinor: record.assignment.quoteUnitCostMinor,
    prospectIds: Object.freeze([...record.assignment.prospectIds]),
    evidenceAssignments,
    operation: record.assignment.operation,
    maxUnits: record.assignment.maxUnits,
    maxCostMinor: record.assignment.maxCostMinor,
    currency: record.assignment.currency,
    expiresAt: record.assignment.expiresAt,
  });
  return Object.freeze({
    id: record.id,
    grantId: record.grantId,
    workspaceId: record.workspaceId,
    operationKey: record.operationKey,
    status: record.status,
    assignment,
  });
}

function copyReservation(record: EnrichmentReservation): EnrichmentReservation {
  return {
    id: record.id,
    grantId: record.grantId,
    workspaceId: record.workspaceId,
    operationKey: record.operationKey,
    status: record.status,
    assignment: {
      reservationId: record.assignment.reservationId,
      workspaceId: record.assignment.workspaceId,
      configurationId: record.assignment.configurationId,
      configurationDigest: record.assignment.configurationDigest,
      operationKey: record.assignment.operationKey,
      providerId: record.assignment.providerId,
      providerVersion: record.assignment.providerVersion,
      catalogRef: record.assignment.catalogRef,
      quoteRevision: record.assignment.quoteRevision,
      quoteUnitCostMinor: record.assignment.quoteUnitCostMinor,
      prospectIds: [...record.assignment.prospectIds],
      evidenceAssignments: record.assignment.evidenceAssignments.map((item) => ({
        assignmentId: item.assignmentId,
        prospectId: item.prospectId,
        role: item.role,
        workspaceId: item.workspaceId,
        contactId: item.contactId,
        profileConfigurationId: item.profileConfigurationId,
        profileConfigurationDigest: item.profileConfigurationDigest,
      })),
      operation: record.assignment.operation,
      maxUnits: record.assignment.maxUnits,
      maxCostMinor: record.assignment.maxCostMinor,
      currency: record.assignment.currency,
      expiresAt: record.assignment.expiresAt,
    },
  };
}

function exactDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== keys.length
      || keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))
    ) return null;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function exactPlainData(candidate: unknown, expected: unknown): boolean {
  try {
    if (candidate === null || expected === null || typeof candidate !== "object" || typeof expected !== "object") {
      return Object.is(candidate, expected);
    }
    if (Array.isArray(expected)) {
      if (!Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Array.prototype || candidate.length !== expected.length) return false;
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const ownKeys = Reflect.ownKeys(descriptors);
      if (ownKeys.some((key) => typeof key !== "string") || ownKeys.length !== expected.length + 1 || !("length" in descriptors)) return false;
      return expected.every((value, index) => {
        const descriptor = descriptors[String(index)];
        return Boolean(descriptor && "value" in descriptor && descriptor.enumerable && exactPlainData(descriptor.value, value));
      });
    }
    if (Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) return false;
    const expectedKeys = Object.keys(expected as object);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== expectedKeys.length
      || expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))
    ) return false;
    return expectedKeys.every((key) => {
      const descriptor = descriptors[key];
      return Boolean(descriptor && "value" in descriptor && descriptor.enumerable
        && exactPlainData(descriptor.value, (expected as Record<string, unknown>)[key]));
    });
  } catch {
    return false;
  }
}
