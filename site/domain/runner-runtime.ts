import { issueRunnerAssignment } from "./runner-assignment";
import { handleRunnerIngress } from "./prospecting-handler";

/**
 * Explicit host bindings for the untrusted-runner boundary.  Assignment issue
 * and submission ingress are independent switches: enabling one never enables
 * the other.  No provider configuration or credential belongs here.
 */
export type RunnerRuntimeBindings = Readonly<{
  DB?: D1Database;
  PROSPECTOR_RUNNER_ASSIGNMENT_ENABLED?: string;
  PROSPECTOR_RUNNER_INGRESS_ENABLED?: string;
  RUNNER_CAPABILITY_SECRET?: string;
}>;

type Quotas = Readonly<{ maxBytes: number; maxFindings: number; maxSources: number }>;

export type RuntimeRunnerAssignmentInput = Readonly<{
  workspaceId: string;
  runId: string;
  profileId: string;
  configurationId: string;
  configurationDigest: string;
  audience: string;
  expiresAt: number;
  instructionVersion: string;
  toolConfigurationDigest: string;
  quotas: Quotas;
  grantReference: string;
  reason: string;
  idempotencyKey: string;
  now: number;
  provider?: string;
  model?: string;
  allowedTools?: readonly string[];
}>;

export type RunnerIngressDependencies = Readonly<{
  database: D1Database;
  runnerIngressEnabled: true;
  runnerCapabilitySecret: Uint8Array;
}>;

/** Returns no authority unless every ingress prerequisite is explicitly set. */
export function composeRunnerIngress(bindings: RunnerRuntimeBindings): RunnerIngressDependencies | undefined {
  const capabilitySecret = enabledSecret(bindings.PROSPECTOR_RUNNER_INGRESS_ENABLED, bindings.RUNNER_CAPABILITY_SECRET);
  if (!bindings.DB || !capabilitySecret) return undefined;
  return Object.freeze({ database: bindings.DB, runnerIngressEnabled: true, runnerCapabilitySecret: capabilitySecret });
}

/**
 * Issues only the existing assignment-bound capability.  It performs no
 * retrieval, delivery, scheduling, persistence outside the assignment ledger,
 * or provider call.  A future host adapter must deliberately transport the
 * returned capability; this boundary never selects such an adapter.
 */
export async function issueRuntimeRunnerAssignment(bindings: RunnerRuntimeBindings, input: RuntimeRunnerAssignmentInput) {
  const capabilitySecret = enabledSecret(bindings.PROSPECTOR_RUNNER_ASSIGNMENT_ENABLED, bindings.RUNNER_CAPABILITY_SECRET);
  if (!bindings.DB || !capabilitySecret) throw new Error("runner_runtime_unavailable");
  return issueRunnerAssignment(bindings.DB, { ...input, capabilitySecret });
}

/** HTTP composition seam used by the route; it reads no ambient bindings. */
export function handleRunnerRuntimeRequest(request: Request, bindings: RunnerRuntimeBindings, now?: () => number) {
  const dependencies = composeRunnerIngress(bindings);
  return handleRunnerIngress(request, dependencies && now ? { ...dependencies, now } : dependencies);
}

function enabledSecret(flag: string | undefined, value: string | undefined): Uint8Array | undefined {
  if (flag !== "1" || typeof value !== "string") return undefined;
  const secret = new TextEncoder().encode(value);
  return secret.byteLength >= 32 ? secret : undefined;
}
