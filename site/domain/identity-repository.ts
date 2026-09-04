import type {
  AppliedResolution,
  IdentityAssociation,
  IdentityResolutionRepository,
  IdentityResolutionTransaction,
  IdentitySnapshot,
  IdentitySuggestion,
} from "./identity-resolution";

type SubjectKind = "contact" | "organization";

type RepositoryScope = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  subjectKind: SubjectKind;
  now?: () => number;
}>;

type SuggestionRow = {
  id: string;
  workspace_id: string;
  owner_subject: string;
  subject_kind: string;
  kind: string;
  revision: number;
  candidate_revisions_json: string;
  source_lineage_ids_json: string;
  retained_identity_lineage_ids_json: string;
  retained_aliases_json: string;
  retained_suppression_subject_refs_json: string;
  proposed_partition_json: string | null;
  suggestion_digest: string;
  created_at: number;
};

type CandidateRow = {
  id: string;
  workspace_id: string;
  suggestion_id: string;
  subject_id: string;
  candidate_revision: number;
  ordinal: number;
};

type ImpactRow = {
  id: string;
  workspace_id: string;
  suggestion_id: string;
  association_id: string;
  scope: string;
  relevance_id: string;
  subject_id: string;
  impact_digest: string;
};

type BaseIdentityRow = {
  id: string;
  workspace_id: string;
  revision: number;
  company_id: string;
  identity_digest: string;
  identity_alias: string;
};

type LineageRow = {
  source_subject_id: string;
  target_subject_id: string;
  relationship: string;
  retained_source_lineage_ids_json: string;
  retained_identity_lineage_ids_json: string;
  retained_aliases_json: string;
  retained_suppression_subject_refs_json: string;
};

type DecisionRow = {
  id: string;
  workspace_id: string;
  suggestion_id: string;
  owner_subject: string;
  subject_kind: string;
  kind: string;
  decision_json: string;
  idempotency_key: string;
  operation_digest: string;
  result_digest: string;
  retained_source_lineage_ids_json: string;
  retained_identity_lineage_ids_json: string;
  retained_aliases_json: string;
  retained_suppression_subject_refs_json: string;
  repointed_association_ids_json: string;
  invalidations_json: string;
  created_at: number;
};

type PersistedLineageRow = LineageRow & {
  id: string;
  workspace_id: string;
  decision_id: string;
  subject_kind: string;
  relationship: string;
  lineage_digest: string;
  created_at: number;
};

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,127}$/iu;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Local-only D1 persistence for the provider-neutral identity domain.
 *
 * The factory scope is server-derived. No method accepts a caller-selected
 * workspace, owner, identity kind, provider, credential, or external endpoint.
 */
export function createD1IdentityResolutionRepository(
  database: D1Database,
  scope: RepositoryScope,
): IdentityResolutionRepository {
  if (
    !validId(scope.workspaceId)
    || !validId(scope.ownerSubject)
    || (scope.subjectKind !== "contact" && scope.subjectKind !== "organization")
  ) {
    throw new TypeError("invalid_identity_repository_scope");
  }
  const clock = scope.now ?? Date.now;

  const repository: IdentityResolutionRepository = {
    async readIdentitySnapshots(workspaceId, identityIds) {
      if (workspaceId !== scope.workspaceId || !validIds(identityIds, 0, 16)) return [];
      return readIdentitySnapshots(database, scope, identityIds);
    },

    async saveIdentitySuggestion(suggestion) {
      const exact = await validateSuggestion(suggestion, scope);
      if (!exact) throw rejected();

      const existing = await readSuggestion(database, scope, suggestion.id);
      if (existing) {
        if (!sameCanonical(existing, exact)) throw rejected();
        return existing;
      }
      const digestCollision = await database.prepare(
        `SELECT id FROM identity_suggestions
         WHERE workspace_id=? AND suggestion_digest=? LIMIT 1`,
      ).bind(scope.workspaceId, exact.digest).first<{ id: string }>();
      if (digestCollision) throw rejected();

      const snapshots = await readIdentitySnapshots(
        database,
        scope,
        exact.candidateIds,
      );
      if (!suggestionMatchesSnapshots(exact, snapshots)) throw rejected();
      const impactSubjects = new Map(
        snapshots.flatMap((snapshot) => (
          snapshot.associations.map((association) => [association.id, association.subjectId] as const)
        )),
      );
      if (impactSubjects.size !== exact.associationImpact.length) throw rejected();

      const createdAt = positiveTime(clock());
      const statements: D1PreparedStatement[] = [
        database.prepare(
          `INSERT INTO identity_suggestions (
            id,workspace_id,owner_subject,subject_kind,kind,revision,
            candidate_revisions_json,source_lineage_ids_json,
            retained_identity_lineage_ids_json,retained_aliases_json,
            retained_suppression_subject_refs_json,proposed_partition_json,
            suggestion_digest,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          exact.id,
          scope.workspaceId,
          scope.ownerSubject,
          scope.subjectKind,
          exact.kind,
          exact.revision,
          canonical(exact.candidateRevisions),
          canonical(exact.sourceLineageIds),
          canonical(exact.retainedIdentityLineageIds),
          canonical(exact.retainedAliases),
          canonical(exact.retainedSuppressionSubjectRefs),
          exact.proposedPartition ? canonical(exact.proposedPartition) : null,
          exact.digest,
          createdAt,
        ),
      ];
      for (const [ordinal, subjectId] of exact.candidateIds.entries()) {
        const material = {
          schema: "identity-suggestion-candidate/v1",
          workspaceId: scope.workspaceId,
          suggestionId: exact.id,
          subjectId,
          candidateRevision: exact.candidateRevisions[subjectId],
          ordinal,
        };
        const childDigest = await digest(material);
        statements.push(database.prepare(
          `INSERT INTO identity_suggestion_candidates (
            id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal
          ) VALUES (?,?,?,?,?,?)`,
        ).bind(
          `isc_${childDigest.slice(0, 24)}`,
          scope.workspaceId,
          exact.id,
          subjectId,
          exact.candidateRevisions[subjectId],
          ordinal,
        ));
      }
      for (const impact of exact.associationImpact) {
        const subjectId = impactSubjects.get(impact.id);
        if (!subjectId) throw rejected();
        const impactDigest = await digest({
          schema: "identity-suggestion-impact/v1",
          workspaceId: scope.workspaceId,
          suggestionId: exact.id,
          associationId: impact.id,
          scope: impact.scope,
          relevanceId: impact.relevanceId,
          subjectId,
        });
        statements.push(database.prepare(
          `INSERT INTO identity_suggestion_impacts (
            id,workspace_id,suggestion_id,association_id,scope,relevance_id,
            subject_id,impact_digest
          ) VALUES (?,?,?,?,?,?,?,?)`,
        ).bind(
          `isi_${impactDigest.slice(0, 24)}`,
          scope.workspaceId,
          exact.id,
          impact.id,
          impact.scope,
          impact.relevanceId,
          subjectId,
          impactDigest,
        ));
      }

      try {
        await database.batch(statements);
      } catch {
        const raced = await readSuggestion(database, scope, exact.id);
        if (raced && sameCanonical(raced, exact)) return raced;
        throw rejected();
      }
      const persisted = await readSuggestion(database, scope, exact.id);
      if (!persisted || !sameCanonical(persisted, exact)) throw rejected();
      return persisted;
    },

    async readIdentitySuggestion(workspaceId, ownerSubject, suggestionId) {
      if (
        workspaceId !== scope.workspaceId
        || ownerSubject !== scope.ownerSubject
        || !validId(suggestionId)
      ) return null;
      return readSuggestion(database, scope, suggestionId);
    },

    async transaction<T>(
      workspaceId: string,
      operation: (transaction: IdentityResolutionTransaction) => Promise<T>,
    ): Promise<T> {
      if (workspaceId !== scope.workspaceId || typeof operation !== "function") throw rejected();
      return operation(Object.freeze({
        findByIdempotencyKey: async (idempotencyKey: string) => (
          readAppliedResolution(database, scope, idempotencyKey)
        ),
        readIdentitySnapshots: async (identityIds: readonly string[]) => {
          if (!validIds(identityIds, 0, 16)) return [];
          return readIdentitySnapshots(database, scope, identityIds);
        },
        applyResolution: async (input: AppliedResolution) => (
          applyResolution(database, scope, input, positiveTime(clock()))
        ),
      }));
    },
  };

  return Object.freeze(repository);
}

async function readIdentitySnapshots(
  database: D1Database,
  scope: RepositoryScope,
  identityIds: readonly string[],
): Promise<readonly IdentitySnapshot[]> {
  if (identityIds.length === 0) return Object.freeze([]);
  const admittedWorkspace = await database.prepare(
    `SELECT id FROM workspaces WHERE id=? AND owner_subject=? LIMIT 1`,
  ).bind(
    scope.workspaceId,
    scope.ownerSubject,
  ).first<{ id: string }>();
  if (!admittedWorkspace) return Object.freeze([]);
  const orderedIds = [...identityIds].sort();
  const placeholders = orderedIds.map(() => "?").join(",");
  const identityTable = scope.subjectKind === "contact" ? "contacts" : "organizations";
  const aliasColumn = scope.subjectKind === "contact" ? "display_name" : "canonical_name";
  const rows = (await database.prepare(
    `SELECT id,workspace_id,revision,company_id,identity_digest,
      ${aliasColumn} identity_alias
     FROM ${identityTable}
     WHERE workspace_id=? AND id IN (${placeholders}) ORDER BY id`,
  ).bind(scope.workspaceId, ...orderedIds).all<BaseIdentityRow>()).results;
  if (
    rows.length !== orderedIds.length
    || rows.some((row, index) => (
      row.id !== orderedIds[index]
      || row.workspace_id !== scope.workspaceId
      || !positiveSafe(Number(row.revision))
      || !normalizedAliasName(row.identity_alias)
      || !DIGEST_PATTERN.test(row.identity_digest)
    ))
  ) return Object.freeze([]);

  // The current schema has no contact-to-email/phone suppression binding. Do
  // not guess across that gap: any potentially relevant unbound tombstone
  // blocks identity resolution until a normalized subject binding exists.
  const identityDigests = rows.map((row) => row.identity_digest);
  const digestPlaceholders = identityDigests.map(() => "?").join(",");
  const unboundSuppressions = await database.prepare(
    `SELECT count(*) count FROM suppressions
     WHERE workspace_id=?
       AND subject_type IN (?,?,?)
       AND NOT (subject_type=? AND subject_digest IN (${digestPlaceholders}))`,
  ).bind(
    scope.workspaceId,
    scope.subjectKind,
    scope.subjectKind === "contact" ? "email" : "organization_alias",
    scope.subjectKind === "contact" ? "phone" : "organization_domain",
    scope.subjectKind,
    ...identityDigests,
  ).first<{ count: number }>();
  if (!unboundSuppressions || Number(unboundSuppressions.count) !== 0) {
    return Object.freeze([]);
  }

  const lineageRows = (await database.prepare(
    `SELECT source_subject_id,target_subject_id,relationship,
      retained_source_lineage_ids_json,retained_identity_lineage_ids_json,
      retained_aliases_json,retained_suppression_subject_refs_json
     FROM identity_lineage
     WHERE workspace_id=? AND subject_kind=?
       AND (source_subject_id IN (${placeholders}) OR target_subject_id IN (${placeholders}))
     ORDER BY created_at,id`,
  ).bind(
    scope.workspaceId,
    scope.subjectKind,
    ...orderedIds,
    ...orderedIds,
  ).all<LineageRow>()).results;
  if (lineageRows.some((lineage) => (
    lineage.relationship === "merged_into"
    && orderedIds.includes(lineage.source_subject_id)
  ))) return Object.freeze([]);

  const associationRows = scope.subjectKind === "contact"
    ? (await database.prepare(
      `SELECT id,contact_id subject_id,play_id relevance_id
       FROM contact_relevance
       WHERE workspace_id=? AND contact_id IN (${placeholders}) ORDER BY id`,
    ).bind(scope.workspaceId, ...orderedIds).all<{
      id: string;
      subject_id: string;
      relevance_id: string;
    }>()).results
    : (await database.prepare(
      `SELECT id,organization_id subject_id,play_id relevance_id
       FROM accounts
       WHERE workspace_id=? AND organization_id IN (${placeholders}) ORDER BY id`,
    ).bind(scope.workspaceId, ...orderedIds).all<{
      id: string;
      subject_id: string;
      relevance_id: string;
    }>()).results;

  const snapshots: IdentitySnapshot[] = [];
  for (const row of rows) {
    const related = lineageRows.filter(
      (lineage) => (
        lineage.source_subject_id === row.id || lineage.target_subject_id === row.id
      ),
    );
    const parsedLineage = related.map(parseLineageRetention);
    if (parsedLineage.some((entry) => entry === null)) return Object.freeze([]);
    const exactLineage = parsedLineage.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
    const sourceLineageIds = sortedUnique([
      row.id,
      ...exactLineage.flatMap((lineage) => lineage.sourceLineageIds),
    ]);
    const identityLineageIds = sortedUnique(
      exactLineage.flatMap((lineage) => lineage.identityLineageIds),
    );
    const aliasReference = await opaqueAliasReference(
      scope.subjectKind,
      row.id,
      row.identity_alias,
    );
    if (!aliasReference) return Object.freeze([]);
    const aliases = sortedUnique([
      aliasReference,
      ...exactLineage.flatMap((lineage) => lineage.aliases),
    ]);
    const retainedSuppressionSubjectRefs = sortedUnique(
      exactLineage.flatMap((lineage) => lineage.suppressionSubjectRefs),
    );
    const linkedSuppressions = (await database.prepare(
      `SELECT subject_digest FROM suppressions
       WHERE workspace_id=? AND subject_type=? AND subject_digest=?
       ORDER BY subject_digest`,
    ).bind(
      scope.workspaceId,
      scope.subjectKind,
      row.identity_digest,
    ).all<{ subject_digest: string }>()).results;
    const suppressionSubjectRefs = sortedUnique([
      ...retainedSuppressionSubjectRefs,
      ...linkedSuppressions.map((suppression) => suppression.subject_digest),
    ]);
    const associations = associationRows
      .filter((association) => association.subject_id === row.id)
      .map((association) => Object.freeze({
        id: association.id,
        workspaceId: scope.workspaceId,
        scope: "market_play" as const,
        relevanceId: association.relevance_id,
        subjectId: row.id,
      }));
    if (
      !validIds(sourceLineageIds, 1, 2_048)
      || !validIds(identityLineageIds, 0, 2_048)
      || !validIds(aliases, 0, 2_048)
      || !validIds(suppressionSubjectRefs, 0, 2_048)
      || associations.some((association) => (
        !validId(association.id) || !validId(association.relevanceId)
      ))
    ) return Object.freeze([]);
    snapshots.push(Object.freeze({
      id: row.id,
      workspaceId: scope.workspaceId,
      revision: Number(row.revision),
      aliases: Object.freeze(aliases),
      sourceLineageIds: Object.freeze(sourceLineageIds),
      identityLineageIds: Object.freeze(identityLineageIds),
      associations: Object.freeze(associations),
      suppressionSubjectRefs: Object.freeze(suppressionSubjectRefs),
    }));
  }
  return Object.freeze(snapshots);
}

async function readSuggestion(
  database: D1Database,
  scope: RepositoryScope,
  suggestionId: string,
): Promise<IdentitySuggestion | null> {
  const row = await database.prepare(
    `SELECT id,workspace_id,owner_subject,subject_kind,kind,revision,
      candidate_revisions_json,source_lineage_ids_json,
      retained_identity_lineage_ids_json,retained_aliases_json,
      retained_suppression_subject_refs_json,proposed_partition_json,
      suggestion_digest,created_at
     FROM identity_suggestions
     WHERE id=? AND workspace_id=? AND owner_subject=? AND subject_kind=? LIMIT 1`,
  ).bind(
    suggestionId,
    scope.workspaceId,
    scope.ownerSubject,
    scope.subjectKind,
  ).first<SuggestionRow>();
  if (!row) return null;
  const candidates = (await database.prepare(
    `SELECT id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal
     FROM identity_suggestion_candidates
     WHERE workspace_id=? AND suggestion_id=? ORDER BY ordinal`,
  ).bind(scope.workspaceId, suggestionId).all<CandidateRow>()).results;
  const impacts = (await database.prepare(
    `SELECT id,workspace_id,suggestion_id,association_id,scope,relevance_id,
      subject_id,impact_digest
     FROM identity_suggestion_impacts
     WHERE workspace_id=? AND suggestion_id=? ORDER BY association_id`,
  ).bind(scope.workspaceId, suggestionId).all<ImpactRow>()).results;

  const candidateRevisions = parseCanonicalJson<Record<string, number>>(
    row.candidate_revisions_json,
  );
  const sourceLineageIds = parseCanonicalJson<string[]>(row.source_lineage_ids_json);
  const retainedIdentityLineageIds = parseCanonicalJson<string[]>(
    row.retained_identity_lineage_ids_json,
  );
  const retainedAliases = parseCanonicalJson<string[]>(row.retained_aliases_json);
  const retainedSuppressionSubjectRefs = parseCanonicalJson<string[]>(
    row.retained_suppression_subject_refs_json,
  );
  const proposedPartition = row.proposed_partition_json === null
    ? null
    : parseCanonicalJson<IdentitySuggestion["proposedPartition"]>(
      row.proposed_partition_json,
    );
  if (
    !candidateRevisions
    || !sourceLineageIds
    || !retainedIdentityLineageIds
    || !retainedAliases
    || !retainedSuppressionSubjectRefs
    || (row.proposed_partition_json !== null && !proposedPartition)
  ) return null;

  const candidateIds = candidates.map((candidate) => candidate.subject_id);
  if (
    candidates.some((candidate, ordinal) => (
      candidate.workspace_id !== scope.workspaceId
      || candidate.suggestion_id !== row.id
      || candidate.ordinal !== ordinal
      || candidate.candidate_revision !== candidateRevisions[candidate.subject_id]
    ))
  ) return null;
  for (const candidate of candidates) {
    const childDigest = await digest({
      schema: "identity-suggestion-candidate/v1",
      workspaceId: scope.workspaceId,
      suggestionId: row.id,
      subjectId: candidate.subject_id,
      candidateRevision: Number(candidate.candidate_revision),
      ordinal: Number(candidate.ordinal),
    });
    if (candidate.id !== `isc_${childDigest.slice(0, 24)}`) return null;
  }
  for (const impact of impacts) {
    const impactDigest = await digest({
      schema: "identity-suggestion-impact/v1",
      workspaceId: scope.workspaceId,
      suggestionId: row.id,
      associationId: impact.association_id,
      scope: impact.scope,
      relevanceId: impact.relevance_id,
      subjectId: impact.subject_id,
    });
    if (
      impact.id !== `isi_${impactDigest.slice(0, 24)}`
      || impact.impact_digest !== impactDigest
      || !candidateIds.includes(impact.subject_id)
    ) return null;
  }

  const suggestion = freezeSuggestion({
    id: row.id,
    digest: row.suggestion_digest,
    ownerSubject: row.owner_subject,
    workspaceId: row.workspace_id,
    kind: row.kind as IdentitySuggestion["kind"],
    candidateIds,
    candidateRevisions,
    revision: Number(row.revision),
    sourceLineageIds,
    retainedIdentityLineageIds,
    retainedAliases,
    retainedSuppressionSubjectRefs,
    associationImpact: impacts.map((impact) => ({
      id: impact.association_id,
      scope: impact.scope as IdentityAssociation["scope"],
      relevanceId: impact.relevance_id,
    })),
    suppressionPreservationNotice: "preserve_all_existing_subject_references",
    proposedPartition,
  });
  return validateSuggestion(suggestion, scope);
}

async function validateSuggestion(
  candidate: IdentitySuggestion,
  scope: RepositoryScope,
): Promise<IdentitySuggestion | null> {
  try {
    const cloned = structuredClone(candidate);
    const suggestion = freezeSuggestion(cloned);
    const minCandidates = suggestion.kind === "merge" ? 2 : 1;
    const maxCandidates = suggestion.kind === "merge" ? 16 : 1;
    if (
      !sameCanonical(cloned, suggestion)
      || suggestion.workspaceId !== scope.workspaceId
      || suggestion.ownerSubject !== scope.ownerSubject
      || !validId(suggestion.id)
      || !DIGEST_PATTERN.test(suggestion.digest)
      || !validIds(suggestion.candidateIds, minCandidates, maxCandidates)
      || canonical([...suggestion.candidateIds].sort()) !== canonical(suggestion.candidateIds)
      || Object.keys(suggestion.candidateRevisions).sort().join("\0")
        !== [...suggestion.candidateIds].sort().join("\0")
      || Object.values(suggestion.candidateRevisions).some((revision) => !positiveSafe(revision))
      || suggestion.revision !== Object.values(suggestion.candidateRevisions)
        .reduce((sum, revision) => sum + revision, 0)
      || !validSortedIds(suggestion.sourceLineageIds, 1, 2_048)
      || !validSortedIds(
        suggestion.retainedIdentityLineageIds,
        suggestion.candidateIds.length,
        2_048,
      )
      || !validSortedIds(suggestion.retainedAliases, 0, 2_048)
      || !validSortedIds(suggestion.retainedSuppressionSubjectRefs, 0, 2_048)
      || suggestion.candidateIds.some(
        (id) => !suggestion.retainedIdentityLineageIds.includes(id),
      )
      || suggestion.suppressionPreservationNotice
        !== "preserve_all_existing_subject_references"
      || !Array.isArray(suggestion.associationImpact)
      || suggestion.associationImpact.length > 2_048
      || suggestion.associationImpact.some((impact) => (
        !validId(impact.id)
        || !validId(impact.relevanceId)
        || (impact.scope !== "market_play" && impact.scope !== "customer_profile")
      ))
      || !validSortedIds(
        suggestion.associationImpact.map((impact) => impact.id),
        0,
        2_048,
      )
    ) return null;
    if (suggestion.kind === "merge") {
      if (suggestion.proposedPartition !== null) return null;
    } else if (
      !suggestion.proposedPartition
      || suggestion.proposedPartition.sourceId !== suggestion.candidateIds[0]
      || !UUID_V7_PATTERN.test(suggestion.proposedPartition.newIdentityId)
      || !validSortedIds(
        suggestion.proposedPartition.moveAssociationIds,
        1,
        128,
      )
      || canonical(suggestion.proposedPartition.moveAssociationIds)
        !== canonical(suggestion.associationImpact.map((impact) => impact.id))
    ) return null;
    const evidence = suggestionEvidence(suggestion);
    const expectedDigest = await digest({
      schema: "identity-suggestion/v1",
      ...evidence,
    });
    const expectedId = await digest({
      schema: "identity-suggestion-id/v1",
      workspaceId: suggestion.workspaceId,
      ownerSubject: suggestion.ownerSubject,
      digest: expectedDigest,
    });
    return suggestion.digest === expectedDigest && suggestion.id === expectedId
      ? suggestion
      : null;
  } catch {
    return null;
  }
}

function suggestionMatchesSnapshots(
  suggestion: IdentitySuggestion,
  snapshots: readonly IdentitySnapshot[],
): boolean {
  if (
    snapshots.length !== suggestion.candidateIds.length
    || snapshots.some((snapshot) => (
      suggestion.candidateRevisions[snapshot.id] !== snapshot.revision
    ))
  ) return false;
  const sourceLineageIds = sortedUnique(
    snapshots.flatMap((snapshot) => snapshot.sourceLineageIds),
  );
  const identityLineageIds = sortedUnique(
    snapshots.flatMap((snapshot) => [snapshot.id, ...snapshot.identityLineageIds]),
  );
  const aliases = sortedUnique(snapshots.flatMap((snapshot) => snapshot.aliases));
  const suppressions = sortedUnique(
    snapshots.flatMap((snapshot) => snapshot.suppressionSubjectRefs),
  );
  const associations = suggestion.proposedPartition
    ? snapshots[0]?.associations.filter((association) => (
      suggestion.proposedPartition?.moveAssociationIds.includes(association.id)
    )) ?? []
    : snapshots.flatMap((snapshot) => snapshot.associations);
  const impact = associations
    .map((association) => ({
      id: association.id,
      scope: association.scope,
      relevanceId: association.relevanceId,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return (
    sameCanonical(sourceLineageIds, suggestion.sourceLineageIds)
    && sameCanonical(identityLineageIds, suggestion.retainedIdentityLineageIds)
    && sameCanonical(aliases, suggestion.retainedAliases)
    && sameCanonical(suppressions, suggestion.retainedSuppressionSubjectRefs)
    && sameCanonical(impact, suggestion.associationImpact)
  );
}

async function readAppliedResolution(
  database: D1Database,
  scope: RepositoryScope,
  idempotencyKey: string,
): Promise<AppliedResolution | null> {
  if (!validId(idempotencyKey)) return null;
  const row = await database.prepare(
    `SELECT id,workspace_id,suggestion_id,owner_subject,subject_kind,kind,
      decision_json,idempotency_key,operation_digest,result_digest,
      retained_source_lineage_ids_json,retained_identity_lineage_ids_json,
      retained_aliases_json,retained_suppression_subject_refs_json,
      repointed_association_ids_json,invalidations_json,created_at
     FROM identity_decisions
     WHERE workspace_id=? AND owner_subject=? AND subject_kind=?
       AND idempotency_key=? LIMIT 1`,
  ).bind(
    scope.workspaceId,
    scope.ownerSubject,
    scope.subjectKind,
    idempotencyKey,
  ).first<DecisionRow>();
  if (!row) return null;
  const suggestion = await readSuggestion(database, scope, row.suggestion_id);
  if (!suggestion || suggestion.kind !== row.kind) return null;
  const decision = parseCanonicalJson<AppliedResolution["decision"]>(
    row.decision_json,
  );
  const retainedSourceLineageIds = parseCanonicalJson<string[]>(
    row.retained_source_lineage_ids_json,
  );
  const retainedIdentityLineageIds = parseCanonicalJson<string[]>(
    row.retained_identity_lineage_ids_json,
  );
  const retainedAliases = parseCanonicalJson<string[]>(row.retained_aliases_json);
  const retainedSuppressionSubjectRefs = parseCanonicalJson<string[]>(
    row.retained_suppression_subject_refs_json,
  );
  const rePointedAssociationIds = parseCanonicalJson<string[]>(
    row.repointed_association_ids_json,
  );
  const invalidations = parseCanonicalJson<AppliedResolution["invalidations"]>(
    row.invalidations_json,
  );
  if (
    !decision
    || !retainedSourceLineageIds
    || !retainedIdentityLineageIds
    || !retainedAliases
    || !retainedSuppressionSubjectRefs
    || !rePointedAssociationIds
    || !invalidations
    || !Array.isArray(invalidations)
    || !validAppliedDecision(decision, suggestion)
    || !validSortedIds(retainedSourceLineageIds, 1, 2_048)
    || !validSortedIds(retainedIdentityLineageIds, 1, 2_048)
    || !validSortedIds(retainedAliases, 0, 2_048)
    || !validSortedIds(retainedSuppressionSubjectRefs, 0, 2_048)
    || !validSortedIds(rePointedAssociationIds, 1, 2_048)
    || invalidations.length !== rePointedAssociationIds.length
    || invalidations.some((invalidation, index) => (
      !invalidation
      || typeof invalidation !== "object"
      || Array.isArray(invalidation)
      || Object.keys(invalidation).sort().join("\0")
        !== ["associationId", "projection"].sort().join("\0")
      || invalidation.associationId !== rePointedAssociationIds[index]
      || invalidation.projection !== (
        decision.kind === "merge" ? "NeedsReview" : "NonContactable"
      )
    ))
    || !sameCanonical(retainedSourceLineageIds, suggestion.sourceLineageIds)
    || !sameCanonical(
      retainedIdentityLineageIds,
      suggestion.retainedIdentityLineageIds,
    )
    || !sameCanonical(retainedAliases, suggestion.retainedAliases)
    || !sameCanonical(
      retainedSuppressionSubjectRefs,
      suggestion.retainedSuppressionSubjectRefs,
    )
    || !sameCanonical(
      rePointedAssociationIds,
      suggestion.associationImpact.map((impact) => impact.id).sort(),
    )
  ) return null;

  const operationDigest = await digest({
    workspaceId: scope.workspaceId,
    suggestionId: suggestion.id,
    suggestionDigest: suggestion.digest,
    suggestionRevision: suggestion.revision,
    decision,
    actor: scope.ownerSubject,
  });
  const material = {
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    suggestionId: suggestion.id,
    suggestionDigest: suggestion.digest,
    idempotencyKey,
    decision,
    operationDigest,
    retainedSourceLineageIds,
    retainedIdentityLineageIds,
    retainedAliases,
    retainedSuppressionSubjectRefs,
    rePointedAssociationIds,
    invalidations,
  };
  const resultDigest = await digest({
    schema: "identity-resolution-result/v1",
    ...material,
  });
  const expectedId = await digest({
    operationDigest,
    idempotencyKey,
    resultDigest,
  });
  if (
    row.workspace_id !== scope.workspaceId
    || row.owner_subject !== scope.ownerSubject
    || row.subject_kind !== scope.subjectKind
    || row.idempotency_key !== idempotencyKey
    || row.operation_digest !== operationDigest
    || row.result_digest !== resultDigest
    || row.id !== expectedId
  ) return null;

  const lineageRows = (await database.prepare(
    `SELECT id,workspace_id,decision_id,subject_kind,source_subject_id,
      target_subject_id,relationship,retained_source_lineage_ids_json,
      retained_identity_lineage_ids_json,retained_aliases_json,
      retained_suppression_subject_refs_json,lineage_digest,created_at
     FROM identity_lineage
     WHERE workspace_id=? AND decision_id=?
     ORDER BY relationship,source_subject_id,target_subject_id`,
  ).bind(
    scope.workspaceId,
    row.id,
  ).all<PersistedLineageRow>()).results;
  const expectedLineage = expectedLineageEdges(decision);
  if (
    lineageRows.length !== expectedLineage.length
    || lineageRows.some((lineage, index) => {
      const edge = expectedLineage[index];
      return (
        !edge
        || lineage.workspace_id !== scope.workspaceId
        || lineage.decision_id !== row.id
        || lineage.subject_kind !== scope.subjectKind
        || lineage.source_subject_id !== edge.sourceSubjectId
        || lineage.target_subject_id !== edge.targetSubjectId
        || lineage.relationship !== edge.relationship
        || lineage.retained_source_lineage_ids_json
          !== canonical(retainedSourceLineageIds)
        || lineage.retained_identity_lineage_ids_json
          !== canonical(retainedIdentityLineageIds)
        || lineage.retained_aliases_json !== canonical(retainedAliases)
        || lineage.retained_suppression_subject_refs_json
          !== canonical(retainedSuppressionSubjectRefs)
      );
    })
  ) return null;
  for (const lineage of lineageRows) {
    const lineageDigest = await digest({
      schema: "identity-lineage/v1",
      decisionId: row.id,
      subjectKind: scope.subjectKind,
      sourceSubjectId: lineage.source_subject_id,
      targetSubjectId: lineage.target_subject_id,
      relationship: lineage.relationship,
      retainedSourceLineageIds,
      retainedIdentityLineageIds,
      retainedAliases,
      retainedSuppressionSubjectRefs,
    });
    if (
      lineage.lineage_digest !== lineageDigest
      || lineage.id !== `il_${lineageDigest.slice(0, 24)}`
    ) return null;
  }

  return freezeAppliedResolution({
    id: row.id,
    ...material,
    resultDigest,
  });
}

async function applyResolution(
  database: D1Database,
  scope: RepositoryScope,
  input: AppliedResolution,
  now: number,
): Promise<AppliedResolution> {
  const replay = await readAppliedResolution(
    database,
    scope,
    input.idempotencyKey,
  );
  if (replay) {
    if (!sameCanonical(replay, input)) throw rejected();
    return replay;
  }
  const suggestion = await readSuggestion(database, scope, input.suggestionId);
  if (!suggestion) throw rejected();
  const exact = await validateAppliedResolution(input, suggestion, scope);
  if (!exact) throw rejected();
  const snapshots = await readIdentitySnapshots(
    database,
    scope,
    suggestion.candidateIds,
  );
  if (!suggestionMatchesSnapshots(suggestion, snapshots)) throw rejected();

  const impacts = (await database.prepare(
    `SELECT id,workspace_id,suggestion_id,association_id,scope,relevance_id,
      subject_id,impact_digest
     FROM identity_suggestion_impacts
     WHERE workspace_id=? AND suggestion_id=? ORDER BY association_id`,
  ).bind(
    scope.workspaceId,
    suggestion.id,
  ).all<ImpactRow>()).results;
  if (
    impacts.length !== suggestion.associationImpact.length
    || impacts.some((impact, index) => (
      impact.association_id !== suggestion.associationImpact[index]?.id
      || !suggestion.candidateIds.includes(impact.subject_id)
    ))
  ) throw rejected();

  const identityTable = scope.subjectKind === "contact"
    ? "contacts"
    : "organizations";
  const associationTable = scope.subjectKind === "contact"
    ? "contact_relevance"
    : "accounts";
  const associationSubjectColumn = scope.subjectKind === "contact"
    ? "contact_id"
    : "organization_id";
  const statements: D1PreparedStatement[] = [];
  if (exact.decision.kind === "split") {
    const source = await database.prepare(
      `SELECT id,workspace_id,revision,company_id,identity_digest,
        ${scope.subjectKind === "contact" ? "display_name" : "canonical_name"} identity_alias
       FROM ${identityTable}
       WHERE id=? AND workspace_id=? LIMIT 1`,
    ).bind(
      exact.decision.sourceId,
      scope.workspaceId,
    ).first<BaseIdentityRow>();
    if (
      !source
      || Number(source.revision)
        !== suggestion.candidateRevisions[exact.decision.sourceId]
    ) throw rejected();
    const splitIdentityDigest = await digest({
      schema: `${scope.subjectKind}-split-identity/v1`,
      workspaceId: scope.workspaceId,
      sourceId: exact.decision.sourceId,
      newIdentityId: exact.decision.newIdentityId,
      decisionId: exact.id,
    });
    statements.push(scope.subjectKind === "contact"
      ? database.prepare(
        `INSERT INTO contacts (
          id,workspace_id,created_at,updated_at,revision,company_id,
          identity_digest,display_name
        ) VALUES (?,?,?,?,1,?,?,?)`,
      ).bind(
        exact.decision.newIdentityId,
        scope.workspaceId,
        now,
        now,
        source.company_id,
        splitIdentityDigest,
        source.identity_alias,
      )
      : database.prepare(
        `INSERT INTO organizations (
          id,workspace_id,created_at,updated_at,revision,company_id,
          canonical_name,identity_digest
        ) VALUES (?,?,?,?,1,?,?,?)`,
      ).bind(
        exact.decision.newIdentityId,
        scope.workspaceId,
        now,
        now,
        source.company_id,
        source.identity_alias,
        splitIdentityDigest,
      ));
  }

  const revisionGuard = `(
    SELECT count(*) FROM identity_suggestion_candidates c
    JOIN ${identityTable} identity
      ON identity.id=c.subject_id AND identity.workspace_id=c.workspace_id
     AND identity.revision=c.candidate_revision
    WHERE c.workspace_id=? AND c.suggestion_id=?
  ) = (
    SELECT count(*) FROM identity_suggestion_candidates c
    WHERE c.workspace_id=? AND c.suggestion_id=?
  )`;
  const associationGuard = `NOT EXISTS (
    SELECT 1 FROM identity_suggestion_impacts impact
    LEFT JOIN ${associationTable} association
      ON association.id=impact.association_id
     AND association.workspace_id=impact.workspace_id
     AND association.${associationSubjectColumn}=impact.subject_id
    WHERE impact.workspace_id=? AND impact.suggestion_id=?
      AND association.id IS NULL
  )`;
  statements.push(database.prepare(
    `INSERT INTO identity_decisions (
      id,workspace_id,suggestion_id,owner_subject,subject_kind,kind,
      decision_json,idempotency_key,operation_digest,result_digest,
      retained_source_lineage_ids_json,retained_identity_lineage_ids_json,
      retained_aliases_json,retained_suppression_subject_refs_json,
      repointed_association_ids_json,invalidations_json,created_at
    )
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    WHERE ${revisionGuard} AND ${associationGuard}`,
  ).bind(
    exact.id,
    scope.workspaceId,
    suggestion.id,
    scope.ownerSubject,
    scope.subjectKind,
    exact.decision.kind,
    canonical(exact.decision),
    exact.idempotencyKey,
    exact.operationDigest,
    exact.resultDigest,
    canonical(exact.retainedSourceLineageIds),
    canonical(exact.retainedIdentityLineageIds),
    canonical(exact.retainedAliases),
    canonical(exact.retainedSuppressionSubjectRefs),
    canonical(exact.rePointedAssociationIds),
    canonical(exact.invalidations),
    now,
    scope.workspaceId,
    suggestion.id,
    scope.workspaceId,
    suggestion.id,
    scope.workspaceId,
    suggestion.id,
  ));

  for (const edge of expectedLineageEdges(exact.decision)) {
    const lineageDigest = await digest({
      schema: "identity-lineage/v1",
      decisionId: exact.id,
      subjectKind: scope.subjectKind,
      sourceSubjectId: edge.sourceSubjectId,
      targetSubjectId: edge.targetSubjectId,
      relationship: edge.relationship,
      retainedSourceLineageIds: exact.retainedSourceLineageIds,
      retainedIdentityLineageIds: exact.retainedIdentityLineageIds,
      retainedAliases: exact.retainedAliases,
      retainedSuppressionSubjectRefs: exact.retainedSuppressionSubjectRefs,
    });
    statements.push(database.prepare(
      `INSERT INTO identity_lineage (
        id,workspace_id,decision_id,subject_kind,source_subject_id,
        target_subject_id,relationship,retained_source_lineage_ids_json,
        retained_identity_lineage_ids_json,retained_aliases_json,
        retained_suppression_subject_refs_json,lineage_digest,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      `il_${lineageDigest.slice(0, 24)}`,
      scope.workspaceId,
      exact.id,
      scope.subjectKind,
      edge.sourceSubjectId,
      edge.targetSubjectId,
      edge.relationship,
      canonical(exact.retainedSourceLineageIds),
      canonical(exact.retainedIdentityLineageIds),
      canonical(exact.retainedAliases),
      canonical(exact.retainedSuppressionSubjectRefs),
      lineageDigest,
      now,
    ));
  }

  const targetSubjectId = exact.decision.kind === "merge"
    ? exact.decision.primaryId
    : exact.decision.newIdentityId;
  for (const impact of impacts) {
    if (impact.subject_id === targetSubjectId) continue;
    statements.push(database.prepare(
      `UPDATE ${associationTable}
       SET ${associationSubjectColumn}=?,updated_at=?,revision=revision+1
       WHERE id=? AND workspace_id=? AND ${associationSubjectColumn}=?`,
    ).bind(
      targetSubjectId,
      now,
      impact.association_id,
      scope.workspaceId,
      impact.subject_id,
    ));
  }
  const revisionSubjects = exact.decision.kind === "merge"
    ? suggestion.candidateIds
    : [exact.decision.sourceId];
  for (const subjectId of revisionSubjects) {
    statements.push(database.prepare(
      `UPDATE ${identityTable}
       SET updated_at=?,revision=revision+1
       WHERE id=? AND workspace_id=? AND revision=?`,
    ).bind(
      now,
      subjectId,
      scope.workspaceId,
      suggestion.candidateRevisions[subjectId],
    ));
  }

  try {
    await database.batch(statements);
  } catch {
    const raced = await readAppliedResolution(
      database,
      scope,
      exact.idempotencyKey,
    );
    if (raced && sameCanonical(raced, exact)) return raced;
    throw rejected();
  }
  const committed = await readAppliedResolution(
    database,
    scope,
    exact.idempotencyKey,
  );
  if (!committed || !sameCanonical(committed, exact)) throw rejected();
  return committed;
}

async function validateAppliedResolution(
  candidate: AppliedResolution,
  suggestion: IdentitySuggestion,
  scope: RepositoryScope,
): Promise<AppliedResolution | null> {
  try {
    const cloned = structuredClone(candidate);
    const input = freezeAppliedResolution(cloned);
    if (
      !sameCanonical(cloned, input)
      || input.workspaceId !== scope.workspaceId
      || input.ownerSubject !== scope.ownerSubject
      || input.suggestionId !== suggestion.id
      || input.suggestionDigest !== suggestion.digest
      || !validId(input.idempotencyKey)
      || !validAppliedDecision(input.decision, suggestion)
      || !validSortedIds(input.retainedSourceLineageIds, 1, 2_048)
      || !validSortedIds(input.retainedIdentityLineageIds, 1, 2_048)
      || !validSortedIds(input.retainedAliases, 0, 2_048)
      || !validSortedIds(input.retainedSuppressionSubjectRefs, 0, 2_048)
      || !validSortedIds(input.rePointedAssociationIds, 1, 2_048)
      || !sameCanonical(
        input.retainedSourceLineageIds,
        suggestion.sourceLineageIds,
      )
      || !sameCanonical(
        input.retainedIdentityLineageIds,
        suggestion.retainedIdentityLineageIds,
      )
      || !sameCanonical(input.retainedAliases, suggestion.retainedAliases)
      || !sameCanonical(
        input.retainedSuppressionSubjectRefs,
        suggestion.retainedSuppressionSubjectRefs,
      )
      || !sameCanonical(
        input.rePointedAssociationIds,
        suggestion.associationImpact.map((impact) => impact.id).sort(),
      )
      || input.invalidations.length !== input.rePointedAssociationIds.length
      || input.invalidations.some((invalidation, index) => (
        invalidation.associationId !== input.rePointedAssociationIds[index]
        || invalidation.projection !== (
          input.decision.kind === "merge" ? "NeedsReview" : "NonContactable"
        )
      ))
    ) return null;
    const operationDigest = await digest({
      workspaceId: scope.workspaceId,
      suggestionId: suggestion.id,
      suggestionDigest: suggestion.digest,
      suggestionRevision: suggestion.revision,
      decision: input.decision,
      actor: scope.ownerSubject,
    });
    const material = {
      workspaceId: scope.workspaceId,
      ownerSubject: scope.ownerSubject,
      suggestionId: suggestion.id,
      suggestionDigest: suggestion.digest,
      idempotencyKey: input.idempotencyKey,
      decision: input.decision,
      operationDigest,
      retainedSourceLineageIds: input.retainedSourceLineageIds,
      retainedIdentityLineageIds: input.retainedIdentityLineageIds,
      retainedAliases: input.retainedAliases,
      retainedSuppressionSubjectRefs: input.retainedSuppressionSubjectRefs,
      rePointedAssociationIds: input.rePointedAssociationIds,
      invalidations: input.invalidations,
    };
    const resultDigest = await digest({
      schema: "identity-resolution-result/v1",
      ...material,
    });
    const id = await digest({
      operationDigest,
      idempotencyKey: input.idempotencyKey,
      resultDigest,
    });
    return (
      input.operationDigest === operationDigest
      && input.resultDigest === resultDigest
      && input.id === id
    ) ? input : null;
  } catch {
    return null;
  }
}

function validAppliedDecision(
  decision: AppliedResolution["decision"],
  suggestion: IdentitySuggestion,
): boolean {
  if (!decision || decision.kind !== suggestion.kind) return false;
  if (decision.kind === "merge") {
    const ids = [decision.primaryId, ...decision.secondaryIds].sort();
    return (
      Object.keys(decision).sort().join("\0")
        === ["kind", "primaryId", "secondaryIds"].sort().join("\0")
      &&
      validId(decision.primaryId)
      && validSortedIds(decision.secondaryIds, 1, 15)
      && !decision.secondaryIds.includes(decision.primaryId)
      && sameCanonical(ids, suggestion.candidateIds)
      && suggestion.proposedPartition === null
    );
  }
  const partition = suggestion.proposedPartition;
  return Boolean(
    partition
    && Object.keys(decision).sort().join("\0")
      === ["kind", "sourceId", "newIdentityId", "moveAssociationIds"]
        .sort()
        .join("\0")
    && decision.sourceId === partition.sourceId
    && decision.newIdentityId === partition.newIdentityId
    && validSortedIds(decision.moveAssociationIds, 1, 128)
    && sameCanonical(
      decision.moveAssociationIds,
      partition.moveAssociationIds,
    ),
  );
}

function expectedLineageEdges(
  decision: AppliedResolution["decision"],
): readonly Readonly<{
  sourceSubjectId: string;
  targetSubjectId: string;
  relationship: "merged_into" | "split_from";
}>[] {
  return decision.kind === "merge"
    ? decision.secondaryIds.map((sourceSubjectId) => ({
      sourceSubjectId,
      targetSubjectId: decision.primaryId,
      relationship: "merged_into" as const,
    })).sort((left, right) => left.sourceSubjectId.localeCompare(right.sourceSubjectId))
    : [{
      sourceSubjectId: decision.sourceId,
      targetSubjectId: decision.newIdentityId,
      relationship: "split_from" as const,
    }];
}

function freezeAppliedResolution(
  record: AppliedResolution,
): AppliedResolution {
  const decision = record.decision.kind === "merge"
    ? Object.freeze({
      kind: "merge" as const,
      primaryId: record.decision.primaryId,
      secondaryIds: Object.freeze([...record.decision.secondaryIds]),
    })
    : Object.freeze({
      kind: "split" as const,
      sourceId: record.decision.sourceId,
      newIdentityId: record.decision.newIdentityId,
      moveAssociationIds: Object.freeze([
        ...record.decision.moveAssociationIds,
      ]),
    });
  return Object.freeze({
    id: record.id,
    workspaceId: record.workspaceId,
    ownerSubject: record.ownerSubject,
    suggestionId: record.suggestionId,
    suggestionDigest: record.suggestionDigest,
    idempotencyKey: record.idempotencyKey,
    decision,
    operationDigest: record.operationDigest,
    resultDigest: record.resultDigest,
    retainedSourceLineageIds: Object.freeze([
      ...record.retainedSourceLineageIds,
    ]),
    retainedIdentityLineageIds: Object.freeze([
      ...record.retainedIdentityLineageIds,
    ]),
    retainedAliases: Object.freeze([...record.retainedAliases]),
    retainedSuppressionSubjectRefs: Object.freeze([
      ...record.retainedSuppressionSubjectRefs,
    ]),
    rePointedAssociationIds: Object.freeze([
      ...record.rePointedAssociationIds,
    ]),
    invalidations: Object.freeze(record.invalidations.map(
      (invalidation) => Object.freeze({ ...invalidation }),
    )),
  });
}

function parseLineageRetention(row: LineageRow) {
  const sourceLineageIds = parseCanonicalJson<string[]>(
    row.retained_source_lineage_ids_json,
  );
  const identityLineageIds = parseCanonicalJson<string[]>(
    row.retained_identity_lineage_ids_json,
  );
  const aliases = parseCanonicalJson<string[]>(row.retained_aliases_json);
  const suppressionSubjectRefs = parseCanonicalJson<string[]>(
    row.retained_suppression_subject_refs_json,
  );
  return (
    sourceLineageIds
    && identityLineageIds
    && aliases
    && suppressionSubjectRefs
    && validSortedIds(sourceLineageIds, 1, 2_048)
    && validSortedIds(identityLineageIds, 1, 2_048)
    && validSortedIds(aliases, 0, 2_048)
    && validSortedIds(suppressionSubjectRefs, 0, 2_048)
  ) ? {
      sourceLineageIds,
      identityLineageIds,
      aliases,
      suppressionSubjectRefs,
    } : null;
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
    associationImpact: suggestion.associationImpact.map((impact) => ({ ...impact })),
    suppressionPreservationNotice: suggestion.suppressionPreservationNotice,
    proposedPartition: suggestion.proposedPartition ? {
      sourceId: suggestion.proposedPartition.sourceId,
      newIdentityId: suggestion.proposedPartition.newIdentityId,
      moveAssociationIds: [...suggestion.proposedPartition.moveAssociationIds],
    } : null,
  };
}

function freezeSuggestion(suggestion: IdentitySuggestion): IdentitySuggestion {
  return Object.freeze({
    id: suggestion.id,
    digest: suggestion.digest,
    ownerSubject: suggestion.ownerSubject,
    workspaceId: suggestion.workspaceId,
    kind: suggestion.kind,
    candidateIds: Object.freeze([...suggestion.candidateIds]),
    candidateRevisions: Object.freeze(
      Object.fromEntries(
        Object.entries(suggestion.candidateRevisions)
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    ),
    revision: suggestion.revision,
    sourceLineageIds: Object.freeze([...suggestion.sourceLineageIds]),
    retainedIdentityLineageIds: Object.freeze([
      ...suggestion.retainedIdentityLineageIds,
    ]),
    retainedAliases: Object.freeze([...suggestion.retainedAliases]),
    retainedSuppressionSubjectRefs: Object.freeze([
      ...suggestion.retainedSuppressionSubjectRefs,
    ]),
    associationImpact: Object.freeze(
      suggestion.associationImpact.map((impact) => Object.freeze({ ...impact })),
    ),
    suppressionPreservationNotice: suggestion.suppressionPreservationNotice,
    proposedPartition: suggestion.proposedPartition
      ? Object.freeze({
        sourceId: suggestion.proposedPartition.sourceId,
        newIdentityId: suggestion.proposedPartition.newIdentityId,
        moveAssociationIds: Object.freeze([
          ...suggestion.proposedPartition.moveAssociationIds,
        ]),
      })
      : null,
  });
}

function parseCanonicalJson<T>(value: string): T | null {
  try {
    const parsed = JSON.parse(value) as T;
    return canonical(parsed) === value ? parsed : null;
  } catch {
    return null;
  }
}

function validIds(
  values: readonly string[],
  minimum: number,
  maximum: number,
): boolean {
  return (
    Array.isArray(values)
    && values.length >= minimum
    && values.length <= maximum
    && values.every(validId)
    && new Set(values).size === values.length
  );
}

function validSortedIds(
  values: readonly string[],
  minimum: number,
  maximum: number,
): boolean {
  return (
    validIds(values, minimum, maximum)
    && canonical([...values].sort()) === canonical(values)
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Alias lineage keeps the domain's opaque-ID contract: names are input only to
 * a deterministic digest and are never retained as lineage identifiers. */
async function opaqueAliasReference(
  subjectKind: SubjectKind,
  subjectId: string,
  value: unknown,
): Promise<string | null> {
  const normalizedName = normalizedAliasName(value);
  if (!normalizedName || !validId(subjectId)) return null;
  const reference = `iar_${(await digest({
    schema: "identity-alias-reference/v1",
    subjectKind,
    subjectId,
    normalizedName,
  })).slice(0, 24)}`;
  return validId(reference) ? reference : null;
}

function normalizedAliasName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= 512 ? normalized : null;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function positiveSafe(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function positiveTime(value: number): number {
  if (!positiveSafe(value)) throw rejected();
  return value;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      (key) => `${JSON.stringify(key)}:${canonical(record[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(buffer),
    (part) => part.toString(16).padStart(2, "0"),
  ).join("");
}

function rejected(): Error {
  return new Error("identity_repository_rejected");
}
