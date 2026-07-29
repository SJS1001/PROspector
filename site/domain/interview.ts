export const PILOT_COMPANY_NAME = "Digitalrain";
export const INITIAL_QUESTION = {
  prompt: "How should historian evidence affect data-readiness scoring?",
  premise:
    "A public source may establish that a site operates a connected plant historian.",
  inference:
    "Connectivity makes integration plausible, but access, quality, and internal permission remain unknown.",
  provenance:
    "Owner policy question derived from the agreed ONE for Mining qualification rubric; it is not an external factual claim.",
  recommendation:
    "Score 1 — partial readiness. Reserve score 2 for sourced evidence that usable operational data is accessible.",
} as const;

export type InterviewPrincipal = { subject: string; displayName: string };

type QuestionView = {
  id: string;
  revision: number;
  prompt: string;
  premise: string;
  inference: string;
  provenance: string;
  recommendation: string;
};

export type InterviewState =
  | { status: "uninitialized"; displayName: string }
  | {
      status: "active";
      displayName: string;
      workspace: { id: string; companyName: string };
      session: { id: string; revision: number };
      question: QuestionView;
    }
  | {
      status: "awaiting_confirmation";
      displayName: string;
      workspace: { id: string; companyName: string };
      session: { id: string; revision: number };
      question: QuestionView;
      answer: { id: string; operationDigest: string; submittedAt: number };
    }
  | {
      status: "confirmed";
      displayName: string;
      workspace: { id: string; companyName: string };
      confirmed: {
        knowledgeVersionId: string;
        value: { score: number; classification: string; rationale: string };
        confirmedAt: number;
        auditEventId: string;
      };
    };

export class InterviewConflictError extends Error {
  readonly code = "interview_conflict";
}

export async function principalFromIdentity(
  email: string,
  displayName: string,
  subjectPepper: string,
): Promise<InterviewPrincipal> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 320) throw new Error("Invalid identity");
  if (subjectPepper.length < 32) throw new Error("Identity protection is unavailable");
  return {
    subject: await hmacSha256(subjectPepper, `prospector-owner:${normalized}`),
    displayName,
  };
}

export async function readInterviewState(
  database: D1Database,
  principal: InterviewPrincipal,
): Promise<InterviewState> {
  const workspace = await database
    .prepare("SELECT id, company_name FROM workspaces WHERE owner_subject = ? LIMIT 1")
    .bind(principal.subject)
    .first<{ id: string; company_name: string }>();
  if (!workspace) return { status: "uninitialized", displayName: principal.displayName };

  const confirmed = await database
    .prepare(
      `SELECT c.knowledge_version_id, c.created_at, k.value_json, a.id AS audit_id
       FROM interview_confirmations c
       JOIN knowledge_versions k
         ON k.id = c.knowledge_version_id AND k.workspace_id = c.workspace_id
       JOIN audit_events a
         ON a.subject_id = c.id AND a.workspace_id = c.workspace_id
        AND a.action = 'interview.recommendation_confirmed'
       WHERE c.workspace_id = ? AND c.decision = 'accept'
       ORDER BY c.created_at DESC LIMIT 1`,
    )
    .bind(workspace.id)
    .first<{
      knowledge_version_id: string;
      created_at: number;
      value_json: string;
      audit_id: string;
    }>();
  if (confirmed) {
    return {
      status: "confirmed",
      displayName: principal.displayName,
      workspace: { id: workspace.id, companyName: workspace.company_name },
      confirmed: {
        knowledgeVersionId: confirmed.knowledge_version_id,
        value: JSON.parse(confirmed.value_json),
        confirmedAt: confirmed.created_at,
        auditEventId: confirmed.audit_id,
      },
    };
  }

  const current = await database
    .prepare(
      `SELECT s.id AS session_id, s.revision AS session_revision, s.state,
              q.id AS question_id, q.revision AS question_revision,
              q.prompt, q.research_json, q.recommendation,
              ans.id AS answer_id, ans.operation_digest, ans.created_at AS answer_created_at
       FROM interview_sessions s
       JOIN interview_questions q
         ON q.id = s.active_question_id AND q.workspace_id = s.workspace_id
       LEFT JOIN interview_answers ans
         ON ans.question_id = q.id AND ans.workspace_id = q.workspace_id
       WHERE s.workspace_id = ?
         AND s.state IN ('awaiting_answer', 'awaiting_confirmation')
       ORDER BY s.created_at DESC LIMIT 1`,
    )
    .bind(workspace.id)
    .first<{
      session_id: string;
      session_revision: number;
      state: "awaiting_answer" | "awaiting_confirmation";
      question_id: string;
      question_revision: number;
      prompt: string;
      research_json: string;
      recommendation: string;
      answer_id: string | null;
      operation_digest: string | null;
      answer_created_at: number | null;
    }>();
  if (!current) throw new InterviewConflictError("Interview state is incomplete");

  const research = JSON.parse(current.research_json) as {
    premise?: string;
    evidence?: string;
    inference?: string;
    provenance?: string;
  };
  const question: QuestionView = {
    id: current.question_id,
    revision: current.question_revision,
    prompt: current.prompt,
    premise: research.premise ?? research.evidence ?? "No premise was recorded.",
    inference: research.inference ?? "No inference was recorded.",
    provenance:
      research.provenance ??
      "Legacy policy question created before provenance was stored separately.",
    recommendation: current.recommendation,
  };
  const base = {
    displayName: principal.displayName,
    workspace: { id: workspace.id, companyName: workspace.company_name },
    session: { id: current.session_id, revision: current.session_revision },
    question,
  };
  if (current.state === "awaiting_confirmation") {
    if (!current.answer_id || !current.operation_digest || current.answer_created_at === null)
      throw new InterviewConflictError("Submitted answer is incomplete");
    return {
      status: "awaiting_confirmation",
      ...base,
      answer: {
        id: current.answer_id,
        operationDigest: current.operation_digest,
        submittedAt: current.answer_created_at,
      },
    };
  }
  return { status: "active", ...base };
}

export async function bootstrapInterview(
  database: D1Database,
  principal: InterviewPrincipal,
): Promise<InterviewState> {
  const ids = idsFor(principal.subject);
  const now = Date.now();
  await database.batch([
    database
      .prepare(
        "INSERT OR IGNORE INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)",
      )
      .bind(ids.workspace, PILOT_COMPANY_NAME, principal.subject, now, now),
    database
      .prepare(
        `INSERT OR IGNORE INTO interview_sessions
         (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id, state, active_question_id)
         VALUES (?, ?, ?, ?, 1, 'company', ?, 'awaiting_answer', ?)`,
      )
      .bind(ids.session, ids.workspace, now, now, ids.workspace, ids.question),
    database
      .prepare(
        `INSERT OR IGNORE INTO interview_questions
         (id, workspace_id, created_at, updated_at, revision, session_id, version, prompt, research_json, recommendation, status)
         VALUES (?, ?, ?, ?, 1, ?, 1, ?, ?, ?, 'active')`,
      )
      .bind(
        ids.question,
        ids.workspace,
        now,
        now,
        ids.session,
        INITIAL_QUESTION.prompt,
        JSON.stringify({
          premise: INITIAL_QUESTION.premise,
          inference: INITIAL_QUESTION.inference,
          provenance: INITIAL_QUESTION.provenance,
        }),
        INITIAL_QUESTION.recommendation,
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO audit_events
         (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
         VALUES (?, ?, 'owner', ?, 'workspace.interview_initialized', 'interview_session', ?, ?, ?)`,
      )
      .bind(
        ids.bootstrapAudit,
        ids.workspace,
        principal.subject,
        ids.session,
        JSON.stringify({ questionVersion: 1 }),
        now,
      ),
  ]);
  return readInterviewState(database, principal);
}

export async function submitRecommendationAnswer(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { questionId: string; expectedRevision: number; idempotencyKey: string },
): Promise<InterviewState> {
  validateQuestionInput(input);
  const [workspace, operationDigest] = await Promise.all([
    ownedWorkspace(database, principal),
    sha256(
      JSON.stringify({
        action: "submit_recommendation_answer",
        questionId: input.questionId,
        expectedRevision: input.expectedRevision,
        choice: "accept_recommendation",
      }),
    ),
  ]);
  const previous = await database
    .prepare(
      "SELECT operation_digest FROM interview_answers WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
    )
    .bind(workspace.id, input.idempotencyKey)
    .first<{ operation_digest: string }>();
  if (previous) {
    if (previous.operation_digest !== operationDigest)
      throw new InterviewConflictError("Idempotency key was used for another operation");
    return readInterviewState(database, principal);
  }

  const current = await database
    .prepare(
      `SELECT q.id, q.revision, q.session_id
       FROM interview_questions q
       JOIN interview_sessions s
         ON s.id = q.session_id AND s.workspace_id = q.workspace_id
       WHERE q.workspace_id = ? AND q.id = ? AND q.status = 'active'
         AND s.state = 'awaiting_answer' AND s.active_question_id = q.id
       LIMIT 1`,
    )
    .bind(workspace.id, input.questionId)
    .first<{ id: string; revision: number; session_id: string }>();
  if (!current || current.revision !== input.expectedRevision)
    throw new InterviewConflictError("This question changed; reload before answering");

  const digest = await sha256(`${workspace.id}:${input.idempotencyKey}`);
  const answerId = `ia_${digest.slice(0, 24)}`;
  const auditId = `ae_${digest.slice(0, 24)}`;
  const now = Date.now();
  try {
    await database.batch([
      database
        .prepare(
          `UPDATE interview_questions SET status = 'answered', revision = revision + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND status = 'active' AND revision = ?`,
        )
        .bind(now, current.id, workspace.id, input.expectedRevision),
      database
        .prepare(
          `UPDATE interview_sessions SET state = 'awaiting_confirmation',
                  revision = revision + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND state = 'awaiting_answer'`,
        )
        .bind(now, current.session_id, workspace.id),
      database
        .prepare(
          `INSERT INTO interview_answers
           (id, workspace_id, session_id, question_id, question_revision, choice,
            correction_json, idempotency_key, operation_digest, created_at)
           VALUES (?, ?, ?, ?, ?, 'accept_recommendation', NULL, ?, ?, ?)`,
        )
        .bind(
          answerId,
          workspace.id,
          current.session_id,
          current.id,
          input.expectedRevision,
          input.idempotencyKey,
          operationDigest,
          now,
        ),
      database
        .prepare(
          `INSERT INTO audit_events
           (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
           VALUES (?, ?, 'owner', ?, 'interview.answer_submitted', 'interview_answer', ?, ?, ?)`,
        )
        .bind(
          auditId,
          workspace.id,
          principal.subject,
          answerId,
          JSON.stringify({ questionRevision: input.expectedRevision, operationDigest }),
          now,
        ),
    ]);
  } catch {
    const retry = await database
      .prepare(
        "SELECT operation_digest FROM interview_answers WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
      )
      .bind(workspace.id, input.idempotencyKey)
      .first<{ operation_digest: string }>();
    if (!retry || retry.operation_digest !== operationDigest)
      throw new InterviewConflictError("Another answer won; reload before answering");
  }
  return readInterviewState(database, principal);
}

export async function confirmSubmittedAnswer(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { answerId: string; expectedSessionRevision: number; idempotencyKey: string },
): Promise<InterviewState> {
  if (!/^ia_[a-f0-9]{24}$/.test(input.answerId))
    throw new InterviewConflictError("Unknown answer");
  if (!Number.isInteger(input.expectedSessionRevision) || input.expectedSessionRevision < 2)
    throw new InterviewConflictError("Invalid session revision");
  validateIdempotencyKey(input.idempotencyKey);
  const workspace = await ownedWorkspace(database, principal);

  const answer = await database
    .prepare(
      `SELECT ans.id AS answer_id, ans.operation_digest AS answer_digest,
              ans.question_id, ans.session_id
       FROM interview_answers ans
       WHERE ans.workspace_id = ? AND ans.id = ? LIMIT 1`,
    )
    .bind(workspace.id, input.answerId)
    .first<{
      answer_id: string;
      answer_digest: string;
      question_id: string;
      session_id: string;
    }>();
  const [operationDigest, previous] = await Promise.all([
    sha256(
      JSON.stringify({
        action: "confirm_submitted_answer",
        answerId: input.answerId,
        expectedSessionRevision: input.expectedSessionRevision,
        answerDigest: answer?.answer_digest ?? "missing",
        decision: "accept",
      }),
    ),
    database
      .prepare(
        "SELECT operation_digest FROM interview_confirmations WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
      )
      .bind(workspace.id, input.idempotencyKey)
      .first<{ operation_digest: string }>(),
  ]);
  if (previous) {
    if (previous.operation_digest !== operationDigest)
      throw new InterviewConflictError("Idempotency key was used for another operation");
    return readInterviewState(database, principal);
  }
  if (!answer) throw new InterviewConflictError("This answer changed; reload before confirming");

  const current = await database
    .prepare(
      `SELECT ans.id AS answer_id, ans.operation_digest AS answer_digest,
              ans.question_id, ans.session_id, q.revision AS question_revision
       FROM interview_answers ans
       JOIN interview_sessions s
         ON s.id = ans.session_id AND s.workspace_id = ans.workspace_id
       JOIN interview_questions q
         ON q.id = ans.question_id AND q.workspace_id = ans.workspace_id
       WHERE ans.workspace_id = ? AND ans.id = ?
         AND s.state = 'awaiting_confirmation' AND s.revision = ?
         AND s.active_question_id = q.id AND q.status = 'answered'
       LIMIT 1`,
    )
    .bind(workspace.id, input.answerId, input.expectedSessionRevision)
    .first<{
      answer_id: string;
      answer_digest: string;
      question_id: string;
      session_id: string;
      question_revision: number;
    }>();
  if (!current) throw new InterviewConflictError("This answer changed; reload before confirming");

  const digest = await sha256(`${workspace.id}:${input.idempotencyKey}`);
  const confirmationId = `ic_${digest.slice(0, 24)}`;
  const knowledgeId = `kv_${digest.slice(0, 24)}`;
  const auditId = `ae_${digest.slice(0, 24)}`;
  const now = Date.now();
  const value = {
    score: 1,
    classification: "partial_readiness",
    rationale:
      "Historian connectivity demonstrates feasibility, not confirmed permission or usable data access.",
  };
  const sourceDigest = await sha256(JSON.stringify(INITIAL_QUESTION));
  try {
    await database.batch([
      database
        .prepare(
          `UPDATE interview_questions SET status = 'closed', revision = revision + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND status = 'answered' AND revision = ?`,
        )
        .bind(now, current.question_id, workspace.id, current.question_revision),
      database
        .prepare(
          `UPDATE interview_sessions SET state = 'completed', active_question_id = NULL,
                  revision = revision + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND state = 'awaiting_confirmation' AND revision = ?`,
        )
        .bind(now, current.session_id, workspace.id, input.expectedSessionRevision),
      database
        .prepare(
          `INSERT INTO knowledge_versions
           (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id,
            kind, value_json, status, source_digest)
           VALUES (?, ?, ?, ?, 1, 'company', ?, 'data_readiness_scoring', ?, 'confirmed', ?)`,
        )
        .bind(
          knowledgeId,
          workspace.id,
          now,
          now,
          workspace.id,
          JSON.stringify(value),
          sourceDigest,
        ),
      database
        .prepare(
          `INSERT INTO interview_confirmations
           (id, workspace_id, session_id, question_id, answer_id, decision,
            knowledge_version_id, idempotency_key, operation_digest, created_at)
           VALUES (?, ?, ?, ?, ?, 'accept', ?, ?, ?, ?)`,
        )
        .bind(
          confirmationId,
          workspace.id,
          current.session_id,
          current.question_id,
          current.answer_id,
          knowledgeId,
          input.idempotencyKey,
          operationDigest,
          now,
        ),
      database
        .prepare(
          `INSERT INTO audit_events
           (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
           VALUES (?, ?, 'owner', ?, 'interview.recommendation_confirmed', 'interview_confirmation', ?, ?, ?)`,
        )
        .bind(
          auditId,
          workspace.id,
          principal.subject,
          confirmationId,
          JSON.stringify({
            answerId: current.answer_id,
            answerDigest: current.answer_digest,
            knowledgeVersionId: knowledgeId,
            decision: "accept",
          }),
          now,
        ),
    ]);
  } catch {
    const retry = await database
      .prepare(
        "SELECT operation_digest FROM interview_confirmations WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
      )
      .bind(workspace.id, input.idempotencyKey)
      .first<{ operation_digest: string }>();
    if (!retry || retry.operation_digest !== operationDigest)
      throw new InterviewConflictError("Another confirmation won; reload before confirming");
  }
  return readInterviewState(database, principal);
}

function validateQuestionInput(input: {
  questionId: string;
  expectedRevision: number;
  idempotencyKey: string;
}) {
  if (!/^iq_[a-f0-9]{24}$/.test(input.questionId))
    throw new InterviewConflictError("Unknown question");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new InterviewConflictError("Invalid revision");
  validateIdempotencyKey(input.idempotencyKey);
}

function validateIdempotencyKey(value: string) {
  if (!/^[a-f0-9-]{20,80}$/i.test(value))
    throw new InterviewConflictError("Invalid idempotency key");
}

async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await database
    .prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1")
    .bind(principal.subject)
    .first<{ id: string }>();
  if (!workspace) throw new InterviewConflictError("Workspace is not initialized");
  return workspace;
}

function idsFor(subject: string) {
  const suffix = subject.slice(0, 24);
  return {
    workspace: `ws_${suffix}`,
    session: `is_${suffix}`,
    question: `iq_${suffix}`,
    bootstrapAudit: `ae_boot_${suffix}`,
  };
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return hex(new Uint8Array(signature));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
