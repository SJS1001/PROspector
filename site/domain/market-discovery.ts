import { v7 } from "uuid";

import type { InterviewPrincipal } from "./interview";
import { readProductReadiness } from "./product-readiness";
import {
  normalizeDiscoverySubmission,
  PRIVATE_SYNTHETIC_PROOF_CAPABILITY,
  PRIVATE_SYNTHETIC_PROOF_FINDINGS,
  PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST,
  PRIVATE_SYNTHETIC_PROOF_FIXTURE_PROVENANCE,
  PRIVATE_SYNTHETIC_PROOF_MIGRATION_DIGEST,
  PRIVATE_SYNTHETIC_PROOF_REVIEWED_SOURCE_REVISION,
  type NormalizedDiscoveryFinding,
  type NormalizedDiscoverySubmission,
} from "./discovery-submission";

const DAY = 24 * 60 * 60 * 1_000;

export class MarketDiscoveryConflictError extends Error {
  readonly code = "market_discovery_conflict";
}

type StartInput = {
  productId: string;
  expectedProductRevision: number;
  triggerKind: "monthly" | "manual" | "material_change";
  sourceEventId?: string;
  startedAt?: number;
  idempotencyKey: string;
};

type SubmissionInput = {
  runId: string;
  expectedRunRevision: number;
  productId: string;
  configurationId: string;
  configurationDigest: string;
  provenance: unknown;
  status: "complete" | "partial";
  findings: unknown[];
  idempotencyKey: string;
};

type DecisionInput = {
  proposalId: string;
  expectedProposalRevision: number;
  expectedProposalDigest: string;
  decision: "explore" | "defer" | "dismiss";
  reason?: string;
  reviewAt?: number;
  confirmed?: boolean;
  idempotencyKey: string;
};

type CorrectionInput = {
  proposalId: string;
  expectedProposalRevision: number;
  expectedProposalDigest: string;
  operation: "split" | "merge";
  correctedIdentity?: { marketCategory: string; audience: string; problemFamily: string };
  mergeIntoProposalId?: string;
  reason: string;
  idempotencyKey: string;
};

type PrivateProofInput = {
  productId: string;
  expectedProductRevision: number;
  idempotencyKey: string;
};

type Workspace = { id: string };
type Product = { id: string; revision: number; lifecycle: string };
type Configuration = { id: string; digest: string; manifest_json: string; revision: number };
type RunRow = {
  id: string;
  workspace_id: string;
  product_id: string;
  configuration_id: string;
  configuration_digest: string;
  trigger_kind: string;
  trigger_key: string;
  source_event_id: string | null;
  started_at: number;
  window_lower_exclusive: number | null;
  window_upper_inclusive: number;
  last_successful_watermark: number | null;
  successful_watermark: number | null;
  manifest_json: string;
  manifest_digest: string;
  policy_snapshot_json: string;
  policy_snapshot_digest: string;
  execution_state: string;
  revision: number;
  completed_at: number | null;
};
type ProposalRow = {
  id: string;
  workspace_id: string;
  product_id: string;
  run_id: string;
  fingerprint: string;
  current_version_id: string;
  status: string;
  revision: number;
  active: number;
  cooldown_until: number | null;
};
type VersionRow = {
  id: string;
  proposal_id: string;
  run_id: string;
  submission_id: string;
  version: number;
  proposal_json: string;
  proposal_digest: string;
  material_evidence_fingerprint: string;
  predecessor_version_id: string | null;
  relationship: string;
  created_at: number;
};
type PrivateProofAuthorizationRow = {
  id: string;
  workspace_id: string;
  owner_subject_id: string;
  product_id: string;
  expected_product_revision: number;
  interview_confirmation_id: string;
  confirmed_knowledge_version_id: string;
  reviewed_source_revision: string;
  migration_digest: string;
  fixture_digest: string;
  fixture_provenance: string;
  evidence_reference: string;
  capability: string;
  authorization_digest: string;
  expires_at: number;
  created_at: number;
};

export async function startProductDiscoveryRun(
  database: D1Database,
  principal: InterviewPrincipal,
  input: StartInput,
) {
  validateKey(input.idempotencyKey);
  if (!["monthly", "manual", "material_change"].includes(input.triggerKind)) throw conflict("Unsupported discovery trigger");
  if (input.triggerKind === "material_change" && !bounded(input.sourceEventId, 256)) {
    throw conflict("Material-change discovery requires a confirmed source event");
  }
  const workspace = await ownedWorkspace(database, principal);
  const operationDigest = await digestFor({
    action: "discovery.start",
    workspaceId: workspace.id,
    productId: input.productId,
    expectedProductRevision: input.expectedProductRevision,
    triggerKind: input.triggerKind,
    sourceEventId: input.sourceEventId ?? null,
    requestedStartedAt: input.startedAt ?? null,
    idempotencyKey: input.idempotencyKey,
  });
  const prior = await submissionOrRunForKey(database, workspace.id, "run", input.idempotencyKey);
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw conflict("Idempotency key was reused for another discovery operation");
    return readProductDiscoveryRun(database, principal, prior.id);
  }
  const authority = await productAuthority(database, principal, input.productId, workspace);
  if (authority.product.lifecycle !== "ready") throw conflict(`Product is ${authority.product.lifecycle}, not Ready`);
  if (Number(authority.product.revision) !== Number(input.expectedProductRevision)) throw conflict("Stale Product revision");
  const startedAt = input.startedAt ?? Date.now();
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0) throw conflict("Discovery start time is invalid");
  const schedule = await database.prepare(
    "SELECT last_successful_watermark FROM product_discovery_schedules WHERE workspace_id = ? AND product_id = ? AND active = 1 LIMIT 1",
  ).bind(authority.workspace.id, authority.product.id).first<{ last_successful_watermark: number | null }>();
  const lastSuccessfulWatermark = schedule?.last_successful_watermark ?? null;
  const triggerKey = triggerIdentity(input.triggerKind, authority.product.id, authority.configuration.id, startedAt);
  const manifest = parseObject(authority.configuration.manifest_json, "Product Discovery Configuration manifest");
  const policies = policySnapshot(manifest);
  const manifestJson = canonicalJson(manifest);
  const policySnapshotJson = canonicalJson(policies);
  const runId = v7();
  const eventId = v7();
  const now = Date.now();
  const manifestDigest = await sha256(manifestJson);
  const policyDigest = await sha256(policySnapshotJson);
  const eventJson = canonicalJson({ type: "created", triggerKey, executionState: "blocked_missing_capability" });
  try {
    await database.batch([
      database.prepare(
        `INSERT INTO product_discovery_runs
         (id, workspace_id, created_at, updated_at, revision, product_id, configuration_id, configuration_digest,
          trigger_kind, trigger_key, source_event_id, started_at, window_lower_exclusive, window_upper_inclusive,
          last_successful_watermark, successful_watermark, manifest_json, manifest_digest, policy_snapshot_json,
          policy_snapshot_digest, execution_state, operation_digest, idempotency_key, completed_at)
         SELECT ?, ?, ?, ?, 1, p.id, c.id, c.digest, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?,
                'blocked_missing_capability', ?, ?, NULL
         FROM products p JOIN typed_configurations c
           ON c.workspace_id = p.workspace_id AND c.owner_type = 'product' AND c.owner_id = p.id
          AND c.kind = 'product_discovery' AND c.active = 1
         WHERE p.id = ? AND p.workspace_id = ? AND p.lifecycle = 'ready' AND p.revision = ?
           AND c.id = ? AND c.digest = ?`,
      ).bind(
        runId,
        authority.workspace.id,
        now,
        now,
        input.triggerKind,
        triggerKey,
        input.sourceEventId ?? null,
        startedAt,
        lastSuccessfulWatermark === null ? null : lastSuccessfulWatermark - DAY,
        startedAt,
        lastSuccessfulWatermark,
        manifestJson,
        manifestDigest,
        policySnapshotJson,
        policyDigest,
        operationDigest,
        input.idempotencyKey,
        authority.product.id,
        authority.workspace.id,
        input.expectedProductRevision,
        authority.configuration.id,
        authority.configuration.digest,
      ),
      database.prepare(
        `INSERT INTO product_discovery_run_events
         (id, workspace_id, run_id, event_type, event_json, event_digest, operation_digest, created_at)
         SELECT ?, ?, ?, 'created', ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM product_discovery_runs WHERE id = ? AND workspace_id = ?)`,
      ).bind(eventId, authority.workspace.id, runId, eventJson, await sha256(eventJson), await digestFor({ operationDigest, event: "created" }), now, runId, authority.workspace.id),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
  }
  const winner = await submissionOrRunForKey(database, authority.workspace.id, "run", input.idempotencyKey);
  if (!winner || winner.operation_digest !== operationDigest) throw conflict("Discovery run conflicted with another operation");
  return readProductDiscoveryRun(database, principal, winner.id);
}

export async function readProductDiscoveryRun(
  database: D1Database,
  principal: InterviewPrincipal,
  runId: string,
) {
  const workspace = await ownedWorkspace(database, principal);
  const row = await database.prepare(
    "SELECT * FROM product_discovery_runs WHERE id = ? AND workspace_id = ? LIMIT 1",
  ).bind(runId, workspace.id).first<RunRow>();
  if (!row) throw conflict("Discovery run is unavailable in this workspace");
  return runProjection(row);
}

export async function readMarketDiscoveryState(
  database: D1Database,
  principal: InterviewPrincipal,
  productId: string,
) {
  const workspace = await ownedWorkspace(database, principal);
  const readiness = await readProductReadiness(database, principal, productId);
  const latestRun = await database.prepare(
    "SELECT * FROM product_discovery_runs WHERE workspace_id = ? AND product_id = ? ORDER BY started_at DESC, id DESC LIMIT 1",
  ).bind(workspace.id, productId).first<RunRow>();
  const proposalRows = await database.prepare(
    `SELECT * FROM market_play_proposals
     WHERE workspace_id = ? AND product_id = ? AND active = 1 AND surfaced = 1
     ORDER BY updated_at DESC, rank ASC, id ASC LIMIT 3`,
  ).bind(workspace.id, productId).all<ProposalRow>();
  const proposals = await Promise.all(proposalRows.results.map(async (proposal) => {
    const projection = await proposalByRow(database, proposal);
    const decisions = await proposalDecisionHistory(database, workspace.id, proposal.id);
    return {
      ...projection,
      cooldown: proposal.cooldown_until === null ? null : { until: Number(proposal.cooldown_until) },
      decisions,
      run: { id: proposal.run_id },
    };
  }));
  const authorization = await latestPrivateProofAuthorization(database, workspace.id, productId);
  const consumption = authorization
    ? await database.prepare(
      "SELECT result_json, operation_digest, consumed_at FROM private_synthetic_proof_consumptions WHERE authorization_id = ? LIMIT 1",
    ).bind(authorization.id).first<{ result_json: string; operation_digest: string; consumed_at: number }>()
    : null;
  return {
    authority: "known" as const,
    readiness,
    latestRun: latestRun ? runProjection(latestRun) : null,
    proposals,
    privateProof: authorization
      ? {
          capability: authorization.capability,
          authorizationId: authorization.id,
          evidenceReference: authorization.evidence_reference,
          expiresAt: Number(authorization.expires_at),
          consumed: Boolean(consumption),
          consumedAt: consumption ? Number(consumption.consumed_at) : null,
        }
      : { capability: PRIVATE_SYNTHETIC_PROOF_CAPABILITY, authorizationId: null, evidenceReference: null, expiresAt: null, consumed: false, consumedAt: null },
  };
}

export async function activatePrivateSyntheticProofAuthorization(
  database: D1Database,
  principal: InterviewPrincipal,
  input: PrivateProofInput,
) {
  validateKey(input.idempotencyKey);
  const workspace = await ownedWorkspace(database, principal);
  const product = await database.prepare(
    "SELECT id, revision, lifecycle FROM products WHERE id = ? AND workspace_id = ? LIMIT 1",
  ).bind(input.productId, workspace.id).first<Product>();
  if (!product || product.lifecycle !== "ready") throw conflict("Ready Product authority is required");
  if (Number(product.revision) !== Number(input.expectedProductRevision)) throw conflict("Stale Product revision");
  const confirmation = await database.prepare(
    `SELECT c.id AS confirmation_id, v.id AS version_id, v.value_json
     FROM interview_confirmations c
     JOIN knowledge_versions v ON v.id = c.knowledge_version_id AND v.workspace_id = c.workspace_id
     WHERE c.workspace_id = ? AND c.decision = 'accept'
       AND v.scope_type = 'product' AND v.scope_id = ? AND v.status = 'confirmed'
       AND v.kind = ?
     ORDER BY c.created_at DESC, c.id DESC LIMIT 1`,
  ).bind(workspace.id, product.id, PRIVATE_SYNTHETIC_PROOF_CAPABILITY).first<{
    confirmation_id: string;
    version_id: string;
    value_json: string;
  }>();
  if (!confirmation) throw conflict("Explicit confirmed private synthetic-proof authority is unavailable");
  const now = Date.now();
  const confirmed = validatePrivateProofConfirmation(confirmation.value_json, product, now);
  const authorizationDigest = await digestFor({
    action: "private_synthetic_proof.authorize",
    workspaceId: workspace.id,
    ownerSubjectId: principal.subject,
    productId: product.id,
    expectedProductRevision: input.expectedProductRevision,
    interviewConfirmationId: confirmation.confirmation_id,
    confirmedKnowledgeVersionId: confirmation.version_id,
    ...confirmed,
    idempotencyKey: input.idempotencyKey,
  });
  const existing = await database.prepare(
    "SELECT * FROM private_synthetic_proof_authorizations WHERE workspace_id = ? AND evidence_reference = ? LIMIT 1",
  ).bind(workspace.id, confirmed.evidenceReference).first<PrivateProofAuthorizationRow>();
  if (existing) {
    if (existing.authorization_digest !== authorizationDigest) throw conflict("Private synthetic-proof authorization already exists for another operation");
    return privateProofAuthorizationProjection(existing);
  }
  const authorizationId = v7();
  const auditId = v7();
  const auditDetail = canonicalJson({
    authorizationId,
    productId: product.id,
    expectedProductRevision: input.expectedProductRevision,
    capability: PRIVATE_SYNTHETIC_PROOF_CAPABILITY,
    evidenceReference: confirmed.evidenceReference,
    expiresAt: confirmed.expiresAt,
    authorizationDigest,
  });
  try {
    await database.batch([
      database.prepare(
        `INSERT INTO private_synthetic_proof_authorizations
         (id, workspace_id, owner_subject_id, product_id, expected_product_revision, interview_confirmation_id,
          confirmed_knowledge_version_id, reviewed_source_revision, migration_digest, fixture_digest,
          fixture_provenance, evidence_reference, capability, authorization_digest, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        authorizationId,
        workspace.id,
        principal.subject,
        product.id,
        input.expectedProductRevision,
        confirmation.confirmation_id,
        confirmation.version_id,
        PRIVATE_SYNTHETIC_PROOF_REVIEWED_SOURCE_REVISION,
        PRIVATE_SYNTHETIC_PROOF_MIGRATION_DIGEST,
        PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST,
        PRIVATE_SYNTHETIC_PROOF_FIXTURE_PROVENANCE,
        confirmed.evidenceReference,
        PRIVATE_SYNTHETIC_PROOF_CAPABILITY,
        authorizationDigest,
        confirmed.expiresAt,
        now,
      ),
      database.prepare(
        `INSERT INTO audit_events
         (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
         SELECT ?, ?, 'owner', ?, 'private_synthetic_proof.authorized', 'product', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM private_synthetic_proof_authorizations WHERE id = ? AND workspace_id = ?)`,
      ).bind(auditId, workspace.id, principal.subject, product.id, auditDetail, now, authorizationId, workspace.id),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
  }
  const winner = await database.prepare(
    "SELECT * FROM private_synthetic_proof_authorizations WHERE workspace_id = ? AND evidence_reference = ? LIMIT 1",
  ).bind(workspace.id, confirmed.evidenceReference).first<PrivateProofAuthorizationRow>();
  if (!winner || winner.authorization_digest !== authorizationDigest) throw conflict("Private synthetic-proof authorization conflicted");
  return privateProofAuthorizationProjection(winner);
}

export async function submitPrivateSyntheticProof(
  database: D1Database,
  principal: InterviewPrincipal,
  input: PrivateProofInput,
) {
  validateKey(input.idempotencyKey);
  const workspace = await ownedWorkspace(database, principal);
  const product = await database.prepare(
    "SELECT id, revision, lifecycle FROM products WHERE id = ? AND workspace_id = ? LIMIT 1",
  ).bind(input.productId, workspace.id).first<Product>();
  if (!product || product.lifecycle !== "ready") throw conflict("Ready Product authority is required");
  if (Number(product.revision) !== Number(input.expectedProductRevision)) throw conflict("Stale Product revision");
  const authorization = await latestPrivateProofAuthorization(database, workspace.id, product.id);
  if (!authorization) throw conflict("Private synthetic-proof authorization is absent");
  validatePrivateProofAuthorization(authorization, principal, product, Date.now());
  const run = await database.prepare(
    `SELECT * FROM product_discovery_runs
     WHERE workspace_id = ? AND product_id = ? AND configuration_id IN (
       SELECT id FROM typed_configurations
       WHERE workspace_id = ? AND owner_type = 'product' AND owner_id = ? AND kind = 'product_discovery' AND active = 1
     )
     ORDER BY started_at DESC, id DESC LIMIT 1`,
  ).bind(workspace.id, product.id, workspace.id, product.id).first<RunRow>();
  if (!run) throw conflict("Pinned Product discovery run is unavailable");
  const normalized = normalizeDiscoverySubmission({
    productId: product.id,
    runId: run.id,
    configurationId: run.configuration_id,
    provenance: {
      kind: "synthetic_private_proof",
      fixtureDigest: PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST,
      sourceRevision: PRIVATE_SYNTHETIC_PROOF_REVIEWED_SOURCE_REVISION,
      nonNetwork: true,
    },
    status: "complete",
    findings: PRIVATE_SYNTHETIC_PROOF_FINDINGS,
  });
  if (await digestFor(normalized.findings) !== PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST) {
    throw conflict("Repository synthetic fixture digest is invalid");
  }
  const operationDigest = await digestFor({
    action: "discovery.submit",
    workspaceId: workspace.id,
    normalized,
    idempotencyKey: input.idempotencyKey,
  });
  const priorConsumption = await database.prepare(
    "SELECT operation_digest, result_json FROM private_synthetic_proof_consumptions WHERE authorization_id = ? LIMIT 1",
  ).bind(authorization.id).first<{ operation_digest: string; result_json: string }>();
  if (priorConsumption) {
    if (priorConsumption.operation_digest !== operationDigest) throw conflict("Private synthetic-proof authorization is already consumed");
    return JSON.parse(priorConsumption.result_json);
  }
  if (Number(run.revision) < 1 || !["blocked_missing_capability", "queued", "running"].includes(run.execution_state)) {
    throw conflict(`Discovery run is already ${run.execution_state}`);
  }
  const priorSubmission = await submissionOrRunForKey(database, workspace.id, "submission", input.idempotencyKey);
  if (priorSubmission) throw conflict("Submission idempotency key is unavailable for private proof");
  return commitSuccessfulSubmission(
    database,
    workspace,
    principal,
    run,
    normalized,
    input.idempotencyKey,
    operationDigest,
    authorization,
  );
}

export async function submitDiscoveryFindings(
  database: D1Database,
  principal: InterviewPrincipal,
  input: SubmissionInput,
) {
  validateKey(input.idempotencyKey);
  const workspace = await ownedWorkspace(database, principal);
  const normalized = normalizeDiscoverySubmission({
    productId: input.productId,
    runId: input.runId,
    configurationId: input.configurationId,
    provenance: input.provenance,
    status: input.status,
    findings: input.findings,
  });
  const operationDigest = await digestFor({ action: "discovery.submit", workspaceId: workspace.id, normalized, idempotencyKey: input.idempotencyKey });
  const prior = await submissionOrRunForKey(database, workspace.id, "submission", input.idempotencyKey);
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw conflict("Idempotency key was reused for another submission operation");
    return JSON.parse(prior.result_json);
  }
  const run = await database.prepare(
    "SELECT * FROM product_discovery_runs WHERE id = ? AND workspace_id = ? LIMIT 1",
  ).bind(input.runId, workspace.id).first<RunRow>();
  if (!run) throw conflict("Discovery run is unavailable");
  if (run.product_id !== input.productId || run.configuration_id !== input.configurationId || run.configuration_digest !== input.configurationDigest) {
    throw conflict("Submission Product or pinned configuration does not match the run");
  }
  if (Number(run.revision) !== Number(input.expectedRunRevision)) throw conflict("Stale discovery run revision");
  if (!["blocked_missing_capability", "queued", "running"].includes(run.execution_state)) {
    throw conflict(`Discovery run is already ${run.execution_state}`);
  }
  return normalized.status === "complete"
    ? commitSuccessfulSubmission(database, workspace, principal, run, normalized, input.idempotencyKey, operationDigest)
    : commitUnknownSubmission(database, workspace, run, normalized, input.idempotencyKey, operationDigest);
}

async function commitUnknownSubmission(
  database: D1Database,
  workspace: Workspace,
  run: RunRow,
  normalized: NormalizedDiscoverySubmission,
  idempotencyKey: string,
  operationDigest: string,
) {
  const submissionId = v7();
  const now = Date.now();
  const result = {
    status: "authority_unknown",
    submissionId,
    runId: run.id,
    proposals: [],
    actionsAvailable: false,
    watermark: { previous: run.last_successful_watermark, current: run.last_successful_watermark, advanced: false },
  };
  const resultJson = canonicalJson(result);
  const provenanceJson = canonicalJson(normalized.provenance);
  const submissionJson = canonicalJson(normalized);
  await database.batch([
    database.prepare(
      `INSERT INTO product_discovery_submissions
       (id, workspace_id, product_id, run_id, configuration_id, provenance_json, provenance_digest,
        submission_json, submission_digest, result_json, result_digest, status, operation_digest, idempotency_key, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'authority_unknown', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM product_discovery_runs WHERE id = ? AND workspace_id = ? AND revision = ?)`,
    ).bind(submissionId, workspace.id, run.product_id, run.id, run.configuration_id, provenanceJson, await sha256(provenanceJson), submissionJson, await sha256(submissionJson), resultJson, await sha256(resultJson), operationDigest, idempotencyKey, now, run.id, workspace.id, run.revision),
    database.prepare("UPDATE product_discovery_runs SET execution_state = 'authority_unknown', revision = revision + 1, updated_at = ?, completed_at = ? WHERE id = ? AND workspace_id = ? AND revision = ?").bind(now, now, run.id, workspace.id, run.revision),
  ]);
  const winner = await submissionOrRunForKey(database, workspace.id, "submission", idempotencyKey);
  if (!winner) throw conflict("Authority-unknown submission did not commit");
  return JSON.parse(winner.result_json);
}

async function commitSuccessfulSubmission(
  database: D1Database,
  workspace: Workspace,
  principal: InterviewPrincipal,
  run: RunRow,
  normalized: NormalizedDiscoverySubmission,
  idempotencyKey: string,
  operationDigest: string,
  privateProofAuthorization?: PrivateProofAuthorizationRow,
) {
  const submissionId = v7();
  const now = Date.now();
  const ranked = await rankFindings(normalized.findings, run.product_id);
  const selected = ranked.slice(0, 3);
  const mutations: D1PreparedStatement[] = [];
  const projections = [];
  for (const [index, rankedFinding] of selected.entries()) {
    const prepared = await prepareProposalMutation(database, workspace, run, submissionId, rankedFinding.finding, index + 1, now, operationDigest);
    mutations.push(...prepared.statements);
    projections.push(prepared.projection);
  }
  const result = {
    status: "succeeded",
    submissionId,
    runId: run.id,
    proposals: projections,
    actionsAvailable: true,
    watermark: { previous: run.last_successful_watermark, current: run.started_at, advanced: true },
  };
  const resultJson = canonicalJson(result);
  const provenanceJson = canonicalJson(normalized.provenance);
  const submissionJson = canonicalJson(normalized);
  const consumptionAuditId = privateProofAuthorization ? v7() : null;
  const consumptionId = privateProofAuthorization ? v7() : null;
  const consumptionAuditDetail = privateProofAuthorization
    ? canonicalJson({
        authorizationId: privateProofAuthorization.id,
        submissionId,
        runId: run.id,
        operationDigest,
        fixtureDigest: PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST,
      })
    : null;
  try {
    await database.batch([
      database.prepare(
        `INSERT INTO product_discovery_submissions
         (id, workspace_id, product_id, run_id, configuration_id, provenance_json, provenance_digest,
          submission_json, submission_digest, result_json, result_digest, status, operation_digest, idempotency_key, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM product_discovery_runs WHERE id = ? AND workspace_id = ? AND revision = ?)`,
      ).bind(submissionId, workspace.id, run.product_id, run.id, run.configuration_id, provenanceJson, await sha256(provenanceJson), submissionJson, await sha256(submissionJson), resultJson, await sha256(resultJson), operationDigest, idempotencyKey, now, run.id, workspace.id, run.revision),
      ...mutations,
      database.prepare("UPDATE product_discovery_runs SET execution_state = 'succeeded', successful_watermark = started_at, revision = revision + 1, updated_at = ?, completed_at = ? WHERE id = ? AND workspace_id = ? AND revision = ?").bind(now, now, run.id, workspace.id, run.revision),
      database.prepare("UPDATE product_discovery_schedules SET last_successful_watermark = ?, revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND product_id = ? AND active = 1").bind(run.started_at, now, workspace.id, run.product_id),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) SELECT ?, ?, 'owner', ?, 'discovery.synthetic_submission_succeeded', 'product_discovery_run', ?, ?, ? WHERE EXISTS (SELECT 1 FROM product_discovery_submissions WHERE id = ?)").bind(v7(), workspace.id, principal.subject, run.id, canonicalJson({ submissionId, operationDigest, surfacedProposalCount: projections.length }), now, submissionId),
      ...(privateProofAuthorization && consumptionAuditId && consumptionId && consumptionAuditDetail
        ? [
            database.prepare(
              `INSERT INTO audit_events
               (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
               SELECT ?, ?, 'owner', ?, 'private_synthetic_proof.consumed', 'private_synthetic_proof_authorization', ?, ?, ?
               WHERE EXISTS (SELECT 1 FROM product_discovery_submissions WHERE id = ? AND workspace_id = ?)`,
            ).bind(consumptionAuditId, workspace.id, principal.subject, privateProofAuthorization.id, consumptionAuditDetail, now, submissionId, workspace.id),
            database.prepare(
              `INSERT INTO private_synthetic_proof_consumptions
               (id, workspace_id, product_id, authorization_id, operation_digest, winner_run_id,
                winner_submission_id, result_json, result_digest, audit_event_id, consumed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              consumptionId,
              workspace.id,
              run.product_id,
              privateProofAuthorization.id,
              operationDigest,
              run.id,
              submissionId,
              resultJson,
              await sha256(resultJson),
              consumptionAuditId,
              now,
            ),
          ]
        : []),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
  }
  const winner = await submissionOrRunForKey(database, workspace.id, "submission", idempotencyKey);
  if (privateProofAuthorization) {
    const consumption = await database.prepare(
      "SELECT operation_digest, result_json FROM private_synthetic_proof_consumptions WHERE authorization_id = ? LIMIT 1",
    ).bind(privateProofAuthorization.id).first<{ operation_digest: string; result_json: string }>();
    if (!consumption || consumption.operation_digest !== operationDigest) {
      throw conflict(consumption ? "Private synthetic-proof authorization is already consumed" : "Private synthetic-proof consumption conflicted");
    }
    return JSON.parse(consumption.result_json);
  }
  if (!winner) throw conflict("Discovery submission conflicted");
  if (winner.operation_digest !== operationDigest) throw conflict("Submission winner belongs to another operation");
  return JSON.parse(winner.result_json);
}

async function prepareProposalMutation(
  database: D1Database,
  workspace: Workspace,
  run: RunRow,
  submissionId: string,
  finding: NormalizedDiscoveryFinding,
  rank: number,
  now: number,
  parentOperationDigest: string,
) {
  const fingerprint = await fingerprintFor(run.product_id, finding);
  const existing = await database.prepare(
    "SELECT * FROM market_play_proposals WHERE workspace_id = ? AND product_id = ? AND fingerprint = ? AND active = 1 LIMIT 1",
  ).bind(workspace.id, run.product_id, fingerprint).first<ProposalRow>();
  const materialFingerprint = await materialFingerprintFor(finding);
  const proposalJson = canonicalJson(finding);
  const proposalDigest = await sha256(proposalJson);
  if (!existing) {
    const proposalId = v7();
    const versionId = v7();
    const statements: D1PreparedStatement[] = [
      database.prepare(
        `INSERT INTO market_play_proposals
         (id, workspace_id, created_at, updated_at, revision, product_id, run_id, fingerprint, current_version_id,
          status, surfaced, rank, active, cooldown_until)
         SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, 'new', 1, ?, 1, NULL
         WHERE EXISTS (SELECT 1 FROM product_discovery_submissions WHERE id = ? AND workspace_id = ?)`,
      ).bind(proposalId, workspace.id, now, now, run.product_id, run.id, fingerprint, versionId, rank, submissionId, workspace.id),
      database.prepare(
        `INSERT INTO market_play_proposal_versions
         (id, workspace_id, product_id, proposal_id, run_id, submission_id, version, proposal_json, proposal_digest,
          material_evidence_fingerprint, predecessor_version_id, relationship, created_at)
         SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, 'new', ?
         WHERE EXISTS (SELECT 1 FROM market_play_proposals WHERE id = ? AND workspace_id = ?)`,
      ).bind(versionId, workspace.id, run.product_id, proposalId, run.id, submissionId, proposalJson, proposalDigest, materialFingerprint, now, proposalId, workspace.id),
      ...await evidenceStatements(database, workspace.id, proposalId, versionId, finding, now),
    ];
    return {
      statements,
      projection: proposalProjection({
        proposalId,
        versionId,
        version: 1,
        revision: 1,
        fingerprint,
        finding,
        digest: proposalDigest,
        status: "new",
        rank,
        relationship: "new",
        evidenceLineage: finding.evidence,
      }),
    };
  }

  const current = await currentVersion(database, existing);
  const priorFinding = JSON.parse(current.proposal_json) as NormalizedDiscoveryFinding;
  const sameVersion = current.proposal_digest === proposalDigest;
  const terminal = existing.status === "deferred" || existing.status === "dismissed";
  const changedField = materialChangeField(priorFinding, finding);
  const reopened = terminal && current.material_evidence_fingerprint !== materialFingerprint && changedField !== null;
  if (sameVersion || (terminal && !reopened)) {
    const evidenceLineage = await evidenceForProposal(database, existing.id);
    return {
      statements: [],
      projection: proposalProjection({
        proposalId: existing.id,
        versionId: current.id,
        version: current.version,
        revision: existing.revision,
        fingerprint,
        finding: priorFinding,
        digest: current.proposal_digest,
        status: existing.status,
        rank,
        relationship: "collision",
        evidenceLineage,
        reopened: false,
        reopenReason: terminal ? "Repeated evidence has no material change" : "Identical collision reused",
      }),
    };
  }

  const versionId = v7();
  const version = Number(current.version) + 1;
  const relationship = reopened ? "reopen" : "evidence_attached";
  const lineageId = v7();
  const lineageJson = canonicalJson({
    relationship,
    sourceProposalId: existing.id,
    sourceVersionId: current.id,
    targetProposalId: existing.id,
    targetVersionId: versionId,
    changedField,
    evidenceReference: finding.evidence[0].reference,
  });
  const lineageDigest = await sha256(lineageJson);
  const statements: D1PreparedStatement[] = [
    database.prepare(
      `UPDATE market_play_proposals
       SET current_version_id = ?, revision = revision + 1, updated_at = ?, status = ?, cooldown_until = ?, surfaced = 1
       WHERE id = ? AND workspace_id = ? AND revision = ? AND current_version_id = ?`,
    ).bind(versionId, now, reopened ? "new" : existing.status, reopened ? null : existing.cooldown_until, existing.id, workspace.id, existing.revision, current.id),
    database.prepare(
      `INSERT INTO market_play_proposal_versions
       (id, workspace_id, product_id, proposal_id, run_id, submission_id, version, proposal_json, proposal_digest,
        material_evidence_fingerprint, predecessor_version_id, relationship, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM market_play_proposals WHERE id = ? AND workspace_id = ? AND current_version_id = ?)`,
    ).bind(versionId, workspace.id, run.product_id, existing.id, run.id, submissionId, version, proposalJson, proposalDigest, materialFingerprint, current.id, relationship, now, existing.id, workspace.id, versionId),
    ...await evidenceStatements(database, workspace.id, existing.id, versionId, finding, now),
    database.prepare(
      `INSERT INTO market_play_proposal_lineage
       (id, workspace_id, product_id, relationship, source_proposal_id, source_version_id, target_proposal_id,
        target_version_id, changed_field, evidence_reference, lineage_json, lineage_digest, operation_digest, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM market_play_proposal_versions WHERE id = ?)`,
    ).bind(lineageId, workspace.id, run.product_id, relationship, existing.id, current.id, existing.id, versionId, changedField, finding.evidence[0].reference, lineageJson, lineageDigest, await digestFor({ parentOperationDigest, fingerprint, relationship }), now, versionId),
  ];
  const previousEvidence = await evidenceForProposal(database, existing.id);
  return {
    statements,
    projection: proposalProjection({
      proposalId: existing.id,
      versionId,
      version,
      revision: Number(existing.revision) + 1,
      fingerprint,
      finding,
      digest: proposalDigest,
      status: reopened ? "new" : existing.status,
      rank,
      relationship,
      evidenceLineage: dedupeEvidence([...previousEvidence, ...finding.evidence]),
      reopened,
      reopenLineage: reopened
        ? { predecessorVersionId: current.id, changedField, evidenceReference: finding.evidence[0].reference, immutable: true }
        : undefined,
    }),
  };
}

export async function decideMarketPlayProposal(
  database: D1Database,
  principal: InterviewPrincipal,
  input: DecisionInput,
) {
  validateKey(input.idempotencyKey);
  const workspace = await ownedWorkspace(database, principal);
  if (!["explore", "defer", "dismiss"].includes(input.decision)) throw conflict("Unsupported proposal decision");
  const reason = input.reason?.trim() ?? "";
  if ((input.decision === "defer" || input.decision === "dismiss") && !bounded(reason, 2_000)) throw conflict("Decision reason is required");
  if (input.decision === "dismiss" && input.confirmed !== true) throw conflict("Dismiss requires explicit confirmation");
  const operationDigest = await digestFor({
    action: "discovery.decide",
    workspaceId: workspace.id,
    proposalId: input.proposalId,
    expectedProposalRevision: input.expectedProposalRevision,
    expectedProposalDigest: input.expectedProposalDigest,
    decision: input.decision,
    reason,
    requestedReviewAt: input.reviewAt ?? null,
    confirmed: input.confirmed === true,
    idempotencyKey: input.idempotencyKey,
  });
  const prior = await database.prepare(
    "SELECT operation_digest, decision_json FROM market_play_proposal_decisions WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
  ).bind(workspace.id, input.idempotencyKey).first<{ operation_digest: string; decision_json: string }>();
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw conflict("Idempotency key was reused for another proposal decision");
    return JSON.parse(prior.decision_json);
  }
  const proposal = await database.prepare(
    "SELECT * FROM market_play_proposals WHERE id = ? AND workspace_id = ? AND active = 1 LIMIT 1",
  ).bind(input.proposalId, workspace.id).first<ProposalRow>();
  if (!proposal) throw conflict("Market Play Proposal is unavailable");
  const version = await currentVersion(database, proposal);
  if (Number(proposal.revision) !== Number(input.expectedProposalRevision)) throw conflict("Stale proposal revision");
  if (version.proposal_digest !== input.expectedProposalDigest) throw conflict("Reviewed proposal digest does not match");
  const now = Date.now();
  const reviewAt = input.decision === "defer" ? input.reviewAt ?? now + 90 * DAY : null;
  if (input.decision === "defer" && reviewAt !== now + 90 * DAY) throw conflict("Defer review date must apply the 90-day cooldown");
  const cooldownUntil = input.decision === "dismiss" ? now + 180 * DAY : reviewAt;

  const decisionId = v7();
  const draftMarketPlayId = input.decision === "explore" ? v7() : null;
  const interviewSessionId = input.decision === "explore" ? v7() : null;
  const finding = JSON.parse(version.proposal_json) as NormalizedDiscoveryFinding;
  const status = input.decision === "explore" ? "explored" : input.decision === "defer" ? "deferred" : "dismissed";
  const decisionDigest = await digestFor({ proposalId: proposal.id, proposalVersionId: version.id, decision: input.decision, reason, reviewAt, cooldownUntil });
  const result = {
    id: decisionId,
    decision: input.decision,
    status,
    immutable: true,
    digest: decisionDigest,
    proposalId: proposal.id,
    proposalVersionId: version.id,
    cooldown: input.decision === "explore" ? null : { days: input.decision === "defer" ? 90 : 180, until: cooldownUntil },
    interview: input.decision === "explore"
      ? { id: interviewSessionId, marketPlayId: draftMarketPlayId, scopeType: "market_play", lifecycle: "draft", sourceProposalVersionId: version.id }
      : null,
  };
  const decisionJson = canonicalJson(result);
  const statements: D1PreparedStatement[] = [];
  if (input.decision === "explore") {
    statements.push(
      database.prepare(
        `INSERT INTO market_plays
         (id, workspace_id, created_at, updated_at, revision, product_id, name, lifecycle)
         VALUES (?, ?, ?, ?, 1, ?, ?, 'draft')`,
      ).bind(draftMarketPlayId, workspace.id, now, now, proposal.product_id, proposalName(finding)),
      database.prepare(
        `INSERT INTO interview_sessions
         (id, workspace_id, created_at, updated_at, revision, company_id, scope_type, scope_id, state, active_question_id)
         SELECT ?, ?, ?, ?, 1, p.company_id, 'market_play', ?, 'open', NULL
         FROM products p WHERE p.id = ? AND p.workspace_id = ?
           AND EXISTS (SELECT 1 FROM market_plays WHERE id = ? AND workspace_id = ?)`,
      ).bind(interviewSessionId, workspace.id, now, now, draftMarketPlayId, proposal.product_id, workspace.id, draftMarketPlayId, workspace.id),
    );
  }
  try {
    await database.batch([
      ...statements,
      database.prepare(
        `INSERT INTO market_play_proposal_decisions
         (id, workspace_id, product_id, proposal_id, proposal_version_id, expected_proposal_revision,
          expected_proposal_digest, decision, reason, review_at, cooldown_until, confirmed, draft_market_play_id,
          interview_session_id, decision_json, decision_digest, operation_digest, idempotency_key, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM market_play_proposals WHERE id = ? AND workspace_id = ? AND revision = ? AND current_version_id = ?)`,
      ).bind(decisionId, workspace.id, proposal.product_id, proposal.id, version.id, input.expectedProposalRevision, input.expectedProposalDigest, input.decision, reason || null, reviewAt, cooldownUntil, input.confirmed === true ? 1 : 0, draftMarketPlayId, interviewSessionId, decisionJson, decisionDigest, operationDigest, input.idempotencyKey, now, proposal.id, workspace.id, proposal.revision, version.id),
      database.prepare("UPDATE market_play_proposals SET status = ?, cooldown_until = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM market_play_proposal_decisions WHERE id = ?)").bind(status, cooldownUntil, now, proposal.id, workspace.id, proposal.revision, decisionId),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) SELECT ?, ?, 'owner', ?, ?, 'market_play_proposal', ?, ?, ? WHERE EXISTS (SELECT 1 FROM market_play_proposal_decisions WHERE id = ?)").bind(v7(), workspace.id, principal.subject, `market_play_proposal.${input.decision}`, proposal.id, canonicalJson({ decisionId, decisionDigest, operationDigest }), now, decisionId),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
  }
  const winner = await database.prepare(
    "SELECT operation_digest, decision_json FROM market_play_proposal_decisions WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
  ).bind(workspace.id, input.idempotencyKey).first<{ operation_digest: string; decision_json: string }>();
  if (!winner || winner.operation_digest !== operationDigest) throw conflict("Proposal decision conflicted with another reviewer");
  return JSON.parse(winner.decision_json);
}

export async function correctProposalFingerprint(
  database: D1Database,
  principal: InterviewPrincipal,
  input: CorrectionInput,
) {
  validateKey(input.idempotencyKey);
  if (!bounded(input.reason, 2_000)) throw conflict("Fingerprint correction requires a reason");
  const workspace = await ownedWorkspace(database, principal);
  const source = await database.prepare("SELECT * FROM market_play_proposals WHERE id = ? AND workspace_id = ? AND active = 1 LIMIT 1").bind(input.proposalId, workspace.id).first<ProposalRow>();
  if (!source) throw conflict("Source proposal is unavailable");
  const sourceVersion = await currentVersion(database, source);
  if (Number(source.revision) !== Number(input.expectedProposalRevision) || sourceVersion.proposal_digest !== input.expectedProposalDigest) throw conflict("Stale proposal correction");
  const operationDigest = await digestFor({ action: "discovery.correct_fingerprint", workspaceId: workspace.id, ...input });
  const prior = await database.prepare("SELECT lineage_json, operation_digest FROM market_play_proposal_lineage WHERE workspace_id = ? AND operation_digest = ? LIMIT 1").bind(workspace.id, operationDigest).first<{ lineage_json: string; operation_digest: string }>();
  if (prior) return JSON.parse(prior.lineage_json).result;
  return input.operation === "split"
    ? splitProposal(database, workspace, source, sourceVersion, input, operationDigest)
    : mergeProposal(database, workspace, source, sourceVersion, input, operationDigest);
}

async function splitProposal(database: D1Database, workspace: Workspace, source: ProposalRow, sourceVersion: VersionRow, input: CorrectionInput, operationDigest: string) {
  if (!input.correctedIdentity) throw conflict("Split requires corrected fingerprint identity");
  const original = JSON.parse(sourceVersion.proposal_json) as NormalizedDiscoveryFinding;
  const corrected = { ...original, ...input.correctedIdentity };
  const fingerprint = await fingerprintFor(source.product_id, corrected);
  if (fingerprint === source.fingerprint) throw conflict("Split must create a distinct fingerprint");
  const proposalId = v7();
  const versionId = v7();
  const lineageId = v7();
  const now = Date.now();
  const proposalJson = canonicalJson(corrected);
  const proposalDigest = await sha256(proposalJson);
  const result = {
    lineage: { id: lineageId, kind: "split", predecessorProposalId: source.id, sourceProposalIds: [source.id], targetProposalId: proposalId, immutable: true },
    proposal: proposalProjection({ proposalId, versionId, version: 1, revision: 1, fingerprint, finding: corrected, digest: proposalDigest, status: "new", rank: null, relationship: "split", evidenceLineage: await evidenceForProposal(database, source.id) }),
  };
  const lineageJson = canonicalJson({ reason: input.reason, result });
  await database.batch([
    database.prepare("INSERT INTO market_play_proposals (id, workspace_id, created_at, updated_at, revision, product_id, run_id, fingerprint, current_version_id, status, surfaced, rank, active, cooldown_until) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'new', 0, NULL, 1, NULL)").bind(proposalId, workspace.id, now, now, source.product_id, source.run_id, fingerprint, versionId),
    database.prepare("INSERT INTO market_play_proposal_versions (id, workspace_id, product_id, proposal_id, run_id, submission_id, version, proposal_json, proposal_digest, material_evidence_fingerprint, predecessor_version_id, relationship, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'split', ?)").bind(versionId, workspace.id, source.product_id, proposalId, sourceVersion.run_id, sourceVersion.submission_id, proposalJson, proposalDigest, await materialFingerprintFor(corrected), sourceVersion.id, now),
    database.prepare("INSERT INTO market_play_proposal_lineage (id, workspace_id, product_id, relationship, source_proposal_id, source_version_id, target_proposal_id, target_version_id, changed_field, evidence_reference, lineage_json, lineage_digest, operation_digest, created_at) VALUES (?, ?, ?, 'split', ?, ?, ?, ?, 'fingerprint', NULL, ?, ?, ?, ?)").bind(lineageId, workspace.id, source.product_id, source.id, sourceVersion.id, proposalId, versionId, lineageJson, await sha256(lineageJson), operationDigest, now),
  ]);
  return result;
}

async function mergeProposal(database: D1Database, workspace: Workspace, source: ProposalRow, sourceVersion: VersionRow, input: CorrectionInput, operationDigest: string) {
  if (!input.mergeIntoProposalId || input.mergeIntoProposalId === source.id) throw conflict("Merge requires a distinct target proposal");
  const target = await database.prepare("SELECT * FROM market_play_proposals WHERE id = ? AND workspace_id = ? AND product_id = ? AND active = 1 LIMIT 1").bind(input.mergeIntoProposalId, workspace.id, source.product_id).first<ProposalRow>();
  if (!target) throw conflict("Merge target is unavailable");
  const targetVersion = await currentVersion(database, target);
  const lineageId = v7();
  const now = Date.now();
  const result = { lineage: { id: lineageId, kind: "merge", sourceProposalIds: [source.id, target.id], targetProposalId: target.id, immutable: true }, proposal: await proposalByRow(database, target) };
  const lineageJson = canonicalJson({ reason: input.reason, result });
  await database.batch([
    database.prepare("UPDATE market_play_proposals SET active = 0, status = 'merged', revision = revision + 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND revision = ?").bind(now, source.id, workspace.id, source.revision),
    database.prepare("INSERT INTO market_play_proposal_lineage (id, workspace_id, product_id, relationship, source_proposal_id, source_version_id, target_proposal_id, target_version_id, changed_field, evidence_reference, lineage_json, lineage_digest, operation_digest, created_at) VALUES (?, ?, ?, 'merge', ?, ?, ?, ?, 'fingerprint', NULL, ?, ?, ?, ?)").bind(lineageId, workspace.id, source.product_id, source.id, sourceVersion.id, target.id, targetVersion.id, lineageJson, await sha256(lineageJson), operationDigest, now),
  ]);
  return result;
}

async function productAuthority(database: D1Database, principal: InterviewPrincipal, productId: string, knownWorkspace?: Workspace) {
  const workspace = knownWorkspace ?? await ownedWorkspace(database, principal);
  const product = await database.prepare("SELECT id, revision, lifecycle FROM products WHERE id = ? AND workspace_id = ? LIMIT 1").bind(productId, workspace.id).first<Product>();
  if (!product) throw conflict("Product is unavailable in this workspace");
  const configuration = await database.prepare("SELECT id, digest, manifest_json, revision FROM typed_configurations WHERE workspace_id = ? AND owner_type = 'product' AND owner_id = ? AND kind = 'product_discovery' AND active = 1 LIMIT 1").bind(workspace.id, product.id).first<Configuration>();
  if (!configuration) throw conflict("Active Product Discovery Configuration is unavailable");
  return { workspace, product, configuration };
}

async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal): Promise<Workspace> {
  const workspace = await database.prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1").bind(principal.subject).first<Workspace>();
  if (!workspace) throw conflict("Workspace authority is unavailable");
  return workspace;
}

function runProjection(row: RunRow) {
  const manifest = parseObject(row.manifest_json, "Discovery run manifest");
  return {
    id: row.id,
    revision: Number(row.revision),
    productId: row.product_id,
    configuration: { id: row.configuration_id, digest: row.configuration_digest, manifest },
    policies: parseObject(row.policy_snapshot_json, "Discovery policy snapshot"),
    trigger: { kind: row.trigger_kind, key: row.trigger_key, sourceEventId: row.source_event_id },
    triggerKey: row.trigger_key,
    startedAt: Number(row.started_at),
    window: { lowerExclusive: row.window_lower_exclusive === null ? null : Number(row.window_lower_exclusive), upperInclusive: Number(row.window_upper_inclusive) },
    executionState: row.execution_state,
    watermark: { previous: row.last_successful_watermark, successful: row.successful_watermark },
    completedAt: row.completed_at,
  };
}

async function currentVersion(database: D1Database, proposal: ProposalRow) {
  const version = await database.prepare("SELECT * FROM market_play_proposal_versions WHERE id = ? AND proposal_id = ? LIMIT 1").bind(proposal.current_version_id, proposal.id).first<VersionRow>();
  if (!version) throw conflict("Proposal version authority is incomplete");
  return version;
}

async function proposalByRow(database: D1Database, proposal: ProposalRow) {
  const version = await currentVersion(database, proposal);
  return proposalProjection({ proposalId: proposal.id, versionId: version.id, version: version.version, revision: proposal.revision, fingerprint: proposal.fingerprint, finding: JSON.parse(version.proposal_json), digest: version.proposal_digest, status: proposal.status, rank: null, relationship: version.relationship, evidenceLineage: await evidenceForProposal(database, proposal.id) });
}

async function proposalDecisionHistory(database: D1Database, workspaceId: string, proposalId: string) {
  const rows = await database.prepare(
    `SELECT decision_json FROM market_play_proposal_decisions
     WHERE workspace_id = ? AND proposal_id = ? ORDER BY created_at, id`,
  ).bind(workspaceId, proposalId).all<{ decision_json: string }>();
  return rows.results.map((row) => JSON.parse(row.decision_json));
}

async function latestPrivateProofAuthorization(database: D1Database, workspaceId: string, productId: string) {
  return database.prepare(
    `SELECT * FROM private_synthetic_proof_authorizations
     WHERE workspace_id = ? AND product_id = ? AND capability = ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).bind(workspaceId, productId, PRIVATE_SYNTHETIC_PROOF_CAPABILITY).first<PrivateProofAuthorizationRow>();
}

function validatePrivateProofConfirmation(valueJson: string, product: Product, now: number) {
  const outer = parseObject(valueJson, "Private synthetic-proof confirmation");
  const value = typeof outer.excerpt === "string"
    ? parseObject(outer.excerpt, "Private synthetic-proof confirmation excerpt")
    : outer;
  if (
    value.capability !== PRIVATE_SYNTHETIC_PROOF_CAPABILITY ||
    value.productId !== product.id ||
    Number(value.expectedProductRevision) !== Number(product.revision) ||
    value.reviewedSourceRevision !== PRIVATE_SYNTHETIC_PROOF_REVIEWED_SOURCE_REVISION ||
    value.migrationDigest !== PRIVATE_SYNTHETIC_PROOF_MIGRATION_DIGEST ||
    value.fixtureDigest !== PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST ||
    value.fixtureProvenance !== PRIVATE_SYNTHETIC_PROOF_FIXTURE_PROVENANCE ||
    value.nonNetwork !== true ||
    value.transportAuthority !== false ||
    value.downstreamAuthority !== false
  ) {
    throw conflict("Confirmed private synthetic-proof tuple does not match the reviewed repository contract");
  }
  const evidenceReference = typeof value.evidenceReference === "string" ? value.evidenceReference.trim() : "";
  const expiresAt = Number(value.expiresAt);
  if (!bounded(evidenceReference, 512) || /^https?:\/\//i.test(evidenceReference) || !evidenceReference.startsWith("opaque:")) {
    throw conflict("Confirmed private synthetic-proof evidence reference is invalid");
  }
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 7 * DAY) {
    throw conflict("Confirmed private synthetic-proof expiry is invalid");
  }
  return {
    reviewedSourceRevision: PRIVATE_SYNTHETIC_PROOF_REVIEWED_SOURCE_REVISION,
    migrationDigest: PRIVATE_SYNTHETIC_PROOF_MIGRATION_DIGEST,
    fixtureDigest: PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST,
    fixtureProvenance: PRIVATE_SYNTHETIC_PROOF_FIXTURE_PROVENANCE,
    evidenceReference,
    expiresAt,
    capability: PRIVATE_SYNTHETIC_PROOF_CAPABILITY,
  };
}

function validatePrivateProofAuthorization(
  authorization: PrivateProofAuthorizationRow,
  principal: InterviewPrincipal,
  product: Product,
  now: number,
) {
  if (
    authorization.owner_subject_id !== principal.subject ||
    authorization.product_id !== product.id ||
    Number(authorization.expected_product_revision) !== Number(product.revision) ||
    authorization.reviewed_source_revision !== PRIVATE_SYNTHETIC_PROOF_REVIEWED_SOURCE_REVISION ||
    authorization.migration_digest !== PRIVATE_SYNTHETIC_PROOF_MIGRATION_DIGEST ||
    authorization.fixture_digest !== PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST ||
    authorization.fixture_provenance !== PRIVATE_SYNTHETIC_PROOF_FIXTURE_PROVENANCE ||
    authorization.capability !== PRIVATE_SYNTHETIC_PROOF_CAPABILITY ||
    Number(authorization.expires_at) < now
  ) {
    throw conflict("Private synthetic-proof authorization is expired or does not match current authority");
  }
}

function privateProofAuthorizationProjection(row: PrivateProofAuthorizationRow) {
  return {
    id: row.id,
    productId: row.product_id,
    expectedProductRevision: Number(row.expected_product_revision),
    confirmationId: row.interview_confirmation_id,
    confirmedKnowledgeVersionId: row.confirmed_knowledge_version_id,
    reviewedSourceRevision: row.reviewed_source_revision,
    migrationDigest: row.migration_digest,
    fixtureDigest: row.fixture_digest,
    provenance: row.fixture_provenance,
    evidenceReference: row.evidence_reference,
    capability: row.capability,
    expiresAt: Number(row.expires_at),
    immutable: true,
  };
}

function proposalProjection(input: { proposalId: string; versionId: string; version: number; revision: number; fingerprint: string; finding: NormalizedDiscoveryFinding; digest: string; status: string; rank: number | null; relationship: string; evidenceLineage: unknown[]; reopened?: boolean; reopenReason?: string; reopenLineage?: unknown }) {
  return {
    id: input.proposalId,
    versionId: input.versionId,
    version: Number(input.version),
    revision: Number(input.revision),
    fingerprint: input.fingerprint,
    digest: input.digest,
    status: input.status,
    rank: input.rank,
    marketCategory: input.finding.marketCategory,
    audience: input.finding.audience,
    problemFamily: input.finding.problemFamily,
    problemMatch: input.finding.problemMatch,
    likelyBuyer: input.finding.likelyBuyer,
    examples: input.finding.examples,
    evidence: input.finding.evidence,
    inference: input.finding.inference,
    productFit: input.finding.productFit,
    risks: input.finding.risks,
    collision: { relationship: input.relationship },
    evidenceLineage: input.evidenceLineage,
    reopened: input.reopened ?? false,
    ...(input.reopenReason ? { reopenReason: input.reopenReason } : {}),
    ...(input.reopenLineage ? { reopenLineage: input.reopenLineage } : {}),
  };
}

async function evidenceStatements(database: D1Database, workspaceId: string, proposalId: string, versionId: string, finding: NormalizedDiscoveryFinding, now: number) {
  return Promise.all(finding.evidence.map(async (evidence) => {
    const evidenceJson = canonicalJson(evidence);
    return database.prepare(
      `INSERT INTO market_play_proposal_evidence
       (id, workspace_id, proposal_id, proposal_version_id, reference, evidence_json, evidence_digest,
        material_evidence_fingerprint, observed_at, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM market_play_proposal_versions WHERE id = ?)`,
    ).bind(v7(), workspaceId, proposalId, versionId, evidence.reference, evidenceJson, await sha256(evidenceJson), evidence.materialEvidenceFingerprint, evidence.observedAt, now, versionId);
  }));
}

async function evidenceForProposal(database: D1Database, proposalId: string) {
  const rows = await database.prepare("SELECT evidence_json FROM market_play_proposal_evidence WHERE proposal_id = ? ORDER BY created_at, id").bind(proposalId).all<{ evidence_json: string }>();
  return dedupeEvidence(rows.results.map((row) => JSON.parse(row.evidence_json)));
}

function dedupeEvidence(values: unknown[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const reference = typeof value === "object" && value !== null && "reference" in value ? String((value as { reference: unknown }).reference) : canonicalJson(value);
    if (seen.has(reference)) return false;
    seen.add(reference);
    return true;
  });
}

async function rankFindings(findings: NormalizedDiscoveryFinding[], productId: string) {
  const ranked = await Promise.all(findings.map(async (finding) => ({ finding, fingerprint: await fingerprintFor(productId, finding), score: serverRank(finding) })));
  return ranked.sort((left, right) => right.score - left.score || left.fingerprint.localeCompare(right.fingerprint));
}

function serverRank(finding: NormalizedDiscoveryFinding) {
  const newest = Math.max(...finding.evidence.map((item) => item.observedAt));
  return finding.evidence.length * 1_000_000_000_000_000 + Math.min(newest, 999_999_999_999_999) + finding.examples.length * 1_000 - finding.risks.length;
}

async function fingerprintFor(productId: string, finding: Pick<NormalizedDiscoveryFinding, "marketCategory" | "audience" | "problemFamily">) {
  return digestFor({ productId, marketCategory: finding.marketCategory, audience: finding.audience, problemFamily: finding.problemFamily });
}

async function materialFingerprintFor(finding: NormalizedDiscoveryFinding) {
  return digestFor({ problemMatch: finding.problemMatch, audience: finding.audience, productFit: finding.productFit, risks: finding.risks, evidence: finding.evidence.map((item) => item.materialEvidenceFingerprint).sort() });
}

function materialChangeField(previous: NormalizedDiscoveryFinding, next: NormalizedDiscoveryFinding) {
  if (previous.problemMatch !== next.problemMatch) return "problemMatch";
  if (previous.audience !== next.audience) return "audience";
  if (previous.productFit !== next.productFit) return "productFit";
  if (canonicalJson(previous.risks) !== canonicalJson(next.risks)) return "risks";
  return null;
}

function policySnapshot(manifest: Record<string, unknown>) {
  const nested = manifest.policySnapshot;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested as Record<string, unknown>;
  return {
    runner: manifest.runnerPolicy ?? null,
    instruction: manifest.instructionPolicy ?? null,
    outputSchema: manifest.outputSchemaPolicy ?? null,
    tools: manifest.toolPolicy ?? null,
    source: manifest.sourcePolicy ?? null,
    discovery: manifest.discoveryPolicy ?? null,
  };
}

function triggerIdentity(kind: StartInput["triggerKind"], productId: string, configurationId: string, startedAt: number) {
  if (kind === "material_change") return `material-change:product:${productId}:${configurationId}`;
  return `${kind}:product:${productId}:${configurationId}:${startedAt}`;
}

function proposalName(finding: NormalizedDiscoveryFinding) {
  return `${title(finding.marketCategory)} — ${title(finding.audience)}`.slice(0, 160);
}

function title(value: string) {
  return value.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}

async function submissionOrRunForKey(database: D1Database, workspaceId: string, kind: "submission" | "run", idempotencyKey: string) {
  const table = kind === "submission" ? "product_discovery_submissions" : "product_discovery_runs";
  const fields = kind === "submission" ? "id, operation_digest, result_json" : "id, operation_digest, NULL AS result_json";
  return database.prepare(`SELECT ${fields} FROM ${table} WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1`).bind(workspaceId, idempotencyKey).first<{ id: string; operation_digest: string; result_json: string }>();
}

function parseObject(value: string, label: string) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw conflict(`${label} is invalid`);
  }
}

function validateKey(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw conflict("A UUIDv7 idempotency key is required");
}

function bounded(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

async function digestFor(value: unknown) {
  return sha256(canonicalJson(value));
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isConstraint(error: unknown) {
  return error instanceof Error && /constraint|unique|foreign key/i.test(error.message);
}

function conflict(message: string) {
  return new MarketDiscoveryConflictError(message);
}
