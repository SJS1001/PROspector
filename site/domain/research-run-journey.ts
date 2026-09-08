import type { RunnerAssignmentEnvelope, RunnerPort } from "./ports/runner";
import { deliverRunnerAssignment, issueRunnerAssignment, submitRunnerObservations } from "./runner-assignment";
import { processAcceptedRunnerSubmission } from "./prospecting-ingestion";

/**
 * Research-run journey composer.
 *
 * This drives one prospecting run through the real authority chain — assignment
 * issue, delivery across the `RunnerPort` seam, runner ingress, trusted
 * ingestion, and application qualification — so a synthetic journey proves the
 * chain rather than seeding rows that imitate its output.
 *
 * It is deliberately *not* a runtime composition and must not become one
 * without the explicit owner amendment to Plan 04-08 Task 2. It reads no
 * binding, no environment, and no configuration; it opens no socket; it
 * generates no capability secret. Every authority input — the database, the
 * capability secret, the clock, the runner port, and the materializer — is
 * supplied by the caller, so this module is inert unless a caller already holds
 * that authority. A test asserts that no application or worker module imports
 * it.
 *
 * Production composition is unchanged and remains fail closed: the deployed
 * runner route passes `runnerIngressEnabled: false`, and the owner action
 * `issue_assignment` still rejects.
 */

export const RESEARCH_RUN_SCOPE = "runner.observations.append/v1" as const;
export const RESEARCH_RUN_AUDIENCE = "prospecting-runner/v1" as const;

export type SyntheticObservation = Readonly<{
  kind: string;
  sourceUrl: string;
  observedAt: number;
  excerpt: string;
  retrievedAt: number;
  publisher: string;
}>;

export type SyntheticResearchRunner = Readonly<{
  port: RunnerPort;
  /** Every envelope the trusted caller delivered, in order. */
  delivered: readonly RunnerAssignmentEnvelope[];
  /** Bounded observations this runner would report for the delivered envelope. */
  observations: readonly SyntheticObservation[];
}>;

/**
 * A deterministic, zero-network runner. It holds no credential, performs no
 * retrieval, and cannot reach the application's authority: it only receives a
 * minimized envelope and reports bounded observations the trusted caller then
 * submits through the real ingress. Its hosts are reserved documentation names
 * that never resolve.
 */
export function createSyntheticResearchRunner(observations: readonly SyntheticObservation[]): SyntheticResearchRunner {
  const delivered: RunnerAssignmentEnvelope[] = [];
  const runner: SyntheticResearchRunner = {
    port: Object.freeze({
      async deliver(assignment: RunnerAssignmentEnvelope): Promise<void> {
        // The envelope is data, never authority: a runner may not widen its own
        // scope, so anything outside the append scope is refused here too.
        if (assignment.scope !== undefined && assignment.scope !== RESEARCH_RUN_SCOPE) throw new Error("synthetic_runner_scope_rejected");
        delivered.push(assignment);
      },
    }),
    get delivered() { return Object.freeze([...delivered]); },
    observations: Object.freeze([...observations]),
  } as SyntheticResearchRunner;
  return runner;
}

export type ResearchRunJourneyInput = Readonly<{
  workspaceId: string;
  profileId: string;
  runId: string;
  configurationId: string;
  configurationDigest: string;
  /** Supplied by the caller; this module never mints or stores capability material. */
  capabilitySecret: Uint8Array;
  now: number;
  expiresAt: number;
  idempotencyKeyPrefix: string;
  runner: SyntheticResearchRunner;
  instructionVersion?: string;
  toolConfigurationDigest?: string;
  quotas?: Readonly<{ maxBytes: number; maxFindings: number; maxSources: number }>;
  materializer?: unknown;
}>;

export type ResearchRunJourneyResult = Readonly<{
  assignmentId: string;
  submissionId: string;
  replayed: boolean;
  deliveredCount: number;
}>;

/**
 * Run the journey. Each step is the production function, so a passing result is
 * evidence about the real chain and not about a fixture that resembles it.
 */
export async function runResearchRunJourney(database: D1Database, input: ResearchRunJourneyInput): Promise<ResearchRunJourneyResult> {
  const quotas = input.quotas ?? { maxBytes: 20_000, maxFindings: 3, maxSources: 3 };
  const instructionVersion = input.instructionVersion ?? "runner-instructions/v1";
  const toolConfigurationDigest = input.toolConfigurationDigest ?? "f".repeat(64);

  const issued = await issueRunnerAssignment(database, {
    workspaceId: input.workspaceId, runId: input.runId, profileId: input.profileId,
    configurationId: input.configurationId, configurationDigest: input.configurationDigest,
    audience: RESEARCH_RUN_AUDIENCE, expiresAt: input.expiresAt,
    instructionVersion, toolConfigurationDigest, quotas,
    grantReference: "synthetic-research-run", reason: "synthetic research run journey",
    idempotencyKey: `${input.idempotencyKeyPrefix}-assignment`, now: input.now,
    capabilitySecret: input.capabilitySecret,
  });
  // A replay returns no capability, so the journey cannot silently continue with
  // a capability it did not mint.
  if (!issued.capability) throw new Error("research_run_capability_unavailable");

  await deliverRunnerAssignment(input.runner.port, Object.freeze({
    assignmentId: issued.assignmentId, runId: input.runId, profileId: input.profileId,
    configurationId: input.configurationId, configurationDigest: input.configurationDigest,
    windowLowerExclusive: null, windowUpperInclusive: input.now,
    audience: RESEARCH_RUN_AUDIENCE, expiresAt: input.expiresAt,
    instructionVersion, toolConfigurationDigest, quotas,
    scope: RESEARCH_RUN_SCOPE, allowedTools: [],
  }));

  const submitted = await submitRunnerObservations(database, {
    capability: issued.capability,
    idempotencyKey: `${input.idempotencyKeyPrefix}-submission`,
    capabilitySecret: input.capabilitySecret,
    audience: RESEARCH_RUN_AUDIENCE,
    now: input.now,
    payload: {
      status: "complete",
      findings: input.runner.observations.map((observation) => ({
        kind: observation.kind, sourceUrl: observation.sourceUrl,
        observedAt: observation.observedAt, excerpt: observation.excerpt,
      })),
      sources: dedupeSources(input.runner.observations),
      provenance: {
        provider: "runner-provider", model: "runner-model",
        instructionVersion, toolConfigurationDigest, tools: [], transformations: [],
      },
    },
  });

  await processAcceptedRunnerSubmission(database, {
    workspaceId: input.workspaceId, submissionId: submitted.submissionId, now: input.now,
    materializer: input.materializer as never,
  });

  return Object.freeze({
    assignmentId: issued.assignmentId,
    submissionId: submitted.submissionId,
    replayed: submitted.replayed,
    deliveredCount: input.runner.delivered.length,
  });
}

function dedupeSources(observations: readonly SyntheticObservation[]) {
  const byUrl = new Map<string, { url: string; retrievedAt: number; excerpt: string; publisher: string }>();
  for (const observation of observations) {
    if (byUrl.has(observation.sourceUrl)) continue;
    byUrl.set(observation.sourceUrl, {
      url: observation.sourceUrl, retrievedAt: observation.retrievedAt,
      excerpt: observation.excerpt, publisher: observation.publisher,
    });
  }
  return [...byUrl.values()];
}
