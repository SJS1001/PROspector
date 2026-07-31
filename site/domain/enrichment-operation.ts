import type { ContactProviderOutcome, ContactProviderPort } from "./contact-provider-port";
import type { EnrichmentAuthorityRepository } from "./enrichment-authority";

export type ExecuteEnrichmentResult = { kind: "settled"; outcome: "completed" | "partial" | "rejected" } | { kind: "needs_reconciliation" } | { kind: "blocked" };

/**
 * A provider port is reachable only after the repository atomically claims an
 * already-committed reservation. No retry or provider switch is available.
 */
export async function executeEnrichmentOperation(repository: EnrichmentAuthorityRepository, port: ContactProviderPort, input: { reservationId: string; now: number }): Promise<ExecuteEnrichmentResult> {
  if (!validInput(input)) return { kind: "blocked" };
  const assignment = await repository.claimCommittedInvocation(input.reservationId, input.now);
  if (!assignment) return { kind: "blocked" };
  let outcome: ContactProviderOutcome;
  try { outcome = await port.enrich(Object.freeze({ ...assignment, prospectIds: Object.freeze([...assignment.prospectIds]) })); }
  catch { await repository.markNeedsReconciliation(input.reservationId, "provider_throw"); return { kind: "needs_reconciliation" }; }
  if (outcome.reservationId !== assignment.reservationId || outcome.operationKey !== assignment.operationKey) {
    await repository.markNeedsReconciliation(input.reservationId, "invalid_provider_outcome"); return { kind: "needs_reconciliation" };
  }
  if (!("documentedUnits" in outcome) || !("documentedCostMinor" in outcome) || !("evidence" in outcome)) {
    await repository.markNeedsReconciliation(input.reservationId, outcome.kind); return { kind: "needs_reconciliation" };
  }
  if (!documentedOutcomeWithinAssignment(outcome, assignment)) {
    await repository.markNeedsReconciliation(input.reservationId, "invalid_provider_outcome"); return { kind: "needs_reconciliation" };
  }
  const state = outcome.kind === "rejected" ? "released" : "settled";
  await repository.settleReservation(input.reservationId, { state, documentedUnits: outcome.documentedUnits, documentedCostMinor: outcome.documentedCostMinor, reason: outcome.kind });
  return { kind: "settled", outcome: outcome.kind };
}

function validInput(input: { reservationId: string; now: number }): boolean { return typeof input.reservationId === "string" && input.reservationId.length > 0 && Number.isSafeInteger(input.now); }
function documentedOutcomeWithinAssignment(outcome: Extract<ContactProviderOutcome, { documentedUnits: number }>, assignment: { maxUnits: number; maxCostMinor: number }): boolean { return Number.isSafeInteger(outcome.documentedUnits) && Number.isSafeInteger(outcome.documentedCostMinor) && outcome.documentedUnits >= 0 && outcome.documentedCostMinor >= 0 && outcome.documentedUnits <= assignment.maxUnits && outcome.documentedCostMinor <= assignment.maxCostMinor && Array.isArray(outcome.evidence); }
