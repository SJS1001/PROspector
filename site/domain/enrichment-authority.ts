import { canonicalDigest, deriveOperationKey, type EnrichmentBlockedReason, type EnrichmentGrant, type IssuanceSnapshot, type ProviderQuote } from "./enrichment-grant-issuance";

export type BudgetAccount = { scope: string; currency: string; actualUnits: number; reservedUnits: number; maxUnits: number; actualCostMinor: number; reservedCostMinor: number; maxCostMinor: number };
export type ReservationAuthority = {
  admitted: boolean; principalSubject: string; workspaceId: string; sourceRevision: number; grant: EnrichmentGrant;
  configuration: { id: string; digest: string; revision: number; current: boolean };
  prospects: Array<{ id: string; state: string; configurationId: string; configurationDigest: string; revision: number }>;
  quote: ProviderQuote; accounts: BudgetAccount[];
};
export type AuthorizedEnrichmentAssignment = { reservationId: string; operationKey: string; providerId: string; providerVersion: string; catalogRef: string; quoteRevision: number; prospectIds: readonly string[]; operation: "business_contact_lookup/v1"; maxUnits: number; maxCostMinor: number; currency: string; expiresAt: number };
export type EnrichmentReservation = { id: string; grantId: string; workspaceId: string; operationKey: string; status: "reserved" | "invoking" | "settled" | "released" | "needs_reconciliation"; assignment: AuthorizedEnrichmentAssignment };
export type EnrichmentAuthorityRepository = {
  loadReservationAuthority(grantId: string): Promise<ReservationAuthority | null>;
  /** Atomic transaction: consume the single-use grant and enforce every supplied account cap. */
  commitReservation(record: EnrichmentReservation, accounts: readonly BudgetAccount[]): Promise<{ kind: "created"; record: EnrichmentReservation } | { kind: "existing"; record: EnrichmentReservation } | { kind: "blocked" }>;
  /** Atomically moves reserved -> invoking. Null means no committed, uninvoked reservation exists. */
  claimCommittedInvocation(reservationId: string, now: number): Promise<AuthorizedEnrichmentAssignment | null>;
  settleReservation(reservationId: string, settlement: { state: "settled" | "released"; documentedUnits: number; documentedCostMinor: number; reason: "completed" | "partial" | "rejected" }): Promise<void>;
  markNeedsReconciliation(reservationId: string, reason: "timeout" | "ambiguous" | "invalid_provider_outcome" | "provider_throw"): Promise<void>;
};
export type ReserveEnrichmentInput = { grantId: string; principalSubject: string; operationKey: string; now: number };
export type EnrichmentAuthorityBlockedReason = EnrichmentBlockedReason | "grant_unavailable" | "grant_consumed" | "operation_key_mismatch" | "budget_exceeded";
export type ReserveEnrichmentResult = { kind: "reserved"; reservation: EnrichmentReservation; replayed: boolean } | { kind: "blocked"; reason: EnrichmentAuthorityBlockedReason };

/** Validates all current predicates without mutating. The repository is solely responsible for the atomic cap/consume commit. */
export async function validateEnrichmentAuthority(authority: ReservationAuthority | null, input: ReserveEnrichmentInput): Promise<{ kind: "valid"; assignment: AuthorizedEnrichmentAssignment; accounts: BudgetAccount[] } | { kind: "blocked"; reason: EnrichmentAuthorityBlockedReason }> {
  if (!authority || !validInput(input)) return { kind: "blocked", reason: "grant_unavailable" };
  const { grant, configuration, quote } = authority;
  if (!authority.admitted || authority.principalSubject !== input.principalSubject || grant.tuple.ownerSubject !== input.principalSubject) return { kind: "blocked", reason: "owner_not_admitted" };
  if (grant.status !== "issued") return { kind: "blocked", reason: "grant_consumed" };
  const { digest, ...unsignedTuple } = grant.tuple;
  if (await canonicalDigest(unsignedTuple) !== digest) return { kind: "blocked", reason: "grant_unavailable" };
  if (authority.workspaceId !== grant.workspaceId || authority.workspaceId !== grant.tuple.workspaceId || authority.sourceRevision !== grant.tuple.sourceRevision) return { kind: "blocked", reason: "grant_unavailable" };
  if (grant.tuple.expiresAt <= input.now || quote.expiresAt <= input.now) return { kind: "blocked", reason: "quote_expired" };
  if (!configuration.current || configuration.id !== grant.tuple.configurationId || configuration.digest !== grant.tuple.configurationDigest || configuration.revision !== grant.tuple.configurationRevision) return { kind: "blocked", reason: "configuration_not_current" };
  if (!sameQuote(quote, grant)) return { kind: "blocked", reason: quote.currency !== grant.tuple.currency ? "currency_mismatch" : "quote_unavailable" };
  if (!sameProspects(authority.prospects, grant)) return { kind: "blocked", reason: "prospect_not_approved" };
  const snapshot: IssuanceSnapshot = { admitted: authority.admitted, workspaceId: authority.workspaceId, ownerSubject: authority.principalSubject, revision: authority.sourceRevision, configuration, prospects: authority.prospects, quote };
  const derived = await deriveOperationKey({ snapshot, input: { operation: grant.tuple.operation, maxUnits: grant.tuple.maxUnits, maxCostMinor: grant.tuple.maxCostMinor, currency: grant.tuple.currency, expiresAt: grant.tuple.expiresAt }, prospectIds: grant.tuple.prospectIds });
  if (input.operationKey !== grant.tuple.operationKey || derived !== grant.tuple.operationKey) return { kind: "blocked", reason: "operation_key_mismatch" };
  if (!withinAccounts(authority.accounts, grant)) return { kind: "blocked", reason: "budget_exceeded" };
  const reservationId = `er_${grant.tuple.digest.slice(0, 24)}`;
  return { kind: "valid", accounts: authority.accounts.map(copyAccount), assignment: { reservationId, operationKey: grant.tuple.operationKey, providerId: grant.tuple.providerId, providerVersion: grant.tuple.providerVersion, catalogRef: grant.tuple.catalogRef, quoteRevision: grant.tuple.quoteRevision, prospectIds: [...grant.tuple.prospectIds], operation: grant.tuple.operation, maxUnits: grant.tuple.maxUnits, maxCostMinor: grant.tuple.maxCostMinor, currency: grant.tuple.currency, expiresAt: grant.tuple.expiresAt } };
}

export async function reserveEnrichmentOperation(repository: EnrichmentAuthorityRepository, input: ReserveEnrichmentInput): Promise<ReserveEnrichmentResult> {
  const authority = await repository.loadReservationAuthority(input.grantId);
  const checked = await validateEnrichmentAuthority(authority, input);
  if (checked.kind === "blocked") return checked;
  const grant = authority!.grant;
  const record: EnrichmentReservation = { id: checked.assignment.reservationId, grantId: grant.id, workspaceId: grant.workspaceId, operationKey: checked.assignment.operationKey, status: "reserved", assignment: checked.assignment };
  const committed = await repository.commitReservation(record, checked.accounts);
  if (committed.kind === "blocked") return { kind: "blocked", reason: "budget_exceeded" };
  return { kind: "reserved", reservation: committed.record, replayed: committed.kind === "existing" };
}

function sameQuote(quote: ProviderQuote, grant: EnrichmentGrant): boolean { const tuple = grant.tuple; return quote.providerId === tuple.providerId && quote.providerVersion === tuple.providerVersion && quote.catalogRef === tuple.catalogRef && quote.revision === tuple.quoteRevision && quote.unitCostMinor === tuple.quoteUnitCostMinor && quote.expiresAt === tuple.quoteExpiresAt && quote.currency === tuple.currency; }
function sameProspects(prospects: ReservationAuthority["prospects"], grant: EnrichmentGrant): boolean { const expected = grant.tuple.prospectIds; const revisions = new Map(grant.tuple.prospectRevisions.map((item) => [item.id, item.revision])); return prospects.length === expected.length && revisions.size === expected.length && prospects.every((prospect) => prospect.state === "approved" && prospect.configurationId === grant.tuple.configurationId && prospect.configurationDigest === grant.tuple.configurationDigest && expected.includes(prospect.id) && revisions.get(prospect.id) === prospect.revision); }
function withinAccounts(accounts: readonly BudgetAccount[], grant: EnrichmentGrant): boolean { return accounts.length > 0 && accounts.every((account) => account.currency === grant.tuple.currency && nonNegative(account.actualUnits) && nonNegative(account.reservedUnits) && nonNegative(account.maxUnits) && nonNegative(account.actualCostMinor) && nonNegative(account.reservedCostMinor) && nonNegative(account.maxCostMinor) && account.actualUnits + account.reservedUnits + grant.tuple.maxUnits <= account.maxUnits && account.actualCostMinor + account.reservedCostMinor + grant.tuple.maxCostMinor <= account.maxCostMinor); }
function copyAccount(account: BudgetAccount): BudgetAccount { return { ...account }; }
function validInput(value: ReserveEnrichmentInput): boolean { return typeof value.grantId === "string" && value.grantId.length > 0 && typeof value.principalSubject === "string" && value.principalSubject.length > 0 && /^op_[a-f0-9]{64}$/.test(value.operationKey) && Number.isSafeInteger(value.now); }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
