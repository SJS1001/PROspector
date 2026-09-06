import { env } from "cloudflare:workers";

import { isLocalDemoRequest, runtimeIdentity } from "../../runtime-identity";
import { handleKnowledgeGet, handleKnowledgePost, type KnowledgeHandlerDependencies } from "../../../domain/knowledge-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { return handleKnowledgeGet(dependencies(request)); }
export async function POST(request: Request) { return handleKnowledgePost(request, dependencies(request)); }

function dependencies(request: Request): KnowledgeHandlerDependencies {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; TRUSTED_IDENTITY_PROVIDER?: string; LOCAL_DEMO?: string; CLOUDFLARE_ACCESS_ISSUER?: string; CLOUDFLARE_ACCESS_AUDIENCE?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL)
    throw new Error("Secure knowledge bindings are unavailable");
  return {
    database: bindings.DB, subjectPepper: bindings.OWNER_SUBJECT_PEPPER, pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    enableLocalDemoProgression: isLocalDemoRequest(request, bindings),
    runtimeIsDevelopment: import.meta.env.DEV,
    getIdentity: async () => {
      return runtimeIdentity(request, bindings);
    },
  };
}
