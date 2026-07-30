import {
  consumeCsrfToken,
  csrfTokenFromRequest,
  CsrfTokenError,
  issueCsrfToken,
  withCsrfCookie,
} from "./csrf";
import {
  bootstrapInterview,
  confirmSubmittedAnswer,
  InterviewConflictError,
  recordInterviewDecision,
  readInterviewState,
  restartUnboundReview,
  submitInterviewAnswer,
  submitRecommendationAnswer,
  type InterviewPrincipal,
  type InterviewState,
} from "./interview";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";

export type InterviewHandlerDependencies = {
  database: D1Database;
  subjectPepper: string;
  pilotOwnerEmail: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
};

export async function handleInterviewGet(
  dependencies: InterviewHandlerDependencies,
): Promise<Response> {
  try {
    const principal = await authenticatedPrincipal(dependencies);
    return stateResponse(dependencies.database, principal, await readInterviewState(dependencies.database, principal));
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    return json({ error: "server_error" }, 500);
  }
}

export async function handleInterviewPost(
  request: Request,
  dependencies: InterviewHandlerDependencies,
): Promise<Response> {
  let principal: InterviewPrincipal | null = null;
  try {
    principal = await authenticatedPrincipal(dependencies);
    const rejected = validateSameOriginMutation(request, "interview-mutation", 8192);
    if (rejected) return json({ error: rejected.error }, rejected.status);
    await consumeCsrfToken(
      dependencies.database,
      principal.subject,
      csrfTokenFromRequest(request),
    );
    const body = await readBoundedJson(request, 8192);
    if (!isRecord(body)) return json({ error: "unsupported_action" }, 400);
    const action = body.action;
    if (typeof action !== "string" || !INTERVIEW_ACTIONS.includes(action as InterviewAction))
      return json({ error: "unsupported_action" }, 400);
    assertClosedCommand(body, action as InterviewAction);

    let state: InterviewState;
    if (action === "bootstrap") {
      state = await bootstrapInterview(dependencies.database, principal);
    } else if (action === "submit_recommendation_answer") {
      state = await submitRecommendationAnswer(dependencies.database, principal, {
        questionId: requiredString(body, "questionId", 160),
        expectedRevision: requiredRevision(body, "expectedRevision"),
        idempotencyKey: requiredString(body, "idempotencyKey", 80),
      });
    } else if (action === "confirm_submitted_answer") {
      state = await confirmSubmittedAnswer(dependencies.database, principal, {
        answerId: requiredString(body, "answerId", 160),
        expectedSessionRevision: requiredRevision(body, "expectedSessionRevision"),
        idempotencyKey: requiredString(body, "idempotencyKey", 80),
      });
    } else if (action === "submit_interview_answer") {
      state = await submitInterviewAnswer(dependencies.database, principal, {
        questionId: requiredString(body, "questionId", 160),
        expectedRevision: requiredRevision(body, "expectedRevision"),
        idempotencyKey: requiredString(body, "idempotencyKey", 80),
        answer: enumValue(body, "answer", ["use_recommendation", "write_correction", "change_scope"]),
        ...optionalExcerpt(body, "value"),
        ...optionalString(body, "reason", 2000),
        ...optionalDestination(body),
      });
    } else if (action === "record_interview_decision") {
      state = await recordInterviewDecision(dependencies.database, principal, {
        answerId: requiredString(body, "answerId", 160),
        expectedSessionRevision: requiredRevision(body, "expectedSessionRevision"),
        expectedQuestionRevision: optionalRevision(body, "expectedQuestionRevision"),
        idempotencyKey: requiredString(body, "idempotencyKey", 80),
        decision: enumValue(body, "decision", ["accept", "reject", "correct", "rescope"]),
        ...optionalExcerpt(body, "value"),
        ...optionalString(body, "reason", 2000),
        ...optionalDestination(body),
        ...optionalString(body, "predecessorVersionId", 160),
      });
    } else if (action === "restart_unbound_review") {
      state = await restartUnboundReview(dependencies.database, principal, {
        idempotencyKey: requiredString(body, "idempotencyKey", 80),
      });
    }
    return stateResponse(dependencies.database, principal, state);
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (error instanceof CsrfTokenError)
      return json({ error: error.code }, 403);
    if (error instanceof InterviewConflictError)
      return json({ error: error.code, message: error.message }, 409);
    const status =
      error instanceof Error && "status" in error && error.status === 413 ? 413 : 500;
    return json({ error: status === 413 ? "payload_too_large" : "server_error" }, status);
  }
}

async function authenticatedPrincipal(dependencies: InterviewHandlerDependencies) {
  const identity = await dependencies.getIdentity();
  return admitPilotOwner(
    identity,
    dependencies.pilotOwnerEmail,
    dependencies.subjectPepper,
  );
}

async function stateResponse(
  database: D1Database,
  principal: InterviewPrincipal,
  state: InterviewState,
) {
  const response = json(state);
  return withCsrfCookie(
    response,
    await issueCsrfToken(database, principal.subject),
  );
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function privateWorkspaceUnavailable() {
  return json({ error: "private_workspace_unavailable" }, 404);
}

const INTERVIEW_ACTIONS = [
  "bootstrap",
  "submit_recommendation_answer",
  "confirm_submitted_answer",
  "restart_unbound_review",
  "submit_interview_answer",
  "record_interview_decision",
] as const;
type InterviewAction = (typeof INTERVIEW_ACTIONS)[number];

function assertClosedCommand(body: Record<string, unknown>, action: InterviewAction) {
  const allowed: Record<InterviewAction, readonly string[]> = {
    bootstrap: ["action"],
    submit_recommendation_answer: ["action", "questionId", "expectedRevision", "idempotencyKey"],
    confirm_submitted_answer: ["action", "answerId", "expectedSessionRevision", "idempotencyKey"],
    restart_unbound_review: ["action", "idempotencyKey"],
    submit_interview_answer: ["action", "questionId", "expectedRevision", "idempotencyKey", "answer", "value", "reason", "destination"],
    record_interview_decision: ["action", "answerId", "expectedSessionRevision", "expectedQuestionRevision", "idempotencyKey", "decision", "value", "reason", "destination", "predecessorVersionId"],
  };
  if (Object.keys(body).some((key) => !allowed[action].includes(key)))
    throw new InterviewConflictError("Invalid command");
  if (body.destination !== undefined) {
    const destination = requiredRecord(body, "destination");
    if (Object.keys(destination).some((key) => key !== "scopeType" && key !== "locator"))
      throw new InterviewConflictError("Invalid command");
  }
  if (body.value !== undefined) {
    const value = requiredRecord(body, "value");
    if (Object.keys(value).some((key) => key !== "excerpt"))
      throw new InterviewConflictError("Invalid command");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredRecord(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!isRecord(value)) throw new InterviewConflictError("Invalid command");
  return value;
}

function requiredString(body: Record<string, unknown>, key: string, max: number) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new InterviewConflictError("Invalid command");
  return value.trim();
}

function requiredRevision(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!Number.isInteger(value) || value < 1) throw new InterviewConflictError("Invalid command");
  return value;
}

function optionalRevision(body: Record<string, unknown>, key: string) {
  return body[key] === undefined ? undefined : requiredRevision(body, key);
}

function enumValue<const T extends readonly string[]>(
  body: Record<string, unknown>, key: string, accepted: T,
): T[number] {
  const value = body[key];
  if (typeof value !== "string" || !accepted.includes(value))
    throw new InterviewConflictError("Invalid command");
  return value as T[number];
}

function optionalExcerpt(body: Record<string, unknown>, key: string) {
  if (body[key] === undefined) return {};
  const value = requiredRecord(body, key);
  return { value: { excerpt: requiredString(value, "excerpt", 6000) } };
}

function optionalString(body: Record<string, unknown>, key: string, max: number) {
  return body[key] === undefined ? {} : { [key]: requiredString(body, key, max) };
}

function optionalDestination(body: Record<string, unknown>) {
  if (body.destination === undefined) return {};
  const destination = requiredRecord(body, "destination");
  return {
    destination: {
      scopeType: enumValue(destination, "scopeType", ["company", "product", "market_play", "customer_profile", "offer"]),
      locator: requiredString(destination, "locator", 160),
    },
  };
}
