/**
 * Synthetic, repository-injected Phase 5 preparation authority.  This module
 * deliberately has no D1, route, provider, or composition dependency.
 */
export type EnrichmentOperation = "business_contact_lookup/v1";
export type ProviderQuote = {
  providerId: string; providerVersion: string; catalogRef: string; revision: number;
  currency: string; unitCostMinor: number; expiresAt: number;
};
export type IssuanceSnapshot = {
  admitted: boolean; workspaceId: string; ownerSubject: string; revision: number;
  configuration: { id: string; digest: string; revision: number; current: boolean };
  prospects: Array<{ id: string; state: string; configurationId: string; configurationDigest: string; revision: number }>;
  quote: ProviderQuote;
};
export type EnrichmentGrantTuple = {
  workspaceId: string;
  providerId: string; providerVersion: string; catalogRef: string; quoteRevision: number;
  quoteUnitCostMinor: number; quoteExpiresAt: number;
  prospectIds: readonly string[]; operation: EnrichmentOperation; operationKey: string;
  maxUnits: number; maxCostMinor: number; currency: string; expiresAt: number;
  ownerSubject: string; nonce: string; configurationId: string; configurationDigest: string;
  configurationRevision: number; sourceRevision: number; prospectRevisions: readonly Readonly<{ id: string; revision: number }>[]; digest: string;
};
export type EnrichmentGrant = { id: string; workspaceId: string; idempotencyKey: string; requestDigest: string; tuple: EnrichmentGrantTuple; status: "issued" };
export type EnrichmentIssuanceAudit = { action: "enrichment.grant.issued"; grantId: string; operationKey: string; digest: string; requestDigest: string; boundedReason: "issued" };
export type IssuanceRepository = {
  loadIssuanceSnapshot(principalSubject: string, prospectIds: readonly string[]): Promise<IssuanceSnapshot | null>;
  findGrantByIdempotency(workspaceId: string, idempotencyKey: string): Promise<EnrichmentGrant | null>;
  /** Must be one immutable transaction keyed by workspace + idempotency key. */
  commitGrant(record: EnrichmentGrant): Promise<{ kind: "created"; record: EnrichmentGrant } | { kind: "existing"; record: EnrichmentGrant }>;
  /** Server entropy. A client request never supplies authority nonce material. */
  nextNonce?: () => string;
};
export type IssueEnrichmentGrantInput = {
  principalSubject: string; prospectIds: readonly string[]; operation: EnrichmentOperation;
  maxUnits: number; maxCostMinor: number; currency: string; expiresAt: number;
  expectedRevision: number; idempotencyKey: string; now: number;
};
export type IssueEnrichmentGrantResult =
  | { kind: "issued"; grant: EnrichmentGrant; audit: EnrichmentIssuanceAudit; replayed: boolean }
  | { kind: "blocked"; reason: EnrichmentBlockedReason }
  | { kind: "conflict"; reason: "idempotency_conflict" };
export type EnrichmentBlockedReason =
  | "owner_not_admitted" | "invalid_request" | "stale_revision" | "prospect_not_approved"
  | "configuration_not_current" | "quote_unavailable" | "quote_expired" | "currency_mismatch" | "cost_unbounded"
  | "repository_result_invalid";

export async function issueEnrichmentGrant(repository: IssuanceRepository, input: IssueEnrichmentGrantInput): Promise<IssueEnrichmentGrantResult> {
  const prospectIds = normalizeIds(input.prospectIds);
  if (!prospectIds || !validRequest(input, prospectIds)) return { kind: "blocked", reason: "invalid_request" };
  const loadedSnapshot = await repository.loadIssuanceSnapshot(input.principalSubject, prospectIds);
  const snapshot = snapshotIssuanceAuthority(loadedSnapshot);
  if (loadedSnapshot !== null && !snapshot) return { kind: "blocked", reason: "repository_result_invalid" };
  const structureReason = validateIssuanceSnapshotStructure(snapshot);
  if (structureReason) return { kind: "blocked", reason: structureReason };
  const admissionReason = validateAdmission(snapshot, input);
  if (admissionReason) return { kind: "blocked", reason: admissionReason };
  const current = snapshot!;

  const loadedExisting = await repository.findGrantByIdempotency(current.workspaceId, input.idempotencyKey);
  const existingSnapshot = snapshotRepositoryValue(loadedExisting);
  if (loadedExisting !== null && !existingSnapshot) return { kind: "blocked", reason: "repository_result_invalid" };
  if (existingSnapshot !== null) {
    const existing = await validateRepositoryGrant(existingSnapshot, {
      workspaceId: current.workspaceId,
      ownerSubject: current.ownerSubject,
      idempotencyKey: input.idempotencyKey,
    });
    if (!existing) return { kind: "blocked", reason: "repository_result_invalid" };
    return replayInputMatches(existing.grant, input, prospectIds)
      ? issued(existing.grant, true)
      : { kind: "conflict", reason: "idempotency_conflict" };
  }

  const reason = validateCurrentAuthority(current, input, prospectIds);
  if (reason) return { kind: "blocked", reason };
  const operationKey = await deriveOperationKey({ snapshot: current, input, prospectIds });
  const requestMaterial = tupleMaterial(current, input, prospectIds, operationKey);
  const requestDigest = await canonicalDigest(grantRequestMaterial(input.idempotencyKey, requestMaterial));
  const nonce = serverNonce(repository);
  const unsigned = { ...requestMaterial, nonce };
  const tuple: EnrichmentGrantTuple = { ...unsigned, digest: await canonicalDigest(unsigned) };
  const grant = freezeGrant({
    id: `eg_${tuple.digest.slice(0, 24)}`, workspaceId: current.workspaceId, idempotencyKey: input.idempotencyKey,
    requestDigest, tuple, status: "issued",
  });
  const loadedCommittedResult = await repository.commitGrant(grant);
  const committedResult = snapshotRepositoryValue(loadedCommittedResult);
  if (!committedResult) return { kind: "blocked", reason: "repository_result_invalid" };
  const committedEnvelope = exactDataRecord(committedResult, ["kind", "record"]);
  if (!committedEnvelope || (committedEnvelope.kind !== "created" && committedEnvelope.kind !== "existing")) {
    return { kind: "blocked", reason: "repository_result_invalid" };
  }
  const committed = await validateRepositoryGrant(committedEnvelope.record, {
    workspaceId: current.workspaceId,
    ownerSubject: current.ownerSubject,
    idempotencyKey: input.idempotencyKey,
    requestDigest,
    requestMaterial,
    exactGrant: committedEnvelope.kind === "created" ? grant : undefined,
  });
  if (!committed) return { kind: "blocked", reason: "repository_result_invalid" };
  if (!committed.requestMatches) return { kind: "conflict", reason: "idempotency_conflict" };
  return issued(committed.grant, committedEnvelope.kind === "existing");
}

export async function deriveOperationKey(value: { snapshot: IssuanceSnapshot; input: Pick<IssueEnrichmentGrantInput, "operation" | "maxUnits" | "maxCostMinor" | "currency" | "expiresAt">; prospectIds: readonly string[] }): Promise<string> {
  const { snapshot, input, prospectIds } = value;
  return `op_${await canonicalDigest(tupleMaterial(snapshot, input, prospectIds, "operation-key-derived"))}`;
}

function tupleMaterial(snapshot: IssuanceSnapshot, input: Pick<IssueEnrichmentGrantInput, "operation" | "maxUnits" | "maxCostMinor" | "currency" | "expiresAt">, prospectIds: readonly string[], operationKey: string) {
  return {
    workspaceId: snapshot.workspaceId,
    providerId: snapshot.quote.providerId, providerVersion: snapshot.quote.providerVersion, catalogRef: snapshot.quote.catalogRef,
    quoteRevision: snapshot.quote.revision, quoteUnitCostMinor: snapshot.quote.unitCostMinor, quoteExpiresAt: snapshot.quote.expiresAt,
    prospectIds: [...prospectIds], operation: input.operation, operationKey,
    maxUnits: input.maxUnits, maxCostMinor: input.maxCostMinor, currency: input.currency, expiresAt: input.expiresAt,
    ownerSubject: snapshot.ownerSubject, configurationId: snapshot.configuration.id, configurationDigest: snapshot.configuration.digest,
    configurationRevision: snapshot.configuration.revision, sourceRevision: snapshot.revision,
    prospectRevisions: snapshot.prospects.map(({ id, revision }) => ({ id, revision })).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function grantRequestMaterial(idempotencyKey: string, requestMaterial: ReturnType<typeof tupleMaterial>) {
  return { idempotencyKey, requestMaterial };
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export async function canonicalDigest(value: unknown): Promise<string> { return digest(canonical(value)); }

function issued(grant: EnrichmentGrant, replayed: boolean): Extract<IssueEnrichmentGrantResult, { kind: "issued" }> {
  return { kind: "issued", grant, replayed, audit: { action: "enrichment.grant.issued", grantId: grant.id, operationKey: grant.tuple.operationKey, digest: grant.tuple.digest, requestDigest: grant.requestDigest, boundedReason: "issued" } };
}
function replayInputMatches(grant: EnrichmentGrant, input: IssueEnrichmentGrantInput, ids: readonly string[]): boolean {
  const tuple = grant.tuple;
  return tuple.ownerSubject === input.principalSubject
    && tuple.sourceRevision === input.expectedRevision
    && tuple.operation === input.operation
    && tuple.maxUnits === input.maxUnits
    && tuple.maxCostMinor === input.maxCostMinor
    && tuple.currency === input.currency
    && tuple.expiresAt === input.expiresAt
    && canonical(tuple.prospectIds) === canonical(ids);
}
function validateAdmission(snapshot: IssuanceSnapshot | null, input: IssueEnrichmentGrantInput): EnrichmentBlockedReason | null {
  if (!snapshot || snapshot.admitted !== true || snapshot.ownerSubject !== input.principalSubject) return "owner_not_admitted";
  return null;
}
function validateIssuanceSnapshotStructure(snapshot: IssuanceSnapshot | null): EnrichmentBlockedReason | null {
  if (!snapshot) return null;
  if (
    typeof snapshot.admitted !== "boolean"
    || !bounded(snapshot.workspaceId, 256)
    || !bounded(snapshot.ownerSubject, 256)
  ) return "repository_result_invalid";
  if (!positive(snapshot.revision)) return "stale_revision";
  if (
    !bounded(snapshot.configuration.id, 256)
    || !digestLike(snapshot.configuration.digest)
    || !positive(snapshot.configuration.revision)
    || typeof snapshot.configuration.current !== "boolean"
  ) return "configuration_not_current";
  if (
    !bounded(snapshot.quote.providerId, 128)
    || !bounded(snapshot.quote.providerVersion, 128)
    || !bounded(snapshot.quote.catalogRef, 256)
    || !positive(snapshot.quote.revision)
    || !canonicalCurrency(snapshot.quote.currency)
    || !nonNegativeInteger(snapshot.quote.unitCostMinor)
    || !positive(snapshot.quote.expiresAt)
  ) return "quote_unavailable";
  const prospectIds = new Set<string>();
  for (const prospect of snapshot.prospects) {
    if (
      !bounded(prospect.id, 256)
      || prospectIds.has(prospect.id)
      || !bounded(prospect.state, 64)
      || !bounded(prospect.configurationId, 256)
      || !digestLike(prospect.configurationDigest)
      || !positive(prospect.revision)
    ) return "prospect_not_approved";
    prospectIds.add(prospect.id);
  }
  return null;
}
function validateCurrentAuthority(snapshot: IssuanceSnapshot, input: IssueEnrichmentGrantInput, ids: readonly string[]): EnrichmentBlockedReason | null {
  if (snapshot.revision !== input.expectedRevision) return "stale_revision";
  if (snapshot.configuration.current !== true) return "configuration_not_current";
  if (snapshot.quote.expiresAt <= input.now) return "quote_expired";
  if (snapshot.quote.currency !== input.currency) return "currency_mismatch";
  if (!safeProduct(snapshot.quote.unitCostMinor, input.maxUnits) || input.maxCostMinor < snapshot.quote.unitCostMinor * input.maxUnits) return "cost_unbounded";
  if (input.expiresAt > snapshot.quote.expiresAt) return "quote_expired";
  const actualIds = snapshot.prospects.map((prospect) => prospect.id);
  if (snapshot.prospects.length !== ids.length || new Set(actualIds).size !== actualIds.length || !sameIdSet(actualIds, ids) || snapshot.prospects.some((prospect) => !bounded(prospect.id, 256) || prospect.state !== "approved" || prospect.configurationId !== snapshot.configuration.id || prospect.configurationDigest !== snapshot.configuration.digest || !positive(prospect.revision))) return "prospect_not_approved";
  return null;
}
function validRequest(input: IssueEnrichmentGrantInput, ids: readonly string[]): boolean {
  return ids.length > 0 && bounded(input.principalSubject, 256) && input.operation === "business_contact_lookup/v1" && integer(input.maxUnits) && input.maxUnits > 0 && input.maxUnits <= 1_000 && integer(input.maxCostMinor) && input.maxCostMinor >= 0 && canonicalCurrency(input.currency) && positive(input.expiresAt) && positive(input.now) && input.expiresAt > input.now && input.expiresAt <= input.now + 60 * 60 * 1_000 && positive(input.expectedRevision) && bounded(input.idempotencyKey, 256);
}
function normalizeIds(ids: readonly string[]): string[] | null {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => !bounded(id, 256))) return null;
  const sorted = [...ids].sort(); return new Set(sorted).size === sorted.length ? sorted : null;
}
function serverNonce(repository: IssuanceRepository): string {
  const nonce = repository.nextNonce?.() ?? crypto.randomUUID();
  if (!bounded(nonce, 256)) throw new Error("enrichment_nonce_unavailable");
  return nonce;
}
function bounded(value: unknown, length: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= length; }
function canonicalCurrency(value: unknown): value is string { return typeof value === "string" && /^[A-Z]{3}$/.test(value); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function positive(value: unknown): value is number { return integer(value) && value > 0; }
function safeProduct(left: number, right: number): boolean { return left === 0 || left <= Math.floor(Number.MAX_SAFE_INTEGER / right); }
function sameIdSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((id) => right.includes(id)); }
function digestLike(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
async function digest(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }

function freezeGrant(grant: EnrichmentGrant): EnrichmentGrant {
  const prospectRevisions = Object.freeze(grant.tuple.prospectRevisions.map((item) => Object.freeze({ id: item.id, revision: item.revision })));
  const tuple = Object.freeze({ ...grant.tuple, prospectIds: Object.freeze([...grant.tuple.prospectIds]), prospectRevisions });
  return Object.freeze({ ...grant, tuple });
}

type ExpectedRepositoryGrant = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  idempotencyKey: string;
  requestDigest?: string;
  requestMaterial?: ReturnType<typeof tupleMaterial>;
  exactGrant?: EnrichmentGrant;
}>;

/**
 * Parses one complete issued grant from an untrusted repository boundary.
 * Exact plain/accessor-free shape, every canonical digest, all bounded tuple
 * fields, and the derived grant/operation identifiers must agree.
 */
export async function parseIssuedEnrichmentGrant(candidate: unknown): Promise<EnrichmentGrant | null> {
  return (await validateRepositoryGrant(candidate))?.grant ?? null;
}

async function validateRepositoryGrant(candidate: unknown, expected?: ExpectedRepositoryGrant): Promise<{ grant: EnrichmentGrant; requestMatches: boolean } | null> {
  try {
    const snapshot = snapshotRepositoryValue(candidate);
    const grant = exactDataRecord(snapshot, ["id", "workspaceId", "idempotencyKey", "requestDigest", "tuple", "status"]);
    const tuple = grant && exactDataRecord(grant.tuple, [
      "workspaceId", "providerId", "providerVersion", "catalogRef", "quoteRevision", "quoteUnitCostMinor",
      "quoteExpiresAt", "prospectIds", "operation", "operationKey", "maxUnits", "maxCostMinor", "currency",
      "expiresAt", "ownerSubject", "nonce", "configurationId", "configurationDigest",
      "configurationRevision", "sourceRevision", "prospectRevisions", "digest",
    ]);
    if (!grant || !tuple) return null;
    const prospectIds = exactDataArray(tuple.prospectIds, 1, 100);
    const revisionRows = exactDataArray(tuple.prospectRevisions, 1, 100);
    if (!prospectIds || !revisionRows) return null;
    const prospectRevisions: Array<{ id: string; revision: number }> = [];
    for (const row of revisionRows) {
      const revision = exactDataRecord(row, ["id", "revision"]);
      if (!revision || !bounded(revision.id, 256) || !positive(revision.revision)) return null;
      prospectRevisions.push({ id: revision.id, revision: revision.revision });
    }
    const normalizedIds = normalizeIds(prospectIds);
    if (
      !normalizedIds
      || canonical(normalizedIds) !== canonical(prospectIds)
      || prospectRevisions.length !== prospectIds.length
      || new Set(prospectRevisions.map((item) => item.id)).size !== prospectRevisions.length
      || prospectRevisions.some((item, index) => item.id !== prospectIds[index])
    ) return null;
    const parsedTuple: EnrichmentGrantTuple = {
      workspaceId: tuple.workspaceId as string,
      providerId: tuple.providerId as string,
      providerVersion: tuple.providerVersion as string,
      catalogRef: tuple.catalogRef as string,
      quoteRevision: tuple.quoteRevision as number,
      quoteUnitCostMinor: tuple.quoteUnitCostMinor as number,
      quoteExpiresAt: tuple.quoteExpiresAt as number,
      prospectIds,
      operation: tuple.operation as EnrichmentOperation,
      operationKey: tuple.operationKey as string,
      maxUnits: tuple.maxUnits as number,
      maxCostMinor: tuple.maxCostMinor as number,
      currency: tuple.currency as string,
      expiresAt: tuple.expiresAt as number,
      ownerSubject: tuple.ownerSubject as string,
      nonce: tuple.nonce as string,
      configurationId: tuple.configurationId as string,
      configurationDigest: tuple.configurationDigest as string,
      configurationRevision: tuple.configurationRevision as number,
      sourceRevision: tuple.sourceRevision as number,
      prospectRevisions,
      digest: tuple.digest as string,
    };
    if (
      !bounded(grant.id, 256)
      || !bounded(grant.workspaceId, 256)
      || !bounded(grant.idempotencyKey, 256)
      || grant.status !== "issued"
      || !digestLike(grant.requestDigest)
      || parsedTuple.workspaceId !== grant.workspaceId
      || !bounded(parsedTuple.providerId, 128)
      || !bounded(parsedTuple.providerVersion, 128)
      || !bounded(parsedTuple.catalogRef, 256)
      || !positive(parsedTuple.quoteRevision)
      || !nonNegativeInteger(parsedTuple.quoteUnitCostMinor)
      || !positive(parsedTuple.quoteExpiresAt)
      || parsedTuple.operation !== "business_contact_lookup/v1"
      || !/^op_[a-f0-9]{64}$/.test(parsedTuple.operationKey)
      || !positive(parsedTuple.maxUnits)
      || parsedTuple.maxUnits > 1_000
      || !nonNegativeInteger(parsedTuple.maxCostMinor)
      || !safeProduct(parsedTuple.quoteUnitCostMinor, parsedTuple.maxUnits)
      || parsedTuple.maxCostMinor < parsedTuple.quoteUnitCostMinor * parsedTuple.maxUnits
      || !canonicalCurrency(parsedTuple.currency)
      || !positive(parsedTuple.expiresAt)
      || parsedTuple.expiresAt > parsedTuple.quoteExpiresAt
      || !bounded(parsedTuple.ownerSubject, 256)
      || !bounded(parsedTuple.nonce, 256)
      || !bounded(parsedTuple.configurationId, 256)
      || !digestLike(parsedTuple.configurationDigest)
      || !positive(parsedTuple.configurationRevision)
      || !positive(parsedTuple.sourceRevision)
      || !digestLike(parsedTuple.digest)
    ) return null;
    const actualRequestMaterial = {
      workspaceId: parsedTuple.workspaceId,
      providerId: parsedTuple.providerId,
      providerVersion: parsedTuple.providerVersion,
      catalogRef: parsedTuple.catalogRef,
      quoteRevision: parsedTuple.quoteRevision,
      quoteUnitCostMinor: parsedTuple.quoteUnitCostMinor,
      quoteExpiresAt: parsedTuple.quoteExpiresAt,
      prospectIds: [...parsedTuple.prospectIds],
      operation: parsedTuple.operation,
      operationKey: parsedTuple.operationKey,
      maxUnits: parsedTuple.maxUnits,
      maxCostMinor: parsedTuple.maxCostMinor,
      currency: parsedTuple.currency,
      expiresAt: parsedTuple.expiresAt,
      ownerSubject: parsedTuple.ownerSubject,
      configurationId: parsedTuple.configurationId,
      configurationDigest: parsedTuple.configurationDigest,
      configurationRevision: parsedTuple.configurationRevision,
      sourceRevision: parsedTuple.sourceRevision,
      prospectRevisions: parsedTuple.prospectRevisions.map((item) => ({ id: item.id, revision: item.revision })),
    };
    if (
      await canonicalDigest(grantRequestMaterial(grant.idempotencyKey, actualRequestMaterial)) !== grant.requestDigest
    ) return null;
    const expectedOperationKey = `op_${await canonicalDigest({
      ...actualRequestMaterial,
      operationKey: "operation-key-derived",
    })}`;
    if (parsedTuple.operationKey !== expectedOperationKey) return null;
    const unsignedTuple = { ...actualRequestMaterial, nonce: parsedTuple.nonce };
    if (
      await canonicalDigest(unsignedTuple) !== parsedTuple.digest
      || grant.id !== `eg_${parsedTuple.digest.slice(0, 24)}`
    ) return null;
    const parsedGrant = freezeGrant({
      id: grant.id,
      workspaceId: grant.workspaceId,
      idempotencyKey: grant.idempotencyKey,
      requestDigest: grant.requestDigest,
      tuple: parsedTuple,
      status: "issued",
    });
    if (expected && (
      parsedGrant.workspaceId !== expected.workspaceId
      || parsedGrant.tuple.ownerSubject !== expected.ownerSubject
      || parsedGrant.idempotencyKey !== expected.idempotencyKey
    )) return null;
    if (expected?.exactGrant && canonical(parsedGrant) !== canonical(expected.exactGrant)) return null;
    const requestMatches = expected?.requestDigest === undefined || expected.requestMaterial === undefined
      ? true
      : parsedGrant.requestDigest === expected.requestDigest
        && canonical(actualRequestMaterial) === canonical(expected.requestMaterial);
    return {
      grant: parsedGrant,
      requestMatches,
    };
  } catch {
    return null;
  }
}

function snapshotIssuanceAuthority(value: unknown): IssuanceSnapshot | null {
  if (value === null) return null;
  const snapshot = snapshotRepositoryValue(value);
  const root = exactDataRecord(snapshot, [
    "admitted", "workspaceId", "ownerSubject", "revision", "configuration", "prospects", "quote",
  ]);
  const configuration = root && exactDataRecord(root.configuration, ["id", "digest", "revision", "current"]);
  const quote = root && exactDataRecord(root.quote, [
    "providerId", "providerVersion", "catalogRef", "revision", "currency", "unitCostMinor", "expiresAt",
  ]);
  const prospectValues = root && exactDataArray(root.prospects, 0, 100);
  if (!root || !configuration || !quote || !prospectValues) return null;
  const prospects: IssuanceSnapshot["prospects"] = [];
  for (const value of prospectValues) {
    const prospect = exactDataRecord(value, [
      "id", "state", "configurationId", "configurationDigest", "revision",
    ]);
    if (!prospect) return null;
    prospects.push(Object.freeze({
      id: prospect.id as string,
      state: prospect.state as string,
      configurationId: prospect.configurationId as string,
      configurationDigest: prospect.configurationDigest as string,
      revision: prospect.revision as number,
    }));
  }
  return Object.freeze({
    admitted: root.admitted as boolean,
    workspaceId: root.workspaceId as string,
    ownerSubject: root.ownerSubject as string,
    revision: root.revision as number,
    configuration: Object.freeze({
      id: configuration.id as string,
      digest: configuration.digest as string,
      revision: configuration.revision as number,
      current: configuration.current as boolean,
    }),
    prospects: Object.freeze(prospects) as unknown as IssuanceSnapshot["prospects"],
    quote: Object.freeze({
      providerId: quote.providerId as string,
      providerVersion: quote.providerVersion as string,
      catalogRef: quote.catalogRef as string,
      revision: quote.revision as number,
      currency: quote.currency as string,
      unitCostMinor: quote.unitCostMinor as number,
      expiresAt: quote.expiresAt as number,
    }),
  });
}

const invalidSnapshot = Symbol("invalid_repository_snapshot");

function snapshotRepositoryValue<T = unknown>(value: unknown): T | null {
  if (value === null) return null;
  const snapshot = snapshotPlainNode(value, new Set<object>());
  if (snapshot === invalidSnapshot) return null;
  try {
    // The descriptor walk above rejects accessors without invoking them. A
    // structured clone is then used only as an exotic-object/Proxy check; the
    // returned authority remains the descriptor-derived immutable snapshot.
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
      || [...keys].some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))
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

function nonNegativeInteger(value: unknown): value is number {
  return integer(value) && value >= 0;
}
