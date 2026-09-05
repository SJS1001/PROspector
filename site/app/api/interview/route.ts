import { env } from "cloudflare:workers";
import {
  isLocalDemoRequest,
  runtimeIdentity,
} from "../../runtime-identity";
import {
  handleInterviewGet,
  handleInterviewPost,
  type InterviewHandlerDependencies,
} from "../../../domain/interview-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleInterviewGet(dependencies(request));
}

export async function POST(request: Request) {
  return handleInterviewPost(request, dependencies(request));
}

function dependencies(request: Request): InterviewHandlerDependencies {
  const bindings = env as unknown as {
    DB?: D1Database;
    OWNER_SUBJECT_PEPPER?: string;
    PILOT_OWNER_EMAIL?: string;
    TRUSTED_IDENTITY_PROVIDER?: string;
    LOCAL_DEMO?: string;
    CLOUDFLARE_ACCESS_ISSUER?: string;
    CLOUDFLARE_ACCESS_AUDIENCE?: string;
  };
  if (
    !bindings.DB ||
    !bindings.OWNER_SUBJECT_PEPPER ||
    !bindings.PILOT_OWNER_EMAIL
  )
    throw new Error("Secure interview bindings are unavailable");
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    csrfCookieMode: isLocalDemoRequest(request, bindings)
      ? "local-demo"
      : "secure",
    enableLocalDemoProgression: isLocalDemoRequest(request, bindings),
    getIdentity: async () => {
      return runtimeIdentity(request, bindings);
    },
  };
}
