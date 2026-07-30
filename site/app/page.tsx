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

export default async function Home() {
  const bindings = env as unknown as CapabilityBindings;
  let initialAccess: "authorized" | "unauthorized" = "unauthorized";
  let initialCapabilityState: CapabilityApiState | null = null;
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
  return (
    <ProspectorApp
      initialAccess={initialAccess}
      initialCapabilityState={initialCapabilityState}
    />
  );
}
