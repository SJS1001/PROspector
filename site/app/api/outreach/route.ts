import { env } from "cloudflare:workers";
import { isLocalDemoRequest, runtimeIdentity } from "../../runtime-identity";
import { handleOutreachGet, handleOutreachPost, type OutreachHandlerDependencies } from "../../../domain/outreach-handler";

/** Owner-only Outreach route. It always uses the production composition, which
 * wires the always-refusing Phase 5 rechecks; it never injects a readiness port. */
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleOutreachGet(request, dependencies(request)); }
export async function POST(request: Request) { return handleOutreachPost(request, dependencies(request)); }

function dependencies(request: Request): OutreachHandlerDependencies {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; TRUSTED_IDENTITY_PROVIDER?: string; LOCAL_DEMO?: string; CLOUDFLARE_ACCESS_ISSUER?: string; CLOUDFLARE_ACCESS_AUDIENCE?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) throw new Error("Secure outreach bindings are unavailable");
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    csrfCookieMode: isLocalDemoRequest(request, bindings) ? "local-demo" : "secure",
    getIdentity: async () => runtimeIdentity(request, bindings),
  };
}
