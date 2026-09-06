import {
  isBoundContactSettlementAttestor,
  normalizeContactSettlementAttestationMaterial,
  type ContactSettlementAttestation,
  type ContactSettlementAttestationMaterial,
  type ContactSettlementAttestor,
  type ContactSettlementReceiptBinding,
} from "./contact-settlement-attestor";
import { canonicalDigest } from "./enrichment-grant-issuance";

const verifiedEligibilityEvidence = new WeakSet<object>();

export type PersistedContactEligibilityEvidence = Readonly<{
  id: string;
  workspaceId: string;
  contactId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  kind: "email" | "phone";
  verificationClass: "mailbox_verified" | "source_verified";
  method: "mailbox_verification" | "authoritative_source_reconfirmed";
  retrievedAt: number;
  observedAt: number;
  verifiedAt: number;
  assignmentContext: Readonly<{
    assignmentId: string;
    prospectId: string;
    role: "champion" | "economic_buyer" | "general";
    quoteRevision: number;
  }>;
}>;

type EligibilityEvidenceRow = {
  observation_id: string;
  workspace_id: string;
  contact_id: string;
  configuration_id: string;
  configuration_digest: string;
  kind: string;
  verification_class: string;
  method: string;
  retrieved_at: number;
  observed_at: number;
  verified_at: number | null;
  assignment_id: string;
  prospect_id: string;
  role: string;
  quote_revision: number;
};

type PersistedReceiptRow = {
  reservation_id: string;
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
  const rows = (await database.prepare(PERSISTED_SETTLEMENT_QUERY).bind(reservationId, workspaceId).all<PersistedReceiptRow>()).results;
  return verifyPersistedSettlementRows(rows, attestor, workspaceId, reservationId);
}

/** Two fixed set queries reconstruct up to 2,000 page-scoped settlements. */
export async function verifyPersistedContactSettlements(
  database: D1Database,
  attestor: ContactSettlementAttestor | null | undefined,
  workspaceId: string,
  reservationIds: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  const unique = [...new Set(reservationIds)];
  const verified = new Map(unique.map((id) => [id, false]));
  if (!isBoundContactSettlementAttestor(attestor) || !bounded(workspaceId, 160) || unique.length > 2_000 || unique.some((id) => !bounded(id, 160))) return verified;
  if (unique.length === 0) return new Map();
  const headers = (await database.prepare(PERSISTED_SETTLEMENT_HEADERS_QUERY).bind(JSON.stringify(unique), workspaceId).all<{ reservation_id: string; terminal_observation_ids_json: string }>()).results;
  const acceptedReservations: string[] = [], observationIds = new Set<string>();
  for (const header of headers) {
    if (!unique.includes(header.reservation_id)) continue;
    const ids = parseCanonicalIds(header.terminal_observation_ids_json, 100);
    if (!ids || observationIds.size + ids.filter((id) => !observationIds.has(id)).length > 2_000) continue;
    acceptedReservations.push(header.reservation_id);
    ids.forEach((id) => observationIds.add(id));
  }
  if (acceptedReservations.length === 0 || observationIds.size === 0) return verified;
  const rows = (await database.prepare(PERSISTED_SETTLEMENT_SET_QUERY).bind(JSON.stringify(acceptedReservations), JSON.stringify([...observationIds]), workspaceId).all<PersistedReceiptRow>()).results;
  const grouped = new Map<string, PersistedReceiptRow[]>();
  for (const row of rows) { const group = grouped.get(row.reservation_id) ?? []; group.push(row); grouped.set(row.reservation_id, group); }
  for (const reservationId of acceptedReservations) verified.set(reservationId, await verifyPersistedSettlementRows(grouped.get(reservationId) ?? [], attestor, workspaceId, reservationId));
  return verified;
}

const PERSISTED_SETTLEMENT_COLUMNS = `reservation.id reservation_id,
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
      receipt.settlement_attestation_tag`;
const PERSISTED_SETTLEMENT_FROM = `FROM enrichment_reservations reservation
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
      AND observation.verification_receipt_id=receipt.id`;
const PERSISTED_SETTLEMENT_QUERY = `SELECT ${PERSISTED_SETTLEMENT_COLUMNS} ${PERSISTED_SETTLEMENT_FROM}
     WHERE reservation.id=? AND reservation.workspace_id=?
     ORDER BY receipt.observation_id LIMIT 101`;
const PERSISTED_SETTLEMENT_HEADERS_QUERY = `SELECT reservation.id reservation_id,terminal.observation_ids_json terminal_observation_ids_json
  FROM enrichment_reservations reservation
  JOIN json_each(?) requested ON requested.value=reservation.id
  JOIN enrichment_reservation_events terminal ON terminal.reservation_id=reservation.id AND terminal.workspace_id=reservation.workspace_id
    AND terminal.durable_revision=(SELECT max(latest.durable_revision) FROM enrichment_reservation_events latest WHERE latest.reservation_id=reservation.id)
  WHERE reservation.workspace_id=? LIMIT 2001`;
const PERSISTED_SETTLEMENT_SET_QUERY = `SELECT * FROM (SELECT ${PERSISTED_SETTLEMENT_COLUMNS},row_number() OVER (PARTITION BY reservation.id ORDER BY receipt.observation_id) receipt_ordinal
  ${PERSISTED_SETTLEMENT_FROM}
  JOIN json_each(?) requested_reservation ON requested_reservation.value=reservation.id
  JOIN json_each(?) requested_observation ON requested_observation.value=receipt.observation_id
  WHERE reservation.workspace_id=?) WHERE receipt_ordinal<=101 ORDER BY reservation_id,observation_id`;

async function verifyPersistedSettlementRows(rows: readonly PersistedReceiptRow[], attestor: ContactSettlementAttestor, workspaceId: string, reservationId: string) {
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

/**
 * Rehydrates only the minimum evidence needed by the eligibility projector.
 * Raw contact values and provider payloads are deliberately absent. The returned
 * objects carry a process-local receipt only after the complete durable settlement
 * attestation and exact owner/workspace/assignment scope have been rechecked.
 */
export async function readVerifiedContactEligibilityEvidence(
  database: D1Database,
  attestor: ContactSettlementAttestor | null | undefined,
  requestValue: Readonly<{
    ownerSubject: string;
    workspaceId: string;
    reservationId: string;
    prospectId: string;
    contactId: string;
    configurationId: string;
    configurationDigest: string;
  }> | unknown,
): Promise<readonly PersistedContactEligibilityEvidence[] | null> {
  const request = normalizeEligibilityEvidenceRequest(requestValue);
  if (!request || !isBoundContactSettlementAttestor(attestor)) return null;
  const owner = await database.prepare(
    "SELECT id FROM workspaces WHERE id=? AND owner_subject=? LIMIT 1",
  ).bind(request.workspaceId, request.ownerSubject).first<{ id: string }>();
  if (!owner || !await verifyPersistedContactSettlement(database, attestor, request.workspaceId, request.reservationId)) return null;
  const rows = (await database.prepare(
    `SELECT
      observation.id observation_id,
      observation.workspace_id,
      observation.contact_id,
      observation.configuration_id,
      observation.configuration_digest,
      observation.kind,
      observation.verification_class,
      observation.method,
      observation.retrieved_at,
      observation.observed_at,
      observation.verified_at,
      assignment.id assignment_id,
      assignment.prospect_id,
      assignment.role,
      assignment.quote_revision
     FROM contact_verification_receipts receipt
     JOIN contact_point_observations observation
       ON observation.id=receipt.observation_id AND observation.workspace_id=receipt.workspace_id
      AND observation.verification_receipt_id=receipt.id
     JOIN contact_evidence_assignments assignment
       ON assignment.id=receipt.assignment_id AND assignment.workspace_id=receipt.workspace_id
      AND assignment.prospect_id=receipt.prospect_id AND assignment.contact_id=receipt.contact_id
      AND assignment.configuration_id=receipt.configuration_id
      AND assignment.configuration_digest=receipt.configuration_digest
     WHERE receipt.workspace_id=? AND receipt.reservation_id=?
       AND receipt.prospect_id=? AND receipt.contact_id=?
       AND receipt.configuration_id=? AND receipt.configuration_digest=?
       AND receipt.verification_class IN ('mailbox_verified','source_verified')
     ORDER BY observation.id`,
  ).bind(
    request.workspaceId,
    request.reservationId,
    request.prospectId,
    request.contactId,
    request.configurationId,
    request.configurationDigest,
  ).all<EligibilityEvidenceRow>()).results;
  if (rows.length === 0 || rows.length > 100) return null;
  const evidence: PersistedContactEligibilityEvidence[] = [];
  for (const row of rows) {
    const point = normalizeEligibilityEvidenceRow(row, request);
    if (!point) return null;
    verifiedEligibilityEvidence.add(point);
    evidence.push(point);
  }
  return Object.freeze(evidence);
}

export function isVerifiedPersistedContactEligibilityEvidence(
  value: unknown,
): value is PersistedContactEligibilityEvidence {
  return !!value
    && typeof value === "object"
    && verifiedEligibilityEvidence.has(value)
    && normalizeEligibilityEvidencePoint(value) !== null;
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

const ELIGIBILITY_REQUEST_KEYS = Object.freeze([
  "ownerSubject",
  "workspaceId",
  "reservationId",
  "prospectId",
  "contactId",
  "configurationId",
  "configurationDigest",
]);

function normalizeEligibilityEvidenceRequest(value: unknown) {
  const input = exactDataRecord(value, ELIGIBILITY_REQUEST_KEYS);
  if (
    !input
    || !bounded(input.ownerSubject, 160)
    || !bounded(input.workspaceId, 160)
    || !bounded(input.reservationId, 160)
    || !bounded(input.prospectId, 160)
    || !bounded(input.contactId, 160)
    || !bounded(input.configurationId, 160)
    || !digest(input.configurationDigest)
  ) return null;
  try { structuredClone(value); } catch { return null; }
  return Object.freeze({
    ownerSubject: input.ownerSubject,
    workspaceId: input.workspaceId,
    reservationId: input.reservationId,
    prospectId: input.prospectId,
    contactId: input.contactId,
    configurationId: input.configurationId,
    configurationDigest: input.configurationDigest,
  });
}

function normalizeEligibilityEvidenceRow(
  row: EligibilityEvidenceRow,
  request: NonNullable<ReturnType<typeof normalizeEligibilityEvidenceRequest>>,
): PersistedContactEligibilityEvidence | null {
  if (
    row.workspace_id !== request.workspaceId
    || row.prospect_id !== request.prospectId
    || row.contact_id !== request.contactId
    || row.configuration_id !== request.configurationId
    || row.configuration_digest !== request.configurationDigest
  ) return null;
  return normalizeEligibilityEvidencePoint({
    id: row.observation_id,
    workspaceId: row.workspace_id,
    contactId: row.contact_id,
    profileConfigurationId: row.configuration_id,
    profileConfigurationDigest: row.configuration_digest,
    kind: row.kind,
    verificationClass: row.verification_class,
    method: row.method,
    verifiedAt: row.verified_at,
    assignmentContext: {
      assignmentId: row.assignment_id,
      prospectId: row.prospect_id,
      role: row.role,
      quoteRevision: Number(row.quote_revision),
    },
    retrievedAt: Number(row.retrieved_at),
    observedAt: Number(row.observed_at),
  });
}

function normalizeEligibilityEvidencePoint(value: unknown): PersistedContactEligibilityEvidence | null {
  const input = exactDataRecord(value, [
    "id", "workspaceId", "contactId", "profileConfigurationId",
    "profileConfigurationDigest", "kind", "verificationClass", "method",
    "verifiedAt", "assignmentContext", "retrievedAt", "observedAt",
  ]);
  const assignment = input && exactDataRecord(input.assignmentContext, [
    "assignmentId", "prospectId", "role", "quoteRevision",
  ]);
  const kind = input?.kind === "email" || input?.kind === "phone" ? input.kind : null;
  const verificationClass = input?.verificationClass === "mailbox_verified" || input?.verificationClass === "source_verified"
    ? input.verificationClass : null;
  const method = input?.method === "mailbox_verification" || input?.method === "authoritative_source_reconfirmed"
    ? input.method : null;
  const verifiedAt = positiveInteger(input?.verifiedAt) ? input.verifiedAt as number : null;
  const retrievedAt = positiveInteger(input?.retrievedAt) ? input.retrievedAt as number : null;
  const observedAt = positiveInteger(input?.observedAt) ? input.observedAt as number : null;
  if (
    !input
    || !assignment
    || !bounded(input.id, 160)
    || !bounded(input.workspaceId, 160)
    || !bounded(input.contactId, 160)
    || !bounded(input.profileConfigurationId, 160)
    || !digest(input.profileConfigurationDigest)
    || !kind
    || !verificationClass
    || !method
    || !verifiedAt
    || !retrievedAt
    || !observedAt
    || retrievedAt > verifiedAt
    || verifiedAt > observedAt
    || (verificationClass === "mailbox_verified" && (kind !== "email" || method !== "mailbox_verification"))
    || (verificationClass === "source_verified" && method !== "authoritative_source_reconfirmed")
    || !bounded(assignment.assignmentId, 160)
    || !bounded(assignment.prospectId, 160)
    || (assignment.role !== "champion" && assignment.role !== "economic_buyer" && assignment.role !== "general")
    || !positiveInteger(assignment.quoteRevision)
  ) return null;
  return Object.freeze({
    id: input.id,
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    profileConfigurationId: input.profileConfigurationId,
    profileConfigurationDigest: input.profileConfigurationDigest,
    kind,
    verificationClass,
    method,
    retrievedAt,
    observedAt,
    verifiedAt,
    assignmentContext: Object.freeze({
      assignmentId: assignment.assignmentId,
      prospectId: assignment.prospectId,
      role: assignment.role,
      quoteRevision: assignment.quoteRevision,
    }),
  }) as PersistedContactEligibilityEvidence;
}

function exactDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== "string") || ownKeys.length !== keys.length) return null;
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}
