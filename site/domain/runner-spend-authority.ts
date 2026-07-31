/** Separate synthetic ledger type: enrichment authority is intentionally not structurally accepted here. */
export type RunnerSpendGrant = {
  authorityType: "runner_spend";
  id: string;
  providerId: string;
  model: string;
  catalogRef: string;
  runType: string;
  scopeId: string;
  perRunCostMinor: number;
  monthlyCostMinor: number;
  currency: string;
  expiresAt: number;
  maxRetries: number;
};

type RunnerBudgetAccountBase = Readonly<{
  authorityType: "runner_spend";
  accountId: string;
  principalSubject: string;
  providerId: string;
  scopeId: string;
  currency: string;
  actualCostMinor: number;
  reservedCostMinor: number;
  maxCostMinor: number;
}>;

/** A per-run account is one exact attempt and operation, never a reusable grant bucket. */
export type RunnerPerRunBudgetAccount = RunnerBudgetAccountBase & Readonly<{
  scope: "runner_per_run";
  grantId: string;
  attemptNumber: number;
  operationKey: string;
}>;

/**
 * A monthly account carries the current grant binding for validation, but its durable
 * identity is shared by every grant for the same owner/provider/scope/UTC month.
 */
export type RunnerMonthlyBudgetAccount = RunnerBudgetAccountBase & Readonly<{
  scope: "runner_monthly";
  grantId: string;
  period: string;
}>;

export type RunnerBudgetAccount = RunnerPerRunBudgetAccount | RunnerMonthlyBudgetAccount;
export type RunnerAttemptState = Readonly<{
  attemptNumber: number;
  previousOutcome: "none" | "failed_retryable" | "uncertain" | "settled" | "reserved";
  previousOperationKeys: readonly string[];
}>;
export type RunnerSpendAuthority = {
  admitted: boolean;
  principalSubject: string;
  grant: RunnerSpendGrant;
  attempt: RunnerAttemptState;
  perRun: RunnerPerRunBudgetAccount;
  monthly: RunnerMonthlyBudgetAccount;
};
export type RunnerSpendReservation = {
  id: string;
  grantId: string;
  operationKey: string;
  providerId: string;
  model: string;
  catalogRef: string;
  scopeId: string;
  runType: string;
  currency: string;
  reservedCostMinor: number;
  attemptNumber: number;
  maxRetries: number;
  attemptDigest: string;
  status: "reserved";
};
export type RunnerSpendRepository = {
  loadRunnerAuthority(grantId: string): Promise<RunnerSpendAuthority | null>;
  /** Atomic insertion rechecks the exact attempt and both runner-only accounts. */
  commitRunnerReservation(
    record: RunnerSpendReservation,
    accounts: readonly [RunnerPerRunBudgetAccount, RunnerMonthlyBudgetAccount],
    attempt: RunnerAttemptState,
  ): Promise<
    { kind: "created"; record: RunnerSpendReservation }
    | { kind: "existing"; record: RunnerSpendReservation }
    | { kind: "blocked" }
  >;
};
export type ReserveRunnerSpendResult =
  | { kind: "reserved"; reservation: RunnerSpendReservation; replayed: boolean }
  | {
    kind: "blocked";
    reason:
      | "runner_grant_unavailable"
      | "runner_owner_denied"
      | "runner_grant_expired"
      | "runner_budget_exceeded"
      | "runner_invalid_request"
      | "runner_retry_unavailable";
  };

export async function reserveRunnerSpend(
  repository: RunnerSpendRepository,
  input: { grantId: string; principalSubject: string; operationKey: string; now: number },
): Promise<ReserveRunnerSpendResult> {
  const period = deriveRunnerUtcMonthPeriod(input.now);
  if (!validInput(input) || period === null) return { kind: "blocked", reason: "runner_invalid_request" };
  const loadedAuthority = await repository.loadRunnerAuthority(input.grantId);
  const authority = snapshotRunnerAuthority(loadedAuthority);
  if (loadedAuthority !== null && !authority) {
    return { kind: "blocked", reason: "runner_grant_unavailable" };
  }
  if (!authority || !validGrant(authority.grant) || authority.grant.id !== input.grantId) {
    return { kind: "blocked", reason: "runner_grant_unavailable" };
  }
  if (authority.admitted !== true || authority.principalSubject !== input.principalSubject) {
    return { kind: "blocked", reason: "runner_owner_denied" };
  }
  if (authority.grant.expiresAt <= input.now) {
    return { kind: "blocked", reason: "runner_grant_expired" };
  }
  if (!validAttempt(authority.attempt, authority.grant.maxRetries)) {
    return { kind: "blocked", reason: "runner_retry_unavailable" };
  }
  if (input.operationKey !== await deriveRunnerOperationKey(authority)) {
    return { kind: "blocked", reason: "runner_invalid_request" };
  }
  if (authority.attempt.previousOperationKeys.includes(input.operationKey)) {
    return { kind: "blocked", reason: "runner_retry_unavailable" };
  }
  const attemptCostMinor = authority.grant.perRunCostMinor;
  if (
    !validPerRunAccount(authority.perRun, authority, input.operationKey)
    || !validMonthlyAccount(authority.monthly, authority, period)
    || authority.perRun.accountId === authority.monthly.accountId
    || !within(authority.perRun, attemptCostMinor)
    || !within(authority.monthly, attemptCostMinor)
    || !withinGrantMonthlyCeiling(authority.monthly, attemptCostMinor, authority.grant.monthlyCostMinor)
  ) {
    return { kind: "blocked", reason: "runner_budget_exceeded" };
  }
  const attemptDigest = await digest(stable(authority.attempt));
  const record = freezeRunnerReservation({
    id: `rr_${await digest(lengthPrefixed(authority.grant.id, input.operationKey, String(authority.attempt.attemptNumber)))}`,
    grantId: authority.grant.id,
    operationKey: input.operationKey,
    providerId: authority.grant.providerId,
    model: authority.grant.model,
    catalogRef: authority.grant.catalogRef,
    scopeId: authority.grant.scopeId,
    runType: authority.grant.runType,
    currency: authority.grant.currency,
    reservedCostMinor: authority.grant.perRunCostMinor,
    attemptNumber: authority.attempt.attemptNumber,
    maxRetries: authority.grant.maxRetries,
    attemptDigest,
    status: "reserved",
  });
  const accounts = Object.freeze([
    freezePerRunAccount(authority.perRun),
    freezeMonthlyAccount(authority.monthly),
  ]) as readonly [RunnerPerRunBudgetAccount, RunnerMonthlyBudgetAccount];
  const loadedCommittedResult = await repository.commitRunnerReservation({ ...record }, accounts, freezeAttempt(authority.attempt));
  const committedResult = snapshotRepositoryValue(loadedCommittedResult);
  if (!committedResult) return { kind: "blocked", reason: "runner_grant_unavailable" };
  const blockedEnvelope = exactDataRecord(committedResult, ["kind"]);
  if (blockedEnvelope?.kind === "blocked") return { kind: "blocked", reason: "runner_budget_exceeded" };
  const committed = exactDataRecord(committedResult, ["kind", "record"]);
  if (
    !committed
    || (committed.kind !== "created" && committed.kind !== "existing")
    || !exactPlainData(committed.record, record)
  ) return { kind: "blocked", reason: "runner_grant_unavailable" };
  return { kind: "reserved", reservation: record, replayed: committed.kind === "existing" };
}

/** Binds the only reservable operation to the admitted owner and immutable runner grant facts. */
export async function deriveRunnerOperationKey(
  authority: Pick<RunnerSpendAuthority, "principalSubject" | "grant" | "attempt">,
): Promise<string> {
  const { grant } = authority;
  return `ro_${await digest(stable({
    ownerSubject: authority.principalSubject,
    grantId: grant.id,
    providerId: grant.providerId,
    model: grant.model,
    catalogRef: grant.catalogRef,
    runType: grant.runType,
    scopeId: grant.scopeId,
    perRunCostMinor: grant.perRunCostMinor,
    monthlyCostMinor: grant.monthlyCostMinor,
    currency: grant.currency,
    expiresAt: grant.expiresAt,
    maxRetries: grant.maxRetries,
    attemptNumber: authority.attempt.attemptNumber,
  }))}`;
}

/** Returns the UTC calendar month that owns the accounting row. */
export function deriveRunnerUtcMonthPeriod(now: number): string | null {
  if (!positive(now)) return null;
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) return null;
  return `${instant.getUTCFullYear().toString().padStart(4, "0")}-${String(instant.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function deriveRunnerPerRunAccountId(input: {
  principalSubject: string;
  grantId: string;
  providerId: string;
  scopeId: string;
  attemptNumber: number;
  operationKey: string;
}): string {
  return `runner:${lengthPrefixed(
    "runner_per_run",
    input.principalSubject,
    input.grantId,
    input.providerId,
    input.scopeId,
    String(input.attemptNumber),
    input.operationKey,
  )}`;
}

export function deriveRunnerMonthlyAccountId(input: {
  principalSubject: string;
  providerId: string;
  scopeId: string;
  period: string;
}): string {
  return `runner:${lengthPrefixed(
    "runner_monthly",
    input.principalSubject,
    input.providerId,
    input.scopeId,
    input.period,
  )}`;
}

function validInput(input: {
  grantId: string;
  principalSubject: string;
  operationKey: string;
  now: number;
}): boolean {
  return bounded(input.grantId, 256)
    && bounded(input.principalSubject, 256)
    && /^ro_[a-f0-9]{64}$/.test(input.operationKey)
    && positive(input.now);
}

function validGrant(grant: RunnerSpendGrant): boolean {
  return exactKeys(grant, [
    "authorityType", "catalogRef", "currency", "expiresAt", "id", "maxRetries", "model",
    "monthlyCostMinor", "perRunCostMinor", "providerId", "runType", "scopeId",
  ])
    && grant.authorityType === "runner_spend"
    && bounded(grant.id, 256)
    && bounded(grant.providerId, 128)
    && bounded(grant.model, 128)
    && bounded(grant.catalogRef, 256)
    && bounded(grant.runType, 128)
    && bounded(grant.scopeId, 256)
    && /^[A-Z]{3}$/.test(grant.currency)
    && positive(grant.expiresAt)
    && nonNegative(grant.perRunCostMinor)
    && nonNegative(grant.monthlyCostMinor)
    && grant.perRunCostMinor <= grant.monthlyCostMinor
    && Number.isSafeInteger(grant.maxRetries)
    && grant.maxRetries >= 0
    && grant.maxRetries <= 3;
}

function validAttempt(value: unknown, maxRetries: number): value is RunnerAttemptState {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<RunnerAttemptState>;
  if (
    !exactKeys(attempt, ["attemptNumber", "previousOperationKeys", "previousOutcome"])
    || !nonNegative(attempt.attemptNumber)
    || attempt.attemptNumber > maxRetries
    || !Array.isArray(attempt.previousOperationKeys)
    || attempt.previousOperationKeys.length !== attempt.attemptNumber
    || new Set(attempt.previousOperationKeys).size !== attempt.previousOperationKeys.length
    || attempt.previousOperationKeys.some((key) => typeof key !== "string" || !/^ro_[a-f0-9]{64}$/.test(key))
  ) {
    return false;
  }
  return attempt.attemptNumber === 0
    ? attempt.previousOutcome === "none"
    : attempt.previousOutcome === "failed_retryable";
}

function validPerRunAccount(
  account: RunnerPerRunBudgetAccount,
  authority: RunnerSpendAuthority,
  operationKey: string,
): boolean {
  if (!account || typeof account !== "object") return false;
  const { grant, principalSubject, attempt } = authority;
  return exactKeys(account, [
    "accountId", "actualCostMinor", "attemptNumber", "authorityType", "currency", "grantId",
    "maxCostMinor", "operationKey", "principalSubject", "providerId", "reservedCostMinor",
    "scope", "scopeId",
  ])
    && validCommonAccount(account, authority)
    && account.scope === "runner_per_run"
    && account.grantId === grant.id
    && account.attemptNumber === attempt.attemptNumber
    && account.operationKey === operationKey
    && account.accountId === deriveRunnerPerRunAccountId({
      principalSubject,
      grantId: grant.id,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      attemptNumber: attempt.attemptNumber,
      operationKey,
    });
}

function validMonthlyAccount(
  account: RunnerMonthlyBudgetAccount,
  authority: RunnerSpendAuthority,
  period: string,
): boolean {
  if (!account || typeof account !== "object") return false;
  const { grant, principalSubject } = authority;
  return exactKeys(account, [
    "accountId", "actualCostMinor", "authorityType", "currency", "grantId", "maxCostMinor",
    "period", "principalSubject", "providerId", "reservedCostMinor", "scope", "scopeId",
  ])
    && validCommonAccount(account, authority)
    && account.scope === "runner_monthly"
    && account.grantId === grant.id
    && account.period === period
    && account.accountId === deriveRunnerMonthlyAccountId({
      principalSubject,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      period,
    });
}

function validCommonAccount(
  account: RunnerBudgetAccount,
  authority: RunnerSpendAuthority,
): boolean {
  const { grant, principalSubject } = authority;
  return account.authorityType === "runner_spend"
    && account.principalSubject === principalSubject
    && account.providerId === grant.providerId
    && account.scopeId === grant.scopeId
    && account.currency === grant.currency
    && bounded(account.accountId, 2_048)
    && bounded(account.principalSubject, 256)
    && bounded(account.providerId, 128)
    && bounded(account.scopeId, 256);
}

function within(account: RunnerBudgetAccount, amount: number): boolean {
  return [account.actualCostMinor, account.reservedCostMinor, account.maxCostMinor, amount].every(nonNegative)
    && safeSumWithin(account.actualCostMinor, account.reservedCostMinor, amount, account.maxCostMinor);
}

function withinGrantMonthlyCeiling(
  account: RunnerMonthlyBudgetAccount,
  attemptCostMinor: number,
  monthlyCeiling: number,
): boolean {
  return nonNegative(monthlyCeiling)
    && safeSumWithin(account.actualCostMinor, account.reservedCostMinor, attemptCostMinor, monthlyCeiling);
}

function safeSumWithin(actual: number, reserved: number, addition: number, maximum: number): boolean {
  return actual <= maximum && reserved <= maximum - actual && addition <= maximum - actual - reserved;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function lengthPrefixed(...values: string[]): string {
  return values.map((value) => `${value.length}:${value}`).join(":");
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return nonNegative(value) && value > 0;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function freezeAttempt(attempt: RunnerAttemptState): RunnerAttemptState {
  return Object.freeze({
    attemptNumber: attempt.attemptNumber,
    previousOutcome: attempt.previousOutcome,
    previousOperationKeys: Object.freeze([...attempt.previousOperationKeys]),
  });
}

function freezePerRunAccount(account: RunnerPerRunBudgetAccount): RunnerPerRunBudgetAccount {
  return Object.freeze({ ...account });
}

function freezeMonthlyAccount(account: RunnerMonthlyBudgetAccount): RunnerMonthlyBudgetAccount {
  return Object.freeze({ ...account });
}

function freezeRunnerReservation(record: RunnerSpendReservation): RunnerSpendReservation {
  return Object.freeze({
    id: record.id,
    grantId: record.grantId,
    operationKey: record.operationKey,
    providerId: record.providerId,
    model: record.model,
    catalogRef: record.catalogRef,
    scopeId: record.scopeId,
    runType: record.runType,
    currency: record.currency,
    reservedCostMinor: record.reservedCostMinor,
    attemptNumber: record.attemptNumber,
    maxRetries: record.maxRetries,
    attemptDigest: record.attemptDigest,
    status: record.status,
  });
}

function snapshotRunnerAuthority(value: unknown): RunnerSpendAuthority | null {
  if (value === null) return null;
  const snapshot = snapshotRepositoryValue(value);
  const root = exactDataRecord(snapshot, ["admitted", "principalSubject", "grant", "attempt", "perRun", "monthly"]);
  const grant = root && exactDataRecord(root.grant, [
    "authorityType", "id", "providerId", "model", "catalogRef", "runType", "scopeId",
    "perRunCostMinor", "monthlyCostMinor", "currency", "expiresAt", "maxRetries",
  ]);
  const attempt = root && exactDataRecord(root.attempt, ["attemptNumber", "previousOutcome", "previousOperationKeys"]);
  const previousOperationKeys = attempt && exactDataArray(attempt.previousOperationKeys, 0, 4);
  const perRun = root && exactDataRecord(root.perRun, [
    "authorityType", "accountId", "scope", "principalSubject", "grantId", "providerId", "scopeId",
    "attemptNumber", "operationKey", "currency", "actualCostMinor", "reservedCostMinor", "maxCostMinor",
  ]);
  const monthly = root && exactDataRecord(root.monthly, [
    "authorityType", "accountId", "scope", "principalSubject", "grantId", "providerId", "scopeId",
    "period", "currency", "actualCostMinor", "reservedCostMinor", "maxCostMinor",
  ]);
  if (!root || !grant || !attempt || !previousOperationKeys || !perRun || !monthly) return null;
  return Object.freeze({
    admitted: root.admitted as boolean,
    principalSubject: root.principalSubject as string,
    grant: Object.freeze({
      authorityType: grant.authorityType as "runner_spend",
      id: grant.id as string,
      providerId: grant.providerId as string,
      model: grant.model as string,
      catalogRef: grant.catalogRef as string,
      runType: grant.runType as string,
      scopeId: grant.scopeId as string,
      perRunCostMinor: grant.perRunCostMinor as number,
      monthlyCostMinor: grant.monthlyCostMinor as number,
      currency: grant.currency as string,
      expiresAt: grant.expiresAt as number,
      maxRetries: grant.maxRetries as number,
    }),
    attempt: Object.freeze({
      attemptNumber: attempt.attemptNumber as number,
      previousOutcome: attempt.previousOutcome as RunnerAttemptState["previousOutcome"],
      previousOperationKeys: Object.freeze([...previousOperationKeys]) as readonly string[],
    }),
    perRun: Object.freeze({
      authorityType: perRun.authorityType as "runner_spend",
      accountId: perRun.accountId as string,
      scope: perRun.scope as "runner_per_run",
      principalSubject: perRun.principalSubject as string,
      grantId: perRun.grantId as string,
      providerId: perRun.providerId as string,
      scopeId: perRun.scopeId as string,
      attemptNumber: perRun.attemptNumber as number,
      operationKey: perRun.operationKey as string,
      currency: perRun.currency as string,
      actualCostMinor: perRun.actualCostMinor as number,
      reservedCostMinor: perRun.reservedCostMinor as number,
      maxCostMinor: perRun.maxCostMinor as number,
    }),
    monthly: Object.freeze({
      authorityType: monthly.authorityType as "runner_spend",
      accountId: monthly.accountId as string,
      scope: monthly.scope as "runner_monthly",
      principalSubject: monthly.principalSubject as string,
      grantId: monthly.grantId as string,
      providerId: monthly.providerId as string,
      scopeId: monthly.scopeId as string,
      period: monthly.period as string,
      currency: monthly.currency as string,
      actualCostMinor: monthly.actualCostMinor as number,
      reservedCostMinor: monthly.reservedCostMinor as number,
      maxCostMinor: monthly.maxCostMinor as number,
    }),
  });
}

const invalidSnapshot = Symbol("invalid_repository_snapshot");

function snapshotRepositoryValue<T = unknown>(value: unknown): T | null {
  if (value === null) return null;
  const snapshot = snapshotPlainNode(value, new Set<object>());
  if (snapshot === invalidSnapshot) return null;
  try {
    structuredClone(value);
  } catch {
    return null;
  }
  return snapshot as T;
}

function snapshotPlainNode(value: unknown, seen: Set<object>): unknown | typeof invalidSnapshot {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : invalidSnapshot;
  if (typeof value !== "object" || seen.has(value)) return invalidSnapshot;
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== "string")) return invalidSnapshot;
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) return invalidSnapshot;
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
        return invalidSnapshot;
      }
      const length = lengthDescriptor.value;
      if (ownKeys.length !== length + 1) return invalidSnapshot;
      const copy: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalidSnapshot;
        const child = snapshotPlainNode(descriptor.value, seen);
        if (child === invalidSnapshot) return invalidSnapshot;
        copy.push(child);
      }
      return Object.freeze(copy);
    }
    if (prototype !== Object.prototype) return invalidSnapshot;
    const copy: Record<string, unknown> = {};
    for (const key of ownKeys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalidSnapshot;
      const child = snapshotPlainNode(descriptor.value, seen);
      if (child === invalidSnapshot) return invalidSnapshot;
      copy[key] = child;
    }
    return Object.freeze(copy);
  } catch {
    return invalidSnapshot;
  } finally {
    seen.delete(value);
  }
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

function exactDataArray(value: unknown, min: number, max: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string") || keys.length !== value.length + 1 || !("length" in descriptors)) return null;
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
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
