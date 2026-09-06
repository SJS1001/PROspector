/**
 * Provider-neutral first-person discovery boundary.
 *
 * Production composition is deliberately unavailable. The only callable port
 * this preparation slice can construct is explicitly test-injected and carries
 * no endpoint, credential, provider identity, or transport capability.
 */
export type PersonDiscoveryAssignment = Readonly<{
  schema: "person-discovery-assignment/v1";
  runId: string;
  operationKey: string;
  prospectId: string;
  profileId: string;
  configurationId: string;
  configurationDigest: string;
  configurationRevision: number;
  prospectRevision: number;
  deadlineAt: number;
  maxCandidates: number;
  maxProvenancePerCandidate: number;
}>;

export type PersonDiscoveryPort = Readonly<{
  kind: "test_injected" | "synthetic_acceptance";
  discover(assignment: PersonDiscoveryAssignment, signal: AbortSignal): Promise<unknown>;
}>;

export class PersonDiscoveryPortUnavailableError extends Error {
  readonly code = "person_discovery_port_unavailable";
  constructor() { super("person_discovery_port_unavailable"); }
}

/** Runtime code receives this reject-only value and has no callable adapter. */
export const productionPersonDiscoveryPort: Readonly<{
  kind: "unconfigured";
  discover(_assignment?: PersonDiscoveryAssignment, _signal?: AbortSignal): Promise<never>;
}> = Object.freeze({
  kind: "unconfigured" as const,
  async discover(): Promise<never> { throw new PersonDiscoveryPortUnavailableError(); },
});
