/** Separate synthetic ledger type: enrichment authority is intentionally not structurally accepted here. */
export type RunnerSpendGrant = {
  authorityType: "runner_spend"; id: string; providerId: string; model: string; catalogRef: string;
  runType: string; scopeId: string; perRunCostMinor: number; monthlyCostMinor: number;
  currency: string; expiresAt: number; maxRetries: number;
};
export type RunnerBudgetAccount = { scope: string; currency: string; actualCostMinor: number; reservedCostMinor: number; maxCostMinor: number };
export type RunnerSpendAuthority = { admitted: boolean; principalSubject: string; grant: RunnerSpendGrant; perRun: RunnerBudgetAccount; monthly: RunnerBudgetAccount };
export type RunnerSpendReservation = { id: string; grantId: string; operationKey: string; providerId: string; model: string; catalogRef: string; scopeId: string; runType: string; currency: string; reservedCostMinor: number; status: "reserved" };
export type RunnerSpendRepository = {
  loadRunnerAuthority(grantId: string): Promise<RunnerSpendAuthority | null>;
  /** Atomic ledger insertion for runner-only accounts. It must not consume enrichment grants. */
  commitRunnerReservation(record: RunnerSpendReservation, accounts: readonly RunnerBudgetAccount[]): Promise<{ kind: "created"; record: RunnerSpendReservation } | { kind: "existing"; record: RunnerSpendReservation } | { kind: "blocked" }>;
};
export type ReserveRunnerSpendResult = { kind: "reserved"; reservation: RunnerSpendReservation; replayed: boolean } | { kind: "blocked"; reason: "runner_grant_unavailable" | "runner_owner_denied" | "runner_grant_expired" | "runner_budget_exceeded" | "runner_invalid_request" };

export async function reserveRunnerSpend(repository: RunnerSpendRepository, input: { grantId: string; principalSubject: string; operationKey: string; now: number }): Promise<ReserveRunnerSpendResult> {
  if (!validInput(input)) return { kind: "blocked", reason: "runner_invalid_request" };
  const authority = await repository.loadRunnerAuthority(input.grantId);
  if (!authority || authority.grant.authorityType !== "runner_spend") return { kind: "blocked", reason: "runner_grant_unavailable" };
  if (!authority.admitted || authority.principalSubject !== input.principalSubject) return { kind: "blocked", reason: "runner_owner_denied" };
  if (authority.grant.expiresAt <= input.now) return { kind: "blocked", reason: "runner_grant_expired" };
  if (!within(authority.perRun, authority.grant.perRunCostMinor) || !within(authority.monthly, authority.grant.monthlyCostMinor) || authority.perRun.currency !== authority.grant.currency || authority.monthly.currency !== authority.grant.currency) return { kind: "blocked", reason: "runner_budget_exceeded" };
  const record: RunnerSpendReservation = { id: `rr_${await digest(`${authority.grant.id}:${input.operationKey}`)}`, grantId: authority.grant.id, operationKey: input.operationKey, providerId: authority.grant.providerId, model: authority.grant.model, catalogRef: authority.grant.catalogRef, scopeId: authority.grant.scopeId, runType: authority.grant.runType, currency: authority.grant.currency, reservedCostMinor: authority.grant.perRunCostMinor, status: "reserved" };
  const committed = await repository.commitRunnerReservation(record, [{ ...authority.perRun }, { ...authority.monthly }]);
  if (committed.kind === "blocked") return { kind: "blocked", reason: "runner_budget_exceeded" };
  return { kind: "reserved", reservation: committed.record, replayed: committed.kind === "existing" };
}

function validInput(input: { grantId: string; principalSubject: string; operationKey: string; now: number }): boolean { return typeof input.grantId === "string" && input.grantId.length > 0 && typeof input.principalSubject === "string" && input.principalSubject.length > 0 && typeof input.operationKey === "string" && input.operationKey.length > 0 && input.operationKey.length <= 256 && Number.isSafeInteger(input.now); }
function within(account: RunnerBudgetAccount, amount: number): boolean { return [account.actualCostMinor, account.reservedCostMinor, account.maxCostMinor, amount].every((value) => Number.isSafeInteger(value) && value >= 0) && account.actualCostMinor + account.reservedCostMinor + amount <= account.maxCostMinor; }
async function digest(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
