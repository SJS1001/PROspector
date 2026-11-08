/**
 * Pure CRM handoff delivery decision.
 *
 * Same frozen snapshot/definition replays the existing artifact. A changed
 * snapshot under the same idempotency key conflicts. Access to an expired or
 * failed delivery is blocked and does not regenerate bytes. This module never
 * invokes ExportDeliveryPort, serializes CSV, or mutates eligibility.
 *
 * It does not execute Plan 07-04 or 07-06 and grants no plan credit.
 */

import type { ExportDeliveryPort } from "./ports/export-delivery";

export type CrmHandoffDeliveryState = "available" | "expired" | "failed";

export type StoredCrmHandoffArtifact = Readonly<{
  workspaceId: string;
  artifactId: string;
  version: number;
  snapshotDigest: string;
  exportDefinitionDigest: string;
  idempotencyKey: string;
  csvSha256: string;
  manifestSha256: string;
  deliveryState: CrmHandoffDeliveryState;
  deliveryExpiresAt: string;
}>;

export type CrmHandoffDeliveryRequest = Readonly<{
  now: string;
  workspaceId: string;
  idempotencyKey: string;
  snapshotDigest: string;
  exportDefinitionDigest: string;
  operation: "materialize" | "access";
  existing: StoredCrmHandoffArtifact | null;
  /** Present only so tests can prove this function never calls it. */
  port?: ExportDeliveryPort;
}>;

export type CrmHandoffDeliveryOutcome =
  | "replay"
  | "new_version"
  | "conflict"
  | "access_current"
  | "blocked";

export type CrmHandoffDeliveryReason =
  | "same_frozen_digest"
  | "new_snapshot"
  | "idempotency_conflict"
  | "delivery_expired"
  | "delivery_failed"
  | "workspace_mismatch"
  | "invalid";

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0 as const,
  durableMutations: 0 as const,
  deliveryInvocations: 0 as const,
  downloadInvocations: 0 as const,
  csvSerializations: 0 as const,
});

export type CrmHandoffDeliveryDecision = Readonly<{
  outcome: CrmHandoffDeliveryOutcome;
  reason: CrmHandoffDeliveryReason;
  portInvocation: false;
  regenerateBytes: false;
  artifact: StoredCrmHandoffArtifact | null;
  nextVersion: number | null;
  effects: typeof ZERO_EFFECTS;
}>;

const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function decideCrmHandoffDelivery(request: CrmHandoffDeliveryRequest): CrmHandoffDeliveryDecision {
  if (!validRequest(request)) return blocked("invalid");
  const existing = request.existing;
  if (existing && existing.workspaceId !== request.workspaceId) return blocked("workspace_mismatch");

  if (request.operation === "access") return decideAccess(request, existing);
  return decideMaterialize(request, existing);
}

function decideMaterialize(
  request: CrmHandoffDeliveryRequest,
  existing: StoredCrmHandoffArtifact | null,
): CrmHandoffDeliveryDecision {
  if (!existing) {
    return decision("new_version", "new_snapshot", null, 1);
  }
  const sameIdentity = existing.idempotencyKey === request.idempotencyKey;
  const sameFrozen = existing.snapshotDigest === request.snapshotDigest
    && existing.exportDefinitionDigest === request.exportDefinitionDigest;
  if (sameIdentity && sameFrozen) return decision("replay", "same_frozen_digest", existing, null);
  if (sameIdentity) return blocked("idempotency_conflict");
  if (!sameFrozen) return decision("new_version", "new_snapshot", null, existing.version + 1);
  return decision("replay", "same_frozen_digest", existing, null);
}

function decideAccess(
  request: CrmHandoffDeliveryRequest,
  existing: StoredCrmHandoffArtifact | null,
): CrmHandoffDeliveryDecision {
  if (!existing) return blocked("invalid");
  if (existing.deliveryState === "failed") return blocked("delivery_failed");
  if (existing.deliveryState === "expired" || request.now >= existing.deliveryExpiresAt) {
    return blocked("delivery_expired");
  }
  if (existing.snapshotDigest !== request.snapshotDigest || existing.exportDefinitionDigest !== request.exportDefinitionDigest) {
    return blocked("invalid");
  }
  return decision("access_current", "same_frozen_digest", existing, null);
}

function decision(
  outcome: CrmHandoffDeliveryOutcome,
  reason: CrmHandoffDeliveryReason,
  artifact: StoredCrmHandoffArtifact | null,
  nextVersion: number | null,
): CrmHandoffDeliveryDecision {
  return Object.freeze({
    outcome,
    reason,
    portInvocation: false,
    regenerateBytes: false,
    artifact,
    nextVersion,
    effects: ZERO_EFFECTS,
  });
}

function blocked(reason: CrmHandoffDeliveryReason): CrmHandoffDeliveryDecision {
  return decision("blocked", reason, null, null);
}

function validRequest(request: CrmHandoffDeliveryRequest): boolean {
  if (!request || typeof request !== "object") return false;
  if (!TIME.test(request.now) || !validTime(request.now)) return false;
  if (!ID.test(request.workspaceId) || !ID.test(request.idempotencyKey)) return false;
  if (!DIGEST.test(request.snapshotDigest) || !DIGEST.test(request.exportDefinitionDigest)) return false;
  if (request.operation !== "materialize" && request.operation !== "access") return false;
  if (request.existing === null) return true;
  return validStored(request.existing);
}

function validStored(artifact: StoredCrmHandoffArtifact): boolean {
  if (!artifact || typeof artifact !== "object") return false;
  if (!ID.test(artifact.workspaceId) || !ID.test(artifact.artifactId) || !ID.test(artifact.idempotencyKey)) return false;
  if (!Number.isInteger(artifact.version) || artifact.version < 1) return false;
  if (!DIGEST.test(artifact.snapshotDigest) || !DIGEST.test(artifact.exportDefinitionDigest)) return false;
  if (!DIGEST.test(artifact.csvSha256) || !DIGEST.test(artifact.manifestSha256)) return false;
  if (artifact.deliveryState !== "available" && artifact.deliveryState !== "expired" && artifact.deliveryState !== "failed") return false;
  return validTime(artifact.deliveryExpiresAt);
}

function validTime(value: string) {
  if (typeof value !== "string" || !TIME.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
