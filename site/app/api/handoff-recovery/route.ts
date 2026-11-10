import { env } from "cloudflare:workers";
import { isLocalDemoRequest, runtimeIdentity } from "../../runtime-identity";
import { handleHandoffRecoveryGet, handleHandoffRecoveryPost, handoffRecoveryUnavailable, type HandoffRecoveryHandlerDependencies } from "../../../domain/handoff-recovery-handler";

/** Owner-only CSV CRM Handoff and Workspace Recovery route (07-09, local). It
 * always uses the production composition: no CSV source, object store,
 * reauthentication, upload, or restore target is wired, so every request is
 * refused with its first unmet predicate. It carries no schedule command. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await handleHandoffRecoveryGet(request, dependencies(request));
  } catch {
    return handoffRecoveryUnavailable();
  }
}

export async function POST(request: Request) {
  try {
    return await handleHandoffRecoveryPost(request, dependencies(request));
  } catch {
    return handoffRecoveryUnavailable();
  }
}

function dependencies(request: Request): HandoffRecoveryHandlerDependencies {
  const bindings = env as unknown as {
    DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; TRUSTED_IDENTITY_PROVIDER?: string;
    LOCAL_DEMO?: string; CLOUDFLARE_ACCESS_ISSUER?: string; CLOUDFLARE_ACCESS_AUDIENCE?: string;
  };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) throw new Error("Secure handoff and recovery bindings are unavailable");
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    csrfCookieMode: isLocalDemoRequest(request, bindings) ? "local-demo" : "secure",
    getIdentity: async () => runtimeIdentity(request, bindings),
  };
}
