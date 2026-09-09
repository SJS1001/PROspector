import { env } from "cloudflare:workers";
import { isLocalDemoRequest, runtimeIdentity } from "../../runtime-identity";
import { handleContactsGet, handleContactsPost, type ContactsHandlerDependencies } from "../../../domain/contacts-handler";
import { bindRuntimeContactSettlementAttestor } from "../../../domain/contact-settlement-runtime";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleContactsGet(request, await dependencies(request)); }
export async function POST(request: Request) { return handleContactsPost(request, await dependencies(request)); }

async function dependencies(request: Request): Promise<ContactsHandlerDependencies> {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; CONTACT_SETTLEMENT_ATTESTATION_KEYS_JSON?: string; CONTACTS_CAPABILITY_BUILD_EPOCH?: string; TRUSTED_IDENTITY_PROVIDER?: string; LOCAL_DEMO?: string; CLOUDFLARE_ACCESS_ISSUER?: string; CLOUDFLARE_ACCESS_AUDIENCE?: string; PROSPECTOR_PERSON_DISCOVERY_C4?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) throw new Error("Secure contacts bindings are unavailable");
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    capabilityBuildEpoch: bindings.CONTACTS_CAPABILITY_BUILD_EPOCH,
    csrfCookieMode: isLocalDemoRequest(request, bindings) ? "local-demo" : "secure",
    contactSettlementAttestor: await localDemoAttestor(request, bindings)
      ?? await bindRuntimeContactSettlementAttestor(bindings.CONTACT_SETTLEMENT_ATTESTATION_KEYS_JSON)
      ?? undefined,
    getIdentity: async () => {
      return runtimeIdentity(request, bindings);
    },
  };
}

async function localDemoAttestor(request: Request, bindings: { LOCAL_DEMO?: string; TRUSTED_IDENTITY_PROVIDER?: string; PROSPECTOR_PERSON_DISCOVERY_C4?: string }) {
  if (import.meta.env.DEV) {
    const acceptance = await import("../../../domain/person-discovery-c4-acceptance");
    if (acceptance.personDiscoveryC4Enabled(request, bindings)) {
      const verification = await import("../../../domain/person-discovery-c4-verification");
      return verification.createPersonDiscoveryC4SettlementAttestor();
    }
  }
  return null;
}
