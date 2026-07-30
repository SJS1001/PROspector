/** Dependency-reached drift evaluation.  This module deliberately has no D1,
 * provider, or UI imports: callers persist the exact input graph themselves. */

export const HIGH_RISK_DRIFT_KINDS = [
  "capability",
  "claim_guardrail",
  "offer",
  "proof_point",
  "suppression",
] as const;

const highRiskKinds = new Set<string>(HIGH_RISK_DRIFT_KINDS);

export type DependencyNodeType = "source" | "version" | "configuration" | "artifact";
export type DependencyEdge = {
  fromType: DependencyNodeType | string;
  fromId: string;
  toType: DependencyNodeType | string;
  toId: string;
};

export type ReachedArtifact = {
  artifactType: string;
  artifactId: string;
  status: string;
  configurationId: string;
  path: string[];
};

export type DriftImpactInput = {
  sourceId: string;
  currentVersionId: string;
  proposedVersionId?: string;
  riskKind: string;
  edges: DependencyEdge[];
  artifacts?: Array<{ artifactId: string; artifactType?: string; status?: string }>;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function node(type: string, id: string): string { return `${type}:${id}`; }
function edgeKey(edge: DependencyEdge): string { return `${node(edge.fromType, edge.fromId)}>${node(edge.toType, edge.toId)}`; }

export function classifyDriftRisk(kind: string): "high_risk" | "standard" {
  return highRiskKinds.has(kind) ? "high_risk" : "standard";
}

/**
 * Walk only recorded edges, beginning at the exact challenged source/version.
 * Breadth-first traversal plus sorted edges makes both cycle handling and the
 * selected dependency path reproducible across different database row orders.
 */
export function reachedArtifacts(input: Pick<DriftImpactInput, "sourceId" | "currentVersionId" | "edges" | "artifacts">): ReachedArtifact[] {
  const edges = [...input.edges]
    .filter((edge) => [edge.fromType, edge.toType, edge.fromId, edge.toId].every((value) => typeof value === "string" && value.length > 0))
    .sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
  const outgoing = new Map<string, DependencyEdge[]>();
  for (const edge of edges) {
    const key = node(edge.fromType, edge.fromId);
    outgoing.set(key, [...(outgoing.get(key) ?? []), edge]);
  }
  const starts = [node("source", input.sourceId), node("version", input.currentVersionId)];
  const paths = new Map<string, string[]>();
  const queue = starts.map((start) => ({ key: start, path: [start] }));
  for (const start of starts) paths.set(start, [start]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of outgoing.get(current.key) ?? []) {
      const next = node(edge.toType, edge.toId);
      if (paths.has(next)) continue;
      const path = [...current.path, next];
      paths.set(next, path);
      queue.push({ key: next, path });
    }
  }
  const detail = new Map((input.artifacts ?? []).map((artifact) => [artifact.artifactId, artifact]));
  const result: ReachedArtifact[] = [];
  for (const edge of edges) {
    if (edge.toType !== "artifact") continue;
    const artifactPath = paths.get(node("artifact", edge.toId));
    if (!artifactPath) continue;
    const configuration = [...artifactPath].reverse().find((part) => part.startsWith("configuration:"));
    const metadata = detail.get(edge.toId);
    result.push({
      artifactType: metadata?.artifactType ?? "unknown",
      artifactId: edge.toId,
      status: metadata?.status ?? "not_present",
      configurationId: configuration?.slice("configuration:".length) ?? edge.fromId,
      path: artifactPath,
    });
  }
  return [...new Map(result.map((artifact) => [artifact.artifactId, artifact])).values()]
    .sort((left, right) => `${left.artifactType}:${left.artifactId}`.localeCompare(`${right.artifactType}:${right.artifactId}`));
}

export function buildDriftImpact(input: DriftImpactInput) {
  const risk = classifyDriftRisk(input.riskKind);
  const reached = reachedArtifacts(input);
  const affected = reached.filter((artifact) => artifact.status !== "not_present");
  const notPresent = reached.filter((artifact) => artifact.status === "not_present");
  const counts = Object.fromEntries([...new Set(reached.map((artifact) => `${artifact.artifactType}:${artifact.status}`))]
    .sort()
    .map((key) => [key, reached.filter((artifact) => `${artifact.artifactType}:${artifact.status}` === key).length]));
  const containment = risk !== "high_risk" ? "no_operational_effect" : affected.length ? "affected_outbound_paused" : "operational_effects_disabled";
  const impact = {
    sourceId: input.sourceId,
    currentVersionId: input.currentVersionId,
    proposedVersionId: input.proposedVersionId ?? null,
    risk,
    containment,
    reachedArtifacts: reached,
    affectedArtifacts: affected,
    notPresentArtifacts: notPresent,
    counts,
    categories: {
      futureSchedule: affected.filter((artifact) => artifact.status === "scheduled").map((artifact) => artifact.artifactId),
      inFlightHistoricalTreatment: affected.filter((artifact) => artifact.status === "in_flight").map((artifact) => artifact.artifactId),
      affectedUnreviewedRequalification: affected.filter((artifact) => artifact.status === "unreviewed").map((artifact) => artifact.artifactId),
      invalidation: affected.filter((artifact) => ["approval", "package", "message"].includes(artifact.artifactType)).map((artifact) => artifact.artifactId),
      reactivationRequirements: affected.map((artifact) => artifact.artifactId),
      preservedContactedExportedHistory: reached.filter((artifact) => ["contacted", "exported"].includes(artifact.status)).map((artifact) => artifact.artifactId),
    },
  };
  const canonicalJson = stable(impact);
  return { ...impact, canonicalJson, impactDigest: canonicalJson };
}

// Retained for the Wave 0 contract name; all callers receive the stronger snapshot.
export const evaluateReachedImpact = buildDriftImpact;
