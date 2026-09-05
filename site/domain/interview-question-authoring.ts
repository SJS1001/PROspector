import { v7 } from "uuid";

import {
  InterviewConflictError,
  readInterviewState,
  type InterviewDestination,
  type InterviewEvidenceFinding,
  type InterviewPrincipal,
  type InterviewState,
} from "./interview";

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
  recommendation: { rationale: string; value: { excerpt: string } };
  destination: { scopeType: InterviewDestination["scopeType"]; id: string };
  prerequisiteKnowledge: Array<{ id: string; digest: string }>;
  knowledgeKind: string;
};

export type IssueInterviewQuestionInput = {
  sessionId: string;
  expectedSessionRevision: number;
  idempotencyKey: string;
  candidate: TrustedInterviewQuestionCandidate;
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
  if (
    input.candidate.destination.scopeType !== destination.scopeType ||
    input.candidate.destination.id !== destination.id
  ) throw conflict("Question destination is not the session's current destination");

  const prerequisites = canonicalPrerequisites(input.candidate.prerequisiteKnowledge);
  if (stableJson(prerequisites) !== stableJson(input.candidate.prerequisiteKnowledge)) {
    throw conflict("Question prerequisites must be unique and canonically ordered");
  }
  const candidate = canonicalCandidate(input.candidate, destination, prerequisites);
  const operationDigest = await sha256(stableJson({
    action: "interview.question.issue",
    workspaceId: workspace.id,
    sessionId: session.id,
    expectedSessionRevision: input.expectedSessionRevision,
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
    recommendationValue: candidate.recommendation.value,
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
         ${prerequisiteGuards}`,
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
        candidate.recommendation.rationale,
        commandId,
        workspace.id,
      ),
      database.prepare(
        `UPDATE interview_sessions
         SET state = 'awaiting_answer', active_question_id = ?, updated_at = ?, revision = revision + 1
         WHERE id = ? AND workspace_id = ? AND revision = ?
           AND state IN ('open', 'completed') AND active_question_id IS NULL
           AND EXISTS (SELECT 1 FROM interview_questions WHERE id = ? AND workspace_id = ?)`,
      ).bind(
        questionId,
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
  exactKeys(input, ["candidate", "expectedSessionRevision", "idempotencyKey", "sessionId"], "question command");
  if (!boundedId(input.sessionId)) throw conflict("Invalid interview session");
  if (!Number.isInteger(input.expectedSessionRevision) || input.expectedSessionRevision < 1) throw conflict("Invalid session revision");
  if (!/^[a-f0-9-]{20,80}$/i.test(input.idempotencyKey)) throw conflict("Invalid idempotency key");
  const candidate = input.candidate;
  exactKeys(candidate, ["destination", "evidenceFindings", "inference", "knowledgeKind", "prerequisiteKnowledge", "prompt", "recommendation", "schema"], "question candidate");
  if (candidate.schema !== QUESTION_SCHEMA) throw conflict("Unknown question candidate schema");
  boundedText(candidate.prompt, 2_000, "question prompt");
  boundedText(candidate.knowledgeKind, 120, "knowledge kind");
  exactKeys(candidate.inference, ["label", "value"], "question inference");
  if (candidate.inference.label !== "Inference") throw conflict("Inference must remain explicitly labelled");
  boundedText(candidate.inference.value, 12_000, "question inference");
  exactKeys(candidate.recommendation, ["rationale", "value"], "question recommendation");
  boundedText(candidate.recommendation.rationale, 12_000, "question recommendation rationale");
  exactKeys(candidate.recommendation.value, ["excerpt"], "question recommendation value");
  boundedText(candidate.recommendation.value.excerpt, 12_000, "question recommendation value");
  exactKeys(candidate.destination, ["id", "scopeType"], "question destination");
  if (!(candidate.destination.scopeType in DESTINATION_TABLES) || !boundedId(candidate.destination.id)) throw conflict("Invalid question destination");
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
  // D1 permits at most 100 bound parameters per query, so 29 is the largest
  // portable closed set (98 total bindings).
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
    recommendation: {
      rationale: candidate.recommendation.rationale.trim(),
      value: { excerpt: candidate.recommendation.value.excerpt.trim() },
    },
    destination,
    prerequisiteKnowledge: prerequisites,
    knowledgeKind: candidate.knowledgeKind.trim(),
  };
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
