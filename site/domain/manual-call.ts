import { DEFAULT_CONTACT_FRESHNESS_MS, recheckForClickToCall } from "./contact-eligibility";
import { canonicalDigest } from "./enrichment-grant-issuance";
import {
  createManualCallDecisionService,
  ManualCallDecisionError,
  type ManualCallAuthorityRepository,
  type ManualCallAuthoritySnapshot,
  type ManualCallOutcomeRecord,
  type ManualCallOutcomeRepository,
} from "./manual-call-decision-service";
import { createD1OutreachRepository, type OutreachPackageSnapshot } from "./outreach-repository";
import { createOutreachStopRules } from "./outreach-stop-rules";
import { companyDigest, normalizeE164Phone, phoneDigest } from "./suppression";

/**
 * Manual-call flow backed by D1 (06-07, local). It composes the existing
 * decision service with D1 authority and outcome repositories.
 *
 * - The phone action is disabled until 06-13 Task 3 owner UAT. No result ever
 *   carries a callable target, and activation always refuses.
 * - Phone verification and freshness come only from an injected eligibility
 *   port. Production wires `blockedClickToCallEligibilityPort`, which calls the
 *   Phase 5 `recheckForClickToCall` and therefore always refuses.
 * - do_not_call writes its suppression through the shared stop rule before the
 *   outcome record. A failed outcome write leaves the prohibition in place.
 * - Outcomes are stored as an `authority_commands` row plus an `audit_events`
 *   row in one batch. No migration, message, send, dial, or provider call.
 * - The decision service accepts synthetic authority only, so this adapter is
 *   local and synthetic until hosted acceptance.
 */

export type ManualCallPhoneRecheckInput = Readonly<{
  workspaceId: string;
  prospectId: string;
  contactId: string;
  phoneObservationId: string;
  contactPointDigest: string;
  now: number;
}>;

export type ManualCallPhoneRecheck = Readonly<{
  blocked: boolean;
  state: string;
  freshUntil: number | null;
  /** E.164 value; accepted only when its contact-point digest matches D1. */
  normalizedPhone: string | null;
}>;

export type ManualCallEligibilityPort = Readonly<{
  recheckForClickToCall(input: ManualCallPhoneRecheckInput): Promise<ManualCallPhoneRecheck> | ManualCallPhoneRecheck;
}>;

export type ManualCallScope = Readonly<{ workspaceId: string; ownerSubject: string; now?: () => number }>;
export type ManualCallTarget = Readonly<{ packageApprovalId: string; phoneObservationId: string }>;

/** Production port: the Phase 5 recheck, which always refuses click-to-call. */
export const blockedClickToCallEligibilityPort: ManualCallEligibilityPort = Object.freeze({
  recheckForClickToCall(input: ManualCallPhoneRecheckInput): ManualCallPhoneRecheck {
    let state = "NonContactable";
    try {
      const recheck = recheckForClickToCall(input);
      state = recheck.eligibility.state;
    } catch {
      // Any failure is a refusal.
    }
    return Object.freeze({ blocked: true, state, freshUntil: null, normalizedPhone: null });
  },
});

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const ZERO_EFFECTS = Object.freeze({ providerInvocations: 0, dialInvocations: 0, uriInvocations: 0 });
const COMMAND_TYPE = "manual_call.outcome";
const AUDIT_ACTION = "manual_call.outcome_recorded";
const SUBJECT_TYPE = "manual_call_outcome";

type Principal = Readonly<{ workspaceId: string; subject: string }>;
type LoadInput = Parameters<ManualCallAuthorityRepository["loadCurrentAuthority"]>[0];
type CommitInput = Parameters<ManualCallOutcomeRepository["commitCurrentOutcome"]>[0];
type DecisionService = ReturnType<typeof createManualCallDecisionService>;

type AuthorityRow = {
  approval_id: string; package_version_id: string; approval_artifact_digest: string; approval_digest: string; expires_at: number;
  revoked: number; superseded: number; version_id: string; version: number; artifact_digest: string; call_script_digest: string;
  snapshot_json: string; prospect_id: string; contact_id: string; prospect_revision: number; prospect_state: string;
  prospect_active: number; lifecycle_ready: number; contact_revision: number; identity_digest: string; eligibility_id: string;
  snapshot_digest: string; eligibility_state: string; eligible: number; eligibility_current: number; command_count: number;
};

type ObservationRow = {
  id: string; contact_id: string; kind: string; contact_point_digest: string; verification_class: string; verified_at: number | null;
};

/** D1 authority snapshot for the decision service. Returns null when out of scope. */
export function createD1ManualCallAuthorityRepository(
  database: D1Database,
  scopeValue: ManualCallScope,
  options: Readonly<{ eligibility: ManualCallEligibilityPort }>,
): ManualCallAuthorityRepository & Readonly<{ resolveNumber(authority: ManualCallAuthoritySnapshot): Promise<string | null> }> {
  const scope = captureScope(scopeValue);
  const eligibility = capturePort(options?.eligibility);
  const clock = scopeValue.now ?? Date.now;
  const outreach = createD1OutreachRepository(database, { workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject });

  const recheck = async (input: ManualCallPhoneRecheckInput): Promise<ManualCallPhoneRecheck | null> => {
    try {
      const value = await eligibility.recheckForClickToCall(Object.freeze({ ...input }));
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  };

  const matchingNumber = async (value: ManualCallPhoneRecheck | null, contactPointDigest: string) => {
    const normalized = normalizeE164Phone(value?.normalizedPhone);
    if (!normalized) return null;
    return (await phoneDigest(normalized)) === contactPointDigest ? normalized : null;
  };

  const loadRows = async (input: LoadInput) => {
    if (!input || input.workspaceId !== scope.workspaceId || input.ownerSubject !== scope.ownerSubject
      || !validId(input.packageApprovalId) || !validId(input.phoneObservationId)) return null;
    const row = await database.prepare(
      `SELECT pa.id approval_id,pa.package_version_id,pa.artifact_digest approval_artifact_digest,pa.approval_digest,pa.expires_at,
         EXISTS (SELECT 1 FROM outreach_approval_revocations r WHERE r.package_approval_id=pa.id AND r.workspace_id=pa.workspace_id) revoked,
         EXISTS (SELECT 1 FROM outreach_package_versions later WHERE later.package_id=pv.package_id AND later.workspace_id=pv.workspace_id AND later.version>pv.version) superseded,
         pv.id version_id,pv.version,pv.artifact_digest,pv.call_script_digest,pv.snapshot_json,
         op.prospect_id,op.contact_id,p.revision prospect_revision,p.state prospect_state,p.active prospect_active,
         EXISTS (SELECT 1 FROM customer_profiles cp
           JOIN market_plays mp ON mp.id=cp.play_id AND mp.workspace_id=cp.workspace_id
           JOIN products product ON product.id=mp.product_id AND product.workspace_id=mp.workspace_id
           JOIN companies company ON company.id=product.company_id AND company.workspace_id=product.workspace_id
           WHERE cp.id=op.profile_id AND cp.workspace_id=op.workspace_id AND cp.lifecycle='ready' AND mp.lifecycle='active'
             AND product.lifecycle='ready' AND company.status='active') lifecycle_ready,
         c.revision contact_revision,c.identity_digest,
         ces.id eligibility_id,ces.snapshot_digest,ces.state eligibility_state,ces.eligible,
         NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later WHERE later.workspace_id=ces.workspace_id
           AND later.contact_id=ces.contact_id AND later.prospect_id=ces.prospect_id AND later.id<>ces.id
           AND later.projected_at>=ces.projected_at) eligibility_current,
         (SELECT count(*) FROM outreach_commands cmd WHERE cmd.workspace_id=pa.workspace_id) command_count
       FROM outreach_package_approvals pa
       JOIN workspaces w ON w.id=pa.workspace_id AND w.owner_subject=?
       JOIN outreach_package_versions pv ON pv.id=pa.package_version_id AND pv.workspace_id=pa.workspace_id
       JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
       JOIN profile_prospects p ON p.id=op.prospect_id AND p.workspace_id=op.workspace_id
       JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
       JOIN contact_eligibility_snapshots ces ON ces.id=pv.contact_eligibility_snapshot_id AND ces.workspace_id=pv.workspace_id
       WHERE pa.id=? AND pa.workspace_id=? LIMIT 1`,
    ).bind(scope.ownerSubject, input.packageApprovalId, scope.workspaceId).first<AuthorityRow>();
    if (!row) return null;
    const observation = await database.prepare(
      `SELECT id,contact_id,kind,contact_point_digest,verification_class,verified_at
       FROM contact_point_observations WHERE id=? AND workspace_id=? LIMIT 1`,
    ).bind(input.phoneObservationId, scope.workspaceId).first<ObservationRow>();
    if (!observation) return null;
    return { row, observation };
  };

  const loadCurrentAuthority = async (input: LoadInput): Promise<ManualCallAuthoritySnapshot | null> => {
    const loaded = await loadRows(input);
    if (!loaded) return null;
    const { row, observation } = loaded;
    let snapshot: OutreachPackageSnapshot;
    try {
      snapshot = JSON.parse(row.snapshot_json) as OutreachPackageSnapshot;
    } catch {
      return null;
    }
    const now = clock();
    if (!Number.isSafeInteger(now) || now <= 0) return null;
    const current = await recheck({
      workspaceId: scope.workspaceId, prospectId: row.prospect_id, contactId: row.contact_id,
      phoneObservationId: observation.id, contactPointDigest: observation.contact_point_digest, now,
    });
    const ready = !!current && current.blocked === false && current.state === "ContactReady"
      && Number.isSafeInteger(current.freshUntil) && !!await matchingNumber(current, observation.contact_point_digest)
      && observation.kind === "phone" && observation.verification_class === "source_verified"
      && Number.isSafeInteger(observation.verified_at);
    const freshUntil = ready
      ? Math.min(Number(current?.freshUntil), Number(observation.verified_at) + DEFAULT_CONTACT_FRESHNESS_MS.verifiedBusinessPhone)
      : 0;
    const suppressionSubjects = [
      { kind: "e164_phone" as const, digest: observation.contact_point_digest, channel: "phone" as const },
      { kind: "contact" as const, digest: row.identity_digest, channel: "phone" as const },
      { kind: "company" as const, digest: await companyDigest(scope.workspaceId), channel: "phone" as const },
    ];
    let suppressed = true;
    try {
      suppressed = await outreach.isSuppressed(suppressionSubjects);
    } catch {
      suppressed = true;
    }
    return {
      dataClassification: "synthetic",
      workspaceId: scope.workspaceId,
      ownerSubject: scope.ownerSubject,
      authorityRevision: Number(row.command_count) + 1,
      packageVersion: {
        id: row.version_id,
        version: Number(row.version),
        artifactDigest: row.artifact_digest,
        callScriptDigest: row.call_script_digest,
        snapshot,
      },
      packageApproval: {
        id: row.approval_id,
        packageVersionId: row.package_version_id,
        artifactDigest: row.approval_artifact_digest,
        approvalDigest: row.approval_digest,
        expiresAt: Number(row.expires_at),
        // A superseded Package Version no longer carries a current approval.
        revoked: Number(row.revoked) === 1 || Number(row.superseded) === 1,
      },
      prospect: {
        id: row.prospect_id,
        revision: Number(row.prospect_revision),
        state: row.prospect_state as ManualCallAuthoritySnapshot["prospect"]["state"],
        // A paused or archived Profile chain makes the prospect unavailable.
        active: Number(row.prospect_active) === 1 && Number(row.lifecycle_ready) === 1,
      },
      contact: {
        id: row.contact_id,
        revision: Number(row.contact_revision),
        status: row.eligibility_state === "NonContactable" ? "noncontactable" : "active",
      },
      contactEligibility: {
        id: row.eligibility_id,
        snapshotDigest: row.snapshot_digest,
        state: row.eligibility_state === "ContactReady" || row.eligibility_state === "NonContactable" ? row.eligibility_state : "NeedsReview",
        eligible: Number(row.eligible) === 1,
        current: Number(row.eligibility_current) === 1,
      },
      phoneObservation: {
        id: observation.id,
        contactId: observation.contact_id,
        kind: observation.kind === "phone" ? "phone" : "email",
        contactPointDigest: observation.contact_point_digest,
        verificationClass: ready ? "source_verified" : "unverified",
        status: ready ? "active" : "revoked",
        freshUntil,
      },
      suppressionSubjects,
      // Phone do_not_call reaches no email outbox work (the stop rule's phone matcher is empty).
      matchingPendingWork: [],
      suppressed,
    };
  };

  /** The digest-checked E.164 value for do_not_call, or null when the port cannot supply it. */
  const resolveNumber = async (authority: ManualCallAuthoritySnapshot) => {
    const now = clock();
    if (!Number.isSafeInteger(now) || now <= 0) return null;
    const current = await recheck({
      workspaceId: scope.workspaceId, prospectId: authority.prospect.id, contactId: authority.contact.id,
      phoneObservationId: authority.phoneObservation.id, contactPointDigest: authority.phoneObservation.contactPointDigest, now,
    });
    return matchingNumber(current, authority.phoneObservation.contactPointDigest);
  };

  return Object.freeze({ loadCurrentAuthority, resolveNumber });
}

/** D1 outcome store. do_not_call suppression commits before the outcome batch. */
export function createD1ManualCallOutcomeRepository(
  database: D1Database,
  scopeValue: ManualCallScope,
  options: Readonly<{
    authorityRepository: ReturnType<typeof createD1ManualCallAuthorityRepository>;
    currentAuthorityDigest: (authority: ManualCallAuthoritySnapshot) => Promise<string>;
  }>,
): ManualCallOutcomeRepository {
  const scope = captureScope(scopeValue);
  const clock = scopeValue.now ?? Date.now;
  const stopRules = createOutreachStopRules(database, { workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, now: clock });
  if (typeof options?.currentAuthorityDigest !== "function" || typeof options.authorityRepository?.loadCurrentAuthority !== "function") {
    throw new TypeError("invalid_manual_call_outcome_dependencies");
  }

  const findByIdempotencyKey: ManualCallOutcomeRepository["findByIdempotencyKey"] = async (input) => {
    if (!input || input.workspaceId !== scope.workspaceId || input.ownerSubject !== scope.ownerSubject || !validId(input.idempotencyKey)) return null;
    const row = await database.prepare(
      `SELECT e.detail_json FROM authority_commands cmd
       JOIN workspaces w ON w.id=cmd.workspace_id AND w.owner_subject=?
       JOIN audit_events e ON e.workspace_id=cmd.workspace_id AND e.action=? AND e.subject_type=? AND e.subject_id=cmd.subject_id
       WHERE cmd.workspace_id=? AND cmd.command_type=? AND cmd.idempotency_key=? LIMIT 1`,
    ).bind(scope.ownerSubject, AUDIT_ACTION, SUBJECT_TYPE, scope.workspaceId, COMMAND_TYPE, commandKey(input.idempotencyKey)).first<{ detail_json: string }>();
    if (!row) return null;
    try {
      return JSON.parse(row.detail_json) as ManualCallOutcomeRecord;
    } catch {
      throw new ManualCallDecisionError("stored_outcome_unreadable");
    }
  };

  const commitCurrentOutcome: ManualCallOutcomeRepository["commitCurrentOutcome"] = async (input: CommitInput) => {
    const record = input.record;
    if (record.workspaceId !== scope.workspaceId || record.actorSubject !== scope.ownerSubject) return { kind: "stale", record: null };
    const authority = await options.authorityRepository.loadCurrentAuthority({
      workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject,
      packageApprovalId: record.packageApprovalId, phoneObservationId: record.phoneObservationId,
    });
    if (!authority || authority.authorityRevision !== input.expectedAuthorityRevision
      || await options.currentAuthorityDigest(authority) !== input.expectedAuthorityDigest) return { kind: "stale", record: null };
    const doNotCall = record.outcome === "do_not_call";
    if (!doNotCall && authority.suppressed) return { kind: "suppressed", record: null };
    if (doNotCall) {
      const requirements = input.doNotCallRequirements;
      if (!requirements || requirements.requiredOrder !== "suppression_then_pending_work_cancellation_then_outcome"
        || !requirements.suppressionSubjects.some((subject) => subject.kind === "e164_phone" && subject.digest === record.contactPointDigest)) {
        return { kind: "stale", record: null };
      }
      await recordDoNotCallSuppression(authority, record);
    }

    const now = clock();
    if (!Number.isSafeInteger(now) || now <= 0) throw new ManualCallDecisionError("invalid_time");
    const commandId = `mcc_${record.operationDigest.slice(0, 32)}`;
    // Non-do-not-call outcomes re-check the append-only command count (every
    // suppression, revocation, approval and package version writes one) and
    // the prospect/contact revisions inside the insert itself.
    const guard = doNotCall ? "" : `
      AND (SELECT count(*) FROM outreach_commands oc WHERE oc.workspace_id=?)+1=?
      AND EXISTS (SELECT 1 FROM profile_prospects p WHERE p.id=? AND p.workspace_id=? AND p.revision=? AND p.state='approved' AND p.active=1)
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.id=? AND c.workspace_id=? AND c.revision=?)`;
    const guardValues = doNotCall ? [] : [
      scope.workspaceId, authority.authorityRevision,
      authority.prospect.id, scope.workspaceId, authority.prospect.revision,
      authority.contact.id, scope.workspaceId, authority.contact.revision,
    ];
    const insertCommand = database.prepare(
      `INSERT INTO authority_commands
        (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status)
       SELECT ?,?,?,?,1,?,?,?,?,?,?,'accepted'
       WHERE EXISTS (SELECT 1 FROM workspaces w WHERE w.id=? AND w.owner_subject=?)${guard}`,
    ).bind(
      commandId, scope.workspaceId, now, now, COMMAND_TYPE, commandKey(record.idempotencyKey), record.operationDigest,
      authority.authorityRevision, SUBJECT_TYPE, record.id, scope.workspaceId, scope.ownerSubject, ...guardValues,
    );
    const insertAudit = database.prepare(
      `INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at)
       SELECT ?,?,'owner',?,?,?,?,?,?
       WHERE EXISTS (SELECT 1 FROM authority_commands cmd WHERE cmd.id=? AND cmd.workspace_id=? AND cmd.operation_digest=?)
         AND NOT EXISTS (SELECT 1 FROM audit_events prior WHERE prior.id=?)`,
    ).bind(
      record.id, scope.workspaceId, scope.ownerSubject, AUDIT_ACTION, SUBJECT_TYPE, record.id, JSON.stringify(record), record.recordedAt,
      commandId, scope.workspaceId, record.operationDigest, record.id,
    );
    let inserted = false;
    try {
      const results = await database.batch([insertCommand, insertAudit]);
      inserted = Number(results?.[0]?.meta?.changes ?? 0) === 1;
    } catch {
      const winner = await findByIdempotencyKey({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, idempotencyKey: record.idempotencyKey });
      if (!winner) throw new ManualCallDecisionError("outcome_write_failed");
      return { kind: winner.operationDigest === record.operationDigest ? "replayed" : "conflict", record: winner };
    }
    const stored = await findByIdempotencyKey({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, idempotencyKey: record.idempotencyKey });
    if (!stored) return { kind: "stale", record: null };
    if (stored.operationDigest !== record.operationDigest) return { kind: "conflict", record: stored };
    return { kind: inserted ? "committed" : "replayed", record: stored };
  };

  /** Contact-scoped phone tombstone always; the E.164 tombstone when the number is resolvable. */
  const recordDoNotCallSuppression = async (authority: ManualCallAuthoritySnapshot, record: ManualCallOutcomeRecord) => {
    const contact = authority.suppressionSubjects.find((subject) => subject.kind === "contact");
    if (!contact || !DIGEST.test(contact.digest)) throw new ManualCallDecisionError("suppression_not_recorded");
    const effectiveAt = clock();
    // One source digest per subject: a stop event is unique per source event.
    const base = { channel: "phone", reason: "do_not_call", aliasDigests: [], effectiveAt };
    const contactStop = await stopRules.recordSuppressionStop({
      ...base, subject: { kind: "contact", identityDigest: contact.digest },
      sourceEventDigest: await canonicalDigest({ schema: "manual-call-do-not-call/v1", subjectKind: "contact", operationDigest: record.operationDigest }),
      idempotencyKey: `dnc-contact:${record.operationDigest.slice(0, 48)}`,
    });
    if (contactStop.kind !== "suppressed") throw new ManualCallDecisionError("suppression_not_recorded");
    const phone = await options.authorityRepository.resolveNumber(authority);
    if (!phone) return;
    const numberStop = await stopRules.recordSuppressionStop({
      ...base, subject: { kind: "e164_phone", phone },
      sourceEventDigest: await canonicalDigest({ schema: "manual-call-do-not-call/v1", subjectKind: "e164_phone", operationDigest: record.operationDigest }),
      idempotencyKey: `dnc-number:${record.operationDigest.slice(0, 48)}`,
    });
    if (numberStop.kind !== "suppressed") throw new ManualCallDecisionError("suppression_not_recorded");
  };

  return Object.freeze({ findByIdempotencyKey, commitCurrentOutcome });
}

/** Owner-scoped manual-call service. The eligibility port must be injected. */
export function createD1ManualCallService(
  database: D1Database,
  scopeValue: ManualCallScope,
  options: Readonly<{ eligibility: ManualCallEligibilityPort }>,
) {
  const scope = captureScope(scopeValue);
  const eligibility = capturePort(options?.eligibility);
  const clock = scopeValue.now ?? Date.now;
  const timedScope = Object.freeze({ ...scope, now: clock });
  const principal: Principal = Object.freeze({ workspaceId: scope.workspaceId, subject: scope.ownerSubject });
  const authorityRepository = createD1ManualCallAuthorityRepository(database, timedScope, { eligibility });
  let decisions: DecisionService | null = null;
  const outcomeRepository = createD1ManualCallOutcomeRepository(database, timedScope, {
    authorityRepository,
    currentAuthorityDigest: async (authority) => {
      if (!decisions) throw new ManualCallDecisionError("authority_unavailable");
      const decision = await decisions.decide(principal, requestFor({ packageApprovalId: authority.packageApproval.id, phoneObservationId: authority.phoneObservation.id }, authority));
      return decision.authorityDigest;
    },
  });
  decisions = createManualCallDecisionService({ authorityRepository, outcomeRepository, now: clock });
  const service = decisions;

  const projectManualCall = async (targetValue: ManualCallTarget) => {
    const target = captureTarget(targetValue);
    const authority = await authorityRepository.loadCurrentAuthority({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, ...target });
    if (!authority) throw new ManualCallDecisionError("authority_unavailable");
    const request = requestFor(target, authority);
    const decision = await service.decide(principal, request);
    return deepFreeze({
      request,
      decision,
      // Disabled until 06-13 Task 3 owner UAT, even for a current eligible decision.
      phoneAction: { enabled: false as const, reason: decision.eligible ? "owner_uat_pending" as const : "not_eligible" as const, href: null },
    });
  };

  const activatePhoneAction = async (targetValue: ManualCallTarget) => {
    await projectManualCall(targetValue);
    return deepFreeze({ kind: "refused" as const, reason: "phone_action_disabled" as const, href: null, effects: ZERO_EFFECTS });
  };

  /**
   * A reply, bounce, pause, archive or drift stop event for this contact blocks
   * follow_up. Any lookup failure blocks it too.
   */
  const followUpStopped = async (packageApprovalId: unknown) => {
    if (!validId(packageApprovalId)) return true;
    try {
      const row = await database.prepare(
        `SELECT 1 stopped FROM outreach_package_approvals pa
         JOIN outreach_package_versions pv ON pv.id=pa.package_version_id AND pv.workspace_id=pa.workspace_id
         JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
         JOIN contacts c ON c.id=op.contact_id AND c.workspace_id=op.workspace_id
         JOIN outreach_stop_events s ON s.workspace_id=pa.workspace_id
           AND s.stop_kind IN ('reply','bounce','pause','archive','high_risk_drift')
           AND ((s.subject_kind='contact' AND s.subject_digest=c.identity_digest)
             OR (s.subject_kind='exact_email' AND s.subject_digest IN (SELECT o.contact_point_digest FROM contact_point_observations o
               WHERE o.workspace_id=c.workspace_id AND o.contact_id=c.id AND o.kind='email')))
         WHERE pa.id=? AND pa.workspace_id=? LIMIT 1`,
      ).bind(packageApprovalId, scope.workspaceId).first();
      return !!row;
    } catch {
      return true;
    }
  };

  const recordOutcome = async (command: Parameters<DecisionService["recordOutcome"]>[1]) => {
    if (command && typeof command === "object" && command.outcome === "follow_up" && await followUpStopped(command.packageApprovalId)) {
      throw new ManualCallDecisionError("stale_or_ineligible");
    }
    const result = await service.recordOutcome(principal, command);
    if (result.outcome !== "do_not_call") return result;
    const stored = await outcomeRepository.findByIdempotencyKey({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, idempotencyKey: command.idempotencyKey });
    if (!stored) throw new ManualCallDecisionError("outcome_write_failed");
    const contact = await database.prepare("SELECT identity_digest FROM contacts WHERE id=? AND workspace_id=? LIMIT 1").bind(stored.contactId, scope.workspaceId).first<{ identity_digest: string }>();
    const blocked = async (kind: string, digest: string | undefined) => !!digest && !!await database.prepare(
      `SELECT 1 ok FROM outreach_suppression_tombstones WHERE workspace_id=? AND subject_kind=? AND subject_digest=? AND channel IN ('phone','all') LIMIT 1`,
    ).bind(scope.workspaceId, kind, digest).first();
    return deepFreeze({
      ...result,
      suppression: {
        contactPhoneBlocked: await blocked("contact", contact?.identity_digest),
        numberBlocked: await blocked("e164_phone", stored.contactPointDigest),
      },
    });
  };

  return Object.freeze({ projectManualCall, activatePhoneAction, recordOutcome });
}

function requestFor(target: ManualCallTarget, authority: ManualCallAuthoritySnapshot) {
  return deepFreeze({
    packageApprovalId: target.packageApprovalId,
    phoneObservationId: target.phoneObservationId,
    expectedAuthorityRevision: authority.authorityRevision,
    expectedPackageVersion: authority.packageVersion.version,
    expectedPackageArtifactDigest: authority.packageVersion.artifactDigest,
    expectedPackageApprovalDigest: authority.packageApproval.approvalDigest,
    expectedProspectRevision: authority.prospect.revision,
    expectedContactRevision: authority.contact.revision,
    expectedContactEligibilityDigest: authority.contactEligibility.snapshotDigest,
  });
}

function commandKey(idempotencyKey: string) {
  return `${COMMAND_TYPE}:${idempotencyKey}`;
}

function captureScope(value: ManualCallScope) {
  if (!value || typeof value !== "object" || !validId(value.workspaceId) || !validId(value.ownerSubject)
    || (value.now !== undefined && typeof value.now !== "function")) throw new TypeError("invalid_manual_call_scope");
  return Object.freeze({ workspaceId: value.workspaceId, ownerSubject: value.ownerSubject });
}

function capturePort(value: ManualCallEligibilityPort | undefined) {
  if (!value || typeof value.recheckForClickToCall !== "function") throw new TypeError("manual_call_eligibility_port_required");
  return value;
}

function captureTarget(value: ManualCallTarget): ManualCallTarget {
  if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "packageApprovalId,phoneObservationId"
    || !validId(value.packageApprovalId) || !validId(value.phoneObservationId)) throw new ManualCallDecisionError("invalid_input");
  return Object.freeze({ packageApprovalId: value.packageApprovalId, phoneObservationId: value.phoneObservationId });
}

function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
