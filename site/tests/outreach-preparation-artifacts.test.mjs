import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_100_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    artifacts: await vite.ssrLoadModule(new URL("../preparation/outreach-artifacts.ts", import.meta.url).pathname),
    approvals: await vite.ssrLoadModule(new URL("../preparation/outreach-approval-suppression.ts", import.meta.url).pathname),
  };
}

function packageInput(patch = {}) {
  return {
    id: "synthetic-package",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: A,
    qualificationEvidenceHashes: [C, B],
    sourceHashes: [B, A],
    recommendedAngle: "Synthetic operational-efficiency discussion",
    claimGuardrailVersionIds: ["synthetic-guardrail-b", "synthetic-guardrail-a"],
    selectedContactPoints: [
      {
        id: "synthetic-contact-point-phone",
        kind: "phone",
        value: "+12025550101",
        verificationClass: "source_verified",
        freshUntil: NOW + 90_000,
      },
      {
        id: "synthetic-contact-point-email",
        kind: "email",
        value: "prospect@example.invalid",
        verificationClass: "mailbox_verified",
        freshUntil: NOW + 30_000,
      },
    ],
    messageVersionIds: ["synthetic-message-b", "synthetic-message-a"],
    createdAt: NOW,
    ...patch,
  };
}

function messageInput(packageDigest, patch = {}) {
  return {
    id: "synthetic-message-a",
    packageId: "synthetic-package",
    packageDigest,
    profileConfigurationId: "synthetic-profile-configuration",
    profileConfigurationDigest: A,
    sender: {
      from: "owner@example.invalid",
      replyTo: "replies@example.invalid",
    },
    recipients: {
      to: ["prospect@example.invalid"],
      cc: ["observer@example.invalid"],
      bcc: [],
    },
    subject: "[SYNTHETIC] Operational efficiency",
    textBody: "Synthetic outreach body for local contract testing only.",
    htmlBody: "<p>Synthetic outreach body for local contract testing only.</p>",
    links: ["https://b.example.invalid/path", "https://a.example.invalid/path"],
    attachments: [
      {
        id: "synthetic-attachment",
        filename: "synthetic-summary.txt",
        mediaType: "text/plain",
        sizeBytes: 128,
        digest: B,
      },
    ],
    threadId: null,
    replyToMessageId: null,
    intendedSendAt: NOW + 3_600_000,
    timezone: "America/Toronto",
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 100,
    packageApprovalExpiresAt: NOW + 10_000,
    messageApprovalExpiresAt: NOW + 9_000,
    profileAvailable: true,
    prospectApproved: true,
    contactReady: true,
    contactFreshUntil: NOW + 8_000,
    highRiskDrift: false,
    suppressionBlocked: false,
    revokedDependencyIds: [],
    ...patch,
  };
}

async function built(module) {
  const packageArtifact = await module.buildSyntheticOutreachPackage(packageInput());
  const messageArtifact = await module.buildSyntheticMessageVersion(messageInput(packageArtifact.digest));
  return { packageArtifact, messageArtifact };
}

test("canonical package and message artifacts are deterministic, deeply frozen, and zero-effect", async () => {
  const { vite, artifacts } = await load();
  try {
    const firstPackage = await artifacts.buildSyntheticOutreachPackage(packageInput());
    const permutedPackage = await artifacts.buildSyntheticOutreachPackage(packageInput({
      qualificationEvidenceHashes: [B, C],
      sourceHashes: [A, B],
      claimGuardrailVersionIds: ["synthetic-guardrail-a", "synthetic-guardrail-b"],
      selectedContactPoints: [...packageInput().selectedContactPoints].reverse(),
      messageVersionIds: ["synthetic-message-a", "synthetic-message-b"],
    }));
    assert.equal(firstPackage.digest, permutedPackage.digest);
    assert.match(firstPackage.digest, /^[a-f0-9]{64}$/u);
    assert.equal(firstPackage.callScript.opening, packageInput().recommendedAngle);
    assert.deepEqual(firstPackage.callScript.claimGuardrailVersionIds, ["synthetic-guardrail-a", "synthetic-guardrail-b"]);
    assert.deepEqual(firstPackage.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(firstPackage), true);
    assert.equal(Object.isFrozen(firstPackage.snapshot.selectedContactPoints), true);
    assert.equal(Object.isFrozen(firstPackage.callScript), true);

    const firstMessage = await artifacts.buildSyntheticMessageVersion(messageInput(firstPackage.digest));
    const permutedMessage = await artifacts.buildSyntheticMessageVersion(messageInput(firstPackage.digest, {
      links: [...messageInput(firstPackage.digest).links].reverse(),
    }));
    assert.equal(firstMessage.digest, permutedMessage.digest);
    assert.deepEqual(firstMessage.snapshot.links, ["https://a.example.invalid/path", "https://b.example.invalid/path"]);
    assert.deepEqual(firstMessage.effects, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(firstMessage.snapshot.recipients), true);
  } finally {
    await vite.close();
  }
});

test("every canonical package field or dependency change invalidates the package digest", async () => {
  const { vite, artifacts } = await load();
  try {
    const baseline = await artifacts.buildSyntheticOutreachPackage(packageInput());
    const mutations = [
      (value) => { value.profileConfigurationDigest = B; },
      (value) => { value.qualificationEvidenceHashes = [A]; },
      (value) => { value.sourceHashes = [C]; },
      (value) => { value.recommendedAngle = "Synthetic changed angle"; },
      (value) => { value.claimGuardrailVersionIds = ["synthetic-guardrail-c"]; },
      (value) => { value.selectedContactPoints[0].freshUntil += 1; },
      (value) => { value.selectedContactPoints[1].verificationClass = "source_verified"; },
      (value) => { value.messageVersionIds = ["synthetic-message-a"]; },
      (value) => { value.createdAt += 1; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(packageInput());
      mutate(changed);
      const artifact = await artifacts.buildSyntheticOutreachPackage(changed);
      assert.notEqual(artifact.digest, baseline.digest);
    }
  } finally {
    await vite.close();
  }
});

test("every canonical message field including schedule creates a different immutable digest", async () => {
  const { vite, artifacts } = await load();
  try {
    const packageArtifact = await artifacts.buildSyntheticOutreachPackage(packageInput());
    const baselineInput = messageInput(packageArtifact.digest);
    const baseline = await artifacts.buildSyntheticMessageVersion(baselineInput);
    const mutations = [
      (value) => { value.sender.from = "alternate@example.invalid"; },
      (value) => { value.recipients.to = ["alternate@example.invalid"]; },
      (value) => { value.subject = "[SYNTHETIC] Changed subject"; },
      (value) => { value.textBody += " Synthetic change."; },
      (value) => { value.htmlBody = "<p>Synthetic changed body.</p>"; },
      (value) => { value.links = ["https://changed.example.invalid/path"]; },
      (value) => { value.attachments[0].digest = C; },
      (value) => { value.threadId = "synthetic-thread"; },
      (value) => { value.replyToMessageId = "synthetic-prior-message"; },
      (value) => { value.intendedSendAt += 1; },
      (value) => { value.timezone = "UTC"; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(baselineInput);
      mutate(changed);
      const artifact = await artifacts.buildSyntheticMessageVersion(changed);
      assert.notEqual(artifact.digest, baseline.digest);
    }
  } finally {
    await vite.close();
  }
});

test("artifact validity names exact canonical and authority invalidations with zero effects", async () => {
  const { vite, artifacts } = await load();
  try {
    const { packageArtifact, messageArtifact } = await built(artifacts);
    const valid = await artifacts.evaluateSyntheticArtifactValidity({
      packageArtifact,
      messageArtifact,
      currentPackage: packageInput(),
      currentMessage: messageInput(packageArtifact.digest),
      authority: authority(),
    });
    assert.deepEqual(valid.reasonCodes, []);
    assert.equal(valid.packageApprovalValid, true);
    assert.equal(valid.messageApprovalValid, true);
    assert.deepEqual(valid.effects, ZERO_EFFECTS);

    const cases = [
      ["package_digest_changed", { currentPackage: packageInput({ recommendedAngle: "Synthetic changed angle" }) }],
      ["message_digest_changed", { currentMessage: messageInput(packageArtifact.digest, { subject: "[SYNTHETIC] Changed" }) }],
      ["profile_unavailable", { authority: authority({ profileAvailable: false }) }],
      ["prospect_not_approved", { authority: authority({ prospectApproved: false }) }],
      ["contact_not_ready", { authority: authority({ contactReady: false }) }],
      ["contact_stale", { authority: authority({ contactFreshUntil: NOW + 99 }) }],
      ["high_risk_drift", { authority: authority({ highRiskDrift: true }) }],
      ["suppression_blocked", { authority: authority({ suppressionBlocked: true }) }],
      ["dependency_revoked", { authority: authority({ revokedDependencyIds: ["synthetic-guardrail-a"] }) }],
      ["package_approval_expired", { authority: authority({ packageApprovalExpiresAt: NOW + 100 }) }],
      ["message_approval_expired", { authority: authority({ messageApprovalExpiresAt: NOW + 100 }) }],
    ];
    for (const [reason, patch] of cases) {
      const projection = await artifacts.evaluateSyntheticArtifactValidity({
        packageArtifact,
        messageArtifact,
        currentPackage: patch.currentPackage ?? packageInput(),
        currentMessage: patch.currentMessage ?? messageInput(packageArtifact.digest),
        authority: patch.authority ?? authority(),
      });
      assert.equal(projection.reasonCodes.includes(reason), true, reason);
      assert.equal(projection.messageApprovalValid, false, reason);
      assert.deepEqual(projection.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("built digests feed the isolated approval model without composing a runtime effect", async () => {
  const { vite, artifacts, approvals } = await load();
  try {
    const { packageArtifact, messageArtifact } = await built(artifacts);
    const state = approvals.createSyntheticOutreachPreparation({
      workspaceId: "synthetic-workspace",
      companyId: "synthetic-company",
      contactId: "synthetic-contact",
      organizationId: "synthetic-organization",
      selectedEmail: "prospect@example.invalid",
      confirmedEmailDomains: ["example.invalid"],
      selectedPhone: "+12025550101",
      packageArtifact: { id: packageArtifact.id, digest: packageArtifact.digest },
      messageArtifact: {
        id: messageArtifact.id,
        digest: messageArtifact.digest,
        packageId: packageArtifact.id,
        packageDigest: packageArtifact.digest,
      },
    });
    assert.deepEqual(state.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("message validity requires package membership and the exact package configuration", async () => {
  const { vite, artifacts } = await load();
  try {
    const packageArtifact = await artifacts.buildSyntheticOutreachPackage(packageInput());
    const cases = [
      messageInput(packageArtifact.digest, { id: "synthetic-message-c" }),
      messageInput(packageArtifact.digest, { profileConfigurationId: "synthetic-other-configuration" }),
      messageInput(packageArtifact.digest, { profileConfigurationDigest: B }),
    ];
    for (const message of cases) {
      const messageArtifact = await artifacts.buildSyntheticMessageVersion(message);
      const projection = await artifacts.evaluateSyntheticArtifactValidity({
        packageArtifact,
        messageArtifact,
        currentPackage: packageInput(),
        currentMessage: message,
        authority: authority(),
      });
      assert.equal(projection.packageApprovalValid, true);
      assert.equal(projection.messageApprovalValid, false);
      assert.deepEqual(projection.reasonCodes, ["message_package_binding_changed"]);
      assert.deepEqual(projection.effects, ZERO_EFFECTS);
    }
  } finally {
    await vite.close();
  }
});

test("real-looking, unsafe, duplicate, accessor, sparse, extra, and forged artifacts fail closed", async () => {
  const { vite, artifacts } = await load();
  try {
    await assert.rejects(
      artifacts.buildSyntheticOutreachPackage(packageInput({ recommendedAngle: "Ordinary sales angle" })),
      /synthetic_outreach_package_invalid/,
    );
    await assert.rejects(
      artifacts.buildSyntheticOutreachPackage(packageInput({ qualificationEvidenceHashes: [A, A] })),
      /synthetic_outreach_package_invalid/,
    );
    const accessor = packageInput();
    Object.defineProperty(accessor, "recommendedAngle", { enumerable: true, get() { throw new Error("must-not-run"); } });
    await assert.rejects(artifacts.buildSyntheticOutreachPackage(accessor), /synthetic_outreach_package_invalid/);
    await assert.rejects(
      artifacts.buildSyntheticOutreachPackage(packageInput({ messageVersionIds: new Array(1) })),
      /synthetic_outreach_package_invalid/,
    );
    const packageArtifact = await artifacts.buildSyntheticOutreachPackage(packageInput());
    await assert.rejects(
      artifacts.buildSyntheticMessageVersion(messageInput(packageArtifact.digest, { recipients: { to: ["real@example.com"], cc: [], bcc: [] } })),
      /synthetic_outreach_message_invalid/,
    );
    await assert.rejects(
      artifacts.buildSyntheticMessageVersion(messageInput(packageArtifact.digest, { htmlBody: "<script>Synthetic unsafe</script>" })),
      /synthetic_outreach_message_invalid/,
    );
    await assert.rejects(
      artifacts.buildSyntheticMessageVersion(messageInput(packageArtifact.digest, { links: ["https://example.com/real"] })),
      /synthetic_outreach_message_invalid/,
    );
    await assert.rejects(
      artifacts.evaluateSyntheticArtifactValidity({
        packageArtifact: { ...packageArtifact },
        messageArtifact: await artifacts.buildSyntheticMessageVersion(messageInput(packageArtifact.digest)),
        currentPackage: packageInput(),
        currentMessage: messageInput(packageArtifact.digest),
        authority: authority(),
      }),
      /synthetic_outreach_artifact_invalid/,
    );
  } finally {
    await vite.close();
  }
});
