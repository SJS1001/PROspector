import { isContactProviderPortBoundTo } from "./contact-provider-port";
import type { ContactSettlementAttestor } from "./contact-settlement-attestor";
import type { ContactsCommandContext, ContactsCommandService, CreateGrantCommand, MergeIdentityCommand, RunGrantedOperationCommand, SplitIdentityCommand } from "./contacts-handler";
import { reserveEnrichmentOperation } from "./enrichment-authority";
import { canonicalDigest, issueEnrichmentGrant } from "./enrichment-grant-issuance";
import { executeEnrichmentOperation } from "./enrichment-operation";
import { createD1EnrichmentRepository } from "./enrichment-repository";
import type { ContactEvidenceBatchVerifier, ContactEvidenceVerifier } from "./contact-evidence";
import { createD1IdentityResolutionRepository } from "./identity-repository";
import { applyIdentityResolution, type IdentitySuggestion } from "./identity-resolution";

type Dependencies = Readonly<{
  database: D1Database;
  providerPort: unknown;
  contactEvidenceVerifier?: ContactEvidenceVerifier | ContactEvidenceBatchVerifier | unknown;
  contactSettlementAttestor?: ContactSettlementAttestor;
  now?: () => number;
}>;

type CommandStatus = "blocked" | "conflict" | "stale" | "wrong_scope";
type TerminalEventRow = {
  durable_revision: number;
  state: string;
  claimed_at: number | null;
  terminal_reason: string | null;
  settlement_digest: string | null;
  documented_units: number | null;
  documented_cost_minor: number | null;
  observation_ids_json: string;
  acknowledgement_digest: string;
};

/**
 * Local-only D1 composition candidate for the Contacts command seam. The
 * production route deliberately does not import this factory. Its caller must
 * still satisfy the independent Phase 4 and controlled-enrichment gates in the
 * handler before any method is reachable.
 */
export function createD1ContactsCommandService(dependencies: Dependencies): ContactsCommandService {
  if (!dependencies?.database || typeof dependencies.database.prepare !== "function") {
    throw new TypeError("invalid_contacts_command_database");
  }
  const clock = dependencies.now ?? Date.now;

  const service: ContactsCommandService = {
    async createGrant(context, command) {
      if (!validContext(context) || !validCreate(command)) return denied("grant", "blocked");
      try {
        const now = positiveTime(clock());
        const repository = enrichmentRepository(dependencies, context, clock);
        const snapshot = await repository.loadIssuanceSnapshot(context.principalSubject, [command.prospectId]);
        if (!snapshot || snapshot.workspaceId !== context.workspaceId || snapshot.ownerSubject !== context.principalSubject) {
          return denied("grant", "wrong_scope");
        }
        const prospect = snapshot.prospects.length === 1 ? snapshot.prospects[0] : undefined;
        if (!prospect || prospect.id !== command.prospectId) return denied("grant", "wrong_scope");
        if (prospect.revision !== command.expectedProspectRevision) return denied("grant", "stale");

        // The expiry is copied from immutable quote authority. Deriving a new
        // now+TTL value would make an otherwise exact idempotent replay drift.
        const result = await issueEnrichmentGrant(repository, {
          principalSubject: context.principalSubject,
          prospectIds: [command.prospectId],
          operation: "business_contact_lookup/v1",
          maxUnits: 1,
          maxCostMinor: snapshot.quote.unitCostMinor,
          currency: snapshot.quote.currency,
          expiresAt: snapshot.quote.expiresAt,
          expectedRevision: snapshot.revision,
          idempotencyKey: command.idempotencyKey,
          now,
        });
        if (result.kind === "conflict") return denied("grant", "conflict");
        if (result.kind === "blocked") return denied("grant", mapGrantBlock(result.reason));
        return Object.freeze({
          kind: "grant" as const,
          status: result.replayed ? "replayed" as const : "created" as const,
          grantId: result.grant.id,
          tupleDigest: result.grant.tuple.digest,
        });
      } catch {
        return denied("grant", "blocked");
      }
    },

    async runGrantedOperation(context, command) {
      if (!validContext(context) || !validRun(command)) return denied("operation", "blocked");
      try {
        const repository = enrichmentRepository(dependencies, context, clock);
        const authority = await repository.loadReservationAuthority(command.grantId);
        if (
          !authority
          || authority.workspaceId !== context.workspaceId
          || authority.principalSubject !== context.principalSubject
          || authority.grant.id !== command.grantId
          || authority.grant.workspaceId !== context.workspaceId
          || authority.grant.tuple.ownerSubject !== context.principalSubject
        ) return denied("operation", "wrong_scope");

        const descriptor = Object.freeze({
          providerId: authority.grant.tuple.providerId,
          providerVersion: authority.grant.tuple.providerVersion,
          catalogRef: authority.grant.tuple.catalogRef,
        });
        // This check is deliberately before reserveEnrichmentOperation. An
        // absent or mismatched adapter cannot consume budget or the grant.
        if (!isContactProviderPortBoundTo(dependencies.providerPort, descriptor)) {
          return denied("operation", "blocked");
        }

        const now = positiveTime(clock());
        const reservation = await reserveEnrichmentOperation(repository, {
          grantId: command.grantId,
          principalSubject: context.principalSubject,
          operationKey: authority.grant.tuple.operationKey,
          now,
        });
        if (reservation.kind === "blocked") return denied("operation", "blocked");
        const execution = await executeEnrichmentOperation(
          repository,
          dependencies.providerPort,
          { reservationId: reservation.reservation.id, now },
          dependencies.contactEvidenceVerifier,
        );
        if (execution.kind !== "settled" && execution.kind !== "needs_reconciliation") {
          return denied("operation", "blocked");
        }
        const event = await readValidatedTerminalEvent(
          dependencies.database,
          context.workspaceId,
          reservation.reservation.id,
          execution.kind,
        );
        if (!event) return denied("operation", "blocked");
        return Object.freeze({
          kind: "operation" as const,
          status: execution.kind === "settled" ? "settled" as const : "reconciliation_required" as const,
          grantId: command.grantId,
          operationId: reservation.reservation.id,
          resultDigest: event.acknowledgement_digest,
          revision: Number(event.durable_revision),
        });
      } catch {
        return denied("operation", "blocked");
      }
    },

    async applyIdentityMerge(context, command) {
      return applyIdentity(dependencies, context, command, "merge", clock);
    },

    async applyIdentitySplit(context, command) {
      return applyIdentity(dependencies, context, command, "split", clock);
    },
  };
  return Object.freeze(service);
}

function enrichmentRepository(dependencies: Dependencies, context: ContactsCommandContext, clock: () => number) {
  return createD1EnrichmentRepository(dependencies.database, {
    workspaceId: context.workspaceId,
    ownerSubject: context.principalSubject,
    now: clock,
    contactSettlementAttestor: dependencies.contactSettlementAttestor,
  });
}

async function applyIdentity(
  dependencies: Dependencies,
  context: ContactsCommandContext,
  command: MergeIdentityCommand | SplitIdentityCommand,
  expectedKind: "merge" | "split",
  clock: () => number,
) {
  if (!validContext(context) || !(expectedKind === "merge" ? validMerge(command) : validSplit(command))) {
    return denied("identity", "blocked");
  }
  try {
    const locator = await dependencies.database.prepare(
      `SELECT subject_kind,kind,revision FROM identity_suggestions
       WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1`,
    ).bind(command.suggestionId, context.workspaceId, context.principalSubject)
      .first<{ subject_kind: string; kind: string; revision: number }>();
    if (!locator) return denied("identity", "wrong_scope");
    if (locator.subject_kind !== "contact" && locator.subject_kind !== "organization") return denied("identity", "blocked");
    if (locator.kind !== expectedKind) return denied("identity", "conflict");
    if (Number(locator.revision) !== command.expectedRevision) return denied("identity", "stale");

    const repository = createD1IdentityResolutionRepository(dependencies.database, {
      workspaceId: context.workspaceId,
      ownerSubject: context.principalSubject,
      subjectKind: locator.subject_kind,
      now: clock,
    });
    const suggestion = await repository.readIdentitySuggestion(
      context.workspaceId,
      context.principalSubject,
      command.suggestionId,
    );
    if (!suggestion || suggestion.kind !== expectedKind || suggestion.associationImpact.length === 0) {
      return denied("identity", "blocked");
    }
    const decision = identityDecision(suggestion, command, expectedKind);
    if (!decision) return denied("identity", "conflict");
    const applied = await applyIdentityResolution(
      repository,
      Object.freeze({ subject: context.principalSubject, admittedOwner: true }),
      {
        workspaceId: context.workspaceId,
        suggestionId: command.suggestionId,
        decision,
        expectedRevision: command.expectedRevision,
        idempotencyKey: command.idempotencyKey,
      },
    );
    return Object.freeze({
      kind: "identity" as const,
      action: expectedKind,
      status: "applied" as const,
      suggestionId: command.suggestionId,
      resultDigest: applied.resultDigest,
      revision: command.expectedRevision,
    });
  } catch {
    return denied("identity", "conflict");
  }
}

function identityDecision(
  suggestion: IdentitySuggestion,
  command: MergeIdentityCommand | SplitIdentityCommand,
  kind: "merge" | "split",
) {
  if (kind === "merge") {
    if (!("primaryId" in command) || suggestion.candidateIds.length < 2 || !suggestion.candidateIds.includes(command.primaryId)) return null;
    const secondaryIds = suggestion.candidateIds.filter((id) => id !== command.primaryId).sort();
    if (secondaryIds.length !== suggestion.candidateIds.length - 1) return null;
    return Object.freeze({ kind: "merge" as const, primaryId: command.primaryId, secondaryIds: Object.freeze(secondaryIds) });
  }
  const partition = suggestion.proposedPartition;
  if (!partition || suggestion.candidateIds.length !== 1 || partition.moveAssociationIds.length === 0) return null;
  return Object.freeze({
    kind: "split" as const,
    sourceId: partition.sourceId,
    moveAssociationIds: Object.freeze([...partition.moveAssociationIds].sort()),
  });
}

async function readValidatedTerminalEvent(
  database: D1Database,
  workspaceId: string,
  reservationId: string,
  executionKind: "settled" | "needs_reconciliation",
): Promise<TerminalEventRow | null> {
  const event = await database.prepare(
    `SELECT durable_revision,state,claimed_at,terminal_reason,settlement_digest,
      documented_units,documented_cost_minor,observation_ids_json,acknowledgement_digest
     FROM enrichment_reservation_events
     WHERE workspace_id=? AND reservation_id=?
     ORDER BY durable_revision DESC LIMIT 1`,
  ).bind(workspaceId, reservationId).first<TerminalEventRow>();
  if (!event || !positiveInteger(Number(event.durable_revision)) || !digest(event.acknowledgement_digest)) return null;
  let material: Record<string, unknown>;
  if (executionKind === "needs_reconciliation") {
    if (
      event.state !== "needs_reconciliation" || !bounded(event.terminal_reason, 64)
      || event.settlement_digest !== null || event.documented_units !== null
      || event.documented_cost_minor !== null || event.observation_ids_json !== "[]"
    ) return null;
    material = {
      schema: "enrichment-reservation-event/v1",
      reservationId,
      durableRevision: Number(event.durable_revision),
      state: "needs_reconciliation",
      reason: event.terminal_reason,
    };
  } else {
    if (
      (event.state !== "settled" && event.state !== "released")
      || !bounded(event.terminal_reason, 64) || !digest(event.settlement_digest)
      || !nonNegativeInteger(event.documented_units) || !nonNegativeInteger(event.documented_cost_minor)
    ) return null;
    const observationIds = parseIds(event.observation_ids_json);
    if (!observationIds) return null;
    material = {
      schema: "enrichment-reservation-event/v1",
      reservationId,
      durableRevision: Number(event.durable_revision),
      state: event.state,
      reason: event.terminal_reason,
      settlementDigest: event.settlement_digest,
      documentedUnits: Number(event.documented_units),
      documentedCostMinor: Number(event.documented_cost_minor),
      observationIds,
    };
  }
  return event.acknowledgement_digest === await canonicalDigest(material) ? event : null;
}

function parseIds(value: string): readonly string[] | null {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 100 || parsed.some((item) => !bounded(item, 256))) return null;
    return Object.freeze([...parsed]);
  } catch { return null; }
}

function mapGrantBlock(reason: string): CommandStatus {
  if (reason === "stale_revision") return "stale";
  if (reason === "owner_not_admitted") return "wrong_scope";
  return "blocked";
}
function denied(kind: "grant" | "operation" | "identity", status: CommandStatus) {
  return Object.freeze({ kind, status });
}
function validContext(value: unknown): value is ContactsCommandContext {
  return exactKeys(value, ["principalSubject", "workspaceId"])
    && bounded((value as ContactsCommandContext).workspaceId, 256)
    && bounded((value as ContactsCommandContext).principalSubject, 256);
}
function validCreate(value: unknown): value is CreateGrantCommand {
  return exactKeys(value, ["expectedProspectRevision", "idempotencyKey", "prospectId"])
    && bounded((value as CreateGrantCommand).prospectId, 256)
    && positiveInteger((value as CreateGrantCommand).expectedProspectRevision)
    && bounded((value as CreateGrantCommand).idempotencyKey, 256);
}
function validRun(value: unknown): value is RunGrantedOperationCommand {
  return exactKeys(value, ["grantId"]) && bounded((value as RunGrantedOperationCommand).grantId, 256);
}
function validMerge(value: unknown): value is MergeIdentityCommand {
  return exactKeys(value, ["expectedRevision", "idempotencyKey", "primaryId", "suggestionId"])
    && bounded((value as MergeIdentityCommand).suggestionId, 256)
    && positiveInteger((value as MergeIdentityCommand).expectedRevision)
    && bounded((value as MergeIdentityCommand).idempotencyKey, 256)
    && bounded((value as MergeIdentityCommand).primaryId, 256);
}
function validSplit(value: unknown): value is SplitIdentityCommand {
  return exactKeys(value, ["expectedRevision", "idempotencyKey", "suggestionId"])
    && bounded((value as SplitIdentityCommand).suggestionId, 256)
    && positiveInteger((value as SplitIdentityCommand).expectedRevision)
    && bounded((value as SplitIdentityCommand).idempotencyKey, 256);
}
function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function positiveTime(value: number) {
  if (!positiveInteger(value)) throw new TypeError("invalid_contacts_command_time");
  return value;
}
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
