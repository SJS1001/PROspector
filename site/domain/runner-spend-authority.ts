/** Separate synthetic ledger type: enrichment authority is intentionally not structurally accepted here. */
export type RunnerSpendGrant = {
  authorityType: "runner_spend"; id: string; providerId: string; model: string; catalogRef: string;
  runType: string; scopeId: string; perRunCostMinor: number; monthlyCostMinor: number;
  currency: string; expiresAt: number; maxRetries: number;
};
export type RunnerBudgetAccount = Readonly<{
  authorityType: "runner_spend";
  accountId: string;
  scope: "runner_per_run" | "runner_monthly";
  principalSubject: string;
  grantId: string;
  providerId: string;
  scopeId: string;
  currency: string;
  actualCostMinor: number;
  reservedCostMinor: number;
  maxCostMinor: number;
}>;
export type RunnerAttemptState = Readonly<{ attemptNumber: number; previousOutcome: "none" | "failed_retryable" | "uncertain" | "settled" | "reserved"; previousOperationKeys: readonly string[] }>;
export type RunnerSpendAuthority = { admitted: boolean; principalSubject: string; grant: RunnerSpendGrant; attempt: RunnerAttemptState; perRun: RunnerBudgetAccount; monthly: RunnerBudgetAccount };
export type RunnerSpendReservation = { id: string; grantId: string; operationKey: string; providerId: string; model: string; catalogRef: string; scopeId: string; runType: string; currency: string; reservedCostMinor: number; attemptNumber: number; maxRetries: number; attemptDigest: string; status: "reserved" };
export type RunnerSpendRepository = {
  loadRunnerAuthority(grantId: string): Promise<RunnerSpendAuthority | null>;
  /** Atomic ledger insertion rechecks the exact attempt digest and runner-only accounts. Uncertainty and duplicate operations cannot advance it. */
  commitRunnerReservation(record: RunnerSpendReservation, accounts: readonly RunnerBudgetAccount[], attempt: RunnerAttemptState): Promise<{ kind: "created"; record: RunnerSpendReservation } | { kind: "existing"; record: RunnerSpendReservation } | { kind: "blocked" }>;
};
export type ReserveRunnerSpendResult = { kind: "reserved"; reservation: RunnerSpendReservation; replayed: boolean } | { kind: "blocked"; reason: "runner_grant_unavailable" | "runner_owner_denied" | "runner_grant_expired" | "runner_budget_exceeded" | "runner_invalid_request" | "runner_retry_unavailable" };

export async function reserveRunnerSpend(repository: RunnerSpendRepository, input: { grantId: string; principalSubject: string; operationKey: string; now: number }): Promise<ReserveRunnerSpendResult> {
  if (!validInput(input)) return { kind: "blocked", reason: "runner_invalid_request" };
  const authority = await repository.loadRunnerAuthority(input.grantId);
  if (!authority || !validGrant(authority.grant) || authority.grant.id !== input.grantId) return { kind: "blocked", reason: "runner_grant_unavailable" };
  if (!authority.admitted || authority.principalSubject !== input.principalSubject) return { kind: "blocked", reason: "runner_owner_denied" };
  if (authority.grant.expiresAt <= input.now) return { kind: "blocked", reason: "runner_grant_expired" };
  if (!validAttempt(authority.attempt, authority.grant.maxRetries)) return { kind: "blocked", reason: "runner_retry_unavailable" };
  if (input.operationKey !== await deriveRunnerOperationKey(authority)) return { kind: "blocked", reason: "runner_invalid_request" };
  if (authority.attempt.previousOperationKeys.includes(input.operationKey)) return { kind: "blocked", reason: "runner_retry_unavailable" };
  const attemptCostMinor = authority.grant.perRunCostMinor;
  if (
    !validAccount(authority.perRun, "runner_per_run", authority)
    || !validAccount(authority.monthly, "runner_monthly", authority)
    || authority.perRun.accountId === authority.monthly.accountId
    || !within(authority.perRun, attemptCostMinor)
    || !within(authority.monthly, attemptCostMinor)
    || !withinGrantMonthlyCeiling(authority.monthly, attemptCostMinor, authority.grant.monthlyCostMinor)
  ) return { kind: "blocked", reason: "runner_budget_exceeded" };
  const attemptDigest = await digest(stable(authority.attempt));
  const record: RunnerSpendReservation = { id: `rr_${await digest(`${authority.grant.id}:${input.operationKey}`)}`, grantId: authority.grant.id, operationKey: input.operationKey, providerId: authority.grant.providerId, model: authority.grant.model, catalogRef: authority.grant.catalogRef, scopeId: authority.grant.scopeId, runType: authority.grant.runType, currency: authority.grant.currency, reservedCostMinor: authority.grant.perRunCostMinor, attemptNumber: authority.attempt.attemptNumber, maxRetries: authority.grant.maxRetries, attemptDigest, status: "reserved" };
  const committed = await repository.commitRunnerReservation(record, [freezeAccount(authority.perRun), freezeAccount(authority.monthly)], freezeAttempt(authority.attempt));
  if (committed.kind === "blocked") return { kind: "blocked", reason: "runner_budget_exceeded" };
  return { kind: "reserved", reservation: committed.record, replayed: committed.kind === "existing" };
}

/** Binds the only reservable operation to the admitted owner and immutable runner grant facts. */
export async function deriveRunnerOperationKey(authority: Pick<RunnerSpendAuthority, "principalSubject" | "grant" | "attempt">): Promise<string> {
  const { grant } = authority;
  const attemptNumber = authority.attempt.attemptNumber;
  return `ro_${await digest(stable({ ownerSubject: authority.principalSubject, grantId: grant.id, providerId: grant.providerId, model: grant.model, catalogRef: grant.catalogRef, runType: grant.runType, scopeId: grant.scopeId, perRunCostMinor: grant.perRunCostMinor, monthlyCostMinor: grant.monthlyCostMinor, currency: grant.currency, expiresAt: grant.expiresAt, maxRetries: grant.maxRetries, attemptNumber }))}`;
}

function validInput(input: { grantId: string; principalSubject: string; operationKey: string; now: number }): boolean { return bounded(input.grantId, 256) && bounded(input.principalSubject, 256) && /^ro_[a-f0-9]{64}$/.test(input.operationKey) && Number.isSafeInteger(input.now) && input.now > 0; }
function validGrant(grant: RunnerSpendGrant): boolean { return grant.authorityType === "runner_spend" && bounded(grant.id, 256) && bounded(grant.providerId, 128) && bounded(grant.model, 128) && bounded(grant.catalogRef, 256) && bounded(grant.runType, 128) && bounded(grant.scopeId, 256) && /^[A-Z]{3}$/.test(grant.currency) && positive(grant.expiresAt) && nonNegative(grant.perRunCostMinor) && nonNegative(grant.monthlyCostMinor) && grant.perRunCostMinor <= grant.monthlyCostMinor && Number.isSafeInteger(grant.maxRetries) && grant.maxRetries >= 0 && grant.maxRetries <= 3; }
function validAttempt(value: unknown, maxRetries: number): value is RunnerAttemptState {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<RunnerAttemptState>;
  if (!nonNegative(attempt.attemptNumber) || attempt.attemptNumber > maxRetries || !Array.isArray(attempt.previousOperationKeys) || attempt.previousOperationKeys.length !== attempt.attemptNumber || new Set(attempt.previousOperationKeys).size !== attempt.previousOperationKeys.length || attempt.previousOperationKeys.some((key) => typeof key !== "string" || !/^ro_[a-f0-9]{64}$/.test(key))) return false;
  return attempt.attemptNumber === 0 ? attempt.previousOutcome === "none" : attempt.previousOutcome === "failed_retryable";
}
function validAccount(account: RunnerBudgetAccount, scope: RunnerBudgetAccount["scope"], authority: RunnerSpendAuthority): boolean {
  if (!account || typeof account !== "object") return false;
  const { grant, principalSubject } = authority;
  return Object.keys(account).sort().join(",") === "accountId,actualCostMinor,authorityType,currency,grantId,maxCostMinor,principalSubject,providerId,reservedCostMinor,scope,scopeId"
    && account.authorityType === "runner_spend"
    && account.scope === scope
    && account.principalSubject === principalSubject
    && account.grantId === grant.id
    && account.providerId === grant.providerId
    && account.scopeId === grant.scopeId
    && account.currency === grant.currency
    && account.accountId === runnerAccountId(scope, principalSubject, grant.id, grant.providerId, grant.scopeId)
    && bounded(account.accountId, 1_024)
    && bounded(account.principalSubject, 256)
    && bounded(account.grantId, 256)
    && bounded(account.providerId, 128)
    && bounded(account.scopeId, 256);
}
function runnerAccountId(scope: RunnerBudgetAccount["scope"], principalSubject: string, grantId: string, providerId: string, scopeId: string): string {
  return `runner:${scope}:${principalSubject}:${grantId}:${providerId}:${scopeId}`;
}
function within(account: RunnerBudgetAccount, amount: number): boolean {
  return [account.actualCostMinor, account.reservedCostMinor, account.maxCostMinor, amount].every(nonNegative)
    && safeSumWithin(account.actualCostMinor, account.reservedCostMinor, amount, account.maxCostMinor);
}
function withinGrantMonthlyCeiling(account: RunnerBudgetAccount, attemptCostMinor: number, monthlyCeiling: number): boolean {
  return nonNegative(monthlyCeiling) && safeSumWithin(account.actualCostMinor, account.reservedCostMinor, attemptCostMinor, monthlyCeiling);
}
function safeSumWithin(actual: number, reserved: number, addition: number, maximum: number): boolean {
  return actual <= maximum && reserved <= maximum - actual && addition <= maximum - actual - reserved;
}
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function positive(value: unknown): value is number { return nonNegative(value) && value > 0; }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function digest(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function freezeAttempt(attempt: RunnerAttemptState): RunnerAttemptState { return Object.freeze({ attemptNumber: attempt.attemptNumber, previousOutcome: attempt.previousOutcome, previousOperationKeys: Object.freeze([...attempt.previousOperationKeys]) }); }
function freezeAccount(account: RunnerBudgetAccount): RunnerBudgetAccount { return Object.freeze({ ...account }); }
