import { env } from "cloudflare:workers";
import { handleCapabilitiesGet } from "../../../domain/capability-handler";
import {
  capabilityDependencies,
  type CapabilityBindings,
} from "../capability-runtime";

export async function GET() {
  return handleCapabilitiesGet(
    capabilityDependencies(env as unknown as CapabilityBindings),
  );
}
