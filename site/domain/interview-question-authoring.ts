import { v7 } from "uuid";

import {
  InterviewConflictError,
  readInterviewState,
  type InterviewDestination,
  type InterviewEvidenceFinding,
  type InterviewPrincipal,
  type InterviewState,
} from "./interview";
import type { InterviewQueueFence } from "./interview-question-composer";

const QUESTION_SCHEMA = "consensus-interview-question/v1" as const;
const DESTINATION_TABLES = {
  company: "companies",
  product: "products",
  market_play: "market_plays",
  customer_profile: "customer_profiles",
  offer: "offers",
} as const;

export type TrustedInterviewQuestionCandidate = {
  schema: typeof QUESTION_SCHEMA;
  prompt: string;
  evidenceFindings: InterviewEvidenceFinding[];
  inference: { label: "Inference"; value: string };
  recommendation: { rationale: string; value: { excerpt: string } } | null;
  requiresOwnerInput?: boolean;
  destination: { scopeType: InterviewDestination["scopeType"]; id: string };
  prerequisiteKnowledge: Array<{ id: string; digest: string }>;
  knowledgeKind: string;
};

export type IssueInterviewQuestionInput = {
  sessionId: string;
  expectedSessionRevision: number;
  idempotencyKey: string;
  candidate: TrustedInterviewQuestionCandidate;
  transitionFrom?: { scopeType: InterviewDestination["scopeType"]; id: string };
  authorityOperationDigest?: string;
  queueFence?: InterviewQueueFence;
};

/**
 * Internal, server-only question issuance. This module is deliberately not
 * composed into an HTTP route: callers must already hold trusted structured
 * question material and an owner principal.
 */
export async function issueInterviewQuestion(
  database: D1Database,
  principal: InterviewPrincipal,
  input: IssueInterviewQuestionInput,
): Promise<InterviewState> {
  validateInput(input);
  const workspace = await ownedWorkspace(database, principal);
  const session = await database.prepare(
    `SELECT id, revision, scope_type, scope_id, state, active_question_id
     FROM interview_sessions
     WHERE id = ? AND workspace_id = ? LIMIT 1`,
  ).bind(input.sessionId, workspace.id).first<SessionRow>();
  if (!session) throw conflict("Interview session is outside the owned workspace");

  const destination = await currentDestination(database, workspace.id, session);
  if (input.transitionFrom) {
    if (input.transitionFrom.scopeType !== destination.scopeType || input.transitionFrom.id !== destination.id)
      throw conflict("Question transition no longer matches the session destination");
  } else if (
    input.candidate.destination.scopeType !== destination.scopeType ||
    input.candidate.destination.id !== destination.id
  ) throw conflict("Question destination is not the session's current destination");
  const targetDestination = input.transitionFrom
    ? await currentDestination(database, workspace.id, {
      ...session,
      scope_type: input.candidate.destination.scopeType,
      scope_id: input.candidate.destination.id,
    })
    : destination;

  const prerequisites = canonicalPrerequisites(input.candidate.prerequisiteKnowledge);
  if (stableJson(prerequisites) !== stableJson(input.candidate.prerequisiteKnowledge)) {
    throw conflict("Question prerequisites must be unique and canonically ordered");
  }
  const candidate = canonicalCandidate(input.candidate, targetDestination, prerequisites);
  const operationDigest = input.authorityOperationDigest ?? await sha256(stableJson({
    action: "interview.question.issue",
    workspaceId: workspace.id,
    sessionId: session.id,
    expectedSessionRevision: input.expectedSessionRevision,
    transitionFrom: input.transitionFrom ?? null,
    candidate,
  }));
  const prior = await database.prepare(
    "SELECT subject_id, operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
  ).bind(workspace.id, input.idempotencyKey).first<{ subject_id: string; operation_digest: string }>();
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw conflict("Idempotency key was used for another question");
    const replay = await database.prepare(
      "SELECT id FROM interview_questions WHERE id = ? AND workspace_id = ? AND session_id = ? LIMIT 1",
    ).bind(prior.subject_id, workspace.id, session.id).first<{ id: string }>();
    if (!replay) throw conflict("Prior question issuance is incomplete");
    return readInterviewState(database, principal);
  }

  await assertCurrentPrerequisites(database, workspace.id, prerequisites);

  if (
    Number(session.revision) !== input.expectedSessionRevision ||
    !["open", "completed"].includes(session.state) ||
    session.active_question_id !== null
  ) throw conflict("Interview session changed; reload before issuing a question");

  const ordinalRow = await database.prepare(
    "SELECT COALESCE(MAX(version), 0) AS ordinal FROM interview_questions WHERE workspace_id = ? AND session_id = ?",
  ).bind(workspace.id, session.id).first<{ ordinal: number }>();
  const ordinal = Number(ordinalRow?.ordinal ?? 0) + 1;
  const questionId = `iq_${(await sha256(`${workspace.id}:${input.idempotencyKey}:question`)).slice(0, 24)}`;
  const commandId = v7();
  const auditId = v7();
  const now = Date.now();
  const researchJson = stableJson({
    schema: QUESTION_SCHEMA,
    evidenceFindings: candidate.evidenceFindings,
    inference: candidate.inference,
    recommendationValue: candidate.recommendation?.value ?? null,
    requiresOwnerInput: candidate.requiresOwnerInput,
    prerequisites,
    knowledgeKind: candidate.knowledgeKind,
  });

  const prerequisiteGuards = prerequisites.map(
    () => `AND EXISTS (
      SELECT 1 FROM knowledge_versions kv
      JOIN knowledge_items ki ON ki.id = kv.knowledge_item_id AND ki.workspace_id = kv.workspace_id
      WHERE kv.id = ? AND kv.workspace_id = ? AND kv.status = 'confirmed'
        AND ki.current_version_id = kv.id AND COALESCE(kv.value_digest, kv.source_digest) = ?
    )`,
  ).join("\n");
  const queueFenceManifest = input.queueFence ? stableJson(queueFenceEntries(input.queueFence)) : null;
  const queueFenceGuard = input.queueFence ? QUEUE_FENCE_GUARD : "";
  const commandBindings: unknown[] = [
    commandId,
    workspace.id,
    now,
    now,
    input.idempotencyKey,
    operationDigest,
    input.expectedSessionRevision,
    questionId,
    session.id,
    workspace.id,
    input.expectedSessionRevision,
  ];
  for (const prerequisite of prerequisites) {
    commandBindings.push(prerequisite.id, workspace.id, prerequisite.digest);
  }
  if (queueFenceManifest) {
    commandBindings.push(
      queueFenceManifest,
      workspace.id,
    );
  }

  try {
    await database.batch([
      database.prepare(
        `INSERT INTO authority_commands
         (id, workspace_id, created_at, updated_at, revision, command_type,
          idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status)
         SELECT ?, ?, ?, ?, 1, 'interview.question.issue', ?, ?, ?, 'interview_question', ?, 'accepted'
         WHERE EXISTS (
           SELECT 1 FROM interview_sessions s
           WHERE s.id = ? AND s.workspace_id = ? AND s.revision = ?
             AND s.state IN ('open', 'completed') AND s.active_question_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM interview_sessions live
               WHERE live.workspace_id = s.workspace_id AND live.id <> s.id
                 AND live.state IN ('awaiting_answer', 'awaiting_confirmation')
                 AND live.active_question_id IS NOT NULL
             )
         )
         ${prerequisiteGuards}
         ${queueFenceGuard}`,
      ).bind(...commandBindings),
      database.prepare(
        `INSERT INTO interview_questions
         (id, workspace_id, created_at, updated_at, revision, session_id, version,
          prompt, research_json, recommendation, status)
         SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'active'
         WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)`,
      ).bind(
        questionId,
        workspace.id,
        now,
        now,
        session.id,
        ordinal,
        candidate.prompt,
        researchJson,
        candidate.recommendation?.rationale ?? "Owner input is required; no recommendation was generated.",
        commandId,
        workspace.id,
      ),
      database.prepare(
        `UPDATE interview_sessions
         SET state = 'awaiting_answer', active_question_id = ?, scope_type = ?, scope_id = ?, updated_at = ?, revision = revision + 1
         WHERE id = ? AND workspace_id = ? AND revision = ?
           AND state IN ('open', 'completed') AND active_question_id IS NULL
           AND EXISTS (SELECT 1 FROM interview_questions WHERE id = ? AND workspace_id = ?)`,
      ).bind(
        questionId,
        candidate.destination.scopeType,
        candidate.destination.id,
        now,
        session.id,
        workspace.id,
        input.expectedSessionRevision,
        questionId,
        workspace.id,
      ),
      database.prepare(
        `INSERT INTO audit_events
         (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
         SELECT ?, ?, 'owner', ?, 'interview.question_issued', 'interview_question', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM interview_sessions
           WHERE id = ? AND workspace_id = ? AND active_question_id = ? AND state = 'awaiting_answer'
         ) AND EXISTS (
           SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?
         )`,
      ).bind(
        auditId,
        workspace.id,
        principal.subject,
        questionId,
        stableJson({ operationDigest, sessionId: session.id, ordinal, candidateDigest: await sha256(stableJson(candidate)) }),
        now,
        session.id,
        workspace.id,
        questionId,
        commandId,
        workspace.id,
      ),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw error;
  }

  const winner = await database.prepare(
    "SELECT subject_id, operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
  ).bind(workspace.id, input.idempotencyKey).first<{ subject_id: string; operation_digest: string }>();
  if (!winner || winner.operation_digest !== operationDigest || winner.subject_id !== questionId) {
    throw conflict("Question issuance conflicted; reload before retrying");
  }
  const activated = await database.prepare(
    `SELECT q.id FROM interview_questions q
     JOIN interview_sessions s ON s.id = q.session_id AND s.workspace_id = q.workspace_id
     WHERE q.id = ? AND q.workspace_id = ? AND q.status = 'active'
       AND s.active_question_id = q.id AND s.state = 'awaiting_answer' LIMIT 1`,
  ).bind(questionId, workspace.id).first<{ id: string }>();
  if (!activated) throw conflict("Question issuance did not activate atomically");
  return readInterviewState(database, principal);
}

type SessionRow = {
  id: string;
  revision: number;
  scope_type: string;
  scope_id: string;
  state: string;
  active_question_id: string | null;
};

function validateInput(input: IssueInterviewQuestionInput) {
  exactKeysWithRequired(input, ["candidate", "expectedSessionRevision", "idempotencyKey", "sessionId"], ["authorityOperationDigest", "queueFence", "transitionFrom"], "question command");
  if (!boundedId(input.sessionId)) throw conflict("Invalid interview session");
  if (!Number.isInteger(input.expectedSessionRevision) || input.expectedSessionRevision < 1) throw conflict("Invalid session revision");
  if (!/^[a-f0-9-]{20,80}$/i.test(input.idempotencyKey)) throw conflict("Invalid idempotency key");
  if ((input.authorityOperationDigest === undefined) !== (input.queueFence === undefined)) throw conflict("Question queue authority is incomplete");
  if (input.authorityOperationDigest !== undefined && !/^[a-f0-9]{64}$/.test(input.authorityOperationDigest)) throw conflict("Invalid question authority digest");
  if (input.queueFence) validateInterviewQueueFence(input.queueFence);
  const candidate = input.candidate;
  exactKeysWithRequired(candidate, ["destination", "evidenceFindings", "inference", "knowledgeKind", "prerequisiteKnowledge", "prompt", "recommendation", "schema"], ["requiresOwnerInput"], "question candidate");
  if (candidate.schema !== QUESTION_SCHEMA) throw conflict("Unknown question candidate schema");
  boundedText(candidate.prompt, 2_000, "question prompt");
  boundedText(candidate.knowledgeKind, 120, "knowledge kind");
  exactKeys(candidate.inference, ["label", "value"], "question inference");
  if (candidate.inference.label !== "Inference") throw conflict("Inference must remain explicitly labelled");
  boundedText(candidate.inference.value, 12_000, "question inference");
  if (candidate.requiresOwnerInput !== undefined && typeof candidate.requiresOwnerInput !== "boolean") throw conflict("Invalid owner-input requirement");
  if (candidate.requiresOwnerInput && candidate.recommendation !== null) throw conflict("Owner-input questions cannot carry a recommendation");
  if (!candidate.requiresOwnerInput && candidate.recommendation === null) throw conflict("Question recommendation is unavailable");
  if (candidate.recommendation) {
    exactKeys(candidate.recommendation, ["rationale", "value"], "question recommendation");
    boundedText(candidate.recommendation.rationale, 12_000, "question recommendation rationale");
    exactKeys(candidate.recommendation.value, ["excerpt"], "question recommendation value");
    boundedText(candidate.recommendation.value.excerpt, 12_000, "question recommendation value");
  }
  exactKeys(candidate.destination, ["id", "scopeType"], "question destination");
  if (!(candidate.destination.scopeType in DESTINATION_TABLES) || !boundedId(candidate.destination.id)) throw conflict("Invalid question destination");
  if (input.transitionFrom) {
    exactKeys(input.transitionFrom, ["id", "scopeType"], "question transition");
    if (!(input.transitionFrom.scopeType in DESTINATION_TABLES) || !boundedId(input.transitionFrom.id)) throw conflict("Invalid question transition");
  }
  if (!Array.isArray(candidate.evidenceFindings) || candidate.evidenceFindings.length > 20) throw conflict("Invalid question evidence");
  for (const finding of candidate.evidenceFindings) {
    exactKeys(finding, ["excerpt", "publishedAt", "retrievedAt", "sourceRef", "sourceTitle", "sourceType"], "evidence finding", true);
    boundedText(finding.sourceTitle, 500, "evidence source title");
    boundedText(finding.sourceRef, 2_000, "evidence source reference");
    boundedText(finding.sourceType, 120, "evidence source type");
    boundedText(finding.excerpt, 12_000, "evidence excerpt");
    optionalTimestamp(finding.publishedAt);
    optionalTimestamp(finding.retrievedAt);
  }
  // The command INSERT uses 11 fixed bindings plus three per prerequisite.
  // Queue-fenced issuance adds one manifest and one workspace binding through
  // a reusable CTE. D1 permits at most 100 bound parameters per query, so 29
  // remains the largest portable closed set (100 total bindings when fenced).
  if (!Array.isArray(candidate.prerequisiteKnowledge) || candidate.prerequisiteKnowledge.length > 29) throw conflict("Invalid question prerequisites");
  for (const prerequisite of candidate.prerequisiteKnowledge) {
    exactKeys(prerequisite, ["digest", "id"], "question prerequisite");
    if (!boundedId(prerequisite.id) || !/^[a-f0-9]{64}$/i.test(prerequisite.digest)) throw conflict("Invalid question prerequisite");
  }
}

async function currentDestination(database: D1Database, workspaceId: string, session: SessionRow) {
  const normalized = session.scope_type === "play" ? "market_play" : session.scope_type === "profile" ? "customer_profile" : session.scope_type;
  if (!(normalized in DESTINATION_TABLES)) throw conflict("Interview session has an unsupported destination");
  const scopeType = normalized as keyof typeof DESTINATION_TABLES;
  let destinationId = session.scope_id;
  if (scopeType === "company" && destinationId === workspaceId) {
    const rows = await database.prepare("SELECT id FROM companies WHERE workspace_id = ? ORDER BY created_at, id LIMIT 2").bind(workspaceId).all<{ id: string }>();
    if (rows.results.length !== 1) throw conflict("Interview Company destination is ambiguous");
    destinationId = rows.results[0].id;
  }
  const table = DESTINATION_TABLES[scopeType];
  const row = await database.prepare(`SELECT id FROM ${table} WHERE id = ? AND workspace_id = ? LIMIT 1`).bind(destinationId, workspaceId).first<{ id: string }>();
  if (!row) throw conflict("Interview destination is unavailable");
  return { scopeType, id: row.id };
}

async function assertCurrentPrerequisites(database: D1Database, workspaceId: string, prerequisites: Array<{ id: string; digest: string }>) {
  for (const prerequisite of prerequisites) {
    const row = await database.prepare(
      `SELECT kv.id FROM knowledge_versions kv
       JOIN knowledge_items ki ON ki.id = kv.knowledge_item_id AND ki.workspace_id = kv.workspace_id
       WHERE kv.id = ? AND kv.workspace_id = ? AND kv.status = 'confirmed'
         AND ki.current_version_id = kv.id AND COALESCE(kv.value_digest, kv.source_digest) = ? LIMIT 1`,
    ).bind(prerequisite.id, workspaceId, prerequisite.digest).first<{ id: string }>();
    if (!row) throw conflict("Question prerequisite is not the current confirmed Knowledge version");
  }
}

async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await database.prepare(
    `SELECT id FROM workspaces WHERE owner_subject IN (?, ?)
     ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string }>();
  if (!workspace) throw conflict("Workspace is not initialized");
  return workspace;
}

function canonicalCandidate(candidate: TrustedInterviewQuestionCandidate, destination: { scopeType: InterviewDestination["scopeType"]; id: string }, prerequisites: Array<{ id: string; digest: string }>) {
  return {
    schema: QUESTION_SCHEMA,
    prompt: candidate.prompt.trim(),
    evidenceFindings: candidate.evidenceFindings.map((finding) => ({
      sourceTitle: finding.sourceTitle.trim(),
      sourceRef: finding.sourceRef.trim(),
      sourceType: finding.sourceType.trim(),
      ...(finding.publishedAt === undefined ? {} : { publishedAt: finding.publishedAt }),
      ...(finding.retrievedAt === undefined ? {} : { retrievedAt: finding.retrievedAt }),
      excerpt: finding.excerpt.trim(),
    })),
    inference: { label: "Inference" as const, value: candidate.inference.value.trim() },
    recommendation: candidate.recommendation ? {
      rationale: candidate.recommendation.rationale.trim(),
      value: { excerpt: candidate.recommendation.value.excerpt.trim() },
    } : null,
    requiresOwnerInput: candidate.requiresOwnerInput === true,
    destination,
    prerequisiteKnowledge: prerequisites,
    knowledgeKind: candidate.knowledgeKind.trim(),
  };
}

const QUEUE_FENCE_GUARD = `AND EXISTS (
  WITH queue_fence(expected_manifest, workspace_id) AS (VALUES (?, ?))
  SELECT 1
  WHERE json_array_length((SELECT expected_manifest FROM queue_fence)) = 2
    + (SELECT COUNT(*) FROM companies c WHERE c.workspace_id = (SELECT workspace_id FROM queue_fence))
    + (SELECT COUNT(*) FROM products p WHERE p.workspace_id = (SELECT workspace_id FROM queue_fence))
    + (SELECT COUNT(*) FROM market_plays mp WHERE mp.workspace_id = (SELECT workspace_id FROM queue_fence))
    + (SELECT COUNT(*) FROM customer_profiles cp WHERE cp.workspace_id = (SELECT workspace_id FROM queue_fence))
    + (SELECT COUNT(*) FROM knowledge_items ki JOIN knowledge_versions kv ON kv.id=ki.current_version_id AND kv.workspace_id=ki.workspace_id WHERE ki.workspace_id = (SELECT workspace_id FROM queue_fence) AND kv.status='confirmed')
    + (SELECT COUNT(*) FROM proposal_decisions pd JOIN knowledge_proposals kp ON kp.id=pd.proposal_id AND kp.workspace_id=pd.workspace_id JOIN interview_answers ans ON ans.id=pd.answer_id AND ans.workspace_id=pd.workspace_id AND json_extract(ans.proposal_json,'$.knowledgeProposalId')=kp.id JOIN interview_questions q ON q.id=ans.question_id AND q.workspace_id=ans.workspace_id AND q.session_id=ans.session_id JOIN interview_confirmations ic ON ic.answer_id=ans.id AND ic.workspace_id=ans.workspace_id AND ic.question_id=q.id AND ic.session_id=ans.session_id AND ic.decision=pd.decision WHERE pd.workspace_id=(SELECT workspace_id FROM queue_fence) AND pd.decision<>'rescope' AND pd.reviewed_snapshot_digest=kp.proposal_digest)
    AND NOT EXISTS (
      SELECT 1 FROM json_each((SELECT expected_manifest FROM queue_fence)) expected
      WHERE CASE json_extract(expected.value, '$.category')
        WHEN 'workspace' THEN NOT EXISTS (
          SELECT 1 FROM workspaces w WHERE w.id=(SELECT workspace_id FROM queue_fence) AND w.revision=json_extract(expected.value,'$.revision'))
        WHEN 'session' THEN NOT EXISTS (
          SELECT 1 FROM interview_sessions s
          WHERE s.workspace_id=(SELECT workspace_id FROM queue_fence)
            AND json_object(
              'activeQuestionId',s.active_question_id,
              'category','session',
              'id',s.id,
              'revision',s.revision,
              'scopeId',CASE WHEN s.scope_type='company' AND s.scope_id=(SELECT workspace_id FROM queue_fence)
                THEN (SELECT c.id FROM companies c WHERE c.workspace_id=s.workspace_id LIMIT 1) ELSE s.scope_id END,
              'scopeType',CASE s.scope_type WHEN 'play' THEN 'market_play' WHEN 'profile' THEN 'customer_profile' ELSE s.scope_type END,
              'state',s.state
            )=json(expected.value))
        WHEN 'hierarchy' THEN NOT (
          EXISTS (SELECT 1 FROM companies c WHERE c.workspace_id=(SELECT workspace_id FROM queue_fence) AND json_object('category','hierarchy','createdAt',c.created_at,'id',c.id,'name',c.name,'parentId',NULL,'revision',c.revision,'type','company')=json(expected.value))
          OR EXISTS (SELECT 1 FROM products p WHERE p.workspace_id=(SELECT workspace_id FROM queue_fence) AND json_object('category','hierarchy','createdAt',p.created_at,'id',p.id,'name',p.name,'parentId',p.company_id,'revision',p.revision,'type','product')=json(expected.value))
          OR EXISTS (SELECT 1 FROM market_plays mp WHERE mp.workspace_id=(SELECT workspace_id FROM queue_fence) AND json_object('category','hierarchy','createdAt',mp.created_at,'id',mp.id,'name',mp.name,'parentId',mp.product_id,'revision',mp.revision,'type','market_play')=json(expected.value))
          OR EXISTS (SELECT 1 FROM customer_profiles cp WHERE cp.workspace_id=(SELECT workspace_id FROM queue_fence) AND json_object('category','hierarchy','createdAt',cp.created_at,'id',cp.id,'name',cp.name,'parentId',cp.play_id,'revision',cp.revision,'type','customer_profile')=json(expected.value)))
        WHEN 'knowledge' THEN NOT EXISTS (
          SELECT 1 FROM knowledge_items ki JOIN knowledge_versions kv ON kv.id=ki.current_version_id AND kv.workspace_id=ki.workspace_id
          WHERE ki.workspace_id=(SELECT workspace_id FROM queue_fence) AND kv.status='confirmed' AND json_object('category','knowledge','digest',COALESCE(kv.value_digest,kv.source_digest),'itemId',ki.id,'itemRevision',ki.revision,'kind',kv.kind,'scopeId',kv.scope_id,'scopeType',kv.scope_type,'versionId',kv.id,'versionRevision',kv.revision)=json(expected.value))
        WHEN 'review' THEN NOT EXISTS (
          SELECT 1 FROM proposal_decisions pd JOIN knowledge_proposals kp ON kp.id=pd.proposal_id AND kp.workspace_id=pd.workspace_id JOIN interview_answers ans ON ans.id=pd.answer_id AND ans.workspace_id=pd.workspace_id AND json_extract(ans.proposal_json,'$.knowledgeProposalId')=kp.id JOIN interview_questions q ON q.id=ans.question_id AND q.workspace_id=ans.workspace_id AND q.session_id=ans.session_id JOIN interview_confirmations ic ON ic.answer_id=ans.id AND ic.workspace_id=ans.workspace_id AND ic.question_id=q.id AND ic.session_id=ans.session_id AND ic.decision=pd.decision
          WHERE pd.workspace_id=(SELECT workspace_id FROM queue_fence) AND pd.decision<>'rescope' AND pd.reviewed_snapshot_digest=kp.proposal_digest AND json_object('answerId',ans.id,'category','review','confirmationId',ic.id,'decision',pd.decision,'decisionId',pd.id,'kind',kp.kind,'operationDigest',pd.operation_digest,'proposalId',kp.id,'questionId',q.id,'scopeId',kp.destination_scope_id,'scopeType',kp.destination_scope_type)=json(expected.value))
        ELSE 1
      END
    )
)`;

function queueFenceEntries(fence: InterviewQueueFence) {
  return [
    { category: "workspace", revision: fence.workspaceRevision },
    {
      activeQuestionId: fence.session.activeQuestionId,
      category: "session",
      id: fence.session.id,
      revision: fence.session.revision,
      scopeId: fence.session.scopeId,
      scopeType: fence.session.scopeType,
      state: fence.session.state,
    },
    ...fence.hierarchy.map((row) => ({
      category: "hierarchy", createdAt: Number(row.createdAt), id: row.id, name: row.name,
      parentId: row.parentId, revision: Number(row.revision), type: row.type,
    })),
    ...fence.currentKnowledge.map((row) => ({
      category: "knowledge", digest: row.digest, itemId: row.itemId, itemRevision: Number(row.itemRevision),
      kind: row.kind, scopeId: row.scopeId, scopeType: row.scopeType, versionId: row.versionId,
      versionRevision: Number(row.versionRevision),
    })),
    ...fence.reviewedSlots.map((row) => ({
      answerId: row.answerId, category: "review", confirmationId: row.confirmationId, decision: row.decision,
      decisionId: row.decisionId, kind: row.kind, operationDigest: row.operationDigest, proposalId: row.proposalId,
      questionId: row.questionId, scopeId: row.scopeId, scopeType: row.scopeType,
    })),
  ];
}

export const MAX_INTERVIEW_QUEUE_FENCE_ENTRIES = 256;
export const MAX_INTERVIEW_QUEUE_FENCE_BYTES = 65_536;

export function validateInterviewQueueFence(fence: InterviewQueueFence) {
  exactKeys(fence, ["currentKnowledge", "hierarchy", "reviewedSlots", "session", "workspaceRevision"], "question queue fence");
  if (!Number.isSafeInteger(fence.workspaceRevision) || fence.workspaceRevision < 1) throw conflict("Invalid question queue fence");
  if (!Array.isArray(fence.hierarchy) || !Array.isArray(fence.currentKnowledge) || !Array.isArray(fence.reviewedSlots)) throw conflict("Invalid question queue fence");
  exactKeys(fence.session, ["activeQuestionId", "id", "revision", "scopeId", "scopeType", "state"], "question session fence");
  if (!boundedId(fence.session.id) || !boundedId(fence.session.scopeId) || !Number.isSafeInteger(fence.session.revision) || fence.session.revision < 1 ||
      !["open", "completed"].includes(fence.session.state) || fence.session.activeQuestionId !== null ||
      !["company", "product", "market_play", "customer_profile", "offer"].includes(fence.session.scopeType)) throw conflict("Invalid question session fence");
  const hierarchyIds = new Set<string>();
  for (const row of fence.hierarchy) {
    exactKeys(row, ["createdAt", "id", "name", "parentId", "revision", "type"], "question hierarchy fence row");
    if (!boundedId(row.id) || !["company", "product", "market_play", "customer_profile"].includes(row.type) || (row.parentId !== null && !boundedId(row.parentId)) || typeof row.name !== "string" || !row.name.trim() || row.name.length > 160 || !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isSafeInteger(row.createdAt) || row.createdAt < 0 || hierarchyIds.has(row.id)) throw conflict("Invalid question hierarchy fence row");
    hierarchyIds.add(row.id);
  }
  const knowledgeItems = new Set<string>();
  const knowledgeVersions = new Set<string>();
  const knowledgeSlots = new Set<string>();
  for (const row of fence.currentKnowledge) {
    exactKeys(row, ["digest", "itemId", "itemRevision", "kind", "scopeId", "scopeType", "versionId", "versionRevision"], "question Knowledge fence row");
    const slot = `${row.scopeType}\u0000${row.scopeId}\u0000${row.kind}`;
    if (![row.itemId, row.scopeId, row.versionId].every(boundedId) || !/^[a-f0-9]{64}$/.test(row.digest) || typeof row.kind !== "string" || !row.kind.trim() || row.kind.length > 160 || typeof row.scopeType !== "string" || row.scopeType.length > 32 || !Number.isSafeInteger(row.itemRevision) || row.itemRevision < 1 || !Number.isSafeInteger(row.versionRevision) || row.versionRevision < 1 || knowledgeItems.has(row.itemId) || knowledgeVersions.has(row.versionId) || knowledgeSlots.has(slot)) throw conflict("Invalid question Knowledge fence row");
    knowledgeItems.add(row.itemId); knowledgeVersions.add(row.versionId); knowledgeSlots.add(slot);
  }
  const reviewedIds = new Set<string>();
  const reviewedSlots = new Set<string>();
  for (const row of fence.reviewedSlots) {
    exactKeys(row, ["answerId", "confirmationId", "decision", "decisionId", "kind", "operationDigest", "proposalId", "questionId", "scopeId", "scopeType"], "question review fence row");
    const ids = [row.answerId, row.confirmationId, row.decisionId, row.proposalId, row.questionId];
    const slot = `${row.scopeType}\u0000${row.scopeId}\u0000${row.kind}`;
    if (![...ids, row.scopeId].every(boundedId) || ids.some((id) => reviewedIds.has(id)) || reviewedSlots.has(slot) || !["accept", "reject", "correct"].includes(row.decision) || !/^[a-f0-9]{64}$/.test(row.operationDigest) || typeof row.kind !== "string" || !row.kind.trim() || row.kind.length > 160 || typeof row.scopeType !== "string" || row.scopeType.length > 32) throw conflict("Invalid question review fence row");
    ids.forEach((id) => reviewedIds.add(id)); reviewedSlots.add(slot);
  }
  const entries = queueFenceEntries(fence);
  if (entries.length > MAX_INTERVIEW_QUEUE_FENCE_ENTRIES || new TextEncoder().encode(stableJson(entries)).byteLength > MAX_INTERVIEW_QUEUE_FENCE_BYTES) throw conflict("Question queue fence exceeds its safe bound");
}

function exactKeysWithRequired(value: unknown, required: string[], optional: string[], label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw conflict(`Invalid ${label}`);
  const actual = Object.keys(value);
  if (required.some((key) => !actual.includes(key)) || actual.some((key) => !required.includes(key) && !optional.includes(key))) throw conflict(`Invalid ${label}`);
}

function canonicalPrerequisites(prerequisites: Array<{ id: string; digest: string }>) {
  const sorted = prerequisites.map(({ id, digest }) => ({ id, digest: digest.toLowerCase() }))
    .sort((left, right) => `${left.id}:${left.digest}`.localeCompare(`${right.id}:${right.digest}`));
  if (new Set(sorted.map(({ id }) => id)).size !== sorted.length) throw conflict("Question prerequisites must be unique");
  return sorted;
}

function exactKeys(value: unknown, keys: string[], label: string, optional = false) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw conflict(`Invalid ${label}`);
  const actual = Object.keys(value).sort();
  const allowed = [...keys].sort();
  if (optional ? actual.some((key) => !allowed.includes(key)) : stableJson(actual) !== stableJson(allowed)) throw conflict(`Invalid ${label}`);
}

function boundedText(value: unknown, max: number, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw conflict(`Invalid ${label}`);
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

function optionalTimestamp(value: unknown) {
  if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0)) throw conflict("Invalid evidence timestamp");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isConstraint(error: unknown) {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}

function conflict(message: string) {
  return new InterviewConflictError(message);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
