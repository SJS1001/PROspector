// Lane-local synthetic fixture for the Outreach Package and Message Version
// services. It builds on the shared seeded outreach authority without editing
// tests/helpers/outreach-fixture.mjs. All values are synthetic placeholders.
import { OUTREACH_NOW } from "./outreach-fixture.mjs";

export const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadArtifactModules(vite) {
  const load = (path) => vite.ssrLoadModule(new URL(`../../domain/${path}`, import.meta.url).pathname);
  return {
    packages: await load("outreach-package.ts"),
    messages: await load("message-version.ts"),
    eligibility: await load("contact-eligibility.ts"),
    repository: await load("outreach-repository.ts"),
  };
}

/** A complete synthetic package draft independent of any database row. */
export function pureSyntheticPackageDraft(overrides = {}) {
  return {
    packageId: "synthetic-package",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    profileId: "synthetic-profile",
    version: 1,
    configurationId: "synthetic-configuration",
    configurationDigest: "a".repeat(64),
    configurationRevision: 1,
    prospectRevision: 1,
    contactRevision: 1,
    contactEligibilitySnapshotId: "synthetic-eligibility",
    snapshot: {
      evidenceDigests: ["1".repeat(64), "2".repeat(64)],
      claimGuardrailDigests: ["3".repeat(64)],
      recommendedAngle: "Synthetic angle",
      selectedRole: "champion",
      selectedContactPointDigests: ["4".repeat(64)],
      callScript: "Synthetic derived call script.",
      draftMessageIds: ["synthetic-message-a", "synthetic-message-b"],
    },
    bindings: pureSyntheticBindings(),
    ...overrides,
  };
}

export function pureSyntheticBindings() {
  return [
    { kind: "configuration", id: "synthetic-configuration", digest: "a".repeat(64) },
    { kind: "qualification", id: "synthetic-qualification", digest: "b".repeat(64) },
    { kind: "review_decision", id: "synthetic-review", digest: "c".repeat(64) },
    { kind: "source", id: "synthetic-source", digest: "d".repeat(64) },
    { kind: "evidence", id: "synthetic-evidence", digest: "1".repeat(64) },
    { kind: "claim_guardrail", id: "synthetic-guardrail", digest: "3".repeat(64) },
    { kind: "contact_observation", id: "synthetic-observation", digest: "e".repeat(64) },
    { kind: "contact_eligibility", id: "synthetic-eligibility", digest: "f".repeat(64) },
  ];
}

export function pureSyntheticMessageDraft(overrides = {}) {
  return {
    messageId: "synthetic-message-a",
    packageId: "synthetic-package",
    packageVersionId: "synthetic-package-version",
    version: 1,
    snapshot: {
      senderReference: "sender-synthetic",
      from: "owner@example.invalid",
      replyTo: null,
      to: ["verified@example.invalid"],
      cc: [],
      bcc: [],
      subject: "Synthetic subject",
      textBody: "Synthetic text body.",
      htmlBody: null,
      links: ["https://example.invalid/unsubscribe"],
      attachments: [],
      threadReference: null,
      replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000,
    timezone: "America/Toronto",
    unsubscribeTokenDigest: "9".repeat(64),
    ...overrides,
  };
}

/** Draft for the seeded database authority from tests/helpers/outreach-fixture.mjs. */
export function seededPackageDraft(seeded, overrides = {}) {
  return {
    packageId: "artifact-package-root",
    prospectId: seeded.prospectId,
    contactId: seeded.contactId,
    profileId: seeded.profileId,
    version: 1,
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
      callScript: "Synthetic offline call script.",
      draftMessageIds: ["artifact-message-a", "artifact-message-b"],
    },
    bindings: seededBindings(seeded),
    ...overrides,
  };
}

export function seededBindings(seeded) {
  return [
    { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
    { kind: "qualification", id: "outreach-assessment", digest: "2".repeat(64) },
    { kind: "review_decision", id: "outreach-review", digest: "5".repeat(64) },
    { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
    { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
    { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
    { kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest },
    { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
  ];
}

export function seededMessageDraft(packageVersion, overrides = {}) {
  return {
    messageId: "artifact-message-a",
    packageId: "artifact-package-root",
    packageVersionId: packageVersion.id,
    version: 1,
    snapshot: {
      senderReference: "sender-synthetic",
      from: "owner@example.invalid",
      replyTo: null,
      to: ["verified@example.invalid"],
      cc: [],
      bcc: [],
      subject: "Synthetic governed outreach message",
      textBody: "Hello from the offline fixture.",
      htmlBody: null,
      links: ["https://example.invalid/unsubscribe"],
      attachments: [],
      threadReference: null,
      replyToMessageReference: null,
    },
    intendedSendAt: OUTREACH_NOW + 1_000,
    timezone: "America/Toronto",
    unsubscribeTokenDigest: "9".repeat(64),
    ...overrides,
  };
}

/** Opaque synthetic evidence. Only an injected test port interprets it. */
export function syntheticContactEvidence(seeded) {
  return {
    points: [],
    strategy: { configurationId: seeded.configurationId, configurationDigest: seeded.configurationDigest },
    authority: {
      prospectId: seeded.prospectId,
      configurationId: seeded.configurationId,
      configurationDigest: seeded.configurationDigest,
      profileAvailable: true,
      configurationCurrent: true,
      drifted: false,
      disqualified: false,
      suppressed: false,
      phase4Approved: true,
      contactCapabilityEnabled: true,
    },
  };
}

const ZERO_EFFECTS = Object.freeze({ packageMutations: 0, exportMutations: 0, callInvocations: 0, sendInvocations: 0, suppressionMutations: 0 });

/**
 * A test-only eligibility port returning a synthetic ContactReady projection
 * for the given observation. `pointState` lets a test express a weak
 * (suggestion) or stale contact point; `blocked` mirrors the production gate.
 */
export function syntheticEligibilityPort(observationId, options = {}) {
  const calls = [];
  const pointState = options.pointState ?? "eligible";
  const ready = pointState === "eligible" && options.state === undefined;
  return {
    calls,
    port: Object.freeze({
      recheckForPackageApproval(input) {
        calls.push(input);
        return {
          boundary: options.boundary ?? "package_approval",
          blocked: options.blocked ?? false,
          eligibility: {
            state: options.state ?? (ready ? "ContactReady" : pointState === "stale" ? "NeedsReview" : "ContactSuggestion"),
            eligible: options.state === undefined ? ready : options.state === "ContactReady",
            reasonCodes: ready ? [] : [pointState === "stale" ? "contact_evidence_stale" : "verification_class_ineligible"],
            points: [{
              observationId,
              state: pointState,
              freshnessExpiresAt: pointState === "eligible" ? OUTREACH_NOW + 30 * DAY_MS : null,
              verificationClass: pointState === "suggestion" ? "pattern_generated" : "mailbox_verified",
            }],
          },
          effectsBefore: ZERO_EFFECTS,
          effectsAfter: ZERO_EFFECTS,
        };
      },
    }),
  };
}

export async function recordRecipientAuthority(repository, messageVersionId, packageApprovalId, seeded, validUntil) {
  const authority = await repository.recordRecipientDispatchAuthority({
    messageVersionId,
    packageApprovalId,
    emailObservationId: seeded.observationId,
    jurisdictionCode: "CA-ON",
    claimedBasisCode: "legitimate_interest",
    basisSourceId: "outreach-source",
    basisSourceDigest: seeded.sourceDigest,
    advisoryPolicyVersion: "prospector-advisory-v1",
    advisoryPolicyDigest: "c".repeat(64),
    unsubscribePathDigest: "d".repeat(64),
    acknowledgedAt: OUTREACH_NOW,
    validUntil,
    idempotencyKey: `artifact-recipient-authority-${messageVersionId}`,
  });
  await repository.recordUnsubscribeAuthorityEvent({
    recipientAuthorityId: authority.id,
    expectedRevision: 0,
    status: "working",
    checkDigest: "e".repeat(64),
    observedAt: OUTREACH_NOW,
    validUntil,
    idempotencyKey: `artifact-unsubscribe-working-${messageVersionId}`,
  });
  return authority;
}
