import assert from "node:assert/strict";
import test from "node:test";

import { createD1Fixture } from "./helpers/d1.mjs";
import {
  OUTREACH_NOW,
  OUTREACH_OWNER,
  seedOutreachAuthority,
} from "./helpers/outreach-fixture.mjs";

const AUDIT_CONTRACT = Object.freeze([
  { action: "package.version.created", subjectKind: "package_version", reason: "version_created", table: "outreach_package_versions" },
  { action: "package.approved", subjectKind: "package_approval", reason: "owner_approved", table: "outreach_package_approvals" },
  { action: "message.version.created", subjectKind: "message_version", reason: "version_created", table: "outreach_message_versions" },
  { action: "recipient_dispatch_authority.recorded", subjectKind: "recipient_dispatch_authority", reason: "owner_acknowledged_advisory", table: "outreach_recipient_dispatch_authorities" },
  { action: "unsubscribe_authority_event.recorded", subjectKind: "unsubscribe_authority_event", reason: "working", table: "outreach_unsubscribe_authority_events" },
  { action: "message.approved", subjectKind: "message_approval", reason: "owner_acknowledged", table: "outreach_message_approvals" },
  { action: "sender_capability.recorded", subjectKind: "sender_capability_snapshot", reason: "capability_verified", table: "outreach_sender_capability_snapshots" },
  { action: "approval.revoked", subjectKind: "approval_revocation", reason: "owner_revoked", table: "outreach_approval_revocations" },
  { action: "suppression.recorded", subjectKind: "suppression_tombstone", reason: "unsubscribe", table: "outreach_suppression_tombstones" },
]);

const OWNER_MUTATION_METHODS = Object.freeze([
  "approveMessageVersion",
  "approvePackageVersion",
  "createMessageVersion",
  "createPackageVersion",
  "recordRecipientDispatchAuthority",
  "recordSenderCapability",
  "recordSuppression",
  "recordUnsubscribeAuthorityEvent",
  "revokeApproval",
]);

const RAW_PRIVATE_VALUES = Object.freeze([
  "owner@example.invalid",
  "verified@example.invalid",
  "+14165550199",
  "Synthetic governed outreach angle",
  "Synthetic offline call script for +14165550199.",
  "Synthetic governed outreach message",
  "Hello from the private audit fixture.",
  "https://example.invalid/unsubscribe",
  "synthetic evidence",
  "vault-ref:audit-contract-credential",
  "raw-provider-payload-audit-sentinel",
  "9".repeat(64),
]);

test("security-sensitive owner outreach mutations emit linked, minimized audit records", async () => {
  const fixture = await createD1Fixture("owner-mutation-audit-contract");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const repositoryModule = await fixture.vite.ssrLoadModule(
      new URL("../domain/outreach-repository.ts", import.meta.url).pathname,
    );
    const digestModule = await fixture.vite.ssrLoadModule(
      new URL("../domain/enrichment-grant-issuance.ts", import.meta.url).pathname,
    );
    const repository = repositoryModule.createD1OutreachRepository(fixture.database, {
      workspaceId: seeded.workspaceId,
      ownerSubject: OUTREACH_OWNER.subject,
      now: () => OUTREACH_NOW,
    });
    assert.deepEqual(
      Object.keys(repository).filter((method) => method !== "isSuppressed").sort(),
      OWNER_MUTATION_METHODS,
      "the audit contract must enumerate every owner-facing outreach mutation",
    );

    const packageVersion = await repository.createPackageVersion(packageInput(seeded));
    const packageApproval = await repository.approvePackageVersion({
      packageVersionId: packageVersion.id,
      expectedVersion: 1,
      expiresAt: OUTREACH_NOW + 20_000,
      idempotencyKey: "audit-contract-package-approval",
    });
    const messageVersion = await repository.createMessageVersion(messageInput(packageVersion, seeded));
    const recipientAuthority = await repository.recordRecipientDispatchAuthority({
      messageVersionId: messageVersion.id,
      packageApprovalId: packageApproval.id,
      emailObservationId: seeded.observationId,
      jurisdictionCode: "CA-ON",
      claimedBasisCode: "legitimate_interest",
      basisSourceId: "outreach-source",
      basisSourceDigest: seeded.sourceDigest,
      advisoryPolicyVersion: "prospector-advisory-v1",
      advisoryPolicyDigest: "c".repeat(64),
      unsubscribePathDigest: "d".repeat(64),
      acknowledgedAt: OUTREACH_NOW,
      validUntil: OUTREACH_NOW + 20_000,
      idempotencyKey: "audit-contract-recipient-authority",
    });
    await repository.recordUnsubscribeAuthorityEvent({
      recipientAuthorityId: recipientAuthority.id,
      expectedRevision: 0,
      status: "working",
      checkDigest: "e".repeat(64),
      observedAt: OUTREACH_NOW,
      validUntil: OUTREACH_NOW + 20_000,
      idempotencyKey: "audit-contract-unsubscribe-authority",
    });
    const messageApproval = await repository.approveMessageVersion({
      messageVersionId: messageVersion.id,
      packageApprovalId: packageApproval.id,
      expectedVersion: 1,
      acknowledgementDigest: recipientAuthority.digest,
      expiresAt: OUTREACH_NOW + 10_000,
      idempotencyKey: "audit-contract-message-approval",
    });

    const senderAddressDigest = await digestModule.canonicalDigest({
      schema: "outreach-sender-address/v1",
      address: "owner@example.invalid",
    });
    await fixture.database.prepare(
      `INSERT INTO outreach_sender_connections
        (id,workspace_id,provider,connection_subject_digest,sender_address_digest,protected_reference,
         protected_reference_version,status,verified_at,created_at)
       VALUES ('audit-contract-sender',?,'gmail',?,?,'vault-ref:audit-contract-credential',1,'active',?,?)`,
    ).bind(seeded.workspaceId, "6".repeat(64), senderAddressDigest, OUTREACH_NOW - 1, OUTREACH_NOW).run();
    await repository.recordSenderCapability({
      senderConnectionId: "audit-contract-sender",
      grantedScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      verifiedAddresses: [{ address: "owner@example.invalid", kind: "canonical", verificationDigest: "7".repeat(64) }],
      verifiedAt: OUTREACH_NOW,
      expiresAt: OUTREACH_NOW + 86_400_000,
      idempotencyKey: "audit-contract-sender-capability",
    });
    await repository.revokeApproval({
      targetKind: "message_approval",
      targetApprovalId: messageApproval.id,
      reasonCode: "owner_revoked",
      sourceEventDigest: "a".repeat(64),
      idempotencyKey: "audit-contract-approval-revocation",
    });
    await repository.recordSuppression({
      subjectKind: "exact_email",
      subjectDigest: "b".repeat(64),
      channel: "email",
      reason: "unsubscribe",
      sourceEventDigest: "f".repeat(64),
      aliasDigests: [],
      effectiveAt: OUTREACH_NOW - 1,
      idempotencyKey: "audit-contract-suppression",
    });

    const rows = (await fixture.database.prepare(
      `SELECT audit.*,
              command.owner_subject command_owner,command.result_kind,command.result_id,command.operation_digest
       FROM outreach_audit_records audit
       JOIN outreach_commands command ON command.id=audit.command_id AND command.workspace_id=audit.workspace_id
       WHERE audit.workspace_id=? ORDER BY audit.action,audit.subject_kind`,
    ).bind(seeded.workspaceId).all()).results;

    assert.equal(rows.length, AUDIT_CONTRACT.length, "every enumerated owner mutation must emit one audit record");
    const byAction = new Map(rows.map((row) => [`${row.action}:${row.subject_kind}`, row]));
    for (const contract of AUDIT_CONTRACT) {
      const row = byAction.get(`${contract.action}:${contract.subjectKind}`);
      assert.ok(row, `${contract.action} must be represented in the centralized audit contract`);
      assert.deepEqual(Object.keys(row).sort(), [
        "action", "actor_subject", "command_id", "command_owner", "created_at", "id", "material_digest",
        "operation_digest", "outcome", "reason_code", "result_id", "result_kind", "subject_id", "subject_kind", "workspace_id",
      ]);
      assert.equal(row.actor_subject, OUTREACH_OWNER.subject);
      assert.equal(row.command_owner, OUTREACH_OWNER.subject);
      assert.equal(row.outcome, "recorded");
      assert.equal(row.reason_code, contract.reason);
      assert.equal(row.result_kind, contract.subjectKind);
      assert.equal(row.result_id, row.subject_id);
      assert.match(row.material_digest, /^[a-f0-9]{64}$/u);
      assert.match(row.operation_digest, /^[a-f0-9]{64}$/u);
      assert.ok(
        await fixture.database.prepare(`SELECT 1 linked FROM ${contract.table} WHERE id=? AND workspace_id=? LIMIT 1`)
          .bind(row.subject_id, seeded.workspaceId).first(),
        `${contract.action} must link to its immutable object`,
      );
    }

    const serializedAudit = JSON.stringify(rows);
    for (const privateValue of RAW_PRIVATE_VALUES) {
      assert.equal(serializedAudit.includes(privateValue), false, `audit records must exclude private value: ${privateValue}`);
    }
    assert.doesNotMatch(
      serializedAudit,
      /(?:snapshot_json|provider_payload|protected_reference|credential|access_token|refresh_token|unsubscribe_token|textBody|htmlBody|callScript|recommendedAngle)/iu,
    );
  } finally {
    await fixture.dispose();
  }
});

function packageInput(seeded) {
  return {
    packageId: "audit-contract-package",
    prospectId: seeded.prospectId,
    contactId: seeded.contactId,
    profileId: seeded.profileId,
    version: 1,
    expectedVersion: 0,
    configurationId: seeded.configurationId,
    configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision,
    prospectRevision: seeded.prospectRevision,
    contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest],
      claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: "Synthetic governed outreach angle",
      selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest],
      callScript: "Synthetic offline call script for +14165550199.",
      draftMessageIds: ["audit-contract-message"],
    },
    bindings: [
      { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
      { kind: "qualification", id: "outreach-assessment", digest: "2".repeat(64) },
      { kind: "review_decision", id: "outreach-review", digest: "5".repeat(64) },
      { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
      { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
      { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
      { kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest },
      { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
    ],
    idempotencyKey: "audit-contract-package-version",
  };
}

function messageInput(packageVersion, seeded) {
  return {
    messageId: "audit-contract-message",
    packageId: "audit-contract-package",
    packageVersionId: packageVersion.id,
    version: 1,
    expectedVersion: 0,
    snapshot: {
      senderReference: "sender-synthetic",
      from: "owner@example.invalid",
      replyTo: null,
      to: ["verified@example.invalid"],
      cc: [],
      bcc: [],
      subject: "Synthetic governed outreach message",
      textBody: "Hello from the private audit fixture.",
      htmlBody: null,
      links: ["https://example.invalid/unsubscribe"],
      attachments: [{ id: "provider-payload", name: "raw-provider-payload-audit-sentinel", mediaType: "text/plain", digest: "8".repeat(64) }],
      threadReference: null,
      replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000,
    timezone: "America/Toronto",
    unsubscribeTokenDigest: "9".repeat(64),
    bindings: [{ kind: "package_version", id: packageVersion.id, digest: packageVersion.digest }],
    idempotencyKey: `audit-contract-message-version-${seeded.prospectId}`,
  };
}
