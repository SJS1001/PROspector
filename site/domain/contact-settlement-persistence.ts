import {
  isBoundContactSettlementAttestor,
  normalizeContactSettlementAttestationMaterial,
  type ContactSettlementAttestation,
  type ContactSettlementAttestationMaterial,
  type ContactSettlementAttestor,
  type ContactSettlementReceiptBinding,
} from "./contact-settlement-attestor";
import { canonicalDigest } from "./enrichment-grant-issuance";

type PersistedReceiptRow = {
  grant_id: string;
  durable_revision: number;
  terminal_state: string;
  terminal_reason: string | null;
  settlement_digest: string | null;
  acknowledgement_digest: string;
  documented_units: number | null;
  documented_cost_minor: number | null;
  terminal_observation_ids_json: string;
  assignment_id: string;
  prospect_id: string;
  contact_id: string;
  role: string;
  configuration_id: string;
  configuration_digest: string;
  provider_id: string;
  provider_version: string;
  catalog_ref: string;
  quote_revision: number;
  verifier_id: string;
  verifier_version: string;
  request_digest: string;
  verdict_reference: string;
  verdict_digest: string;
  observation_id: string;
  observation_digest: string;
  receipt_digest: string;
  kind: string;
  contact_point_digest: string;
  verification_class: string;
  method: string;
  retrieved_at: number;
  observed_at: number;
  verified_at: number | null;
  content_hash: string;
  attestation_key_id: string | null;
  settlement_material_digest: string | null;
  settlement_attestation_tag: string | null;
};

export function buildContactSettlementAttestationMaterial(input: Readonly<{
  workspaceId: string;
  reservationId: string;
  grantId: string;
  durableRevision: number;
  terminalReason: "completed" | "partial";
  settlementDigest: string;
  acknowledgementDigest: string;
  documentedUnits: number;
  documentedCostMinor: number;
  receipts: readonly ContactSettlementReceiptBinding[];
}>): ContactSettlementAttestationMaterial | null {
  const receipts = [...input.receipts].sort((left, right) =>
    left.observationId < right.observationId ? -1 : left.observationId > right.observationId ? 1 : 0,
  );
  return normalizeContactSettlementAttestationMaterial({
    schema: "contact-verification-settlement-attestation/v1",
    workspaceId: input.workspaceId,
    reservationId: input.reservationId,
    grantId: input.grantId,
    durableRevision: input.durableRevision,
    terminalState: "settled",
    terminalReason: input.terminalReason,
    settlementDigest: input.settlementDigest,
    acknowledgementDigest: input.acknowledgementDigest,
    documentedUnits: input.documentedUnits,
    documentedCostMinor: input.documentedCostMinor,
    observationIds: receipts.map((receipt) => receipt.observationId),
    receiptDigests: receipts.map((receipt) => receipt.receiptDigest),
    receipts,
  });
}

/**
 * Reconstructs a signed settlement solely from immutable D1 rows. This is the
 * read/replay gate used after a response loss and before ContactReady is trusted.
 */
export async function verifyPersistedContactSettlement(
  database: D1Database,
  attestor: ContactSettlementAttestor | null | undefined,
  workspaceId: string,
  reservationId: string,
): Promise<boolean> {
  if (!isBoundContactSettlementAttestor(attestor) || !bounded(workspaceId, 160) || !bounded(reservationId, 160)) return false;
  const rows = (await database.prepare(
    `SELECT
      reservation.grant_id,
      terminal.durable_revision,
      terminal.state terminal_state,
      terminal.terminal_reason,
      terminal.settlement_digest,
      terminal.acknowledgement_digest,
      terminal.documented_units,
      terminal.documented_cost_minor,
      terminal.observation_ids_json terminal_observation_ids_json,
      receipt.assignment_id,
      receipt.prospect_id,
      receipt.contact_id,
      receipt.role,
      receipt.configuration_id,
      receipt.configuration_digest,
      receipt.provider_id,
      receipt.provider_version,
      receipt.catalog_ref,
      receipt.quote_revision,
      receipt.verifier_id,
      receipt.verifier_version,
      receipt.request_digest,
      receipt.verdict_reference,
      receipt.verdict_digest,
      receipt.observation_id,
      observation.observation_digest,
      receipt.receipt_digest,
      receipt.kind,
      receipt.contact_point_digest,
      receipt.verification_class,
      receipt.method,
      receipt.retrieved_at,
      receipt.observed_at,
      receipt.verified_at,
      receipt.content_hash,
      receipt.attestation_key_id,
      receipt.settlement_material_digest,
      receipt.settlement_attestation_tag
     FROM enrichment_reservations reservation
     JOIN enrichment_reservation_events terminal
       ON terminal.reservation_id=reservation.id AND terminal.workspace_id=reservation.workspace_id
      AND terminal.durable_revision=(
        SELECT max(latest.durable_revision)
        FROM enrichment_reservation_events latest
        WHERE latest.reservation_id=reservation.id
      )
     JOIN contact_verification_receipts receipt
       ON receipt.reservation_id=reservation.id AND receipt.workspace_id=reservation.workspace_id
      AND receipt.verification_class IN ('mailbox_verified','source_verified')
     JOIN contact_point_observations observation
       ON observation.id=receipt.observation_id AND observation.workspace_id=receipt.workspace_id
      AND observation.verification_receipt_id=receipt.id
     WHERE reservation.id=? AND reservation.workspace_id=?
     ORDER BY receipt.observation_id`,
  ).bind(reservationId, workspaceId).all<PersistedReceiptRow>()).results;
  if (rows.length === 0 || rows.length > 100) return false;
  const first = rows[0];
  if (
    !first
    || first.terminal_state !== "settled"
    || (first.terminal_reason !== "completed" && first.terminal_reason !== "partial")
    || first.settlement_digest === null
    || first.documented_units === null
    || first.documented_cost_minor === null
    || first.attestation_key_id === null
    || first.settlement_material_digest === null
    || first.settlement_attestation_tag === null
  ) return false;
  const terminalObservationIds = parseCanonicalIds(first.terminal_observation_ids_json, 100);
  if (!terminalObservationIds) return false;

  const receipts: ContactSettlementReceiptBinding[] = [];
  for (const row of rows) {
    if (
      row.grant_id !== first.grant_id
      || Number(row.durable_revision) !== Number(first.durable_revision)
      || row.terminal_state !== first.terminal_state
      || row.terminal_reason !== first.terminal_reason
      || row.settlement_digest !== first.settlement_digest
      || row.acknowledgement_digest !== first.acknowledgement_digest
      || Number(row.documented_units) !== Number(first.documented_units)
      || Number(row.documented_cost_minor) !== Number(first.documented_cost_minor)
      || row.terminal_observation_ids_json !== first.terminal_observation_ids_json
      || row.attestation_key_id !== first.attestation_key_id
      || row.settlement_material_digest !== first.settlement_material_digest
      || row.settlement_attestation_tag !== first.settlement_attestation_tag
      || !terminalObservationIds.includes(row.observation_id)
    ) return false;
    const expectedReceiptDigest = await canonicalDigest({
      schema: "contact-verification-receipt/v1",
      workspaceId,
      reservationId,
      assignmentId: row.assignment_id,
      prospectId: row.prospect_id,
      role: row.role,
      contactId: row.contact_id,
      configurationId: row.configuration_id,
      configurationDigest: row.configuration_digest,
      providerId: row.provider_id,
      providerVersion: row.provider_version,
      catalogRef: row.catalog_ref,
      quoteRevision: Number(row.quote_revision),
      verifierId: row.verifier_id,
      verifierVersion: row.verifier_version,
      requestDigest: row.request_digest,
      verdictReference: row.verdict_reference,
      verdictDigest: row.verdict_digest,
      observationId: row.observation_id,
      kind: row.kind,
      contactPointDigest: row.contact_point_digest,
      verificationClass: row.verification_class,
      method: row.method,
      retrievedAt: Number(row.retrieved_at),
      observedAt: Number(row.observed_at),
      verifiedAt: row.verified_at === null ? null : Number(row.verified_at),
      contentHash: row.content_hash,
    });
    if (row.receipt_digest !== expectedReceiptDigest) return false;
    receipts.push({
      assignmentId: row.assignment_id,
      prospectId: row.prospect_id,
      contactId: row.contact_id,
      role: row.role as ContactSettlementReceiptBinding["role"],
      configurationId: row.configuration_id,
      configurationDigest: row.configuration_digest,
      providerId: row.provider_id,
      providerVersion: row.provider_version,
      catalogRef: row.catalog_ref,
      quoteRevision: Number(row.quote_revision),
      verifierId: row.verifier_id,
      verifierVersion: row.verifier_version,
      requestDigest: row.request_digest,
      verdictReference: row.verdict_reference,
      verdictDigest: row.verdict_digest,
      observationId: row.observation_id,
      observationDigest: row.observation_digest,
      receiptDigest: row.receipt_digest,
      kind: row.kind as ContactSettlementReceiptBinding["kind"],
      verificationClass: row.verification_class as ContactSettlementReceiptBinding["verificationClass"],
      method: row.method as ContactSettlementReceiptBinding["method"],
    });
  }
  const material = buildContactSettlementAttestationMaterial({
    workspaceId,
    reservationId,
    grantId: first.grant_id,
    durableRevision: Number(first.durable_revision),
    terminalReason: first.terminal_reason,
    settlementDigest: first.settlement_digest,
    acknowledgementDigest: first.acknowledgement_digest,
    documentedUnits: Number(first.documented_units),
    documentedCostMinor: Number(first.documented_cost_minor),
    receipts,
  });
  if (!material) return false;
  const envelope: ContactSettlementAttestation = {
    schema: "contact-verification-settlement-attestation-envelope/v1",
    algorithm: "HMAC-SHA-256",
    keyId: first.attestation_key_id,
    materialDigest: first.settlement_material_digest,
    tag: first.settlement_attestation_tag,
  };
  return attestor.verify(material, envelope);
}

function parseCanonicalIds(value: string, maximum: number): readonly string[] | null {
  try {
    const parsed = JSON.parse(value);
    if (
      !Array.isArray(parsed)
      || parsed.length > maximum
      || parsed.some((item) => !bounded(item, 160))
      || new Set(parsed).size !== parsed.length
      || JSON.stringify(parsed) !== value
    ) return null;
    return Object.freeze(parsed);
  } catch {
    return null;
  }
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
