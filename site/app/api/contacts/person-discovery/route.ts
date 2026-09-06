import { env } from "cloudflare:workers";
import { isLocalDemoRequest, runtimeIdentity } from "../../../runtime-identity";
import { handlePersonDiscoveryGet, handlePersonDiscoveryPost, type PersonDiscoveryHandlerDependencies } from "../../../../domain/person-discovery-handler";
import { createPersonDiscoveryC4Service } from "../../../../domain/person-discovery-c4-acceptance";

export const dynamic = "force-dynamic";

/** Production intentionally supplies no PersonDiscoveryService.  This route is
 * observable/read-only but every mutation remains reject-only until a separate
 * provider/credential gate composes an approved port. */
export async function GET(request: Request) { return handlePersonDiscoveryGet(request, await dependencies(request)); }
export async function POST(request: Request) { return handlePersonDiscoveryPost(request, await dependencies(request)); }

async function dependencies(request: Request): Promise<PersonDiscoveryHandlerDependencies> {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; LOCAL_DEMO?: string; TRUSTED_IDENTITY_PROVIDER?: string; CLOUDFLARE_ACCESS_ISSUER?: string; CLOUDFLARE_ACCESS_AUDIENCE?: string; PROSPECTOR_PERSON_DISCOVERY_C4?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) throw new Error("Secure person discovery bindings are unavailable");
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    csrfCookieMode: isLocalDemoRequest(request, bindings) ? "local-demo" : "secure",
    getIdentity: async () => runtimeIdentity(request, bindings),
    personDiscoveryService: createPersonDiscoveryC4Service(request, bindings, bindings.DB),
  };
}
