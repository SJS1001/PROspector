export type CapabilityStatus = "proven" | "blocked" | "unproven";

export const CAPABILITY_IDS = {
  trustedIdentity: "trusted_owner_identity",
  authorization: "single_workspace_authorization",
  database: "d1_durable_persistence",
  objectStorage: "r2_object_lifecycle",
  isolation: "route_row_object_isolation",
  mutationProtection: "mutation_protection",
  secretsAudit: "secrets_and_audit",
  providerBoundary: "provider_neutral_boundary",
  gmail: "gmail_delivery",
  scheduler: "scheduled_execution",
  runnerCallback: "runner_callback",
} as const;

export type CapabilityId =
  (typeof CAPABILITY_IDS)[keyof typeof CAPABILITY_IDS];

export type CapabilityProofSteps = Partial<{
  put: boolean;
  read: boolean;
  digest: boolean;
  delete: boolean;
  absence: boolean;
}>;

export type CapabilityEvidence = {
  reference: string;
  checkedAt: number;
  outcome: "passed" | "failed";
  steps?: CapabilityProofSteps;
};

export type ProjectedCapability = {
  id: CapabilityId;
  name: string;
  status: CapabilityStatus;
  reason: string;
  unavailableEffects: string[];
  checkedAt?: number;
  evidenceReference?: string;
};

type ProjectionInput = {
  capabilityId: CapabilityId;
  prerequisite: { available: boolean; reason?: string };
  evidence: CapabilityEvidence | null;
  now?: number;
};

const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1_000;
const REQUIRED_STORAGE_STEPS = [
  "put",
  "read",
  "digest",
  "delete",
  "absence",
] as const;

const CAPABILITY_METADATA: Record<
  CapabilityId,
  { name: string; unavailableEffects: string[] }
> = {
  [CAPABILITY_IDS.trustedIdentity]: {
    name: "Trusted owner identity",
    unavailableEffects: ["Private workspace access"],
  },
  [CAPABILITY_IDS.authorization]: {
    name: "Single-workspace authorization",
    unavailableEffects: ["Workspace reads and mutations"],
  },
  [CAPABILITY_IDS.database]: {
    name: "D1 durable persistence",
    unavailableEffects: ["Durable confirmed knowledge"],
  },
  [CAPABILITY_IDS.objectStorage]: {
    name: "R2 write/read/delete durability",
    unavailableEffects: ["Documents, exports, and recovery objects"],
  },
  [CAPABILITY_IDS.isolation]: {
    name: "Route, row, and object isolation",
    unavailableEffects: ["Operational workspace data"],
  },
  [CAPABILITY_IDS.mutationProtection]: {
    name: "Mutation protection",
    unavailableEffects: ["Consequential state changes"],
  },
  [CAPABILITY_IDS.secretsAudit]: {
    name: "Secrets and audit handling",
    unavailableEffects: ["Provider credentials and external effects"],
  },
  [CAPABILITY_IDS.providerBoundary]: {
    name: "Provider-neutral boundary",
    unavailableEffects: ["Portable hosted operation"],
  },
  [CAPABILITY_IDS.gmail]: {
    name: "Gmail delivery",
    unavailableEffects: ["Email sending"],
  },
  [CAPABILITY_IDS.scheduler]: {
    name: "Scheduled execution",
    unavailableEffects: ["Morning runs"],
  },
  [CAPABILITY_IDS.runnerCallback]: {
    name: "Runner callback",
    unavailableEffects: ["Assigned or paid work"],
  },
};

export function projectCapabilityState(
  input: ProjectionInput,
): ProjectedCapability {
  const metadata = CAPABILITY_METADATA[input.capabilityId];
  if (!metadata) throw new Error("Unknown capability");
  const base = {
    id: input.capabilityId,
    name: metadata.name,
    unavailableEffects: [...metadata.unavailableEffects],
  };

  if (!input.prerequisite.available) {
    return {
      ...base,
      status: "blocked",
      reason: safeReason(
        input.prerequisite.reason,
        "A required server prerequisite is unavailable.",
      ),
    };
  }

  const evidence = input.evidence;
  if (!evidence) {
    return {
      ...base,
      status: "unproven",
      reason: "Accepted evidence has not been recorded.",
    };
  }

  const safeEvidence = evidenceDetails(evidence);
  if (evidence.outcome === "failed") {
    return {
      ...base,
      ...safeEvidence,
      status: "blocked",
      reason: "The most recent accepted check failed.",
    };
  }

  const now = input.now ?? Date.now();
  if (
    !Number.isFinite(evidence.checkedAt) ||
    evidence.checkedAt > now + 60_000 ||
    now - evidence.checkedAt > MAX_EVIDENCE_AGE_MS
  ) {
    return {
      ...base,
      ...safeEvidence,
      status: "unproven",
      reason: "Accepted evidence is missing or no longer current.",
    };
  }

  if (
    input.capabilityId === CAPABILITY_IDS.objectStorage &&
    !REQUIRED_STORAGE_STEPS.every((step) => evidence.steps?.[step] === true)
  ) {
    return {
      ...base,
      ...safeEvidence,
      status: "unproven",
      reason: "The storage lifecycle evidence is incomplete.",
    };
  }

  return {
    ...base,
    ...safeEvidence,
    status: "proven",
    reason: "Current accepted evidence demonstrates the complete gate.",
  };
}

function evidenceDetails(evidence: CapabilityEvidence) {
  return {
    checkedAt: evidence.checkedAt,
    evidenceReference: /^[A-Za-z0-9._:-]{1,128}$/.test(evidence.reference)
      ? evidence.reference
      : undefined,
  };
}

function safeReason(value: string | undefined, fallback: string) {
  if (
    !value ||
    value.length > 180 ||
    /@|token|secret|password|credential|api[-_ ]?key/i.test(value)
  ) {
    return fallback;
  }
  return value;
}
