import {
  executeContactVerification,
  executeContactVerificationBatch,
  ingestContactEvidence,
  isBoundContactEvidenceBatchVerifier,
  preflightContactEvidenceEnvelope,
  type ContactEvidenceBatchVerifier,
  type ContactEvidenceVerifier,
  type ContactVerificationRequest,
  type ContactObservation,
} from "./contact-evidence";
import { isContactProviderPortBoundTo } from "./contact-provider-port";
import { canonicalDigest } from "./enrichment-grant-issuance";
import {
  claimAdmittedCommittedInvocation,
  type AssignedContactEvidence,
  type AuthorizedEnrichmentAssignment,
  type DurableReservationAcknowledgement,
  type EnrichmentAuthorityRepository,
  type ReconciliationReason,
  type SettlementWrite,
} from "./enrichment-authority";

export type ExecuteEnrichmentResult = { kind: "settled"; outcome: "completed" | "partial" | "rejected" } | { kind: "needs_reconciliation" } | { kind: "reconciliation_persistence_failure" } | { kind: "blocked" };
type ValidProviderOutcome =
  | { kind: "completed"; reservationId: string; operationKey: string; documentedUnits: number; documentedCostMinor: number; evidence: readonly unknown[] }
  | { kind: "partial"; reservationId: string; operationKey: string; documentedUnits: number; documentedCostMinor: number; evidence: readonly unknown[] }
  | { kind: "rejected"; reservationId: string; operationKey: string; documentedUnits: 0; documentedCostMinor: 0; evidence: readonly [] }
  | { kind: "timeout"; reservationId: string; operationKey: string }
  | { kind: "ambiguous"; reservationId: string; operationKey: string };
const ASSIGNMENT_KEYS = Object.freeze([
  "reservationId", "workspaceId", "configurationId", "configurationDigest",
  "operationKey", "providerId", "providerVersion", "catalogRef",
  "quoteRevision", "quoteUnitCostMinor", "prospectIds", "evidenceAssignments",
  "operation", "maxUnits", "maxCostMinor", "currency", "expiresAt",
]);
const EVIDENCE_ASSIGNMENT_KEYS = Object.freeze([
  "assignmentId", "prospectId", "role", "workspaceId", "contactId",
  "profileConfigurationId", "profileConfigurationDigest",
]);

/**
 * A provider port is reachable only after the repository atomically claims an
 * already-committed reservation. No retry or provider switch is available.
 */
export async function executeEnrichmentOperation(
  repository: EnrichmentAuthorityRepository,
  port: unknown,
  input: { reservationId: string; now: number },
  verifier?: ContactEvidenceVerifier | ContactEvidenceBatchVerifier | unknown,
): Promise<ExecuteEnrichmentResult> {
  const inputSnapshot = snapshotExecuteEnrichmentInput(input);
  if (!inputSnapshot) return { kind: "blocked" };
  const claim = await claimAdmittedCommittedInvocation(repository, inputSnapshot.reservationId, inputSnapshot.now);
  if (claim.kind === "blocked") return { kind: "blocked" };
  if (claim.kind === "invalid") return reconcile(repository, inputSnapshot.reservationId, "invalid_assignment");
  let assignment: Readonly<AuthorizedEnrichmentAssignment>;
  try {
    if (!positive(claim.claimedAt) || claim.claimedAt > inputSnapshot.now) {
      return reconcile(repository, inputSnapshot.reservationId, "invalid_assignment");
    }
    const assignmentSnapshot = snapshotAssignment(claim.assignment);
    if (!validAssignment(assignmentSnapshot, inputSnapshot.reservationId, inputSnapshot.now)) {
      return reconcile(repository, inputSnapshot.reservationId, "invalid_assignment");
    }
    assignment = freezeAssignment(assignmentSnapshot);
  } catch {
    return reconcile(repository, inputSnapshot.reservationId, "invalid_assignment");
  }
  if (!isContactProviderPortBoundTo(port, assignment)) return reconcile(repository, inputSnapshot.reservationId, "provider_port_mismatch");
  let providerOutcome: unknown;
  try { providerOutcome = await invokePort(port, assignment); }
  catch { return reconcile(repository, inputSnapshot.reservationId, "provider_throw"); }
  let outcome: ValidProviderOutcome | null;
  try { outcome = normalizeOutcome(providerOutcome, assignment); }
  catch { return reconcile(repository, inputSnapshot.reservationId, "invalid_provider_outcome"); }
  if (!outcome) return reconcile(repository, inputSnapshot.reservationId, "invalid_provider_outcome");
  if (outcome.kind === "timeout" || outcome.kind === "ambiguous") return reconcile(repository, inputSnapshot.reservationId, outcome.kind);
  const observations = outcome.kind === "rejected"
    ? []
    : await ingestEvidence(assignment, outcome.evidence, outcome.documentedUnits, verifier);
  if (!observations) return reconcile(repository, inputSnapshot.reservationId, "invalid_evidence");
  const state = outcome.kind === "rejected" ? "released" : "settled";
  const observationIds = Object.freeze(observations.map((observation) => observation.id));
  let settlement: SettlementWrite;
  try {
    const settlementDigest = await canonicalDigest({
      reservationId: inputSnapshot.reservationId,
      terminalState: state,
      terminalReason: outcome.kind,
      documentedUnits: outcome.documentedUnits,
      documentedCostMinor: outcome.documentedCostMinor,
      observationIds,
    });
    settlement = Object.freeze({
      state,
      documentedUnits: outcome.documentedUnits,
      documentedCostMinor: outcome.documentedCostMinor,
      reason: outcome.kind,
      observations: Object.freeze([...observations]),
      settlementDigest,
    });
  } catch {
    return reconcile(repository, inputSnapshot.reservationId, "settlement_failure");
  }
  let acknowledgement: unknown;
  try {
    acknowledgement = await repository.settleReservation(inputSnapshot.reservationId, settlement);
  } catch {
    return reconcile(repository, inputSnapshot.reservationId, "settlement_failure");
  }
  if (!validDurableAcknowledgement(acknowledgement, {
    reservationId: inputSnapshot.reservationId,
    terminalState: state,
    terminalReason: outcome.kind,
    settlementDigest: settlement.settlementDigest,
    observationIds,
  })) return reconcile(repository, inputSnapshot.reservationId, "settlement_failure");
  return { kind: "settled", outcome: outcome.kind };
}

function snapshotExecuteEnrichmentInput(value: unknown): Readonly<{ reservationId: string; now: number }> | null {
  const snapshot = exactDataRecord(value, ["reservationId", "now"]);
  if (!snapshot || !bounded(snapshot.reservationId, 256) || !positive(snapshot.now)) return null;
  try {
    // Reject Proxy objects only after descriptor validation has ruled out
    // accessors, so public-input getters are never evaluated.
    structuredClone(value);
  } catch {
    return null;
  }
  return Object.freeze({
    reservationId: snapshot.reservationId,
    now: snapshot.now,
  });
}
async function invokePort(port: unknown, assignment: Readonly<AuthorizedEnrichmentAssignment>): Promise<unknown> {
  return (port as { enrich(value: typeof assignment): Promise<unknown> }).enrich(assignment);
}
async function reconcile(repository: EnrichmentAuthorityRepository, reservationId: string, reason: ReconciliationReason): Promise<Extract<ExecuteEnrichmentResult, { kind: "needs_reconciliation" | "reconciliation_persistence_failure" }>> {
  try {
    const result = await repository.markNeedsReconciliation(reservationId, reason);
    return validDurableAcknowledgement(result, {
      reservationId,
      terminalState: "needs_reconciliation",
      terminalReason: reason,
      settlementDigest: null,
      observationIds: Object.freeze([]),
    })
      ? { kind: "needs_reconciliation" }
      : { kind: "reconciliation_persistence_failure" };
  } catch {
    return { kind: "reconciliation_persistence_failure" };
  }
}
function validDurableAcknowledgement(
  value: unknown,
  expected: Pick<DurableReservationAcknowledgement, "reservationId" | "terminalState" | "terminalReason" | "settlementDigest" | "observationIds">,
): value is DurableReservationAcknowledgement {
  const snapshot = exactDataRecord(value, [
    "kind",
    "reservationId",
    "terminalState",
    "terminalReason",
    "settlementDigest",
    "observationIds",
    "durableRevision",
  ]);
  if (
    !snapshot
    || snapshot.kind !== "durably_recorded"
    || snapshot.reservationId !== expected.reservationId
    || snapshot.terminalState !== expected.terminalState
    || snapshot.terminalReason !== expected.terminalReason
    || snapshot.settlementDigest !== expected.settlementDigest
    || !positive(snapshot.durableRevision)
  ) return false;
  const observationIds = exactStringArray(snapshot.observationIds);
  return Boolean(
    observationIds
    && observationIds.length === expected.observationIds.length
    && observationIds.every((id, index) => id === expected.observationIds[index]),
  );
}
function exactStringArray(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some((key) => typeof key !== "string")
      || keys.length !== value.length + 1
      || !Object.prototype.hasOwnProperty.call(descriptors, "length")
    ) return null;
    const snapshot: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !bounded(descriptor.value, 256)) return null;
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}
function exactDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== keys.length
      || keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))
    ) return null;
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
function validAssignment(value: unknown, reservationId: string, now: number): value is AuthorizedEnrichmentAssignment {
  if (
    !exactRecord(value, ASSIGNMENT_KEYS) ||
    value.reservationId !== reservationId ||
    !bounded(value.workspaceId, 256) ||
    !bounded(value.configurationId, 256) ||
    !digest(value.configurationDigest) ||
    !/^op_[a-f0-9]{64}$/.test(String(value.operationKey)) ||
    !bounded(value.providerId, 128) ||
    !bounded(value.providerVersion, 128) ||
    !bounded(value.catalogRef, 256) ||
    !positive(value.quoteRevision) ||
    !nonNegative(value.quoteUnitCostMinor) ||
    value.operation !== "business_contact_lookup/v1" ||
    !positive(value.maxUnits) ||
    value.maxUnits > 1_000 ||
    !nonNegative(value.maxCostMinor) ||
    !safeProduct(value.quoteUnitCostMinor, value.maxUnits) ||
    value.quoteUnitCostMinor * value.maxUnits > value.maxCostMinor ||
    !/^[A-Z]{3}$/.test(String(value.currency)) ||
    !positive(value.expiresAt) ||
    value.expiresAt <= now
  ) return false;
  if (!Array.isArray(value.prospectIds) || !value.prospectIds.length || value.prospectIds.length > 100 || value.prospectIds.some((id) => !bounded(id, 256)) || new Set(value.prospectIds).size !== value.prospectIds.length) return false;
  return validAssignmentBindings(value.evidenceAssignments, value.workspaceId, value.configurationId, value.configurationDigest, value.prospectIds, value.maxUnits);
}
function normalizeOutcome(value: unknown, assignment: Pick<AuthorizedEnrichmentAssignment, "reservationId" | "operationKey" | "operation" | "maxUnits" | "maxCostMinor" | "quoteUnitCostMinor">): ValidProviderOutcome | null {
  const snapshot = snapshotProviderOutcome(value);
  if (!snapshot) return null;
  if (!plain(snapshot) || !bounded(snapshot.reservationId, 256) || !bounded(snapshot.operationKey, 256) || snapshot.reservationId !== assignment.reservationId || snapshot.operationKey !== assignment.operationKey || typeof snapshot.kind !== "string") return null;
  if (snapshot.kind === "timeout" || snapshot.kind === "ambiguous") {
    if (!exactRecord(snapshot, ["kind", "reservationId", "operationKey"])) return null;
    return Object.freeze({ kind: snapshot.kind, reservationId: snapshot.reservationId, operationKey: snapshot.operationKey });
  }
  if (snapshot.kind !== "completed" && snapshot.kind !== "partial" && snapshot.kind !== "rejected") return null;
  if (!exactRecord(snapshot, ["kind", "reservationId", "operationKey", "documentedUnits", "documentedCostMinor", "evidence"])) return null;
  const units = snapshot.documentedUnits, cost = snapshot.documentedCostMinor;
  if (
    typeof units !== "number"
    || typeof cost !== "number"
    || !Number.isSafeInteger(units)
    || !Number.isSafeInteger(cost)
    || !Array.isArray(snapshot.evidence)
    || snapshot.evidence.length > 100
    || new TextEncoder().encode(JSON.stringify(snapshot.evidence)).byteLength > 32_768
  ) return null;
  if (snapshot.kind === "rejected") {
    const noEvidence: readonly [] = Object.freeze([]);
    return units === 0 && cost === 0 && snapshot.evidence.length === 0
      ? Object.freeze({ kind: "rejected", reservationId: snapshot.reservationId, operationKey: snapshot.operationKey, documentedUnits: 0, documentedCostMinor: 0, evidence: noEvidence })
      : null;
  }
  if (
    assignment.operation !== "business_contact_lookup/v1" ||
    units <= 0 ||
    units > assignment.maxUnits ||
    snapshot.evidence.length !== units ||
    !safeProduct(assignment.quoteUnitCostMinor, units) ||
    cost !== assignment.quoteUnitCostMinor * units ||
    cost > assignment.maxCostMinor
  ) return null;
  return Object.freeze({
    kind: snapshot.kind,
    reservationId: snapshot.reservationId,
    operationKey: snapshot.operationKey,
    documentedUnits: units,
    documentedCostMinor: cost,
    evidence: Object.freeze(snapshot.evidence),
  });
}
const invalidProviderOutcomeSnapshot = Symbol("invalid_provider_outcome_snapshot");
function snapshotProviderOutcome(value: unknown): unknown | null {
  const budget = { nodes: 0, text: 0 };
  const snapshot = snapshotProviderOutcomeNode(value, 0, new Set<object>(), budget);
  if (snapshot === invalidProviderOutcomeSnapshot) return null;
  try {
    // The descriptor walk rejects accessors without evaluating them. This final
    // cloneability check rejects Proxy/exotic values while authority remains the
    // detached descriptor-derived snapshot.
    structuredClone(value);
  } catch {
    return null;
  }
  return snapshot;
}
function snapshotProviderOutcomeNode(
  value: unknown,
  depth: number,
  seen: Set<object>,
  budget: { nodes: number; text: number },
): unknown | typeof invalidProviderOutcomeSnapshot {
  if (depth > 4 || budget.nodes >= 256) return invalidProviderOutcomeSnapshot;
  budget.nodes += 1;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : invalidProviderOutcomeSnapshot;
  }
  if (typeof value === "string") {
    budget.text += value.length;
    return value.length <= 4_096 && budget.text <= 32_768
      ? value
      : invalidProviderOutcomeSnapshot;
  }
  if (typeof value !== "object" || seen.has(value)) return invalidProviderOutcomeSnapshot;
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== "string")) return invalidProviderOutcomeSnapshot;
    if (Array.isArray(value)) {
      const lengthDescriptor = descriptors.length;
      if (
        prototype !== Array.prototype
        || !lengthDescriptor
        || !("value" in lengthDescriptor)
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || lengthDescriptor.value > 100
        || lengthDescriptor.enumerable
        || lengthDescriptor.configurable
        || ownKeys.length !== lengthDescriptor.value + 1
      ) return invalidProviderOutcomeSnapshot;
      const copy: unknown[] = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          return invalidProviderOutcomeSnapshot;
        }
        const child = snapshotProviderOutcomeNode(descriptor.value, depth + 1, seen, budget);
        if (child === invalidProviderOutcomeSnapshot) return invalidProviderOutcomeSnapshot;
        copy.push(child);
      }
      return Object.freeze(copy);
    }
    if ((prototype !== Object.prototype && prototype !== null) || ownKeys.length > 16) {
      return invalidProviderOutcomeSnapshot;
    }
    const copy: Record<string, unknown> = {};
    for (const key of ownKeys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        return invalidProviderOutcomeSnapshot;
      }
      const child = snapshotProviderOutcomeNode(descriptor.value, depth + 1, seen, budget);
      if (child === invalidProviderOutcomeSnapshot) return invalidProviderOutcomeSnapshot;
      copy[key] = child;
    }
    return Object.freeze(copy);
  } catch {
    return invalidProviderOutcomeSnapshot;
  } finally {
    seen.delete(value);
  }
}
function plain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function safeProduct(left: number, right: number): boolean { return left === 0 || left <= Math.floor(Number.MAX_SAFE_INTEGER / right); }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function validAssignmentBindings(value: unknown, workspaceId: string, configurationId: string, configurationDigest: string, prospectIds: readonly string[], maxUnits: number): value is readonly AssignedContactEvidence[] {
  if (
    !Array.isArray(value) ||
    value.length < prospectIds.length ||
    value.length > maxUnits ||
    value.length > 100 ||
    new Set(value.map((item) => plain(item) ? item.assignmentId : null)).size !== value.length ||
    new Set(value.map((item) => plain(item) ? item.contactId : null)).size !== value.length ||
    prospectIds.some((prospectId) => !value.some((item) => plain(item) && item.prospectId === prospectId))
  ) return false;
  return value.every((item) =>
    exactRecord(item, EVIDENCE_ASSIGNMENT_KEYS) &&
    bounded(item.assignmentId, 256) &&
    bounded(item.prospectId, 256) &&
    prospectIds.includes(item.prospectId) &&
    (item.role === "champion" || item.role === "economic_buyer" || item.role === "general") &&
    item.workspaceId === workspaceId &&
    bounded(item.contactId, 256) &&
    item.profileConfigurationId === configurationId &&
    item.profileConfigurationDigest === configurationDigest
  );
}
function snapshotAssignment(value: unknown): unknown {
  if (!exactRecord(value, ASSIGNMENT_KEYS)) return null;
  const prospectIds = value.prospectIds;
  const evidenceAssignments = value.evidenceAssignments;
  if (!Array.isArray(prospectIds) || !Array.isArray(evidenceAssignments)) return null;
  const bindingSnapshots: Record<string, unknown>[] = [];
  for (const item of evidenceAssignments) {
    if (!exactRecord(item, EVIDENCE_ASSIGNMENT_KEYS)) return null;
    bindingSnapshots.push({
      assignmentId: item.assignmentId,
      prospectId: item.prospectId,
      role: item.role,
      workspaceId: item.workspaceId,
      contactId: item.contactId,
      profileConfigurationId: item.profileConfigurationId,
      profileConfigurationDigest: item.profileConfigurationDigest,
    });
  }
  return {
    reservationId: value.reservationId,
    workspaceId: value.workspaceId,
    configurationId: value.configurationId,
    configurationDigest: value.configurationDigest,
    operationKey: value.operationKey,
    providerId: value.providerId,
    providerVersion: value.providerVersion,
    catalogRef: value.catalogRef,
    quoteRevision: value.quoteRevision,
    quoteUnitCostMinor: value.quoteUnitCostMinor,
    prospectIds: [...prospectIds],
    evidenceAssignments: bindingSnapshots,
    operation: value.operation,
    maxUnits: value.maxUnits,
    maxCostMinor: value.maxCostMinor,
    currency: value.currency,
    expiresAt: value.expiresAt,
  };
}
function freezeAssignment(assignment: AuthorizedEnrichmentAssignment): Readonly<AuthorizedEnrichmentAssignment> {
  return Object.freeze({
    reservationId: assignment.reservationId,
    workspaceId: assignment.workspaceId,
    configurationId: assignment.configurationId,
    configurationDigest: assignment.configurationDigest,
    operationKey: assignment.operationKey,
    providerId: assignment.providerId,
    providerVersion: assignment.providerVersion,
    catalogRef: assignment.catalogRef,
    quoteRevision: assignment.quoteRevision,
    quoteUnitCostMinor: assignment.quoteUnitCostMinor,
    prospectIds: Object.freeze([...assignment.prospectIds]),
    evidenceAssignments: Object.freeze(assignment.evidenceAssignments.map((item) => Object.freeze({
      assignmentId: item.assignmentId,
      prospectId: item.prospectId,
      role: item.role,
      workspaceId: item.workspaceId,
      contactId: item.contactId,
      profileConfigurationId: item.profileConfigurationId,
      profileConfigurationDigest: item.profileConfigurationDigest,
    }))),
    operation: assignment.operation,
    maxUnits: assignment.maxUnits,
    maxCostMinor: assignment.maxCostMinor,
    currency: assignment.currency,
    expiresAt: assignment.expiresAt,
  });
}
async function ingestEvidence(
  assignment: AuthorizedEnrichmentAssignment,
  envelopes: readonly unknown[],
  documentedUnits: number,
  verifier: ContactEvidenceVerifier | ContactEvidenceBatchVerifier | unknown,
): Promise<readonly ContactObservation[] | null> {
  const preflighted = preflightEvidenceSet(assignment, envelopes, documentedUnits);
  if (!preflighted) return null;
  let verifications: readonly unknown[] = Object.freeze([]);
  if (verifier !== undefined) {
    const requests = Object.freeze(preflighted.map((item) =>
      verificationRequest(assignment, item)
    ));
    if (preflighted.length > 1 || isBoundContactEvidenceBatchVerifier(verifier)) {
      const trusted = await executeContactVerificationBatch(verifier, requests);
      if (!trusted) return null;
      verifications = trusted;
    } else {
      const trusted = await executeContactVerification(verifier, requests[0]);
      if (!trusted) return null;
      verifications = Object.freeze([trusted]);
    }
  }
  const observations: ContactObservation[] = [];
  for (let index = 0; index < preflighted.length; index += 1) {
    const { binding, envelope } = preflighted[index];
    const result = ingestContactEvidence({
      assignmentId: binding.assignmentId,
      prospectId: binding.prospectId,
      role: binding.role,
      quoteRevision: assignment.quoteRevision,
      workspaceId: binding.workspaceId,
      contactId: binding.contactId,
      profileConfigurationId: binding.profileConfigurationId,
      profileConfigurationDigest: binding.profileConfigurationDigest,
      providerAuthority: {
        providerId: assignment.providerId,
        providerVersion: assignment.providerVersion,
        catalogRef: assignment.catalogRef,
      },
    }, envelope, verifier === undefined ? undefined : verifications[index]);
    if (!result.accepted || observations.some((item) => item.id === result.observation.id)) return null;
    observations.push(result.observation);
  }
  return observations.length === documentedUnits
    ? Object.freeze(observations)
    : null;
}

function verificationRequest(
  assignment: AuthorizedEnrichmentAssignment,
  item: PreflightedEvidence,
): ContactVerificationRequest {
  return Object.freeze({
    assignmentId: item.binding.assignmentId,
    prospectId: item.binding.prospectId,
    role: item.binding.role,
    assignment: Object.freeze({
      workspaceId: item.binding.workspaceId,
      contactId: item.binding.contactId,
      profileConfigurationId: item.binding.profileConfigurationId,
      profileConfigurationDigest: item.binding.profileConfigurationDigest,
      providerId: assignment.providerId,
      providerVersion: assignment.providerVersion,
      catalogRef: assignment.catalogRef,
      quoteRevision: assignment.quoteRevision,
    }),
    envelope: item.envelope,
  });
}

type PreflightedEvidence = Readonly<{
  binding: AssignedContactEvidence;
  envelope: Readonly<Record<string, unknown>>;
}>;

function preflightEvidenceSet(
  assignment: AuthorizedEnrichmentAssignment,
  envelopes: readonly unknown[],
  documentedUnits: number,
): readonly PreflightedEvidence[] | null {
  if (
    !exactDenseArray(envelopes, documentedUnits, 100)
    || documentedUnits < 1
    || documentedUnits > assignment.maxUnits
  ) return null;
  const bindings = new Map(assignment.evidenceAssignments.map((item) => [item.assignmentId, item]));
  const consumedAssignments = new Set<string>();
  const consumedContacts = new Set<string>();
  const consumedObservations = new Set<string>();
  const preflighted: PreflightedEvidence[] = [];
  for (const value of envelopes) {
    if (!plain(value) || !bounded(value.assignmentId, 256)) return null;
    const binding = bindings.get(value.assignmentId);
    if (!binding) return null;
    const envelope = preflightContactEvidenceEnvelope({
      assignmentId: binding.assignmentId,
      prospectId: binding.prospectId,
      role: binding.role,
      quoteRevision: assignment.quoteRevision,
      workspaceId: binding.workspaceId,
      contactId: binding.contactId,
      profileConfigurationId: binding.profileConfigurationId,
      profileConfigurationDigest: binding.profileConfigurationDigest,
      providerAuthority: {
        providerId: assignment.providerId,
        providerVersion: assignment.providerVersion,
        catalogRef: assignment.catalogRef,
      },
    }, value);
    if (!envelope) return null;
    if (
      envelope.prospectId !== binding.prospectId
      || envelope.workspaceId !== binding.workspaceId
      || envelope.contactId !== binding.contactId
      || envelope.profileConfigurationId !== binding.profileConfigurationId
      || envelope.profileConfigurationDigest !== binding.profileConfigurationDigest
      || !assignment.prospectIds.includes(binding.prospectId)
      || consumedAssignments.has(binding.assignmentId)
      || consumedContacts.has(binding.contactId)
      || consumedObservations.has(envelope.id as string)
    ) return null;
    consumedAssignments.add(binding.assignmentId);
    consumedContacts.add(binding.contactId);
    consumedObservations.add(envelope.id as string);
    preflighted.push(Object.freeze({ binding, envelope }));
  }
  return preflighted.length === documentedUnits ? Object.freeze(preflighted) : null;
}

function exactDenseArray(value: unknown, expectedLength: number, maximum: number): value is readonly unknown[] {
  try {
    if (
      !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || value.length !== expectedLength
      || value.length > maximum
    ) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some((key) => typeof key !== "string")
      || keys.length !== value.length + 1
      || !Object.hasOwn(descriptors, "length")
    ) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
    }
    return true;
  } catch {
    return false;
  }
}
