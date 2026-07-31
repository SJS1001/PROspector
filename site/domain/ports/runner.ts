/**
 * Runner transport is deliberately capability-free.  The trusted application
 * creates assignments and persists observations; a transport can only receive
 * a minimized assignment envelope or return a bounded submission proposal.
 */
export type RunnerAssignmentEnvelope = Readonly<{
  assignmentId: string;
  runId: string;
  profileId: string;
  configurationId: string;
  configurationDigest: string;
  windowLowerExclusive: number | null;
  windowUpperInclusive: number;
  audience: string;
  expiresAt: number;
  instructionVersion: string;
  toolConfigurationDigest: string;
  quotas: Readonly<{ maxBytes: number; maxFindings: number; maxSources: number }>;
  /** No credentials, failover policy, application authority, or terminal claim is ever delivered. */
  scope?: "runner.observations.append/v1";
  allowedTools?: readonly string[];
}>;

export type RunnerPort = Readonly<{
  deliver(assignment: RunnerAssignmentEnvelope): Promise<void>;
}>;

/** Production composition remains disabled until a separately authorized host exists. */
export function createRejectOnlyRunnerPort(): RunnerPort {
  return Object.freeze({
    async deliver(): Promise<void> {
      throw new Error("runner_transport_unavailable");
    },
  });
}
