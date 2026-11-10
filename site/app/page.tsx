import { env } from "cloudflare:workers";
import { readCapabilityProjection } from "../domain/capability-handler";
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
  let blankWorkspace = false;
  if (session.admitted) {
    // Read-only: the render cannot deliver a Set-Cookie, so it must not issue a
    // CSRF token. The browser primes its own token through GET /api/capabilities.
    const projection = await readCapabilityProjection(capabilityDependencies(bindings));
    if (projection.kind === "ready") initialCapabilityState = projection.state as CapabilityApiState;
    // Only a confirmed absent workspace is blank, so setup is the only task the
    // operator can act on. A failed read keeps the requested view; Pilot Status
    // then shows its existing loading and retry state.
    blankWorkspace = projection.kind === "workspace_absent";
  }
  return (
    <ProspectorApp
      initialAccess={session.admitted ? "authorized" : "unauthorized"}
      identityKey={session.identityKey ?? ""}
      initialCapabilityState={initialCapabilityState}
      initialView={blankWorkspace && initialView === "status" ? "knowledge" : initialView}
    />
  );
}
