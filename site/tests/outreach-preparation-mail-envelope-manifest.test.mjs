import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_500_000;
const d = (character) => character.repeat(64);
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
    manifest: await vite.ssrLoadModule(new URL(
      "../preparation/mail-dispatch-envelope-manifest.ts",
      import.meta.url,
    ).pathname),
  };
}

function manifestInput(patch = {}) {
  return {
    id: "synthetic-mail-envelope-manifest",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    outboxItemId: "synthetic-outbox-item",
    sendKey: "synthetic-send-key",
    dispatchKey: "synthetic-dispatch-key",
    packageArtifact: { id: "synthetic-package", digest: d("a") },
    messageArtifact: {
      id: "synthetic-message",
      digest: d("b"),
      packageId: "synthetic-package",
      packageDigest: d("a"),
    },
    packageApproval: { id: "synthetic-package-approval", digest: d("c"), expiresAt: NOW + 30_000 },
    messageApproval: { id: "synthetic-message-approval", digest: d("d"), expiresAt: NOW + 20_000 },
    lease: { id: "synthetic-lease", holderId: "synthetic-worker", generation: 7, expiresAt: NOW + 10_000 },
    finalRecheck: {
      id: "synthetic-final-recheck",
      digest: d("e"),
      status: "synthetic_recheck_passed_no_authority",
    },
    preCallReceipt: { id: "synthetic-pre-call-receipt", digest: d("f"), expiresAt: NOW + 8_000 },
    attemptPreparation: {
      id: "synthetic-attempt-preparation",
      digest: d("1"),
      status: "prepared_no_invocation",
    },
    senderConnectionDigest: d("2"),
    fromAddressDigest: d("3"),
    replyToAddressDigest: d("4"),
    recipientDigests: { to: [d("5")], cc: [d("6")], bcc: [] },
    subjectDigest: d("7"),
    textBodyDigest: d("8"),
    htmlBodyDigest: d("9"),
    linkManifestDigest: d("a"),
    attachmentManifestDigest: d("b"),
    rfcMessageIdDigest: d("c"),
    originatedMarkerDigest: d("d"),
    unsubscribeAuthorityDigest: d("e"),
    createdAt: NOW,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 1_000,
    leaseGeneration: 7,
    artifactBindingsCurrent: true,
    approvalBindingsCurrent: true,
    senderBindingCurrent: true,
    recipientBindingsCurrent: true,
    contentBindingsCurrent: true,
    unsubscribeBindingCurrent: true,
    originatedMarkersCurrent: true,
    finalRecheckCurrent: true,
    preCallReceiptCurrent: true,
    attemptPreparationCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

async function decide(module, currentPatch = {}, authorityPatch = {}) {
  const artifact = await module.buildSyntheticMailDispatchEnvelopeManifest(manifestInput());
  return module.evaluateSyntheticMailDispatchEnvelopeManifest({
    manifest: artifact,
    currentManifest: manifestInput(currentPatch),
    currentAuthority: authority(authorityPatch),
  });
}

test("canonical manifest binds the complete digest-only handoff with literal zero effects", async () => {
  const { vite, manifest } = await load();
  try {
    const artifact = await manifest.buildSyntheticMailDispatchEnvelopeManifest(manifestInput());
    const repeat = await manifest.buildSyntheticMailDispatchEnvelopeManifest(manifestInput());
    assert.equal(artifact.kind, "synthetic_mail_dispatch_envelope_manifest");
    assert.equal(artifact.digest, repeat.digest);
    assert.match(artifact.digest, /^[a-f0-9]{64}$/u);
    assert.equal(artifact.payloadConstructed, false);
    assert.equal(artifact.mailPortResolvable, false);
    assert.equal(artifact.providerSelected, false);
    assert.equal(artifact.credentialReferencePresent, false);
    assert.equal(artifact.dispatchAuthorized, false);
    assert.equal(artifact.providerInvocationAuthorized, false);
    assert.equal(artifact.requestTransmitted, false);
    assert.deepEqual({ ...artifact.effects }, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(artifact), true);
    assert.equal(Object.isFrozen(artifact.snapshot), true);
    assert.equal(Object.isFrozen(artifact.snapshot.recipientDigests.to), true);

    const changed = await manifest.buildSyntheticMailDispatchEnvelopeManifest(
      manifestInput({ textBodyDigest: d("0") }),
    );
    assert.notEqual(changed.digest, artifact.digest);
  } finally {
    await vite.close();
  }
});

test("a wholly current manifest remains non-authoritative and constructs no payload", async () => {
  const { vite, manifest } = await load();
  try {
    const decision = await decide(manifest);
    assert.equal(decision.status, "synthetic_mail_dispatch_envelope_manifest_current_no_authority");
    assert.deepEqual([...decision.reasonCodes], []);
    assert.equal(decision.payloadConstructed, false);
    assert.equal(decision.mailPortResolvable, false);
    assert.equal(decision.providerSelected, false);
    assert.equal(decision.credentialReferencePresent, false);
    assert.equal(decision.dispatchAuthorized, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.requestTransmitted, false);
    assert.equal(decision.automaticRetryAuthorized, false);
    assert.deepEqual({ ...decision.effects }, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("cross-paired Package and Message artifacts cannot form a manifest", async () => {
  const { vite, manifest } = await load();
  try {
    for (const messageArtifact of [
      { ...manifestInput().messageArtifact, packageId: "synthetic-other-package" },
      { ...manifestInput().messageArtifact, packageDigest: d("0") },
    ]) {
      await assert.rejects(
        () => manifest.buildSyntheticMailDispatchEnvelopeManifest(manifestInput({ messageArtifact })),
        { message: "synthetic_mail_dispatch_envelope_manifest_invalid" },
      );
    }
  } finally {
    await vite.close();
  }
});

test("recipient digest sets are canonical, bounded, non-empty, and globally unique", async () => {
  const { vite, manifest } = await load();
  try {
    for (const recipientDigests of [
      { to: [], cc: [], bcc: [] },
      { to: [d("6"), d("5")], cc: [], bcc: [] },
      { to: [d("5")], cc: [d("5")], bcc: [] },
      { to: [d("x")], cc: [], bcc: [] },
    ]) {
      await assert.rejects(
        () => manifest.buildSyntheticMailDispatchEnvelopeManifest(manifestInput({ recipientDigests })),
        { message: "synthetic_mail_dispatch_envelope_manifest_invalid" },
      );
    }
  } finally {
    await vite.close();
  }
});

test("approval, receipt, and lease expiry ordering is fail-closed at exact boundaries", async () => {
  const { vite, manifest } = await load();
  try {
    for (const patch of [
      { preCallReceipt: { id: "synthetic-pre-call-receipt", digest: d("f"), expiresAt: NOW + 11_000 } },
      { messageApproval: { id: "synthetic-message-approval", digest: d("d"), expiresAt: NOW + 31_000 } },
      { lease: { id: "synthetic-lease", holderId: "synthetic-worker", generation: 7, expiresAt: NOW } },
    ]) {
      await assert.rejects(
        () => manifest.buildSyntheticMailDispatchEnvelopeManifest(manifestInput(patch)),
        { message: "synthetic_mail_dispatch_envelope_manifest_invalid" },
      );
    }

    for (const [evaluatedAt, reason] of [
      [NOW + 8_000, "pre_call_receipt_expired"],
      [NOW + 10_000, "lease_expired"],
      [NOW + 20_000, "message_approval_expired"],
      [NOW + 30_000, "package_approval_expired"],
    ]) {
      const decision = await decide(manifest, {}, { evaluatedAt });
      assert.equal(decision.status, "synthetic_mail_dispatch_envelope_manifest_rejected");
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.providerInvocationAuthorized, false);
    }
  } finally {
    await vite.close();
  }
});

test("every current binding and the zero-effect fence is independently rechecked", async () => {
  const { vite, manifest } = await load();
  try {
    const cases = [
      ["artifactBindingsCurrent", "artifact_bindings_not_current"],
      ["approvalBindingsCurrent", "approval_bindings_not_current"],
      ["senderBindingCurrent", "sender_binding_not_current"],
      ["recipientBindingsCurrent", "recipient_bindings_not_current"],
      ["contentBindingsCurrent", "content_bindings_not_current"],
      ["unsubscribeBindingCurrent", "unsubscribe_binding_not_current"],
      ["originatedMarkersCurrent", "originated_markers_not_current"],
      ["finalRecheckCurrent", "final_recheck_not_current"],
      ["preCallReceiptCurrent", "pre_call_receipt_not_current"],
      ["attemptPreparationCurrent", "attempt_preparation_not_current"],
      ["externalEffectsDisabled", "external_effects_not_disabled"],
    ];
    for (const [field, reason] of cases) {
      const decision = await decide(manifest, {}, { [field]: false });
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.deepEqual({ ...decision.effects }, ZERO_EFFECTS);
    }
    const staleLease = await decide(manifest, {}, { leaseGeneration: 8 });
    assert.equal(staleLease.reasonCodes.includes("lease_generation_changed"), true);
    const changedManifest = await decide(manifest, { originatedMarkerDigest: d("0") });
    assert.equal(changedManifest.reasonCodes.includes("envelope_manifest_changed"), true);
  } finally {
    await vite.close();
  }
});

test("extra fields, accessors, forged artifacts, and authority-like statuses fail closed", async () => {
  const { vite, manifest } = await load();
  try {
    await assert.rejects(
      () => manifest.buildSyntheticMailDispatchEnvelopeManifest(manifestInput({ providerSelected: true })),
      { message: "synthetic_mail_dispatch_envelope_manifest_invalid" },
    );
    await assert.rejects(
      () => manifest.buildSyntheticMailDispatchEnvelopeManifest(manifestInput({
        attemptPreparation: { ...manifestInput().attemptPreparation, status: "boundary_committed" },
      })),
      { message: "synthetic_mail_dispatch_envelope_manifest_invalid" },
    );
    const getterBacked = manifestInput();
    Object.defineProperty(getterBacked, "dispatchKey", { enumerable: true, get: () => "synthetic-dispatch-key" });
    await assert.rejects(
      () => manifest.buildSyntheticMailDispatchEnvelopeManifest(getterBacked),
      { message: "synthetic_mail_dispatch_envelope_manifest_invalid" },
    );
    await assert.rejects(
      () => manifest.evaluateSyntheticMailDispatchEnvelopeManifest({
        manifest: Object.freeze({}),
        currentManifest: manifestInput(),
        currentAuthority: authority(),
      }),
      { message: "synthetic_mail_dispatch_envelope_manifest_invalid" },
    );
  } finally {
    await vite.close();
  }
});

test("module has no runtime, provider, network, persistence, address, or content seam", async () => {
  const source = await readFile(
    new URL("../preparation/mail-dispatch-envelope-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /^import\s/mu);
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|gmail\.googleapis|@googleapis|nodemailer/iu);
  assert.doesNotMatch(source, /\b(?:D1Database|MailPort|dispatch\s*\(|reconcile\s*\(|send\s*\()/u);
  assert.doesNotMatch(source, /@[a-z0-9.-]+|\+1\d{10}/iu);
  assert.doesNotMatch(source, /\b(?:subject|textBody|htmlBody|fromAddress|replyToAddress):\s*string/u);
  assert.match(source, /payloadConstructed: false/);
  assert.match(source, /providerInvocationAuthorized: false/);
  assert.match(source, /requestTransmitted: false/);
});
