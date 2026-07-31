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
  prospectIds: string[]; operation: EnrichmentOperation; operationKey: string;
  maxUnits: number; maxCostMinor: number; currency: string; expiresAt: number;
  ownerSubject: string; nonce: string; configurationId: string; configurationDigest: string;
  configurationRevision: number; sourceRevision: number; prospectRevisions: Array<{ id: string; revision: number }>; digest: string;
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
  | "configuration_not_current" | "quote_unavailable" | "quote_expired" | "currency_mismatch" | "cost_unbounded";

export async function issueEnrichmentGrant(repository: IssuanceRepository, input: IssueEnrichmentGrantInput): Promise<IssueEnrichmentGrantResult> {
  const prospectIds = normalizeIds(input.prospectIds);
  if (!prospectIds || !validRequest(input, prospectIds)) return { kind: "blocked", reason: "invalid_request" };
  const snapshot = await repository.loadIssuanceSnapshot(input.principalSubject, prospectIds);
  const reason = validateSnapshot(snapshot, input, prospectIds);
  if (reason) return { kind: "blocked", reason };
  const current = snapshot!;
  const operationKey = await deriveOperationKey({ snapshot: current, input, prospectIds });
  const requestMaterial = tupleMaterial(current, input, prospectIds, operationKey);
  const requestDigest = await canonicalDigest(requestMaterial);
  const existing = await repository.findGrantByIdempotency(current.workspaceId, input.idempotencyKey);
  if (existing) return existing.requestDigest === requestDigest
    ? issued(existing, true)
    : { kind: "conflict", reason: "idempotency_conflict" };
  const nonce = serverNonce(repository);
  const unsigned = { ...requestMaterial, nonce };
  const tuple: EnrichmentGrantTuple = { ...unsigned, digest: await canonicalDigest(unsigned) };
  const grant: EnrichmentGrant = {
    id: `eg_${tuple.digest.slice(0, 24)}`, workspaceId: current.workspaceId, idempotencyKey: input.idempotencyKey,
    requestDigest, tuple, status: "issued",
  };
  const committed = await repository.commitGrant(grant);
  if (committed.kind === "existing") return committed.record.requestDigest === requestDigest
    ? issued(committed.record, true)
    : { kind: "conflict", reason: "idempotency_conflict" };
  return issued(committed.record, false);
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
function validateSnapshot(snapshot: IssuanceSnapshot | null, input: IssueEnrichmentGrantInput, ids: readonly string[]): EnrichmentBlockedReason | null {
  if (!snapshot || !snapshot.admitted || snapshot.ownerSubject !== input.principalSubject) return "owner_not_admitted";
  if (snapshot.revision !== input.expectedRevision) return "stale_revision";
  if (!snapshot.configuration.current || !digestLike(snapshot.configuration.digest)) return "configuration_not_current";
  if (!snapshot.quote || !bounded(snapshot.quote.providerId, 128) || !bounded(snapshot.quote.providerVersion, 128) || !bounded(snapshot.quote.catalogRef, 256) || !integer(snapshot.quote.revision) || !integer(snapshot.quote.unitCostMinor) || snapshot.quote.unitCostMinor < 0) return "quote_unavailable";
  if (snapshot.quote.expiresAt <= input.now) return "quote_expired";
  if (snapshot.quote.currency !== input.currency) return "currency_mismatch";
  if (input.maxCostMinor < snapshot.quote.unitCostMinor * input.maxUnits) return "cost_unbounded";
  if (snapshot.prospects.length !== ids.length || snapshot.prospects.some((prospect) => !ids.includes(prospect.id) || prospect.state !== "approved" || prospect.configurationId !== snapshot.configuration.id || prospect.configurationDigest !== snapshot.configuration.digest || !integer(prospect.revision))) return "prospect_not_approved";
  return null;
}
function validRequest(input: IssueEnrichmentGrantInput, ids: readonly string[]): boolean {
  return ids.length > 0 && bounded(input.principalSubject, 256) && input.operation === "business_contact_lookup/v1" && integer(input.maxUnits) && input.maxUnits > 0 && input.maxUnits <= 1_000 && integer(input.maxCostMinor) && input.maxCostMinor >= 0 && bounded(input.currency, 8) && integer(input.expiresAt) && integer(input.now) && input.expiresAt > input.now && input.expiresAt <= input.now + 60 * 60 * 1_000 && integer(input.expectedRevision) && input.expectedRevision > 0 && bounded(input.idempotencyKey, 256);
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
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function digestLike(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
async function digest(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
