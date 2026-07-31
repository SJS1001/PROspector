/**
 * Synthetic, provider-neutral preparation seam for Phase 5 identity review.
 *
 * There is deliberately no D1 composition or route in this module. A later,
 * separately authorised persistence layer must inject the transaction below.
 */

import { v7 } from "uuid";

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
  digest: string;
  ownerSubject: string;
  workspaceId: string;
  kind: IdentityResolutionKind;
  candidateIds: readonly string[];
  candidateRevisions: Readonly<Record<string, number>>;
  revision: number;
  sourceLineageIds: readonly string[];
  retainedIdentityLineageIds: readonly string[];
  retainedAliases: readonly string[];
  retainedSuppressionSubjectRefs: readonly string[];
  associationImpact: readonly Readonly<{ id: string; scope: IdentityAssociation["scope"]; relevanceId: string }> [];
  suppressionPreservationNotice: "preserve_all_existing_subject_references";
  proposedPartition: Readonly<{
    sourceId: string;
    newIdentityId: string;
    moveAssociationIds: readonly string[];
  }> | null;
}>;

export type MergeDecision = Readonly<{
  kind: "merge";
  primaryId: string;
  secondaryIds: readonly string[];
}>;

export type SplitDecision = Readonly<{
  kind: "split";
  sourceId: string;
  moveAssociationIds: readonly string[];
}>;

export type IdentityDecision = MergeDecision | SplitDecision;
export type AppliedIdentityDecision = MergeDecision | Readonly<SplitDecision & { newIdentityId: string }>;

export type AppliedResolution = Readonly<{
  id: string;
  workspaceId: string;
  ownerSubject: string;
  suggestionId: string;
  suggestionDigest: string;
  idempotencyKey: string;
  decision: AppliedIdentityDecision;
  operationDigest: string;
  resultDigest: string;
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
  /** Persist exactly the server-created immutable record; an equal digest/ID is replay-safe. */
  saveIdentitySuggestion(suggestion: IdentitySuggestion): Promise<IdentitySuggestion>;
  readIdentitySuggestion(workspaceId: string, ownerSubject: string, suggestionId: string): Promise<IdentitySuggestion | null>;
  transaction<T>(workspaceId: string, operation: (transaction: IdentityResolutionTransaction) => Promise<T>): Promise<T>;
}

export type IdentityResolutionPrincipal = Readonly<{ subject: string; admittedOwner: boolean }>;
export type PlanIdentitySuggestionInput =
  | Readonly<{ workspaceId: string; kind: "merge"; candidateIds: readonly string[] }>
  | Readonly<{ workspaceId: string; kind: "split"; sourceId: string; moveAssociationIds: readonly string[] }>;

export async function planIdentitySuggestion(
  repository: IdentityResolutionRepository,
  principal: IdentityResolutionPrincipal,
  input: PlanIdentitySuggestionInput,
): Promise<IdentitySuggestion> {
  if (!principal.admittedOwner || !validId(principal.subject) || !validId(input.workspaceId)) throw rejected();
  if (input.kind === "split" && hasOwn(input, "newIdentityId")) throw rejected();
  const candidateIds = input.kind === "merge"
    ? uniqueIds(input.candidateIds, 2, 16)
    : uniqueIds([input.sourceId], 1, 1);
  const snapshots = await repository.readIdentitySnapshots(input.workspaceId, candidateIds);
  assertExactWorkspaceSnapshots(input.workspaceId, candidateIds, snapshots);
  const candidates = [...snapshots].sort((left, right) => left.id.localeCompare(right.id));
  const candidateRevisions = Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.revision]));
  const sources = unique(candidates.flatMap((candidate) => candidate.sourceLineageIds)).sort();
  const retainedIdentityLineageIds = unique(candidates.flatMap((candidate) => [candidate.id, ...candidate.identityLineageIds])).sort();
  const retainedAliases = unique(candidates.flatMap((candidate) => candidate.aliases)).sort();
  const retainedSuppressionSubjectRefs = unique(candidates.flatMap((candidate) => candidate.suppressionSubjectRefs)).sort();
  const proposedPartition = input.kind === "split"
    ? freezePartition({
      sourceId: input.sourceId,
      newIdentityId: v7(),
      moveAssociationIds: uniqueIds(input.moveAssociationIds, 1, 128),
    })
    : null;
  if (proposedPartition && (!validServerIdentityId(proposedPartition.newIdentityId) || candidateIds.includes(proposedPartition.newIdentityId))) throw rejected();
  const impactedAssociations = proposedPartition
    ? associationsForPartition(candidates[0], proposedPartition.moveAssociationIds)
    : candidates.flatMap((candidate) => candidate.associations);
  const associationImpact = impactedAssociations
    .map((association) => ({ id: association.id, scope: association.scope, relevanceId: association.relevanceId }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const revision = totalRevision(candidates);
  const evidence = {
    workspaceId: input.workspaceId,
    kind: input.kind,
    candidateIds,
    candidateRevisions: Object.freeze(candidateRevisions),
    revision,
    sourceLineageIds: Object.freeze(sources),
    retainedIdentityLineageIds: Object.freeze(retainedIdentityLineageIds),
    retainedAliases: Object.freeze(retainedAliases),
    retainedSuppressionSubjectRefs: Object.freeze(retainedSuppressionSubjectRefs),
    associationImpact: Object.freeze(associationImpact),
    suppressionPreservationNotice: "preserve_all_existing_subject_references",
    proposedPartition,
  } as const;
  const digest = await hash({ schema: "identity-suggestion/v1", ...evidence });
  const suggestion = freezeIdentitySuggestion({
    id: await hash({ schema: "identity-suggestion-id/v1", workspaceId: input.workspaceId, ownerSubject: principal.subject, digest }),
    digest,
    ownerSubject: principal.subject,
    ...evidence,
  });
  await assertSuggestionIntegrity(suggestion);
  const persisted = await parseIdentitySuggestion(
    await repository.saveIdentitySuggestion(suggestion),
    suggestion,
  );
  if (!persisted) throw rejected();
  return persisted;
}

export async function applyIdentityResolution(
  repository: IdentityResolutionRepository,
  principal: IdentityResolutionPrincipal,
  input: Readonly<{
    workspaceId: string;
    suggestionId: string;
    decision: IdentityDecision;
    expectedRevision: number;
    idempotencyKey: string;
  }>,
): Promise<AppliedResolution> {
  if (!principal.admittedOwner || !validId(principal.subject) || !validId(input.workspaceId)) throw rejected();
  if (!validId(input.suggestionId)) throw rejected();
  const decision = snapshotIdentityDecision(input.decision);
  const suggestion = await parseIdentitySuggestion(
    await repository.readIdentitySuggestion(input.workspaceId, principal.subject, input.suggestionId),
  );
  if (!suggestion) throw rejected();
  if (suggestion.id !== input.suggestionId || suggestion.workspaceId !== input.workspaceId || suggestion.ownerSubject !== principal.subject || input.expectedRevision !== suggestion.revision) throw rejected();
  validateKey(input.idempotencyKey);
  validateDecision(suggestion, decision);
  const authoritativeDecision = canonicalDecision(suggestion, decision);
  const operationDigest = await hash({ workspaceId: input.workspaceId, suggestionId: suggestion.id, suggestionDigest: suggestion.digest, suggestionRevision: suggestion.revision, decision: authoritativeDecision, actor: principal.subject });
  const context: AppliedResolutionContext = {
    workspaceId: input.workspaceId,
    ownerSubject: principal.subject,
    idempotencyKey: input.idempotencyKey,
    suggestion,
    decision: authoritativeDecision,
    operationDigest,
  };
  const result = await repository.transaction(input.workspaceId, async (transaction) => {
    const existingResult = await transaction.findByIdempotencyKey(input.idempotencyKey);
    if (existingResult) {
      const existing = await validateAppliedResolution(existingResult, context);
      if (!existing) throw rejected();
      return existing;
    }
    if (existingResult !== null) throw rejected();
    if (authoritativeDecision.kind === "split") {
      const destination = await transaction.readIdentitySnapshots([authoritativeDecision.newIdentityId]);
      if (!exactDataArray(destination, 0, 0)) throw rejected();
    }
    const current = await transaction.readIdentitySnapshots(suggestion.candidateIds);
    assertExactWorkspaceSnapshots(input.workspaceId, suggestion.candidateIds, current);
    assertSuggestionMatchesSnapshots(suggestion, current);
    if (totalRevision(current) !== input.expectedRevision || !sameRevisions(suggestion.candidateRevisions, current)) throw rejected();
    const retainedSourceLineageIds = unique(current.flatMap((identity) => identity.sourceLineageIds)).sort();
    const retainedIdentityLineageIds = unique(current.flatMap((identity) => [identity.id, ...identity.identityLineageIds])).sort();
    const retainedAliases = unique(current.flatMap((identity) => identity.aliases)).sort();
    const retainedSuppressionSubjectRefs = unique(current.flatMap((identity) => identity.suppressionSubjectRefs)).sort();
    const moved = associationsForDecision(current, authoritativeDecision);
    const rePointedAssociationIds = moved.map((association) => association.id).sort();
    const appliedMaterial = {
      workspaceId: input.workspaceId,
      ownerSubject: principal.subject,
      suggestionId: suggestion.id,
      suggestionDigest: suggestion.digest,
      idempotencyKey: input.idempotencyKey,
      decision: freezeDecision(authoritativeDecision),
      operationDigest,
      retainedSourceLineageIds: Object.freeze(retainedSourceLineageIds),
      retainedIdentityLineageIds: Object.freeze(retainedIdentityLineageIds),
      retainedAliases: Object.freeze(retainedAliases),
      retainedSuppressionSubjectRefs: Object.freeze(retainedSuppressionSubjectRefs),
      rePointedAssociationIds: Object.freeze(rePointedAssociationIds),
      invalidations: Object.freeze(rePointedAssociationIds.map((associationId) => Object.freeze({
        associationId,
        projection: authoritativeDecision.kind === "merge" ? "NeedsReview" as const : "NonContactable" as const,
      }))),
    };
    const resultDigest = await hash({ schema: "identity-resolution-result/v1", ...appliedMaterial });
    const applied: AppliedResolution = Object.freeze({
      id: await hash({ operationDigest, idempotencyKey: input.idempotencyKey, resultDigest }),
      ...appliedMaterial,
      resultDigest,
    });
    const committed = await transaction.applyResolution(applied);
    const validated = await validateAppliedResolution(committed, { ...context, exactRecord: applied });
    if (!validated) throw rejected();
    return validated;
  });
  const validated = await validateAppliedResolution(result, context);
  if (!validated) throw rejected();
  return validated;
}

/** A production composition must explicitly replace this reject-only port. */
export const unavailableIdentityResolutionRepository: IdentityResolutionRepository = Object.freeze({
  async readIdentitySnapshots() { throw rejected(); },
  async saveIdentitySuggestion() { throw rejected(); },
  async readIdentitySuggestion() { throw rejected(); },
  async transaction() { throw rejected(); },
});

function associationsForDecision(snapshots: readonly IdentitySnapshot[], decision: IdentityDecision) {
  if (decision.kind === "merge") return snapshots.flatMap((identity) => identity.associations);
  const source = snapshots.find((identity) => identity.id === decision.sourceId);
  if (!source) throw rejected();
  return associationsForPartition(source, decision.moveAssociationIds);
}

function associationsForPartition(source: IdentitySnapshot, moveAssociationIds: readonly string[]) {
  const requested = new Set(moveAssociationIds);
  const moved = source.associations.filter((association) => requested.has(association.id));
  if (moved.length !== requested.size || new Set(moved.map((association) => association.id)).size !== moved.length) throw rejected();
  return moved;
}

function validateDecision(suggestion: IdentitySuggestion, decision: IdentityDecision) {
  const candidates = new Set(suggestion.candidateIds);
  if (decision.kind !== suggestion.kind) throw rejected();
  if (decision.kind === "merge") {
    if (suggestion.proposedPartition !== null) throw rejected();
    const secondaries = uniqueIds(decision.secondaryIds, 1, 15);
    if (!candidates.has(decision.primaryId) || secondaries.includes(decision.primaryId) || secondaries.some((id) => !candidates.has(id))) throw rejected();
    if (secondaries.length !== suggestion.candidateIds.length - 1) throw rejected();
    return;
  }
  const partition = suggestion.proposedPartition;
  if (!partition || suggestion.candidateIds.length !== 1 || decision.sourceId !== partition.sourceId) throw rejected();
  const moved = uniqueIds(decision.moveAssociationIds, 1, 128);
  if (stable(moved) !== stable(partition.moveAssociationIds)) throw rejected();
}

function assertExactWorkspaceSnapshots(workspaceId: string, ids: readonly string[], snapshots: readonly IdentitySnapshot[]) {
  const rows = exactDataArray(snapshots, ids.length, ids.length);
  if (!rows) throw rejected();
  for (const snapshot of rows) assertSnapshot(workspaceId, snapshot);
  const exactSnapshots = rows as IdentitySnapshot[];
  if (exactSnapshots.some((snapshot) => !ids.includes(snapshot.id))) throw rejected();
  if (new Set(exactSnapshots.map((snapshot) => snapshot.id)).size !== ids.length) throw rejected();
  const associationIds = exactSnapshots.flatMap((snapshot) => snapshot.associations.map((association) => association.id));
  if (new Set(associationIds).size !== associationIds.length) throw rejected();
}

function assertSnapshot(workspaceId: string, snapshot: unknown): asserts snapshot is IdentitySnapshot {
  const record = exactDataRecord(snapshot, [
    "id", "workspaceId", "revision", "aliases", "sourceLineageIds",
    "identityLineageIds", "associations", "suppressionSubjectRefs",
  ]);
  if (
    !record
    || record.workspaceId !== workspaceId
    || !validId(record.id)
    || !Number.isSafeInteger(record.revision)
    || (record.revision as number) < 1
  ) throw rejected();
  assertIdArray(record.aliases, 0, 256);
  assertIdArray(record.sourceLineageIds, 1, 1_024);
  assertIdArray(record.identityLineageIds, 0, 1_024);
  assertIdArray(record.suppressionSubjectRefs, 0, 1_024);
  const associations = exactDataArray(record.associations, 0, 1_024);
  if (!associations) throw rejected();
  const associationIds = associations.map((association) => {
    const associationRecord = exactDataRecord(association, [
      "id", "workspaceId", "scope", "relevanceId", "subjectId",
    ]);
    if (
      !associationRecord
      || !validId(associationRecord.id)
      || associationRecord.workspaceId !== workspaceId
      || !validId(associationRecord.relevanceId)
      || associationRecord.subjectId !== record.id
      || (associationRecord.scope !== "market_play" && associationRecord.scope !== "customer_profile")
    ) throw rejected();
    return associationRecord.id;
  });
  if (new Set(associationIds).size !== associationIds.length) throw rejected();
}

function validateSuggestionShape(suggestion: IdentitySuggestion) {
  if (!suggestion || typeof suggestion !== "object" || !validId(suggestion.id) || !validDigest(suggestion.digest) || !validId(suggestion.ownerSubject) || !validId(suggestion.workspaceId) || (suggestion.kind !== "merge" && suggestion.kind !== "split")) throw rejected();
  const candidates = suggestion.kind === "merge"
    ? uniqueIds(suggestion.candidateIds, 2, 16)
    : uniqueIds(suggestion.candidateIds, 1, 1);
  if (stable(candidates) !== stable(suggestion.candidateIds)) throw rejected();
  const revisions = suggestion.candidateRevisions;
  if (!revisions || typeof revisions !== "object" || Array.isArray(revisions) || Object.keys(revisions).length !== candidates.length || candidates.some((id) => !Number.isSafeInteger(revisions[id]) || revisions[id] < 1)) throw rejected();
  if (!Number.isSafeInteger(suggestion.revision) || suggestion.revision !== Object.values(revisions).reduce((total, revision) => total + revision, 0)) throw rejected();
  assertIdArray(suggestion.sourceLineageIds, 1, 2_048);
  if (stable([...suggestion.sourceLineageIds].sort()) !== stable(suggestion.sourceLineageIds)) throw rejected();
  assertIdArray(suggestion.retainedIdentityLineageIds, candidates.length, 2_048);
  assertIdArray(suggestion.retainedAliases, 0, 2_048);
  assertIdArray(suggestion.retainedSuppressionSubjectRefs, 0, 2_048);
  if (
    candidates.some((id) => !suggestion.retainedIdentityLineageIds.includes(id))
    || stable([...suggestion.retainedIdentityLineageIds].sort()) !== stable(suggestion.retainedIdentityLineageIds)
    || stable([...suggestion.retainedAliases].sort()) !== stable(suggestion.retainedAliases)
    || stable([...suggestion.retainedSuppressionSubjectRefs].sort()) !== stable(suggestion.retainedSuppressionSubjectRefs)
  ) throw rejected();
  if (!Array.isArray(suggestion.associationImpact) || suggestion.associationImpact.length > 2_048) throw rejected();
  const associations = suggestion.associationImpact.map((association) => {
    if (!association || typeof association !== "object" || !validId(association.id) || !validId(association.relevanceId) || (association.scope !== "market_play" && association.scope !== "customer_profile")) throw rejected();
    return association.id;
  });
  if (new Set(associations).size !== associations.length || stable([...associations].sort()) !== stable(associations) || suggestion.suppressionPreservationNotice !== "preserve_all_existing_subject_references") throw rejected();
  if (suggestion.kind === "merge") {
    if (suggestion.proposedPartition !== null) throw rejected();
  } else {
    const partition = suggestion.proposedPartition;
    if (!partition || typeof partition !== "object" || partition.sourceId !== candidates[0] || !validServerIdentityId(partition.newIdentityId) || candidates.includes(partition.newIdentityId)) throw rejected();
    const moved = uniqueIds(partition.moveAssociationIds, 1, 128);
    if (stable(moved) !== stable(partition.moveAssociationIds) || stable(moved) !== stable(associations)) throw rejected();
  }
}

async function assertSuggestionIntegrity(suggestion: IdentitySuggestion) {
  validateSuggestionShape(suggestion);
  const evidence = suggestionEvidence(suggestion);
  const digest = await hash({ schema: "identity-suggestion/v1", ...evidence });
  const id = await hash({ schema: "identity-suggestion-id/v1", workspaceId: suggestion.workspaceId, ownerSubject: suggestion.ownerSubject, digest });
  if (digest !== suggestion.digest || id !== suggestion.id) throw rejected();
}

async function parseIdentitySuggestion(
  value: unknown,
  exactSuggestion?: IdentitySuggestion,
): Promise<IdentitySuggestion | null> {
  try {
    const record = exactDataRecord(value, [
      "id", "digest", "ownerSubject", "workspaceId", "kind", "candidateIds",
      "candidateRevisions", "revision", "sourceLineageIds", "retainedIdentityLineageIds",
      "retainedAliases", "retainedSuppressionSubjectRefs", "associationImpact",
      "suppressionPreservationNotice", "proposedPartition",
    ]);
    if (!record || (record.kind !== "merge" && record.kind !== "split")) return null;

    const candidateIds = validSortedIdDataArray(
      record.candidateIds,
      record.kind === "merge" ? 2 : 1,
      record.kind === "merge" ? 16 : 1,
    );
    if (!candidateIds) return null;
    const revisionRecord = exactDataRecord(record.candidateRevisions, candidateIds);
    if (!revisionRecord) return null;
    const candidateRevisions: Record<string, number> = {};
    for (const id of candidateIds) {
      const revision = revisionRecord[id];
      if (!Number.isSafeInteger(revision) || (revision as number) < 1) return null;
      candidateRevisions[id] = revision as number;
    }

    const sourceLineageIds = validSortedIdDataArray(record.sourceLineageIds, 1, 2_048);
    const retainedIdentityLineageIds = validSortedIdDataArray(record.retainedIdentityLineageIds, candidateIds.length, 2_048);
    const retainedAliases = validSortedIdDataArray(record.retainedAliases, 0, 2_048);
    const retainedSuppressionSubjectRefs = validSortedIdDataArray(record.retainedSuppressionSubjectRefs, 0, 2_048);
    const impactRows = exactDataArray(record.associationImpact, 0, 2_048);
    if (
      !sourceLineageIds
      || !retainedIdentityLineageIds
      || !retainedAliases
      || !retainedSuppressionSubjectRefs
      || !impactRows
    ) return null;
    const associationImpact: Array<{ id: string; scope: IdentityAssociation["scope"]; relevanceId: string }> = [];
    for (const row of impactRows) {
      const impact = exactDataRecord(row, ["id", "scope", "relevanceId"]);
      if (
        !impact
        || !validId(impact.id)
        || !validId(impact.relevanceId)
        || (impact.scope !== "market_play" && impact.scope !== "customer_profile")
      ) return null;
      associationImpact.push({
        id: impact.id,
        scope: impact.scope,
        relevanceId: impact.relevanceId,
      });
    }

    let proposedPartition: IdentitySuggestion["proposedPartition"] = null;
    if (record.kind === "merge") {
      if (record.proposedPartition !== null) return null;
    } else {
      const partition = exactDataRecord(record.proposedPartition, [
        "sourceId", "newIdentityId", "moveAssociationIds",
      ]);
      const moveAssociationIds = partition
        ? validSortedIdDataArray(partition.moveAssociationIds, 1, 128)
        : null;
      if (
        !partition
        || !validId(partition.sourceId)
        || !validServerIdentityId(partition.newIdentityId)
        || !moveAssociationIds
      ) return null;
      proposedPartition = freezePartition({
        sourceId: partition.sourceId,
        newIdentityId: partition.newIdentityId,
        moveAssociationIds,
      });
    }

    const suggestion = freezeIdentitySuggestion({
      id: record.id as string,
      digest: record.digest as string,
      ownerSubject: record.ownerSubject as string,
      workspaceId: record.workspaceId as string,
      kind: record.kind,
      candidateIds,
      candidateRevisions,
      revision: record.revision as number,
      sourceLineageIds,
      retainedIdentityLineageIds,
      retainedAliases,
      retainedSuppressionSubjectRefs,
      associationImpact,
      suppressionPreservationNotice: record.suppressionPreservationNotice as IdentitySuggestion["suppressionPreservationNotice"],
      proposedPartition,
    });
    await assertSuggestionIntegrity(suggestion);
    if (exactSuggestion && !exactPlainData(suggestion, exactSuggestion)) return null;
    return suggestion;
  } catch {
    return null;
  }
}

type AppliedResolutionContext = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  idempotencyKey: string;
  suggestion: IdentitySuggestion;
  decision: AppliedIdentityDecision;
  operationDigest: string;
  exactRecord?: AppliedResolution;
}>;

async function validateAppliedResolution(candidate: unknown, context: AppliedResolutionContext): Promise<AppliedResolution | null> {
  try {
    const record = exactDataRecord(candidate, [
      "id", "workspaceId", "ownerSubject", "suggestionId", "suggestionDigest", "idempotencyKey",
      "decision", "operationDigest", "resultDigest", "retainedSourceLineageIds", "retainedIdentityLineageIds",
      "retainedAliases", "retainedSuppressionSubjectRefs", "rePointedAssociationIds", "invalidations",
    ]);
    if (!record || !exactPlainData(record.decision, context.decision)) return null;
    const retainedSourceLineageIds = validSortedIdDataArray(record.retainedSourceLineageIds, 1, 2_048);
    const retainedIdentityLineageIds = validSortedIdDataArray(record.retainedIdentityLineageIds, 1, 2_048);
    const retainedAliases = validSortedIdDataArray(record.retainedAliases, 0, 2_048);
    const retainedSuppressionSubjectRefs = validSortedIdDataArray(record.retainedSuppressionSubjectRefs, 0, 2_048);
    const rePointedAssociationIds = validSortedIdDataArray(record.rePointedAssociationIds, 1, 2_048);
    const invalidationRows = exactDataArray(record.invalidations, 1, 2_048);
    if (
      !retainedSourceLineageIds
      || !retainedIdentityLineageIds
      || !retainedAliases
      || !retainedSuppressionSubjectRefs
      || !rePointedAssociationIds
      || !invalidationRows
    ) return null;
    const invalidations: Array<{ associationId: string; projection: InvalidatedProjection }> = [];
    for (const row of invalidationRows) {
      const invalidation = exactDataRecord(row, ["associationId", "projection"]);
      if (
        !invalidation
        || !validId(invalidation.associationId)
        || (invalidation.projection !== "NeedsReview" && invalidation.projection !== "NonContactable")
      ) return null;
      invalidations.push({
        associationId: invalidation.associationId,
        projection: invalidation.projection,
      });
    }
    const expectedAssociationIds = context.suggestion.associationImpact.map((item) => item.id).sort();
    const expectedProjection: InvalidatedProjection = context.decision.kind === "merge" ? "NeedsReview" : "NonContactable";
    const parsedMaterial = {
      workspaceId: record.workspaceId as string,
      ownerSubject: record.ownerSubject as string,
      suggestionId: record.suggestionId as string,
      suggestionDigest: record.suggestionDigest as string,
      idempotencyKey: record.idempotencyKey as string,
      decision: context.decision,
      operationDigest: record.operationDigest as string,
      retainedSourceLineageIds,
      retainedIdentityLineageIds,
      retainedAliases,
      retainedSuppressionSubjectRefs,
      rePointedAssociationIds,
      invalidations,
    };
    if (
      record.workspaceId !== context.workspaceId
      || record.ownerSubject !== context.ownerSubject
      || record.suggestionId !== context.suggestion.id
      || record.suggestionDigest !== context.suggestion.digest
      || record.idempotencyKey !== context.idempotencyKey
      || record.operationDigest !== context.operationDigest
      || !validDigest(record.operationDigest)
      || !validDigest(record.resultDigest)
      || record.resultDigest !== await hash({ schema: "identity-resolution-result/v1", ...parsedMaterial })
      || record.id !== await hash({
        operationDigest: context.operationDigest,
        idempotencyKey: context.idempotencyKey,
        resultDigest: record.resultDigest,
      })
      || stable(retainedSourceLineageIds) !== stable(context.suggestion.sourceLineageIds)
      || stable(retainedIdentityLineageIds) !== stable(context.suggestion.retainedIdentityLineageIds)
      || stable(retainedAliases) !== stable(context.suggestion.retainedAliases)
      || stable(retainedSuppressionSubjectRefs) !== stable(context.suggestion.retainedSuppressionSubjectRefs)
      || stable(rePointedAssociationIds) !== stable(expectedAssociationIds)
      || invalidations.length !== rePointedAssociationIds.length
      || invalidations.some((item, index) => item.associationId !== rePointedAssociationIds[index] || item.projection !== expectedProjection)
    ) return null;
    const parsed = freezeAppliedResolution({
      id: record.id as string,
      workspaceId: record.workspaceId as string,
      ownerSubject: record.ownerSubject as string,
      suggestionId: record.suggestionId as string,
      suggestionDigest: record.suggestionDigest as string,
      idempotencyKey: record.idempotencyKey as string,
      decision: context.decision,
      operationDigest: record.operationDigest as string,
      resultDigest: record.resultDigest as string,
      retainedSourceLineageIds,
      retainedIdentityLineageIds,
      retainedAliases,
      retainedSuppressionSubjectRefs,
      rePointedAssociationIds,
      invalidations,
    });
    if (context.exactRecord && !exactPlainData(parsed, context.exactRecord)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function suggestionEvidence(suggestion: IdentitySuggestion) {
  return {
    workspaceId: suggestion.workspaceId,
    kind: suggestion.kind,
    candidateIds: [...suggestion.candidateIds],
    candidateRevisions: { ...suggestion.candidateRevisions },
    revision: suggestion.revision,
    sourceLineageIds: [...suggestion.sourceLineageIds],
    retainedIdentityLineageIds: [...suggestion.retainedIdentityLineageIds],
    retainedAliases: [...suggestion.retainedAliases],
    retainedSuppressionSubjectRefs: [...suggestion.retainedSuppressionSubjectRefs],
    associationImpact: suggestion.associationImpact.map((association) => ({ ...association })),
    suppressionPreservationNotice: suggestion.suppressionPreservationNotice,
    proposedPartition: suggestion.proposedPartition ? {
      sourceId: suggestion.proposedPartition.sourceId,
      newIdentityId: suggestion.proposedPartition.newIdentityId,
      moveAssociationIds: [...suggestion.proposedPartition.moveAssociationIds],
    } : null,
  };
}

function assertSuggestionMatchesSnapshots(suggestion: IdentitySuggestion, snapshots: readonly IdentitySnapshot[]) {
  if (!sameRevisions(suggestion.candidateRevisions, snapshots) || totalRevision(snapshots) !== suggestion.revision) throw rejected();
  const sources = unique(snapshots.flatMap((snapshot) => snapshot.sourceLineageIds)).sort();
  const identityLineage = unique(snapshots.flatMap((snapshot) => [snapshot.id, ...snapshot.identityLineageIds])).sort();
  const aliases = unique(snapshots.flatMap((snapshot) => snapshot.aliases)).sort();
  const suppressionSubjectRefs = unique(snapshots.flatMap((snapshot) => snapshot.suppressionSubjectRefs)).sort();
  if (
    stable(sources) !== stable(suggestion.sourceLineageIds)
    || stable(identityLineage) !== stable(suggestion.retainedIdentityLineageIds)
    || stable(aliases) !== stable(suggestion.retainedAliases)
    || stable(suppressionSubjectRefs) !== stable(suggestion.retainedSuppressionSubjectRefs)
  ) throw rejected();
  const associations = suggestion.proposedPartition
    ? associationsForPartition(snapshots[0], suggestion.proposedPartition.moveAssociationIds)
    : snapshots.flatMap((snapshot) => snapshot.associations);
  const impact = associations
    .map((association) => ({ id: association.id, scope: association.scope, relevanceId: association.relevanceId }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (stable(impact) !== stable(suggestion.associationImpact)) throw rejected();
}

function sameRevisions(expected: Readonly<Record<string, number>>, current: readonly IdentitySnapshot[]) {
  return current.every((identity) => expected[identity.id] === identity.revision) && Object.keys(expected).length === current.length;
}

function totalRevision(snapshots: readonly IdentitySnapshot[]) {
  const total = snapshots.reduce((sum, snapshot) => sum + snapshot.revision, 0);
  if (!Number.isSafeInteger(total)) throw rejected();
  return total;
}

function canonicalDecision(suggestion: IdentitySuggestion, decision: IdentityDecision): AppliedIdentityDecision {
  if (decision.kind === "merge") {
    return freezeDecision({ kind: "merge", primaryId: decision.primaryId, secondaryIds: [...decision.secondaryIds].sort() });
  }
  const partition = suggestion.proposedPartition;
  if (!partition) throw rejected();
  return freezeDecision({
    kind: "split",
    sourceId: decision.sourceId,
    newIdentityId: partition.newIdentityId,
    moveAssociationIds: [...decision.moveAssociationIds].sort(),
  });
}

function snapshotIdentityDecision(value: unknown): IdentityDecision {
  let record: Record<string, unknown>;
  try {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw rejected();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const kindDescriptor = descriptors.kind;
    if (!kindDescriptor || !("value" in kindDescriptor) || !kindDescriptor.enumerable) throw rejected();
    const keys = kindDescriptor.value === "merge"
      ? ["kind", "primaryId", "secondaryIds"]
      : kindDescriptor.value === "split"
        ? ["kind", "sourceId", "moveAssociationIds"]
        : null;
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      !keys
      || ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== keys.length
      || keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))
    ) throw rejected();
    record = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw rejected();
      record[key] = descriptor.value;
    }
  } catch {
    throw rejected();
  }
  const kind = record.kind;
  const ids = exactDataArray(
    kind === "merge" ? record.secondaryIds : record.moveAssociationIds,
    1,
    kind === "merge" ? 15 : 128,
  );
  const subjectId = kind === "merge" ? record.primaryId : record.sourceId;
  if (!validId(subjectId) || !ids || ids.some((id) => !validId(id)) || new Set(ids).size !== ids.length) throw rejected();
  try {
    // Descriptor validation above prevents accessors from running. The clone
    // check rejects Proxy/exotic input; authority remains the immutable
    // descriptor-derived snapshot below.
    structuredClone(value);
  } catch {
    throw rejected();
  }
  return kind === "merge"
    ? Object.freeze({
      kind: "merge",
      primaryId: subjectId,
      secondaryIds: Object.freeze(ids as string[]),
    })
    : Object.freeze({
      kind: "split",
      sourceId: subjectId,
      moveAssociationIds: Object.freeze(ids as string[]),
    });
}

function freezeDecision(decision: AppliedIdentityDecision): AppliedIdentityDecision {
  return decision.kind === "merge"
    ? Object.freeze({ ...decision, secondaryIds: Object.freeze([...decision.secondaryIds]) })
    : Object.freeze({ ...decision, moveAssociationIds: Object.freeze([...decision.moveAssociationIds]) });
}

function freezeAppliedResolution(record: AppliedResolution): AppliedResolution {
  return Object.freeze({
    id: record.id,
    workspaceId: record.workspaceId,
    ownerSubject: record.ownerSubject,
    suggestionId: record.suggestionId,
    suggestionDigest: record.suggestionDigest,
    idempotencyKey: record.idempotencyKey,
    decision: freezeDecision(record.decision),
    operationDigest: record.operationDigest,
    resultDigest: record.resultDigest,
    retainedSourceLineageIds: Object.freeze([...record.retainedSourceLineageIds]),
    retainedIdentityLineageIds: Object.freeze([...record.retainedIdentityLineageIds]),
    retainedAliases: Object.freeze([...record.retainedAliases]),
    retainedSuppressionSubjectRefs: Object.freeze([...record.retainedSuppressionSubjectRefs]),
    rePointedAssociationIds: Object.freeze([...record.rePointedAssociationIds]),
    invalidations: Object.freeze(record.invalidations.map((item) => Object.freeze({
      associationId: item.associationId,
      projection: item.projection,
    }))),
  });
}

function freezeIdentitySuggestion(suggestion: IdentitySuggestion): IdentitySuggestion {
  const candidateRevisions = Object.fromEntries(
    Object.entries(suggestion.candidateRevisions)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return Object.freeze({
    id: suggestion.id,
    digest: suggestion.digest,
    ownerSubject: suggestion.ownerSubject,
    workspaceId: suggestion.workspaceId,
    kind: suggestion.kind,
    candidateIds: Object.freeze([...suggestion.candidateIds]),
    candidateRevisions: Object.freeze(candidateRevisions),
    revision: suggestion.revision,
    sourceLineageIds: Object.freeze([...suggestion.sourceLineageIds]),
    retainedIdentityLineageIds: Object.freeze([...suggestion.retainedIdentityLineageIds]),
    retainedAliases: Object.freeze([...suggestion.retainedAliases]),
    retainedSuppressionSubjectRefs: Object.freeze([...suggestion.retainedSuppressionSubjectRefs]),
    associationImpact: Object.freeze(suggestion.associationImpact.map((association) => Object.freeze({
      id: association.id,
      scope: association.scope,
      relevanceId: association.relevanceId,
    }))),
    suppressionPreservationNotice: suggestion.suppressionPreservationNotice,
    proposedPartition: suggestion.proposedPartition
      ? freezePartition(suggestion.proposedPartition)
      : null,
  });
}

function freezePartition(partition: { sourceId: string; newIdentityId: string; moveAssociationIds: readonly string[] }) {
  return Object.freeze({ ...partition, moveAssociationIds: Object.freeze([...partition.moveAssociationIds].sort()) });
}

function uniqueIds(values: readonly string[], min: number, max: number) {
  assertIdArray(values, min, max);
  return [...values].sort();
}

function assertIdArray(values: unknown, min: number, max: number): asserts values is readonly string[] {
  const data = exactDataArray(values, min, max);
  if (!data || data.some((value) => !validId(value)) || new Set(data).size !== data.length) throw rejected();
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
    const ownKeys = Reflect.ownKeys(descriptors);
    const lengthDescriptor = descriptors.length;
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== value.length + 1
      || !lengthDescriptor
      || !("value" in lengthDescriptor)
      || lengthDescriptor.value !== value.length
      || lengthDescriptor.enumerable
      || lengthDescriptor.configurable
    ) return null;
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
function validSortedIdDataArray(value: unknown, min: number, max: number): string[] | null {
  const values = exactDataArray(value, min, max);
  if (!values || values.some((item) => !validId(item))) return null;
  const ids = values as string[];
  return new Set(ids).size === ids.length && stable([...ids].sort()) === stable(ids) ? ids : null;
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
      return expected.every((item, index) => {
        const descriptor = descriptors[String(index)];
        return Boolean(descriptor && "value" in descriptor && descriptor.enumerable && exactPlainData(descriptor.value, item));
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
function unique(values: readonly string[]) { return [...new Set(values)]; }
function hasOwn(value: object, property: string): boolean { return Object.prototype.hasOwnProperty.call(value, property); }
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{2,127}$/i.test(value); }
function validServerIdentityId(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validDigest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function validateKey(value: string) { if (!/^[a-z0-9][a-z0-9_-]{7,127}$/i.test(value)) throw rejected(); }
function rejected() { return new IdentityResolutionError("identity_resolution_rejected"); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function hash(value: unknown) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(value))); return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join(""); }
