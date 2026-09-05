const CONTROLLED_ENRICHMENT_FIELDS = Object.freeze([
  "capability",
  "authorization_reference",
  "target_project_deployment",
  "reviewed_source_digest",
  "migration_identity_status",
  "post_migration_evidence_reference",
  "independent_review_reference",
  "deployed_boundary_proof_reference",
] as const);

/**
 * Reads the immutable, server-established Phase 5 gate. The current migration
 * chain deliberately prevents application code from inserting this row, so this
 * remains false until a separately reviewed deployment transition supplies it.
 */
export async function controlledEnrichmentActivated(
  database: D1Database,
  workspaceId: string,
): Promise<boolean> {
  if (!bounded(workspaceId, 160)) return false;
  const gate = await database.prepare(
    `SELECT capability,authorization_reference,target_project_deployment,
      reviewed_source_digest,migration_identity_status,post_migration_evidence_reference,
      independent_review_reference,deployed_boundary_proof_reference,tuple_digest
     FROM phase_activation_gates
     WHERE workspace_id=? AND capability='controlled_enrichment' LIMIT 2`,
  ).bind(workspaceId).all<Record<string, unknown>>();
  if (gate.results.length !== 1) return false;
  const row = gate.results[0];
  if (!row || CONTROLLED_ENRICHMENT_FIELDS.some((field) => !bounded(row[field], 2000))) return false;
  const canonicalGate = CONTROLLED_ENRICHMENT_FIELDS
    .map((field) => `${field}=${row[field]}`)
    .join("\n");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalGate));
  const expected = Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return row.tuple_digest === expected;
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}
