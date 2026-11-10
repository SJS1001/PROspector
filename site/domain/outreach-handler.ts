import { recheckForFinalSend } from "./contact-eligibility";
import { consumeCsrfToken, csrfCookieName, csrfTokenFromRequest, CsrfTokenError, issueCsrfToken, withCsrfCookie, type CsrfCookieMode } from "./csrf";
import { canonicalDigest } from "./enrichment-grant-issuance";
import { blockedClickToCallEligibilityPort, createD1ManualCallService, type ManualCallEligibilityPort, type ManualCallPhoneRecheckInput } from "./manual-call";
import { ManualCallDecisionError, type ManualCallOutcome } from "./manual-call-decision-service";
import { composeMessageVersionService } from "./message-version";
import { draftOutreachFromEvidence, listDraftCandidates } from "./outreach-draft-derivation";
import { createGovernedOutboxEnqueue, type EnqueueResult } from "./outbox";
import { composeOutreachPackageService, type ContactEvidence, type OutreachPackageService } from "./outreach-package";
import type { OutreachBinding, OutreachRepositoryScope } from "./outreach-repository";
import { createOutreachStopRules } from "./outreach-stop-rules";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";
import { normalizeConfirmedDomain, normalizeE164Phone, normalizeExactEmail, phoneDigest, type SuppressionSubject } from "./suppression";

/**
 * Owner Outreach command and projection transport (06-08, local).
 *
 * - The server derives the owner, workspace, sender connection, suppression
 *   subject digests and every authority input. The browser sends reviewed
 *   locators and digests only, as closed JSON shapes.
 * - Every command reaches a trusted domain service. Production composition
 *   wires the Phase 5 rechecks in `contact-eligibility.ts`, which always
 *   refuse, so approval, queueing and calling are refused with a reason.
 * - The phone action stays disabled until 06-13 Task 3 owner acceptance. No
 *   result carries a callable target, and nothing reaches a provider.
 * - `draft_package` derives a draft Package and Message Version from the
 *   server's current evidence with fixed templates (no AI or provider call).
 *   The browser names the Prospect and Contact and may confirm the recipient
 *   address, which is accepted only when it digests to a selected verified
 *   email point; From is the configured pilot owner address. It approves nothing.
 * - D-8: a `do_not_call` outcome may carry the E.164 number the owner
 *   confirms. It is accepted only when its digest equals the stored phone
 *   digest, and it is then handed to the manual-call stop rule so the number
 *   tombstone is written with the contact tombstone, before the outcome.
 */

export const OUTREACH_MUTATION_INTENT = "outreach-mutation";
export const MAX_OUTREACH_BODY_BYTES = 4096;
export const OUTREACH_PROJECTION_SCHEMA = "outreach-projection/v1";
export const PHONE_ACTION_DISABLED_REASON = "owner_uat_pending";

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const REASON = /^[a-z0-9_:]{1,96}$/u;
const MAX_PACKAGES = 20;
const MAX_MESSAGES = 40;
const MAX_HISTORY = 50;
const MAX_PHONES_PER_PACKAGE = 4;
const MAX_TEXT_PREVIEW = 2_000;
const OUTCOMES: readonly ManualCallOutcome[] = ["connected", "voicemail", "no_answer", "wrong_number", "do_not_call", "follow_up"];
const SUPPRESSION_REASONS = ["owner_request", "explicit_opt_out"] as const;
const CHANNELS_BY_KIND = Object.freeze({
  exact_email: ["email", "all"],
  confirmed_email_domain: ["email", "all"],
  e164_phone: ["phone", "all"],
  contact: ["email", "phone", "all"],
  company: ["email", "phone", "all"],
} as const);

export type OutreachScope = Readonly<{ workspaceId: string; ownerSubject: string; now: () => number }>;

type ManualCallService = ReturnType<typeof createD1ManualCallService>;
type AuthorityInputs = Readonly<{ currentDependencies: readonly OutreachBinding[]; contactEvidence: ContactEvidence }>;

/** The trusted services one owner command may reach. */
export type OutreachServices = Readonly<{
  mode: "production" | "synthetic";
  packages: Pick<OutreachPackageService, "approve" | "projectApproval">;
  messages: Pick<ReturnType<typeof composeMessageVersionService>, "approve">;
  enqueue: Readonly<{ enqueueApprovedMessage(input: unknown): Promise<EnqueueResult> }>;
  stopRules: Pick<ReturnType<typeof createOutreachStopRules>, "recordSuppressionStop">;
  clickToCallEligibility: ManualCallEligibilityPort;
  /** Current dependency and contact evidence for an exact Package Version, derived on the server. */
  authorityInputs(packageVersionId: string): Promise<AuthorityInputs>;
}>;

export type OutreachServicesFactory = (database: D1Database, scope: OutreachScope) => OutreachServices;

/** Server-derived command context. The HTTP layer supplies the admitted owner's configured address; nothing comes from the body. */
export type OutreachCommandContext = Readonly<{ senderAddress?: string | null }>;

export type OutreachHandlerDependencies = {
  database: D1Database;
  subjectPepper: string;
  pilotOwnerEmail: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
  csrfCookieMode?: CsrfCookieMode;
  /** Test seam only. The route never sets it, so production composition is always used. */
  services?: OutreachServicesFactory;
  now?: () => number;
};

/**
 * No verified current dependency set exists yet, so production passes an empty
 * one. The package service then reports every bound dependency as unverified
 * and the blocked Phase 5 recheck refuses: it can never pass vacuously.
 */
const PRODUCTION_AUTHORITY_INPUTS: AuthorityInputs = Object.freeze({ currentDependencies: Object.freeze([]), contactEvidence: Object.freeze({}) });

/** Production composition: the always-refusing Phase 5 rechecks, never bypassed. */
export function composeProductionOutreachServices(database: D1Database, scope: OutreachScope): OutreachServices {
  const repositoryScope: OutreachRepositoryScope = Object.freeze({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, now: scope.now });
  return Object.freeze({
    mode: "production" as const,
    packages: composeOutreachPackageService(database, repositoryScope),
    messages: composeMessageVersionService(database, repositoryScope),
    enqueue: createGovernedOutboxEnqueue(database, repositoryScope, { eligibility: Object.freeze({ recheckForFinalSend }) }),
    stopRules: createOutreachStopRules(database, repositoryScope),
    clickToCallEligibility: blockedClickToCallEligibilityPort,
    authorityInputs: async () => PRODUCTION_AUTHORITY_INPUTS,
  });
}

/**
 * Supplies only the owner-confirmed, digest-checked number. Readiness, freshness
 * and the blocked flag still come from the wrapped port, so a refusing port
 * keeps refusing. The manual-call repository re-checks the digest before use.
 */
export function withOwnerConfirmedNumber(port: ManualCallEligibilityPort, confirmedPhone: string): ManualCallEligibilityPort {
  return Object.freeze({
    async recheckForClickToCall(input: ManualCallPhoneRecheckInput) {
      const base = await port.recheckForClickToCall(input);
      return Object.freeze({ ...base, normalizedPhone: confirmedPhone });
    },
  });
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

type Principal = { subject: string; legacySubject?: string; displayName?: string };
class OutreachCommandError extends Error {}

export async function handleOutreachGet(_request: Request, dependencies: OutreachHandlerDependencies): Promise<Response> {
  try {
    const { principal, scope } = await admit(dependencies);
    const projection = await readOutreachProjection(dependencies.database, scope, servicesFor(dependencies, scope));
    return withCsrfCookie(json(projection), await issueCsrfToken(dependencies.database, principal.subject), dependencies.csrfCookieMode);
  } catch (error) {
    return error instanceof PilotAccessError ? privateWorkspaceUnavailable() : json({ error: "outreach_unavailable" }, 503);
  }
}

export async function handleOutreachPost(request: Request, dependencies: OutreachHandlerDependencies): Promise<Response> {
  try {
    const principal = await owner(dependencies);
    const rejected = validateSameOriginMutation(request, OUTREACH_MUTATION_INTENT, MAX_OUTREACH_BODY_BYTES);
    if (rejected) return json({ error: rejected.error }, rejected.status);
    await consumeCsrfToken(dependencies.database, principal.subject, csrfTokenFromRequest(request, csrfCookieName(dependencies.csrfCookieMode)));
    const fresh = async (response: Response) => withCsrfCookie(response, await issueCsrfToken(dependencies.database, principal.subject), dependencies.csrfCookieMode);
    let body: unknown;
    try {
      body = await readBoundedJson(request, MAX_OUTREACH_BODY_BYTES);
    } catch (error) {
      if (error instanceof SyntaxError) return fresh(json({ error: "invalid_json" }, 400));
      if (error instanceof Error && "status" in error && error.status === 413) return fresh(json({ error: "payload_too_large" }, 413));
      throw error;
    }
    const scope = await workspaceScope(dependencies, principal);
    const context: OutreachCommandContext = Object.freeze({ senderAddress: normalizeExactEmail(dependencies.pilotOwnerEmail) });
    const result = await executeOutreachCommand(dependencies.database, scope, servicesFor(dependencies, scope), body, context);
    return fresh(json(result.body, result.status));
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (error instanceof CsrfTokenError) return json({ error: error.code }, 403);
    if (error instanceof Error && "status" in error && error.status === 413) return json({ error: "payload_too_large" }, 413);
    return json({ error: "outreach_unavailable" }, 503);
  }
}

async function admit(dependencies: OutreachHandlerDependencies) {
  const principal = await owner(dependencies);
  return { principal, scope: await workspaceScope(dependencies, principal) };
}

async function owner(dependencies: OutreachHandlerDependencies): Promise<Principal> {
  return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper);
}

/** The scope's owner subject is the one stored on the workspace, so legacy-subject workspaces stay consistent. */
async function workspaceScope(dependencies: OutreachHandlerDependencies, principal: Principal): Promise<OutreachScope> {
  const row = await dependencies.database.prepare(
    "SELECT id,owner_subject FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1",
  ).bind(principal.subject, principal.legacySubject ?? principal.subject, principal.subject).first<{ id: string; owner_subject: string }>();
  if (!row || !validId(row.id) || !validId(row.owner_subject)) throw new PilotAccessError();
  return Object.freeze({ workspaceId: row.id, ownerSubject: row.owner_subject, now: dependencies.now ?? Date.now });
}

function servicesFor(dependencies: OutreachHandlerDependencies, scope: OutreachScope): OutreachServices {
  return (dependencies.services ?? composeProductionOutreachServices)(dependencies.database, scope);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

type ApprovePackage = Readonly<{ action: "approve_package"; packageVersionId: string; reviewedDigest: string; idempotencyKey: string }>;
type ApproveMessage = Readonly<{ action: "approve_message"; messageVersionId: string; reviewedDigest: string; packageApprovalId: string; acknowledgementDigest: string; idempotencyKey: string }>;
type QueueMessage = Readonly<{ action: "queue_message"; messageApprovalId: string }>;
type RecordSuppression = Readonly<{
  action: "record_suppression"; subjectKind: keyof typeof CHANNELS_BY_KIND; value: string | null;
  channel: "email" | "phone" | "all"; reason: typeof SUPPRESSION_REASONS[number]; idempotencyKey: string;
}>;
type RecordCallOutcome = Readonly<{
  action: "record_call_outcome"; packageApprovalId: string; phoneObservationId: string; expectedDecisionDigest: string;
  outcome: ManualCallOutcome; notes: string; idempotencyKey: string; confirmedPhoneE164: string | null;
}>;
type DraftPackage = Readonly<{ action: "draft_package"; prospectId: string; contactId: string; confirmedRecipientEmail: string | null; idempotencyKey: string }>;
type OutreachCommand = ApprovePackage | ApproveMessage | QueueMessage | RecordSuppression | RecordCallOutcome | DraftPackage;
type CommandResult = Readonly<{ action: OutreachCommand["action"]; status: "applied" | "replayed" | "refused"; reasonCodes: readonly string[]; providerCalls: 0 } & Record<string, unknown>>;

const SHAPES: Readonly<Record<OutreachCommand["action"], Readonly<{ required: readonly string[]; optional: readonly string[] }>>> = Object.freeze({
  approve_package: { required: ["action", "packageVersionId", "reviewedDigest", "idempotencyKey"], optional: [] },
  approve_message: { required: ["action", "messageVersionId", "reviewedDigest", "packageApprovalId", "acknowledgementDigest", "idempotencyKey"], optional: [] },
  queue_message: { required: ["action", "messageApprovalId"], optional: [] },
  record_suppression: { required: ["action", "subjectKind", "channel", "reason", "confirmed", "idempotencyKey"], optional: ["value"] },
  record_call_outcome: { required: ["action", "packageApprovalId", "phoneObservationId", "expectedDecisionDigest", "outcome", "notes", "idempotencyKey"], optional: ["confirmedPhoneE164"] },
  draft_package: { required: ["action", "prospectId", "contactId", "idempotencyKey"], optional: ["confirmedRecipientEmail"] },
});

/** Strict closed-shape parse. Anything else, including a client-supplied scope, sender or approval, is refused. */
export function parseOutreachCommand(value: unknown): OutreachCommand {
  if (!plainRecord(value)) throw new OutreachCommandError("invalid_command");
  const body = value as Record<string, unknown>;
  const action = body.action;
  if (typeof action !== "string" || !Object.hasOwn(SHAPES, action)) throw new UnsupportedActionError();
  const shape = SHAPES[action as OutreachCommand["action"]];
  const keys = Object.keys(body);
  if (keys.some((key) => !shape.required.includes(key) && !shape.optional.includes(key)) || shape.required.some((key) => !Object.hasOwn(body, key))) {
    throw new OutreachCommandError("invalid_command");
  }
  const id = (key: string) => { if (!validId(body[key])) throw new OutreachCommandError("invalid_command"); return body[key] as string; };
  const digest = (key: string) => { if (typeof body[key] !== "string" || !DIGEST.test(body[key] as string)) throw new OutreachCommandError("invalid_command"); return body[key] as string; };
  switch (action) {
    case "approve_package":
      return Object.freeze({ action, packageVersionId: id("packageVersionId"), reviewedDigest: digest("reviewedDigest"), idempotencyKey: id("idempotencyKey") });
    case "approve_message":
      return Object.freeze({
        action, messageVersionId: id("messageVersionId"), reviewedDigest: digest("reviewedDigest"), packageApprovalId: id("packageApprovalId"),
        acknowledgementDigest: digest("acknowledgementDigest"), idempotencyKey: id("idempotencyKey"),
      });
    case "queue_message":
      return Object.freeze({ action, messageApprovalId: id("messageApprovalId") });
    case "draft_package": {
      let confirmed: string | null = null;
      if (Object.hasOwn(body, "confirmedRecipientEmail")) {
        // Only a confirmation of an address the server already holds by digest; never content or authority.
        if (typeof body.confirmedRecipientEmail !== "string" || body.confirmedRecipientEmail.length < 1 || body.confirmedRecipientEmail.length > 320) throw new OutreachCommandError("invalid_command");
        confirmed = body.confirmedRecipientEmail;
      }
      return Object.freeze({ action, prospectId: id("prospectId"), contactId: id("contactId"), confirmedRecipientEmail: confirmed, idempotencyKey: id("idempotencyKey") });
    }
    case "record_suppression": {
      const subjectKind = body.subjectKind;
      if (typeof subjectKind !== "string" || !Object.hasOwn(CHANNELS_BY_KIND, subjectKind)) throw new OutreachCommandError("invalid_command");
      const kind = subjectKind as keyof typeof CHANNELS_BY_KIND;
      if (body.confirmed !== true) throw new OutreachCommandError("invalid_command");
      if (!(CHANNELS_BY_KIND[kind] as readonly string[]).includes(String(body.channel))) throw new OutreachCommandError("invalid_command");
      if (!SUPPRESSION_REASONS.includes(body.reason as typeof SUPPRESSION_REASONS[number])) throw new OutreachCommandError("invalid_command");
      let subjectValue: string | null = null;
      if (kind === "company") {
        if (Object.hasOwn(body, "value")) throw new OutreachCommandError("invalid_command");
      } else {
        const raw = body.value;
        if (typeof raw !== "string" || raw.length > 320) throw new OutreachCommandError("invalid_command");
        subjectValue = kind === "exact_email" ? normalizeExactEmail(raw)
          : kind === "confirmed_email_domain" ? normalizeConfirmedDomain(raw)
            : kind === "e164_phone" ? normalizeE164Phone(raw)
              : validId(raw) ? raw : null;
        if (!subjectValue) throw new OutreachCommandError("invalid_command");
      }
      return Object.freeze({
        action, subjectKind: kind, value: subjectValue, channel: body.channel as RecordSuppression["channel"],
        reason: body.reason as RecordSuppression["reason"], idempotencyKey: id("idempotencyKey"),
      });
    }
    case "record_call_outcome": {
      const outcome = body.outcome;
      if (typeof outcome !== "string" || !OUTCOMES.includes(outcome as ManualCallOutcome)) throw new OutreachCommandError("invalid_command");
      if (typeof body.notes !== "string" || body.notes.trim().length < 1 || body.notes.length > 512) throw new OutreachCommandError("invalid_command");
      let confirmed: string | null = null;
      if (Object.hasOwn(body, "confirmedPhoneE164")) {
        // Only a do_not_call carries a number, and only to write the number tombstone.
        if (outcome !== "do_not_call" || typeof body.confirmedPhoneE164 !== "string" || body.confirmedPhoneE164.length < 1 || body.confirmedPhoneE164.length > 32) {
          throw new OutreachCommandError("invalid_command");
        }
        confirmed = body.confirmedPhoneE164;
      }
      return Object.freeze({
        action, packageApprovalId: id("packageApprovalId"), phoneObservationId: id("phoneObservationId"),
        expectedDecisionDigest: digest("expectedDecisionDigest"), outcome: outcome as ManualCallOutcome, notes: body.notes,
        idempotencyKey: id("idempotencyKey"), confirmedPhoneE164: confirmed,
      });
    }
  }
  throw new UnsupportedActionError();
}

class UnsupportedActionError extends Error {}

/** Parse, run one command through its trusted service, and reload the authoritative projection. */
export async function executeOutreachCommand(database: D1Database, scope: OutreachScope, services: OutreachServices, value: unknown, context: OutreachCommandContext = {}): Promise<Readonly<{ status: number; body: Record<string, unknown> }>> {
  let command: OutreachCommand;
  try {
    command = parseOutreachCommand(value);
  } catch (error) {
    if (error instanceof UnsupportedActionError) return { status: 400, body: { error: "unsupported_action" } };
    return { status: 400, body: { error: "invalid_command" } };
  }
  const result = await runCommand(database, scope, services, command, context);
  const projection = await readOutreachProjection(database, scope, services);
  return { status: result.status === "refused" ? 409 : 200, body: { command: result, projection } };
}

async function runCommand(database: D1Database, scope: OutreachScope, services: OutreachServices, command: OutreachCommand, context: OutreachCommandContext): Promise<CommandResult> {
  switch (command.action) {
    case "draft_package": {
      const result = await draftOutreachFromEvidence(database, repositoryScopeOf(scope), {
        prospectId: command.prospectId, contactId: command.contactId, confirmedRecipientEmail: command.confirmedRecipientEmail,
        senderAddress: typeof context.senderAddress === "string" ? context.senderAddress : null, idempotencyKey: command.idempotencyKey,
      });
      if (result.kind === "refused") return refusedResult(command.action, result.reasonCodes);
      return completed(command.action, result.replayed, {
        packageVersionId: result.packageVersionId, packageArtifactDigest: result.packageArtifactDigest,
        messageVersionIds: result.messageVersionIds, authority: result.authority,
      });
    }
    case "approve_package": {
      const inputs = await services.authorityInputs(command.packageVersionId);
      const result = await services.packages.approve({
        packageVersionId: command.packageVersionId, reviewedDigest: command.reviewedDigest,
        currentDependencies: inputs.currentDependencies, contactEvidence: inputs.contactEvidence, idempotencyKey: command.idempotencyKey,
      });
      if (result.kind === "refused") return refusedResult(command.action, result.reasonCodes);
      return completed(command.action, result.replayed, {
        approvalId: result.approvalId, approvalDigest: result.approvalDigest, expiresAt: result.expiresAt, authority: result.authority,
      });
    }
    case "approve_message": {
      const packageVersionId = await messagePackageVersion(database, scope, command.messageVersionId);
      const inputs = packageVersionId ? await services.authorityInputs(packageVersionId) : PRODUCTION_AUTHORITY_INPUTS;
      const result = await services.messages.approve({
        messageVersionId: command.messageVersionId, reviewedDigest: command.reviewedDigest, packageApprovalId: command.packageApprovalId,
        acknowledgementDigest: command.acknowledgementDigest, currentDependencies: inputs.currentDependencies,
        contactEvidence: inputs.contactEvidence, idempotencyKey: command.idempotencyKey,
      });
      if (result.kind === "refused") return refusedResult(command.action, result.reasonCodes);
      return completed(command.action, result.replayed, {
        approvalId: result.approvalId, approvalDigest: result.approvalDigest, expiresAt: result.expiresAt, authority: result.authority,
      });
    }
    case "queue_message": {
      const senderConnectionId = await currentSenderConnection(database, scope);
      if (senderConnectionId === "ambiguous") return refusedResult(command.action, ["sender_ambiguous"]);
      if (!senderConnectionId) return refusedResult(command.action, ["gmail_unavailable"]);
      const result = await services.enqueue.enqueueApprovedMessage({ messageApprovalId: command.messageApprovalId, senderConnectionId });
      if (result.kind !== "queued") return refusedResult(command.action, [result.reason]);
      return completed(command.action, result.replayed, { outboxItemId: result.outboxItemId });
    }
    case "record_suppression":
      return recordSuppression(database, scope, services, command);
    case "record_call_outcome":
      return recordCallOutcome(database, scope, services, command);
  }
}

async function recordSuppression(database: D1Database, scope: OutreachScope, services: OutreachServices, command: RecordSuppression): Promise<CommandResult> {
  let subject: SuppressionSubject;
  switch (command.subjectKind) {
    case "exact_email": subject = { kind: "exact_email", email: command.value as string }; break;
    case "confirmed_email_domain": subject = { kind: "confirmed_email_domain", domain: command.value as string, ownerConfirmed: true }; break;
    case "e164_phone": subject = { kind: "e164_phone", phone: command.value as string }; break;
    case "company": subject = { kind: "company", workspaceId: scope.workspaceId }; break;
    case "contact": {
      const contact = await database.prepare("SELECT identity_digest FROM contacts WHERE id=? AND workspace_id=? LIMIT 1")
        .bind(command.value, scope.workspaceId).first<{ identity_digest: string }>();
      if (!contact || !DIGEST.test(contact.identity_digest)) return refusedResult(command.action, ["unknown_contact"]);
      subject = { kind: "contact", identityDigest: contact.identity_digest };
      break;
    }
  }
  const sourceEventDigest = await canonicalDigest({
    schema: "outreach-owner-suppression/v1", workspaceId: scope.workspaceId, idempotencyKey: command.idempotencyKey,
    subjectKind: command.subjectKind, channel: command.channel, reason: command.reason,
  });
  const result = await services.stopRules.recordSuppressionStop({
    subject, channel: command.channel, reason: command.reason, sourceEventDigest, aliasDigests: [],
    effectiveAt: scope.now(), idempotencyKey: `owner-suppression:${command.idempotencyKey}`.slice(0, 128),
  });
  if (result.kind !== "suppressed") return refusedResult(command.action, [result.reason]);
  return completed(command.action, result.replayed, {
    cancelledOutboxItems: result.cancelledOutboxItemIds.length,
    uncancelledOutboxItems: result.uncancelled.length,
  });
}

async function recordCallOutcome(database: D1Database, scope: OutreachScope, services: OutreachServices, command: RecordCallOutcome): Promise<CommandResult> {
  let eligibility = services.clickToCallEligibility;
  if (command.confirmedPhoneE164 !== null) {
    const confirmed = await confirmedNumber(database, scope, command.phoneObservationId, command.confirmedPhoneE164);
    if (!confirmed) return refusedResult(command.action, ["phone_confirmation_mismatch"]);
    eligibility = withOwnerConfirmedNumber(eligibility, confirmed);
  }
  const manualCall = createD1ManualCallService(database, { workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, now: scope.now }, { eligibility });
  try {
    const view = await manualCall.projectManualCall({ packageApprovalId: command.packageApprovalId, phoneObservationId: command.phoneObservationId });
    const result = await manualCall.recordOutcome({
      ...view.request, expectedDecisionDigest: command.expectedDecisionDigest, outcome: command.outcome,
      notes: command.notes, idempotencyKey: command.idempotencyKey,
    });
    const extra: Record<string, unknown> = { outcome: result.outcome, followUpAuthorized: false, phoneEffectAuthorized: false };
    if ("suppression" in result && result.suppression && typeof result.suppression === "object") {
      const suppression = result.suppression as { contactPhoneBlocked: boolean; numberBlocked: boolean };
      extra.suppression = { contactPhoneBlocked: suppression.contactPhoneBlocked === true, numberBlocked: suppression.numberBlocked === true };
    }
    return completed(command.action, result.replayed, extra);
  } catch (error) {
    if (error instanceof ManualCallDecisionError) return refusedResult(command.action, [decisionReason(error)]);
    throw error;
  }
}

/** The owner-entered number, normalized to E.164, only when it digests to the stored phone point. */
async function confirmedNumber(database: D1Database, scope: OutreachScope, phoneObservationId: string, value: string) {
  const normalized = normalizeE164Phone(value);
  if (!normalized) return null;
  const row = await database.prepare(
    "SELECT contact_point_digest FROM contact_point_observations WHERE id=? AND workspace_id=? AND kind='phone' LIMIT 1",
  ).bind(phoneObservationId, scope.workspaceId).first<{ contact_point_digest: string }>();
  if (!row || !DIGEST.test(row.contact_point_digest)) return null;
  return (await phoneDigest(normalized)) === row.contact_point_digest ? normalized : null;
}

async function messagePackageVersion(database: D1Database, scope: OutreachScope, messageVersionId: string) {
  const row = await database.prepare(
    `SELECT mv.package_version_id FROM outreach_message_versions mv JOIN workspaces w ON w.id=mv.workspace_id AND w.owner_subject=?
     WHERE mv.id=? AND mv.workspace_id=? LIMIT 1`,
  ).bind(scope.ownerSubject, messageVersionId, scope.workspaceId).first<{ package_version_id: string }>();
  return row && validId(row.package_version_id) ? row.package_version_id : null;
}

/** The single current active sender connection the server knows. The browser never names one. */
async function currentSenderConnection(database: D1Database, scope: OutreachScope): Promise<string | "ambiguous" | null> {
  const rows = (await database.prepare(
    `SELECT connection.id FROM outreach_sender_connections connection
     JOIN workspaces w ON w.id=connection.workspace_id AND w.owner_subject=?
     WHERE connection.workspace_id=? AND connection.status='active'
       AND NOT EXISTS (SELECT 1 FROM outreach_sender_connections later WHERE later.workspace_id=connection.workspace_id
         AND later.provider=connection.provider AND later.connection_subject_digest=connection.connection_subject_digest
         AND later.protected_reference_version>connection.protected_reference_version)
     ORDER BY connection.id LIMIT 2`,
  ).bind(scope.ownerSubject, scope.workspaceId).all<{ id: string }>()).results ?? [];
  if (rows.length > 1) return "ambiguous";
  return rows.length === 1 && validId(rows[0].id) ? rows[0].id : null;
}

function completed(action: OutreachCommand["action"], replayed: boolean, extra: Record<string, unknown>): CommandResult {
  return Object.freeze({ action, status: replayed ? "replayed" as const : "applied" as const, reasonCodes: Object.freeze([]), providerCalls: 0 as const, ...extra });
}

function refusedResult(action: OutreachCommand["action"], reasons: readonly string[]): CommandResult {
  const reasonCodes = [...new Set(reasons.filter((reason) => typeof reason === "string" && REASON.test(reason)))].slice(0, 16);
  return Object.freeze({ action, status: "refused" as const, reasonCodes: Object.freeze(reasonCodes.length > 0 ? reasonCodes : ["refused"]), providerCalls: 0 as const });
}

function decisionReason(error: ManualCallDecisionError) {
  const reason = error.message.startsWith("manual_call_decision:") ? error.message.slice("manual_call_decision:".length) : "";
  return REASON.test(reason) ? reason : "manual_call_refused";
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

type PackageRow = {
  id: string; package_id: string; version: number; artifact_digest: string; snapshot_json: string; created_at: number; contact_id: string;
  latest_version: number; approval_id: string | null; approval_digest: string | null; expires_at: number | null; revoked: number;
};
type MessageRow = {
  id: string; message_id: string; version: number; package_version_id: string; artifact_digest: string; snapshot_json: string;
  intended_send_at: number | null; timezone: string; latest_version: number;
  approval_id: string | null; approval_digest: string | null; approval_expires_at: number | null; approval_package_approval_id: string | null; approval_revoked: number;
  rda_package_approval_id: string | null; acknowledgement_digest: string | null; valid_until: number | null;
  jurisdiction_code: string | null; claimed_basis_code: string | null; unsubscribe_status: string | null; outbox_item_id: string | null;
};
type DeliveryRow = { id: string; message_version_id: string; state: string; revision: number; reason_code: string; created_at: number };

/** The authoritative read projection. Values are bounded; no token digest, phone number or credential is included. */
export async function readOutreachProjection(database: D1Database, scope: OutreachScope, services: OutreachServices) {
  const now = scope.now();
  const synthetic = services.mode === "synthetic";
  const [packageRows, messageRows, deliveryRows, suppressionRows, stopRows] = await Promise.all([
    database.prepare(
      `SELECT pv.id,pv.package_id,pv.version,pv.artifact_digest,pv.snapshot_json,pv.created_at,op.contact_id,
         (SELECT max(later.version) FROM outreach_package_versions later WHERE later.workspace_id=pv.workspace_id AND later.package_id=pv.package_id) latest_version,
         pa.id approval_id,pa.approval_digest,pa.expires_at,
         EXISTS (SELECT 1 FROM outreach_approval_revocations r WHERE r.workspace_id=pv.workspace_id AND r.package_approval_id=pa.id) revoked
       FROM outreach_package_versions pv
       JOIN workspaces w ON w.id=pv.workspace_id AND w.owner_subject=?
       JOIN outreach_packages op ON op.id=pv.package_id AND op.workspace_id=pv.workspace_id
       LEFT JOIN outreach_package_approvals pa ON pa.package_version_id=pv.id AND pa.workspace_id=pv.workspace_id
       WHERE pv.workspace_id=? ORDER BY pv.created_at DESC,pv.id LIMIT ?`,
    ).bind(scope.ownerSubject, scope.workspaceId, MAX_PACKAGES).all<PackageRow>(),
    database.prepare(
      `SELECT mv.id,mv.message_id,mv.version,mv.package_version_id,mv.artifact_digest,mv.snapshot_json,mv.intended_send_at,mv.timezone,
         (SELECT max(later.version) FROM outreach_message_versions later WHERE later.workspace_id=mv.workspace_id AND later.message_id=mv.message_id) latest_version,
         ma.id approval_id,ma.approval_digest,ma.expires_at approval_expires_at,ma.package_approval_id approval_package_approval_id,
         EXISTS (SELECT 1 FROM outreach_approval_revocations r WHERE r.workspace_id=mv.workspace_id AND r.message_approval_id=ma.id) approval_revoked,
         rda.package_approval_id rda_package_approval_id,rda.acknowledgement_digest,rda.valid_until,rda.jurisdiction_code,rda.claimed_basis_code,
         (SELECT u.status FROM outreach_unsubscribe_authority_events u WHERE u.recipient_authority_id=rda.id AND u.workspace_id=rda.workspace_id ORDER BY u.revision DESC LIMIT 1) unsubscribe_status,
         item.id outbox_item_id
       FROM outreach_message_versions mv
       JOIN workspaces w ON w.id=mv.workspace_id AND w.owner_subject=?
       LEFT JOIN outreach_message_approvals ma ON ma.message_version_id=mv.id AND ma.workspace_id=mv.workspace_id
       LEFT JOIN outreach_recipient_dispatch_authorities rda ON rda.message_version_id=mv.id AND rda.workspace_id=mv.workspace_id
       LEFT JOIN outreach_outbox_items item ON item.message_approval_id=ma.id AND item.workspace_id=mv.workspace_id
       WHERE mv.workspace_id=? ORDER BY mv.created_at DESC,mv.id LIMIT ?`,
    ).bind(scope.ownerSubject, scope.workspaceId, MAX_MESSAGES).all<MessageRow>(),
    database.prepare(
      `SELECT item.id,item.message_version_id,e.state,e.revision,e.reason_code,e.created_at
       FROM outreach_outbox_items item
       JOIN workspaces w ON w.id=item.workspace_id AND w.owner_subject=?
       JOIN outreach_outbox_events e ON e.outbox_item_id=item.id AND e.workspace_id=item.workspace_id
         AND e.revision=(SELECT max(x.revision) FROM outreach_outbox_events x WHERE x.outbox_item_id=item.id AND x.workspace_id=item.workspace_id)
       WHERE item.workspace_id=? ORDER BY item.created_at DESC,item.id LIMIT ?`,
    ).bind(scope.ownerSubject, scope.workspaceId, MAX_HISTORY).all<DeliveryRow>(),
    database.prepare(
      `SELECT s.id,s.subject_kind,s.channel,s.reason,s.effective_at,s.alias_snapshot_json FROM outreach_suppression_tombstones s
       JOIN workspaces w ON w.id=s.workspace_id AND w.owner_subject=?
       WHERE s.workspace_id=? ORDER BY s.effective_at DESC,s.id LIMIT ?`,
    ).bind(scope.ownerSubject, scope.workspaceId, MAX_HISTORY).all<{ id: string; subject_kind: string; channel: string; reason: string; effective_at: number; alias_snapshot_json: string }>(),
    database.prepare(
      `SELECT s.id,s.stop_kind,s.subject_kind,s.reason_code,s.effective_at FROM outreach_stop_events s
       JOIN workspaces w ON w.id=s.workspace_id AND w.owner_subject=?
       WHERE s.workspace_id=? ORDER BY s.effective_at DESC,s.id LIMIT ?`,
    ).bind(scope.ownerSubject, scope.workspaceId, MAX_HISTORY).all<{ id: string; stop_kind: string; subject_kind: string; reason_code: string; effective_at: number }>(),
  ]);

  const delivery = (deliveryRows.results ?? []).map((row) => Object.freeze({
    outboxItemId: row.id, messageVersionId: row.message_version_id, state: row.state, revision: Number(row.revision),
    reasonCode: boundedCode(row.reason_code), at: Number(row.created_at),
  }));
  const deliveryById = new Map(delivery.map((row) => [row.outboxItemId, row]));

  const packages = [];
  const calls = [];
  for (const row of packageRows.results ?? []) {
    const snapshot = parseJson(row.snapshot_json) as Record<string, unknown> | null;
    if (!snapshot) continue;
    const bindings = ((await database.prepare(
      `SELECT binding_kind,binding_id,binding_digest FROM outreach_artifact_bindings
       WHERE workspace_id=? AND artifact_kind='package_version' AND artifact_id=? ORDER BY ordinal LIMIT 128`,
    ).bind(scope.workspaceId, row.id).all<{ binding_kind: string; binding_id: string; binding_digest: string }>()).results ?? [])
      .map((binding) => Object.freeze({ kind: binding.binding_kind, id: binding.binding_id, digest: binding.binding_digest }));
    const latest = Number(row.latest_version) === Number(row.version);
    let approval = null;
    if (row.approval_id) {
      const inputs = await services.authorityInputs(row.id);
      const current = await services.packages.projectApproval({ packageApprovalId: row.approval_id, currentDependencies: inputs.currentDependencies, contactEvidence: inputs.contactEvidence });
      approval = Object.freeze({
        id: row.approval_id, approvalDigest: row.approval_digest, expiresAt: Number(row.expires_at),
        state: Number(row.revoked) === 1 ? "revoked" : !latest ? "superseded" : Number(row.expires_at) <= now ? "expired" : "recorded",
        authority: "crm_eligibility_only" as const,
        current: Object.freeze({ crmEligible: current.crmEligible === true, reasonCodes: Object.freeze(current.reasonCodes.filter((code) => REASON.test(code)).slice(0, 16)) }),
      });
      calls.push(...await phoneCalls(database, scope, services, row, snapshot));
    }
    packages.push(Object.freeze({
      packageId: row.package_id, packageVersionId: row.id, version: Number(row.version), latest, artifactDigest: row.artifact_digest,
      createdAt: Number(row.created_at), recommendedAngle: text(snapshot.recommendedAngle, 2_000), selectedRole: text(snapshot.selectedRole, 32),
      callScript: text(snapshot.callScript, 4_000), evidenceCount: listLength(snapshot.evidenceDigests),
      claimGuardrailCount: listLength(snapshot.claimGuardrailDigests), selectedContactPointCount: listLength(snapshot.selectedContactPointDigests),
      draftMessageCount: listLength(snapshot.draftMessageIds), bindings: Object.freeze(bindings), approval,
    }));
  }

  const messages = [];
  for (const row of messageRows.results ?? []) {
    const snapshot = parseJson(row.snapshot_json) as Record<string, unknown> | null;
    if (!snapshot) continue;
    const outbox = row.outbox_item_id ? deliveryById.get(row.outbox_item_id) ?? null : null;
    messages.push(Object.freeze({
      messageId: row.message_id, messageVersionId: row.id, version: Number(row.version), latest: Number(row.latest_version) === Number(row.version),
      packageVersionId: row.package_version_id, artifactDigest: row.artifact_digest,
      from: text(snapshot.from, 320), replyTo: snapshot.replyTo === null ? null : text(snapshot.replyTo, 320),
      to: textList(snapshot.to, 32, 320), cc: textList(snapshot.cc, 32, 320), bccCount: listLength(snapshot.bcc),
      subject: text(snapshot.subject, 998), textPreview: text(snapshot.textBody, MAX_TEXT_PREVIEW), htmlPartPresent: typeof snapshot.htmlBody === "string",
      links: textList(snapshot.links, 64, 2_048),
      attachments: Object.freeze((Array.isArray(snapshot.attachments) ? snapshot.attachments : []).slice(0, 16).map((item: Record<string, unknown>) => Object.freeze({
        name: text(item?.name, 255), mediaType: text(item?.mediaType, 128), digest: text(item?.digest, 64),
      }))),
      intendedSendAt: row.intended_send_at === null ? null : Number(row.intended_send_at), timezone: text(row.timezone, 64),
      approval: row.approval_id ? Object.freeze({
        id: row.approval_id, approvalDigest: row.approval_digest, expiresAt: Number(row.approval_expires_at), packageApprovalId: row.approval_package_approval_id,
        state: Number(row.approval_revoked) === 1 ? "revoked" : row.outbox_item_id ? "consumed" : Number(row.approval_expires_at) <= now ? "expired" : "recorded",
        authority: "exact_message_only" as const,
      }) : null,
      recipientAuthority: row.acknowledgement_digest ? Object.freeze({
        packageApprovalId: row.rda_package_approval_id, acknowledgementDigest: row.acknowledgement_digest, validUntil: Number(row.valid_until),
        unsubscribeStatus: row.unsubscribe_status ?? "unknown", jurisdictionCode: text(row.jurisdiction_code, 16), claimedBasisCode: text(row.claimed_basis_code, 32),
      }) : null,
      outbox: outbox ? Object.freeze({ outboxItemId: outbox.outboxItemId, state: outbox.state, revision: outbox.revision, reasonCode: outbox.reasonCode }) : null,
    }));
  }

  const blockedReason = "Approvals, queueing and calls are refused until contact readiness checks (Phase 5) are accepted. Nothing is sent and no call is placed.";
  return Object.freeze({
    schema: OUTREACH_PROJECTION_SCHEMA,
    generatedAt: now,
    gates: Object.freeze({
      approval: Object.freeze({ available: synthetic, reason: synthetic ? "Synthetic test readiness only." : blockedReason }),
      queue: Object.freeze({ available: synthetic, reason: synthetic ? "Synthetic test readiness only." : "Queueing is refused until contact readiness checks are accepted and Gmail is authorized. No email will be sent." }),
      phone: Object.freeze({ enabled: false as const, reason: PHONE_ACTION_DISABLED_REASON }),
    }),
    packages: Object.freeze(packages),
    messages: Object.freeze(messages),
    calls: Object.freeze(calls),
    suppressions: Object.freeze((suppressionRows.results ?? []).map((row) => Object.freeze({
      id: row.id, subjectKind: row.subject_kind, channel: row.channel, reason: row.reason, effectiveAt: Number(row.effective_at),
      aliasCount: listLength(parseJson(row.alias_snapshot_json)),
    }))),
    stops: Object.freeze((stopRows.results ?? []).map((row) => Object.freeze({
      id: row.id, stopKind: row.stop_kind, subjectKind: row.subject_kind, reasonCode: boundedCode(row.reason_code), effectiveAt: Number(row.effective_at),
    }))),
    delivery: Object.freeze(delivery),
    draftCandidates: await listDraftCandidates(database, repositoryScopeOf(scope)),
    effects: Object.freeze({ providerCalls: 0 as const }),
  });
}

async function phoneCalls(database: D1Database, scope: OutreachScope, services: OutreachServices, row: PackageRow, snapshot: Record<string, unknown>) {
  const selected = new Set(Array.isArray(snapshot.selectedContactPointDigests) ? snapshot.selectedContactPointDigests.filter((value) => typeof value === "string") : []);
  if (selected.size === 0 || !row.approval_id) return [];
  const phones = ((await database.prepare(
    "SELECT id,contact_point_digest FROM contact_point_observations WHERE workspace_id=? AND contact_id=? AND kind='phone' ORDER BY id LIMIT 32",
  ).bind(scope.workspaceId, row.contact_id).all<{ id: string; contact_point_digest: string }>()).results ?? [])
    .filter((phone) => selected.has(phone.contact_point_digest)).slice(0, MAX_PHONES_PER_PACKAGE);
  if (phones.length === 0) return [];
  const manualCall: ManualCallService = createD1ManualCallService(database, { workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, now: scope.now }, { eligibility: services.clickToCallEligibility });
  const cards = [];
  for (const phone of phones) {
    try {
      const view = await manualCall.projectManualCall({ packageApprovalId: row.approval_id, phoneObservationId: phone.id });
      cards.push(Object.freeze({
        packageApprovalId: row.approval_id, phoneObservationId: phone.id, packageArtifactDigest: row.artifact_digest,
        decision: Object.freeze({
          eligible: view.decision.eligible === true,
          reasonCodes: Object.freeze(view.decision.reasonCodes.filter((code) => REASON.test(code)).slice(0, 16)),
          decisionDigest: view.decision.decisionDigest,
        }),
        // Disabled until 06-13 Task 3 owner UAT, even when the decision is eligible.
        phoneAction: Object.freeze({ enabled: false as const, reason: view.phoneAction.reason }),
      }));
    } catch (error) {
      if (!(error instanceof ManualCallDecisionError)) throw error;
    }
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repositoryScopeOf(scope: OutreachScope): OutreachRepositoryScope {
  return Object.freeze({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, now: scope.now });
}
function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function parseJson(value: unknown): unknown { try { return typeof value === "string" ? JSON.parse(value) : null; } catch { return null; } }
function text(value: unknown, maximum: number) { return typeof value === "string" ? value.slice(0, maximum) : ""; }
function textList(value: unknown, maximumItems: number, maximumLength: number) {
  return Object.freeze(Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, maximumItems).map((item) => item.slice(0, maximumLength)) : []);
}
function listLength(value: unknown) { return Array.isArray(value) ? value.length : 0; }
function boundedCode(value: unknown) { return typeof value === "string" && REASON.test(value) ? value : "unspecified"; }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function privateWorkspaceUnavailable() { return json({ error: "private_workspace_unavailable" }, 404); }
