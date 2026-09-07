import { env } from "cloudflare:workers";
import { handleCapabilitiesGet } from "../domain/capability-handler";
import {
  capabilityDependencies,
  type CapabilityBindings,
} from "./api/capability-runtime";
import {
  ProspectorApp,
  type CapabilityApiState,
} from "./prospector-app";
import { shellTaskFromParam } from "./workspace-view";
import { admitOperatorSession, type OperatorAdmissionBindings } from "./owner-admission";

type HomeProps = {
  searchParams?: Promise<{ view?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps = {}) {
  const bindings = env as unknown as CapabilityBindings & OperatorAdmissionBindings;
  const requestedView = searchParams ? (await searchParams).view : undefined;
  const initialView = shellTaskFromParam(requestedView);
  const session = await admitOperatorSession(bindings);
  let initialCapabilityState: CapabilityApiState | null = null;
  if (session.admitted) {
    try {
      const response = await handleCapabilitiesGet(capabilityDependencies(bindings));
      if (response.ok) initialCapabilityState = (await response.json()) as CapabilityApiState;
    } catch {
      initialCapabilityState = null;
    }
  }
  // A blank workspace has no accepted capability evidence yet, so setup is the
  // only task the operator can act on.
  const blankWorkspace = session.admitted && initialCapabilityState === null;
  return (
    <ProspectorApp
      initialAccess={session.admitted ? "authorized" : "unauthorized"}
      identityKey={session.identityKey ?? ""}
      initialCapabilityState={initialCapabilityState}
      initialView={blankWorkspace && initialView === "status" ? "knowledge" : initialView}
    />
  );
}
