export type ReleaseEvidenceConfig = Readonly<{
  sourceRevision: string;
  migrationIdentity: string;
  migrationDigest: string;
  fixtureDigest: string;
  fixtureProvenance: string;
}>;

// Local synthetic fixtures are pinned to the reviewed mainline release. Hosted
// runtime configuration must provide the same shape through the private config
// seam; no short commit or partial migration digest is accepted there.
export const LOCAL_SYNTHETIC_RELEASE_EVIDENCE: ReleaseEvidenceConfig = Object.freeze({
  sourceRevision: "5382b9266df32cb83bc8c1886744e5e8a8dace87",
  migrationIdentity: "canonical-chain-0019-person-discovery",
  migrationDigest: "d54c3929120cd7d41e33d53a444404d53935e5785b5f85e6cc9bebb447d0a013",
  fixtureDigest: "463d6ce6d0e8465a501e61bd0adeb55928bc66057cb1c05a9b8d96007c613962",
  fixtureProvenance: "synthetic_private_proof:repository:v1",
});

export function parseReleaseEvidenceConfig(value: unknown): ReleaseEvidenceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("release_evidence_config_invalid");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["fixtureDigest", "fixtureProvenance", "migrationDigest", "migrationIdentity", "sourceRevision"])) {
    throw new Error("release_evidence_config_invalid");
  }
  if (typeof record.sourceRevision !== "string" || !/^[a-f0-9]{40}$/u.test(record.sourceRevision)) throw new Error("release_evidence_config_invalid");
  for (const key of ["migrationDigest", "fixtureDigest"] as const) {
    if (typeof record[key] !== "string" || !/^[a-f0-9]{64}$/u.test(record[key])) throw new Error("release_evidence_config_invalid");
  }
  if (typeof record.migrationIdentity !== "string" || !/^canonical-chain-[0-9]{4}-[a-z0-9-]+$/u.test(record.migrationIdentity)) throw new Error("release_evidence_config_invalid");
  if (typeof record.fixtureProvenance !== "string" || !/^synthetic_private_proof:[a-z0-9:_-]+$/u.test(record.fixtureProvenance)) throw new Error("release_evidence_config_invalid");
  return Object.freeze(record as ReleaseEvidenceConfig);
}
