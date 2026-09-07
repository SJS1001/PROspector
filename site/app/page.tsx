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
import { workspaceViewFromParam } from "./workspace-view";
import { runtimeIdentity } from "./runtime-identity";
import { admitPilotOwner } from "../domain/pilot-access";

type HomeProps = {
  searchParams?: Promise<{ view?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps = {}) {
  const bindings = env as unknown as CapabilityBindings;
  const requestedView = searchParams ? (await searchParams).view : undefined;
  const initialView = workspaceViewFromParam(requestedView);
  let initialAccess: "authorized" | "unauthorized" = "unauthorized";
  let initialCapabilityState: CapabilityApiState | null = null;
  let blankLocalOnboarding = false;
  try {
    const response = await handleCapabilitiesGet(
      capabilityDependencies(bindings),
    );
    if (response.ok) {
      initialAccess = "authorized";
      initialCapabilityState =
        (await response.json()) as CapabilityApiState;
    }
  } catch {
    initialAccess = "unauthorized";
  }
  if (initialAccess === "unauthorized" && import.meta.env.DEV && bindings.TRUSTED_IDENTITY_PROVIDER === "local-demo" && bindings.LOCAL_DEMO === "1") {
    try {
      admitPilotOwner(await runtimeIdentity(undefined, bindings), bindings.PILOT_OWNER_EMAIL, bindings.OWNER_SUBJECT_PEPPER);
      initialAccess = "authorized";
      blankLocalOnboarding = true;
    } catch { /* fail closed */ }
  }
  return (
    <ProspectorApp
      initialAccess={initialAccess}
      initialCapabilityState={initialCapabilityState}
      initialView={blankLocalOnboarding && initialView === "Pilot Status" ? "Knowledge" : initialView}
    />
  );
}
