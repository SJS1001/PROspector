import { env } from "cloudflare:workers";
import { runtimeIdentity } from "../runtime-identity";
import { admitPilotOwner } from "../../domain/pilot-access";
import { ContactsWorkspace } from "../prospects/contacts-workspace";

/** A dedicated owner-admitted entrypoint; Contacts is not mounted in the public shell. */
export default async function ContactsPage() {
  const bindings = env as unknown as { OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; TRUSTED_IDENTITY_PROVIDER?: string; LOCAL_DEMO?: string; CLOUDFLARE_ACCESS_ISSUER?: string; CLOUDFLARE_ACCESS_AUDIENCE?: string };
  let admitted = false;
  try {
    if (!bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) throw new Error("missing_owner_bindings");
    await admitPilotOwner(await runtimeIdentity(undefined, bindings), bindings.PILOT_OWNER_EMAIL, bindings.OWNER_SUBJECT_PEPPER);
    admitted = true;
  } catch { admitted = false; }
  if (!admitted) return <main><h1>Private workspace unavailable</h1><p>Contacts is available only to the admitted owner.</p></main>;
  return <ContactsWorkspace />;
}
