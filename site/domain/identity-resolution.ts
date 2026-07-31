/**
 * Synthetic, provider-neutral preparation seam for Phase 5 identity review.
 *
 * There is deliberately no D1 composition or route in this module. A later,
 * separately authorised persistence layer must inject the transaction below.
 */

export class IdentityResolutionError extends Error {
  readonly code = "identity_resolution_rejected";
}

export type IdentityResolutionKind = "merge" | "split";
export type InvalidatedProjection = "NeedsReview" | "NonContactable";

export type IdentityAssociation = Readonly<{
  id: string;
  workspaceId: string;
  scope: "market_play" | "customer_profile";
  relevanceId: string;
  subjectId: string;
}>;

export type IdentitySnapshot = Readonly<{
  id: string;
  workspaceId: string;
  revision: number;
  aliases: readonly string[];
  sourceLineageIds: readonly string[];
  identityLineageIds: readonly string[];
  associations: readonly IdentityAssociation[];
  suppressionSubjectRefs: readonly string[];
}>;

export type IdentitySuggestion = Readonly<{
  id: string;
  workspaceId: string;
  kind: IdentityResolutionKind;
  candidateIds: readonly string[];
  candidateRevisions: Readonly<Record<string, number>>;
  revision: number;
  sourceLineageIds: readonly string[];
  associationImpact: readonly Readonly<{ id: string; scope: IdentityAssociation["scope"]; relevanceId: string }> [];
  suppressionPreservationNotice: "preserve_all_existing_subject_references";
}>;

export type MergeDecision = Readonly<{
  kind: "merge";
  primaryId: string;
  secondaryIds: readonly string[];
}>;

export type SplitDecision = Readonly<{
  kind: "split";
  sourceId: string;
  newIdentityId: string;
  moveAssociationIds: readonly string[];
}>;

export type IdentityDecision = MergeDecision | SplitDecision;

export type AppliedResolution = Readonly<{
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  decision: IdentityDecision;
  operationDigest: string;
  retainedSourceLineageIds: readonly string[];
  retainedIdentityLineageIds: readonly string[];
  retainedAliases: readonly string[];
  retainedSuppressionSubjectRefs: readonly string[];
  rePointedAssociationIds: readonly string[];
  invalidations: readonly Readonly<{ associationId: string; projection: InvalidatedProjection }> [];
}>;

export interface IdentityResolutionTransaction {
  findByIdempotencyKey(idempotencyKey: string): Promise<AppliedResolution | null>;
  readIdentitySnapshots(identityIds: readonly string[]): Promise<readonly IdentitySnapshot[]>;
  /** Implement this as one durable transaction later; it must never mutate suppression. */
  applyResolution(input: AppliedResolution): Promise<AppliedResolution>;
}

export interface IdentityResolutionRepository {
  readIdentitySnapshots(workspaceId: string, identityIds: readonly string[]): Promise<readonly IdentitySnapshot[]>;
  transaction<T>(workspaceId: string, operation: (transaction: IdentityResolutionTransaction) => Promise<T>): Promise<T>;
}

export type IdentityResolutionPrincipal = Readonly<{ subject: string; admittedOwner: boolean }>;

export async function planIdentitySuggestion(
  repository: IdentityResolutionRepository,
  input: Readonly<{ workspaceId: string; kind: IdentityResolutionKind; candidateIds: readonly string[] }>,
): Promise<IdentitySuggestion> {
  const candidateIds = uniqueIds(input.candidateIds, 2, 16);
  const snapshots = await repository.readIdentitySnapshots(input.workspaceId, candidateIds);
  assertExactWorkspaceSnapshots(input.workspaceId, candidateIds, snapshots);
  const candidates = [...snapshots].sort((left, right) => left.id.localeCompare(right.id));
  const candidateRevisions = Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.revision]));
  const sources = unique(candidates.flatMap((candidate) => candidate.sourceLineageIds)).sort();
  const associationImpact = candidates.flatMap((candidate) => candidate.associations)
    .map((association) => ({ id: association.id, scope: association.scope, relevanceId: association.relevanceId }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const revision = candidates.reduce((total, candidate) => total + candidate.revision, 0);
  return Object.freeze({
    id: await hash({ workspaceId: input.workspaceId, kind: input.kind, candidateIds, candidateRevisions }),
    workspaceId: input.workspaceId,
    kind: input.kind,
    candidateIds,
    candidateRevisions: Object.freeze(candidateRevisions),
    revision,
    sourceLineageIds: Object.freeze(sources),
    associationImpact: Object.freeze(associationImpact),
    suppressionPreservationNotice: "preserve_all_existing_subject_references",
  });
}

export async function applyIdentityResolution(
  repository: IdentityResolutionRepository,
  principal: IdentityResolutionPrincipal,
  input: Readonly<{
    workspaceId: string;
    suggestion: IdentitySuggestion;
    decision: IdentityDecision;
    expectedRevision: number;
    idempotencyKey: string;
  }>,
): Promise<AppliedResolution> {
  if (!principal.admittedOwner || !validId(principal.subject) || !validId(input.workspaceId)) throw rejected();
  if (input.suggestion.workspaceId !== input.workspaceId || input.expectedRevision !== input.suggestion.revision) throw rejected();
  validateKey(input.idempotencyKey);
  validateDecision(input.suggestion, input.decision);
  const operationDigest = await hash({ workspaceId: input.workspaceId, suggestionId: input.suggestion.id, suggestionRevision: input.suggestion.revision, decision: canonicalDecision(input.decision), actor: principal.subject });
  return repository.transaction(input.workspaceId, async (transaction) => {
    const existing = await transaction.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (existing.operationDigest !== operationDigest) throw rejected();
      return existing;
    }
    const current = await transaction.readIdentitySnapshots(input.suggestion.candidateIds);
    assertExactWorkspaceSnapshots(input.workspaceId, input.suggestion.candidateIds, current);
    const revision = current.reduce((total, identity) => total + identity.revision, 0);
    if (revision !== input.expectedRevision || !sameRevisions(input.suggestion.candidateRevisions, current)) throw rejected();
    const retainedSourceLineageIds = unique(current.flatMap((identity) => identity.sourceLineageIds)).sort();
    const retainedIdentityLineageIds = unique(current.flatMap((identity) => [identity.id, ...identity.identityLineageIds])).sort();
    const retainedAliases = unique(current.flatMap((identity) => identity.aliases)).sort();
    const retainedSuppressionSubjectRefs = unique(current.flatMap((identity) => identity.suppressionSubjectRefs)).sort();
    const moved = associationsForDecision(current, input.decision);
    const applied: AppliedResolution = Object.freeze({
      id: await hash({ operationDigest, idempotencyKey: input.idempotencyKey }),
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      decision: freezeDecision(input.decision),
      operationDigest,
      retainedSourceLineageIds: Object.freeze(retainedSourceLineageIds),
      retainedIdentityLineageIds: Object.freeze(retainedIdentityLineageIds),
      retainedAliases: Object.freeze(retainedAliases),
      retainedSuppressionSubjectRefs: Object.freeze(retainedSuppressionSubjectRefs),
      rePointedAssociationIds: Object.freeze(moved.map((association) => association.id).sort()),
      invalidations: Object.freeze(moved.map((association) => Object.freeze({
        associationId: association.id,
        projection: input.decision.kind === "merge" ? "NeedsReview" as const : "NonContactable" as const,
      }))),
    });
    return transaction.applyResolution(applied);
  });
}

/** A production composition must explicitly replace this reject-only port. */
export const unavailableIdentityResolutionRepository: IdentityResolutionRepository = Object.freeze({
  async readIdentitySnapshots() { throw rejected(); },
  async transaction() { throw rejected(); },
});

function associationsForDecision(snapshots: readonly IdentitySnapshot[], decision: IdentityDecision) {
  if (decision.kind === "merge") return snapshots.flatMap((identity) => identity.associations);
  const source = snapshots.find((identity) => identity.id === decision.sourceId);
  if (!source) throw rejected();
  const requested = new Set(decision.moveAssociationIds);
  return source.associations.filter((association) => requested.has(association.id));
}

function validateDecision(suggestion: IdentitySuggestion, decision: IdentityDecision) {
  const candidates = new Set(suggestion.candidateIds);
  if (decision.kind !== suggestion.kind) throw rejected();
  if (decision.kind === "merge") {
    const secondaries = uniqueIds(decision.secondaryIds, 1, 15);
    if (!candidates.has(decision.primaryId) || secondaries.includes(decision.primaryId) || secondaries.some((id) => !candidates.has(id))) throw rejected();
    if (secondaries.length !== suggestion.candidateIds.length - 1) throw rejected();
    return;
  }
  if (!candidates.has(decision.sourceId) || !validId(decision.newIdentityId) || candidates.has(decision.newIdentityId)) throw rejected();
  uniqueIds(decision.moveAssociationIds, 1, 128);
}

function assertExactWorkspaceSnapshots(workspaceId: string, ids: readonly string[], snapshots: readonly IdentitySnapshot[]) {
  if (snapshots.length !== ids.length || snapshots.some((snapshot) => snapshot.workspaceId !== workspaceId || !ids.includes(snapshot.id) || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1)) throw rejected();
  if (new Set(snapshots.map((snapshot) => snapshot.id)).size !== ids.length) throw rejected();
}

function sameRevisions(expected: Readonly<Record<string, number>>, current: readonly IdentitySnapshot[]) {
  return current.every((identity) => expected[identity.id] === identity.revision) && Object.keys(expected).length === current.length;
}

function canonicalDecision(decision: IdentityDecision): IdentityDecision {
  return decision.kind === "merge"
    ? { kind: "merge", primaryId: decision.primaryId, secondaryIds: [...decision.secondaryIds].sort() }
    : { kind: "split", sourceId: decision.sourceId, newIdentityId: decision.newIdentityId, moveAssociationIds: [...decision.moveAssociationIds].sort() };
}

function freezeDecision(decision: IdentityDecision): IdentityDecision {
  const canonical = canonicalDecision(decision);
  return canonical.kind === "merge"
    ? Object.freeze({ ...canonical, secondaryIds: Object.freeze(canonical.secondaryIds) })
    : Object.freeze({ ...canonical, moveAssociationIds: Object.freeze(canonical.moveAssociationIds) });
}

function uniqueIds(values: readonly string[], min: number, max: number) {
  if (!Array.isArray(values) || values.length < min || values.length > max || values.some((value) => !validId(value))) throw rejected();
  const result = unique(values).sort();
  if (result.length !== values.length) throw rejected();
  return result;
}

function unique(values: readonly string[]) { return [...new Set(values.filter(validId))]; }
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{2,127}$/i.test(value); }
function validateKey(value: string) { if (!/^[a-z0-9][a-z0-9_-]{7,127}$/i.test(value)) throw rejected(); }
function rejected() { return new IdentityResolutionError("identity_resolution_rejected"); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function hash(value: unknown) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(value))); return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join(""); }
