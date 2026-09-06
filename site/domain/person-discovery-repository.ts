export type PersonDiscoveryScope = Readonly<{
  workspaceId: string;
  principalSubject: string;
}>;

export type ApprovedProspectAuthority = Readonly<{
  workspaceId: string;
  workspaceRevision: number;
  ownerSubject: string;
  companyId: string;
  prospectId: string;
  prospectRevision: number;
  profileId: string;
  configurationId: string;
  configurationDigest: string;
  configurationRevision: number;
}>;

export type DiscoveryProvenanceRecord = Readonly<{
  id: string;
  ordinal: number;
  sourceReference: string;
  excerpt: string;
  sourceDigest: string;
  excerptDigest: string;
  retrievedAt: number;
  provenanceDigest: string;
  payloadExpiresAt: number;
  redactedAt: number | null;
}>;

export type DiscoveryCandidateRecord = Readonly<{
  id: string;
  ordinal: number;
  candidateKey: string;
  displayName: string;
  roleTitle: string;
  roleSummary: string;
  candidateDigest: string;
  payloadExpiresAt: number;
  redactedAt: number | null;
  provenance: readonly DiscoveryProvenanceRecord[];
}>;

export type DiscoveryRunRecord = Readonly<{
  id: string;
  requestDigest: string;
  operationKey: string;
  status: "requested" | "completed" | "needs_reconciliation";
  resultDigest: string | null;
  reason: string | null;
  requestedDeadlineAt: number;
  candidates: readonly DiscoveryCandidateRecord[];
}>;

export type NewDiscoveryRun = Readonly<{
  id: string;
  eventId: string;
  authority: ApprovedProspectAuthority;
  maxCandidates: number;
  maxProvenancePerCandidate: number;
  idempotencyKey: string;
  operationKey: string;
  requestDigest: string;
  requestedDeadlineAt: number;
  createdAt: number;
}>;

export type DiscoveryDecisionRecord = Readonly<{
  id: string;
  runId: string;
  decision: "no_match" | "create_new" | "link_existing";
  candidateId: string | null;
  contactId: string | null;
  relevanceId: string | null;
  decisionDigest: string;
}>;

export type NewDiscoveryDecision = Readonly<{
  id: string;
  authorityCommandId: string;
  auditEventId: string;
  relevanceId: string | null;
  contactId: string | null;
  newContactIdentityDigest: string | null;
  scope: PersonDiscoveryScope;
  runId: string;
  candidateId: string | null;
  decision: "no_match" | "create_new" | "link_existing";
  expectedResultDigest: string;
  idempotencyKey: string;
  decisionDigest: string;
  relevanceDigest: string | null;
  createdAt: number;
}>;

export type RelevanceAuthority = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  prospectId: string;
  prospectRevision: number;
  contactId: string;
  contactRevision: number;
  relevanceId: string;
  decisionId: string;
  configurationId: string;
  configurationDigest: string;
  configurationRevision: number;
  configurationManifestJson: string;
}>;

export type VerificationIntentRecord = Readonly<{
  id: string;
  intent: "initial_verification" | "stale_refresh";
  intentDigest: string;
  sourceObservationId: string | null;
  channel: "email" | "phone";
  freshnessWindowMs: number;
  freshnessPolicyDigest: string;
}>;

export type RefreshObservation = Readonly<{ kind: "email" | "phone"; verificationClass: "mailbox_verified" | "source_verified"; verifiedAt: number }>;
export type ContactFreshnessPolicy = Readonly<{
  contactStrategyVersionId: string;
  contactStrategyDigest: string;
  mailboxVerifiedEmailFreshnessMs: number;
  sourceVerifiedEmailFreshnessMs: number;
  verifiedBusinessPhoneFreshnessMs: number;
  policyDigest: string;
}>;

export async function deriveContactFreshnessPolicy(manifestJson: string): Promise<ContactFreshnessPolicy | null> {
  let manifest: unknown;
  try { manifest = JSON.parse(manifestJson); } catch { return null; }
  if (!plainRecord(manifest) || !plainRecord(manifest.confirmedCategoryInputs)) return null;
  const inputs = manifest.confirmedCategoryInputs.contact_strategy;
  if (!Array.isArray(inputs) || inputs.length !== 1 || !plainRecord(inputs[0]) || !plainRecord(inputs[0].value)) return null;
  const versionId = typeof inputs[0].versionId === "string" ? inputs[0].versionId : inputs[0].id;
  if (!boundedText(versionId, 256) || !hexDigest(inputs[0].digest)) return null;
  const value = inputs[0].value;
  const keys = ["mailboxVerifiedEmailFreshnessMs", "sourceVerifiedEmailFreshnessMs", "verifiedBusinessPhoneFreshnessMs"];
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",") || !keys.every((key) => positivePolicyWindow(value[key]))) return null;
  const core = {
    contactStrategyVersionId: versionId,
    contactStrategyDigest: inputs[0].digest,
    mailboxVerifiedEmailFreshnessMs: Number(value.mailboxVerifiedEmailFreshnessMs),
    sourceVerifiedEmailFreshnessMs: Number(value.sourceVerifiedEmailFreshnessMs),
    verifiedBusinessPhoneFreshnessMs: Number(value.verifiedBusinessPhoneFreshnessMs),
  };
  return Object.freeze({ ...core, policyDigest: await canonicalDigest({ schema: "person-discovery-contact-freshness/v1", ...core }) });
}

export async function loadApprovedProspectAuthority(
  database: D1Database,
  scope: PersonDiscoveryScope,
  prospectId: string,
): Promise<ApprovedProspectAuthority | null> {
  const row = await database.prepare(`SELECT
      w.id workspace_id,w.revision workspace_revision,w.owner_subject,
      company.id company_id,p.id prospect_id,p.revision prospect_revision,p.profile_id,
      cfg.id configuration_id,cfg.digest configuration_digest,cfg.revision configuration_revision,cfg.manifest_json configuration_manifest_json
    FROM workspaces w
    JOIN workspace_companies wc ON wc.workspace_id=w.id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=w.id
    JOIN profile_prospects p ON p.workspace_id=w.id
    JOIN customer_profiles profile ON profile.id=p.profile_id AND profile.workspace_id=p.workspace_id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id AND product.lifecycle='ready' AND product.company_id=company.id
    JOIN typed_configurations cfg ON cfg.workspace_id=p.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=p.profile_id AND cfg.kind='profile_effective' AND cfg.active=1
    JOIN prospecting_candidates candidate ON candidate.id=p.candidate_id AND candidate.workspace_id=p.workspace_id AND candidate.profile_id=p.profile_id AND candidate.configuration_id=cfg.id AND candidate.status IN ('observed','qualified')
    JOIN qualification_assessments assessment ON assessment.id=p.assessment_id AND assessment.workspace_id=p.workspace_id AND assessment.candidate_id=candidate.id AND assessment.configuration_id=cfg.id AND assessment.configuration_digest=cfg.digest AND assessment.outcome='Passed'
    JOIN prospect_review_decisions review ON review.prospect_id=p.id AND review.workspace_id=p.workspace_id AND review.assessment_id=p.assessment_id AND review.decision='approve'
    WHERE w.id=? AND w.owner_subject=? AND company.status='active' AND p.id=? AND p.state='approved' AND p.active=1
    LIMIT 1`).bind(scope.workspaceId, scope.principalSubject, prospectId).first<AuthorityRow>();
  if (!row || !safeRevision(row.workspace_revision) || !safeRevision(row.prospect_revision) || !safeRevision(row.configuration_revision)) return null;
  return Object.freeze({
    workspaceId: row.workspace_id,
    workspaceRevision: Number(row.workspace_revision),
    ownerSubject: row.owner_subject,
    companyId: row.company_id,
    prospectId: row.prospect_id,
    prospectRevision: Number(row.prospect_revision),
    profileId: row.profile_id,
    configurationId: row.configuration_id,
    configurationDigest: row.configuration_digest,
    configurationRevision: Number(row.configuration_revision),
  });
}

export async function readDiscoveryRunByIdempotency(
  database: D1Database,
  scope: PersonDiscoveryScope,
  idempotencyKey: string,
): Promise<DiscoveryRunRecord | null> {
  const row = await database.prepare("SELECT id FROM person_discovery_runs WHERE workspace_id=? AND owner_subject=? AND idempotency_key=? LIMIT 1")
    .bind(scope.workspaceId, scope.principalSubject, idempotencyKey).first<{ id: string }>();
  return row ? readDiscoveryRun(database, scope, row.id) : null;
}

export async function readDiscoveryRunByRequestDigest(
  database: D1Database,
  scope: PersonDiscoveryScope,
  requestDigest: string,
  operationKey: string,
): Promise<DiscoveryRunRecord | null> {
  const row = await database.prepare("SELECT id FROM person_discovery_runs WHERE workspace_id=? AND owner_subject=? AND request_digest=? AND operation_key=? LIMIT 1")
    .bind(scope.workspaceId, scope.principalSubject, requestDigest, operationKey).first<{ id: string }>();
  return row ? readDiscoveryRun(database, scope, row.id) : null;
}

export async function readDiscoveryRun(
  database: D1Database,
  scope: PersonDiscoveryScope,
  runId: string,
): Promise<DiscoveryRunRecord | null> {
  const row = await database.prepare(`SELECT run.id,run.request_digest,run.operation_key,run.requested_deadline_at,event.state,event.result_digest,event.reason
    FROM person_discovery_runs run
    JOIN person_discovery_run_events event ON event.run_id=run.id AND event.durable_revision=(SELECT max(latest.durable_revision) FROM person_discovery_run_events latest WHERE latest.run_id=run.id)
    WHERE run.id=? AND run.workspace_id=? AND run.owner_subject=? LIMIT 1`).bind(runId, scope.workspaceId, scope.principalSubject).first<RunRow>();
  if (!row || !runState(row.state)) return null;
  const candidateRows = (await database.prepare(`SELECT id,ordinal,candidate_key,display_name,role_title,role_summary,candidate_digest,payload_expires_at,redacted_at
    FROM person_discovery_candidates WHERE workspace_id=? AND run_id=? ORDER BY ordinal,id`).bind(scope.workspaceId, runId).all<CandidateRow>()).results;
  const candidates: DiscoveryCandidateRecord[] = [];
  for (const candidate of candidateRows) {
    const provenanceRows = (await database.prepare(`SELECT id,ordinal,source_reference,excerpt,source_digest,excerpt_digest,retrieved_at,provenance_digest,payload_expires_at,redacted_at
      FROM person_discovery_provenance WHERE workspace_id=? AND run_id=? AND candidate_id=? ORDER BY ordinal,id`)
      .bind(scope.workspaceId, runId, candidate.id).all<ProvenanceRow>()).results;
    candidates.push(Object.freeze({
      id: candidate.id,
      ordinal: Number(candidate.ordinal),
      candidateKey: candidate.candidate_key,
      displayName: candidate.display_name,
      roleTitle: candidate.role_title,
      roleSummary: candidate.role_summary,
      candidateDigest: candidate.candidate_digest,
      payloadExpiresAt: Number(candidate.payload_expires_at),
      redactedAt: candidate.redacted_at === null ? null : Number(candidate.redacted_at),
      provenance: Object.freeze(provenanceRows.map((item) => Object.freeze({
        id: item.id,
        ordinal: Number(item.ordinal),
        sourceReference: item.source_reference,
        excerpt: item.excerpt,
        sourceDigest: item.source_digest,
        excerptDigest: item.excerpt_digest,
        retrievedAt: Number(item.retrieved_at),
        provenanceDigest: item.provenance_digest,
        payloadExpiresAt: Number(item.payload_expires_at),
        redactedAt: item.redacted_at === null ? null : Number(item.redacted_at),
      }))),
    }));
  }
  return Object.freeze({
    id: row.id,
    requestDigest: row.request_digest,
    operationKey: row.operation_key,
    status: row.state,
    resultDigest: row.result_digest,
    reason: row.reason,
    requestedDeadlineAt: Number(row.requested_deadline_at),
    candidates: Object.freeze(candidates),
  });
}

export async function isDiscoveryRunAuthorityCurrent(
  database: D1Database,
  scope: PersonDiscoveryScope,
  runId: string,
): Promise<boolean> {
  const run = await database.prepare(`SELECT prospect_id,workspace_revision,prospect_revision,configuration_id,configuration_digest,configuration_revision
    FROM person_discovery_runs WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1`)
    .bind(runId, scope.workspaceId, scope.principalSubject).first<RunAuthorityRow>();
  if (!run) return false;
  const current = await loadApprovedProspectAuthority(database, scope, run.prospect_id);
  return !!current
    && current.workspaceRevision === Number(run.workspace_revision)
    && current.prospectRevision === Number(run.prospect_revision)
    && current.configurationId === run.configuration_id
    && current.configurationDigest === run.configuration_digest
    && current.configurationRevision === Number(run.configuration_revision);
}

export async function createDiscoveryRun(database: D1Database, input: NewDiscoveryRun): Promise<DiscoveryRunRecord> {
  const a = input.authority;
  const result = await database.batch([
    database.prepare(`INSERT INTO person_discovery_runs
      (id,workspace_id,owner_subject,prospect_id,profile_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,workspace_revision,max_candidates,max_provenance_per_candidate,idempotency_key,operation_key,request_digest,requested_deadline_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        input.id, a.workspaceId, a.ownerSubject, a.prospectId, a.profileId, a.configurationId, a.configurationDigest,
        a.configurationRevision, a.prospectRevision, a.workspaceRevision, input.maxCandidates, input.maxProvenancePerCandidate,
        input.idempotencyKey, input.operationKey, input.requestDigest, input.requestedDeadlineAt, input.createdAt,
      ),
    database.prepare(`INSERT INTO person_discovery_run_events
      (id,workspace_id,run_id,durable_revision,state,candidate_count,result_digest,reason,created_at)
      VALUES (?,?,?,1,'requested',0,NULL,NULL,?)`).bind(input.eventId, a.workspaceId, input.id, input.createdAt),
  ]);
  if (result.length !== 2) throw new Error("person_discovery_run_commit_failed");
  const stored = await readDiscoveryRun(database, { workspaceId: a.workspaceId, principalSubject: a.ownerSubject }, input.id);
  if (!stored || stored.requestDigest !== input.requestDigest || stored.status !== "requested") throw new Error("person_discovery_run_acknowledgement_invalid");
  return stored;
}

export async function completeDiscoveryRun(
  database: D1Database,
  scope: PersonDiscoveryScope,
  runId: string,
  eventId: string,
  candidates: readonly DiscoveryCandidateRecord[],
  resultDigest: string,
  createdAt: number,
): Promise<DiscoveryRunRecord> {
  const statements: D1PreparedStatement[] = [];
  for (const candidate of candidates) {
    statements.push(database.prepare(`INSERT INTO person_discovery_candidates
      (id,workspace_id,run_id,prospect_id,ordinal,candidate_key,display_name,role_title,role_summary,candidate_digest,payload_expires_at,redacted_at,redaction_authority_command_id,redaction_audit_event_id,created_at)
      SELECT ?,workspace_id,id,prospect_id,?,?,?,?,?,?,?,NULL,NULL,NULL,? FROM person_discovery_runs WHERE id=? AND workspace_id=? AND owner_subject=?`)
      .bind(candidate.id, candidate.ordinal, candidate.candidateKey, candidate.displayName, candidate.roleTitle, candidate.roleSummary, candidate.candidateDigest, candidate.payloadExpiresAt, createdAt, runId, scope.workspaceId, scope.principalSubject));
    for (const provenance of candidate.provenance) {
      statements.push(database.prepare(`INSERT INTO person_discovery_provenance
        (id,workspace_id,run_id,candidate_id,ordinal,source_reference,excerpt,source_digest,excerpt_digest,retrieved_at,provenance_digest,payload_expires_at,redacted_at,redaction_authority_command_id,redaction_audit_event_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?)`).bind(
          provenance.id, scope.workspaceId, runId, candidate.id, provenance.ordinal, provenance.sourceReference, provenance.excerpt,
          provenance.sourceDigest, provenance.excerptDigest, provenance.retrievedAt, provenance.provenanceDigest, provenance.payloadExpiresAt, createdAt,
        ));
    }
  }
  statements.push(database.prepare(`INSERT INTO person_discovery_run_events
    (id,workspace_id,run_id,durable_revision,state,candidate_count,result_digest,reason,created_at)
    VALUES (?,?,?,2,'completed',?,?,NULL,?)`).bind(eventId, scope.workspaceId, runId, candidates.length, resultDigest, createdAt));
  const results = await database.batch(statements);
  if (results.length !== statements.length) throw new Error("person_discovery_result_commit_failed");
  const stored = await readDiscoveryRun(database, scope, runId);
  if (!stored || stored.status !== "completed" || stored.resultDigest !== resultDigest || stored.candidates.length !== candidates.length) throw new Error("person_discovery_result_acknowledgement_invalid");
  return stored;
}

export async function markDiscoveryNeedsReconciliation(
  database: D1Database,
  scope: PersonDiscoveryScope,
  runId: string,
  eventId: string,
  resultDigest: string,
  reason: "timeout" | "unknown_outcome",
  createdAt: number,
): Promise<DiscoveryRunRecord> {
  const result = await database.prepare(`INSERT INTO person_discovery_run_events
    (id,workspace_id,run_id,durable_revision,state,candidate_count,result_digest,reason,created_at)
    VALUES (?,?,?,2,'needs_reconciliation',0,?,?,?)`).bind(eventId, scope.workspaceId, runId, resultDigest, reason, createdAt).run();
  if (!result.success) throw new Error("person_discovery_reconciliation_commit_failed");
  const stored = await readDiscoveryRun(database, scope, runId);
  if (!stored || stored.status !== "needs_reconciliation" || stored.resultDigest !== resultDigest) throw new Error("person_discovery_reconciliation_acknowledgement_invalid");
  return stored;
}

export async function reconcileStaleRequestedRun(
  database: D1Database,
  scope: PersonDiscoveryScope,
  runId: string,
  requestDigest: string,
  eventId: string,
  resultDigest: string,
  createdAt: number,
): Promise<DiscoveryRunRecord | null> {
  try {
    await database.prepare(`INSERT INTO person_discovery_run_events
      (id,workspace_id,run_id,durable_revision,state,candidate_count,result_digest,reason,created_at)
      SELECT ?,run.workspace_id,run.id,2,'needs_reconciliation',0,?,'stale_requested',?
      FROM person_discovery_runs run
      JOIN person_discovery_run_events requested ON requested.run_id=run.id AND requested.durable_revision=1 AND requested.state='requested'
      WHERE run.id=? AND run.workspace_id=? AND run.owner_subject=? AND run.request_digest=? AND run.requested_deadline_at<=?
        AND NOT EXISTS (SELECT 1 FROM person_discovery_run_events terminal WHERE terminal.run_id=run.id AND terminal.durable_revision=2)`)
      .bind(eventId, resultDigest, createdAt, runId, scope.workspaceId, scope.principalSubject, requestDigest, createdAt).run();
  } catch (error) {
    const winner = await readDiscoveryRun(database, scope, runId);
    if (!winner || winner.status === "requested") throw error;
    return winner;
  }
  const stored = await readDiscoveryRun(database, scope, runId);
  return stored && stored.status !== "requested" ? stored : null;
}

export async function redactExpiredPersonDiscoveryPayloads(
  database: D1Database,
  scope: PersonDiscoveryScope,
  createdAt: number,
  idFactory: () => string,
): Promise<number> {
  const candidates = (await database.prepare(`SELECT id,candidate_digest FROM person_discovery_candidates
    WHERE workspace_id=? AND redacted_at IS NULL AND payload_expires_at<=? ORDER BY payload_expires_at,id LIMIT 100`)
    .bind(scope.workspaceId, createdAt).all<{ id: string; candidate_digest: string }>()).results;
  const provenance = (await database.prepare(`SELECT id,provenance_digest FROM person_discovery_provenance
    WHERE workspace_id=? AND redacted_at IS NULL AND payload_expires_at<=? ORDER BY payload_expires_at,id LIMIT 100`)
    .bind(scope.workspaceId, createdAt).all<{ id: string; provenance_digest: string }>()).results;
  let redacted = 0;
  for (const item of [
    ...candidates.map((row) => ({ kind: "candidate" as const, id: row.id, digest: row.candidate_digest })),
    ...provenance.map((row) => ({ kind: "provenance" as const, id: row.id, digest: row.provenance_digest })),
  ]) {
    const commandId = idFactory();
    const auditId = idFactory();
    const table = item.kind === "candidate" ? "person_discovery_candidates" : "person_discovery_provenance";
    const liveSubject = item.kind === "candidate"
      ? "EXISTS (SELECT 1 FROM person_discovery_candidates subject WHERE subject.id=? AND subject.workspace_id=? AND subject.redacted_at IS NULL AND subject.payload_expires_at<=?)"
      : "EXISTS (SELECT 1 FROM person_discovery_provenance subject WHERE subject.id=? AND subject.workspace_id=? AND subject.redacted_at IS NULL AND subject.payload_expires_at<=?)";
    const update = item.kind === "candidate"
      ? database.prepare(`UPDATE person_discovery_candidates SET candidate_key='redacted:'||id,display_name='[redacted]',role_title='[redacted]',role_summary='[redacted]',redacted_at=?,redaction_authority_command_id=?,redaction_audit_event_id=?
          WHERE id=? AND workspace_id=? AND redacted_at IS NULL AND payload_expires_at<=?`).bind(createdAt, commandId, auditId, item.id, scope.workspaceId, createdAt)
      : database.prepare(`UPDATE person_discovery_provenance SET source_reference='[redacted]',excerpt='[redacted]',redacted_at=?,redaction_authority_command_id=?,redaction_audit_event_id=?
          WHERE id=? AND workspace_id=? AND redacted_at IS NULL AND payload_expires_at<=?`).bind(createdAt, commandId, auditId, item.id, scope.workspaceId, createdAt);
    const results = await database.batch([
      database.prepare(`INSERT INTO authority_commands
        (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status)
        SELECT ?,?,?,?,1,'person_discovery.retention_redact',?,?,1,?,?, 'accepted'
        WHERE EXISTS (SELECT 1 FROM workspaces WHERE id=? AND owner_subject=?) AND ${liveSubject}`)
        .bind(commandId, scope.workspaceId, createdAt, createdAt, `redact:${item.digest}`, item.digest, table, item.id, scope.workspaceId, scope.principalSubject, item.id, scope.workspaceId, createdAt),
      database.prepare(`INSERT INTO audit_events
        (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at)
        SELECT ?,?,'system','person-discovery-retention','person_discovery.payload_redacted',?,?,?,?
        WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)`)
        .bind(auditId, scope.workspaceId, table, item.id, JSON.stringify({ payloadDigest: item.digest, reason: "retention_expired" }), createdAt, commandId, scope.workspaceId),
      update,
    ]);
    if (results.length !== 3) throw new Error("person_discovery_redaction_failed");
    if (Number(results[2]?.meta?.changes) < 1) {
      const winner = await database.prepare(`SELECT redacted_at FROM ${table} WHERE id=? AND workspace_id=?`).bind(item.id, scope.workspaceId).first<{ redacted_at: number | null }>();
      if (!winner?.redacted_at) throw new Error("person_discovery_redaction_failed");
    }
    redacted += 1;
  }
  return redacted;
}

export async function readDecisionByIdempotency(
  database: D1Database,
  scope: PersonDiscoveryScope,
  idempotencyKey: string,
): Promise<DiscoveryDecisionRecord | null> {
  const row = await database.prepare(`SELECT decision.id,decision.run_id,decision.decision,decision.candidate_id,decision.contact_id,decision.decision_digest,relevance.id relevance_id
    FROM person_discovery_owner_decisions decision
    JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id AND run.owner_subject=?
    LEFT JOIN prospect_contact_role_relevance relevance ON relevance.decision_id=decision.id AND relevance.workspace_id=decision.workspace_id
    WHERE decision.workspace_id=? AND decision.idempotency_key=? LIMIT 1`).bind(scope.principalSubject, scope.workspaceId, idempotencyKey).first<DecisionRow>();
  return row ? decisionRecord(row) : null;
}

export async function commitDiscoveryDecision(database: D1Database, input: NewDiscoveryDecision): Promise<DiscoveryDecisionRecord> {
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO authority_commands
      (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status)
      VALUES (?,?,?,?,1,'person_discovery.owner_decision',?,?,2,'person_discovery_run',?,'accepted')`)
      .bind(input.authorityCommandId, input.scope.workspaceId, input.createdAt, input.createdAt, input.idempotencyKey, input.decisionDigest, input.runId),
    database.prepare(`INSERT INTO audit_events
      (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at)
      VALUES (?,?,'owner',?,'person_discovery.owner_decided','person_discovery_owner_decision',?,?,?)`)
      .bind(input.auditEventId, input.scope.workspaceId, input.scope.principalSubject, input.id, JSON.stringify({ decisionDigest: input.decisionDigest, runId: input.runId }), input.createdAt),
  ];
  if (input.decision === "create_new") {
    if (!input.contactId || !input.newContactIdentityDigest || !input.candidateId) throw new Error("invalid_person_discovery_decision");
    statements.push(database.prepare(`INSERT INTO contacts
      (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name)
      SELECT ?,run.workspace_id,?,?,1,company.id,?,candidate.display_name
      FROM person_discovery_runs run
      JOIN workspace_companies wc ON wc.workspace_id=run.workspace_id
      JOIN companies company ON company.id=wc.company_id AND company.workspace_id=run.workspace_id
      JOIN person_discovery_candidates candidate ON candidate.id=? AND candidate.run_id=run.id AND candidate.workspace_id=run.workspace_id
      WHERE run.id=? AND run.workspace_id=? AND run.owner_subject=?`)
      .bind(input.contactId, input.createdAt, input.createdAt, input.newContactIdentityDigest, input.candidateId, input.runId, input.scope.workspaceId, input.scope.principalSubject));
  }
  statements.push(database.prepare(`INSERT INTO person_discovery_owner_decisions
    (id,workspace_id,run_id,candidate_id,decision,contact_id,owner_subject,expected_result_digest,idempotency_key,decision_digest,authority_command_id,audit_event_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      input.id, input.scope.workspaceId, input.runId, input.candidateId, input.decision, input.contactId,
      input.scope.principalSubject, input.expectedResultDigest, input.idempotencyKey, input.decisionDigest, input.authorityCommandId, input.auditEventId, input.createdAt,
    ));
  if (input.decision !== "no_match") {
    if (!input.relevanceId || !input.contactId || !input.candidateId) throw new Error("invalid_person_discovery_decision");
    statements.push(database.prepare(`INSERT INTO prospect_contact_role_relevance
      (id,workspace_id,prospect_id,contact_id,candidate_id,decision_id,role_title,role_summary,relevance_digest,created_at)
      SELECT ?,run.workspace_id,run.prospect_id,decision.contact_id,candidate.id,decision.id,candidate.role_title,candidate.role_summary,?,?
      FROM person_discovery_owner_decisions decision
      JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id
      JOIN person_discovery_candidates candidate ON candidate.id=decision.candidate_id AND candidate.run_id=run.id AND candidate.workspace_id=run.workspace_id
      WHERE decision.id=? AND decision.workspace_id=?`).bind(input.relevanceId, input.relevanceDigest, input.createdAt, input.id, input.scope.workspaceId));
  }
  const results = await database.batch(statements);
  if (results.length !== statements.length) throw new Error("person_discovery_decision_commit_failed");
  const stored = await readDecisionByIdempotency(database, input.scope, input.idempotencyKey);
  if (!stored || stored.decisionDigest !== input.decisionDigest) throw new Error("person_discovery_decision_acknowledgement_invalid");
  return stored;
}

export async function loadRelevanceAuthority(
  database: D1Database,
  scope: PersonDiscoveryScope,
  relevanceId: string,
): Promise<RelevanceAuthority | null> {
  const row = await database.prepare(`SELECT relevance.workspace_id,w.owner_subject,relevance.prospect_id,prospect.revision prospect_revision,
      relevance.contact_id,contact.revision contact_revision,relevance.id relevance_id,relevance.decision_id,
      cfg.id configuration_id,cfg.digest configuration_digest,cfg.revision configuration_revision,cfg.manifest_json configuration_manifest_json
    FROM prospect_contact_role_relevance relevance
    JOIN workspaces w ON w.id=relevance.workspace_id AND w.owner_subject=?
    JOIN person_discovery_owner_decisions decision ON decision.id=relevance.decision_id AND decision.workspace_id=relevance.workspace_id
    JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id
    JOIN profile_prospects prospect ON prospect.id=relevance.prospect_id AND prospect.workspace_id=relevance.workspace_id AND prospect.active=1 AND prospect.state='approved'
    JOIN customer_profiles profile ON profile.id=prospect.profile_id AND profile.workspace_id=prospect.workspace_id AND profile.lifecycle='ready'
    JOIN market_plays play ON play.id=profile.play_id AND play.workspace_id=profile.workspace_id AND play.lifecycle='active'
    JOIN products product ON product.id=play.product_id AND product.workspace_id=play.workspace_id AND product.lifecycle='ready'
    JOIN workspace_companies wc ON wc.workspace_id=relevance.workspace_id
    JOIN companies company ON company.id=wc.company_id AND company.workspace_id=relevance.workspace_id AND company.status='active' AND product.company_id=company.id
    JOIN contacts contact ON contact.id=relevance.contact_id AND contact.workspace_id=relevance.workspace_id
    JOIN typed_configurations cfg ON cfg.workspace_id=relevance.workspace_id AND cfg.owner_type='profile' AND cfg.owner_id=prospect.profile_id AND cfg.kind='profile_effective' AND cfg.active=1
    WHERE relevance.id=? AND relevance.workspace_id=?
      AND w.revision=run.workspace_revision AND prospect.revision=run.prospect_revision
      AND cfg.id=run.configuration_id AND cfg.digest=run.configuration_digest AND cfg.revision=run.configuration_revision
    LIMIT 1`).bind(scope.principalSubject, relevanceId, scope.workspaceId).first<RelevanceRow>();
  if (!row) return null;
  return Object.freeze({
    workspaceId: row.workspace_id,
    ownerSubject: row.owner_subject,
    prospectId: row.prospect_id,
    prospectRevision: Number(row.prospect_revision),
    contactId: row.contact_id,
    contactRevision: Number(row.contact_revision),
    relevanceId: row.relevance_id,
    decisionId: row.decision_id,
    configurationId: row.configuration_id,
    configurationDigest: row.configuration_digest,
    configurationRevision: Number(row.configuration_revision),
    configurationManifestJson: row.configuration_manifest_json,
  });
}

export async function readVerificationIntentByIdempotency(
  database: D1Database,
  scope: PersonDiscoveryScope,
  idempotencyKey: string,
): Promise<VerificationIntentRecord | null> {
  const row = await database.prepare("SELECT id,intent,intent_digest,source_observation_id,channel,freshness_window_ms,freshness_policy_digest FROM contact_verification_intents WHERE workspace_id=? AND owner_subject=? AND idempotency_key=? LIMIT 1")
    .bind(scope.workspaceId, scope.principalSubject, idempotencyKey).first<IntentRow>();
  return row ? Object.freeze({ id: row.id, intent: row.intent, intentDigest: row.intent_digest, sourceObservationId: row.source_observation_id, channel: row.channel, freshnessWindowMs: Number(row.freshness_window_ms), freshnessPolicyDigest: row.freshness_policy_digest }) : null;
}

export async function loadRefreshObservation(
  database: D1Database,
  authority: RelevanceAuthority,
  observationId: string,
): Promise<RefreshObservation | null> {
  const row = await database.prepare(`SELECT kind,verification_class,verified_at FROM contact_point_observations
    WHERE id=? AND workspace_id=? AND contact_id=? AND configuration_id=? AND configuration_digest=? AND verified_at IS NOT NULL
      AND verification_class IN ('mailbox_verified','source_verified') LIMIT 1`)
    .bind(observationId, authority.workspaceId, authority.contactId, authority.configurationId, authority.configurationDigest)
    .first<{ kind: string; verification_class: string; verified_at: number }>();
  return row && (row.kind === "email" || row.kind === "phone") && (row.verification_class === "mailbox_verified" || row.verification_class === "source_verified")
    ? Object.freeze({ kind: row.kind, verificationClass: row.verification_class, verifiedAt: Number(row.verified_at) })
    : null;
}

export async function hasNewerTrustedFreshObservation(
  database: D1Database,
  authority: RelevanceAuthority,
  nominatedObservationId: string,
  channel: "email" | "phone",
  now: number,
  policy: ContactFreshnessPolicy,
): Promise<boolean> {
  const rows = (await database.prepare(`SELECT verification_class,verified_at FROM contact_point_observations
    WHERE workspace_id=? AND contact_id=? AND configuration_id=? AND configuration_digest=? AND kind=?
      AND verification_class IN ('mailbox_verified','source_verified') AND verified_at IS NOT NULL
      AND verified_at>(SELECT verified_at FROM contact_point_observations WHERE id=? AND workspace_id=? AND contact_id=?)`)
    .bind(authority.workspaceId, authority.contactId, authority.configurationId, authority.configurationDigest, channel, nominatedObservationId, authority.workspaceId, authority.contactId)
    .all<{ verification_class: "mailbox_verified" | "source_verified"; verified_at: number }>()).results;
  return rows.some((row) => now < Number(row.verified_at) + freshnessWindow(policy, channel, row.verification_class));
}

export async function commitVerificationIntent(
  database: D1Database,
  authority: RelevanceAuthority,
  input: Readonly<{ id: string; authorityCommandId: string; auditEventId: string; intent: "initial_verification" | "stale_refresh"; channel: "email" | "phone"; sourceObservationId: string | null; freshnessWindowMs: number; freshnessPolicyDigest: string; idempotencyKey: string; intentDigest: string; createdAt: number }>,
): Promise<VerificationIntentRecord> {
  const policy = await deriveContactFreshnessPolicy(authority.configurationManifestJson);
  if (!policy || input.freshnessPolicyDigest !== policy.policyDigest) throw new Error("invalid_contact_verification_policy");
  const observation = input.intent === "stale_refresh" && input.sourceObservationId
    ? await loadRefreshObservation(database, authority, input.sourceObservationId)
    : null;
  const expectedWindow = observation
    ? freshnessWindow(policy, input.channel, observation.verificationClass)
    : freshnessWindow(policy, input.channel, "mailbox_verified");
  if (input.freshnessWindowMs !== expectedWindow) throw new Error("invalid_contact_verification_policy");
  const expectedIntentDigest = await canonicalDigest({
    schema: "contact-verification-intent/v1",
    workspaceId: authority.workspaceId,
    principalSubject: authority.ownerSubject,
    relevanceId: authority.relevanceId,
    intent: input.intent,
    channel: input.channel,
    sourceObservationId: input.sourceObservationId,
    expectedProspectRevision: authority.prospectRevision,
    expectedContactRevision: authority.contactRevision,
    expectedConfigurationId: authority.configurationId,
    expectedConfigurationDigest: authority.configurationDigest,
    expectedConfigurationRevision: authority.configurationRevision,
    freshnessWindowMs: input.freshnessWindowMs,
    freshnessPolicyDigest: input.freshnessPolicyDigest,
  });
  if (input.intentDigest !== expectedIntentDigest) throw new Error("invalid_contact_verification_intent_digest");
  const result = await database.batch([
    database.prepare(`INSERT INTO authority_commands
      (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status)
      VALUES (?,?,?,?,1,'person_discovery.verification_intent',?,?,1,'prospect_contact_role_relevance',?,'accepted')`)
      .bind(input.authorityCommandId, authority.workspaceId, input.createdAt, input.createdAt, input.idempotencyKey, input.intentDigest, authority.relevanceId),
    database.prepare(`INSERT INTO audit_events
      (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at)
      VALUES (?,?,'owner',?,'person_discovery.verification_intent','contact_verification_intent',?,?,?)`)
      .bind(input.auditEventId, authority.workspaceId, authority.ownerSubject, input.id, JSON.stringify({ intentDigest: input.intentDigest, relevanceId: authority.relevanceId, channel: input.channel, freshnessWindowMs: input.freshnessWindowMs, freshnessPolicyDigest: input.freshnessPolicyDigest }), input.createdAt),
    database.prepare(`INSERT INTO contact_verification_intents
      (id,workspace_id,prospect_id,contact_id,relevance_id,decision_id,intent,channel,source_observation_id,configuration_id,configuration_digest,configuration_revision,prospect_revision,contact_revision,freshness_window_ms,freshness_policy_digest,owner_subject,idempotency_key,intent_digest,authority_command_id,audit_event_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        input.id, authority.workspaceId, authority.prospectId, authority.contactId, authority.relevanceId, authority.decisionId,
        input.intent, input.channel, input.sourceObservationId, authority.configurationId, authority.configurationDigest, authority.configurationRevision,
        authority.prospectRevision, authority.contactRevision, input.freshnessWindowMs, input.freshnessPolicyDigest, authority.ownerSubject,
        input.idempotencyKey, input.intentDigest, input.authorityCommandId, input.auditEventId, input.createdAt,
      ),
  ]);
  if (result.length !== 3) throw new Error("contact_verification_intent_commit_failed");
  const stored = await readVerificationIntentByIdempotency(database, { workspaceId: authority.workspaceId, principalSubject: authority.ownerSubject }, input.idempotencyKey);
  if (!stored || stored.intentDigest !== input.intentDigest) throw new Error("contact_verification_intent_acknowledgement_invalid");
  return stored;
}

type AuthorityRow = { workspace_id: string; workspace_revision: number; owner_subject: string; company_id: string; prospect_id: string; prospect_revision: number; profile_id: string; configuration_id: string; configuration_digest: string; configuration_revision: number };
type RunRow = { id: string; request_digest: string; operation_key: string; requested_deadline_at: number; state: string; result_digest: string | null; reason: string | null };
type RunAuthorityRow = { prospect_id: string; workspace_revision: number; prospect_revision: number; configuration_id: string; configuration_digest: string; configuration_revision: number };
type CandidateRow = { id: string; ordinal: number; candidate_key: string; display_name: string; role_title: string; role_summary: string; candidate_digest: string; payload_expires_at: number; redacted_at: number | null };
type ProvenanceRow = { id: string; ordinal: number; source_reference: string; excerpt: string; source_digest: string; excerpt_digest: string; retrieved_at: number; provenance_digest: string; payload_expires_at: number; redacted_at: number | null };
type DecisionRow = { id: string; run_id: string; decision: "no_match" | "create_new" | "link_existing"; candidate_id: string | null; contact_id: string | null; decision_digest: string; relevance_id: string | null };
type RelevanceRow = { workspace_id: string; owner_subject: string; prospect_id: string; prospect_revision: number; contact_id: string; contact_revision: number; relevance_id: string; decision_id: string; configuration_id: string; configuration_digest: string; configuration_revision: number; configuration_manifest_json: string };
type IntentRow = { id: string; intent: "initial_verification" | "stale_refresh"; intent_digest: string; source_observation_id: string | null; channel: "email" | "phone"; freshness_window_ms: number; freshness_policy_digest: string };

function decisionRecord(row: DecisionRow): DiscoveryDecisionRecord {
  return Object.freeze({ id: row.id, runId: row.run_id, decision: row.decision, candidateId: row.candidate_id, contactId: row.contact_id, relevanceId: row.relevance_id, decisionDigest: row.decision_digest });
}
function safeRevision(value: unknown): boolean { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function runState(value: string): value is DiscoveryRunRecord["status"] { return value === "requested" || value === "completed" || value === "needs_reconciliation"; }
function plainRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function boundedText(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim(); }
function hexDigest(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value); }
function positivePolicyWindow(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 366 * 24 * 60 * 60 * 1000; }
function freshnessWindow(policy: ContactFreshnessPolicy, channel: "email" | "phone", verificationClass: "mailbox_verified" | "source_verified"): number {
  if (channel === "phone") return policy.verifiedBusinessPhoneFreshnessMs;
  return verificationClass === "mailbox_verified" ? policy.mailboxVerifiedEmailFreshnessMs : policy.sourceVerifiedEmailFreshnessMs;
}
import { canonicalDigest } from "./enrichment-grant-issuance";
