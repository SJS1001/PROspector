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
  readInterviewState,
  restartUnboundReview,
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
    let state: InterviewState;
    if (body.action === "bootstrap") {
      state = await bootstrapInterview(dependencies.database, principal);
    } else if (body.action === "submit_recommendation_answer") {
      state = await submitRecommendationAnswer(dependencies.database, principal, {
        questionId: String(body.questionId ?? ""),
        expectedRevision: Number(body.expectedRevision),
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
    } else if (body.action === "confirm_submitted_answer") {
      state = await confirmSubmittedAnswer(dependencies.database, principal, {
        answerId: String(body.answerId ?? ""),
        expectedSessionRevision: Number(body.expectedSessionRevision),
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
    } else if (body.action === "restart_unbound_review") {
      state = await restartUnboundReview(dependencies.database, principal, {
        idempotencyKey: String(body.idempotencyKey ?? ""),
      });
    } else {
      return json({ error: "unsupported_action" }, 400);
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
