export const PILOT_COMPANY_NAME = "Digitalrain";
export const INITIAL_QUESTION = {
  prompt: "How should historian evidence affect data-readiness scoring?",
  evidence:
    "A public source can confirm that a site operates a connected plant historian.",
  inference:
    "Connectivity makes integration plausible, but access, quality, and internal permission remain unknown.",
  recommendation:
    "Score 1 — partial readiness. Reserve score 2 for sourced evidence that usable operational data is accessible.",
} as const;

export type InterviewPrincipal = {
  subject: string;
  displayName: string;
};

export type InterviewState =
  | { status: "uninitialized"; displayName: string }
  | {
      status: "active";
      displayName: string;
      workspace: { id: string; companyName: string };
      session: { id: string; revision: number };
      question: {
        id: string;
        revision: number;
        prompt: string;
        evidence: string;
        inference: string;
        recommendation: string;
      };
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
): Promise<InterviewPrincipal> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 320) throw new Error("Invalid identity");
  return { subject: await sha256(`prospector-owner:${normalized}`), displayName };
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

  const active = await database
    .prepare(
      `SELECT s.id AS session_id, s.revision AS session_revision,
              q.id AS question_id, q.revision AS question_revision,
              q.prompt, q.research_json, q.recommendation
       FROM interview_sessions s
       JOIN interview_questions q
         ON q.id = s.active_question_id AND q.workspace_id = s.workspace_id
       WHERE s.workspace_id = ? AND s.state = 'awaiting_answer'
         AND q.status = 'active'
       LIMIT 1`,
    )
    .bind(workspace.id)
    .first<{
      session_id: string;
      session_revision: number;
      question_id: string;
      question_revision: number;
      prompt: string;
      research_json: string;
      recommendation: string;
    }>();

  if (!active) throw new InterviewConflictError("Interview state is incomplete");
  const research = JSON.parse(active.research_json) as {
    evidence: string;
    inference: string;
  };
  return {
    status: "active",
    displayName: principal.displayName,
    workspace: { id: workspace.id, companyName: workspace.company_name },
    session: { id: active.session_id, revision: active.session_revision },
    question: {
      id: active.question_id,
      revision: active.question_revision,
      prompt: active.prompt,
      evidence: research.evidence,
      inference: research.inference,
      recommendation: active.recommendation,
    },
  };
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
          evidence: INITIAL_QUESTION.evidence,
          inference: INITIAL_QUESTION.inference,
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

export async function confirmRecommendation(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { questionId: string; expectedRevision: number; idempotencyKey: string },
): Promise<InterviewState> {
  if (!/^iq_[a-f0-9]{24}$/.test(input.questionId))
    throw new InterviewConflictError("Unknown question");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new InterviewConflictError("Invalid revision");
  if (!/^[a-f0-9-]{20,80}$/i.test(input.idempotencyKey))
    throw new InterviewConflictError("Invalid idempotency key");

  const workspace = await database
    .prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1")
    .bind(principal.subject)
    .first<{ id: string }>();
  if (!workspace) throw new InterviewConflictError("Workspace is not initialized");

  const previous = await database
    .prepare(
      "SELECT id FROM interview_answers WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
    )
    .bind(workspace.id, input.idempotencyKey)
    .first<{ id: string }>();
  if (previous) return readInterviewState(database, principal);

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
    throw new InterviewConflictError("This question changed; reload before deciding");

  const digest = await sha256(`${workspace.id}:${input.idempotencyKey}`);
  const answerId = `ia_${digest.slice(0, 24)}`;
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

  try {
    await database.batch([
      database
        .prepare(
          `UPDATE interview_questions SET status = 'closed', revision = revision + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND status = 'active' AND revision = ?`,
        )
        .bind(now, current.id, workspace.id, input.expectedRevision),
      database
        .prepare(
          `UPDATE interview_sessions SET state = 'completed', active_question_id = NULL,
                  revision = revision + 1, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND state = 'awaiting_answer'`,
        )
        .bind(now, current.session_id, workspace.id),
      database
        .prepare(
          `INSERT INTO interview_answers
           (id, workspace_id, session_id, question_id, question_revision, choice, correction_json, idempotency_key, created_at)
           VALUES (?, ?, ?, ?, ?, 'accept_recommendation', NULL, ?, ?)`,
        )
        .bind(
          answerId,
          workspace.id,
          current.session_id,
          current.id,
          input.expectedRevision,
          input.idempotencyKey,
          now,
        ),
      database
        .prepare(
          `INSERT INTO knowledge_versions
           (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id, kind, value_json, status, source_digest)
           VALUES (?, ?, ?, ?, 1, 'company', ?, 'data_readiness_scoring', ?, 'confirmed', ?)`,
        )
        .bind(
          knowledgeId,
          workspace.id,
          now,
          now,
          workspace.id,
          JSON.stringify(value),
          await sha256(`${INITIAL_QUESTION.prompt}:${INITIAL_QUESTION.recommendation}`),
        ),
      database
        .prepare(
          `INSERT INTO interview_confirmations
           (id, workspace_id, session_id, question_id, answer_id, decision, knowledge_version_id, idempotency_key, created_at)
           VALUES (?, ?, ?, ?, ?, 'accept', ?, ?, ?)`,
        )
        .bind(
          confirmationId,
          workspace.id,
          current.session_id,
          current.id,
          answerId,
          knowledgeId,
          input.idempotencyKey,
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
            questionRevision: input.expectedRevision,
            knowledgeVersionId: knowledgeId,
            decision: "accept",
          }),
          now,
        ),
    ]);
  } catch {
    const retry = await database
      .prepare(
        "SELECT id FROM interview_answers WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
      )
      .bind(workspace.id, input.idempotencyKey)
      .first<{ id: string }>();
    if (!retry) throw new InterviewConflictError("Another decision won; reload before deciding");
  }
  return readInterviewState(database, principal);
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

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
