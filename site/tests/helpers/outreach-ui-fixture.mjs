import { OUTREACH_NOW, OUTREACH_OWNER, seedManualCallAuthority } from "./manual-call-fixture.mjs";
import { insertSenderConnection } from "./outreach-dispatch-lane.mjs";

// Lane G (06-08, local) helper. It builds on the Lane F manual-call fixture
// (email plus a source-verified synthetic E.164 phone) and does not edit
// tests/helpers/outreach-fixture.mjs. Synthetic data only: no provider is
// reached, nothing is sent, and no phone action is enabled.

export { OUTREACH_NOW, OUTREACH_OWNER };

export const MODULES = Object.freeze({
  handler: new URL("../../domain/outreach-handler.ts", import.meta.url).pathname,
  unsubscribe: new URL("../../domain/unsubscribe-handler.ts", import.meta.url).pathname,
  repository: new URL("../../domain/outreach-repository.ts", import.meta.url).pathname,
  packages: new URL("../../domain/outreach-package.ts", import.meta.url).pathname,
  messages: new URL("../../domain/message-version.ts", import.meta.url).pathname,
  outbox: new URL("../../domain/outbox.ts", import.meta.url).pathname,
  stopRules: new URL("../../domain/outreach-stop-rules.ts", import.meta.url).pathname,
  suppression: new URL("../../domain/suppression.ts", import.meta.url).pathname,
  manualCall: new URL("../../domain/manual-call.ts", import.meta.url).pathname,
  interview: new URL("../../domain/interview.ts", import.meta.url).pathname,
});

export const CLOCK = OUTREACH_NOW + 10;
export const UNSUBSCRIBE_TOKEN = "synthetic-unsubscribe-token-0123456789abcdef";
export const RECIPIENT = "verified@example.invalid";

export function scopeOf(seeded, now = CLOCK) {
  return Object.freeze({ workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => now });
}

export function packageBindings(seeded) {
  return [
    { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
    { kind: "qualification", id: "outreach-assessment", digest: "2".repeat(64) },
    { kind: "review_decision", id: "outreach-review", digest: "5".repeat(64) },
    { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
    { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
    { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
    { kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest },
    { kind: "contact_observation", id: seeded.phoneObservationId, digest: seeded.phoneObservationDigest },
    { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
  ];
}

/**
 * Seeds one Package Version that selects the email and the phone point, and
 * one Message Version to the verified recipient. The Package approval,
 * recipient authority and Message approval are optional so a test can drive
 * them through the owner handler instead.
 */
export async function seedOutreachWorkspace(fixture, options = {}) {
  const seeded = await seedManualCallAuthority(fixture);
  const scope = scopeOf(seeded);
  const repositoryModule = await fixture.vite.ssrLoadModule(MODULES.repository);
  const suppression = await fixture.vite.ssrLoadModule(MODULES.suppression);
  const repository = repositoryModule.createD1OutreachRepository(fixture.database, scope);
  const packageVersion = await repository.createPackageVersion({
    packageId: "ui-package", prospectId: seeded.prospectId, contactId: seeded.contactId, profileId: seeded.profileId,
    version: 1, expectedVersion: 0, configurationId: seeded.configurationId, configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision, prospectRevision: seeded.prospectRevision, contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest], claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: options.recommendedAngle ?? "Synthetic governed outreach angle", selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest, seeded.phoneContactPointDigest],
      callScript: "Synthetic offline call script.", draftMessageIds: ["ui-message"],
    },
    bindings: packageBindings(seeded),
    idempotencyKey: "ui-package-version",
  });
  const unsubscribeTokenDigest = await suppression.unsubscribeTokenDigest(UNSUBSCRIBE_TOKEN);
  const messageVersion = await repository.createMessageVersion({
    messageId: "ui-message", packageId: "ui-package", packageVersionId: packageVersion.id, version: 1, expectedVersion: 0,
    snapshot: {
      senderReference: "sender-synthetic", from: "owner@example.invalid", replyTo: null, to: [RECIPIENT], cc: [], bcc: [],
      subject: options.subject ?? "Synthetic governed outreach message",
      textBody: options.textBody ?? "Hello from the offline fixture.", htmlBody: options.htmlBody ?? null,
      links: ["https://example.invalid/unsubscribe"], attachments: [], threadReference: null, replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000, timezone: "America/Toronto", unsubscribeTokenDigest,
    bindings: [{ kind: "package_version", id: packageVersion.id, digest: packageVersion.digest }],
    idempotencyKey: "ui-message-version",
  });
  const context = { seeded, scope, repository, packageVersion, messageVersion, unsubscribeTokenDigest };
  if (options.approvePackage === false) return context;
  context.packageApproval = await repository.approvePackageVersion({
    packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 70_000, idempotencyKey: "ui-package-approval",
  });
  context.recipientAuthority = await recordRecipientAuthority(context, context.packageApproval.id);
  if (options.approveMessage === false) return context;
  context.messageApproval = await repository.approveMessageVersion({
    messageVersionId: messageVersion.id, packageApprovalId: context.packageApproval.id, expectedVersion: 1,
    acknowledgementDigest: context.recipientAuthority.digest, expiresAt: OUTREACH_NOW + 60_000, idempotencyKey: "ui-message-approval",
  });
  return context;
}

export async function recordRecipientAuthority(context, packageApprovalId) {
  const authority = await context.repository.recordRecipientDispatchAuthority({
    messageVersionId: context.messageVersion.id, packageApprovalId, emailObservationId: context.seeded.observationId,
    jurisdictionCode: "CA-ON", claimedBasisCode: "legitimate_interest", basisSourceId: "outreach-source", basisSourceDigest: context.seeded.sourceDigest,
    advisoryPolicyVersion: "prospector-advisory-v1", advisoryPolicyDigest: "c".repeat(64), unsubscribePathDigest: "d".repeat(64),
    acknowledgedAt: CLOCK, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: `ui-recipient-authority-${packageApprovalId.slice(0, 24)}`,
  });
  await context.repository.recordUnsubscribeAuthorityEvent({
    recipientAuthorityId: authority.id, expectedRevision: 0, status: "working", checkDigest: "e".repeat(64),
    observedAt: CLOCK, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: `ui-unsubscribe-working-${packageApprovalId.slice(0, 24)}`,
  });
  return authority;
}

export async function addSenderConnection(fixture, context) {
  return insertSenderConnection(fixture, context.seeded, context.repository, { id: "ui-sender-connection", subjectDigest: "6".repeat(64), version: 1 });
}

/**
 * Test-only synthetic services. They are the production composition except
 * that every readiness port is a synthetic ContactReady answer. Production
 * composition never takes this path.
 */
export async function syntheticServices(fixture, context) {
  const [packages, messages, outbox, stopRules, repository] = await Promise.all([
    fixture.vite.ssrLoadModule(MODULES.packages), fixture.vite.ssrLoadModule(MODULES.messages),
    fixture.vite.ssrLoadModule(MODULES.outbox), fixture.vite.ssrLoadModule(MODULES.stopRules), fixture.vite.ssrLoadModule(MODULES.repository),
  ]);
  const { seeded } = context;
  const points = [seeded.observationId, seeded.phoneObservationId].map((observationId) => ({ observationId, state: "eligible" }));
  const recheck = (boundary) => () => ({ boundary, blocked: false, eligibility: { state: "ContactReady", eligible: true, reasonCodes: [], points } });
  return (database, scope) => {
    const reader = packages.createD1OutreachArtifactReader(database, scope);
    const packageService = packages.createOutreachPackageService({
      repository: repository.createD1OutreachRepository(database, scope), reader,
      eligibility: Object.freeze({ recheckForPackageApproval: recheck("package_approval") }), now: scope.now,
    });
    return Object.freeze({
      mode: "synthetic",
      packages: packageService,
      messages: messages.createMessageVersionService({ repository: repository.createD1OutreachRepository(database, scope), reader, packages: packageService, now: scope.now }),
      enqueue: outbox.createGovernedOutboxEnqueue(database, scope, { eligibility: Object.freeze({ recheckForFinalSend: recheck("final_send") }) }),
      stopRules: stopRules.createOutreachStopRules(database, scope),
      clickToCallEligibility: Object.freeze({
        recheckForClickToCall: () => ({ blocked: false, state: "ContactReady", freshUntil: OUTREACH_NOW + 60_000, normalizedPhone: seeded.phoneNumber }),
      }),
      authorityInputs: async () => ({
        currentDependencies: packageBindings(seeded),
        contactEvidence: { points: [], strategy: { configurationId: seeded.configurationId }, authority: { prospectId: seeded.prospectId } },
      }),
    });
  };
}

export async function count(fixture, table, where = "1=1", values = []) {
  const row = await fixture.database.prepare(`SELECT count(*) count FROM ${table} WHERE ${where}`).bind(...values).first();
  return Number(row.count);
}
