import { ingestContactEvidence, type ContactEvidenceAssignment, type ContactObservation } from "./contact-evidence";
import type { AssignedContactEvidence, AuthorizedEnrichmentAssignment, EnrichmentAuthorityRepository, ReconciliationReason } from "./enrichment-authority";

export type ExecuteEnrichmentResult = { kind: "settled"; outcome: "completed" | "partial" | "rejected" } | { kind: "needs_reconciliation" } | { kind: "reconciliation_persistence_failure" } | { kind: "blocked" };
type ValidProviderOutcome =
  | { kind: "completed"; reservationId: string; operationKey: string; documentedUnits: number; documentedCostMinor: number; evidence: readonly unknown[] }
  | { kind: "partial"; reservationId: string; operationKey: string; documentedUnits: number; documentedCostMinor: number; evidence: readonly unknown[] }
  | { kind: "rejected"; reservationId: string; operationKey: string; documentedUnits: 0; documentedCostMinor: 0; evidence: readonly [] }
  | { kind: "timeout"; reservationId: string; operationKey: string }
  | { kind: "ambiguous"; reservationId: string; operationKey: string };

export type ContactEvidenceVerifier = Readonly<{
  verify(input: Readonly<{
    assignmentId: string;
    prospectId: string;
    role: AssignedContactEvidence["role"];
    assignment: Readonly<Omit<ContactEvidenceAssignment, "providerAuthority"> & {
      providerId: string;
      providerVersion: string;
      catalogRef: string;
      quoteRevision: number;
    }>;
    envelope: unknown;
  }>): Promise<unknown>;
}>;

/**
 * A provider port is reachable only after the repository atomically claims an
 * already-committed reservation. No retry or provider switch is available.
 */
export async function executeEnrichmentOperation(
  repository: EnrichmentAuthorityRepository,
  port: unknown,
  input: { reservationId: string; now: number },
  verifier?: ContactEvidenceVerifier | unknown,
): Promise<ExecuteEnrichmentResult> {
  if (!validInput(input)) return { kind: "blocked" };
  const claim = await repository.claimCommittedInvocation(input.reservationId, input.now);
  if (!plain(claim) || claim.kind !== "claimed") return { kind: "blocked" };
  if (!positive(claim.claimedAt) || claim.claimedAt > input.now) return reconcile(repository, input.reservationId, "invalid_assignment");
  const assignment = claim.assignment;
  if (!validAssignment(assignment, input.reservationId, input.now)) return reconcile(repository, input.reservationId, "invalid_assignment");
  let outcome: unknown;
  try { outcome = await invokePort(port, freezeAssignment(assignment)); }
  catch { return reconcile(repository, input.reservationId, "provider_throw"); }
  if (!validOutcome(outcome, assignment)) return reconcile(repository, input.reservationId, "invalid_provider_outcome");
  if (outcome.kind === "timeout" || outcome.kind === "ambiguous") return reconcile(repository, input.reservationId, outcome.kind);
  const observations = outcome.kind === "rejected" ? [] : await ingestEvidence(assignment, outcome.evidence, verifier);
  if (!observations) return reconcile(repository, input.reservationId, "invalid_evidence");
  const state = outcome.kind === "rejected" ? "released" : "settled";
  try { await repository.settleReservation(input.reservationId, { state, documentedUnits: outcome.documentedUnits, documentedCostMinor: outcome.documentedCostMinor, reason: outcome.kind, observations }); }
  catch { return reconcile(repository, input.reservationId, "settlement_failure"); }
  return { kind: "settled", outcome: outcome.kind };
}

function validInput(input: { reservationId: string; now: number }): boolean { return bounded(input.reservationId, 256) && Number.isSafeInteger(input.now) && input.now > 0; }
async function invokePort(port: unknown, assignment: Readonly<AuthorizedEnrichmentAssignment>): Promise<unknown> { if (!port || typeof port !== "object" || typeof (port as { enrich?: unknown }).enrich !== "function") throw new Error("contact_provider_unavailable"); return (port as { enrich(value: typeof assignment): Promise<unknown> }).enrich(assignment); }
async function reconcile(repository: EnrichmentAuthorityRepository, reservationId: string, reason: ReconciliationReason): Promise<Extract<ExecuteEnrichmentResult, { kind: "needs_reconciliation" | "reconciliation_persistence_failure" }>> {
  try { const result = await repository.markNeedsReconciliation(reservationId, reason); return result?.kind === "recorded" ? { kind: "needs_reconciliation" } : { kind: "reconciliation_persistence_failure" }; }
  catch { return { kind: "reconciliation_persistence_failure" }; }
}
function validAssignment(value: unknown, reservationId: string, now: number): value is AuthorizedEnrichmentAssignment {
  if (!plain(value) || value.reservationId !== reservationId || !bounded(value.workspaceId, 256) || !bounded(value.configurationId, 256) || !digest(value.configurationDigest) || !/^op_[a-f0-9]{64}$/.test(String(value.operationKey)) || !bounded(value.providerId, 128) || !bounded(value.providerVersion, 128) || !bounded(value.catalogRef, 256) || !positive(value.quoteRevision) || value.operation !== "business_contact_lookup/v1" || !positive(value.maxUnits) || value.maxUnits > 1_000 || !nonNegative(value.maxCostMinor) || !/^[A-Z]{3}$/.test(String(value.currency)) || !positive(value.expiresAt) || value.expiresAt <= now) return false;
  if (!Array.isArray(value.prospectIds) || !value.prospectIds.length || value.prospectIds.length > 100 || value.prospectIds.some((id) => !bounded(id, 256)) || new Set(value.prospectIds).size !== value.prospectIds.length) return false;
  return validAssignmentBindings(value.evidenceAssignments, value.workspaceId, value.configurationId, value.configurationDigest, value.prospectIds, value.maxUnits);
}
function validOutcome(value: unknown, assignment: { reservationId: string; operationKey: string; maxUnits: number; maxCostMinor: number }): value is ValidProviderOutcome {
  if (!plain(value) || !bounded(value.reservationId, 256) || !bounded(value.operationKey, 256) || value.reservationId !== assignment.reservationId || value.operationKey !== assignment.operationKey || typeof value.kind !== "string") return false;
  if (value.kind === "timeout" || value.kind === "ambiguous") return Object.keys(value).every((key) => ["kind", "reservationId", "operationKey"].includes(key));
  if (value.kind !== "completed" && value.kind !== "partial" && value.kind !== "rejected") return false;
  const units = value.documentedUnits, cost = value.documentedCostMinor;
  return Object.keys(value).every((key) => ["kind", "reservationId", "operationKey", "documentedUnits", "documentedCostMinor", "evidence"].includes(key)) && typeof units === "number" && typeof cost === "number" && Number.isSafeInteger(units) && Number.isSafeInteger(cost) && units >= 0 && cost >= 0 && units <= assignment.maxUnits && cost <= assignment.maxCostMinor && (value.kind !== "rejected" || units === 0 && cost === 0 && Array.isArray(value.evidence) && value.evidence.length === 0) && boundedEvidence(value.evidence);
}
function boundedEvidence(value: unknown): value is readonly unknown[] { if (!Array.isArray(value) || value.length > 100 || !value.every((item) => boundedValue(item, 0))) return false; try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 32_768; } catch { return false; } }
function boundedValue(value: unknown, depth: number): boolean { if (depth > 4 || value === null || typeof value === "boolean" || typeof value === "number") return value === null || typeof value === "boolean" || Number.isFinite(value); if (typeof value === "string") return value.length <= 4_096; if (Array.isArray(value)) return value.length <= 16 && value.every((item) => boundedValue(item, depth + 1)); if (plain(value)) return Object.keys(value).length <= 16 && Object.values(value).every((item) => boundedValue(item, depth + 1)); return false; }
function plain(value: unknown): value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === null || prototype?.constructor?.name === "Object"; }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
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
    plain(item) &&
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
function freezeAssignment(assignment: AuthorizedEnrichmentAssignment): Readonly<AuthorizedEnrichmentAssignment> {
  return Object.freeze({ ...assignment, prospectIds: Object.freeze([...assignment.prospectIds]), evidenceAssignments: Object.freeze(assignment.evidenceAssignments.map((item) => Object.freeze({ ...item }))) });
}
async function ingestEvidence(
  assignment: AuthorizedEnrichmentAssignment,
  envelopes: readonly unknown[],
  verifier: ContactEvidenceVerifier | unknown,
): Promise<readonly ContactObservation[] | null> {
  const observations: ContactObservation[] = [];
  for (const envelope of envelopes) {
    if (!plain(envelope) || !bounded(envelope.assignmentId, 256) || !bounded(envelope.prospectId, 256)) return null;
    const binding = assignment.evidenceAssignments.find((item) => item.assignmentId === envelope.assignmentId && item.prospectId === envelope.prospectId && item.workspaceId === envelope.workspaceId && item.contactId === envelope.contactId && item.profileConfigurationId === envelope.profileConfigurationId && item.profileConfigurationDigest === envelope.profileConfigurationDigest);
    if (!binding) return null;
    let trustedVerification: unknown = undefined;
    if (verifier !== undefined) {
      if (!plain(verifier) || typeof verifier.verify !== "function") return null;
      try {
        trustedVerification = await (verifier as ContactEvidenceVerifier).verify(Object.freeze({
          assignmentId: binding.assignmentId,
          prospectId: binding.prospectId,
          role: binding.role,
          assignment: Object.freeze({
            workspaceId: binding.workspaceId,
            contactId: binding.contactId,
            profileConfigurationId: binding.profileConfigurationId,
            profileConfigurationDigest: binding.profileConfigurationDigest,
            providerId: assignment.providerId,
            providerVersion: assignment.providerVersion,
            catalogRef: assignment.catalogRef,
            quoteRevision: assignment.quoteRevision,
          }),
          envelope,
        }));
      } catch {
        return null;
      }
      if (
        !plain(trustedVerification) ||
        trustedVerification.providerId !== assignment.providerId ||
        trustedVerification.providerVersion !== assignment.providerVersion ||
        trustedVerification.catalogRef !== assignment.catalogRef
      ) return null;
    }
    const result = ingestContactEvidence({
      workspaceId: binding.workspaceId,
      contactId: binding.contactId,
      profileConfigurationId: binding.profileConfigurationId,
      profileConfigurationDigest: binding.profileConfigurationDigest,
      providerAuthority: {
        providerId: assignment.providerId,
        providerVersion: assignment.providerVersion,
        catalogRef: assignment.catalogRef,
      },
    }, envelope, trustedVerification);
    if (!result.accepted || observations.some((item) => item.id === result.observation.id)) return null;
    observations.push(result.observation);
  }
  return Object.freeze(observations);
}
