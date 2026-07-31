import {
  canonical,
  parseIssuedEnrichmentGrant,
  type EnrichmentGrant,
  type IssuanceRepository,
  type IssuanceSnapshot,
} from "./enrichment-grant-issuance";
import {
  brandDurablyVerifiedInvocationClaim,
  deriveEnrichmentSettlementIdentity,
  registerDurableEnrichmentAuthorityRepository,
  type BudgetAccount,
  type DurableReservationAcknowledgement,
  type EnrichmentAuthorityRepository,
  type EnrichmentReservation,
  type ReconciliationReason,
  type RecoverableInvocation,
  type ReservationAuthority,
  type SettlementWrite,
} from "./enrichment-authority";
import { isDefensivelyValidContactObservation, type ContactObservation } from "./contact-evidence";
import {
  isBoundContactSettlementAttestor,
  type ContactSettlementAttestation,
  type ContactSettlementAttestor,
  type ContactSettlementReceiptBinding,
} from "./contact-settlement-attestor";
import {
  buildContactSettlementAttestationMaterial,
  verifyPersistedContactSettlement,
} from "./contact-settlement-persistence";
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

export type RepositoryScope = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  now?: () => number;
  contactSettlementAttestor?: ContactSettlementAttestor;
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

export type IssueRunnerSpendAuthorityInput = Readonly<{
  providerId: string;
  model: string;
  catalogRef: string;
  runType: string;
  scopeId: string;
  perRunCostMinor: number;
  monthlyCostMinor: number;
  currency: string;
  maxRetries: number;
  expiresAt: number;
  expectedRevision: number;
  idempotencyKey: string;
}>;

export type IssuedRunnerSpendAuthority = Readonly<{
  grant: RunnerSpendGrant;
  monthlyAccountId: string;
  perRunAccountIds: readonly string[];
  replayed: boolean;
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

type RunnerGrantRow = {
  id: string; workspace_id: string; owner_subject: string; provider_id: string; model: string;
  catalog_ref: string; run_type: string; scope_id: string; per_run_cost_minor: number;
  monthly_cost_minor: number; currency: string; max_retries: number; source_revision: number;
  idempotency_key: string; request_digest: string; grant_digest: string; authority_command_id: string;
  audit_event_id: string; nonce: string; expires_at: number; created_at: number;
};

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * The scope is server-derived at composition time. No method accepts a workspace
 * override, credential, endpoint, provider envelope, or raw contact value.
 */
export function createD1EnrichmentRepository(database: D1Database, scope: RepositoryScope): D1EnrichmentRepository {
  if (!validId(scope.workspaceId) || !validId(scope.ownerSubject)) throw new TypeError("invalid_enrichment_repository_scope");
  const clock = scope.now ?? Date.now;

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
      const workspace = await database.prepare(
        "SELECT revision FROM workspaces WHERE id = ? AND owner_subject = ? LIMIT 1",
      ).bind(scope.workspaceId, scope.ownerSubject).first<{ revision: number }>();
      const config = await database.prepare(
        "SELECT id, digest, revision, active FROM typed_configurations WHERE id = ? AND workspace_id = ? LIMIT 1",
      ).bind(grant.tuple.configurationId, scope.workspaceId).first<{ id: string; digest: string; revision: number; active: number }>();
      const quote = await database.prepare(
        `SELECT provider_id, provider_version, catalog_ref, revision, currency, unit_cost_minor, expires_at
         FROM provider_quotes WHERE workspace_id = ? AND provider_id = ? AND provider_version = ? AND catalog_ref = ? AND revision = ? LIMIT 1`,
      ).bind(scope.workspaceId, grant.tuple.providerId, grant.tuple.providerVersion, grant.tuple.catalogRef, grant.tuple.quoteRevision)
        .first<{ provider_id: string; provider_version: string; catalog_ref: string; revision: number; currency: string; unit_cost_minor: number; expires_at: number }>();
      if (!workspace || !config || !quote) return null;
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
        admitted: true, principalSubject: scope.ownerSubject, workspaceId: scope.workspaceId, sourceRevision: Number(workspace.revision),
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
      return { kind: "created", record: committed };
    },

    async claimCommittedInvocation(reservationId, now) {
      if (!validId(reservationId) || !Number.isSafeInteger(now) || now <= 0) return { kind: "blocked", reason: "unavailable" };
      const trustedNow = positiveTime(clock());
      const record = await readReservation(database, scope.workspaceId, reservationId);
      if (!record) return { kind: "blocked", reason: "unavailable" };
      if (record.assignment.expiresAt <= trustedNow) {
        return await releaseExpiredReservation(database, scope.workspaceId, reservationId, trustedNow)
          ? { kind: "blocked", reason: "expired" }
          : { kind: "blocked", reason: "unavailable" };
      }
      const latest = await latestReservationEvent(database, scope.workspaceId, reservationId);
      if (!latest || latest.state !== "reserved") return { kind: "blocked", reason: "unavailable" };
      const revision = latest.durable_revision + 1;
      const acknowledgementDigest = await digest({ schema: "enrichment-reservation-event/v1", reservationId, durableRevision: revision, state: "invoking", claimedAt: trustedNow });
      try {
        const result = await database.prepare(
          `INSERT INTO enrichment_reservation_events
            (id, workspace_id, reservation_id, durable_revision, state, observation_ids_json, acknowledgement_digest, claimed_at, created_at)
           VALUES (?, ?, ?, ?, 'invoking', '[]', ?, ?, ?)`,
        ).bind(`ere_${acknowledgementDigest.slice(0, 24)}`, scope.workspaceId, reservationId, revision, acknowledgementDigest, trustedNow, trustedNow).run();
        if (Number(result.meta?.changes) !== 1) return { kind: "blocked", reason: "unavailable" };
      } catch {
        return { kind: "blocked", reason: "unavailable" };
      }
      const committedClaim = await latestReservationEvent(database, scope.workspaceId, reservationId);
      if (
        !committedClaim || committedClaim.durable_revision !== revision || committedClaim.state !== "invoking"
        || !await validateEnrichmentEventAcknowledgement(reservationId, committedClaim)
      ) return { kind: "blocked", reason: "unavailable" };
      return brandDurablyVerifiedInvocationClaim(repository, record.assignment, trustedNow);
    },

    async settleReservation(reservationId, settlement) {
      return settleCommittedReservation(
        database,
        scope.workspaceId,
        reservationId,
        settlement,
        positiveTime(clock()),
        scope.contactSettlementAttestor,
      );
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

    async releaseExpiredReservations(input) {
      if (!Number.isSafeInteger(input.now) || input.now <= 0 || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) return [];
      const trustedNow = positiveTime(clock());
      const rows = (await database.prepare(
        `SELECT r.id FROM enrichment_reservations r
         JOIN enrichment_reservation_events e ON e.reservation_id=r.id
          AND e.durable_revision=(SELECT max(e2.durable_revision) FROM enrichment_reservation_events e2 WHERE e2.reservation_id=r.id)
         WHERE r.workspace_id=? AND r.expires_at<=? AND e.state='reserved'
         ORDER BY r.expires_at,r.id LIMIT ?`,
      ).bind(scope.workspaceId, trustedNow, input.limit).all<{ id: string }>()).results;
      const released: string[] = [];
      for (const row of rows) {
        const record = await readReservation(database, scope.workspaceId, row.id);
        if (record && await releaseExpiredReservation(database, scope.workspaceId, row.id, trustedNow)) released.push(row.id);
      }
      return Object.freeze(released);
    },
  };
  registerDurableEnrichmentAuthorityRepository(repository);
  return Object.freeze(repository);
}

export function createD1RunnerSpendRepository(database: D1Database, scope: RepositoryScope): D1RunnerSpendRepository {
  if (!validId(scope.workspaceId) || !validId(scope.ownerSubject)) throw new TypeError("invalid_runner_repository_scope");
  const clock = scope.now ?? Date.now;
  const repository: D1RunnerSpendRepository = {
    async loadRunnerAuthority(grantId) {
      if (!validId(grantId)) return null;
      const validatedGrant = await readValidatedRunnerGrant(database, scope.workspaceId, scope.ownerSubject, grantId);
      if (!validatedGrant) return null;
      const { grant } = validatedGrant;
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
      if (
        !perRunRow || !monthlyRow
        || !await validateRunnerAccount(database, perRunRow, scope.workspaceId, scope.ownerSubject)
        || !await validateRunnerAccount(database, monthlyRow, scope.workspaceId, scope.ownerSubject)
      ) return null;
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
        "SELECT id FROM runner_spend_grants WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1",
      ).bind(record.grantId, scope.workspaceId, scope.ownerSubject).first<{ id: string }>();
      const validatedGrant = grantRow
        ? await readValidatedRunnerGrant(database, scope.workspaceId, scope.ownerSubject, grantRow.id)
        : null;
      if (!validatedGrant || accounts.length !== 2) return { kind: "blocked" };
      const grant = validatedGrant.grant;
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
      if (!positiveSafe(now)) return false;
      const trustedNow = positiveTime(clock());
      const latest = await latestRunnerEvent(database, scope.workspaceId, reservationId);
      const timing = await database.prepare(
        `SELECT r.created_at,g.expires_at FROM runner_spend_reservations r
         JOIN runner_spend_grants g ON g.id=r.grant_id AND g.workspace_id=r.workspace_id
         WHERE r.id=? AND r.workspace_id=? LIMIT 1`,
      ).bind(reservationId, scope.workspaceId).first<{ created_at: number; expires_at: number }>();
      if (
        !latest || latest.state !== "reserved" || !timing
        || trustedNow < Number(timing.created_at) || trustedNow < Number(latest.created_at) || trustedNow >= Number(timing.expires_at)
      ) return false;
      const revision = Number(latest.durable_revision) + 1;
      const acknowledgementDigest = await digest({ schema: "runner-reservation-event/v1", reservationId, durableRevision: revision, state: "assigned" });
      try {
        const result = await database.prepare(
          `INSERT INTO runner_spend_reservation_events
            (id,workspace_id,reservation_id,durable_revision,state,terminal_reason,settlement_digest,documented_cost_minor,acknowledgement_digest,created_at)
           VALUES (?, ?, ?, ?, 'assigned', NULL, NULL, NULL, ?, ?)`,
        ).bind(`rre_${acknowledgementDigest.slice(0, 24)}`, scope.workspaceId, reservationId, revision, acknowledgementDigest, trustedNow).run();
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
      const trustedNow = positiveTime(clock());
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
        || !timing || trustedNow < Number(timing.created_at) || trustedNow < Number(latest.created_at)
        || (input.state === "released" && input.terminalReason === "expired" && trustedNow < Number(timing.expires_at))
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
          input.terminalReason, input.settlementDigest, input.documentedCostMinor, acknowledgementDigest, trustedNow,
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

/**
 * Persists the owner command, audit evidence, grant, and zeroed runner-only
 * accounts as one D1 batch. This is local infrastructure; it never invokes a
 * provider and accepts no caller-supplied grant, command, audit, or account IDs.
 */
export async function issueD1RunnerSpendAuthority(
  database: D1Database,
  scope: RepositoryScope,
  input: IssueRunnerSpendAuthorityInput,
): Promise<IssuedRunnerSpendAuthority> {
  if (!validId(scope.workspaceId) || !validId(scope.ownerSubject)) throw new TypeError("invalid_runner_repository_scope");
  const clock = scope.now ?? Date.now;
  const now = positiveTime(clock());
  if (!validRunnerIssuanceInput(input, now)) throw new TypeError("invalid_runner_issuance");
  const workspace = await database.prepare(
    "SELECT revision FROM workspaces WHERE id=? AND owner_subject=? LIMIT 1",
  ).bind(scope.workspaceId, scope.ownerSubject).first<{ revision: number }>();
  if (!workspace || Number(workspace.revision) !== input.expectedRevision) throw new Error("runner_issuance_revision_conflict");

  const requestMaterial = {
    schema: "runner-spend-request/v1",
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    providerId: input.providerId,
    model: input.model,
    catalogRef: input.catalogRef,
    runType: input.runType,
    scopeId: input.scopeId,
    perRunCostMinor: input.perRunCostMinor,
    monthlyCostMinor: input.monthlyCostMinor,
    currency: input.currency,
    maxRetries: input.maxRetries,
    expiresAt: input.expiresAt,
    sourceRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
  };
  const requestDigest = await digest(requestMaterial);
  const prior = await database.prepare(
    "SELECT id,request_digest FROM runner_spend_grants WHERE workspace_id=? AND idempotency_key=? LIMIT 1",
  ).bind(scope.workspaceId, input.idempotencyKey).first<{ id: string; request_digest: string }>();
  if (prior) {
    if (prior.request_digest !== requestDigest) throw new Error("runner_issuance_idempotency_conflict");
    const replay = await readIssuedRunnerSpendAuthority(database, scope, prior.id, now);
    if (!replay) throw new Error("runner_issuance_replay_invalid");
    return freeze({ ...replay, replayed: true });
  }

  const authorityCommandId = `rac_${requestDigest.slice(0, 24)}`;
  const auditEventId = `rae_${(await digest({
    schema: "runner-spend-audit-id/v1",
    workspaceId: scope.workspaceId,
    ownerSubject: scope.ownerSubject,
    requestDigest,
  })).slice(0, 24)}`;
  const nonce = await digest({ schema: "runner-spend-nonce/v1", requestDigest });
  const grantDigest = await digest({
    schema: "runner-spend-grant/v1",
    ...requestMaterial,
    nonce,
    requestDigest,
    authorityCommandId,
    auditEventId,
  });
  const grantId = `rsg_${grantDigest.slice(0, 24)}`;
  const grant: RunnerSpendGrant = freeze({
    authorityType: "runner_spend",
    id: grantId,
    providerId: input.providerId,
    model: input.model,
    catalogRef: input.catalogRef,
    runType: input.runType,
    scopeId: input.scopeId,
    perRunCostMinor: input.perRunCostMinor,
    monthlyCostMinor: input.monthlyCostMinor,
    currency: input.currency,
    expiresAt: input.expiresAt,
    maxRetries: input.maxRetries,
  });
  const period = deriveRunnerUtcMonthPeriod(now);
  if (!period) throw new TypeError("invalid_runner_issuance");
  const monthlyAccountId = deriveRunnerMonthlyAccountId({
    workspaceId: scope.workspaceId,
    principalSubject: scope.ownerSubject,
    providerId: grant.providerId,
    scopeId: grant.scopeId,
    period,
  });
  const existingMonthly = await database.prepare(
    "SELECT * FROM runner_budget_accounts WHERE id=? AND workspace_id=? LIMIT 1",
  ).bind(monthlyAccountId, scope.workspaceId).first<Record<string, unknown>>();
  if (existingMonthly && !await validateRunnerAccount(database, existingMonthly, scope.workspaceId, scope.ownerSubject)) {
    throw new Error("runner_monthly_account_invalid");
  }
  const accountRows: Array<Readonly<{
    id: string;
    scope: "runner_monthly" | "runner_per_run";
    period: string | null;
    attemptNumber: number | null;
    operationKey: string | null;
    maxCostMinor: number;
  }>> = [];
  if (!existingMonthly) {
    accountRows.push({
      id: monthlyAccountId,
      scope: "runner_monthly",
      period,
      attemptNumber: null,
      operationKey: null,
      maxCostMinor: input.monthlyCostMinor,
    });
  }
  const perRunAccountIds: string[] = [];
  const previousOperationKeys: string[] = [];
  for (let attemptNumber = 0; attemptNumber <= grant.maxRetries; attemptNumber += 1) {
    const attempt: RunnerAttemptState = freeze({
      attemptNumber,
      previousOutcome: attemptNumber === 0 ? "none" : "failed_retryable",
      previousOperationKeys: [...previousOperationKeys],
    });
    const operationKey = await deriveRunnerOperationKey({
      workspaceId: scope.workspaceId,
      principalSubject: scope.ownerSubject,
      grant,
      attempt,
    });
    previousOperationKeys.push(operationKey);
    const accountId = deriveRunnerPerRunAccountId({
      workspaceId: scope.workspaceId,
      principalSubject: scope.ownerSubject,
      grantId,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      attemptNumber,
      operationKey,
    });
    perRunAccountIds.push(accountId);
    accountRows.push({
      id: accountId,
      scope: "runner_per_run",
      period: null,
      attemptNumber,
      operationKey,
      maxCostMinor: grant.perRunCostMinor,
    });
  }
  const statements = [
    database.prepare(
      `INSERT INTO authority_commands
        (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,
         expected_revision,subject_type,subject_id,status)
       VALUES (?,?,?,?,1,'runner_spend.grant.issue',?,?,?,'runner_spend_grant',?,'accepted')`,
    ).bind(
      authorityCommandId, scope.workspaceId, now, now, input.idempotencyKey,
      requestDigest, input.expectedRevision, grantId,
    ),
    database.prepare(
      `INSERT INTO audit_events
        (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at)
       VALUES (?,?,'owner',?,'runner_spend.grant.issued','runner_spend_grant',?,?,?)`,
    ).bind(
      auditEventId, scope.workspaceId, scope.ownerSubject, grantId,
      canonical({ requestDigest, grantDigest, sourceRevision: input.expectedRevision }),
      now,
    ),
    database.prepare(
      `INSERT INTO runner_spend_grants
        (id,workspace_id,owner_subject,provider_id,model,catalog_ref,run_type,scope_id,
         per_run_cost_minor,monthly_cost_minor,currency,max_retries,source_revision,idempotency_key,
         request_digest,grant_digest,authority_command_id,audit_event_id,nonce,expires_at,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      grantId, scope.workspaceId, scope.ownerSubject, grant.providerId, grant.model, grant.catalogRef,
      grant.runType, grant.scopeId, grant.perRunCostMinor, grant.monthlyCostMinor, grant.currency,
      grant.maxRetries, input.expectedRevision, input.idempotencyKey, requestDigest, grantDigest,
      authorityCommandId, auditEventId, nonce, grant.expiresAt, now,
    ),
  ];
  for (const account of accountRows) {
    const accountDigest = await digest({
      schema: "runner-budget-account/v1",
      id: account.id,
      workspaceId: scope.workspaceId,
      scope: account.scope,
      ownerSubject: scope.ownerSubject,
      providerId: grant.providerId,
      scopeId: grant.scopeId,
      period: account.period,
      attemptNumber: account.attemptNumber,
      operationKey: account.operationKey,
      currency: grant.currency,
      maxCostMinor: account.maxCostMinor,
      createdByGrantId: grantId,
      authorityCommandId,
      auditEventId,
      createdAt: now,
    });
    statements.push(database.prepare(
      `INSERT INTO runner_budget_accounts
        (id,workspace_id,scope,owner_subject,provider_id,scope_id,period,attempt_number,operation_key,
         currency,actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_by_grant_id,
         authority_command_id,audit_event_id,account_digest,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?,1,?,?,?,?,?,?)`,
    ).bind(
      account.id, scope.workspaceId, account.scope, scope.ownerSubject, grant.providerId, grant.scopeId,
      account.period, account.attemptNumber, account.operationKey, grant.currency, account.maxCostMinor,
      grantId, authorityCommandId, auditEventId, accountDigest, now, now,
    ));
  }
  try {
    const results = await database.batch(statements);
    if (!results.every((result) => Number(result.meta?.changes) >= 1)) throw new Error("runner_issuance_not_committed");
  } catch (error) {
    const winner = await database.prepare(
      "SELECT id,request_digest FROM runner_spend_grants WHERE workspace_id=? AND idempotency_key=? LIMIT 1",
    ).bind(scope.workspaceId, input.idempotencyKey).first<{ id: string; request_digest: string }>();
    if (!winner || winner.request_digest !== requestDigest) throw error;
  }
  const issued = await readIssuedRunnerSpendAuthority(database, scope, grantId, now);
  if (!issued) throw new Error("runner_issuance_invalid");
  return freeze({ ...issued, replayed: false });
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

async function readValidatedRunnerGrant(
  database: D1Database,
  workspaceId: string,
  ownerSubject: string,
  grantId: string,
  requireCurrentRevision = true,
): Promise<Readonly<{ grant: RunnerSpendGrant; row: RunnerGrantRow }> | null> {
  const row = await database.prepare(
    `SELECT g.*
     FROM runner_spend_grants g
     JOIN workspaces w ON w.id=g.workspace_id AND w.owner_subject=g.owner_subject
     JOIN authority_commands command ON command.id=g.authority_command_id AND command.workspace_id=g.workspace_id
       AND command.command_type='runner_spend.grant.issue' AND command.status='accepted'
       AND command.subject_type='runner_spend_grant' AND command.subject_id=g.id
       AND command.operation_digest=g.request_digest AND command.expected_revision=g.source_revision
     JOIN audit_events audit ON audit.id=g.audit_event_id AND audit.workspace_id=g.workspace_id
       AND audit.actor_type='owner' AND audit.actor_id=g.owner_subject
       AND audit.action='runner_spend.grant.issued' AND audit.subject_type='runner_spend_grant' AND audit.subject_id=g.id
     WHERE g.id=? AND g.workspace_id=? AND g.owner_subject=?
       AND (?=0 OR w.revision=g.source_revision)
     LIMIT 1`,
  ).bind(grantId, workspaceId, ownerSubject, requireCurrentRevision ? 1 : 0).first<RunnerGrantRow>();
  if (!row) return null;
  const grant: RunnerSpendGrant = freeze({
    authorityType: "runner_spend", id: row.id, providerId: row.provider_id, model: row.model,
    catalogRef: row.catalog_ref, runType: row.run_type, scopeId: row.scope_id,
    perRunCostMinor: Number(row.per_run_cost_minor), monthlyCostMinor: Number(row.monthly_cost_minor),
    currency: row.currency, expiresAt: Number(row.expires_at), maxRetries: Number(row.max_retries),
  });
  if (
    !validId(row.id) || !validId(row.provider_id) || !validId(row.model) || !validId(row.catalog_ref)
    || !validId(row.run_type) || !validId(row.scope_id) || !validId(row.idempotency_key)
    || !validId(row.authority_command_id) || !validId(row.audit_event_id) || !validId(row.nonce)
    || !positiveSafe(Number(row.source_revision)) || !positiveSafe(Number(row.created_at))
    || !positiveSafe(Number(row.expires_at)) || Number(row.expires_at) <= Number(row.created_at)
    || !positiveOrZeroSafe(Number(row.per_run_cost_minor))
    || !positiveOrZeroSafe(Number(row.monthly_cost_minor))
    || Number(row.monthly_cost_minor) < Number(row.per_run_cost_minor)
    || !Number.isSafeInteger(Number(row.max_retries)) || Number(row.max_retries) < 0 || Number(row.max_retries) > 10
    || !/^[A-Z]{3}$/u.test(row.currency)
  ) return null;
  const requestMaterial = {
    schema: "runner-spend-request/v1",
    workspaceId, ownerSubject, providerId: grant.providerId, model: grant.model,
    catalogRef: grant.catalogRef, runType: grant.runType, scopeId: grant.scopeId,
    perRunCostMinor: grant.perRunCostMinor, monthlyCostMinor: grant.monthlyCostMinor,
    currency: grant.currency, maxRetries: grant.maxRetries, expiresAt: grant.expiresAt,
    sourceRevision: Number(row.source_revision), idempotencyKey: row.idempotency_key,
  };
  const requestDigest = await digest(requestMaterial);
  const grantDigest = await digest({
    schema: "runner-spend-grant/v1", ...requestMaterial, nonce: row.nonce, requestDigest,
    authorityCommandId: row.authority_command_id, auditEventId: row.audit_event_id,
  });
  if (
    row.request_digest !== requestDigest || row.grant_digest !== grantDigest
    || row.id !== `rsg_${grantDigest.slice(0, 24)}`
  ) return null;
  return freeze({ grant, row });
}

function validRunnerIssuanceInput(input: IssueRunnerSpendAuthorityInput, now: number): boolean {
  return validId(input.providerId)
    && validId(input.model)
    && validId(input.catalogRef)
    && validId(input.runType)
    && validId(input.scopeId)
    && validId(input.idempotencyKey)
    && positiveOrZeroSafe(input.perRunCostMinor)
    && positiveOrZeroSafe(input.monthlyCostMinor)
    && input.monthlyCostMinor >= input.perRunCostMinor
    && /^[A-Z]{3}$/u.test(input.currency)
    && Number.isSafeInteger(input.maxRetries)
    && input.maxRetries >= 0
    && input.maxRetries <= 3
    && positiveSafe(input.expectedRevision)
    && positiveSafe(input.expiresAt)
    && input.expiresAt > now;
}

async function readIssuedRunnerSpendAuthority(
  database: D1Database,
  scope: RepositoryScope,
  grantId: string,
  now: number,
): Promise<Omit<IssuedRunnerSpendAuthority, "replayed"> | null> {
  const validated = await readValidatedRunnerGrant(database, scope.workspaceId, scope.ownerSubject, grantId);
  if (!validated) return null;
  const period = deriveRunnerUtcMonthPeriod(now);
  if (!period) return null;
  const monthlyAccountId = deriveRunnerMonthlyAccountId({
    workspaceId: scope.workspaceId,
    principalSubject: scope.ownerSubject,
    providerId: validated.grant.providerId,
    scopeId: validated.grant.scopeId,
    period,
  });
  const monthlyRow = await database.prepare(
    "SELECT * FROM runner_budget_accounts WHERE id=? AND workspace_id=? LIMIT 1",
  ).bind(monthlyAccountId, scope.workspaceId).first<Record<string, unknown>>();
  if (!monthlyRow || !await validateRunnerAccount(database, monthlyRow, scope.workspaceId, scope.ownerSubject)) return null;
  const perRunAccountIds: string[] = [];
  const previousOperationKeys: string[] = [];
  for (let attemptNumber = 0; attemptNumber <= validated.grant.maxRetries; attemptNumber += 1) {
    const attempt: RunnerAttemptState = freeze({
      attemptNumber,
      previousOutcome: attemptNumber === 0 ? "none" : "failed_retryable",
      previousOperationKeys: [...previousOperationKeys],
    });
    const operationKey = await deriveRunnerOperationKey({
      workspaceId: scope.workspaceId,
      principalSubject: scope.ownerSubject,
      grant: validated.grant,
      attempt,
    });
    previousOperationKeys.push(operationKey);
    const accountId = deriveRunnerPerRunAccountId({
      workspaceId: scope.workspaceId,
      principalSubject: scope.ownerSubject,
      grantId,
      providerId: validated.grant.providerId,
      scopeId: validated.grant.scopeId,
      attemptNumber,
      operationKey,
    });
    const row = await database.prepare(
      "SELECT * FROM runner_budget_accounts WHERE id=? AND workspace_id=? LIMIT 1",
    ).bind(accountId, scope.workspaceId).first<Record<string, unknown>>();
    if (!row || !await validateRunnerAccount(database, row, scope.workspaceId, scope.ownerSubject)) return null;
    perRunAccountIds.push(accountId);
  }
  return freeze({
    grant: validated.grant,
    monthlyAccountId,
    perRunAccountIds: Object.freeze(perRunAccountIds),
  });
}

async function validateRunnerAccount(
  database: D1Database,
  row: Record<string, unknown>,
  workspaceId: string,
  ownerSubject: string,
): Promise<boolean> {
  const createdByGrantId = String(row.created_by_grant_id ?? "");
  const creator = await readValidatedRunnerGrant(database, workspaceId, ownerSubject, createdByGrantId, false);
  if (!creator) return false;
  const scope = row.scope;
  const period = row.period === null ? null : String(row.period);
  const attemptNumber = row.attempt_number === null ? null : Number(row.attempt_number);
  const operationKey = row.operation_key === null ? null : String(row.operation_key);
  const maxCostMinor = Number(row.max_cost_minor);
  const createdAt = Number(row.created_at);
  const accountId = String(row.id ?? "");
  if (
    row.workspace_id !== workspaceId || row.owner_subject !== ownerSubject
    || row.provider_id !== creator.grant.providerId || row.scope_id !== creator.grant.scopeId
    || row.currency !== creator.grant.currency
    || row.authority_command_id !== creator.row.authority_command_id
    || row.audit_event_id !== creator.row.audit_event_id
    || !positiveOrZeroSafe(maxCostMinor) || !positiveSafe(createdAt)
  ) return false;
  const expectedId = scope === "runner_monthly" && period
    ? deriveRunnerMonthlyAccountId({
        workspaceId, principalSubject: ownerSubject, providerId: creator.grant.providerId,
        scopeId: creator.grant.scopeId, period,
      })
    : scope === "runner_per_run" && attemptNumber !== null && operationKey
      ? deriveRunnerPerRunAccountId({
          workspaceId, principalSubject: ownerSubject, grantId: createdByGrantId,
          providerId: creator.grant.providerId, scopeId: creator.grant.scopeId,
          attemptNumber, operationKey,
        })
      : null;
  if (
    !expectedId || accountId !== expectedId
    || (scope === "runner_monthly" && maxCostMinor > creator.grant.monthlyCostMinor)
    || (scope === "runner_per_run" && maxCostMinor !== creator.grant.perRunCostMinor)
  ) return false;
  const accountDigest = await digest({
    schema: "runner-budget-account/v1", id: accountId, workspaceId, scope,
    ownerSubject, providerId: creator.grant.providerId, scopeId: creator.grant.scopeId,
    period, attemptNumber, operationKey, currency: creator.grant.currency, maxCostMinor,
    createdByGrantId, authorityCommandId: creator.row.authority_command_id,
    auditEventId: creator.row.audit_event_id, createdAt,
  });
  return row.account_digest === accountDigest;
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
    `SELECT id, grant_id, workspace_id, operation_key, assignment_json, assignment_digest,
      reserved_units,reserved_cost_minor,currency,expires_at,created_at
     FROM enrichment_reservations WHERE id = ? AND workspace_id = ? LIMIT 1`,
  ).bind(id, workspaceId).first<{
    id: string; grant_id: string; workspace_id: string; operation_key: string;
    assignment_json: string; assignment_digest: string; reserved_units: number; reserved_cost_minor: number;
    currency: string; expires_at: number; created_at: number;
  }>();
  if (!row) return null;
  try {
    const assignment = JSON.parse(row.assignment_json) as EnrichmentReservation["assignment"];
    if (canonical(assignment) !== row.assignment_json || row.assignment_digest !== await digest(assignment)) return null;
    const grant = await readGrantBy(database, workspaceId, "id", row.grant_id);
    if (
      !grant || row.operation_key !== grant.tuple.operationKey
      || Number(row.reserved_units) !== grant.tuple.maxUnits
      || Number(row.reserved_cost_minor) !== grant.tuple.maxCostMinor
      || row.currency !== grant.tuple.currency || Number(row.expires_at) !== grant.tuple.expiresAt
    ) return null;
    if (
      !Array.isArray(assignment.evidenceAssignments)
      || assignment.evidenceAssignments.length < 1
      || assignment.evidenceAssignments.length > 100
    ) return null;
    const assignmentIds = assignment.evidenceAssignments.map((item) =>
      item && typeof item === "object" && validId((item as { assignmentId?: unknown }).assignmentId)
        ? String((item as { assignmentId: string }).assignmentId)
        : "",
    );
    if (assignmentIds.some((assignmentId) => !assignmentId) || new Set(assignmentIds).size !== assignmentIds.length) return null;
    const placeholders = assignmentIds.map(() => "?").join(",");
    const evidenceAssignments = (await database.prepare(
      `SELECT id assignment_id,prospect_id,role,workspace_id,contact_id,configuration_id,configuration_digest
       FROM contact_evidence_assignments
       WHERE workspace_id=? AND grant_id=? AND id IN (${placeholders}) ORDER BY id`,
    ).bind(workspaceId, grant.id, ...assignmentIds).all<Record<string, unknown>>()).results.map((item) => ({
      assignmentId: String(item.assignment_id),
      prospectId: String(item.prospect_id),
      role: item.role as "champion" | "economic_buyer" | "general",
      workspaceId: String(item.workspace_id),
      contactId: String(item.contact_id),
      profileConfigurationId: String(item.configuration_id),
      profileConfigurationDigest: String(item.configuration_digest),
    }));
    if (evidenceAssignments.length !== assignmentIds.length) return null;
    const expectedAssignment: EnrichmentReservation["assignment"] = {
      reservationId: row.id,
      workspaceId,
      configurationId: grant.tuple.configurationId,
      configurationDigest: grant.tuple.configurationDigest,
      operationKey: grant.tuple.operationKey,
      providerId: grant.tuple.providerId,
      providerVersion: grant.tuple.providerVersion,
      catalogRef: grant.tuple.catalogRef,
      quoteRevision: grant.tuple.quoteRevision,
      quoteUnitCostMinor: grant.tuple.quoteUnitCostMinor,
      prospectIds: [...grant.tuple.prospectIds],
      evidenceAssignments,
      operation: grant.tuple.operation,
      maxUnits: grant.tuple.maxUnits,
      maxCostMinor: grant.tuple.maxCostMinor,
      currency: grant.tuple.currency,
      expiresAt: grant.tuple.expiresAt,
    };
    if (!sameCanonical(assignment, expectedAssignment)) return null;
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
  contactSettlementAttestor: ContactSettlementAttestor | undefined,
): Promise<DurableReservationAcknowledgement> {
  if (!validId(reservationId) || !validSettlement(settlement, workspaceId)) throw new Error("invalid_enrichment_settlement");
  if (settlement.observations.some((observation) =>
    !isDefensivelyValidContactObservation(observation) || observation.workspaceId !== workspaceId
  )) throw new Error("invalid_enrichment_observation");
  const settlementIdentity = await deriveEnrichmentSettlementIdentity({
    reservationId,
    terminalState: settlement.state,
    terminalReason: settlement.reason,
    documentedUnits: settlement.documentedUnits,
    documentedCostMinor: settlement.documentedCostMinor,
    observations: settlement.observations,
  });
  if (settlement.settlementDigest !== settlementIdentity.settlementDigest) throw new Error("invalid_enrichment_settlement");
  const settlementBindings = new Map(
    settlementIdentity.observationBindings.map((binding) => [binding.observationId, binding] as const),
  );
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
  const requiresContactAttestation = settlement.observations.some((observation) =>
    observation.verificationClass === "mailbox_verified" || observation.verificationClass === "source_verified"
  );
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
      || (requiresContactAttestation && !await verifyPersistedContactSettlement(
        database,
        contactSettlementAttestor,
        workspaceId,
        reservationId,
      ))
    ) throw new Error("enrichment_settlement_conflict");
    return freeze({
      kind: "durably_recorded", reservationId, terminalState: latest.state, terminalReason: settlement.reason,
      settlementDigest: latest.settlement_digest, observationIds, durableRevision: Number(latest.durable_revision),
    });
  }
  if (latest.state !== "invoking" && latest.state !== "needs_reconciliation") throw new Error("enrichment_settlement_unavailable");
  const durableRevision = Number(latest.durable_revision) + 1;
  const observationIds = settlement.observations.map((observation) => observation.id);
  const acknowledgementDigest = await digest({
    schema: "enrichment-reservation-event/v1", reservationId, durableRevision, state: settlement.state,
    reason: settlement.reason, settlementDigest: settlement.settlementDigest,
    documentedUnits: settlement.documentedUnits, documentedCostMinor: settlement.documentedCostMinor, observationIds,
  });
  const strongReceiptBindings: ContactSettlementReceiptBinding[] = [];
  for (const observation of settlement.observations) {
    if (observation.verificationClass !== "mailbox_verified" && observation.verificationClass !== "source_verified") continue;
    const assignmentContext = observation.assignmentContext;
    const verification = observation.verificationAuthority;
    const binding = settlementBindings.get(observation.id);
    if (
      !assignmentContext || !verification || !binding?.verificationReceiptDigest
      || !observation.providerId || !observation.providerVersion || !observation.catalogRef
    ) throw new Error("enrichment_observation_receipt_unavailable");
    strongReceiptBindings.push({
      assignmentId: assignmentContext.assignmentId,
      prospectId: assignmentContext.prospectId,
      contactId: observation.contactId,
      role: assignmentContext.role,
      configurationId: observation.profileConfigurationId,
      configurationDigest: observation.profileConfigurationDigest,
      providerId: observation.providerId,
      providerVersion: observation.providerVersion,
      catalogRef: observation.catalogRef,
      quoteRevision: assignmentContext.quoteRevision,
      verifierId: verification.verifierId,
      verifierVersion: verification.verifierVersion,
      requestDigest: verification.requestDigest,
      verdictReference: verification.verdictReference,
      verdictDigest: verification.verdictDigest,
      observationId: observation.id,
      observationDigest: binding.observationDigest,
      receiptDigest: binding.verificationReceiptDigest,
      kind: observation.kind,
      verificationClass: observation.verificationClass,
      method: observation.method as ContactSettlementReceiptBinding["method"],
    });
  }
  let contactAttestation: ContactSettlementAttestation | null = null;
  if (strongReceiptBindings.length > 0) {
    if (!isBoundContactSettlementAttestor(contactSettlementAttestor)) throw new Error("enrichment_contact_attestor_unavailable");
    const material = buildContactSettlementAttestationMaterial({
      workspaceId,
      reservationId,
      grantId: reservation.grant_id,
      durableRevision,
      terminalReason: settlement.reason as "completed" | "partial",
      settlementDigest: settlement.settlementDigest,
      acknowledgementDigest,
      documentedUnits: settlement.documentedUnits,
      documentedCostMinor: settlement.documentedCostMinor,
      receipts: strongReceiptBindings,
    });
    contactAttestation = material ? await contactSettlementAttestor.sign(material) : null;
    if (!contactAttestation) throw new Error("enrichment_contact_attestation_failed");
  }
  const receiptStatements: D1PreparedStatement[] = [];
  const observationStatements: D1PreparedStatement[] = [];
  for (const observation of settlement.observations) {
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
    const settlementBinding = settlementBindings.get(observation.id);
    if (!settlementBinding) throw new Error("invalid_enrichment_settlement");
    const observationDigest = settlementBinding.observationDigest;
    const contactPointDigest = await digest({ schema: "contact-point/v1", kind: observation.kind, normalizedValue: observation.normalizedValue });
    const excerptDigest = await digest({ schema: "contact-evidence-excerpt/v1", excerpt: observation.provenance.excerpt });
    const verification = observation.verificationAuthority;
    const receiptDigest = settlementBinding.verificationReceiptDigest;
    if (
      (observation.verificationClass === "mailbox_verified" || observation.verificationClass === "source_verified")
      && (!receiptDigest || !observation.providerId || !observation.providerVersion || !observation.catalogRef)
    ) throw new Error("enrichment_observation_receipt_unavailable");
    const receiptId = receiptDigest ? `cvr_${receiptDigest.slice(0, 24)}` : null;
    if (verification && receiptDigest && receiptId) {
      receiptStatements.push(database.prepare(
        `INSERT INTO contact_verification_receipts (
          id,workspace_id,reservation_id,grant_id,assignment_id,prospect_id,contact_id,role,
          configuration_id,configuration_digest,provider_id,provider_version,catalog_ref,quote_revision,
          verifier_id,verifier_version,request_digest,verdict_reference,verdict_digest,observation_id,kind,
          contact_point_digest,verification_class,method,retrieved_at,observed_at,verified_at,content_hash,
          receipt_digest,attestation_key_id,settlement_material_digest,settlement_attestation_tag,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        receiptId, workspaceId, reservationId, reservation.grant_id, assignmentContext.assignmentId,
        assignmentContext.prospectId, observation.contactId, assignmentContext.role,
        observation.profileConfigurationId, observation.profileConfigurationDigest,
        observation.providerId, observation.providerVersion, observation.catalogRef, assignmentContext.quoteRevision,
        verification!.verifierId, verification!.verifierVersion, verification!.requestDigest,
        verification!.verdictReference, verification!.verdictDigest, observation.id, observation.kind,
        contactPointDigest, observation.verificationClass, observation.method, observation.provenance.retrievedAt,
        observation.observedAt, observation.verifiedAt, observation.provenance.contentHash, receiptDigest,
        observation.verificationClass === "mailbox_verified" || observation.verificationClass === "source_verified"
          ? contactAttestation!.keyId
          : null,
        observation.verificationClass === "mailbox_verified" || observation.verificationClass === "source_verified"
          ? contactAttestation!.materialDigest
          : null,
        observation.verificationClass === "mailbox_verified" || observation.verificationClass === "source_verified"
          ? contactAttestation!.tag
          : null,
        now,
      ));
    }
    observationStatements.push(database.prepare(
      `INSERT INTO contact_point_observations (
        id, workspace_id, assignment_id, contact_id, configuration_id, configuration_digest, kind,
        contact_point_digest, contact_point_reference, verification_class, confidence_basis_points, method,
        source_reference, excerpt_digest, object_reference, content_hash, retrieved_at, observed_at, verified_at,
        provider_id, provider_version, catalog_ref, verifier_id, verifier_version, verdict_reference, verdict_digest,
        verification_receipt_id, parent_observation_id, observation_digest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      observation.id, workspaceId, assignment.id, observation.contactId, observation.profileConfigurationId,
      observation.profileConfigurationDigest, observation.kind, contactPointDigest, `contact-point:${contactPointDigest}`,
      observation.verificationClass, Math.round(observation.confidence * 10_000), observation.method,
      observation.provenance.sourceReference, excerptDigest, observation.provenance.objectReference, observation.provenance.contentHash,
      observation.provenance.retrievedAt, observation.observedAt, observation.verifiedAt,
      observation.providerId, observation.providerVersion, observation.catalogRef,
      observation.verificationAuthority?.verifierId ?? null, observation.verificationAuthority?.verifierVersion ?? null,
      observation.verificationAuthority?.verdictReference ?? null, observation.verificationAuthority?.verdictDigest ?? null,
      receiptId, observation.lineage.parentObservationId, observationDigest, now,
    ));
  }
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
    const results = await database.batch([...receiptStatements, ...observationStatements, event]);
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
      && (!requiresContactAttestation || await verifyPersistedContactSettlement(
        database,
        contactSettlementAttestor,
        workspaceId,
        reservationId,
      ))
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
    || (requiresContactAttestation && !await verifyPersistedContactSettlement(
      database,
      contactSettlementAttestor,
      workspaceId,
      reservationId,
    ))
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
    && (value.state !== "released" || (
      value.documentedUnits === 0
      && value.documentedCostMinor === 0
      && value.observations.length === 0
    ))
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
