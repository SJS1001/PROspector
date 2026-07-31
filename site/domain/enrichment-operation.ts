import type { ContactProviderOutcome } from "./contact-provider-port";
import type { AuthorizedEnrichmentAssignment, EnrichmentAuthorityRepository } from "./enrichment-authority";

export type ExecuteEnrichmentResult = { kind: "settled"; outcome: "completed" | "partial" | "rejected" } | { kind: "needs_reconciliation" } | { kind: "blocked" };

/**
 * A provider port is reachable only after the repository atomically claims an
 * already-committed reservation. No retry or provider switch is available.
 */
export async function executeEnrichmentOperation(repository: EnrichmentAuthorityRepository, port: unknown, input: { reservationId: string; now: number }): Promise<ExecuteEnrichmentResult> {
  if (!validInput(input)) return { kind: "blocked" };
  const assignment = await repository.claimCommittedInvocation(input.reservationId, input.now);
  if (!assignment) return { kind: "blocked" };
  let outcome: unknown;
  try { outcome = await invokePort(port, Object.freeze({ ...assignment, prospectIds: Object.freeze([...assignment.prospectIds]) })); }
  catch { await reconcile(repository, input.reservationId, "provider_throw"); return { kind: "needs_reconciliation" }; }
  if (!validOutcome(outcome, assignment)) { await reconcile(repository, input.reservationId, "invalid_provider_outcome"); return { kind: "needs_reconciliation" }; }
  if (outcome.kind === "timeout" || outcome.kind === "ambiguous") { await reconcile(repository, input.reservationId, outcome.kind); return { kind: "needs_reconciliation" }; }
  const state = outcome.kind === "rejected" ? "released" : "settled";
  try { await repository.settleReservation(input.reservationId, { state, documentedUnits: outcome.documentedUnits, documentedCostMinor: outcome.documentedCostMinor, reason: outcome.kind }); }
  catch { await reconcile(repository, input.reservationId, "provider_throw"); return { kind: "needs_reconciliation" }; }
  return { kind: "settled", outcome: outcome.kind };
}

function validInput(input: { reservationId: string; now: number }): boolean { return typeof input.reservationId === "string" && input.reservationId.length > 0 && Number.isSafeInteger(input.now); }
async function invokePort(port: unknown, assignment: Readonly<AuthorizedEnrichmentAssignment>): Promise<unknown> { if (!port || typeof port !== "object" || typeof (port as { enrich?: unknown }).enrich !== "function") throw new Error("contact_provider_unavailable"); return (port as { enrich(value: typeof assignment): Promise<unknown> }).enrich(assignment); }
async function reconcile(repository: EnrichmentAuthorityRepository, reservationId: string, reason: "timeout" | "ambiguous" | "invalid_provider_outcome" | "provider_throw"): Promise<void> { try { await repository.markNeedsReconciliation(reservationId, reason); } catch { /* Claim has already made this reservation non-retryable. */ } }
function validOutcome(value: unknown, assignment: { reservationId: string; operationKey: string; maxUnits: number; maxCostMinor: number }): value is ContactProviderOutcome {
  if (!plain(value) || !bounded(value.reservationId, 256) || !bounded(value.operationKey, 256) || value.reservationId !== assignment.reservationId || value.operationKey !== assignment.operationKey || typeof value.kind !== "string") return false;
  if (value.kind === "timeout" || value.kind === "ambiguous") return Object.keys(value).every((key) => ["kind", "reservationId", "operationKey"].includes(key));
  if (value.kind !== "completed" && value.kind !== "partial" && value.kind !== "rejected") return false;
  return Object.keys(value).every((key) => ["kind", "reservationId", "operationKey", "documentedUnits", "documentedCostMinor", "evidence"].includes(key)) && Number.isSafeInteger(value.documentedUnits) && Number.isSafeInteger(value.documentedCostMinor) && value.documentedUnits >= 0 && value.documentedCostMinor >= 0 && value.documentedUnits <= assignment.maxUnits && value.documentedCostMinor <= assignment.maxCostMinor && (value.kind !== "rejected" || value.documentedUnits === 0 && value.documentedCostMinor === 0) && boundedEvidence(value.evidence);
}
function boundedEvidence(value: unknown): value is readonly unknown[] { if (!Array.isArray(value) || value.length > 100 || !value.every((item) => boundedValue(item, 0))) return false; try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 32_768; } catch { return false; } }
function boundedValue(value: unknown, depth: number): boolean { if (depth > 4 || value === null || typeof value === "boolean" || typeof value === "number") return value === null || typeof value === "boolean" || Number.isFinite(value); if (typeof value === "string") return value.length <= 4_096; if (Array.isArray(value)) return value.length <= 16 && value.every((item) => boundedValue(item, depth + 1)); if (plain(value)) return Object.keys(value).length <= 16 && Object.values(value).every((item) => boundedValue(item, depth + 1)); return false; }
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
