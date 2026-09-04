export class DiscoverySubmissionError extends Error {
  readonly code = "invalid_discovery_submission";
}

export type DiscoveryEvidence = {
  reference: string;
  publisher: string;
  excerpt: string;
  observedAt: number;
  materialEvidenceFingerprint: string;
};

export type NormalizedDiscoveryFinding = {
  marketCategory: string;
  audience: string;
  problemFamily: string;
  problemMatch: string;
  likelyBuyer: string;
  examples: string[];
  evidence: DiscoveryEvidence[];
  inference: string;
  productFit: string;
  risks: string[];
};

export type NormalizedDiscoverySubmission = {
  productId: string;
  runId: string;
  configurationId: string;
  provenance: {
    kind: "synthetic_private_proof";
    fixtureDigest: string;
    sourceRevision: string;
    nonNetwork: true;
  };
  status: "complete" | "partial";
  findings: NormalizedDiscoveryFinding[];
};

export const PRIVATE_SYNTHETIC_PROOF_CAPABILITY = "private-hosted-synthetic-proposal-proof";
export const PRIVATE_SYNTHETIC_PROOF_REVIEWED_SOURCE_REVISION = "037e47d";
export const PRIVATE_SYNTHETIC_PROOF_MIGRATION_DIGEST =
  "a6854e0c123ae8aa6086dab9089f5a74cf469e0484c3671af3345e4937ec88c9";
export const PRIVATE_SYNTHETIC_PROOF_FIXTURE_PROVENANCE = "synthetic_private_proof:repository:v1";
export const PRIVATE_SYNTHETIC_PROOF_FIXTURE_DIGEST =
  "463d6ce6d0e8465a501e61bd0adeb55928bc66057cb1c05a9b8d96007c613962";

export const PRIVATE_SYNTHETIC_PROOF_FINDINGS: readonly NormalizedDiscoveryFinding[] = Object.freeze([
  {
    marketCategory: "industrial-operations",
    audience: "heavy-industry-operations-leaders",
    problemFamily: "operational-variability",
    problemMatch: "Operating teams need evidence-backed context for recurring variability before selecting an improvement path.",
    likelyBuyer: "Vice President, Operations",
    examples: ["Process recovery variability", "Ramp-up instability"],
    evidence: [
      {
        reference: "opaque:repository-synthetic-proof:v1",
        publisher: "PROspector fixed non-network fixture",
        excerpt: "A bounded synthetic observation used only to prove private proposal review.",
        observedAt: 1_779_657_600_000,
        materialEvidenceFingerprint: "repository-synthetic-proof-v1",
      },
    ],
    inference: "The synthetic evidence suggests a bounded discovery interview, not a validated market.",
    productFit: "The Product may help correlate operating context; owner review remains required.",
    risks: ["Synthetic evidence is not production market validation", "Buyer ownership remains unconfirmed"],
  },
]);

const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  "ownerSubject",
  "ownerSubjectId",
  "workspaceId",
  "acceptedCustomerProfile",
  "readyProfile",
  "providerCredential",
  "runnerCredential",
  "apiKey",
  "secret",
  "authorization",
  "cap",
  "rank",
  "rankScore",
  "terminalStatus",
]);

export function normalizeDiscoverySubmission(value: unknown): NormalizedDiscoverySubmission {
  const serialized = safeJson(value);
  if (serialized.length > 1_048_576) throw invalid("Submission exceeds the bounded schema");
  const input = object(value, "Submission must be a bounded object");
  rejectForbiddenFields(input);
  const provenance = object(input.provenance, "Synthetic fixture provenance is required");
  rejectForbiddenFields(provenance);
  if (provenance.kind !== "synthetic_private_proof") throw invalid("Only synthetic private proof provenance is accepted");
  if (provenance.nonNetwork !== true) throw invalid("Synthetic proof must be non-network");
  if ("sourceUrl" in provenance || "url" in provenance) throw invalid("Network provenance is forbidden");
  const fixtureDigest = digest(provenance.fixtureDigest, "Fixture digest");
  const sourceRevision = bounded(provenance.sourceRevision, "Source revision", 256);
  const status = input.status;
  if (status !== "complete" && status !== "partial") throw invalid("Submission status is outside the schema");
  if (!Array.isArray(input.findings) || input.findings.length > 500) throw invalid("Findings must satisfy the bounded schema");
  const findings = input.findings.map(normalizeFinding);
  if (status === "complete" && findings.length === 0) throw invalid("Complete submissions require evidence-backed findings");
  return {
    productId: bounded(input.productId, "Product ID", 256),
    runId: bounded(input.runId, "Run ID", 256),
    configurationId: bounded(input.configurationId, "Configuration ID", 256),
    provenance: { kind: "synthetic_private_proof", fixtureDigest, sourceRevision, nonNetwork: true },
    status,
    findings,
  };
}

function normalizeFinding(value: unknown): NormalizedDiscoveryFinding {
  const input = object(value, "Finding must be an object");
  rejectForbiddenFields(input);
  if (!Array.isArray(input.examples) || input.examples.length > 20) throw invalid("Finding examples are outside the bounded schema");
  if (!Array.isArray(input.risks) || input.risks.length > 20) throw invalid("Finding risks are outside the bounded schema");
  if (!Array.isArray(input.evidence) || input.evidence.length === 0 || input.evidence.length > 100) {
    throw invalid("Finding evidence is required and bounded");
  }
  return {
    marketCategory: normalizedIdentity(input.marketCategory, "Market category"),
    audience: normalizedIdentity(input.audience, "Audience"),
    problemFamily: normalizedIdentity(input.problemFamily, "Problem family"),
    problemMatch: bounded(input.problemMatch, "Problem match", 4_096),
    likelyBuyer: bounded(input.likelyBuyer, "Likely buyer", 512),
    examples: input.examples.map((item) => bounded(item, "Example", 1_024)),
    evidence: input.evidence.map(normalizeEvidence),
    inference: bounded(input.inference, "Inference", 4_096),
    productFit: bounded(input.productFit, "Product fit", 4_096),
    risks: input.risks.map((item) => bounded(item, "Risk", 1_024)),
  };
}

function normalizeEvidence(value: unknown): DiscoveryEvidence {
  const input = object(value, "Evidence must be an object");
  rejectForbiddenFields(input);
  const reference = bounded(input.reference, "Evidence reference", 512);
  if (/^https?:\/\//i.test(reference)) throw invalid("Network evidence references are not accepted by the synthetic proof seam");
  const observedAt = Number(input.observedAt);
  if (!Number.isSafeInteger(observedAt) || observedAt <= 0) throw invalid("Evidence timestamp is invalid");
  return {
    reference,
    publisher: bounded(input.publisher, "Evidence publisher", 512),
    excerpt: bounded(input.excerpt, "Evidence excerpt", 8_192),
    observedAt,
    materialEvidenceFingerprint: bounded(input.materialEvidenceFingerprint, "Material evidence fingerprint", 256),
  };
}

function normalizedIdentity(value: unknown, label: string) {
  return bounded(value, label, 256).normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function bounded(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string") throw invalid(`${label} must be text`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maximum) throw invalid(`${label} is outside the bounded schema`);
  return normalized;
}

function digest(value: unknown, label: string) {
  const result = bounded(value, label, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) throw invalid(`${label} is invalid`);
  return result;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(message);
  return value as Record<string, unknown>;
}

function rejectForbiddenFields(value: Record<string, unknown>) {
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    if (field in value) throw invalid(`Authority-bearing field ${field} is forbidden`);
  }
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    throw invalid("Submission is not valid JSON data");
  }
}

function invalid(message: string) {
  return new DiscoverySubmissionError(message);
}
