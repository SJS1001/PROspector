import { env } from "cloudflare:workers";
import { runtimeIdentity } from "../../runtime-identity";
import { handleContactsGet, handleContactsPost, type ContactsHandlerDependencies } from "../../../domain/contacts-handler";
import { bindRuntimeContactSettlementAttestor } from "../../../domain/contact-settlement-runtime";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleContactsGet(request, await dependencies(request)); }
export async function POST(request: Request) { return handleContactsPost(request, await dependencies(request)); }

async function dependencies(request: Request): Promise<ContactsHandlerDependencies> {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; CONTACT_SETTLEMENT_ATTESTATION_KEYS_JSON?: string; TRUSTED_IDENTITY_PROVIDER?: string; LOCAL_DEMO?: string; CLOUDFLARE_ACCESS_ISSUER?: string; CLOUDFLARE_ACCESS_AUDIENCE?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) throw new Error("Secure contacts bindings are unavailable");
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    contactSettlementAttestor: await bindRuntimeContactSettlementAttestor(
      bindings.CONTACT_SETTLEMENT_ATTESTATION_KEYS_JSON,
    ) ?? undefined,
    getIdentity: async () => {
      return runtimeIdentity(request, bindings);
    },
  };
}
