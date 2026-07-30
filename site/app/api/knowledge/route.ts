import { env } from "cloudflare:workers";

import { getChatGPTUser } from "../../chatgpt-auth";
import { handleKnowledgeGet, handleKnowledgePost, type KnowledgeHandlerDependencies } from "../../../domain/knowledge-handler";

export const dynamic = "force-dynamic";

export async function GET() { return handleKnowledgeGet(dependencies()); }
export async function POST(request: Request) { return handleKnowledgePost(request, dependencies()); }

function dependencies(): KnowledgeHandlerDependencies {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL)
    throw new Error("Secure knowledge bindings are unavailable");
  return {
    database: bindings.DB, subjectPepper: bindings.OWNER_SUBJECT_PEPPER, pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    getIdentity: async () => {
      const user = await getChatGPTUser();
      return user ? { email: user.email, displayName: user.displayName } : null;
    },
  };
}
