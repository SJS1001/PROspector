import { env } from "cloudflare:workers";
import { handleCapabilityProbePost } from "../../../domain/capability-handler";
import {
  capabilityDependencies,
  type CapabilityBindings,
} from "../capability-runtime";

export async function POST(request: Request) {
  return handleCapabilityProbePost(
    request,
    capabilityDependencies(env as unknown as CapabilityBindings),
  );
}
