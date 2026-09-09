import { env } from "cloudflare:workers";
import { handleMorningBriefGet, morningBriefReadFailure, type MorningBriefHandlerDependencies } from "../../../domain/morning-brief-handler";
import { runtimeIdentity } from "../../runtime-identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await handleMorningBriefGet(request, dependencies(request));
  } catch {
    return morningBriefReadFailure();
  }
}

function dependencies(request: Request): MorningBriefHandlerDependencies {
  const bindings = env as unknown as {
    DB?: D1Database;
    OWNER_SUBJECT_PEPPER?: string;
    PILOT_OWNER_EMAIL?: string;
    TRUSTED_IDENTITY_PROVIDER?: string;
    LOCAL_DEMO?: string;
    CLOUDFLARE_ACCESS_ISSUER?: string;
    CLOUDFLARE_ACCESS_AUDIENCE?: string;
  };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) {
    throw new Error("Secure Morning Brief bindings are unavailable");
  }
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    getIdentity: async () => runtimeIdentity(request, bindings),
  };
}
