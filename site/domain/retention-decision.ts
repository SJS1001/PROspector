export type RetentionSubject = Readonly<{
  kind: "crm_artifact" | "portable_backup" | "suppression_tombstone" | "audit_record";
  createdAt: string;
  expiresAt: string | null;
  suppressionScopeDigest: string | null;
}>;

export type RetentionDecision = Readonly<{
  disposition: "retain" | "purge_payload_preserve_manifest" | "retain_suppression_tombstone";
  reason: string;
  mayPurgePayload: boolean;
  mustPreserveTombstone: boolean;
  operationalAuthority: false;
}>;

const DIGEST = /^[a-f0-9]{64}$/u;

/** Pure decision contract. Callers receive no deletion or storage capability. */
export function decideRetention(subject: RetentionSubject, now: string): RetentionDecision {
  if (!subject || !Number.isFinite(Date.parse(subject.createdAt)) || !Number.isFinite(Date.parse(now))) throw new Error("retention_input_invalid");
  if (subject.expiresAt !== null && !Number.isFinite(Date.parse(subject.expiresAt))) throw new Error("retention_input_invalid");
  if (subject.suppressionScopeDigest !== null && !DIGEST.test(subject.suppressionScopeDigest)) throw new Error("retention_input_invalid");
  if (subject.kind === "suppression_tombstone") {
    if (!subject.suppressionScopeDigest) throw new Error("retention_input_invalid");
    return frozen("retain_suppression_tombstone", "suppression_survives_lifecycle", false, true);
  }
  if (subject.kind !== "crm_artifact" && subject.kind !== "portable_backup" && subject.kind !== "audit_record") throw new Error("retention_input_invalid");
  if (subject.expiresAt === null || Date.parse(now) < Date.parse(subject.expiresAt)) return frozen("retain", "retention_not_expired", false, subject.suppressionScopeDigest !== null);
  return frozen("purge_payload_preserve_manifest", "retention_expired", true, subject.suppressionScopeDigest !== null);
}

function frozen(disposition: RetentionDecision["disposition"], reason: string, mayPurgePayload: boolean, mustPreserveTombstone: boolean) {
  return Object.freeze({ disposition, reason, mayPurgePayload, mustPreserveTombstone, operationalAuthority: false as const });
}
