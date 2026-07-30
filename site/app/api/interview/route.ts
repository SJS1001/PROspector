import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  handleInterviewGet,
  handleInterviewPost,
  type InterviewHandlerDependencies,
} from "../../../domain/interview-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleInterviewGet(dependencies());
}

export async function POST(request: Request) {
  return handleInterviewPost(request, dependencies());
}

function dependencies(): InterviewHandlerDependencies {
  const bindings = env as unknown as {
    DB?: D1Database;
    OWNER_SUBJECT_PEPPER?: string;
    PILOT_OWNER_EMAIL?: string;
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
    getIdentity: async () => {
      const user = await getChatGPTUser();
      return user ? { email: user.email, displayName: user.displayName } : null;
    },
  };
}
