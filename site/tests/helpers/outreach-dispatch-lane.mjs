import assert from "node:assert/strict";

import { OUTREACH_NOW, OUTREACH_OWNER, seedOutreachAuthority } from "./outreach-fixture.mjs";

// Lane E (06-06 Tasks 1 and 3) local helper. tests/helpers/outreach-fixture.mjs
// is not edited. Synthetic data only: no provider, worker, route or binding.

export const MODULES = Object.freeze({
  outbox: new URL("../../domain/outbox.ts", import.meta.url).pathname,
  sync: new URL("../../domain/originated-mail-sync.ts", import.meta.url).pathname,
  stopRules: new URL("../../domain/outreach-stop-rules.ts", import.meta.url).pathname,
  repository: new URL("../../domain/outreach-repository.ts", import.meta.url).pathname,
  mail: new URL("../../domain/ports/mail.ts", import.meta.url).pathname,
  gmail: new URL("../../adapters/gmail.ts", import.meta.url).pathname,
  issuance: new URL("../../domain/enrichment-grant-issuance.ts", import.meta.url).pathname,
});

export const FORBIDDEN_STATES = Object.freeze(["dispatching", "sent", "delivery_unknown"]);
export const RECIPIENT = "verified@example.invalid";
export const SENDER_CONNECTION_ID = "dispatch-sender-connection-1";
export const SENDER_SUBJECT_DIGEST = "6".repeat(64);
const MESSAGE_IDS = Object.freeze(["dispatch-message-origin", "dispatch-message-follow-up"]);

export function scope(seeded, now = OUTREACH_NOW) {
  return { workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => now };
}

/**
 * Seeds one Package with two approved Messages to the same verified recipient:
 * an "origin" Message and a "follow-up" Message. Nothing is enqueued here.
 */
export async function prepareApprovedPair(fixture) {
  const seeded = await seedOutreachAuthority(fixture);
  const repository = (await fixture.vite.ssrLoadModule(MODULES.repository)).createD1OutreachRepository(fixture.database, scope(seeded));
  const packageVersion = await repository.createPackageVersion(packageInput(seeded));
  const packageApproval = await repository.approvePackageVersion({
    packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: OUTREACH_NOW + 70_000, idempotencyKey: "dispatch-package-approval",
  });
  const approvals = {};
  for (const [index, messageId] of MESSAGE_IDS.entries()) {
    const message = await repository.createMessageVersion(messageInput(packageVersion, messageId, index));
    const recipientAuthority = await repository.recordRecipientDispatchAuthority({
      messageVersionId: message.id, packageApprovalId: packageApproval.id, emailObservationId: seeded.observationId,
      jurisdictionCode: "CA-ON", claimedBasisCode: "legitimate_interest", basisSourceId: "outreach-source", basisSourceDigest: seeded.sourceDigest,
      advisoryPolicyVersion: "prospector-advisory-v1", advisoryPolicyDigest: "c".repeat(64), unsubscribePathDigest: "d".repeat(64),
      acknowledgedAt: OUTREACH_NOW, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: `dispatch-recipient-authority-${index}`,
    });
    await repository.recordUnsubscribeAuthorityEvent({
      recipientAuthorityId: recipientAuthority.id, expectedRevision: 0, status: "working", checkDigest: "e".repeat(64),
      observedAt: OUTREACH_NOW, validUntil: OUTREACH_NOW + 70_000, idempotencyKey: `dispatch-unsubscribe-working-${index}`,
    });
    approvals[index === 0 ? "origin" : "followUp"] = await repository.approveMessageVersion({
      messageVersionId: message.id, packageApprovalId: packageApproval.id, expectedVersion: 1,
      acknowledgementDigest: recipientAuthority.digest, expiresAt: OUTREACH_NOW + 60_000, idempotencyKey: `dispatch-message-approval-${index}`,
    });
  }
  const senderConnectionId = await insertSenderConnection(fixture, seeded, repository, { id: SENDER_CONNECTION_ID, subjectDigest: SENDER_SUBJECT_DIGEST, version: 1 });
  return { seeded, repository, approvals, senderConnectionId };
}

/** Enqueues both Messages through the raw D1 outbox (no eligibility port). */
export async function enqueuePair(fixture, context) {
  const outbox = (await fixture.vite.ssrLoadModule(MODULES.outbox)).createD1OutboxRepository(fixture.database, scope(context.seeded));
  const origin = await outbox.enqueueApprovedMessage({ messageApprovalId: context.approvals.origin.id, senderConnectionId: context.senderConnectionId });
  const followUp = await outbox.enqueueApprovedMessage({ messageApprovalId: context.approvals.followUp.id, senderConnectionId: context.senderConnectionId });
  assert.equal(origin.kind, "queued");
  assert.equal(followUp.kind, "queued");
  return { origin, followUp };
}

export async function claimLease(fixture, context, outboxItemId, holderId, now = OUTREACH_NOW + 1_000) {
  const outbox = (await fixture.vite.ssrLoadModule(MODULES.outbox)).createD1OutboxRepository(fixture.database, scope(context.seeded, now));
  return outbox.claimDispatchLease({ outboxItemId, holderId });
}

export async function insertSenderConnection(fixture, seeded, repository, { id, subjectDigest, version, status = "active" }) {
  if (status !== "active" && version === 1) {
    // The 0012 guard only admits a non-active row as a later version of an
    // active one, so a revoked connection is the successor of a current one.
    await insertSenderConnection(fixture, seeded, repository, { id: `${id}-predecessor`, subjectDigest, version: 1 });
    version = 2;
  }
  const issuance = await fixture.vite.ssrLoadModule(MODULES.issuance);
  const senderAddressDigest = await issuance.canonicalDigest({ schema: "outreach-sender-address/v1", address: "owner@example.invalid" });
  await fixture.database.prepare(
    "INSERT INTO outreach_sender_connections (id,workspace_id,provider,connection_subject_digest,sender_address_digest,protected_reference,protected_reference_version,status,verified_at,created_at) VALUES (?,?,'gmail',?,?,?,?,?,?,?)",
  ).bind(id, seeded.workspaceId, subjectDigest, senderAddressDigest, `vault-ref:synthetic-unconfigured-${id}`, version, status, OUTREACH_NOW - 1, OUTREACH_NOW).run();
  if (status === "active") {
    await repository.recordSenderCapability({
      senderConnectionId: id,
      grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
      verifiedAddresses: [{ address: "owner@example.invalid", kind: "canonical", verificationDigest: "7".repeat(64) }],
      verifiedAt: OUTREACH_NOW, expiresAt: OUTREACH_NOW + 86_400_000, idempotencyKey: `dispatch-sender-capability-${id}`,
    });
  }
  return id;
}

/** A synthetic ContactReady final-send recheck. Only tests inject this. */
export function syntheticFinalSendPort(seeded, overrides = {}) {
  const calls = [];
  return {
    calls,
    port: Object.freeze({
      recheckForFinalSend(input) {
        calls.push(input);
        if (overrides.throws) throw new Error("synthetic eligibility failure");
        return {
          boundary: overrides.boundary ?? "final_send",
          blocked: overrides.blocked ?? false,
          eligibility: {
            state: overrides.state ?? "ContactReady",
            eligible: overrides.eligible ?? true,
            reasonCodes: overrides.reasonCodes ?? [],
            points: overrides.points ?? [{ observationId: seeded.observationId, state: "eligible" }],
          },
        };
      },
    }),
  };
}

/** A fake MailPort. dispatch/reconcile are counted and must stay at zero. */
export function fakeMailPort(respond) {
  const counts = { dispatch: 0, reconcile: 0, sync: 0 };
  const requests = [];
  return {
    counts,
    requests,
    port: Object.freeze({
      async dispatch() { counts.dispatch += 1; throw new Error("dispatch is never reachable from Lane E"); },
      async reconcile() { counts.reconcile += 1; throw new Error("reconcile is never reachable from Lane E"); },
      async syncOriginatedEvents(request) {
        counts.sync += 1;
        requests.push(request);
        return respond(request);
      },
    }),
  };
}

/** In-memory originated reference store (no D1 table exists for it yet). */
export function fakeOriginStore(records) {
  const reads = [];
  return {
    reads,
    store: Object.freeze({
      async listOriginated(connectionId) {
        reads.push(connectionId);
        return records.filter((record) => record.connectionId === connectionId).map((record) => {
          const rest = { ...record };
          delete rest.connectionId;
          return rest;
        });
      },
    }),
  };
}

export async function latestEvent(fixture, outboxItemId) {
  return fixture.database.prepare(
    "SELECT revision,state,reason_code,lease_generation FROM outreach_outbox_events WHERE outbox_item_id=? ORDER BY revision DESC LIMIT 1",
  ).bind(outboxItemId).first();
}

export async function assertNoForbiddenStates(fixture) {
  const row = await fixture.database.prepare(
    `SELECT count(*) count FROM outreach_outbox_events WHERE state IN (${FORBIDDEN_STATES.map(() => "?").join(",")})`,
  ).bind(...FORBIDDEN_STATES).first();
  assert.equal(Number(row.count), 0, "dispatching, sent and delivery_unknown stay unreachable in D1");
}

export function digestOf(label) {
  let hex = "";
  for (const byte of new TextEncoder().encode(label)) hex += byte.toString(16).padStart(2, "0");
  return hex.padEnd(64, "0").slice(0, 64);
}

function packageInput(seeded) {
  return {
    packageId: "dispatch-package-root", prospectId: seeded.prospectId, contactId: seeded.contactId, profileId: seeded.profileId,
    version: 1, expectedVersion: 0, configurationId: seeded.configurationId, configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision, prospectRevision: seeded.prospectRevision, contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest], claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: "Synthetic governed outreach angle", selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest], callScript: "Synthetic offline call script.",
      draftMessageIds: [...MESSAGE_IDS],
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
    idempotencyKey: "dispatch-package-version-create",
  };
}

function messageInput(packageVersion, messageId, index) {
  return {
    messageId, packageId: "dispatch-package-root", packageVersionId: packageVersion.id,
    version: 1, expectedVersion: 0,
    snapshot: {
      senderReference: "sender-synthetic", from: "owner@example.invalid", replyTo: null, to: [RECIPIENT],
      cc: [], bcc: [], subject: `Synthetic governed outreach message ${index}`, textBody: "Hello from the offline fixture.", htmlBody: null,
      links: ["https://example.invalid/unsubscribe"], attachments: [], threadReference: null, replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000, timezone: "America/Toronto", unsubscribeTokenDigest: String(index + 1).repeat(64),
    bindings: [{ kind: "package_version", id: packageVersion.id, digest: packageVersion.digest }],
    idempotencyKey: `dispatch-message-version-${messageId}`,
  };
}
