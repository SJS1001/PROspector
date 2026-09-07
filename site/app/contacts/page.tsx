import { env } from "cloudflare:workers";
import { ProspectorApp } from "../prospector-app";
import { admitOperatorSession, type OperatorAdmissionBindings } from "../owner-admission";

/** Contacts keeps its own dedicated route rather than a root `?view=` value, and
 * admits the operator through exactly the same check as the root shell. */
export default async function ContactsPage() {
  const session = await admitOperatorSession(env as unknown as OperatorAdmissionBindings);
  return (
    <ProspectorApp
      activeTask="contacts"
      identityKey={session.identityKey ?? ""}
      initialAccess={session.admitted ? "authorized" : "unauthorized"}
    />
  );
}
