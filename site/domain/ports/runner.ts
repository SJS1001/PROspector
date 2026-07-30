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
  audience: string;
  expiresAt: number;
  instructionVersion: string;
  toolConfigurationDigest: string;
  quotas: Readonly<{ maxBytes: number; maxFindings: number; maxSources: number }>;
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
