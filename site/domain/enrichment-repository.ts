import {
  canonical,
  parseIssuedEnrichmentGrant,
  type EnrichmentGrant,
  type IssuanceRepository,
  type IssuanceSnapshot,
} from "./enrichment-grant-issuance";
import type {
  BudgetAccount,
  DurableReservationAcknowledgement,
  EnrichmentAuthorityRepository,
  EnrichmentReservation,
  InvocationClaim,
  ReconciliationReason,
  RecoverableInvocation,
  ReservationAuthority,
  SettlementWrite,
} from "./enrichment-authority";
import { isDefensivelyValidContactObservation, type ContactObservation } from "./contact-evidence";
import {
  deriveRunnerMonthlyAccountId,
  deriveRunnerOperationKey,
  deriveRunnerPerRunAccountId,
  deriveRunnerUtcMonthPeriod,
  type RunnerAttemptState,
  type RunnerSpendGrant,
  type RunnerSpendRepository,
  type RunnerSpendReservation,
} from "./runner-spend-authority";

type RepositoryScope = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  now?: () => number;
}>;

export type D1EnrichmentRepository = IssuanceRepository & EnrichmentAuthorityRepository;
export type D1RunnerSpendRepository = RunnerSpendRepository & Readonly<{
  markRunnerAssigned(reservationId: string, now: number): Promise<boolean>;
  recordRunnerOutcome(input: Readonly<{
    reservationId: string;
    state: "failed_retryable" | "settled" | "released" | "needs_reconciliation";
    terminalReason: string;
    documentedCostMinor: number | null;
    settlementDigest: string | null;
    now: number;
  }>): Promise<Readonly<{ durableRevision: number; state: string; acknowledgementDigest: string }>>;
}>;

type GrantRow = {
  id: string; workspace_id: string; idempotency_key: string; request_digest: string; status: "issued";
  provider_id: string; provider_version: string; catalog_ref: string; quote_revision: number; quote_unit_cost_minor: number;
  quote_expires_at: number; operation: "business_contact_lookup/v1"; operation_key: string; max_units: number;
  max_cost_minor: number; currency: string; expires_at: number; owner_subject: string; nonce: string;
  configuration_id: string; configuration_digest: string; configuration_revision: number; source_revision: number; tuple_digest: string;
};

type ProspectRow = {
  id: string; revision: number; state: string; configuration_id: string; configuration_digest: string;
};

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * The scope is server-derived at composition time. No method accepts a workspace
 * override, credential, endpoint, provider envelope, or raw contact value.
 */
export function createD1EnrichmentRepository(database: D1Database, scope: RepositoryScope): D1EnrichmentRepository {
  if (!validId(scope.workspaceId) || !validId(scope.ownerSubject)) throw new TypeError("invalid_enrichment_repository_scope");
  const clock = scope.now ?? Date.now;
  const committedReservations = new Map<string, EnrichmentReservation>();

  const repository: D1EnrichmentRepository = {
    async loadIssuanceSnapshot(principalSubject, prospectIds) {
      if (principalSubject !== scope.ownerSubject || !validIds(prospectIds)) return null;
      const workspace = await database.prepare(
        "SELECT id, revision FROM workspaces WHERE id = ? AND owner_subject = ? LIMIT 1",
      ).bind(scope.workspaceId, scope.ownerSubject).first<{ id: string; revision: number }>();
      if (!workspace) return null;
      const placeholders = prospectIds.map(() => "?").join(",");
      const rows = (await database.prepare(
        `SELECT p.id, p.revision, p.state, c.id configuration_id, c.digest configuration_digest, c.revision configuration_revision
         FROM profile_prospects p
         JOIN typed_configurations c ON c.workspace_id = p.workspace_id AND c.owner_type = 'profile'
           AND c.owner_id = p.profile_id AND c.kind = 'profile_effective' AND c.active = 1
         JOIN prospecting_candidates pc ON pc.id = p.candidate_id AND pc.workspace_id = p.workspace_id
           AND pc.profile_id = p.profile_id AND pc.configuration_id = c.id AND pc.status = 'qualified'
         JOIN qualification_assessments qa ON qa.id = p.assessment_id AND qa.workspace_id = p.workspace_id
           AND qa.candidate_id = pc.id AND qa.configuration_id = c.id AND qa.configuration_digest = c.digest
           AND qa.outcome = 'Passed'
         WHERE p.workspace_id = ? AND p.active = 1 AND p.state = 'approved' AND p.id IN (${placeholders})
         ORDER BY p.id`,
      ).bind(scope.workspaceId, ...prospectIds).all<ProspectRow & { configuration_revision: number }>()).results;
      if (rows.length !== prospectIds.length || rows.some((row) => row.state !== "approved")) return null;
      const configuration = rows[0];
      if (!configuration || rows.some((row) => row.configuration_id !== configuration.configuration_id || row.configuration_digest !== configuration.configuration_digest)) return null;
      const quote = await database.prepare(
        `SELECT provider_id, provider_version, catalog_ref, revision, currency, unit_cost_minor, expires_at
         FROM provider_quotes WHERE workspace_id = ? AND operation = 'business_contact_lookup/v1'
         ORDER BY revision DESC, created_at DESC, id DESC LIMIT 1`,
      ).bind(scope.workspaceId).first<{
        provider_id: string; provider_version: string; catalog_ref: string; revision: number;
        currency: string; unit_cost_minor: number; expires_at: number;
      }>();
      if (!quote) return null;
      return freeze({
        admitted: true,
        workspaceId: scope.workspaceId,
        ownerSubject: scope.ownerSubject,
        revision: Number(workspace.revision),
        configuration: {
          id: configuration.configuration_id,
          digest: configuration.configuration_digest,
          revision: Number(configuration.configuration_revision),
          current: true,
        },
        prospects: rows.map((row) => ({
          id: row.id,
          state: row.state,
          configurationId: row.configuration_id,
          configurationDigest: row.configuration_digest,
          revision: Number(row.revision),
        })),
        quote: {
          providerId: quote.provider_id,
          providerVersion: quote.provider_version,
          catalogRef: quote.catalog_ref,
          revision: Number(quote.revision),
          currency: quote.currency,
          unitCostMinor: Number(quote.unit_cost_minor),
          expiresAt: Number(quote.expires_at),
        },
      }) as IssuanceSnapshot;
    },

    async findGrantByIdempotency(workspaceId, idempotencyKey) {
      if (workspaceId !== scope.workspaceId || !validId(idempotencyKey)) return null;
      return readGrantBy(database, scope.workspaceId, "idempotency_key", idempotencyKey);
    },

    async commitGrant(record) {
      const grant = await parseIssuedEnrichmentGrant(record);
      if (!grant || grant.workspaceId !== scope.workspaceId || grant.tuple.ownerSubject !== scope.ownerSubject) {
        throw new TypeError("invalid_enrichment_grant_record");
      }
      const existing = await readGrantBy(database, scope.workspaceId, "idempotency_key", grant.idempotencyKey);
      if (existing) {
        if (!sameCanonical(existing, grant)) throw new Error("enrichment_grant_idempotency_conflict");
        return { kind: "existing", record: existing };
      }
      const quote = await database.prepare(
        `SELECT id FROM provider_quotes WHERE workspace_id = ? AND provider_id = ? AND provider_version = ?
          AND catalog_ref = ? AND revision = ? AND operation = ? AND currency = ? AND unit_cost_minor = ? AND expires_at = ? LIMIT 1`,
      ).bind(
        scope.workspaceId, grant.tuple.providerId, grant.tuple.providerVersion, grant.tuple.catalogRef,
        grant.tuple.quoteRevision, grant.tuple.operation, grant.tuple.currency, grant.tuple.quoteUnitCostMinor,
        grant.tuple.quoteExpiresAt,
      ).first<{ id: string }>();
      if (!quote) throw new Error("enrichment_quote_unavailable");
      const now = positiveTime(clock());
      const eventDigest = await digest({ schema: "enrichment-issuance-event/v1", grantId: grant.id, requestDigest: grant.requestDigest });
      const statements = [
        database.prepare(
          `INSERT INTO enrichment_grants (
            id, workspace_id, quote_id, configuration_id, configuration_digest, configuration_revision, source_revision,
            provider_id, provider_version, catalog_ref, quote_revision, quote_unit_cost_minor, quote_expires_at,
            operation, operation_key, max_units, max_cost_minor, currency, expires_at, owner_subject, nonce,
            idempotency_key, request_digest, tuple_digest, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`,
        ).bind(
          grant.id, scope.workspaceId, quote.id, grant.tuple.configurationId, grant.tuple.configurationDigest,
          grant.tuple.configurationRevision, grant.tuple.sourceRevision, grant.tuple.providerId, grant.tuple.providerVersion,
          grant.tuple.catalogRef, grant.tuple.quoteRevision, grant.tuple.quoteUnitCostMinor, grant.tuple.quoteExpiresAt,
          grant.tuple.operation, grant.tuple.operationKey, grant.tuple.maxUnits, grant.tuple.maxCostMinor, grant.tuple.currency,
          grant.tuple.expiresAt, scope.ownerSubject, grant.tuple.nonce, grant.idempotencyKey, grant.requestDigest,
          grant.tuple.digest, now,
        ),
        ...grant.tuple.prospectRevisions.map((prospect, ordinal) => database.prepare(
          `INSERT INTO enrichment_grant_prospects
            (id, workspace_id, grant_id, prospect_id, ordinal, prospect_revision, configuration_id, configuration_digest, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `egp_${grant.tuple.digest.slice(0, 18)}_${ordinal}`, scope.workspaceId, grant.id, prospect.id, ordinal,
          prospect.revision, grant.tuple.configurationId, grant.tuple.configurationDigest, now,
        )),
        database.prepare(
          `INSERT INTO enrichment_grant_issuance_events
            (id, workspace_id, grant_id, actor_subject, action, operation_key, request_digest, event_digest, bounded_reason, created_at)
           VALUES (?, ?, ?, ?, 'enrichment.grant.issued', ?, ?, ?, 'issued', ?)`,
        ).bind(`ege_${eventDigest.slice(0, 24)}`, scope.workspaceId, grant.id, scope.ownerSubject, grant.tuple.operationKey, grant.requestDigest, eventDigest, now),
      ];
      try {
        await database.batch(statements);
      } catch {
        const winner = await readGrantBy(database, scope.workspaceId, "idempotency_key", grant.idempotencyKey);
        if (winner && sameCanonical(winner, grant)) return { kind: "existing", record: winner };
        if (winner) throw new Error("enrichment_grant_idempotency_conflict");
        throw new Error("enrichment_grant_commit_failed");
      }
      const committed = await readGrantBy(database, scope.workspaceId, "id", grant.id);
      if (!committed || !sameCanonical(committed, grant)) throw new Error("enrichment_grant_acknowledgement_invalid");
      return { kind: "created", record: committed };
    },

    async loadReservationAuthority(grantId) {
      const grant = await readGrantBy(database, scope.workspaceId, "id", grantId);
      if (!grant) return null;
      const config = await database.prepare(
        "SELECT id, digest, revision, active FROM typed_configurations WHERE id = ? AND workspace_id = ? LIMIT 1",
      ).bind(grant.tuple.configurationId, scope.workspaceId).first<{ id: string; digest: string; revision: number; active: number }>();
      const quote = await database.prepare(
        `SELECT provider_id, provider_version, catalog_ref, revision, currency, unit_cost_minor, expires_at
         FROM provider_quotes WHERE workspace_id = ? AND provider_id = ? AND provider_version = ? AND catalog_ref = ? AND revision = ? LIMIT 1`,
      ).bind(scope.workspaceId, grant.tuple.providerId, grant.tuple.providerVersion, grant.tuple.catalogRef, grant.tuple.quoteRevision)
        .first<{ provider_id: string; provider_version: string; catalog_ref: string; revision: number; currency: string; unit_cost_minor: number; expires_at: number }>();
      if (!config || !quote) return null;
      const prospects = (await database.prepare(
        `SELECT p.id, p.state, p.revision, gp.configuration_id, gp.configuration_digest
         FROM enrichment_grant_prospects gp JOIN profile_prospects p ON p.id = gp.prospect_id AND p.workspace_id = gp.workspace_id
         JOIN prospecting_candidates pc ON pc.id = p.candidate_id AND pc.workspace_id = p.workspace_id
           AND pc.profile_id = p.profile_id AND pc.configuration_id = gp.configuration_id AND pc.status = 'qualified'
         JOIN qualification_assessments qa ON qa.id = p.assessment_id AND qa.workspace_id = p.workspace_id
           AND qa.candidate_id = pc.id AND qa.configuration_id = gp.configuration_id
           AND qa.configuration_digest = gp.configuration_digest AND qa.outcome = 'Passed'
         WHERE gp.workspace_id = ? AND gp.grant_id = ? AND p.active = 1 AND p.state = 'approved'
           AND p.revision = gp.prospect_revision
         ORDER BY gp.ordinal`,
      ).bind(scope.workspaceId, grant.id).all<ProspectRow>()).results;
      const accountIds = [
        derivedEnrichmentAccountId(scope.workspaceId, "grant", grant.id),
        derivedEnrichmentAccountId(scope.workspaceId, "profile", grant.tuple.configurationId),
        derivedEnrichmentAccountId(scope.workspaceId, "workspace", scope.workspaceId),
        derivedEnrichmentAccountId(scope.workspaceId, "provider", grant.tuple.providerId),
      ];
      const accounts = (await database.prepare(
        `SELECT id account_id, authority_type, scope, workspace_id, entity_id, currency, actual_units, reserved_units,
          max_units, actual_cost_minor, reserved_cost_minor, max_cost_minor
         FROM enrichment_budget_accounts WHERE workspace_id = ? AND currency = ? AND id IN (?, ?, ?, ?) ORDER BY scope`,
      ).bind(scope.workspaceId, grant.tuple.currency, ...accountIds).all<Record<string, unknown>>()).results.map(toBudgetAccount);
      const assignments = (await database.prepare(
        `SELECT id assignment_id, prospect_id, contact_id, role, configuration_id, configuration_digest
         FROM contact_evidence_assignments WHERE workspace_id = ? AND grant_id = ? ORDER BY id`,
      ).bind(scope.workspaceId, grant.id).all<Record<string, unknown>>()).results.map((row) => ({
        assignmentId: String(row.assignment_id), prospectId: String(row.prospect_id), role: row.role as "champion" | "economic_buyer" | "general",
        workspaceId: scope.workspaceId, contactId: String(row.contact_id), profileConfigurationId: String(row.configuration_id),
        profileConfigurationDigest: String(row.configuration_digest),
      }));
      return freeze({
        admitted: true, principalSubject: scope.ownerSubject, workspaceId: scope.workspaceId, sourceRevision: grant.tuple.sourceRevision,
        grant, configuration: { id: config.id, digest: config.digest, revision: Number(config.revision), current: Number(config.active) === 1 },
        prospects: prospects.map((row) => ({ id: row.id, state: row.state, configurationId: row.configuration_id, configurationDigest: row.configuration_digest, revision: Number(row.revision) })),
        quote: { providerId: quote.provider_id, providerVersion: quote.provider_version, catalogRef: quote.catalog_ref, revision: Number(quote.revision), currency: quote.currency, unitCostMinor: Number(quote.unit_cost_minor), expiresAt: Number(quote.expires_at) },
        accounts, evidenceAssignments: assignments,
      }) as ReservationAuthority;
    },

    async commitReservation(record, accounts) {
      const existing = await readReservation(database, scope.workspaceId, record.id);
      if (existing) {
        if (!sameCanonical(existing, record)) return { kind: "blocked" };
        committedReservations.set(existing.id, existing);
        return { kind: "existing", record: existing };
      }
      if (!validReservation(record, scope.workspaceId) || !validAccountSet(accounts, scope.workspaceId)) return { kind: "blocked" };
      const assignmentJson = canonical(record.assignment);
      const assignmentDigest = await digest(JSON.parse(assignmentJson));
      const now = positiveTime(clock());
      const acknowledgementDigest = await digest({ schema: "enrichment-reservation-event/v1", reservationId: record.id, durableRevision: 1, state: "reserved" });
      const accountEntries = await Promise.all(accounts.map(async (account, index) => {
        const current = await database.prepare(
          "SELECT revision FROM enrichment_budget_accounts WHERE id = ? AND workspace_id = ? LIMIT 1",
        ).bind(account.accountId, scope.workspaceId).first<{ revision: number }>();
        if (!current || !Number.isSafeInteger(Number(current.revision)) || Number(current.revision) < 1) return null;
        const material = {
          reservationId: record.id, accountId: account.accountId, units: record.assignment.maxUnits,
          costMinor: record.assignment.maxCostMinor, revision: Number(current.revision),
        };
        return {
          id: `ebe_${record.id}_${index}`,
          accountId: account.accountId,
          revision: Number(current.revision),
          digest: await digest({ schema: "enrichment-budget-entry/v1", ...material }),
        };
      }));
      if (accountEntries.some((entry) => entry === null)) return { kind: "blocked" };
      const statements = [
        database.prepare(
          `INSERT INTO enrichment_reservations
            (id, workspace_id, grant_id, operation_key, assignment_json, assignment_digest, reserved_units, reserved_cost_minor, currency, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(record.id, scope.workspaceId, record.grantId, record.operationKey, assignmentJson, assignmentDigest, record.assignment.maxUnits, record.assignment.maxCostMinor, record.assignment.currency, record.assignment.expiresAt, now),
        ...accountEntries.map((entry) => {
          if (!entry) throw new Error("unreachable_enrichment_account_entry");
          return database.prepare(
            `INSERT INTO enrichment_reservation_budget_entries
              (id, workspace_id, reservation_id, account_id, reserved_units, reserved_cost_minor, account_expected_revision, entry_digest, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(entry.id, scope.workspaceId, record.id, entry.accountId, record.assignment.maxUnits, record.assignment.maxCostMinor, entry.revision, entry.digest, now);
        }),
        database.prepare(
          `INSERT INTO enrichment_reservation_events
            (id, workspace_id, reservation_id, durable_revision, state, terminal_reason, settlement_digest, observation_ids_json, acknowledgement_digest, claimed_at, created_at)
           VALUES (?, ?, ?, 1, 'reserved', NULL, NULL, '[]', ?, NULL, ?)`,
        ).bind(`ere_${acknowledgementDigest.slice(0, 24)}`, scope.workspaceId, record.id, acknowledgementDigest, now),
      ];
      try {
        const results = await database.batch(statements);
        if (!results.every((result) => Number(result.meta?.changes) >= 1)) throw new Error("reservation_write_not_exact");
      } catch {
        const winner = await readReservation(database, scope.workspaceId, record.id);
        if (winner && sameCanonical(winner, record)) {
          committedReservations.set(winner.id, winner);
          return { kind: "existing", record: winner };
        }
        return { kind: "blocked" };
      }
      const committed = await readReservation(database, scope.workspaceId, record.id);
      const initialEvent = await reservationEventAtRevision(database, scope.workspaceId, record.id, 1);
      if (
        !committed || !sameCanonical(committed, record) || !initialEvent
        || !await validateEnrichmentEventAcknowledgement(record.id, initialEvent)
      ) return { kind: "blocked" };
      committedReservations.set(committed.id, committed);
      return { kind: "created", record: committed };
    },

    async claimCommittedInvocation(reservationId, now) {
      if (!validId(reservationId) || !Number.isSafeInteger(now) || now <= 0) return { kind: "blocked", reason: "unavailable" };
      const record = await readReservation(database, scope.workspaceId, reservationId);
      if (!record) return { kind: "blocked", reason: "unavailable" };
      const admittedRecord = committedReservations.get(reservationId);
      if (!admittedRecord || !sameCanonical(admittedRecord, record)) return { kind: "blocked", reason: "unavailable" };
      if (record.assignment.expiresAt <= now) {
        return await releaseExpiredReservation(database, scope.workspaceId, reservationId, now)
          ? { kind: "blocked", reason: "expired" }
          : { kind: "blocked", reason: "unavailable" };
      }
      const latest = await latestReservationEvent(database, scope.workspaceId, reservationId);
      if (!latest || latest.state !== "reserved") return { kind: "blocked", reason: "unavailable" };
      const revision = latest.durable_revision + 1;
      const acknowledgementDigest = await digest({ schema: "enrichment-reservation-event/v1", reservationId, durableRevision: revision, state: "invoking", claimedAt: now });
      try {
        const result = await database.prepare(
          `INSERT INTO enrichment_reservation_events
            (id, workspace_id, reservation_id, durable_revision, state, observation_ids_json, acknowledgement_digest, claimed_at, created_at)
           VALUES (?, ?, ?, ?, 'invoking', '[]', ?, ?, ?)`,
        ).bind(`ere_${acknowledgementDigest.slice(0, 24)}`, scope.workspaceId, reservationId, revision, acknowledgementDigest, now, now).run();
        if (Number(result.meta?.changes) !== 1) return { kind: "blocked", reason: "unavailable" };
      } catch {
        return { kind: "blocked", reason: "unavailable" };
      }
      const committedClaim = await latestReservationEvent(database, scope.workspaceId, reservationId);
      if (
        !committedClaim || committedClaim.durable_revision !== revision || committedClaim.state !== "invoking"
        || !await validateEnrichmentEventAcknowledgement(reservationId, committedClaim)
      ) return { kind: "blocked", reason: "unavailable" };
      return freeze({ kind: "claimed", assignment: admittedRecord.assignment, claimedAt: now }) as InvocationClaim;
    },

    async settleReservation(reservationId, settlement) {
      return settleCommittedReservation(database, scope.workspaceId, reservationId, settlement, positiveTime(clock()));
    },

    async markNeedsReconciliation(reservationId, reason) {
      return appendReconciliation(database, scope.workspaceId, reservationId, reason, positiveTime(clock()));
    },

    async listInvocationsNeedingRecovery(input) {
      if (!Number.isSafeInteger(input.claimedBefore) || input.claimedBefore <= 0 || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) return [];
      const rows = (await database.prepare(
        `SELECT r.id reservation_id, r.operation_key, r.expires_at, e.claimed_at
         FROM enrichment_reservations r JOIN enrichment_reservation_events e ON e.reservation_id = r.id
         WHERE r.workspace_id = ? AND e.state = 'invoking' AND e.claimed_at < ?
           AND e.durable_revision = (SELECT max(e2.durable_revision) FROM enrichment_reservation_events e2 WHERE e2.reservation_id = r.id)
         ORDER BY e.claimed_at, r.id LIMIT ?`,
      ).bind(scope.workspaceId, input.claimedBefore, input.limit).all<{ reservation_id: string; operation_key: string; expires_at: number; claimed_at: number }>()).results;
      return rows.map((row) => freeze({ reservationId: row.reservation_id, operationKey: row.operation_key, claimedAt: Number(row.claimed_at), expiresAt: Number(row.expires_at), status: "invoking" })) as readonly RecoverableInvocation[];
    },
  };
  return Object.freeze(repository);
}

export function createD1RunnerSpendRepository(database: D1Database, scope: RepositoryScope): D1RunnerSpendRepository {
  if (!validId(scope.workspaceId) || !validId(scope.ownerSubject)) throw new TypeError("invalid_runner_repository_scope");
  const clock = scope.now ?? Date.now;
  const repository: D1RunnerSpendRepository = {
    async loadRunnerAuthority(grantId) {
      if (!validId(grantId)) return null;
      const row = await database.prepare(
        `SELECT id,owner_subject,provider_id,model,catalog_ref,run_type,scope_id,per_run_cost_minor,
          monthly_cost_minor,currency,expires_at,max_retries
         FROM runner_spend_grants WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1`,
      ).bind(grantId, scope.workspaceId, scope.ownerSubject).first<Record<string, unknown>>();
      if (!row) return null;
      const grant = runnerGrantFromRow(row);
      const history = (await database.prepare(
        `SELECT r.attempt_number,r.operation_key,e.state
         FROM runner_spend_reservations r
         JOIN runner_spend_reservation_events e ON e.reservation_id=r.id
          AND e.durable_revision=(SELECT max(e2.durable_revision) FROM runner_spend_reservation_events e2 WHERE e2.reservation_id=r.id)
         WHERE r.workspace_id=? AND r.grant_id=? ORDER BY r.attempt_number`,
      ).bind(scope.workspaceId, grantId).all<{ attempt_number: number; operation_key: string; state: string }>()).results;
      if (history.some((item, index) => Number(item.attempt_number) !== index || item.state !== "failed_retryable")) return null;
      const attempt: RunnerAttemptState = freeze({
        attemptNumber: history.length,
        previousOutcome: history.length === 0 ? "none" : "failed_retryable",
        previousOperationKeys: history.map((item) => item.operation_key),
      });
      if (attempt.attemptNumber > grant.maxRetries) return null;
      const operationKey = await deriveRunnerOperationKey({ workspaceId: scope.workspaceId, principalSubject: scope.ownerSubject, grant, attempt });
      const period = deriveRunnerUtcMonthPeriod(positiveTime(clock()));
      if (!period) return null;
      const perRunId = deriveRunnerPerRunAccountId({
        workspaceId: scope.workspaceId, principalSubject: scope.ownerSubject, grantId, providerId: grant.providerId, scopeId: grant.scopeId,
        attemptNumber: attempt.attemptNumber, operationKey,
      });
      const monthlyId = deriveRunnerMonthlyAccountId({
        workspaceId: scope.workspaceId, principalSubject: scope.ownerSubject, providerId: grant.providerId, scopeId: grant.scopeId, period,
      });
      const [perRunRow, monthlyRow] = await Promise.all([
        database.prepare("SELECT * FROM runner_budget_accounts WHERE id=? AND workspace_id=? LIMIT 1").bind(perRunId, scope.workspaceId).first<Record<string, unknown>>(),
        database.prepare("SELECT * FROM runner_budget_accounts WHERE id=? AND workspace_id=? LIMIT 1").bind(monthlyId, scope.workspaceId).first<Record<string, unknown>>(),
      ]);
      if (!perRunRow || !monthlyRow) return null;
      const common = (account: Record<string, unknown>) => ({
        authorityType: "runner_spend" as const, accountId: String(account.id), principalSubject: String(account.owner_subject),
        providerId: String(account.provider_id), scopeId: String(account.scope_id), currency: String(account.currency),
        actualCostMinor: Number(account.actual_cost_minor), reservedCostMinor: Number(account.reserved_cost_minor), maxCostMinor: Number(account.max_cost_minor),
      });
      return freeze({
        admitted: true, workspaceId: scope.workspaceId, principalSubject: scope.ownerSubject, grant, attempt,
        perRun: {
          ...common(perRunRow), scope: "runner_per_run", grantId, attemptNumber: Number(perRunRow.attempt_number), operationKey: String(perRunRow.operation_key),
        },
        monthly: { ...common(monthlyRow), scope: "runner_monthly", grantId, period: String(monthlyRow.period) },
      });
    },

    async commitRunnerReservation(record, accounts, attempt) {
      const existing = await readRunnerReservation(database, scope.workspaceId, record.id);
      if (existing) {
        const existingEvent = await latestRunnerEvent(database, scope.workspaceId, record.id);
        return sameCanonical(existing, record) && existingEvent
          && await validateRunnerEventAcknowledgement(record.id, existingEvent)
          ? { kind: "existing", record: existing }
          : { kind: "blocked" };
      }
      const grantRow = await database.prepare(
        `SELECT id,owner_subject,provider_id,model,catalog_ref,run_type,scope_id,per_run_cost_minor,
          monthly_cost_minor,currency,expires_at,max_retries
         FROM runner_spend_grants WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1`,
      ).bind(record.grantId, scope.workspaceId, scope.ownerSubject).first<Record<string, unknown>>();
      if (!grantRow || accounts.length !== 2) return { kind: "blocked" };
      const grant = runnerGrantFromRow(grantRow);
      const expectedOperationKey = await deriveRunnerOperationKey({ workspaceId: scope.workspaceId, principalSubject: scope.ownerSubject, grant, attempt });
      const expectedAttemptDigest = await digestStable(attempt);
      const expectedId = `rr_${await digestLengthPrefixed(record.workspaceId, record.grantId, record.operationKey, String(record.attemptNumber))}`;
      const now = positiveTime(clock());
      const period = deriveRunnerUtcMonthPeriod(now);
      if (
        !period || record.workspaceId !== scope.workspaceId
        || record.operationKey !== expectedOperationKey || record.attemptDigest !== expectedAttemptDigest || record.id !== expectedId
        || record.providerId !== grant.providerId || record.model !== grant.model || record.catalogRef !== grant.catalogRef
        || record.scopeId !== grant.scopeId || record.runType !== grant.runType || record.currency !== grant.currency
        || record.reservedCostMinor !== grant.perRunCostMinor || record.maxRetries !== grant.maxRetries
        || record.attemptNumber !== attempt.attemptNumber || record.status !== "reserved"
        || canonical(attempt.previousOperationKeys) !== canonical(await readExactRunnerHistory(database, scope.workspaceId, record.grantId))
      ) return { kind: "blocked" };
      const perRun = accounts.find((account) => account.scope === "runner_per_run");
      const monthly = accounts.find((account) => account.scope === "runner_monthly");
      if (!perRun || !monthly) return { kind: "blocked" };
      const [perRunCurrent, monthlyCurrent] = await Promise.all([
        database.prepare("SELECT revision FROM runner_budget_accounts WHERE id=? AND workspace_id=? LIMIT 1")
          .bind(perRun.accountId, scope.workspaceId).first<{ revision: number }>(),
        database.prepare("SELECT revision FROM runner_budget_accounts WHERE id=? AND workspace_id=? LIMIT 1")
          .bind(monthly.accountId, scope.workspaceId).first<{ revision: number }>(),
      ]);
      if (!perRunCurrent || !monthlyCurrent) return { kind: "blocked" };
      const perRunExpectedRevision = Number(perRunCurrent.revision);
      const monthlyExpectedRevision = Number(monthlyCurrent.revision);
      if (!positiveSafe(perRunExpectedRevision) || !positiveSafe(monthlyExpectedRevision)) return { kind: "blocked" };
      const acknowledgementDigest = await digest({
        schema: "runner-reservation-event/v1", reservationId: record.id, durableRevision: 1, state: "reserved",
      });
      try {
        const results = await database.batch([
          database.prepare(
            `INSERT INTO runner_spend_reservations (
              id,workspace_id,grant_id,per_run_account_id,monthly_account_id,operation_key,attempt_number,period,
              previous_outcome,previous_operation_keys_json,per_run_account_expected_revision,monthly_account_expected_revision,
              provider_id,model,catalog_ref,scope_id,run_type,currency,reserved_cost_minor,max_retries,attempt_digest,created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).bind(
            record.id, record.workspaceId, record.grantId, perRun.accountId, monthly.accountId, record.operationKey,
            record.attemptNumber, period, attempt.previousOutcome, canonical(attempt.previousOperationKeys),
            perRunExpectedRevision, monthlyExpectedRevision,
            record.providerId, record.model, record.catalogRef, record.scopeId, record.runType, record.currency,
            record.reservedCostMinor, record.maxRetries, record.attemptDigest, now,
          ),
          database.prepare(
            `INSERT INTO runner_spend_reservation_events
              (id,workspace_id,reservation_id,durable_revision,state,terminal_reason,settlement_digest,documented_cost_minor,acknowledgement_digest,created_at)
             VALUES (?, ?, ?, 1, 'reserved', NULL, NULL, NULL, ?, ?)`,
          ).bind(`rre_${acknowledgementDigest.slice(0, 24)}`, scope.workspaceId, record.id, acknowledgementDigest, now),
        ]);
        if (!results.every((result) => Number(result.meta?.changes) >= 1)) return { kind: "blocked" };
      } catch {
        const winner = await readRunnerReservation(database, scope.workspaceId, record.id);
        const winnerEvent = winner ? await latestRunnerEvent(database, scope.workspaceId, record.id) : null;
        return winner && sameCanonical(winner, record) && winnerEvent
          && await validateRunnerEventAcknowledgement(record.id, winnerEvent)
          ? { kind: "existing", record: winner }
          : { kind: "blocked" };
      }
      const committed = await readRunnerReservation(database, scope.workspaceId, record.id);
      const committedEvent = await latestRunnerEvent(database, scope.workspaceId, record.id);
      return committed && sameCanonical(committed, record)
        && committedEvent && await validateRunnerEventAcknowledgement(record.id, committedEvent)
        ? { kind: "created", record: committed }
        : { kind: "blocked" };
    },

    async markRunnerAssigned(reservationId, now) {
      const latest = await latestRunnerEvent(database, scope.workspaceId, reservationId);
      const timing = await database.prepare(
        `SELECT r.created_at,g.expires_at FROM runner_spend_reservations r
         JOIN runner_spend_grants g ON g.id=r.grant_id AND g.workspace_id=r.workspace_id
         WHERE r.id=? AND r.workspace_id=? LIMIT 1`,
      ).bind(reservationId, scope.workspaceId).first<{ created_at: number; expires_at: number }>();
      if (
        !latest || latest.state !== "reserved" || !positiveSafe(now) || !timing
        || now < Number(timing.created_at) || now < Number(latest.created_at) || now >= Number(timing.expires_at)
      ) return false;
      const revision = Number(latest.durable_revision) + 1;
      const acknowledgementDigest = await digest({ schema: "runner-reservation-event/v1", reservationId, durableRevision: revision, state: "assigned" });
      try {
        const result = await database.prepare(
          `INSERT INTO runner_spend_reservation_events
            (id,workspace_id,reservation_id,durable_revision,state,terminal_reason,settlement_digest,documented_cost_minor,acknowledgement_digest,created_at)
           VALUES (?, ?, ?, ?, 'assigned', NULL, NULL, NULL, ?, ?)`,
        ).bind(`rre_${acknowledgementDigest.slice(0, 24)}`, scope.workspaceId, reservationId, revision, acknowledgementDigest, now).run();
        if (Number(result.meta?.changes) < 1) return false;
      } catch {
        return false;
      }
      const committed = await latestRunnerEvent(database, scope.workspaceId, reservationId);
      return !!committed && committed.durable_revision === revision
        && committed.state === "assigned"
        && await validateRunnerEventAcknowledgement(reservationId, committed);
    },

    async recordRunnerOutcome(input) {
      if (!validRunnerOutcomeInput(input)) throw new Error("invalid_runner_outcome");
      const latest = await latestRunnerEvent(database, scope.workspaceId, input.reservationId);
      if (!latest) throw new Error("runner_outcome_unavailable");
      if (latest.state === input.state) {
        if (latest.terminal_reason !== input.terminalReason || latest.settlement_digest !== input.settlementDigest || latest.documented_cost_minor !== input.documentedCostMinor) throw new Error("runner_outcome_conflict");
        if (!await validateRunnerEventAcknowledgement(input.reservationId, latest)) throw new Error("runner_outcome_acknowledgement_invalid");
        return freeze({ durableRevision: Number(latest.durable_revision), state: latest.state, acknowledgementDigest: latest.acknowledgement_digest });
      }
      const timing = await database.prepare(
        `SELECT r.created_at,g.expires_at FROM runner_spend_reservations r
         JOIN runner_spend_grants g ON g.id=r.grant_id AND g.workspace_id=r.workspace_id
         WHERE r.id=? AND r.workspace_id=? LIMIT 1`,
      ).bind(input.reservationId, scope.workspaceId).first<{ created_at: number; expires_at: number }>();
      if (
        (latest.state !== "assigned" && latest.state !== "needs_reconciliation")
        || !timing || input.now < Number(timing.created_at) || input.now < Number(latest.created_at)
        || (input.state === "released" && input.terminalReason === "expired" && input.now < Number(timing.expires_at))
      ) throw new Error("runner_outcome_unavailable");
      const revision = Number(latest.durable_revision) + 1;
      const acknowledgementDigest = await digest({
        schema: "runner-reservation-event/v1", reservationId: input.reservationId, durableRevision: revision,
        state: input.state, terminalReason: input.terminalReason, documentedCostMinor: input.documentedCostMinor,
        settlementDigest: input.settlementDigest,
      });
      try {
        const result = await database.prepare(
          `INSERT INTO runner_spend_reservation_events
            (id,workspace_id,reservation_id,durable_revision,state,terminal_reason,settlement_digest,documented_cost_minor,acknowledgement_digest,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          `rre_${acknowledgementDigest.slice(0, 24)}`, scope.workspaceId, input.reservationId, revision, input.state,
          input.terminalReason, input.settlementDigest, input.documentedCostMinor, acknowledgementDigest, input.now,
        ).run();
        if (Number(result.meta?.changes) < 1) throw new Error();
      } catch {
        const winner = await latestRunnerEvent(database, scope.workspaceId, input.reservationId);
        if (!winner || winner.state !== input.state || winner.terminal_reason !== input.terminalReason || winner.settlement_digest !== input.settlementDigest || winner.documented_cost_minor !== input.documentedCostMinor) throw new Error("runner_outcome_commit_failed");
        if (!await validateRunnerEventAcknowledgement(input.reservationId, winner)) throw new Error("runner_outcome_acknowledgement_invalid");
        return freeze({ durableRevision: Number(winner.durable_revision), state: winner.state, acknowledgementDigest: winner.acknowledgement_digest });
      }
      const committed = await latestRunnerEvent(database, scope.workspaceId, input.reservationId);
      if (
        !committed || committed.state !== input.state || committed.acknowledgement_digest !== acknowledgementDigest
        || !await validateRunnerEventAcknowledgement(input.reservationId, committed)
      ) throw new Error("runner_outcome_acknowledgement_invalid");
      return freeze({ durableRevision: revision, state: input.state, acknowledgementDigest });
    },
  };
  return Object.freeze(repository);
}

async function readGrantBy(database: D1Database, workspaceId: string, column: "id" | "idempotency_key", value: string): Promise<EnrichmentGrant | null> {
  const row = await database.prepare(`SELECT * FROM enrichment_grants WHERE workspace_id = ? AND ${column} = ? LIMIT 1`).bind(workspaceId, value).first<GrantRow>();
  if (!row) return null;
  const prospects = (await database.prepare(
    "SELECT prospect_id id, prospect_revision revision FROM enrichment_grant_prospects WHERE workspace_id = ? AND grant_id = ? ORDER BY ordinal",
  ).bind(workspaceId, row.id).all<{ id: string; revision: number }>()).results;
  const candidate = {
    id: row.id, workspaceId: row.workspace_id, idempotencyKey: row.idempotency_key, requestDigest: row.request_digest,
    tuple: {
      workspaceId: row.workspace_id, providerId: row.provider_id, providerVersion: row.provider_version, catalogRef: row.catalog_ref,
      quoteRevision: Number(row.quote_revision), quoteUnitCostMinor: Number(row.quote_unit_cost_minor), quoteExpiresAt: Number(row.quote_expires_at),
      prospectIds: prospects.map((item) => item.id), operation: row.operation, operationKey: row.operation_key,
      maxUnits: Number(row.max_units), maxCostMinor: Number(row.max_cost_minor), currency: row.currency, expiresAt: Number(row.expires_at),
      ownerSubject: row.owner_subject, nonce: row.nonce, configurationId: row.configuration_id, configurationDigest: row.configuration_digest,
      configurationRevision: Number(row.configuration_revision), sourceRevision: Number(row.source_revision),
      prospectRevisions: prospects.map((item) => ({ id: item.id, revision: Number(item.revision) })), digest: row.tuple_digest,
    },
    status: row.status,
  };
  return parseIssuedEnrichmentGrant(candidate);
}

function runnerGrantFromRow(row: Record<string, unknown>): RunnerSpendGrant {
  return freeze({
    authorityType: "runner_spend", id: String(row.id), providerId: String(row.provider_id), model: String(row.model),
    catalogRef: String(row.catalog_ref), runType: String(row.run_type), scopeId: String(row.scope_id),
    perRunCostMinor: Number(row.per_run_cost_minor), monthlyCostMinor: Number(row.monthly_cost_minor),
    currency: String(row.currency), expiresAt: Number(row.expires_at), maxRetries: Number(row.max_retries),
  });
}

async function readExactRunnerHistory(database: D1Database, workspaceId: string, grantId: string): Promise<string[]> {
  const rows = (await database.prepare(
    `SELECT r.attempt_number,r.operation_key,e.state FROM runner_spend_reservations r
     JOIN runner_spend_reservation_events e ON e.reservation_id=r.id
      AND e.durable_revision=(SELECT max(e2.durable_revision) FROM runner_spend_reservation_events e2 WHERE e2.reservation_id=r.id)
     WHERE r.workspace_id=? AND r.grant_id=? ORDER BY r.attempt_number`,
  ).bind(workspaceId, grantId).all<{ attempt_number: number; operation_key: string; state: string }>()).results;
  if (rows.some((row, index) => Number(row.attempt_number) !== index || row.state !== "failed_retryable")) return [];
  return rows.map((row) => row.operation_key);
}

async function readRunnerReservation(database: D1Database, workspaceId: string, id: string): Promise<RunnerSpendReservation | null> {
  const row = await database.prepare(
    `SELECT id,workspace_id,grant_id,operation_key,provider_id,model,catalog_ref,scope_id,run_type,currency,
      reserved_cost_minor,attempt_number,max_retries,attempt_digest
     FROM runner_spend_reservations WHERE id=? AND workspace_id=? LIMIT 1`,
  ).bind(id, workspaceId).first<Record<string, unknown>>();
  if (!row) return null;
  return freeze({
    id: String(row.id), workspaceId: String(row.workspace_id), grantId: String(row.grant_id), operationKey: String(row.operation_key),
    providerId: String(row.provider_id), model: String(row.model), catalogRef: String(row.catalog_ref),
    scopeId: String(row.scope_id), runType: String(row.run_type), currency: String(row.currency),
    reservedCostMinor: Number(row.reserved_cost_minor), attemptNumber: Number(row.attempt_number),
    maxRetries: Number(row.max_retries), attemptDigest: String(row.attempt_digest), status: "reserved",
  });
}

async function latestRunnerEvent(database: D1Database, workspaceId: string, reservationId: string) {
  return database.prepare(
    `SELECT durable_revision,state,terminal_reason,settlement_digest,documented_cost_minor,acknowledgement_digest,created_at
     FROM runner_spend_reservation_events WHERE workspace_id=? AND reservation_id=? ORDER BY durable_revision DESC LIMIT 1`,
  ).bind(workspaceId, reservationId).first<{
    durable_revision: number; state: string; terminal_reason: string | null; settlement_digest: string | null;
    documented_cost_minor: number | null; acknowledgement_digest: string; created_at: number;
  }>();
}

async function digestStable(value: unknown): Promise<string> {
  return digestString(stableCanonical(value));
}

async function digestLengthPrefixed(...values: string[]): Promise<string> {
  return digestString(values.map((value) => `${value.length}:${value}`).join(":"));
}

function stableCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCanonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableCanonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digestString(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function positiveSafe(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validRunnerOutcomeInput(value: unknown): value is Parameters<D1RunnerSpendRepository["recordRunnerOutcome"]>[0] {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).sort().join(",") !== "documentedCostMinor,now,reservationId,settlementDigest,state,terminalReason"
    || !validId(input.reservationId) || !positiveSafe(input.now)
  ) return false;
  if (input.state === "needs_reconciliation") {
    return ["timeout", "ambiguous", "provider_error"].includes(String(input.terminalReason))
      && input.documentedCostMinor === null && input.settlementDigest === null;
  }
  if (!["failed_retryable", "settled", "released"].includes(String(input.state))) return false;
  if (!positiveOrZeroSafe(input.documentedCostMinor) || typeof input.settlementDigest !== "string" || !DIGEST_PATTERN.test(input.settlementDigest)) return false;
  return (input.state === "failed_retryable" && input.terminalReason === "failed_retryable")
    || (input.state === "settled" && ["completed", "partial"].includes(String(input.terminalReason)))
    || (input.state === "released" && ["rejected", "expired"].includes(String(input.terminalReason)));
}

function positiveOrZeroSafe(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

async function validateRunnerEventAcknowledgement(
  reservationId: string,
  event: NonNullable<Awaited<ReturnType<typeof latestRunnerEvent>>>,
): Promise<boolean> {
  let material: Record<string, unknown>;
  if (event.state === "reserved" || event.state === "assigned") {
    if (event.terminal_reason !== null || event.settlement_digest !== null || event.documented_cost_minor !== null) return false;
    material = { schema: "runner-reservation-event/v1", reservationId, durableRevision: Number(event.durable_revision), state: event.state };
  } else {
    if (event.terminal_reason === null) return false;
    material = {
      schema: "runner-reservation-event/v1", reservationId, durableRevision: Number(event.durable_revision),
      state: event.state, terminalReason: event.terminal_reason, documentedCostMinor: event.documented_cost_minor,
      settlementDigest: event.settlement_digest,
    };
  }
  return DIGEST_PATTERN.test(event.acknowledgement_digest)
    && event.acknowledgement_digest === await digest(material);
}

function derivedEnrichmentAccountId(workspaceId: string, scope: BudgetAccount["scope"], entityId: string): string {
  return `enrichment:${workspaceId.length}:${workspaceId}:${scope}:${entityId.length}:${entityId}`;
}

async function readReservation(database: D1Database, workspaceId: string, id: string): Promise<EnrichmentReservation | null> {
  const row = await database.prepare(
    `SELECT id, grant_id, workspace_id, operation_key, assignment_json, assignment_digest, created_at
     FROM enrichment_reservations WHERE id = ? AND workspace_id = ? LIMIT 1`,
  ).bind(id, workspaceId).first<{
    id: string; grant_id: string; workspace_id: string; operation_key: string;
    assignment_json: string; assignment_digest: string; created_at: number;
  }>();
  if (!row) return null;
  try {
    const assignment = JSON.parse(row.assignment_json) as EnrichmentReservation["assignment"];
    if (canonical(assignment) !== row.assignment_json || row.assignment_digest !== await digest(assignment)) return null;
    const initial = await reservationEventAtRevision(database, workspaceId, id, 1);
    if (
      !initial || initial.state !== "reserved" || Number(initial.durable_revision) !== 1
      || Number(initial.created_at) !== Number(row.created_at)
      || !await validateEnrichmentEventAcknowledgement(id, initial)
    ) return null;
    return freeze({ id: row.id, grantId: row.grant_id, workspaceId: row.workspace_id, operationKey: row.operation_key, status: "reserved", assignment }) as EnrichmentReservation;
  } catch {
    return null;
  }
}

async function latestReservationEvent(database: D1Database, workspaceId: string, reservationId: string) {
  return database.prepare(
    `SELECT durable_revision, state, claimed_at, terminal_reason, settlement_digest, documented_units,
      documented_cost_minor, observation_ids_json, acknowledgement_digest, created_at
     FROM enrichment_reservation_events WHERE workspace_id = ? AND reservation_id = ? ORDER BY durable_revision DESC LIMIT 1`,
  ).bind(workspaceId, reservationId).first<{
    durable_revision: number; state: EnrichmentReservation["status"]; claimed_at: number | null;
    terminal_reason: string | null; settlement_digest: string | null; documented_units: number | null;
    documented_cost_minor: number | null; observation_ids_json: string; acknowledgement_digest: string; created_at: number;
  }>();
}

async function reservationEventAtRevision(database: D1Database, workspaceId: string, reservationId: string, revision: number) {
  return database.prepare(
    `SELECT durable_revision, state, claimed_at, terminal_reason, settlement_digest, documented_units,
      documented_cost_minor, observation_ids_json, acknowledgement_digest, created_at
     FROM enrichment_reservation_events WHERE workspace_id = ? AND reservation_id = ? AND durable_revision = ? LIMIT 1`,
  ).bind(workspaceId, reservationId, revision).first<NonNullable<Awaited<ReturnType<typeof latestReservationEvent>>>>();
}

async function validateEnrichmentEventAcknowledgement(
  reservationId: string,
  event: NonNullable<Awaited<ReturnType<typeof latestReservationEvent>>>,
): Promise<boolean> {
  let material: Record<string, unknown>;
  if (event.state === "reserved") {
    if (event.claimed_at !== null || event.terminal_reason !== null || event.settlement_digest !== null
      || event.documented_units !== null || event.documented_cost_minor !== null || event.observation_ids_json !== "[]") return false;
    material = { schema: "enrichment-reservation-event/v1", reservationId, durableRevision: Number(event.durable_revision), state: "reserved" };
  } else if (event.state === "invoking") {
    if (event.claimed_at === null || event.terminal_reason !== null || event.settlement_digest !== null
      || event.documented_units !== null || event.documented_cost_minor !== null || event.observation_ids_json !== "[]") return false;
    material = {
      schema: "enrichment-reservation-event/v1", reservationId, durableRevision: Number(event.durable_revision),
      state: "invoking", claimedAt: Number(event.claimed_at),
    };
  } else if (event.state === "needs_reconciliation") {
    if (event.terminal_reason === null || event.settlement_digest !== null
      || event.documented_units !== null || event.documented_cost_minor !== null || event.observation_ids_json !== "[]") return false;
    material = {
      schema: "enrichment-reservation-event/v1", reservationId, durableRevision: Number(event.durable_revision),
      state: "needs_reconciliation", reason: event.terminal_reason,
    };
  } else {
    const observationIds = parseIdList(event.observation_ids_json);
    if (event.terminal_reason === null || event.settlement_digest === null
      || event.documented_units === null || event.documented_cost_minor === null) return false;
    material = {
      schema: "enrichment-reservation-event/v1", reservationId, durableRevision: Number(event.durable_revision),
      state: event.state, reason: event.terminal_reason, settlementDigest: event.settlement_digest,
      documentedUnits: Number(event.documented_units), documentedCostMinor: Number(event.documented_cost_minor), observationIds,
    };
  }
  return DIGEST_PATTERN.test(event.acknowledgement_digest)
    && event.acknowledgement_digest === await digest(material);
}

async function releaseExpiredReservation(database: D1Database, workspaceId: string, reservationId: string, now: number): Promise<boolean> {
  const latest = await latestReservationEvent(database, workspaceId, reservationId);
  if (!latest) return false;
  if (latest.state === "released") return validateExpiredReleaseEvent(reservationId, latest);
  if (latest.state !== "reserved") return false;
  const durableRevision = Number(latest.durable_revision) + 1;
  const settlementDigest = await digest({ schema: "enrichment-expiry-release/v1", reservationId, durableRevision, expiredAt: now });
  const acknowledgementDigest = await digest({
    schema: "enrichment-reservation-event/v1", reservationId, durableRevision, state: "released",
    reason: "expired", settlementDigest, documentedUnits: 0, documentedCostMinor: 0, observationIds: [],
  });
  try {
    const result = await database.prepare(
      `INSERT INTO enrichment_reservation_events (
        id, workspace_id, reservation_id, durable_revision, state, terminal_reason, settlement_digest,
        documented_units, documented_cost_minor, observation_ids_json, acknowledgement_digest, claimed_at, created_at
      ) VALUES (?, ?, ?, ?, 'released', 'expired', ?, 0, 0, '[]', ?, NULL, ?)`,
    ).bind(`ere_${acknowledgementDigest.slice(0, 24)}`, workspaceId, reservationId, durableRevision, settlementDigest, acknowledgementDigest, now).run();
    if (Number(result.meta?.changes) < 1) return false;
  } catch {
    const winner = await latestReservationEvent(database, workspaceId, reservationId);
    return !!winner && await validateExpiredReleaseEvent(reservationId, winner);
  }
  const committed = await latestReservationEvent(database, workspaceId, reservationId);
  return !!committed && await validateExpiredReleaseEvent(reservationId, committed);
}

async function validateExpiredReleaseEvent(reservationId: string, event: NonNullable<Awaited<ReturnType<typeof latestReservationEvent>>>): Promise<boolean> {
  if (
    event.state !== "released" || event.terminal_reason !== "expired"
    || Number(event.documented_units) !== 0 || Number(event.documented_cost_minor) !== 0
    || !event.settlement_digest || !DIGEST_PATTERN.test(event.settlement_digest)
  ) return false;
  const expectedSettlement = await digest({
    schema: "enrichment-expiry-release/v1", reservationId,
    durableRevision: Number(event.durable_revision), expiredAt: Number(event.created_at),
  });
  const expectedAcknowledgement = await digest({
    schema: "enrichment-reservation-event/v1", reservationId, durableRevision: Number(event.durable_revision),
    state: "released", reason: "expired", settlementDigest: expectedSettlement,
    documentedUnits: 0, documentedCostMinor: 0, observationIds: [],
  });
  return event.settlement_digest === expectedSettlement && event.acknowledgement_digest === expectedAcknowledgement;
}

async function settleCommittedReservation(
  database: D1Database,
  workspaceId: string,
  reservationId: string,
  settlement: SettlementWrite,
  now: number,
): Promise<DurableReservationAcknowledgement> {
  if (!validId(reservationId) || !validSettlement(settlement, workspaceId)) throw new Error("invalid_enrichment_settlement");
  const reservation = await database.prepare(
    "SELECT id, grant_id, reserved_units, reserved_cost_minor FROM enrichment_reservations WHERE id = ? AND workspace_id = ? LIMIT 1",
  ).bind(reservationId, workspaceId).first<{ id: string; grant_id: string; reserved_units: number; reserved_cost_minor: number }>();
  if (!reservation || settlement.documentedUnits > Number(reservation.reserved_units) || settlement.documentedCostMinor > Number(reservation.reserved_cost_minor)) {
    throw new Error("enrichment_settlement_unavailable");
  }
  const committedReservation = await readReservation(database, workspaceId, reservationId);
  if (!committedReservation || committedReservation.grantId !== reservation.grant_id) {
    throw new Error("enrichment_settlement_unavailable");
  }
  const latest = await latestReservationEvent(database, workspaceId, reservationId);
  if (!latest) throw new Error("enrichment_settlement_unavailable");
  if (latest.state === "settled" || latest.state === "released") {
    const observationIds = parseIdList(latest.observation_ids_json);
    if (
      latest.state !== settlement.state
      || latest.terminal_reason !== settlement.reason
      || latest.settlement_digest !== settlement.settlementDigest
      || Number(latest.documented_units) !== settlement.documentedUnits
      || Number(latest.documented_cost_minor) !== settlement.documentedCostMinor
      || canonical(observationIds) !== canonical(settlement.observations.map((observation) => observation.id))
      || !await validateEnrichmentEventAcknowledgement(reservationId, latest)
    ) throw new Error("enrichment_settlement_conflict");
    return freeze({
      kind: "durably_recorded", reservationId, terminalState: latest.state, terminalReason: settlement.reason,
      settlementDigest: latest.settlement_digest, observationIds, durableRevision: Number(latest.durable_revision),
    });
  }
  if (latest.state !== "invoking" && latest.state !== "needs_reconciliation") throw new Error("enrichment_settlement_unavailable");
  const observationStatements: D1PreparedStatement[] = [];
  for (const observation of settlement.observations) {
    if (!isDefensivelyValidContactObservation(observation) || observation.workspaceId !== workspaceId) throw new Error("invalid_enrichment_observation");
    const assignmentContext = observation.assignmentContext;
    const committedAssignment = assignmentContext
      ? committedReservation.assignment.evidenceAssignments.find((item) =>
          item.assignmentId === assignmentContext.assignmentId
          && item.prospectId === assignmentContext.prospectId
          && item.role === assignmentContext.role
          && item.contactId === observation.contactId
        )
      : null;
    if (
      !assignmentContext
      || !committedAssignment
      || assignmentContext.quoteRevision !== committedReservation.assignment.quoteRevision
      || observation.profileConfigurationId !== committedReservation.assignment.configurationId
      || observation.profileConfigurationDigest !== committedReservation.assignment.configurationDigest
      || (observation.verificationAuthority !== null && (
        observation.verificationAuthority.assignmentId !== assignmentContext.assignmentId
        || observation.verificationAuthority.prospectId !== assignmentContext.prospectId
        || observation.verificationAuthority.role !== assignmentContext.role
        || observation.verificationAuthority.quoteRevision !== assignmentContext.quoteRevision
      ))
    ) throw new Error("enrichment_observation_assignment_unavailable");
    const assignment = await database.prepare(
      `SELECT a.id FROM contact_evidence_assignments a
       WHERE a.id = ? AND a.workspace_id = ? AND a.grant_id = ? AND a.prospect_id = ?
         AND a.contact_id = ? AND a.role = ? AND a.configuration_id = ? AND a.configuration_digest = ?
         AND a.provider_id = ? AND a.provider_version = ? AND a.catalog_ref = ? AND a.quote_revision = ? LIMIT 1`,
    ).bind(
      assignmentContext.assignmentId, workspaceId, reservation.grant_id, assignmentContext.prospectId,
      observation.contactId, assignmentContext.role, observation.profileConfigurationId,
      observation.profileConfigurationDigest, committedReservation.assignment.providerId,
      committedReservation.assignment.providerVersion, committedReservation.assignment.catalogRef,
      assignmentContext.quoteRevision,
    )
      .first<{ id: string }>();
    if (!assignment) throw new Error("enrichment_observation_assignment_unavailable");
    const observationDigest = await digest({ schema: "contact-observation/v1", observation });
    const contactPointDigest = await digest({ schema: "contact-point/v1", kind: observation.kind, normalizedValue: observation.normalizedValue });
    const excerptDigest = await digest({ schema: "contact-evidence-excerpt/v1", excerpt: observation.provenance.excerpt });
    observationStatements.push(database.prepare(
      `INSERT INTO contact_point_observations (
        id, workspace_id, assignment_id, contact_id, configuration_id, configuration_digest, kind,
        contact_point_digest, contact_point_reference, verification_class, confidence_basis_points, method,
        source_reference, excerpt_digest, object_reference, content_hash, retrieved_at, observed_at, verified_at,
        provider_id, provider_version, catalog_ref, verifier_id, verifier_version, verdict_reference, verdict_digest,
        parent_observation_id, observation_digest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      observation.id, workspaceId, assignment.id, observation.contactId, observation.profileConfigurationId,
      observation.profileConfigurationDigest, observation.kind, contactPointDigest, `contact-point:${contactPointDigest}`,
      observation.verificationClass, Math.round(observation.confidence * 10_000), observation.method,
      observation.provenance.sourceReference, excerptDigest, observation.provenance.objectReference, observation.provenance.contentHash,
      observation.provenance.retrievedAt, observation.observedAt, observation.verifiedAt,
      observation.providerId, observation.providerVersion, observation.catalogRef,
      observation.verificationAuthority?.verifierId ?? null, observation.verificationAuthority?.verifierVersion ?? null,
      observation.verificationAuthority?.verdictReference ?? null, observation.verificationAuthority?.verdictDigest ?? null,
      observation.lineage.parentObservationId, observationDigest, now,
    ));
  }
  const durableRevision = Number(latest.durable_revision) + 1;
  const observationIds = settlement.observations.map((observation) => observation.id);
  const acknowledgementDigest = await digest({
    schema: "enrichment-reservation-event/v1", reservationId, durableRevision, state: settlement.state,
    reason: settlement.reason, settlementDigest: settlement.settlementDigest,
    documentedUnits: settlement.documentedUnits, documentedCostMinor: settlement.documentedCostMinor, observationIds,
  });
  const event = database.prepare(
    `INSERT INTO enrichment_reservation_events (
      id, workspace_id, reservation_id, durable_revision, state, terminal_reason, settlement_digest,
      documented_units, documented_cost_minor, observation_ids_json, acknowledgement_digest, claimed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).bind(
    `ere_${acknowledgementDigest.slice(0, 24)}`, workspaceId, reservationId, durableRevision, settlement.state,
    settlement.reason, settlement.settlementDigest, settlement.documentedUnits, settlement.documentedCostMinor,
    canonical(observationIds), acknowledgementDigest, now,
  );
  try {
    const results = await database.batch([...observationStatements, event]);
    if (!results.every((result) => Number(result.meta?.changes) >= 1)) throw new Error("enrichment_settlement_write_not_exact");
  } catch {
    const winner = await latestReservationEvent(database, workspaceId, reservationId);
    if (
      winner && (winner.state === "settled" || winner.state === "released")
      && winner.state === settlement.state && winner.terminal_reason === settlement.reason
      && winner.settlement_digest === settlement.settlementDigest
      && Number(winner.documented_units) === settlement.documentedUnits
      && Number(winner.documented_cost_minor) === settlement.documentedCostMinor
      && canonical(parseIdList(winner.observation_ids_json)) === canonical(observationIds)
      && await validateEnrichmentEventAcknowledgement(reservationId, winner)
    ) {
      return freeze({
        kind: "durably_recorded", reservationId, terminalState: winner.state, terminalReason: settlement.reason,
        settlementDigest: winner.settlement_digest, observationIds, durableRevision: Number(winner.durable_revision),
      });
    }
    throw new Error("enrichment_settlement_commit_failed");
  }
  const committed = await latestReservationEvent(database, workspaceId, reservationId);
  if (
    !committed || committed.durable_revision !== durableRevision || committed.state !== settlement.state
    || !await validateEnrichmentEventAcknowledgement(reservationId, committed)
  ) throw new Error("enrichment_settlement_acknowledgement_invalid");
  return freeze({
    kind: "durably_recorded", reservationId, terminalState: settlement.state, terminalReason: settlement.reason,
    settlementDigest: settlement.settlementDigest, observationIds, durableRevision,
  });
}

async function appendReconciliation(database: D1Database, workspaceId: string, reservationId: string, reason: ReconciliationReason, now: number): Promise<DurableReservationAcknowledgement> {
  const latest = await latestReservationEvent(database, workspaceId, reservationId);
  if (!latest) throw new Error("enrichment_reconciliation_unavailable");
  if (latest.state === "needs_reconciliation") {
    if (
      latest.terminal_reason !== reason || latest.settlement_digest !== null
      || !await validateEnrichmentEventAcknowledgement(reservationId, latest)
    ) throw new Error("enrichment_reconciliation_conflict");
    return freeze({
      kind: "durably_recorded", reservationId, terminalState: "needs_reconciliation", terminalReason: reason,
      settlementDigest: null, observationIds: [], durableRevision: Number(latest.durable_revision),
    });
  }
  if (latest.state !== "invoking") throw new Error("enrichment_reconciliation_unavailable");
  const durableRevision = Number(latest.durable_revision) + 1;
  const acknowledgementDigest = await digest({ schema: "enrichment-reservation-event/v1", reservationId, durableRevision, state: "needs_reconciliation", reason });
  let result;
  try {
    result = await database.prepare(
    `INSERT INTO enrichment_reservation_events
      (id, workspace_id, reservation_id, durable_revision, state, terminal_reason, settlement_digest, observation_ids_json, acknowledgement_digest, created_at)
     VALUES (?, ?, ?, ?, 'needs_reconciliation', ?, NULL, '[]', ?, ?)`,
    ).bind(`ere_${acknowledgementDigest.slice(0, 24)}`, workspaceId, reservationId, durableRevision, reason, acknowledgementDigest, now).run();
  } catch {
    const winner = await latestReservationEvent(database, workspaceId, reservationId);
    if (
      winner?.state === "needs_reconciliation" && winner.terminal_reason === reason && winner.settlement_digest === null
      && await validateEnrichmentEventAcknowledgement(reservationId, winner)
    ) {
      return freeze({
        kind: "durably_recorded", reservationId, terminalState: "needs_reconciliation", terminalReason: reason,
        settlementDigest: null, observationIds: [], durableRevision: Number(winner.durable_revision),
      });
    }
    throw new Error("enrichment_reconciliation_commit_failed");
  }
  if (Number(result.meta?.changes) !== 1) throw new Error("enrichment_reconciliation_commit_failed");
  const committed = await latestReservationEvent(database, workspaceId, reservationId);
  if (
    !committed || committed.durable_revision !== durableRevision || committed.state !== "needs_reconciliation"
    || !await validateEnrichmentEventAcknowledgement(reservationId, committed)
  ) throw new Error("enrichment_reconciliation_acknowledgement_invalid");
  return freeze({ kind: "durably_recorded", reservationId, terminalState: "needs_reconciliation", terminalReason: reason, settlementDigest: null, observationIds: [], durableRevision });
}

function validSettlement(value: SettlementWrite, workspaceId: string): boolean {
  return !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join(",") === "documentedCostMinor,documentedUnits,observations,reason,settlementDigest,state"
    && (value.state === "settled" || value.state === "released")
    && ((value.state === "released" && value.reason === "rejected") || (value.state === "settled" && (value.reason === "completed" || value.reason === "partial")))
    && Number.isSafeInteger(value.documentedUnits) && value.documentedUnits >= 0
    && Number.isSafeInteger(value.documentedCostMinor) && value.documentedCostMinor >= 0
    && typeof value.settlementDigest === "string" && DIGEST_PATTERN.test(value.settlementDigest)
    && Array.isArray(value.observations) && value.observations.length <= value.documentedUnits
    && new Set(value.observations.map((observation: ContactObservation) => observation.id)).size === value.observations.length
    && value.observations.every((observation: ContactObservation) => observation.workspaceId === workspaceId);
}

function parseIdList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(validId) || new Set(parsed).size !== parsed.length) throw new Error();
    return parsed;
  } catch {
    throw new Error("invalid_enrichment_observation_ids");
  }
}

function toBudgetAccount(row: Record<string, unknown>): BudgetAccount {
  return freeze({
    authorityType: "enrichment", accountId: String(row.account_id), scope: row.scope as BudgetAccount["scope"],
    workspaceId: String(row.workspace_id), entityId: String(row.entity_id), currency: String(row.currency),
    actualUnits: Number(row.actual_units), reservedUnits: Number(row.reserved_units), maxUnits: Number(row.max_units),
    actualCostMinor: Number(row.actual_cost_minor), reservedCostMinor: Number(row.reserved_cost_minor), maxCostMinor: Number(row.max_cost_minor),
  });
}

function validReservation(record: EnrichmentReservation, workspaceId: string): boolean {
  return !!record && record.workspaceId === workspaceId && record.status === "reserved" && validId(record.id)
    && validId(record.grantId) && /^op_[a-f0-9]{64}$/u.test(record.operationKey)
    && record.assignment.reservationId === record.id && record.assignment.workspaceId === workspaceId
    && record.assignment.operationKey === record.operationKey;
}

function validAccountSet(accounts: readonly BudgetAccount[], workspaceId: string): boolean {
  return Array.isArray(accounts) && accounts.length === 4
    && new Set(accounts.map((account) => account.scope)).size === 4
    && accounts.every((account) => account.workspaceId === workspaceId && account.authorityType === "enrichment" && validId(account.accountId));
}

function validIds(values: readonly string[]): boolean {
  return Array.isArray(values) && values.length > 0 && values.length <= 100 && new Set(values).size === values.length && values.every(validId);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function positiveTime(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("invalid_repository_time");
  return value;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

async function digest(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(typeof value === "string" ? value : canonical(value));
  const bytes = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
