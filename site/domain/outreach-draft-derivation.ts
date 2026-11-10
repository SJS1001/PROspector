import { hasCurrentDrift, matchingSuppressionRefs, readLatestContactEligibilitySnapshot } from "./contact-eligibility-persistence";
import { canonicalDigest } from "./enrichment-grant-issuance";
import { composeMessageVersionService } from "./message-version";
import { composeOutreachPackageService, createD1OutreachArtifactReader, type OutreachPackageDraft } from "./outreach-package";
import type { OutreachBinding, OutreachMessageSnapshot, OutreachRepositoryScope } from "./outreach-repository";
import { emailDigest, normalizeExactEmail, unsubscribeTokenDigest } from "./suppression";

/**
 * Outreach drafting from current evidence (06-08, local).
 *
 * Owner decision, made by the coordinator on the owner's behalf on 2026-11-10
 * and reversible: drafting is a deterministic derivation with no AI,
 * language-model or provider call. From the server's own current evidence for an approved
 * Prospect and a ready Contact it proposes the recommended angle, a
 * package-derived call script and a draft email using fixed templates.
 *
 * - The derivation input is a closed shape of identifiers, digests and
 *   revisions. It carries no excerpt, name or body, so nothing can be restated
 *   as a fact; evidence and Claim Guardrails are cited by reference only.
 * - The templates make no product or outcome claim. Claim limits are named in
 *   the call script by guardrail reference.
 * - The only raw contact value is the recipient in the email's To field, as the
 *   Message Version artifact already allows. The server stores no raw address,
 *   so the owner types it and it is accepted only when its digest equals a
 *   selected verified email point. From is the admitted owner address.
 * - Drafts are created through the existing Package and Message Version
 *   services and repository only. Nothing is approved, authorized, queued or
 *   sent; approval stays a separate owner command with its own readiness gate.
 * - Stale or ineligible evidence refuses with a reason and writes nothing.
 */

export const DRAFT_TEMPLATE_VERSION = "outreach-draft-template/v1";
export const DRAFT_TIMEZONE = "Etc/UTC";
export const DRAFT_SENDER_REFERENCE = "admitted-owner-address";

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_EVIDENCE = 64;
const MAX_GUARDRAILS = 32;
const MAX_POINTS = 8;
const MAX_CANDIDATES = 10;
const PACKAGE_ROLES = Object.freeze(["champion", "economic_buyer", "general"] as const);
const ROLE_LABELS: Readonly<Record<typeof PACKAGE_ROLES[number], string>> = Object.freeze({
  champion: "champion", economic_buyer: "economic buyer", general: "general contact",
});

type Reference = Readonly<{ id: string; digest: string }>;
type Revisioned = Readonly<{ id: string; digest: string; revision: number }>;
export type DraftContactPoint = Readonly<{ observationId: string; observationDigest: string; contactPointDigest: string; kind: "email" | "phone" }>;

/** Everything the templates may use: references, digests and revisions only. */
export type DraftEvidence = Readonly<{
  prospectId: string;
  contactId: string;
  profileId: string;
  configuration: Revisioned;
  prospectRevision: number;
  contactRevision: number;
  eligibility: Reference;
  qualification: Reference;
  reviewDecision: Reference;
  evidence: readonly Readonly<{ id: string; digest: string; sourceId: string }>[];
  sources: readonly Reference[];
  claimGuardrails: readonly Reference[];
  role: string;
  contactPoints: readonly DraftContactPoint[];
}>;

export type DraftOptions = Readonly<{ packageId: string; messageId: string; senderAddress: string; recipientAddress: string | null }>;

export type DraftMessageTemplate = Readonly<{ messageId: string; snapshot: OutreachMessageSnapshot; intendedSendAt: null; timezone: string }>;
export type DraftRefusal = Readonly<{ kind: "refused"; reasonCodes: readonly string[] }>;
export type DraftDerivation = Readonly<{
  kind: "derived";
  templateVersion: typeof DRAFT_TEMPLATE_VERSION;
  package: OutreachPackageDraft;
  messages: readonly DraftMessageTemplate[];
}> | DraftRefusal;

// ---------------------------------------------------------------------------
// Pure derivation
// ---------------------------------------------------------------------------

/**
 * Deterministic: the same evidence and options always derive the same drafts.
 * Async only because the recipient confirmation is compared by digest.
 */
export async function deriveOutreachDraft(evidence: unknown, options: unknown): Promise<DraftDerivation> {
  if (!validEvidence(evidence) || !validOptions(options)) return refused("invalid_draft_evidence");
  const reasons: string[] = [];
  if (evidence.evidence.length === 0) reasons.push("evidence_missing");
  if (evidence.claimGuardrails.length === 0) reasons.push("claim_guardrail_missing");
  const sourceIds = new Set(evidence.sources.map((source) => source.id));
  if (evidence.sources.length === 0 || evidence.evidence.some((item) => !sourceIds.has(item.sourceId))) reasons.push("source_missing");
  if (evidence.contactPoints.length === 0) reasons.push("contact_point_missing");
  if (reasons.length > 0) return refused(...reasons);

  const sender = normalizeExactEmail(options.senderAddress);
  if (!sender) return refused("sender_address_unavailable");
  const emailPoints = evidence.contactPoints.filter((point) => point.kind === "email");
  let recipient: string | null = null;
  if (options.recipientAddress !== null) {
    recipient = normalizeExactEmail(options.recipientAddress.trim());
    const confirmed = recipient ? await emailDigest(recipient) : null;
    if (!recipient || !emailPoints.some((point) => point.contactPointDigest === confirmed)) return refused("recipient_confirmation_mismatch");
  } else if (emailPoints.length > 0) {
    return refused("recipient_confirmation_required");
  }

  const role = (PACKAGE_ROLES as readonly string[]).includes(evidence.role) ? evidence.role as typeof PACKAGE_ROLES[number] : "general";
  const evidenceRefs = evidence.evidence.map((item, index) => `E${index + 1} ref ${short(item.digest)}`);
  const guardrailRefs = evidence.claimGuardrails.map((item, index) => `G${index + 1} ref ${short(item.digest)}`);
  const guardrailLabels = evidence.claimGuardrails.map((_, index) => `G${index + 1}`).join(", ");
  const independentSources = new Set(evidence.evidence.map((item) => item.sourceId)).size;

  const recommendedAngle = [
    `Evidence-bound introduction for a ${ROLE_LABELS[role]}.`,
    `The prospect passed qualification (Q ref ${short(evidence.qualification.digest)}) and was approved by the owner (R ref ${short(evidence.reviewDecision.digest)}).`,
    `The draft cites ${plural(evidence.evidence.length, "evidence reference")} from ${plural(independentSources, "source")} and states no claim beyond the ${plural(evidence.claimGuardrails.length, "confirmed Claim Guardrail")}.`,
  ].join(" ");

  const callScript = [
    `Call script derived from this Outreach Package (${DRAFT_TEMPLATE_VERSION}). PROspector does not place or record calls.`,
    "1. Opening: say who you are and ask whether now is a good time for a two-minute conversation.",
    "2. Reason for calling: public information your team reviewed suggests your work may be relevant to their role. Do not quote figures, outcomes or facts that are not in the cited evidence.",
    `3. Claim limits: make only claims permitted by Claim Guardrail ${guardrailLabels}.`,
    "4. Close: ask whether a short follow-up would be welcome. If they ask not to be called again, record Do not call.",
    `Evidence references: ${evidenceRefs.join("; ")}.`,
    `Claim Guardrail references: ${guardrailRefs.join("; ")}.`,
    `Qualification reference: Q ref ${short(evidence.qualification.digest)}. Owner review reference: R ref ${short(evidence.reviewDecision.digest)}.`,
  ].join("\n");

  const messages: DraftMessageTemplate[] = recipient ? [Object.freeze({
    messageId: options.messageId,
    snapshot: Object.freeze({
      senderReference: DRAFT_SENDER_REFERENCE,
      from: sender,
      replyTo: null,
      to: Object.freeze([recipient]),
      cc: Object.freeze([]),
      bcc: Object.freeze([]),
      subject: "A short introduction",
      textBody: [
        "Hello,",
        "",
        "I am reaching out because public information my team reviewed suggests our work may be relevant to your role.",
        "",
        "If a short conversation would be useful, reply to this email and I will follow up. If you would prefer not to hear from me, reply to say so.",
      ].join("\n"),
      htmlBody: null,
      links: Object.freeze([]),
      attachments: Object.freeze([]),
      threadReference: null,
      replyToMessageReference: null,
    }),
    intendedSendAt: null,
    timezone: DRAFT_TIMEZONE,
  })] : [];

  const bindings: OutreachBinding[] = [
    { kind: "configuration", id: evidence.configuration.id, digest: evidence.configuration.digest },
    { kind: "qualification", id: evidence.qualification.id, digest: evidence.qualification.digest },
    { kind: "review_decision", id: evidence.reviewDecision.id, digest: evidence.reviewDecision.digest },
    ...evidence.sources.map((source) => ({ kind: "source" as const, id: source.id, digest: source.digest })),
    ...evidence.evidence.map((item) => ({ kind: "evidence" as const, id: item.id, digest: item.digest })),
    ...evidence.claimGuardrails.map((item) => ({ kind: "claim_guardrail" as const, id: item.id, digest: item.digest })),
    ...evidence.contactPoints.map((point) => ({ kind: "contact_observation" as const, id: point.observationId, digest: point.observationDigest })),
    { kind: "contact_eligibility", id: evidence.eligibility.id, digest: evidence.eligibility.digest },
  ];

  return Object.freeze({
    kind: "derived" as const,
    templateVersion: DRAFT_TEMPLATE_VERSION,
    package: Object.freeze({
      packageId: options.packageId,
      prospectId: evidence.prospectId,
      contactId: evidence.contactId,
      profileId: evidence.profileId,
      version: 1,
      configurationId: evidence.configuration.id,
      configurationDigest: evidence.configuration.digest,
      configurationRevision: evidence.configuration.revision,
      prospectRevision: evidence.prospectRevision,
      contactRevision: evidence.contactRevision,
      contactEligibilitySnapshotId: evidence.eligibility.id,
      snapshot: Object.freeze({
        evidenceDigests: Object.freeze([...new Set(evidence.evidence.map((item) => item.digest))].sort()),
        claimGuardrailDigests: Object.freeze([...new Set(evidence.claimGuardrails.map((item) => item.digest))].sort()),
        recommendedAngle,
        selectedRole: role,
        selectedContactPointDigests: Object.freeze([...new Set(evidence.contactPoints.map((point) => point.contactPointDigest))].sort()),
        callScript,
        draftMessageIds: Object.freeze(messages.map((message) => message.messageId)),
      }),
      bindings: Object.freeze(bindings.map((binding) => Object.freeze(binding))),
    }),
    messages: Object.freeze(messages),
  });
}

// ---------------------------------------------------------------------------
// Current evidence (server reads only)
// ---------------------------------------------------------------------------

export type EvidenceResult = Readonly<{ kind: "ready"; evidence: DraftEvidence }> | DraftRefusal;

/**
 * Reads the server's current evidence for one approved Prospect and Contact.
 * Every read is scoped to the admitted owner's workspace. Anything missing,
 * superseded, drifted or suppressed refuses with a reason.
 */
export async function loadDraftEvidence(database: D1Database, scope: OutreachRepositoryScope, target: Readonly<{ prospectId: string; contactId: string }>): Promise<EvidenceResult> {
  const { workspaceId, ownerSubject } = scope;
  if (!validId(target.prospectId) || !validId(target.contactId)) return refused("invalid_draft_target");
  const prospect = await database.prepare(
    `SELECT p.id,p.profile_id,p.candidate_id,p.assessment_id,p.state,p.active,p.revision FROM profile_prospects p
     JOIN workspaces w ON w.id=p.workspace_id AND w.owner_subject=? WHERE p.id=? AND p.workspace_id=? LIMIT 1`,
  ).bind(ownerSubject, target.prospectId, workspaceId).first<{ id: string; profile_id: string; candidate_id: string; assessment_id: string; state: string; active: number; revision: number }>();
  if (!prospect) return refused("prospect_unavailable");
  if (prospect.state !== "approved" || Number(prospect.active) !== 1) return refused("prospect_not_approved");
  const contact = await database.prepare("SELECT id,revision,updated_at FROM contacts WHERE id=? AND workspace_id=? LIMIT 1")
    .bind(target.contactId, workspaceId).first<{ id: string; revision: number; updated_at: number }>();
  if (!contact) return refused("unknown_contact");

  const snapshot = await readLatestContactEligibilitySnapshot(database, ownerSubject, workspaceId, target.prospectId, target.contactId);
  if (!snapshot) return refused("eligibility_snapshot_unavailable");
  if (snapshot.state !== "ContactReady" || !snapshot.eligible || snapshot.reasonCodes.length > 0) return refused("contact_not_ready");
  if (snapshot.preservedSuppressionRefs.length > 0) return refused("suppressed");
  if (snapshot.prospectRevision !== Number(prospect.revision)) return refused("prospect_changed");
  // A contact edited after its readiness snapshot is stale until a new snapshot is projected.
  if (!(Number(contact.updated_at) <= snapshot.projectedAt)) return refused("contact_changed");

  const configuration = await database.prepare(
    `SELECT id,digest,revision,active FROM typed_configurations
     WHERE id=? AND workspace_id=? AND owner_type='profile' AND owner_id=? AND kind='profile_effective' LIMIT 1`,
  ).bind(snapshot.configurationId, workspaceId, prospect.profile_id).first<{ id: string; digest: string; revision: number; active: number }>();
  if (!configuration || Number(configuration.active) !== 1) return refused("configuration_unavailable");
  if (configuration.digest !== snapshot.configurationDigest || Number(configuration.revision) !== snapshot.configurationRevision) return refused("configuration_changed");
  if (await hasCurrentDrift(database, workspaceId, configuration.id)) return refused("knowledge_drift");

  const assessment = await database.prepare(
    "SELECT id,assessment_digest,outcome,configuration_id FROM qualification_assessments WHERE id=? AND workspace_id=? LIMIT 1",
  ).bind(prospect.assessment_id, workspaceId).first<{ id: string; assessment_digest: string; outcome: string; configuration_id: string }>();
  if (!assessment || assessment.outcome !== "Passed" || assessment.configuration_id !== configuration.id || !DIGEST.test(assessment.assessment_digest)) return refused("qualification_unavailable");
  const review = await database.prepare(
    `SELECT id,decision,assessment_id,decision_digest FROM prospect_review_decisions
     WHERE prospect_id=? AND workspace_id=? ORDER BY created_at DESC,id DESC LIMIT 1`,
  ).bind(prospect.id, workspaceId).first<{ id: string; decision: string; assessment_id: string; decision_digest: string }>();
  if (!review || review.decision !== "approve" || review.assessment_id !== assessment.id || !DIGEST.test(review.decision_digest)) return refused("review_decision_unavailable");

  const candidate = await database.prepare("SELECT run_id,submission_id FROM prospecting_candidates WHERE id=? AND workspace_id=? LIMIT 1")
    .bind(prospect.candidate_id, workspaceId).first<{ run_id: string; submission_id: string }>();
  const lineage = candidate ? ((await database.prepare(
    `SELECT l.id,l.lineage_digest,l.source_id,s.source_digest,s.status FROM prospecting_source_lineage l
     LEFT JOIN sources s ON s.id=l.source_id AND s.workspace_id=l.workspace_id
     WHERE l.workspace_id=? AND l.run_id=? AND l.submission_id=? ORDER BY l.id LIMIT ?`,
  ).bind(workspaceId, candidate.run_id, candidate.submission_id, MAX_EVIDENCE).all<{ id: string; lineage_digest: string; source_id: string; source_digest: string | null; status: string | null }>()).results ?? []) : [];
  const current = lineage.filter((row) => validId(row.id) && DIGEST.test(row.lineage_digest) && validId(row.source_id) && row.status === "available" && DIGEST.test(row.source_digest ?? ""));
  if (current.length === 0) return refused("evidence_missing");
  const sources = [...new Map(current.map((row) => [row.source_id, Object.freeze({ id: row.source_id, digest: row.source_digest as string })])).values()];

  const guardrails = ((await database.prepare(
    `SELECT id,value_digest FROM knowledge_versions WHERE workspace_id=? AND kind='claim_guardrail' AND status='confirmed'
     AND scope_type='profile' AND scope_id=? ORDER BY id LIMIT ?`,
  ).bind(workspaceId, prospect.profile_id, MAX_GUARDRAILS).all<{ id: string; value_digest: string }>()).results ?? [])
    .filter((row) => validId(row.id) && DIGEST.test(row.value_digest));
  if (guardrails.length === 0) return refused("claim_guardrail_missing");

  const ids = snapshot.observationIds;
  if (ids.length === 0 || ids.length > MAX_POINTS) return refused("contact_point_missing");
  const points = ((await database.prepare(
    `SELECT o.id,o.kind,o.contact_point_digest,o.observation_digest,a.role FROM contact_point_observations o
     LEFT JOIN contact_evidence_assignments a ON a.id=o.assignment_id AND a.workspace_id=o.workspace_id
       AND a.prospect_id=? AND a.contact_id=o.contact_id
     WHERE o.workspace_id=? AND o.contact_id=? AND o.configuration_id=? AND o.configuration_digest=?
       AND o.id IN (${ids.map(() => "?").join(",")})
       AND NOT EXISTS (SELECT 1 FROM contact_point_observations later WHERE later.workspace_id=o.workspace_id
         AND later.contact_id=o.contact_id AND later.contact_point_digest=o.contact_point_digest
         AND later.id<>o.id AND later.observed_at>=o.observed_at)
     ORDER BY o.id`,
  ).bind(prospect.id, workspaceId, contact.id, configuration.id, configuration.digest, ...ids).all<{ id: string; kind: string; contact_point_digest: string; observation_digest: string; role: string | null }>()).results ?? []);
  if (points.length !== ids.length || points.some((point) => (point.kind !== "email" && point.kind !== "phone") || !DIGEST.test(point.contact_point_digest) || !DIGEST.test(point.observation_digest))) {
    return refused("contact_point_changed");
  }
  if ((await matchingSuppressionRefs(database, workspaceId, contact.id, ids)).length > 0) return refused("suppressed");

  return Object.freeze({
    kind: "ready" as const,
    evidence: Object.freeze({
      prospectId: prospect.id,
      contactId: contact.id,
      profileId: prospect.profile_id,
      configuration: Object.freeze({ id: configuration.id, digest: configuration.digest, revision: Number(configuration.revision) }),
      prospectRevision: Number(prospect.revision),
      contactRevision: Number(contact.revision),
      eligibility: Object.freeze({ id: snapshot.id, digest: snapshot.snapshotDigest }),
      qualification: Object.freeze({ id: assessment.id, digest: assessment.assessment_digest }),
      reviewDecision: Object.freeze({ id: review.id, digest: review.decision_digest }),
      evidence: Object.freeze(current.map((row) => Object.freeze({ id: row.id, digest: row.lineage_digest, sourceId: row.source_id }))),
      sources: Object.freeze(sources),
      claimGuardrails: Object.freeze(guardrails.map((row) => Object.freeze({ id: row.id, digest: row.value_digest }))),
      role: points.find((point) => typeof point.role === "string")?.role ?? "general",
      contactPoints: Object.freeze(points.map((point) => Object.freeze({
        observationId: point.id, observationDigest: point.observation_digest, contactPointDigest: point.contact_point_digest, kind: point.kind as "email" | "phone",
      }))),
    }),
  });
}

export type DraftCandidate = Readonly<{
  prospectId: string; contactId: string; contactName: string; ready: boolean; reasonCodes: readonly string[];
  alreadyDrafted: boolean; recipientConfirmationRequired: boolean;
}>;

/** Approved prospects with a latest eligibility snapshot, newest first. No address or number is projected. */
export async function listDraftCandidates(database: D1Database, scope: OutreachRepositoryScope): Promise<readonly DraftCandidate[]> {
  const rows = (await database.prepare(
    `SELECT s.prospect_id,s.contact_id,c.display_name,
       EXISTS (SELECT 1 FROM outreach_packages op WHERE op.workspace_id=s.workspace_id AND op.prospect_id=s.prospect_id AND op.contact_id=s.contact_id) drafted
     FROM contact_eligibility_snapshots s
     JOIN workspaces w ON w.id=s.workspace_id AND w.owner_subject=?
     JOIN profile_prospects p ON p.id=s.prospect_id AND p.workspace_id=s.workspace_id AND p.state='approved' AND p.active=1
     JOIN contacts c ON c.id=s.contact_id AND c.workspace_id=s.workspace_id
     WHERE s.workspace_id=? AND NOT EXISTS (SELECT 1 FROM contact_eligibility_snapshots later
       WHERE later.workspace_id=s.workspace_id AND later.prospect_id=s.prospect_id AND later.contact_id=s.contact_id
         AND (later.projected_at>s.projected_at OR (later.projected_at=s.projected_at AND later.id>s.id)))
     ORDER BY s.projected_at DESC,s.id LIMIT ?`,
  ).bind(scope.ownerSubject, scope.workspaceId, MAX_CANDIDATES).all<{ prospect_id: string; contact_id: string; display_name: string; drafted: number }>()).results ?? [];
  const candidates: DraftCandidate[] = [];
  for (const row of rows) {
    if (!validId(row.prospect_id) || !validId(row.contact_id)) continue;
    const alreadyDrafted = Number(row.drafted) === 1;
    const result = await loadDraftEvidence(database, scope, { prospectId: row.prospect_id, contactId: row.contact_id });
    const reasonCodes = alreadyDrafted ? ["package_already_drafted"] : result.kind === "refused" ? result.reasonCodes : [];
    candidates.push(Object.freeze({
      prospectId: row.prospect_id,
      contactId: row.contact_id,
      contactName: typeof row.display_name === "string" ? row.display_name.slice(0, 160) : "",
      ready: !alreadyDrafted && result.kind === "ready",
      reasonCodes: Object.freeze([...reasonCodes]),
      alreadyDrafted,
      recipientConfirmationRequired: result.kind === "ready" && result.evidence.contactPoints.some((point) => point.kind === "email"),
    }));
  }
  return Object.freeze(candidates);
}

// ---------------------------------------------------------------------------
// Draft service: existing Package and Message Version paths only
// ---------------------------------------------------------------------------

export type DraftRequest = Readonly<{
  prospectId: string; contactId: string; confirmedRecipientEmail: string | null; senderAddress: string | null; idempotencyKey: string;
}>;
export type DraftCreated = Readonly<{
  kind: "drafted"; replayed: boolean; packageVersionId: string; packageArtifactDigest: string; messageVersionIds: readonly string[];
  authority: "draft_only"; effects: Readonly<{ approvals: 0; outboxItems: 0; providerCalls: 0 }>;
}>;

export async function draftOutreachFromEvidence(database: D1Database, scope: OutreachRepositoryScope, request: DraftRequest): Promise<DraftCreated | DraftRefusal> {
  if (!validId(request.idempotencyKey)) return refused("invalid_idempotency_key");
  const repositoryScope: OutreachRepositoryScope = Object.freeze({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, ...(scope.now ? { now: scope.now } : {}) });
  const reader = createD1OutreachArtifactReader(database, repositoryScope);
  const keyDigest = await canonicalDigest({ schema: "outreach-draft-command/v1", workspaceId: scope.workspaceId, idempotencyKey: request.idempotencyKey });
  const packageKey = `odraft-pkg-${keyDigest.slice(0, 40)}`;
  const messageKey = `odraft-msg-${keyDigest.slice(0, 40)}`;

  const prior = await reader.readCommand(packageKey);
  if (prior && prior.commandKind !== "package_version.create") return refused("idempotency_conflict");
  const result = await loadDraftEvidence(database, repositoryScope, request);
  if (result.kind === "refused") return result;
  const evidence = result.evidence;
  const packageId = `opk-${(await canonicalDigest({ schema: "outreach-draft-package/v1", workspaceId: scope.workspaceId, prospectId: evidence.prospectId, contactId: evidence.contactId, profileId: evidence.profileId })).slice(0, 40)}`;
  const messageId = `oms-${(await canonicalDigest({ schema: "outreach-draft-message/v1", packageId, ordinal: 1 })).slice(0, 40)}`;
  if (!prior && await packageExists(database, scope, evidence)) return refused("package_already_drafted");

  const derived = await deriveOutreachDraft(evidence, {
    packageId, messageId, senderAddress: request.senderAddress ?? "", recipientAddress: request.confirmedRecipientEmail,
  });
  if (derived.kind === "refused") return derived;

  const packages = composeOutreachPackageService(database, repositoryScope);
  const created = await packages.createVersion({ draft: derived.package, idempotencyKey: packageKey });
  if (created.kind === "refused") return refused(...created.reasonCodes);

  const messages = composeMessageVersionService(database, repositoryScope);
  const messageVersionIds: string[] = [];
  let replayed = created.replayed;
  for (const template of derived.messages) {
    const priorMessage = await reader.readCommand(messageKey);
    if (priorMessage) {
      if (priorMessage.commandKind !== "message_version.create") return refused("idempotency_conflict");
      messageVersionIds.push(priorMessage.resultId);
      continue;
    }
    // The raw unsubscribe token is never stored; only its one-way digest is bound.
    const message = await messages.createVersion({
      draft: {
        messageId: template.messageId, packageId, packageVersionId: created.id, version: 1, snapshot: template.snapshot,
        intendedSendAt: template.intendedSendAt, timezone: template.timezone, unsubscribeTokenDigest: await unsubscribeTokenDigest(randomToken()),
      },
      configurationId: evidence.configuration.id,
      idempotencyKey: messageKey,
    });
    if (message.kind === "refused") return refused(...message.reasonCodes);
    replayed = replayed && message.replayed;
    messageVersionIds.push(message.id);
  }
  return Object.freeze({
    kind: "drafted" as const,
    replayed,
    packageVersionId: created.id,
    packageArtifactDigest: created.digest,
    messageVersionIds: Object.freeze(messageVersionIds),
    authority: "draft_only" as const,
    effects: Object.freeze({ approvals: 0 as const, outboxItems: 0 as const, providerCalls: 0 as const }),
  });
}

async function packageExists(database: D1Database, scope: OutreachRepositoryScope, evidence: DraftEvidence) {
  const row = await database.prepare(
    "SELECT 1 found FROM outreach_packages WHERE workspace_id=? AND prospect_id=? AND contact_id=? AND profile_id=? LIMIT 1",
  ).bind(scope.workspaceId, evidence.prospectId, evidence.contactId, evidence.profileId).first();
  return row !== null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function refused(...reasons: string[]): DraftRefusal {
  return Object.freeze({ kind: "refused" as const, reasonCodes: Object.freeze([...new Set(reasons)]) });
}

function short(digest: string) { return digest.slice(0, 12); }
function plural(count: number, noun: string) { return `${count} ${noun}${count === 1 ? "" : "s"}`; }
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }

function plain(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function references(value: unknown, max: number, extra: readonly string[] = []): boolean {
  return Array.isArray(value) && value.length <= max
    && value.every((item) => plain(item, ["id", "digest", ...extra]) && validId(item.id) && validDigest(item.digest) && extra.every((key) => validId(item[key])))
    && new Set(value.map((item) => (item as { id: string }).id)).size === value.length;
}

function validEvidence(value: unknown): value is DraftEvidence {
  if (!plain(value, [
    "prospectId", "contactId", "profileId", "configuration", "prospectRevision", "contactRevision", "eligibility",
    "qualification", "reviewDecision", "evidence", "sources", "claimGuardrails", "role", "contactPoints",
  ])) return false;
  const configuration = value.configuration;
  return validId(value.prospectId) && validId(value.contactId) && validId(value.profileId)
    && plain(configuration, ["id", "digest", "revision"]) && validId(configuration.id) && validDigest(configuration.digest) && positive(configuration.revision)
    && positive(value.prospectRevision) && positive(value.contactRevision)
    && [value.eligibility, value.qualification, value.reviewDecision].every((item) => plain(item, ["id", "digest"]) && validId(item.id) && validDigest(item.digest))
    && references(value.evidence, MAX_EVIDENCE, ["sourceId"]) && references(value.sources, MAX_EVIDENCE) && references(value.claimGuardrails, MAX_GUARDRAILS)
    && typeof value.role === "string" && /^[a-z_]{1,32}$/u.test(value.role)
    && Array.isArray(value.contactPoints) && value.contactPoints.length <= MAX_POINTS
    && value.contactPoints.every((point) => plain(point, ["observationId", "observationDigest", "contactPointDigest", "kind"])
      && validId(point.observationId) && validDigest(point.observationDigest) && validDigest(point.contactPointDigest) && (point.kind === "email" || point.kind === "phone"))
    && new Set(value.contactPoints.map((point) => (point as DraftContactPoint).observationId)).size === value.contactPoints.length;
}

function validOptions(value: unknown): value is DraftOptions {
  return plain(value, ["packageId", "messageId", "senderAddress", "recipientAddress"]) && validId(value.packageId) && validId(value.messageId)
    && typeof value.senderAddress === "string" && value.senderAddress.length <= 320
    && (value.recipientAddress === null || (typeof value.recipientAddress === "string" && value.recipientAddress.length <= 320));
}
