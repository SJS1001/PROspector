import React from "react";

/**
 * Pure Outreach leaves (06-08, local). They render a typed server projection
 * as escaped text and call back to the single transport owner. They never
 * fetch, retry, decide eligibility or enable an action the projection refuses.
 * Message links are shown as text, never as live links, and there is no dial
 * or mail link anywhere.
 */

export type OutreachGate = Readonly<{ available: boolean; reason: string }>;
export type OutreachPackageCard = Readonly<{
  packageId: string; packageVersionId: string; version: number; latest: boolean; artifactDigest: string; createdAt: number;
  recommendedAngle: string; selectedRole: string; callScript: string; evidenceCount: number; claimGuardrailCount: number;
  selectedContactPointCount: number; draftMessageCount: number; bindings: readonly Readonly<{ kind: string; id: string; digest: string }>[];
  approval: null | Readonly<{ id: string; approvalDigest: string; expiresAt: number; state: string; authority: string; current: Readonly<{ crmEligible: boolean; reasonCodes: readonly string[] }> }>;
}>;
export type OutreachMessageCard = Readonly<{
  messageId: string; messageVersionId: string; version: number; latest: boolean; packageVersionId: string; artifactDigest: string;
  from: string; replyTo: string | null; to: readonly string[]; cc: readonly string[]; bccCount: number; subject: string; textPreview: string;
  htmlPartPresent: boolean; links: readonly string[]; attachments: readonly Readonly<{ name: string; mediaType: string; digest: string }>[];
  intendedSendAt: number | null; timezone: string;
  approval: null | Readonly<{ id: string; approvalDigest: string; expiresAt: number; packageApprovalId: string; state: string; authority: string }>;
  recipientAuthority: null | Readonly<{ packageApprovalId: string; acknowledgementDigest: string; validUntil: number; unsubscribeStatus: string; jurisdictionCode: string; claimedBasisCode: string }>;
  outbox: null | Readonly<{ outboxItemId: string; state: string; revision: number; reasonCode: string }>;
}>;
export type OutreachCallCard = Readonly<{
  packageApprovalId: string; phoneObservationId: string; packageArtifactDigest: string;
  decision: Readonly<{ eligible: boolean; reasonCodes: readonly string[]; decisionDigest: string }>;
  phoneAction: Readonly<{ enabled: false; reason: string }>;
}>;
export type OutreachDraftCandidate = Readonly<{
  prospectId: string; contactId: string; contactName: string; ready: boolean; reasonCodes: readonly string[];
  alreadyDrafted: boolean; recipientConfirmationRequired: boolean;
}>;
export type OutreachProjection = Readonly<{
  schema: "outreach-projection/v1"; generatedAt: number;
  gates: Readonly<{ approval: OutreachGate; queue: OutreachGate; phone: Readonly<{ enabled: false; reason: string }> }>;
  packages: readonly OutreachPackageCard[]; messages: readonly OutreachMessageCard[]; calls: readonly OutreachCallCard[];
  suppressions: readonly Readonly<{ id: string; subjectKind: string; channel: string; reason: string; effectiveAt: number; aliasCount: number }>[];
  stops: readonly Readonly<{ id: string; stopKind: string; subjectKind: string; reasonCode: string; effectiveAt: number }>[];
  delivery: readonly Readonly<{ outboxItemId: string; messageVersionId: string; state: string; revision: number; reasonCode: string; at: number }>[];
  draftCandidates: readonly OutreachDraftCandidate[];
  effects: Readonly<{ providerCalls: 0 }>;
}>;

export const BLOCKED_OUTREACH_PROJECTION: OutreachProjection = Object.freeze({
  schema: "outreach-projection/v1", generatedAt: 0,
  gates: Object.freeze({
    approval: Object.freeze({ available: false, reason: "Outreach status has not loaded yet. Nothing can be approved." }),
    queue: Object.freeze({ available: false, reason: "Outreach status has not loaded yet. No email will be sent." }),
    phone: Object.freeze({ enabled: false as const, reason: "owner_uat_pending" }),
  }),
  packages: [], messages: [], calls: [], suppressions: [], stops: [], delivery: [], draftCandidates: [], effects: Object.freeze({ providerCalls: 0 as const }),
});

export type CallForm = Readonly<{ outcome: string; notes: string; number: string }>;
export type SuppressionForm = Readonly<{ subjectKind: string; value: string; channel: string; reason: string }>;
export type Confirming = null | Readonly<{ kind: "suppression" }> | Readonly<{ kind: "do_not_call"; callKey: string }>;
export const EMPTY_CALL_FORM: CallForm = Object.freeze({ outcome: "connected", notes: "", number: "" });
export const EMPTY_SUPPRESSION_FORM: SuppressionForm = Object.freeze({ subjectKind: "exact_email", value: "", channel: "email", reason: "owner_request" });

export type OutreachInteraction = Readonly<{
  pending: boolean;
  reviewed: Readonly<Record<string, boolean>>;
  callForms: Readonly<Record<string, CallForm>>;
  suppressionForm: SuppressionForm;
  confirming: Confirming;
  /** Owner-typed recipient confirmations, keyed by draftKey. */
  draftForms: Readonly<Record<string, string>>;
  onDraftChange(key: string, value: string): void;
  onDraft(candidate: OutreachDraftCandidate): void;
  onReview(key: string, value: boolean): void;
  onApprovePackage(card: OutreachPackageCard): void;
  onApproveMessage(card: OutreachMessageCard): void;
  onQueue(card: OutreachMessageCard): void;
  onCallChange(key: string, patch: Partial<CallForm>): void;
  onRecordCall(card: OutreachCallCard): void;
  onSuppressionChange(patch: Partial<SuppressionForm>): void;
  onConfirm(confirming: Confirming): void;
  onConfirmSuppression(): void;
}>;

const noop = () => undefined;
export const READ_ONLY_INTERACTION: OutreachInteraction = Object.freeze({
  pending: false, reviewed: {}, callForms: {}, suppressionForm: EMPTY_SUPPRESSION_FORM, confirming: null,
  draftForms: {}, onDraftChange: noop, onDraft: noop,
  onReview: noop, onApprovePackage: noop, onApproveMessage: noop, onQueue: noop, onCallChange: noop, onRecordCall: noop,
  onSuppressionChange: noop, onConfirm: noop, onConfirmSuppression: noop,
});

export const OUTCOME_LABELS: Readonly<Record<string, string>> = Object.freeze({
  connected: "Connected", voicemail: "Left voicemail", no_answer: "No answer", wrong_number: "Wrong number", do_not_call: "Do not call", follow_up: "Follow up later",
});
const SUBJECT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  exact_email: "Exact email address", confirmed_email_domain: "Confirmed email domain (and its subdomains)", e164_phone: "Phone number (E.164, for example +14165550100)",
  contact: "Contact (all of this contact's addresses and numbers)", organization: "Organization", company: "All outreach for this company",
});
const CHANNEL_OPTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  exact_email: ["email", "all"], confirmed_email_domain: ["email", "all"], e164_phone: ["phone", "all"], contact: ["email", "phone", "all"], company: ["email", "phone", "all"],
});
const VALUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  exact_email: "Email address", confirmed_email_domain: "Email domain", e164_phone: "Phone number", contact: "Contact reference",
});
const CHANNEL_LABELS: Readonly<Record<string, string>> = Object.freeze({ email: "Email", phone: "Phone", all: "Email and phone" });
const SUPPRESSION_REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  owner_request: "Owner decision", explicit_opt_out: "Recipient opted out", unsubscribe: "Unsubscribe link", do_not_call: "Do not call", identity_retention: "Kept through a contact merge", import_retention: "Kept through an import",
});
const DELIVERY_COPY: Readonly<Record<string, string>> = Object.freeze({
  pending: "Queued for controlled delivery",
  leased: "Getting ready to send; current safety checks are running.",
  dispatching: "Getting ready to send; current safety checks are running.",
  sent: "Gmail accepted this message.",
  cancelled: "Cancelled before dispatch. Nothing was sent.",
  failed_before_dispatch: "Failed before dispatch. Nothing was sent.",
  delivery_unknown: "Gmail acceptance could not be confirmed. PROspector will not resend automatically.",
});

const REASONS: Readonly<Record<string, string>> = Object.freeze({
  contact_recheck_blocked: "Contact readiness checks are not accepted yet, so this is not available.",
  contact_recheck_unavailable: "Contact readiness could not be checked.",
  contact_not_ready: "The contact is not ready for outreach.",
  contact_point_missing: "A selected contact point has no current verification.",
  current_dependencies_invalid: "The current evidence could not be read.",
  reviewed_digest_mismatch: "The version changed after you reviewed it. Review the current version.",
  superseded_by_newer_version: "A newer version exists. Review that version instead.",
  approval_missing: "There is no approval yet.",
  approval_expired: "The approval has expired.",
  approval_revoked: "The approval was revoked.",
  approval_digest_mismatch: "The approval does not match this exact version.",
  package_version_unavailable: "This package version is not available.",
  package_approval_unavailable: "There is no package approval for this message.",
  package_approval_mismatch: "The package approval belongs to a different package version.",
  package_approval_not_current: "The package approval is not current.",
  message_version_unavailable: "This message version is not available.",
  acknowledgement_missing: "The compliance acknowledgement for this exact message is missing.",
  acknowledgement_expired: "The compliance acknowledgement has expired.",
  unsubscribe_path_not_working: "The unsubscribe path is not confirmed as working.",
  approval_window_closed: "The approval window has closed.",
  idempotency_conflict: "This request conflicts with an earlier one. Reload and review again.",
  invalid_idempotency_key: "The request could not be matched to a single intent. Reload and try again.",
  gmail_unavailable: "Gmail delivery is unavailable. No email will be sent.",
  sender_ambiguous: "More than one Gmail sender is connected, so nothing was queued. No email will be sent.",
  current_authority_unavailable: "Current safety checks did not allow this. Nothing was queued or sent.",
  invalid_request: "The request was not valid.",
  write_failed: "The record could not be saved. Nothing else changed.",
  unknown_contact: "That contact is not in this workspace.",
  phone_confirmation_mismatch: "The number you entered does not match the stored phone for this contact. Nothing was recorded.",
  stale_or_ineligible: "This phone is not eligible for this outcome right now, or its status changed. Only Do not call can still be recorded.",
  authority_unavailable: "The call record for this phone is not available.",
  authority_changed: "The call status changed while saving. Reload and review again.",
  suppression_not_recorded: "The suppression could not be recorded, so the outcome was not saved.",
  invalid_synthetic_notes: "Notes cannot contain links, email addresses, phone numbers or credentials.",
  phone_not_current_verified: "The phone has no current verification.",
  phone_not_selected_by_package: "The package does not include this phone.",
  prospect_unavailable: "The prospect is not available.",
  contact_noncontactable: "The contact cannot be contacted.",
  suppressed: "A suppression blocks this phone.",
  invalid_command: "The request was not a valid Outreach command.",
  owner_uat_pending: "Phone calling stays off until the owner acceptance test is done (06-13).",
  not_eligible: "Phone is not eligible for calling.",
  eligibility_snapshot_unavailable: "There is no current, verified readiness check for this contact.",
  prospect_not_approved: "The prospect is not approved for outreach.",
  prospect_changed: "The prospect changed after the contact's readiness was checked.",
  contact_changed: "The contact changed after its readiness was checked.",
  contact_point_changed: "A contact point changed after the readiness check.",
  configuration_unavailable: "The profile configuration is not active.",
  configuration_changed: "The profile configuration changed after the readiness check.",
  knowledge_drift: "Product or market knowledge changed and needs review first.",
  qualification_unavailable: "The prospect's qualification result is not available.",
  review_decision_unavailable: "The owner's approval of this prospect is not available.",
  evidence_missing: "There is no current evidence with an available source.",
  source_missing: "An evidence source is not available.",
  claim_guardrail_missing: "There is no confirmed Claim Guardrail for this profile.",
  recipient_confirmation_required: "Type the contact's verified email address to confirm it.",
  recipient_confirmation_mismatch: "The address you typed does not match the contact's verified email. Nothing was drafted.",
  sender_address_unavailable: "The owner's sending address is not known.",
  package_already_drafted: "This prospect and contact already has an Outreach Package.",
  invalid_draft_target: "The prospect or contact reference is not valid.",
});

/** Plain language for a server reason code. Unknown codes stay readable. */
export function reasonText(code: string): string {
  if (Object.hasOwn(REASONS, code)) return REASONS[code];
  const [prefix, detail] = code.split(":", 2);
  const label = (detail ?? "").replaceAll("_", " ");
  if (prefix === "dependency_missing") return `The current ${label} could not be verified.`;
  if (prefix === "dependency_changed") return `The ${label} changed since this version was made.`;
  if (prefix === "dependency_added") return `A new ${label} exists that this version does not include.`;
  if (prefix === "contact") return `Contact check: ${label}.`;
  if (code.startsWith("contact_point_")) return `A selected contact point is ${code.slice("contact_point_".length).replaceAll("_", " ")}.`;
  return `Not available: ${code.replaceAll(/[_:]/gu, " ")}.`;
}
function reasonList(codes: readonly string[]) { return codes.length === 0 ? "" : codes.map(reasonText).join(" "); }

// ---------------------------------------------------------------------------
// Normalization: the client accepts only the projection shape, bounded.
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function str(value: unknown, max = 4_000) { return typeof value === "string" ? value.slice(0, max) : ""; }
function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function list<T>(value: unknown, map: (item: Record<string, unknown>) => T | null, max = 64): readonly T[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze(value.slice(0, max).map((item) => { const r = rec(item); return r ? map(r) : null; }).filter((item): item is T => item !== null));
}
function strs(value: unknown, max = 64, length = 2_048) { return Object.freeze(Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, max).map((item) => item.slice(0, length)) : []); }
/**
 * The server's gate copy is shared with other callers and stays unchanged, so
 * the owner screen maps it here: known sentences get plain wording, and any
 * other sentence loses phase numbers and refusal wording. Availability is
 * never derived from the text.
 */
const GATE_REASONS: Readonly<Record<string, string>> = Object.freeze({
  "Approvals, queueing and calls are refused until contact readiness checks (Phase 5) are accepted. Nothing is sent and no call is placed.":
    "Approving, queueing and calling stay off until contact readiness checks are accepted. Nothing is sent and no call is placed.",
  "Queueing is refused until contact readiness checks are accepted and Gmail is authorized. No email will be sent.":
    "Queueing stays off until contact readiness checks are accepted and Gmail is authorized. No email will be sent.",
});
export function plainGateReason(reason: string): string {
  if (Object.hasOwn(GATE_REASONS, reason)) return GATE_REASONS[reason];
  return reason
    .replaceAll(/\s*\(Phase \d+\)/gu, "")
    .replaceAll(/\b(is|are) refused\b/giu, "$1 not available")
    .replaceAll(/\brefus(?:ed|al|es)?\b/giu, "not available")
    .replace(/^not available/u, "Not available");
}
function gate(value: unknown): OutreachGate { const r = rec(value); return Object.freeze({ available: r?.available === true, reason: plainGateReason(str(r?.reason, 400)) || "Unavailable." }); }

export function normalizeOutreachProjection(value: unknown): OutreachProjection | null {
  const body = rec(value);
  if (!body || body.schema !== "outreach-projection/v1") return null;
  const gates = rec(body.gates);
  if (!gates || !Array.isArray(body.packages) || !Array.isArray(body.messages) || !Array.isArray(body.calls)) return null;
  const phone = rec(gates.phone);
  return Object.freeze({
    schema: "outreach-projection/v1" as const,
    generatedAt: num(body.generatedAt),
    // The phone action can never be enabled by a projection in this build.
    gates: Object.freeze({ approval: gate(gates.approval), queue: gate(gates.queue), phone: Object.freeze({ enabled: false as const, reason: str(phone?.reason, 64) || "owner_uat_pending" }) }),
    packages: list(body.packages, (item) => {
      const approval = rec(item.approval); const current = rec(approval?.current);
      return Object.freeze({
        packageId: str(item.packageId, 128), packageVersionId: str(item.packageVersionId, 128), version: num(item.version), latest: item.latest === true,
        artifactDigest: str(item.artifactDigest, 64), createdAt: num(item.createdAt), recommendedAngle: str(item.recommendedAngle, 2_000),
        selectedRole: str(item.selectedRole, 32), callScript: str(item.callScript, 4_000), evidenceCount: num(item.evidenceCount),
        claimGuardrailCount: num(item.claimGuardrailCount), selectedContactPointCount: num(item.selectedContactPointCount), draftMessageCount: num(item.draftMessageCount),
        bindings: list(item.bindings, (binding) => Object.freeze({ kind: str(binding.kind, 32), id: str(binding.id, 128), digest: str(binding.digest, 64) }), 128),
        approval: approval ? Object.freeze({
          id: str(approval.id, 128), approvalDigest: str(approval.approvalDigest, 64), expiresAt: num(approval.expiresAt), state: str(approval.state, 32),
          authority: str(approval.authority, 32), current: Object.freeze({ crmEligible: current?.crmEligible === true, reasonCodes: strs(current?.reasonCodes, 16, 96) }),
        }) : null,
      });
    }, 20),
    messages: list(body.messages, (item) => {
      const approval = rec(item.approval); const authority = rec(item.recipientAuthority); const outbox = rec(item.outbox);
      return Object.freeze({
        messageId: str(item.messageId, 128), messageVersionId: str(item.messageVersionId, 128), version: num(item.version), latest: item.latest === true,
        packageVersionId: str(item.packageVersionId, 128), artifactDigest: str(item.artifactDigest, 64), from: str(item.from, 320),
        replyTo: typeof item.replyTo === "string" ? item.replyTo.slice(0, 320) : null, to: strs(item.to, 32, 320), cc: strs(item.cc, 32, 320), bccCount: num(item.bccCount),
        subject: str(item.subject, 998), textPreview: str(item.textPreview, 2_000), htmlPartPresent: item.htmlPartPresent === true, links: strs(item.links, 64),
        attachments: list(item.attachments, (attachment) => Object.freeze({ name: str(attachment.name, 255), mediaType: str(attachment.mediaType, 128), digest: str(attachment.digest, 64) }), 16),
        intendedSendAt: typeof item.intendedSendAt === "number" ? item.intendedSendAt : null, timezone: str(item.timezone, 64),
        approval: approval ? Object.freeze({ id: str(approval.id, 128), approvalDigest: str(approval.approvalDigest, 64), expiresAt: num(approval.expiresAt), packageApprovalId: str(approval.packageApprovalId, 128), state: str(approval.state, 32), authority: str(approval.authority, 32) }) : null,
        recipientAuthority: authority ? Object.freeze({
          packageApprovalId: str(authority.packageApprovalId, 128), acknowledgementDigest: str(authority.acknowledgementDigest, 64), validUntil: num(authority.validUntil),
          unsubscribeStatus: str(authority.unsubscribeStatus, 32), jurisdictionCode: str(authority.jurisdictionCode, 16), claimedBasisCode: str(authority.claimedBasisCode, 32),
        }) : null,
        outbox: outbox ? Object.freeze({ outboxItemId: str(outbox.outboxItemId, 128), state: str(outbox.state, 32), revision: num(outbox.revision), reasonCode: str(outbox.reasonCode, 96) }) : null,
      });
    }, 40),
    calls: list(body.calls, (item) => {
      const decision = rec(item.decision); const action = rec(item.phoneAction);
      return Object.freeze({
        packageApprovalId: str(item.packageApprovalId, 128), phoneObservationId: str(item.phoneObservationId, 128), packageArtifactDigest: str(item.packageArtifactDigest, 64),
        decision: Object.freeze({ eligible: decision?.eligible === true, reasonCodes: strs(decision?.reasonCodes, 16, 96), decisionDigest: str(decision?.decisionDigest, 64) }),
        phoneAction: Object.freeze({ enabled: false as const, reason: str(action?.reason, 64) || "owner_uat_pending" }),
      });
    }, 80),
    suppressions: list(body.suppressions, (item) => Object.freeze({ id: str(item.id, 128), subjectKind: str(item.subjectKind, 32), channel: str(item.channel, 16), reason: str(item.reason, 32), effectiveAt: num(item.effectiveAt), aliasCount: num(item.aliasCount) }), 50),
    stops: list(body.stops, (item) => Object.freeze({ id: str(item.id, 128), stopKind: str(item.stopKind, 32), subjectKind: str(item.subjectKind, 32), reasonCode: str(item.reasonCode, 96), effectiveAt: num(item.effectiveAt) }), 50),
    delivery: list(body.delivery, (item) => Object.freeze({ outboxItemId: str(item.outboxItemId, 128), messageVersionId: str(item.messageVersionId, 128), state: str(item.state, 32), revision: num(item.revision), reasonCode: str(item.reasonCode, 96), at: num(item.at) }), 50),
    draftCandidates: list(body.draftCandidates, (item) => Object.freeze({
      prospectId: str(item.prospectId, 128), contactId: str(item.contactId, 128), contactName: str(item.contactName, 160),
      ready: item.ready === true, reasonCodes: strs(item.reasonCodes, 16, 96), alreadyDrafted: item.alreadyDrafted === true,
      recipientConfirmationRequired: item.recipientConfirmationRequired === true,
    }), 10),
    effects: Object.freeze({ providerCalls: 0 as const }),
  });
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

function when(ms: number | null) { return ms ? `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC` : "not set"; }
function safeId(value: string) { return value.replaceAll(/[^A-Za-z0-9_-]/gu, "-").slice(0, 80); }
export function draftKey(candidate: Pick<OutreachDraftCandidate, "prospectId" | "contactId">) { return `${candidate.prospectId}|${candidate.contactId}`; }
export function callKey(card: Pick<OutreachCallCard, "packageApprovalId" | "phoneObservationId">) { return `${card.packageApprovalId}|${card.phoneObservationId}`; }

/** A native control with an adjacent, focusable explanation. Disabled controls always say why. */
export function OutreachAction({ label, enabled, explanation, explanationId, onClick }: { label: string; enabled: boolean; explanation: string; explanationId: string; onClick?: () => void }) {
  return <p className="outreach-action"><button type="button" disabled={!enabled} aria-describedby={explanationId} onClick={enabled ? onClick : undefined}>{label}</button> <span id={explanationId} tabIndex={0}>{explanation}</span></p>;
}

/** The first 8 characters of a SHA-256 fingerprint: enough for the owner to match a version by eye. */
export function checkCode(digest: string) { return digest.slice(0, 8); }

function CheckCode({ digest }: { digest: string }) {
  return <p className="outreach-check-code">Check code <code>{checkCode(digest)}</code> identifies this exact version.</p>;
}

/** Exact references and full fingerprints, closed by default, in the same place on every card. */
function TechnicalDetails({ label, rows }: { label: string; rows: readonly (readonly [string, string])[] }) {
  return <details className="outreach-technical"><summary>{`Technical details for ${label}`}</summary>
    <dl>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd><code>{value}</code></dd></div>)}</dl>
  </details>;
}

function KeyValues({ rows, label }: { rows: readonly (readonly [string, React.ReactNode])[]; label: string }) {
  return <dl className="outreach-kv" aria-label={label}>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

function ReviewBox({ id, checked, disabled, label, onChange }: { id: string; checked: boolean; disabled: boolean; label: string; onChange(value: boolean): void }) {
  return <p><input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} /> <label htmlFor={id}>{label}</label></p>;
}

export function OutreachSections({ projection, interaction }: { projection: OutreachProjection; interaction: OutreachInteraction }) {
  return <>
    <EligibilitySection projection={projection} />
    <PackageSection projection={projection} interaction={interaction} />
    <MessageSection projection={projection} interaction={interaction} />
    <PhoneSection projection={projection} interaction={interaction} />
    <SuppressionSection projection={projection} interaction={interaction} />
    <DeliverySection projection={projection} />
  </>;
}

function EligibilitySection({ projection }: { projection: OutreachProjection }) {
  const { gates } = projection;
  return <section className="panel outreach-section" aria-labelledby="outreach-eligibility">
    <h2 id="outreach-eligibility">Outreach readiness</h2>
    <p role="note"><strong>{gates.approval.available ? "Synthetic test readiness." : "Outreach is not available yet."}</strong> {gates.approval.reason}</p>
    <KeyValues label="What outreach can do right now" rows={[
      ["Approve packages and messages", gates.approval.available ? "Available" : "Not available"],
      ["Queue email for delivery", gates.queue.available ? "Available" : `Not available. ${gates.queue.reason}`],
      ["Phone calls", reasonText(gates.phone.reason)],
      ["Status checked", when(projection.generatedAt || null)],
      ["Outside services contacted", "None (0 provider calls)"],
    ]} />
  </section>;
}

function PackageSection({ projection, interaction }: { projection: OutreachProjection; interaction: OutreachInteraction }) {
  return <section className="panel outreach-section" aria-labelledby="outreach-packages">
    <h2 id="outreach-packages">Outreach Packages to review</h2>
    <p>An Outreach Package is the plan for one prospect: the angle, the contact points and the drafts. Approving it allows CRM eligibility only. Each email still needs its own approval.</p>
    {projection.draftCandidates.length > 0 && <>
      <h3>Draft from current evidence</h3>
      <p>Drafts use fixed templates and cite the current evidence by reference. No AI or outside service writes them, and drafting approves nothing.</p>
      <ul className="outreach-cards" aria-label="Draft candidates">{projection.draftCandidates.map((candidate) => <DraftCandidateCard key={draftKey(candidate)} candidate={candidate} interaction={interaction} />)}</ul>
    </>}
    {projection.packages.length === 0
      ? <p>{projection.draftCandidates.length > 0 ? "No Outreach Package yet. Draft one from current evidence above, then review it here." : "No Outreach Package yet. A draft can be made here once an approved prospect has a contact whose readiness is current."}</p>
      : <ul className="outreach-cards" aria-label="Package versions">{projection.packages.map((card) => <PackageCard key={card.packageVersionId} card={card} gate={projection.gates.approval} interaction={interaction} />)}</ul>}
  </section>;
}

function DraftCandidateCard({ candidate, interaction }: { candidate: OutreachDraftCandidate; interaction: OutreachInteraction }) {
  const key = draftKey(candidate);
  const id = safeId(`draft-${key}`);
  const confirmation = (interaction.draftForms[key] ?? "").trim();
  const needsConfirmation = candidate.ready && candidate.recipientConfirmationRequired;
  const enabled = candidate.ready && !candidate.alreadyDrafted && !interaction.pending && (!needsConfirmation || confirmation.length > 0);
  const reason = candidate.alreadyDrafted ? "This prospect and contact already has an Outreach Package. Review it below. Nothing is approved or sent."
    : !candidate.ready ? `${reasonList(candidate.reasonCodes) || "Current evidence is not ready for a draft."} Nothing is approved or sent.`
      : interaction.pending ? "Saving…"
        : needsConfirmation && confirmation.length === 0 ? "Type the contact's verified email address to confirm it. Nothing is approved or sent."
          : "Creates a draft package and email draft from current evidence for your review. Nothing is approved or sent.";
  return <li className="outreach-card">
    <h4>{candidate.contactName || "Contact"}</h4>
    <KeyValues label={`Draft status for ${candidate.contactName || "this contact"}`} rows={[
      ["Current evidence", candidate.alreadyDrafted ? "Already drafted" : candidate.ready ? "Ready for a draft" : "Not ready"],
      ["Email draft", candidate.ready ? (candidate.recipientConfirmationRequired ? "Included after you confirm the address" : "None (no verified email)") : "Not available"],
    ]} />
    {needsConfirmation && !candidate.alreadyDrafted && <p>
      <label htmlFor={`${id}-recipient`}>Verified email address (to confirm)</label>{" "}
      <input id={`${id}-recipient`} type="email" autoComplete="off" spellCheck={false} maxLength={320} value={interaction.draftForms[key] ?? ""}
        disabled={interaction.pending} onChange={(event) => interaction.onDraftChange(key, event.currentTarget.value)} />
    </p>}
    <OutreachAction label="Draft package from current evidence" enabled={enabled} explanation={reason} explanationId={`${id}-reason`} onClick={() => interaction.onDraft(candidate)} />
    <TechnicalDetails label={`draft for ${candidate.contactName || "this contact"}`} rows={[["Prospect", candidate.prospectId], ["Contact", candidate.contactId]]} />
  </li>;
}

function PackageCard({ card, gate: approvalGate, interaction }: { card: OutreachPackageCard; gate: OutreachGate; interaction: OutreachInteraction }) {
  const reviewKey = `package:${card.packageVersionId}`;
  const reviewed = interaction.reviewed[reviewKey] === true;
  const enabled = approvalGate.available && card.latest && !card.approval && reviewed && !interaction.pending;
  const reason = !approvalGate.available ? approvalGate.reason
    : card.approval ? "This version already has a package approval."
      : !card.latest ? "A newer version exists. Review that version instead."
        : !reviewed ? "Tick the box above to confirm you reviewed this exact version."
          : "Approves this exact version for CRM eligibility.";
  const approval = card.approval;
  const kinds = [...new Set(card.bindings.map((binding) => binding.kind.replaceAll("_", " ")))];
  return <li className="outreach-card">
    <h3>Package version {card.version}{card.latest ? "" : " (replaced by a newer version)"}</h3>
    <CheckCode digest={card.artifactDigest} />
    <KeyValues label={`Package version ${card.version} details`} rows={[
      ["Recommended angle", card.recommendedAngle],
      ["Selected role", card.selectedRole],
      ["Evidence and guardrails", `${card.evidenceCount} evidence references, ${card.claimGuardrailCount} claim guardrails`],
      ["Selected contact points", String(card.selectedContactPointCount)],
      ["Draft messages", String(card.draftMessageCount)],
      ["Based on", `${card.bindings.length} linked record${card.bindings.length === 1 ? "" : "s"}${kinds.length ? ` (${kinds.join(", ")})` : ""}`],
      ["Created", when(card.createdAt)],
    ]} />
    <details><summary>Call script</summary><p className="outreach-preformatted">{card.callScript}</p></details>
    {approval
      ? <div role="note">
        <p>Package approval {approval.state === "recorded" ? "recorded" : approval.state}. It covers CRM eligibility only, not email. Expires {when(approval.expiresAt)}.</p>
        {approval.current.crmEligible
          ? <p>The approval is current for CRM eligibility.</p>
          : <p>This package approval no longer counts because: {reasonList(approval.current.reasonCodes) || "its checks did not pass."} A new version will need its own review.</p>}
      </div>
      : <p>No package approval yet.</p>}
    <TechnicalDetails label={`package version ${card.version}`} rows={[
      ["Package version reference", card.packageVersionId],
      ["Package fingerprint (SHA-256)", card.artifactDigest],
      ...(approval ? [["Package approval reference", approval.id] as const, ["Approval fingerprint (SHA-256)", approval.approvalDigest] as const] : []),
      ...card.bindings.map((binding, index) => [`Linked record ${index + 1} (${binding.kind})`, `${binding.id} · ${binding.digest}`] as const),
    ]} />
    <ReviewBox id={`review-${safeId(reviewKey)}`} checked={reviewed} disabled={!approvalGate.available || !!approval || !card.latest || interaction.pending}
      label={`I reviewed this package (check code ${checkCode(card.artifactDigest)}) and what it is based on.`} onChange={(value) => interaction.onReview(reviewKey, value)} />
    <OutreachAction label="Approve package for CRM eligibility" enabled={enabled} explanationId={`approve-package-${safeId(card.packageVersionId)}`}
      explanation={`This does not approve or send email. ${reason}`} onClick={() => interaction.onApprovePackage(card)} />
  </li>;
}

function MessageSection({ projection, interaction }: { projection: OutreachProjection; interaction: OutreachInteraction }) {
  return <section className="panel outreach-section" aria-labelledby="outreach-messages">
    <h2 id="outreach-messages">Email drafts</h2>
    <p>Each email is approved on its own, then queued as a separate step. A queued or delivered message never makes the package reusable for another message.</p>
    {projection.messages.length === 0
      ? <p>No message versions yet.</p>
      : <ul className="outreach-cards" aria-label="Message versions">{projection.messages.map((card) => <MessageCard key={card.messageVersionId} card={card} projection={projection} interaction={interaction} />)}</ul>}
  </section>;
}

function MessageCard({ card, projection, interaction }: { card: OutreachMessageCard; projection: OutreachProjection; interaction: OutreachInteraction }) {
  const { approval: approvalGate, queue: queueGate } = projection.gates;
  const reviewKey = `message:${card.messageVersionId}`;
  const queueKey = `queue:${card.messageVersionId}`;
  const reviewed = interaction.reviewed[reviewKey] === true;
  const queueReviewed = interaction.reviewed[queueKey] === true;
  const authority = card.recipientAuthority;
  const safeguardsComplete = !!authority && authority.unsubscribeStatus === "working";
  const approveEnabled = approvalGate.available && card.latest && !card.approval && safeguardsComplete && reviewed && !interaction.pending;
  const approveReason = !approvalGate.available ? approvalGate.reason
    : card.approval ? "This message version already has its own approval."
      : !card.latest ? "This message changed. Previous approval cannot be used."
        : !safeguardsComplete ? "Required send safeguards are incomplete. No email will be sent."
          : !reviewed ? "Tick the box above to confirm you reviewed this exact message."
            : "Approves exactly this message. Queueing is a separate step.";
  const queueEnabled = queueGate.available && card.approval?.state === "recorded" && !card.outbox && queueReviewed && !interaction.pending;
  const queueReason = !queueGate.available ? `Gmail delivery is unavailable. No email will be sent. ${queueGate.reason}`
    : !card.approval ? "This message needs its own approval first."
      : card.outbox ? "This approval has already been used."
        : card.approval.state !== "recorded" ? `The message approval is ${card.approval.state}.`
          : !queueReviewed ? "Tick the box above to confirm the queue request."
            : "Queues controlled delivery. It does not promise delivery.";
  const deliveryText = card.outbox ? DELIVERY_COPY[card.outbox.state] ?? "Unknown delivery state." : null;
  return <li className="outreach-card">
    <h3>Message version {card.version}{card.latest ? "" : " (replaced by a newer version)"}</h3>
    <CheckCode digest={card.artifactDigest} />
    <p role="note">{card.approval ? `Message approval ${card.approval.state}. It covers this exact message only. Expires ${when(card.approval.expiresAt)}.` : "Draft only — no Gmail delivery is authorized."}</p>
    {!card.latest && <p role="note">This message changed. Previous approval cannot be used.</p>}
    {deliveryText && <p role="status">{deliveryText}</p>}
    <KeyValues label={`Message version ${card.version} details`} rows={[
      ["From", card.from],
      ["Reply-To", card.replyTo ?? "Same as From"],
      ["To", card.to.join(", ")],
      ["Cc", card.cc.length ? card.cc.join(", ") : "None"],
      ["Bcc", card.bccCount ? `${card.bccCount} recipient(s)` : "None"],
      ["Subject", card.subject],
      ["Scheduled", card.intendedSendAt ? `${when(card.intendedSendAt)} (${card.timezone})` : "Not scheduled"],
      ["Links", card.links.length ? card.links.join("  ") : "None"],
      ["Attachments", card.attachments.length ? card.attachments.map((item) => `${item.name} (${item.mediaType})`).join("; ") : "None"],
    ]} />
    <details><summary>Body preview (plain text)</summary><p className="outreach-preformatted">{card.textPreview}</p>{card.htmlPartPresent && <p>An HTML part exists. It is never rendered here.</p>}</details>
    {authority
      ? <p>Compliance guidance is advisory. Recorded basis: {authority.claimedBasisCode.replaceAll("_", " ")} ({authority.jurisdictionCode}), unsubscribe link {authority.unsubscribeStatus.replaceAll("_", " ")}, acknowledgement recorded until {when(authority.validUntil)}. This is a record, not legal approval.</p>
      : <p>Compliance guidance is advisory; required send safeguards are incomplete. No email will be sent.</p>}
    <TechnicalDetails label={`message version ${card.version}`} rows={[
      ["Message version reference", card.messageVersionId],
      ["Message fingerprint (SHA-256)", card.artifactDigest],
      ["Package version reference", card.packageVersionId],
      ...(card.approval ? [["Message approval reference", card.approval.id] as const, ["Approval fingerprint (SHA-256)", card.approval.approvalDigest] as const] : []),
      ...(authority ? [["Package approval reference", authority.packageApprovalId] as const, ["Acknowledgement fingerprint (SHA-256)", authority.acknowledgementDigest] as const] : []),
      ...card.attachments.map((item, index) => [`Attachment ${index + 1} fingerprint (SHA-256)`, `${item.name} · ${item.digest}`] as const),
      ...(card.outbox ? [["Delivery queue reference", `${card.outbox.outboxItemId} (update ${card.outbox.revision})`] as const] : []),
    ]} />
    <ReviewBox id={`review-${safeId(reviewKey)}`} checked={reviewed} disabled={!approvalGate.available || !!card.approval || !card.latest || interaction.pending}
      label={`I reviewed this message (check code ${checkCode(card.artifactDigest)}), its recipients and its safeguards.`} onChange={(value) => interaction.onReview(reviewKey, value)} />
    <OutreachAction label="Approve this message for queued Gmail delivery" enabled={approveEnabled} explanationId={`approve-message-${safeId(card.messageVersionId)}`}
      explanation={approveReason} onClick={() => interaction.onApproveMessage(card)} />
    <ReviewBox id={`review-${safeId(queueKey)}`} checked={queueReviewed} disabled={!queueGate.available || !card.approval || !!card.outbox || interaction.pending}
      label="I want this approved message queued for controlled delivery." onChange={(value) => interaction.onReview(queueKey, value)} />
    <OutreachAction label="Queue for controlled delivery" enabled={queueEnabled} explanationId={`queue-message-${safeId(card.messageVersionId)}`}
      explanation={queueReason} onClick={() => interaction.onQueue(card)} />
  </li>;
}

function PhoneSection({ projection, interaction }: { projection: OutreachProjection; interaction: OutreachInteraction }) {
  return <section className="panel outreach-section" aria-labelledby="outreach-phone">
    <h2 id="outreach-phone">Phone calls</h2>
    <p>You make calls yourself. The phone number is not shown here, and the call button stays off for now. You can still record what happened after a call.</p>
    {projection.calls.length === 0
      ? <p>No approved package includes a phone yet.</p>
      : <ul className="outreach-cards" aria-label="Phones">{projection.calls.map((card) => <CallCard key={callKey(card)} card={card} interaction={interaction} />)}</ul>}
  </section>;
}

function CallCard({ card, interaction }: { card: OutreachCallCard; interaction: OutreachInteraction }) {
  const key = callKey(card);
  const id = safeId(key);
  const form = interaction.callForms[key] ?? EMPTY_CALL_FORM;
  const doNotCall = form.outcome === "do_not_call";
  const confirming = interaction.confirming?.kind === "do_not_call" && interaction.confirming.callKey === key;
  const phoneReason = card.phoneAction.reason === "owner_uat_pending"
    ? "Phone calling stays off until the owner acceptance test is done (06-13). When it is on, it will open your device's calling app. PROspector does not place or record calls."
    : `Phone is not eligible for calling: ${reasonList(card.decision.reasonCodes) || "its checks did not pass."} PROspector does not place or record calls.`;
  const notesReady = form.notes.trim().length > 0 && form.notes.length <= 512;
  const recordEnabled = !interaction.pending && notesReady && !doNotCall && card.decision.eligible;
  const recordReason = !notesReady ? "Add a short note (up to 512 characters) before recording."
    : doNotCall ? "Do not call needs its own confirmation below."
      : !card.decision.eligible ? "Only Do not call can be recorded while this phone is not eligible."
        : "Records the outcome you chose. It authorizes no follow-up.";
  return <li className="outreach-card">
    <h3>Phone from package check code <code>{checkCode(card.packageArtifactDigest)}</code></h3>
    <p role="note">{card.decision.eligible ? "Verified business phone — eligible for manual calling while current." : `Phone is not eligible for calling: ${reasonList(card.decision.reasonCodes) || "its checks did not pass."}`}</p>
    <OutreachAction label="Open verified business phone" enabled={false} explanationId={`phone-${id}`} explanation={phoneReason} />
    <p>Derived from approved Outreach Package with check code <code>{checkCode(card.packageArtifactDigest)}</code>. The call script is in that package&apos;s card and cannot be edited here.</p>
    <TechnicalDetails label={`this phone (package ${checkCode(card.packageArtifactDigest)})`} rows={[
      ["Package approval reference", card.packageApprovalId],
      ["Phone record reference", card.phoneObservationId],
      ["Package fingerprint (SHA-256)", card.packageArtifactDigest],
      ["Call check fingerprint (SHA-256)", card.decision.decisionDigest],
    ]} />
    <fieldset>
      <legend>Record call outcome</legend>
      <p><label htmlFor={`outcome-${id}`}>Outcome</label> <select id={`outcome-${id}`} value={form.outcome} disabled={interaction.pending} onChange={(event) => interaction.onCallChange(key, { outcome: event.currentTarget.value })}>
        {Object.entries(OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></p>
      <p><label htmlFor={`notes-${id}`}>Your note (operator-entered, up to 512 characters)</label><br /><textarea id={`notes-${id}`} maxLength={512} rows={3} value={form.notes} disabled={interaction.pending} onChange={(event) => interaction.onCallChange(key, { notes: event.currentTarget.value })} /></p>
      {doNotCall && <p><label htmlFor={`number-${id}`}>Number you called, in international format (optional)</label> <input id={`number-${id}`} type="text" inputMode="tel" autoComplete="off" maxLength={32} value={form.number} disabled={interaction.pending} onChange={(event) => interaction.onCallChange(key, { number: event.currentTarget.value })} />
        <br /><span>If you enter it, it is checked against the stored number and the same number is blocked on every contact. Without it, only this contact&apos;s phone is blocked.</span></p>}
      <OutreachAction label="Record call outcome" enabled={recordEnabled} explanationId={`record-${id}`} explanation={recordReason} onClick={() => interaction.onRecordCall(card)} />
      {doNotCall && !confirming && <OutreachAction label="Review do not call" enabled={!interaction.pending && notesReady} explanationId={`dnc-review-${id}`}
        explanation={notesReady ? "Opens a confirmation. Suppression is written before the outcome is recorded." : "Add a short note first."} onClick={() => interaction.onConfirm({ kind: "do_not_call", callKey: key })} />}
      {doNotCall && confirming && <div className="outreach-confirm" role="group" aria-labelledby={`dnc-confirm-${id}`}>
        <h4 id={`dnc-confirm-${id}`} tabIndex={-1} ref={(element) => element?.focus()}>Confirm do not call</h4>
        <p>Suppression is written before the outcome is recorded. This contact&apos;s phone{form.number.trim() ? " and the number you entered" : ""} will be blocked for calls. It cannot be undone here.</p>
        <p><button type="button" disabled={interaction.pending} onClick={() => interaction.onRecordCall(card)}>Record do not call</button> <button type="button" onClick={() => interaction.onConfirm(null)}>Cancel</button></p>
      </div>}
    </fieldset>
  </li>;
}

function SuppressionSection({ projection, interaction }: { projection: OutreachProjection; interaction: OutreachInteraction }) {
  const form = interaction.suppressionForm;
  const confirming = interaction.confirming?.kind === "suppression";
  const needsValue = form.subjectKind !== "company";
  const ready = !needsValue || form.value.trim().length > 0;
  return <section className="panel outreach-section" aria-labelledby="outreach-suppression">
    <h2 id="outreach-suppression">Do not contact list</h2>
    <p>Entries on this list (suppressions) are permanent and apply across the company. Addresses and numbers are stored only in a one-way scrambled form, so they are not shown.</p>
    {projection.suppressions.length === 0 ? <p>Nobody is on the do not contact list yet.</p> : <table className="outreach-table"><caption>Do not contact entries</caption><thead><tr><th scope="col">Who</th><th scope="col">Channel</th><th scope="col">Reason</th><th scope="col">Since</th><th scope="col">Linked aliases</th></tr></thead>
      <tbody>{projection.suppressions.map((row) => <tr key={row.id}><td>{SUBJECT_LABELS[row.subjectKind] ?? row.subjectKind}</td><td>{CHANNEL_LABELS[row.channel] ?? row.channel}</td><td>{SUPPRESSION_REASON_LABELS[row.reason] ?? row.reason}</td><td>{when(row.effectiveAt)}</td><td>{row.aliasCount}</td></tr>)}</tbody></table>}
    {projection.suppressions.some((row) => row.reason === "do_not_call" || row.reason === "unsubscribe" || row.reason === "explicit_opt_out")
      && <p role="note">Suppression recorded before this outcome was completed. Matching outreach is blocked.</p>}
    {projection.stops.length === 0 ? <p>No outreach has been stopped.</p> : <table className="outreach-table"><caption>Stopped outreach</caption><thead><tr><th scope="col">What happened</th><th scope="col">Who</th><th scope="col">Reason</th><th scope="col">Since</th></tr></thead>
      <tbody>{projection.stops.map((row) => <tr key={row.id}><td>{row.stopKind.replaceAll("_", " ")}</td><td>{SUBJECT_LABELS[row.subjectKind] ?? row.subjectKind}</td><td>{row.reasonCode.replaceAll("_", " ")}</td><td>{when(row.effectiveAt)}</td></tr>)}</tbody></table>}
    <fieldset>
      <legend>Add to the do not contact list</legend>
      <p><label htmlFor="suppression-kind">Who to block</label> <select id="suppression-kind" value={form.subjectKind} disabled={interaction.pending || confirming} onChange={(event) => interaction.onSuppressionChange({ subjectKind: event.currentTarget.value, channel: CHANNEL_OPTIONS[event.currentTarget.value]?.[0] ?? "all", value: "" })}>
        {Object.keys(CHANNEL_OPTIONS).map((kind) => <option key={kind} value={kind}>{SUBJECT_LABELS[kind]}</option>)}
      </select></p>
      {needsValue && <p><label htmlFor="suppression-value">{VALUE_LABELS[form.subjectKind] ?? "Value"}</label> <input id="suppression-value" type="text" autoComplete="off" maxLength={320} value={form.value} disabled={interaction.pending || confirming} onChange={(event) => interaction.onSuppressionChange({ value: event.currentTarget.value })} /></p>}
      <p><label htmlFor="suppression-channel">Channel</label> <select id="suppression-channel" value={form.channel} disabled={interaction.pending || confirming} onChange={(event) => interaction.onSuppressionChange({ channel: event.currentTarget.value })}>
        {(CHANNEL_OPTIONS[form.subjectKind] ?? ["all"]).map((channel) => <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>)}
      </select></p>
      <p><label htmlFor="suppression-reason">Reason</label> <select id="suppression-reason" value={form.reason} disabled={interaction.pending || confirming} onChange={(event) => interaction.onSuppressionChange({ reason: event.currentTarget.value })}>
        <option value="owner_request">Owner decision</option><option value="explicit_opt_out">Recipient opted out</option>
      </select></p>
      {!confirming && <OutreachAction label="Review before adding" enabled={!interaction.pending && ready} explanationId="suppression-review"
        explanation={ready ? "Opens a summary to confirm. There is no temporary or per-message exception." : "Enter who to block first."} onClick={() => interaction.onConfirm({ kind: "suppression" })} />}
      {confirming && <div className="outreach-confirm" role="group" aria-labelledby="suppression-confirm">
        <h3 id="suppression-confirm" tabIndex={-1} ref={(element) => element?.focus()}>Confirm do not contact entry</h3>
        <KeyValues label="Do not contact entry summary" rows={[
          ["Who", SUBJECT_LABELS[form.subjectKind] ?? form.subjectKind],
          ...(needsValue ? [["Value", form.value.trim()] as const] : []),
          ["Channel", CHANNEL_LABELS[form.channel] ?? form.channel],
          ["Reason", SUPPRESSION_REASON_LABELS[form.reason] ?? form.reason],
          ["Effect", "Matching queued work is cancelled before this is reported. It cannot be undone here."],
        ]} />
        <p><button type="button" disabled={interaction.pending} onClick={interaction.onConfirmSuppression}>Add to do not contact list</button> <button type="button" onClick={() => interaction.onConfirm(null)}>Cancel</button></p>
      </div>}
    </fieldset>
  </section>;
}

function DeliverySection({ projection }: { projection: OutreachProjection }) {
  return <section className="panel outreach-section" aria-labelledby="outreach-delivery">
    <h2 id="outreach-delivery">Email delivery history</h2>
    <p>PROspector never resends automatically. There is no resend button.</p>
    {projection.delivery.length === 0 ? <p>Nothing has been queued.</p> : <table className="outreach-table"><caption>Queued emails</caption><thead><tr><th scope="col">Status</th><th scope="col">Update</th><th scope="col">Reason</th><th scope="col">When</th></tr></thead>
      <tbody>{projection.delivery.map((row) => <tr key={row.outboxItemId}><td>{DELIVERY_COPY[row.state] ?? "Unknown delivery state."}</td><td>{row.revision}</td><td>{row.reasonCode.replaceAll("_", " ")}</td><td>{when(row.at)}</td></tr>)}</tbody></table>}
  </section>;
}
