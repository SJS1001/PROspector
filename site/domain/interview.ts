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

export type InterviewPrincipal = {
  subject: string;
  legacySubject: string;
  displayName: string;
};

type QuestionView = {
  id: string;
  revision: number;
  prompt: string;
  premise: string;
  inference: string;
  provenance: string;
  recommendation: string;
};

type ProposalSnapshot = {
  questionId: string;
  questionRevision: number;
  prompt: string;
  premise: string;
  inference: string;
  provenance: string;
  recommendation: string;
  value: { score: number; classification: string; rationale: string };
};

/**
 * The public, research-first command surface.  These shapes intentionally keep
 * evidence, inference, recommendation, destination, and prerequisites apart:
 * a caller cannot turn a recommendation into a fact by serialising one blob.
 */
export type InterviewEvidenceFinding = {
  sourceTitle: string;
  sourceRef: string;
  sourceType: string;
  publishedAt?: number;
  retrievedAt?: number;
  excerpt: string;
};
export type InterviewDestination = {
  scopeType: "company" | "product" | "market_play" | "customer_profile" | "offer";
  locator: string;
};
export type SubmitInterviewAnswerInput = {
  questionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  answer: "use_recommendation" | "write_correction" | "change_scope";
  value?: { excerpt: string };
  reason?: string;
  destination?: InterviewDestination;
};
export type RecordInterviewDecisionInput = {
  answerId: string;
  expectedSessionRevision: number;
  expectedQuestionRevision?: number;
  idempotencyKey: string;
  decision: "accept" | "reject" | "correct" | "rescope";
  value?: { excerpt: string };
  reason?: string;
  destination?: InterviewDestination;
  predecessorVersionId?: string;
};
type GeneralizedProposalSnapshot = {
  schema: "consensus-interview/v1";
  questionId: string;
  questionRevision: number;
  sessionRevision: number;
  evidenceFindings: InterviewEvidenceFinding[];
  inference: { label: string; value: string };
  recommendation: { rationale: string; value?: { excerpt: string } };
  destination: InterviewDestination;
  prerequisiteKnowledge: Array<{ id: string; digest: string }>;
  answer: SubmitInterviewAnswerInput["answer"];
  value: { excerpt: string };
  reason?: string;
  knowledgeProposalId: string;
  knowledgeProposalDigest: string;
  kind: string;
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
      status: "review_required";
      displayName: string;
      workspace: { id: string; companyName: string };
      reason: "legacy_unbound_decision";
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
    legacySubject: await sha256(`prospector-owner:${normalized}`),
    displayName,
  };
}

export async function readInterviewState(
  database: D1Database,
  principal: InterviewPrincipal,
): Promise<InterviewState> {
  const workspace = await workspaceForPrincipal(database, principal);
  if (!workspace) return { status: "uninitialized", displayName: principal.displayName };

  const confirmed = await database
    .prepare(
      `SELECT c.knowledge_version_id, c.created_at, k.value_json, a.id AS audit_id
       FROM interview_confirmations c
       JOIN interview_answers ans
         ON ans.id = c.answer_id AND ans.workspace_id = c.workspace_id
       JOIN knowledge_versions k
         ON k.id = c.knowledge_version_id AND k.workspace_id = c.workspace_id
       JOIN audit_events a
         ON a.subject_id = c.id AND a.workspace_id = c.workspace_id
        AND a.action = 'interview.recommendation_confirmed'
       WHERE c.workspace_id = ? AND c.decision = 'accept'
         AND c.operation_digest <> 'legacy-unbound'
         AND ans.proposal_digest <> 'legacy-unbound'
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

  const unbound = await database
    .prepare(
      `SELECT ans.id
       FROM interview_answers ans
       JOIN interview_sessions s
         ON s.id = ans.session_id AND s.workspace_id = ans.workspace_id
       LEFT JOIN interview_confirmations c
         ON c.answer_id = ans.id AND c.workspace_id = ans.workspace_id
       WHERE ans.workspace_id = ? AND ans.proposal_digest = 'legacy-unbound'
         AND (
           s.state = 'awaiting_confirmation'
           OR (
             c.decision = 'accept'
             AND NOT EXISTS (
               SELECT 1 FROM audit_events quarantine
               WHERE quarantine.workspace_id = ans.workspace_id
                 AND quarantine.action = 'interview.unbound_review_restarted'
                 AND quarantine.subject_type = 'interview_answer'
                 AND quarantine.subject_id = ans.id
             )
           )
         )
       ORDER BY ans.created_at DESC LIMIT 1`,
    )
    .bind(workspace.id)
    .first<{ id: string }>();
  if (unbound) {
    return {
      status: "review_required",
      displayName: principal.displayName,
      workspace: { id: workspace.id, companyName: workspace.company_name },
      reason: "legacy_unbound_decision",
    };
  }

  const current = await database
    .prepare(
      `SELECT s.id AS session_id, s.revision AS session_revision, s.state,
              q.id AS question_id, q.revision AS question_revision,
              q.prompt, q.research_json, q.recommendation,
              ans.id AS answer_id, ans.operation_digest, ans.proposal_json,
              ans.proposal_digest, ans.created_at AS answer_created_at
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
      proposal_json: string | null;
      proposal_digest: string | null;
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
    if (
      !current.answer_id ||
      !current.operation_digest ||
      !current.proposal_json ||
      !current.proposal_digest ||
      current.answer_created_at === null
    )
      throw new InterviewConflictError("Submitted answer is incomplete");
    const generalized = current.proposal_json.includes('"schema":"consensus-interview/v1"');
    const snapshot = generalized ? await parseGeneralizedSnapshot(current.proposal_json, current.proposal_digest) : await parseProposalSnapshot(
      current.proposal_json,
      current.proposal_digest,
    );
    return {
      status: "awaiting_confirmation",
      ...base,
      question: {
        id: snapshot.questionId,
        revision: snapshot.questionRevision,
        prompt: generalized ? current.prompt : (snapshot as ProposalSnapshot).prompt,
        premise: generalized ? (snapshot as GeneralizedProposalSnapshot).evidenceFindings[0]?.excerpt ?? "No reliable evidence was recorded." : (snapshot as ProposalSnapshot).premise,
        inference: generalized ? (snapshot as GeneralizedProposalSnapshot).inference.value : (snapshot as ProposalSnapshot).inference,
        provenance: generalized ? "Repository-seeded evidence and owner answer snapshot." : (snapshot as ProposalSnapshot).provenance,
        recommendation: generalized ? (snapshot as GeneralizedProposalSnapshot).recommendation.rationale : (snapshot as ProposalSnapshot).recommendation,
      },
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
  const workspace = await ownedWorkspace(database, principal);
  const previous = await database
    .prepare(
      `SELECT operation_digest, proposal_digest
       FROM interview_answers WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(workspace.id, input.idempotencyKey)
    .first<{ operation_digest: string; proposal_digest: string }>();
  if (previous) {
    const operationDigest = await answerOperationDigest(input, previous.proposal_digest);
    if (previous.operation_digest !== operationDigest)
      throw new InterviewConflictError("Idempotency key was used for another operation");
    return readInterviewState(database, principal);
  }

  const current = await database
    .prepare(
      `SELECT q.id, q.revision, q.session_id, q.prompt, q.research_json, q.recommendation
       FROM interview_questions q
       JOIN interview_sessions s
         ON s.id = q.session_id AND s.workspace_id = q.workspace_id
       WHERE q.workspace_id = ? AND q.id = ? AND q.status = 'active'
         AND s.state = 'awaiting_answer' AND s.active_question_id = q.id
       LIMIT 1`,
    )
    .bind(workspace.id, input.questionId)
    .first<{
      id: string;
      revision: number;
      session_id: string;
      prompt: string;
      research_json: string;
      recommendation: string;
    }>();
  if (!current || current.revision !== input.expectedRevision)
    throw new InterviewConflictError("This question changed; reload before answering");

  const research = parseResearch(current.research_json);
  const proposal: ProposalSnapshot = {
    questionId: current.id,
    questionRevision: current.revision,
    prompt: current.prompt,
    premise: research.premise,
    inference: research.inference,
    provenance: research.provenance,
    recommendation: current.recommendation,
    value: confirmedPolicyValue(),
  };
  const proposalJson = JSON.stringify(proposal);
  const [proposalDigest, digest] = await Promise.all([
    sha256(proposalJson),
    sha256(`${workspace.id}:${input.idempotencyKey}`),
  ]);
  const operationDigest = await answerOperationDigest(input, proposalDigest);
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
            correction_json, idempotency_key, operation_digest, proposal_json,
            proposal_digest, created_at)
           VALUES (?, ?, ?, ?, ?, 'accept_recommendation', NULL, ?, ?, ?, ?, ?)`,
        )
        .bind(
          answerId,
          workspace.id,
          current.session_id,
          current.id,
          input.expectedRevision,
          input.idempotencyKey,
          operationDigest,
          proposalJson,
          proposalDigest,
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
          JSON.stringify({
            questionRevision: input.expectedRevision,
            operationDigest,
            proposalDigest,
          }),
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

/**
 * Stage 1 of the consensus interview.  It is deliberately a separate command
 * from review: it captures the exact question projection and creates only a
 * Proposed Knowledge record.  No confirmed authority (or operational record)
 * can result from this method.
 */
export async function submitInterviewAnswer(
  database: D1Database,
  principal: InterviewPrincipal,
  input: SubmitInterviewAnswerInput,
): Promise<InterviewState> {
  validateQuestionInput(input);
  if (!['use_recommendation', 'write_correction', 'change_scope'].includes(input.answer))
    throw new InterviewConflictError("Unknown answer action");
  if ((input.answer === 'write_correction' || input.answer === 'change_scope') && (!input.value || !input.reason?.trim()))
    throw new InterviewConflictError("Corrections and scope changes require a value and reason");
  if (input.answer === 'change_scope' && !input.destination)
    throw new InterviewConflictError("A scope change requires an explicit destination");

  const workspace = await ownedWorkspace(database, principal);
  const prior = await database.prepare(
    "SELECT operation_digest FROM interview_answers WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1",
  ).bind(workspace.id, input.idempotencyKey).first<{ operation_digest: string }>();
  const current = await database.prepare(
    `SELECT q.id, q.revision, q.session_id, s.revision AS session_revision, q.prompt,
            q.research_json, q.recommendation
     FROM interview_questions q JOIN interview_sessions s
       ON s.id = q.session_id AND s.workspace_id = q.workspace_id
     WHERE q.workspace_id = ? AND q.id = ? AND q.status = 'active'
       AND s.active_question_id = q.id AND s.state = 'awaiting_answer' LIMIT 1`,
  ).bind(workspace.id, input.questionId).first<{
    id: string; revision: number; session_id: string; session_revision: number;
    prompt: string; research_json: string; recommendation: string;
  }>();
  if (!current || current.revision !== input.expectedRevision)
    throw new InterviewConflictError("This question changed; reload before answering");

  const research = researchFirst(current.research_json);
  const destination = input.destination ?? { scopeType: "company" as const, locator: workspace.company_name };
  const value = input.value ?? { excerpt: current.recommendation };
  const operationDigest = await sha256(JSON.stringify({
    action: "submit_interview_answer", questionId: current.id, expectedRevision: input.expectedRevision,
    answer: input.answer, value, reason: input.reason?.trim() ?? null, destination,
  }));
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw new InterviewConflictError("Idempotency key was used for another operation");
    return readInterviewState(database, principal);
  }

  // The proposal repository is the sole creator of Proposed Knowledge and its
  // provenance.  Repository-seeded evidence is bounded plain text only.
  let proposal: { id: string; digest: string };
  try {
    proposal = await createKnowledgeProposal(database, principal, {
      origin: "owner_edit", destination, kind: "data_readiness_scoring", value,
      source: { reference: `interview:${current.id}`, custody: "owner-reviewed interview snapshot", retrievedAt: Date.now() },
      privacy: "private", license: { use: "internal_review_only" }, reuseEligibility: "company_only",
      idempotencyKey: derivedKey(input.idempotencyKey, "proposal"),
    });
  } catch (error) {
    throw new InterviewConflictError(error instanceof Error ? error.message : "Unable to store proposal");
  }
  const snapshot: GeneralizedProposalSnapshot = {
    schema: "consensus-interview/v1", questionId: current.id, questionRevision: current.revision,
    sessionRevision: current.session_revision, evidenceFindings: research.evidenceFindings,
    inference: research.inference, recommendation: { rationale: current.recommendation, value: { excerpt: current.recommendation } },
    destination, prerequisiteKnowledge: research.prerequisiteKnowledge, answer: input.answer, value,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}), knowledgeProposalId: proposal.id,
    knowledgeProposalDigest: proposal.digest, kind: "data_readiness_scoring",
  };
  const proposalJson = stableJson(snapshot);
  const proposalDigest = await sha256(proposalJson);
  const identity = await sha256(`${workspace.id}:${input.idempotencyKey}`);
  const now = Date.now();
  try {
    await database.batch([
      database.prepare("UPDATE interview_questions SET status = 'answered', revision = revision + 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'active' AND revision = ?")
        .bind(now, current.id, workspace.id, input.expectedRevision),
      database.prepare("UPDATE interview_sessions SET state = 'awaiting_confirmation', revision = revision + 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND state = 'awaiting_answer' AND revision = ?")
        .bind(now, current.session_id, workspace.id, current.session_revision),
      database.prepare(`INSERT INTO interview_answers (id, workspace_id, session_id, question_id, question_revision, choice, correction_json, idempotency_key, operation_digest, proposal_json, proposal_digest, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(`ia_${identity.slice(0, 24)}`, workspace.id, current.session_id, current.id, current.revision,
          input.answer === 'use_recommendation' ? 'accept_recommendation' : 'correct',
          input.answer === 'use_recommendation' ? null : stableJson({ value, reason: input.reason, destination }),
          input.idempotencyKey, operationDigest, proposalJson, proposalDigest, now),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'interview.answer_submitted', 'interview_answer', ?, ?, ?)")
        .bind(`ae_${identity.slice(0, 24)}`, workspace.id, principal.subject, `ia_${identity.slice(0, 24)}`, stableJson({ operationDigest, proposalDigest, knowledgeProposalId: proposal.id }), now),
    ]);
  } catch {
    const winner = await database.prepare("SELECT operation_digest FROM interview_answers WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspace.id, input.idempotencyKey).first<{ operation_digest: string }>();
    if (!winner || winner.operation_digest !== operationDigest) throw new InterviewConflictError("Another answer won; reload before answering");
  }
  return readInterviewState(database, principal);
}

/** Stage 2 is the only generalized path to a Knowledge Version. */
export async function recordInterviewDecision(
  database: D1Database, principal: InterviewPrincipal, input: RecordInterviewDecisionInput,
): Promise<InterviewState> {
  validateIdempotencyKey(input.idempotencyKey);
  if (!['accept', 'reject', 'correct', 'rescope'].includes(input.decision)) throw new InterviewConflictError("Unknown decision");
  if ((input.decision === 'correct' || input.decision === 'rescope') && (!input.value || !input.reason?.trim())) throw new InterviewConflictError("Corrections and rescopes require a value and reason");
  if (input.decision === 'rescope' && !input.destination) throw new InterviewConflictError("A rescope requires an explicit destination");
  const workspace = await ownedWorkspace(database, principal);
  const answer = await database.prepare(`SELECT ans.session_id, ans.question_id, ans.proposal_json, ans.proposal_digest,
      s.revision AS session_revision, q.revision AS question_revision FROM interview_answers ans
      JOIN interview_sessions s ON s.id = ans.session_id AND s.workspace_id = ans.workspace_id
      JOIN interview_questions q ON q.id = ans.question_id AND q.workspace_id = ans.workspace_id
      WHERE ans.id = ? AND ans.workspace_id = ? AND s.state = 'awaiting_confirmation' LIMIT 1`).bind(input.answerId, workspace.id).first<{
        session_id: string; question_id: string; proposal_json: string; proposal_digest: string; session_revision: number; question_revision: number;
      }>();
  if (!answer || answer.session_revision !== input.expectedSessionRevision || (input.expectedQuestionRevision !== undefined && answer.question_revision !== input.expectedQuestionRevision)) throw new InterviewConflictError("This answer changed; reload before deciding");
  const snapshot = await parseGeneralizedSnapshot(answer.proposal_json, answer.proposal_digest);
  if (snapshot.questionId !== answer.question_id || snapshot.questionRevision + 1 !== answer.question_revision) throw new InterviewConflictError("The stored answer lineage is stale");
  const reviewKey = derivedKey(input.idempotencyKey, "decision");
  let reviewed: { id: string; decision: string; version?: { id: string } };
  try {
    reviewed = await reviewKnowledgeProposal(database, principal, {
      proposalId: snapshot.knowledgeProposalId, decision: input.decision,
      ...(input.decision === 'correct' ? { correction: input.value } : {}),
      ...(input.decision === 'rescope' ? { destination: input.destination } : {}),
      predecessorVersionId: input.predecessorVersionId, expectedRevision: 1, idempotencyKey: reviewKey,
    });
  } catch (error) { throw new InterviewConflictError(error instanceof Error ? error.message : "Decision conflicted"); }
  const now = Date.now();
  const decisionId = reviewed.id;
  const command = await database.prepare("SELECT authority_command_id FROM proposal_decisions WHERE id = ? AND workspace_id = ? LIMIT 1").bind(decisionId, workspace.id).first<{ authority_command_id: string }>();
  const auditId = `ae_decision_${(await sha256(`${workspace.id}:${input.idempotencyKey}`)).slice(0, 16)}`;
  try {
    await database.batch([
      database.prepare("UPDATE proposal_decisions SET answer_id = ? WHERE id = ? AND workspace_id = ? AND answer_id IS NULL").bind(input.answerId, decisionId, workspace.id),
      database.prepare("UPDATE interview_questions SET status = 'closed', revision = revision + 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'answered' AND revision = ?").bind(now, answer.question_id, workspace.id, answer.question_revision),
      database.prepare("UPDATE interview_sessions SET state = 'completed', active_question_id = NULL, revision = revision + 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND state = 'awaiting_confirmation' AND revision = ?").bind(now, answer.session_id, workspace.id, input.expectedSessionRevision),
      database.prepare("INSERT INTO interview_confirmations (id, workspace_id, session_id, question_id, answer_id, decision, knowledge_version_id, idempotency_key, operation_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(`ic_${(await sha256(`${workspace.id}:${input.idempotencyKey}`)).slice(0, 24)}`, workspace.id, answer.session_id, answer.question_id, input.answerId, input.decision, reviewed.version?.id ?? null, input.idempotencyKey, await sha256(stableJson({ input, proposalDigest: answer.proposal_digest })), now),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, ?, 'proposal_decision', ?, ?, ?)")
        .bind(auditId, workspace.id, principal.subject, `interview.${input.decision}`, decisionId, stableJson({ answerId: input.answerId, snapshotDigest: answer.proposal_digest, versionId: reviewed.version?.id ?? null }), now),
    ]);
  } catch {
    const existing = await database.prepare("SELECT id FROM interview_confirmations WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspace.id, input.idempotencyKey).first<{ id: string }>();
    if (!existing) throw new InterviewConflictError("Another decision won; reload before deciding");
  }
  // A first Offer is intentionally impossible unless a future stored question
  // explicitly carries this proposal kind.  This call uses stored, never client,
  // lineage and remains behind all of the commercial model's FK guards.
  if (snapshot.kind === "hierarchy_completion_offer" && reviewed.version && command && input.decision !== "reject") {
    const destination = input.decision === "rescope" ? input.destination! : snapshot.destination;
    if (destination.scopeType === "customer_profile") await materializeOfferFromConfirmedHierarchyDecision(database, principal, {
      profileId: await profileIdForLocator(database, workspace.id, destination.locator), questionId: answer.question_id, answerId: input.answerId,
      proposalId: snapshot.knowledgeProposalId, decisionId, knowledgeVersionId: reviewed.version.id, authorityCommandId: command.authority_command_id,
      auditEventId: auditId, name: snapshot.value.excerpt, value: snapshot.value,
    });
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
              ans.question_id, ans.session_id, ans.proposal_json, ans.proposal_digest
       FROM interview_answers ans
       WHERE ans.workspace_id = ? AND ans.id = ? LIMIT 1`,
    )
    .bind(workspace.id, input.answerId)
    .first<{
      answer_id: string;
      answer_digest: string;
      question_id: string;
      session_id: string;
      proposal_json: string;
      proposal_digest: string;
    }>();
  const [operationDigest, previous] = await Promise.all([
    sha256(
      JSON.stringify({
        action: "confirm_submitted_answer",
        answerId: input.answerId,
        expectedSessionRevision: input.expectedSessionRevision,
        answerDigest: answer?.answer_digest ?? "missing",
        proposalDigest: answer?.proposal_digest ?? "missing",
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
  if (answer.proposal_digest === "legacy-unbound")
    throw new InterviewConflictError("This earlier answer must be reviewed again");
  const [proposal, current] = await Promise.all([
    parseProposalSnapshot(answer.proposal_json, answer.proposal_digest),
    database
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
      }>(),
  ]);
  if (!current) throw new InterviewConflictError("This answer changed; reload before confirming");

  const digest = await sha256(`${workspace.id}:${input.idempotencyKey}`);
  const confirmationId = `ic_${digest.slice(0, 24)}`;
  const knowledgeId = `kv_${digest.slice(0, 24)}`;
  const auditId = `ae_${digest.slice(0, 24)}`;
  const now = Date.now();
  const value = proposal.value;
  const sourceDigest = answer.proposal_digest;
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

export async function restartUnboundReview(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { idempotencyKey: string },
): Promise<InterviewState> {
  validateIdempotencyKey(input.idempotencyKey);
  const workspace = await ownedWorkspace(database, principal);
  const unbound = await database
    .prepare(
      `SELECT ans.id AS answer_id, ans.session_id, ans.question_id,
              c.knowledge_version_id
       FROM interview_answers ans
       JOIN interview_sessions s
         ON s.id = ans.session_id AND s.workspace_id = ans.workspace_id
       LEFT JOIN interview_confirmations c
         ON c.answer_id = ans.id AND c.workspace_id = ans.workspace_id
       WHERE ans.workspace_id = ? AND ans.proposal_digest = 'legacy-unbound'
         AND (
           s.state = 'awaiting_confirmation'
           OR (
             c.decision = 'accept'
             AND NOT EXISTS (
               SELECT 1 FROM audit_events quarantine
               WHERE quarantine.workspace_id = ans.workspace_id
                 AND quarantine.action = 'interview.unbound_review_restarted'
                 AND quarantine.subject_type = 'interview_answer'
                 AND quarantine.subject_id = ans.id
             )
           )
         )
       ORDER BY ans.created_at DESC LIMIT 1`,
    )
    .bind(workspace.id)
    .first<{
      answer_id: string;
      session_id: string;
      question_id: string;
      knowledge_version_id: string | null;
    }>();
  if (!unbound) return readInterviewState(database, principal);

  const [operationDigest, identityDigest] = await Promise.all([
    sha256(
      JSON.stringify({
        action: "restart_unbound_review",
        answerId: unbound.answer_id,
      }),
    ),
    sha256(`${workspace.id}:restart:${unbound.answer_id}`),
  ]);
  const sessionId = `is_${identityDigest.slice(0, 24)}`;
  const questionId = `iq_${identityDigest.slice(0, 24)}`;
  const auditId = `ae_${identityDigest.slice(0, 24)}`;
  const previous = await database
    .prepare("SELECT detail_json FROM audit_events WHERE id = ? AND workspace_id = ? LIMIT 1")
    .bind(auditId, workspace.id)
    .first<{ detail_json: string }>();
  if (previous) {
    const detail = JSON.parse(previous.detail_json) as { operationDigest?: string };
    if (detail.operationDigest !== operationDigest)
      throw new InterviewConflictError("Idempotency key was used for another operation");
    return readInterviewState(database, principal);
  }

  const now = Date.now();
  try {
    const statements = [
      database
        .prepare(
          "UPDATE interview_sessions SET state = 'archived', active_question_id = NULL, updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ?",
        )
        .bind(now, unbound.session_id, workspace.id),
      database
        .prepare(
          "UPDATE interview_questions SET status = 'superseded', updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ?",
        )
        .bind(now, unbound.question_id, workspace.id),
      database
        .prepare(
          `INSERT INTO interview_sessions
           (id, workspace_id, created_at, updated_at, revision, scope_type, scope_id, state, active_question_id)
           VALUES (?, ?, ?, ?, 1, 'company', ?, 'awaiting_answer', ?)`,
        )
        .bind(sessionId, workspace.id, now, now, workspace.id, questionId),
      database
        .prepare(
          `INSERT INTO interview_questions
           (id, workspace_id, created_at, updated_at, revision, session_id, version,
            prompt, research_json, recommendation, status)
           VALUES (?, ?, ?, ?, 1, ?, 1, ?, ?, ?, 'active')`,
        )
        .bind(
          questionId,
          workspace.id,
          now,
          now,
          sessionId,
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
          `INSERT INTO audit_events
           (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
           VALUES (?, ?, 'owner', ?, 'interview.unbound_review_restarted', 'interview_answer', ?, ?, ?)`,
        )
        .bind(
          auditId,
          workspace.id,
          principal.subject,
          unbound.answer_id,
          JSON.stringify({ operationDigest, restartedSessionId: sessionId }),
          now,
        ),
    ];
    if (unbound.knowledge_version_id) {
      statements.splice(
        2,
        0,
        database
          .prepare(
            "UPDATE knowledge_versions SET status = 'superseded', updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ?",
          )
          .bind(now, unbound.knowledge_version_id, workspace.id),
      );
    }
    await database.batch(statements);
  } catch {
    const retry = await database
      .prepare("SELECT id FROM audit_events WHERE id = ? AND workspace_id = ? LIMIT 1")
      .bind(auditId, workspace.id)
      .first<{ id: string }>();
    if (!retry)
      throw new InterviewConflictError("The review restart conflicted; reload before retrying");
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

async function answerOperationDigest(
  input: { questionId: string; expectedRevision: number },
  proposalDigest: string,
) {
  return sha256(
    JSON.stringify({
      action: "submit_recommendation_answer",
      questionId: input.questionId,
      expectedRevision: input.expectedRevision,
      choice: "accept_recommendation",
      proposalDigest,
    }),
  );
}

function parseResearch(raw: string) {
  const research = JSON.parse(raw) as {
    premise?: string;
    evidence?: string;
    inference?: string;
    provenance?: string;
  };
  return {
    premise: research.premise ?? research.evidence ?? "No premise was recorded.",
    inference: research.inference ?? "No inference was recorded.",
    provenance:
      research.provenance ??
      "Legacy policy question created before provenance was stored separately.",
  };
}

function researchFirst(raw: string): {
  evidenceFindings: InterviewEvidenceFinding[];
  inference: { label: string; value: string };
  prerequisiteKnowledge: Array<{ id: string; digest: string }>;
} {
  const research = JSON.parse(raw) as {
    evidenceFindings?: InterviewEvidenceFinding[];
    premise?: string; evidence?: string; inference?: string; prerequisites?: Array<{ id: string; digest: string }>;
  };
  const evidenceFindings = Array.isArray(research.evidenceFindings)
    ? research.evidenceFindings.map((finding) => ({ ...finding, excerpt: String(finding.excerpt).slice(0, 12_000) }))
    : [];
  // A policy premise is not smuggled into Evidence.  The empty finding set is
  // meaningful: it says the question has no reliable repository evidence.
  const prerequisiteKnowledge = Array.isArray(research.prerequisites)
    ? research.prerequisites
      .filter((item) => typeof item?.id === "string" && typeof item?.digest === "string")
      .map((item) => ({ id: item.id, digest: item.digest }))
      .sort((left, right) => `${left.id}:${left.digest}`.localeCompare(`${right.id}:${right.digest}`))
    : [];
  return {
    evidenceFindings,
    inference: { label: "Inference", value: research.inference ?? "No inference was recorded." },
    prerequisiteKnowledge,
  };
}

function stableJson(value: unknown) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function derivedKey(key: string, purpose: string) {
  // The underlying authority repository requires UUID-shaped keys.  This keeps
  // Stage 1 and Stage 2 namespaces separate while retaining deterministic retry.
  const suffix = purpose === "proposal" ? "aa" : "bb";
  return `${key.slice(0, 78)}${suffix}`;
}

async function parseGeneralizedSnapshot(raw: string, expectedDigest: string): Promise<GeneralizedProposalSnapshot> {
  if ((await sha256(raw)) !== expectedDigest) throw new InterviewConflictError("The submitted snapshot failed integrity checks");
  const snapshot = JSON.parse(raw) as Partial<GeneralizedProposalSnapshot>;
  if (snapshot.schema !== "consensus-interview/v1" || typeof snapshot.questionId !== "string" ||
    !Number.isInteger(snapshot.questionRevision) || !Number.isInteger(snapshot.sessionRevision) ||
    !Array.isArray(snapshot.evidenceFindings) || !snapshot.inference || typeof snapshot.inference.label !== "string" ||
    typeof snapshot.inference.value !== "string" || !snapshot.recommendation || typeof snapshot.recommendation.rationale !== "string" ||
    !snapshot.destination || typeof snapshot.destination.scopeType !== "string" || typeof snapshot.destination.locator !== "string" ||
    !Array.isArray(snapshot.prerequisiteKnowledge) || typeof snapshot.knowledgeProposalId !== "string" ||
    typeof snapshot.knowledgeProposalDigest !== "string" || !snapshot.value || typeof snapshot.value.excerpt !== "string" ||
    typeof snapshot.kind !== "string") throw new InterviewConflictError("The submitted snapshot is incomplete");
  const sorted = [...snapshot.prerequisiteKnowledge].sort((left, right) => `${left.id}:${left.digest}`.localeCompare(`${right.id}:${right.digest}`));
  if (stableJson(sorted) !== stableJson(snapshot.prerequisiteKnowledge)) throw new InterviewConflictError("Prerequisites were not stored in canonical order");
  return snapshot as GeneralizedProposalSnapshot;
}

async function profileIdForLocator(database: D1Database, workspaceId: string, locator: string) {
  const profile = await database.prepare("SELECT id FROM customer_profiles WHERE workspace_id = ? AND name = ? LIMIT 1").bind(workspaceId, locator).first<{ id: string }>();
  if (!profile) throw new InterviewConflictError("The stored Profile destination is no longer authorized");
  return profile.id;
}

async function parseProposalSnapshot(raw: string, expectedDigest: string) {
  if ((await sha256(raw)) !== expectedDigest)
    throw new InterviewConflictError("The submitted policy snapshot failed integrity checks");
  const proposal = JSON.parse(raw) as Partial<ProposalSnapshot>;
  if (
    typeof proposal.questionId !== "string" ||
    !Number.isInteger(proposal.questionRevision) ||
    typeof proposal.prompt !== "string" ||
    typeof proposal.premise !== "string" ||
    typeof proposal.inference !== "string" ||
    typeof proposal.provenance !== "string" ||
    typeof proposal.recommendation !== "string" ||
    typeof proposal.value?.score !== "number" ||
    typeof proposal.value.classification !== "string" ||
    typeof proposal.value.rationale !== "string"
  )
    throw new InterviewConflictError("The submitted policy snapshot is incomplete");
  return proposal as ProposalSnapshot;
}

function confirmedPolicyValue() {
  return {
    score: 1,
    classification: "partial_readiness",
    rationale:
      "Historian connectivity demonstrates feasibility, not confirmed permission or usable data access.",
  };
}

function validateIdempotencyKey(value: string) {
  if (!/^[a-f0-9-]{20,80}$/i.test(value))
    throw new InterviewConflictError("Invalid idempotency key");
}

async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await workspaceForPrincipal(database, principal);
  if (!workspace) throw new InterviewConflictError("Workspace is not initialized");
  return workspace;
}

async function workspaceForPrincipal(
  database: D1Database,
  principal: InterviewPrincipal,
): Promise<{ id: string; company_name: string } | null> {
  const [current, legacy] = await Promise.all([
    database
      .prepare("SELECT id, company_name FROM workspaces WHERE owner_subject = ? LIMIT 1")
      .bind(principal.subject)
      .first<{ id: string; company_name: string }>(),
    database
      .prepare("SELECT id, company_name FROM workspaces WHERE owner_subject = ? LIMIT 1")
      .bind(principal.legacySubject)
      .first<{ id: string; company_name: string }>(),
  ]);
  if (current) {
    if (legacy && legacy.id !== current.id)
      await quarantineDetachedLegacyWorkspace(
        database,
        principal,
        current.id,
        legacy.id,
      );
    return current;
  }
  if (!legacy) return null;

  await database
    .prepare("UPDATE workspaces SET owner_subject = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND owner_subject = ?")
    .bind(principal.subject, Date.now(), legacy.id, principal.legacySubject)
    .run();
  return legacy;
}

async function quarantineDetachedLegacyWorkspace(
  database: D1Database,
  principal: InterviewPrincipal,
  currentWorkspaceId: string,
  legacyWorkspaceId: string,
) {
  const digest = await sha256(
    `${currentWorkspaceId}:quarantine-detached:${legacyWorkspaceId}`,
  );
  const auditId = `ae_detached_${digest.slice(0, 16)}`;
  const now = Date.now();
  await database.batch([
    database
      .prepare(
        `UPDATE knowledge_versions SET status = 'superseded', updated_at = ?, revision = revision + 1
         WHERE workspace_id = ? AND status = 'confirmed'
           AND id IN (
             SELECT c.knowledge_version_id FROM interview_confirmations c
             JOIN interview_answers ans
               ON ans.id = c.answer_id AND ans.workspace_id = c.workspace_id
             WHERE c.workspace_id = ?
               AND (c.operation_digest = 'legacy-unbound' OR ans.proposal_digest = 'legacy-unbound')
           )`,
      )
      .bind(now, legacyWorkspaceId, legacyWorkspaceId),
    database
      .prepare(
        "UPDATE interview_sessions SET state = 'archived', active_question_id = NULL, updated_at = ?, revision = revision + 1 WHERE workspace_id = ? AND state <> 'archived'",
      )
      .bind(now, legacyWorkspaceId),
    database
      .prepare(
        "UPDATE interview_questions SET status = 'superseded', updated_at = ?, revision = revision + 1 WHERE workspace_id = ? AND status <> 'superseded'",
      )
      .bind(now, legacyWorkspaceId),
    database
      .prepare(
        `INSERT OR IGNORE INTO audit_events
         (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
         VALUES (?, ?, 'owner', ?, 'workspace.detached_legacy_quarantined', 'workspace', ?, ?, ?)`,
      )
      .bind(
        auditId,
        legacyWorkspaceId,
        principal.subject,
        legacyWorkspaceId,
        JSON.stringify({ currentWorkspaceId }),
        now,
      ),
  ]);
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
import { materializeOfferFromConfirmedHierarchyDecision } from "./commercial-model";
import { createKnowledgeProposal, reviewKnowledgeProposal } from "./knowledge";
