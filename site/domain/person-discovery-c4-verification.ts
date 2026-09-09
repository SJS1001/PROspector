import { bindContactEvidenceVerifier } from "./contact-evidence";
import { persistPersonDiscoveryC4ContactEligibilitySnapshot } from "./contact-eligibility-persistence";
import { bindContactProviderPort } from "./contact-provider-port";
import { bindContactSettlementAttestor, type ContactSettlementAttestor } from "./contact-settlement-attestor";
import { createD1ContactsCommandService } from "./contacts-command-service";
import { canonicalDigest } from "./enrichment-grant-issuance";
import { personDiscoveryC4Enabled } from "./person-discovery-c4-acceptance";
import { validateSameOriginMutation } from "./request-security";

const PROVIDER = Object.freeze({
  providerId: "synthetic-local-verification",
  providerVersion: "v1",
  catalogRef: "person-discovery-c4",
});
const SYNTHETIC_KEY = "person-discovery-c4-attestation-key-v1";

type Bindings = Readonly<{
  PROSPECTOR_PERSON_DISCOVERY_C4?: unknown;
  TRUSTED_IDENTITY_PROVIDER?: unknown;
  LOCAL_DEMO?: unknown;
}>;

type Scope = Readonly<{ workspaceId: string; principalSubject: string }>;
type IntentAuthority = Readonly<{
  intentId: string;
  channel: "email" | "phone";
  prospectId: string;
  prospectRevision: number;
  contactId: string;
  contactRevision: number;
  configurationId: string;
  configurationDigest: string;
  configurationRevision: number;
}>;

/**
 * The only verification-intent consumer in the local acceptance lane. It
 * derives every enrichment binding from the durable intent and its current
 * discovery authority, then delegates grant, reservation, provider-port,
 * evidence, settlement, and ContactReady projection to the canonical Phase 5
 * services. The module is dynamically excluded from production builds.
 */
export async function consumePersonDiscoveryC4VerificationIntent(
  request: Request,
  bindings: Bindings,
  database: D1Database,
  scope: Scope,
  command: Readonly<{ relevanceId: string; channel: "email" | "phone" }>,
) {
  return consumeVerificationIntent(request, bindings, database, scope, command, "completed", true);
}

/** Test-only uncertainty probe for this already DEV-only synthetic module. */
export async function consumePersonDiscoveryC4UncertainVerificationIntentForTest(
  request: Request,
  bindings: Bindings,
  database: D1Database,
  scope: Scope,
  command: Readonly<{ relevanceId: string; channel: "email" | "phone" }>,
) {
  if (!import.meta.env.DEV) return blocked("capability_unavailable");
  return consumeVerificationIntent(request, bindings, database, scope, command, "ambiguous", true);
}

/** Simulates the process ending after durable settlement but before projection. */
export async function settlePersonDiscoveryC4VerificationIntentForTest(
  request: Request,
  bindings: Bindings,
  database: D1Database,
  scope: Scope,
  command: Readonly<{ relevanceId: string; channel: "email" | "phone" }>,
) {
  if (!import.meta.env.DEV) return blocked("capability_unavailable");
  return consumeVerificationIntent(request, bindings, database, scope, command, "completed", false);
}

async function consumeVerificationIntent(
  request: Request,
  bindings: Bindings,
  database: D1Database,
  scope: Scope,
  command: Readonly<{ relevanceId: string; channel: "email" | "phone" }>,
  syntheticOutcome: "completed" | "ambiguous",
  projectEligibility: boolean,
) {
  if (!personDiscoveryC4Enabled(request, bindings)) return blocked("capability_unavailable");
  if (validateSameOriginMutation(request, "person-discovery-c4-verification", 1024) !== null) {
    return blocked("capability_unavailable");
  }
  const authority = await loadCurrentIntentAuthority(database, scope, command);
  if (!authority) return blocked("verification_intent_unavailable");
  const existing = await existingProjection(database, scope, authority);
  if (existing) return Object.freeze({ kind: "verified" as const, state: "ContactReady" as const, eligible: true, replayed: true });

  const now = Date.now();
  const attestor = await createPersonDiscoveryC4SettlementAttestor();
  const contentHash = await canonicalDigest({ schema: "c4-verification-content/v1", intentId: authority.intentId });
  await ensureSyntheticQuote(database, scope.workspaceId, authority.intentId, now);

  const port = bindContactProviderPort(PROVIDER, async (assignment) => {
    if (syntheticOutcome === "ambiguous") {
      return Object.freeze({ kind: "ambiguous" as const, reservationId: assignment.reservationId, operationKey: assignment.operationKey });
    }
    const binding = assignment.evidenceAssignments.find((item) =>
      item.prospectId === authority.prospectId && item.contactId === authority.contactId
    );
    if (!binding) throw new Error("c4_verification_assignment_missing");
    const value = authority.channel === "email" ? "verified@example.invalid" : "+15555550199";
    return Object.freeze({
      kind: "completed" as const,
      reservationId: assignment.reservationId,
      operationKey: assignment.operationKey,
      documentedUnits: 1,
      documentedCostMinor: 0,
      evidence: Object.freeze([Object.freeze({
        id: `c4-observation-${authority.intentId}`,
        assignmentId: binding.assignmentId,
        prospectId: binding.prospectId,
        workspaceId: binding.workspaceId,
        contactId: binding.contactId,
        profileConfigurationId: binding.profileConfigurationId,
        profileConfigurationDigest: binding.profileConfigurationDigest,
        kind: authority.channel,
        value,
        confidence: 1,
        provenance: Object.freeze({
          sourceReference: `synthetic:c4:verification:${authority.intentId}`,
          excerpt: "Synthetic verification evidence produced locally without network access.",
          objectReference: `synthetic:c4:object:${authority.intentId}`,
          contentHash,
          retrievedAt: now - 2,
        }),
        observedAt: now,
      })]),
    });
  });
  const verifier = bindContactEvidenceVerifier({ verifierId: "synthetic-c4-verifier", verifierVersion: "v1" }, async () => Object.freeze({
    observationId: `c4-observation-${authority.intentId}`,
    workspaceId: authority.workspaceId,
    contactId: authority.contactId,
    profileConfigurationId: authority.configurationId,
    profileConfigurationDigest: authority.configurationDigest,
    kind: authority.channel,
    normalizedValue: authority.channel === "email" ? "verified@example.invalid" : "+15555550199",
    contentHash,
    verificationClass: authority.channel === "email" ? "mailbox_verified" as const : "source_verified" as const,
    method: authority.channel === "email" ? "mailbox_verification" as const : "authoritative_source_reconfirmed" as const,
    verifiedAt: now - 1,
    providerId: PROVIDER.providerId,
    providerVersion: PROVIDER.providerVersion,
    catalogRef: PROVIDER.catalogRef,
    verdictReference: `synthetic:c4:verdict:${authority.intentId}`,
    verdictDigest: await canonicalDigest({ schema: "c4-verification-verdict/v1", intentId: authority.intentId }),
  }));
  const service = createD1ContactsCommandService({ database, providerPort: port, contactEvidenceVerifier: verifier, contactSettlementAttestor: attestor, now: () => now });
  const grant = await service.createGrant(scope, {
    prospectId: authority.prospectId,
    expectedProspectRevision: authority.prospectRevision,
    idempotencyKey: `c4-verify-grant-${authority.intentId}`,
  });
  if (!isGrant(grant)) return blocked("grant_unavailable");
  await ensureReservationInputs(database, authority, grant.grantId, now);
  const terminal = await existingTerminalOperation(database, scope.workspaceId, grant.grantId);
  if (terminal?.state === "needs_reconciliation") return blocked("verification_unavailable");
  const operation = terminal?.state === "settled"
    ? Object.freeze({ kind: "operation" as const, status: "settled" as const, operationId: terminal.operationId })
    : await service.runGrantedOperation(scope, { grantId: grant.grantId });
  if (!isSettled(operation)) return blocked("verification_unavailable");
  if (!projectEligibility) return Object.freeze({ kind: "settled_for_test" as const, operationId: operation.operationId });
  const projected = await persistPersonDiscoveryC4ContactEligibilitySnapshot(request, bindings, database, attestor, {
    ownerSubject: scope.principalSubject,
    workspaceId: scope.workspaceId,
    reservationId: operation.operationId,
    prospectId: authority.prospectId,
    contactId: authority.contactId,
    configurationId: authority.configurationId,
    configurationDigest: authority.configurationDigest,
    projectedAt: now + 1,
  });
  if (projected.kind !== "persisted" || projected.snapshot.state !== "ContactReady" || !projected.snapshot.eligible) {
    return blocked("projection_unavailable");
  }
  return Object.freeze({ kind: "verified" as const, state: "ContactReady" as const, eligible: true, replayed: false });
}

async function existingTerminalOperation(database: D1Database, workspaceId: string, grantId: string) {
  const row = await database.prepare(`SELECT reservation.id operation_id,event.state
    FROM enrichment_reservations reservation
    JOIN enrichment_reservation_events event ON event.reservation_id=reservation.id AND event.workspace_id=reservation.workspace_id
    WHERE reservation.workspace_id=? AND reservation.grant_id=?
      AND event.durable_revision=(SELECT MAX(latest.durable_revision) FROM enrichment_reservation_events latest WHERE latest.reservation_id=reservation.id)
    LIMIT 1`).bind(workspaceId, grantId).first<Record<string, unknown>>();
  if (!row || typeof row.operation_id !== "string") return null;
  if (row.state !== "settled" && row.state !== "needs_reconciliation") return null;
  return Object.freeze({ operationId: row.operation_id, state: row.state });
}

export async function createPersonDiscoveryC4SettlementAttestor(): Promise<ContactSettlementAttestor> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SYNTHETIC_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const attestor = bindContactSettlementAttestor({ active: { keyId: "person-discovery-c4", key }, verificationOnly: [] });
  if (!attestor) throw new Error("c4_attestor_unavailable");
  return attestor;
}

async function loadCurrentIntentAuthority(database: D1Database, scope: Scope, command: { relevanceId: string; channel: string }): Promise<(IntentAuthority & { workspaceId: string }) | null> {
  const row = await database.prepare(`SELECT intent.id intent_id,intent.channel,relevance.prospect_id,relevance.contact_id,
      prospect.revision prospect_revision,contact.revision contact_revision,cfg.id configuration_id,
      cfg.digest configuration_digest,cfg.revision configuration_revision
    FROM contact_verification_intents intent
    JOIN prospect_contact_role_relevance relevance ON relevance.id=intent.relevance_id AND relevance.workspace_id=intent.workspace_id
    JOIN person_discovery_owner_decisions decision ON decision.id=relevance.decision_id AND decision.workspace_id=relevance.workspace_id AND decision.contact_id=relevance.contact_id
    JOIN person_discovery_runs run ON run.id=decision.run_id AND run.workspace_id=decision.workspace_id
    JOIN workspaces workspace ON workspace.id=intent.workspace_id AND workspace.owner_subject=? AND workspace.revision=run.workspace_revision
    JOIN profile_prospects prospect ON prospect.id=relevance.prospect_id AND prospect.workspace_id=relevance.workspace_id AND prospect.active=1 AND prospect.state='approved' AND prospect.revision=intent.prospect_revision AND prospect.revision=run.prospect_revision
    JOIN contacts contact ON contact.id=relevance.contact_id AND contact.workspace_id=relevance.workspace_id AND contact.revision=intent.contact_revision
    JOIN typed_configurations cfg ON cfg.id=run.configuration_id AND cfg.workspace_id=run.workspace_id AND cfg.active=1 AND cfg.digest=run.configuration_digest AND cfg.revision=run.configuration_revision
    WHERE intent.workspace_id=? AND intent.relevance_id=? AND intent.channel=? AND intent.intent='initial_verification'
    ORDER BY intent.created_at DESC,intent.id DESC LIMIT 1`).bind(scope.principalSubject, scope.workspaceId, command.relevanceId, command.channel).first<Record<string, unknown>>();
  if (!row || typeof row.intent_id !== "string" || (row.channel !== "email" && row.channel !== "phone")) return null;
  return Object.freeze({
    workspaceId: scope.workspaceId, intentId: row.intent_id, channel: row.channel,
    prospectId: String(row.prospect_id), prospectRevision: Number(row.prospect_revision),
    contactId: String(row.contact_id), contactRevision: Number(row.contact_revision),
    configurationId: String(row.configuration_id), configurationDigest: String(row.configuration_digest),
    configurationRevision: Number(row.configuration_revision),
  });
}

async function ensureSyntheticQuote(database: D1Database, workspaceId: string, intentId: string, now: number) {
  const quoteId = `c4-verification-quote-${intentId}`;
  const existing = await database.prepare("SELECT id FROM provider_quotes WHERE workspace_id=? AND id=? LIMIT 1")
    .bind(workspaceId, quoteId).first<{ id: string }>();
  if (existing) return;
  const latest = await database.prepare(`SELECT COALESCE(MAX(revision),0) revision FROM provider_quotes
    WHERE workspace_id=? AND provider_id=? AND provider_version=? AND catalog_ref=? AND operation='business_contact_lookup/v1'`)
    .bind(workspaceId, PROVIDER.providerId, PROVIDER.providerVersion, PROVIDER.catalogRef).first<{ revision: number }>();
  const revision = Number(latest?.revision ?? 0) + 1;
  await database.prepare(`INSERT OR IGNORE INTO provider_quotes
    (id,workspace_id,provider_id,provider_version,catalog_ref,revision,operation,currency,unit_cost_minor,quote_digest,expires_at,created_at)
    VALUES (?,?,?,?,?,?,'business_contact_lookup/v1','CAD',0,?,?,?)`)
    .bind(quoteId, workspaceId, PROVIDER.providerId, PROVIDER.providerVersion, PROVIDER.catalogRef, revision,
      await canonicalDigest({ schema: "c4-verification-quote/v1", workspaceId, intentId, revision }), now + 300_000, now).run();
}

async function ensureReservationInputs(database: D1Database, authority: IntentAuthority & { workspaceId: string }, grantId: string, now: number) {
  const assignmentId = `c4-assignment-${authority.intentId}`;
  const assignmentDigest = await canonicalDigest({ schema: "c4-intent-assignment/v1", intentId: authority.intentId, grantId, prospectId: authority.prospectId, contactId: authority.contactId, channel: authority.channel });
  await database.prepare(`INSERT OR IGNORE INTO contact_evidence_assignments
    (id,workspace_id,reservation_id,grant_id,prospect_id,contact_id,role,configuration_id,configuration_digest,provider_id,provider_version,catalog_ref,quote_revision,assignment_digest,created_at)
    SELECT ?,?,NULL,?,?,?,'general',?,?,?,?,?,grant.quote_revision,?,? FROM enrichment_grants grant
    WHERE grant.id=? AND grant.workspace_id=?`).bind(
      assignmentId, authority.workspaceId, grantId, authority.prospectId, authority.contactId,
      authority.configurationId, authority.configurationDigest, PROVIDER.providerId, PROVIDER.providerVersion,
      PROVIDER.catalogRef, assignmentDigest, now, grantId, authority.workspaceId,
    ).run();
  for (const [scope, entityId] of Object.entries({ grant: grantId, profile: authority.configurationId, workspace: authority.workspaceId, provider: PROVIDER.providerId })) {
    const accountId = `enrichment:${authority.workspaceId.length}:${authority.workspaceId}:${scope}:${entityId.length}:${entityId}`;
    const maxUnits = scope === "grant" ? 1 : 100;
    await database.prepare(`INSERT OR IGNORE INTO enrichment_budget_accounts
      (id,workspace_id,authority_type,scope,entity_id,currency,actual_units,reserved_units,max_units,actual_cost_minor,reserved_cost_minor,max_cost_minor,revision,created_at,updated_at)
      VALUES (?,?,'enrichment',?,?,'CAD',0,0,?,0,0,0,1,?,?)`).bind(accountId, authority.workspaceId, scope, entityId, maxUnits, now, now).run();
  }
}

async function existingProjection(database: D1Database, scope: Scope, authority: IntentAuthority) {
  return database.prepare(`SELECT snapshot.id FROM contact_eligibility_snapshots snapshot
    JOIN contact_point_observations observation ON observation.id=json_extract(snapshot.observation_ids_json,'$[0]') AND observation.workspace_id=snapshot.workspace_id
    JOIN contact_evidence_assignments assignment ON assignment.id=observation.assignment_id AND assignment.workspace_id=observation.workspace_id
    WHERE snapshot.workspace_id=? AND snapshot.prospect_id=? AND snapshot.contact_id=? AND snapshot.configuration_id=? AND snapshot.configuration_digest=?
      AND snapshot.state='ContactReady' AND snapshot.eligible=1 AND assignment.id=? LIMIT 1`)
    .bind(scope.workspaceId, authority.prospectId, authority.contactId, authority.configurationId, authority.configurationDigest, `c4-assignment-${authority.intentId}`).first();
}

function isGrant(value: unknown): value is { kind: "grant"; status: "created" | "replayed"; grantId: string } {
  return !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "grant" && ["created", "replayed"].includes(String((value as { status?: unknown }).status)) && typeof (value as { grantId?: unknown }).grantId === "string";
}
function isSettled(value: unknown): value is { kind: "operation"; status: "settled"; operationId: string } {
  return !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "operation" && (value as { status?: unknown }).status === "settled" && typeof (value as { operationId?: unknown }).operationId === "string";
}
function blocked(reason: string) { return Object.freeze({ kind: "blocked" as const, reason }); }
