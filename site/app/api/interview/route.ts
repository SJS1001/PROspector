import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  bootstrapInterview,
  confirmRecommendation,
  InterviewConflictError,
  principalFromIdentity,
  readInterviewState,
} from "../../../domain/interview";
import {
  readBoundedJson,
  validateSameOriginMutation,
} from "../../../domain/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const principal = await authenticatedPrincipal();
  if (!principal) return json({ error: "authentication_required" }, 401);
  return json(await readInterviewState(database(), principal));
}

export async function POST(request: Request) {
  const principal = await authenticatedPrincipal();
  if (!principal) return json({ error: "authentication_required" }, 401);
  const rejected = validateSameOriginMutation(
    request,
    "interview-mutation",
    8192,
  );
  if (rejected) return json({ error: rejected.error }, rejected.status);

  try {
    const body = await readBoundedJson(request, 8192);
    if (body.action === "bootstrap") {
      return json(await bootstrapInterview(database(), principal));
    }
    if (body.action === "confirm_recommendation") {
      return json(
        await confirmRecommendation(database(), principal, {
          questionId: String(body.questionId ?? ""),
          expectedRevision: Number(body.expectedRevision),
          idempotencyKey: String(body.idempotencyKey ?? ""),
        }),
      );
    }
    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    if (error instanceof InterviewConflictError)
      return json({ error: error.code, message: error.message }, 409);
    const status =
      error instanceof Error && "status" in error && error.status === 413
        ? 413
        : 400;
    return json({ error: status === 413 ? "payload_too_large" : "invalid_request" }, status);
  }
}

async function authenticatedPrincipal() {
  const user = await getChatGPTUser();
  return user
    ? principalFromIdentity(user.email, user.displayName)
    : null;
}

function database(): D1Database {
  const bindings = env as unknown as { DB?: D1Database };
  if (!bindings.DB) throw new Error("Database binding unavailable");
  return bindings.DB;
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
