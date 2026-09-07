import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_400_000;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const E = "e".repeat(64);
const F = "f".repeat(64);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});
const DENIED = "synthetic_mail_port_admission_denied_unconfigured_no_authority";
const REJECTED = "synthetic_mail_port_admission_rejected";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return {
    vite,
    admission: await vite.ssrLoadModule(new URL(
      "../preparation/mail-port-admission-decision.ts",
      import.meta.url,
    ).pathname),
  };
}

function port(patch = {}) {
  return {
    portKind: "provider_neutral_mail_port",
    implementationState: "unconfigured",
    providerSelected: false,
    credentialReferencePresent: false,
    endpointConfigured: false,
    providerInvocationCount: 0,
    descriptorDigest: F,
    ...patch,
  };
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-mail-port-admission",
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    outboxItemId: "synthetic-outbox-item",
    sendKey: "synthetic-send-key",
    dispatchKey: "synthetic-dispatch-key",
    packageArtifact: { id: "synthetic-package", digest: A },
    messageArtifact: {
      id: "synthetic-message-a",
      digest: B,
      packageId: "synthetic-package",
      packageDigest: A,
    },
    packageApprovalId: "synthetic-package-approval",
    packageApprovalDigest: C,
    packageApprovalExpiresAt: NOW + 9_000,
    messageApprovalId: "synthetic-message-approval",
    messageApprovalDigest: D,
    messageApprovalExpiresAt: NOW + 8_000,
    finalRecheckDecisionId: "synthetic-final-recheck",
    finalRecheckDecisionDigest: E,
    finalRecheckStatus: "synthetic_recheck_passed_no_authority",
    preCallReceiptId: "synthetic-pre-call-receipt",
    preCallReceiptDigest: "1".repeat(64),
    preCallReceiptValidUntil: NOW + 6_000,
    preparationId: "synthetic-attempt-preparation",
    preparationDigest: "2".repeat(64),
    attemptOrdinal: 1,
    lease: {
      id: "synthetic-lease",
      holderId: "synthetic-worker",
      generation: 9,
      acquiredAt: NOW,
      expiresAt: NOW + 10_000,
    },
    port: port(),
    manualCallSubstitutesForEmailApproval: false,
    createdAt: NOW,
    ...patch,
  };
}

function currentAuthority(patch = {}) {
  return {
    evaluatedAt: NOW + 100,
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    prospectId: "synthetic-prospect",
    contactId: "synthetic-contact",
    outboxItemId: "synthetic-outbox-item",
    sendKey: "synthetic-send-key",
    dispatchKey: "synthetic-dispatch-key",
    itemState: "leased",
    lease: {
      id: "synthetic-lease",
      holderId: "synthetic-worker",
      generation: 9,
      expiresAt: NOW + 10_000,
    },
    packageArtifact: { id: "synthetic-package", digest: A },
    messageArtifact: {
      id: "synthetic-message-a",
      digest: B,
      packageId: "synthetic-package",
      packageDigest: A,
    },
    packageApprovalId: "synthetic-package-approval",
    packageApprovalDigest: C,
    packageApprovalExpiresAt: NOW + 9_000,
    packageApprovalImmutable: true,
    messageApprovalId: "synthetic-message-approval",
    messageApprovalDigest: D,
    messageApprovalExpiresAt: NOW + 8_000,
    messageApprovalImmutable: true,
    finalRecheckDecisionId: "synthetic-final-recheck",
    finalRecheckDecisionDigest: E,
    finalRecheckStatus: "synthetic_recheck_passed_no_authority",
    preCallReceiptId: "synthetic-pre-call-receipt",
    preCallReceiptDigest: "1".repeat(64),
    preCallReceiptValidUntil: NOW + 6_000,
    preparationId: "synthetic-attempt-preparation",
    preparationDigest: "2".repeat(64),
    preparationState: "prepared_no_invocation",
    port: port(),
    suppressionEffective: false,
    suppressionPrecedesSuccessAcknowledgement: true,
    stopRuleActive: false,
    deliveryState: "not_attempted",
    deliveryUnknownRecorded: false,
    providerAttemptCount: 0,
    manualCallBranchStatus: "absent",
    externalEffectsDisabled: true,
    ...patch,
  };
}

async function decide(admission, { candidatePatch = {}, currentPatch = {}, authorityPatch = {} } = {}) {
  const candidate = await admission.buildSyntheticMailPortAdmissionCandidate(candidateInput(candidatePatch));
  return admission.evaluateSyntheticMailPortAdmission({
    candidate,
    currentCandidate: candidateInput({ ...candidatePatch, ...currentPatch }),
    currentAuthority: currentAuthority(authorityPatch),
  });
}

test("the admission candidate is a deeply frozen, zero-effect, non-authoritative artifact", async () => {
  const { vite, admission } = await load();
  try {
    const candidate = await admission.buildSyntheticMailPortAdmissionCandidate(candidateInput());
    assert.equal(candidate.kind, "synthetic_mail_port_admission_candidate");
    assert.match(candidate.digest, /^[a-f0-9]{64}$/u);
    assert.equal(candidate.mailPortResolvable, false);
    assert.equal(candidate.providerInvocationAuthorized, false);
    assert.equal(candidate.dispatchAuthorized, false);
    assert.equal(candidate.automaticRetryAuthorized, false);
    assert.deepEqual({ ...candidate.effects }, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(candidate), true);
    assert.equal(Object.isFrozen(candidate.snapshot), true);
    assert.equal(Object.isFrozen(candidate.snapshot.lease), true);
    assert.equal(Object.isFrozen(candidate.snapshot.port), true);
    assert.equal(candidate.snapshot.attemptOrdinal, 1);

    const repeat = await admission.buildSyntheticMailPortAdmissionCandidate(candidateInput());
    assert.equal(repeat.digest, candidate.digest);
    const moved = await admission.buildSyntheticMailPortAdmissionCandidate(
      candidateInput({ preparationDigest: "3".repeat(64) }),
    );
    assert.notEqual(moved.digest, candidate.digest);
  } finally {
    await vite.close();
  }
});

test("a complete current tuple still denies admission because the only port is unresolvable", async () => {
  const { vite, admission } = await load();
  try {
    const decision = await decide(admission);
    assert.equal(decision.status, DENIED);
    assert.deepEqual([...decision.reasonCodes], []);
    assert.equal(decision.projectedPortOutcome, "definite_failure_connection_unavailable_before_transmission");
    assert.equal(decision.requestTransmitted, false);
    assert.equal(decision.mailPortResolvable, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.equal(decision.dispatchAuthorized, false);
    assert.equal(decision.automaticRetryAuthorized, false);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.successAcknowledgementAuthorized, false);
    assert.equal(decision.manualCallAdvisoryOnly, true);
    assert.equal(decision.attemptOrdinal, 1);
    assert.equal(decision.portImplementationState, "unconfigured");
    assert.deepEqual({ ...decision.effects }, ZERO_EFFECTS);
    assert.equal(Object.isFrozen(decision), true);
  } finally {
    await vite.close();
  }
});

test("no representable port descriptor can be configured, credentialed, or previously invoked", async () => {
  const { vite, admission } = await load();
  try {
    const hostile = [
      { implementationState: "configured" },
      { implementationState: "authorized" },
      { providerSelected: true },
      { credentialReferencePresent: true },
      { endpointConfigured: true },
      { providerInvocationCount: 1 },
      { portKind: "gmail_rest_port" },
    ];
    for (const patch of hostile) {
      await assert.rejects(
        () => admission.buildSyntheticMailPortAdmissionCandidate(candidateInput({ port: port(patch) })),
        { message: "synthetic_mail_port_admission_candidate_invalid" },
        JSON.stringify(patch),
      );
    }
    const notSelected = await admission.buildSyntheticMailPortAdmissionCandidate(
      candidateInput({ port: port({ implementationState: "not_selected" }) }),
    );
    assert.equal(notSelected.snapshot.port.implementationState, "not_selected");
    assert.equal(notSelected.mailPortResolvable, false);
  } finally {
    await vite.close();
  }
});

test("immutable Package and Message approvals are rechecked independently", async () => {
  const { vite, admission } = await load();
  try {
    for (const [patch, reason] of [
      [{ messageApprovalDigest: "9".repeat(64) }, "message_approval_changed"],
      [{ messageApprovalId: "synthetic-message-approval-2" }, "message_approval_changed"],
      [{ packageApprovalDigest: "9".repeat(64) }, "package_approval_changed"],
      [{ packageApprovalId: "synthetic-package-approval-2" }, "package_approval_changed"],
      [{ messageApprovalImmutable: false }, "message_approval_not_immutable"],
      [{ packageApprovalImmutable: false }, "package_approval_not_immutable"],
      [{ messageApprovalExpiresAt: NOW + 50 }, "message_approval_expired"],
      [{ packageApprovalExpiresAt: NOW + 50 }, "package_approval_expired"],
    ]) {
      const decision = await decide(admission, { authorityPatch: patch });
      assert.equal(decision.status, REJECTED, reason);
      assert.equal(decision.reasonCodes.includes(reason), true, `${reason} in ${decision.reasonCodes}`);
      assert.equal(decision.providerInvocationAuthorized, false);
    }

    const artifactDrift = await decide(admission, { authorityPatch: { messageArtifact: {
      id: "synthetic-message-b", digest: "8".repeat(64), packageId: "synthetic-package", packageDigest: A,
    } } });
    assert.equal(artifactDrift.reasonCodes.includes("message_artifact_changed"), true);

    const bindingDrift = await decide(admission, { authorityPatch: { messageArtifact: {
      id: "synthetic-message-a", digest: B, packageId: "synthetic-other-package", packageDigest: A,
    } } });
    assert.equal(bindingDrift.reasonCodes.includes("message_package_binding_changed"), true);
  } finally {
    await vite.close();
  }
});

test("the final lease fence and its pre-call recheck must both still be current", async () => {
  const { vite, admission } = await load();
  try {
    for (const [patch, reason] of [
      [{ lease: { id: "synthetic-lease-2", holderId: "synthetic-worker", generation: 9, expiresAt: NOW + 10_000 } }, "lease_id_mismatch"],
      [{ lease: { id: "synthetic-lease", holderId: "synthetic-worker-2", generation: 9, expiresAt: NOW + 10_000 } }, "lease_holder_mismatch"],
      [{ lease: { id: "synthetic-lease", holderId: "synthetic-worker", generation: 10, expiresAt: NOW + 10_000 } }, "lease_generation_mismatch"],
      [{ evaluatedAt: NOW + 10_000 }, "lease_expired"],
      [{ itemState: "dispatching" }, "item_not_leased"],
      [{ finalRecheckStatus: "synthetic_recheck_rejected" }, "final_recheck_not_passed"],
      [{ finalRecheckDecisionDigest: "7".repeat(64) }, "final_recheck_decision_changed"],
      [{ preCallReceiptDigest: "7".repeat(64) }, "pre_call_receipt_changed"],
      [{ evaluatedAt: NOW + 6_000 }, "pre_call_receipt_expired"],
      [{ preparationDigest: "7".repeat(64) }, "dispatch_preparation_changed"],
      [{ preparationState: "voided_before_invocation" }, "dispatch_preparation_not_current"],
      [{ preparationState: "reprepared_no_invocation" }, "dispatch_preparation_not_current"],
      [{ preparationState: "absent" }, "dispatch_preparation_not_current"],
      [{ port: port({ descriptorDigest: "7".repeat(64) }) }, "mail_port_descriptor_changed"],
      [{ externalEffectsDisabled: false }, "external_effects_not_disabled"],
      [{ evaluatedAt: NOW - 1 }, "evaluation_precedes_candidate_creation"],
    ]) {
      const decision = await decide(admission, { authorityPatch: patch });
      assert.equal(decision.status, REJECTED, reason);
      assert.equal(decision.reasonCodes.includes(reason), true, `${reason} in ${decision.reasonCodes}`);
    }

    const swapped = await decide(admission, { currentPatch: { preparationId: "synthetic-attempt-preparation-2" } });
    assert.equal(swapped.reasonCodes.includes("admission_candidate_changed"), true);

    // A receipt may never outlive the lease generation that produced it.
    await assert.rejects(
      () => admission.buildSyntheticMailPortAdmissionCandidate(
        candidateInput({ preCallReceiptValidUntil: NOW + 11_000 }),
      ),
      { message: "synthetic_mail_port_admission_candidate_invalid" },
    );
  } finally {
    await vite.close();
  }
});

test("effective suppression and its before-success ordering both block admission", async () => {
  const { vite, admission } = await load();
  try {
    const suppressed = await decide(admission, { authorityPatch: { suppressionEffective: true } });
    assert.equal(suppressed.status, REJECTED);
    assert.equal(suppressed.reasonCodes.includes("suppression_effective_before_success"), true);
    assert.equal(suppressed.successAcknowledgementAuthorized, false);

    const unordered = await decide(admission, {
      authorityPatch: { suppressionPrecedesSuccessAcknowledgement: false },
    });
    assert.equal(unordered.reasonCodes.includes("suppression_success_ordering_not_preserved"), true);

    const stopped = await decide(admission, { authorityPatch: { stopRuleActive: true } });
    assert.equal(stopped.reasonCodes.includes("stop_rule_active"), true);
  } finally {
    await vite.close();
  }
});

test("a recorded DeliveryUnknown or prior attempt never authorizes an automatic retry", async () => {
  const { vite, admission } = await load();
  try {
    const unknown = await decide(admission, {
      authorityPatch: {
        deliveryState: "delivery_unknown",
        deliveryUnknownRecorded: true,
        providerAttemptCount: 1,
      },
    });
    assert.equal(unknown.status, REJECTED);
    assert.equal(unknown.automaticRetryAuthorized, false);
    assert.equal(unknown.reasonCodes.includes("delivery_unknown_recorded_no_automatic_retry"), true);
    assert.equal(unknown.reasonCodes.includes("provider_attempt_already_recorded"), true);
    assert.equal(unknown.reasonCodes.includes("delivery_state_not_dispatchable"), true);
    assert.deepEqual({ ...unknown.effects }, ZERO_EFFECTS);

    const sent = await decide(admission, { authorityPatch: { deliveryState: "sent" } });
    assert.equal(sent.reasonCodes.includes("delivery_state_not_dispatchable"), true);

    // More than one modelled attempt is not representable.
    await assert.rejects(
      () => admission.buildSyntheticMailPortAdmissionCandidate(candidateInput({ attemptOrdinal: 2 })),
      { message: "synthetic_mail_port_admission_candidate_invalid" },
    );
  } finally {
    await vite.close();
  }
});

test("the manual-call branch stays advisory and cannot change the email admission decision", async () => {
  const { vite, admission } = await load();
  try {
    const baseline = await decide(admission, { authorityPatch: { manualCallBranchStatus: "absent" } });
    for (const status of ["advisory_only", "outcome_recorded"]) {
      const decision = await decide(admission, { authorityPatch: { manualCallBranchStatus: status } });
      assert.equal(decision.status, baseline.status);
      assert.deepEqual([...decision.reasonCodes], [...baseline.reasonCodes]);
      assert.equal(decision.manualCallAdvisoryOnly, true);
      assert.equal(decision.manualCallBranchStatus, status);
      assert.equal(decision.dispatchAuthorized, false);
    }

    await assert.rejects(
      () => admission.buildSyntheticMailPortAdmissionCandidate(
        candidateInput({ manualCallSubstitutesForEmailApproval: true }),
      ),
      { message: "synthetic_mail_port_admission_candidate_invalid" },
    );
  } finally {
    await vite.close();
  }
});

test("scope drift on any bound identifier rejects admission", async () => {
  const { vite, admission } = await load();
  try {
    for (const [patch, reason] of [
      [{ workspaceId: "synthetic-workspace-2" }, "workspace_scope_mismatch"],
      [{ companyId: "synthetic-company-2" }, "company_scope_mismatch"],
      [{ prospectId: "synthetic-prospect-2" }, "prospect_scope_mismatch"],
      [{ contactId: "synthetic-contact-2" }, "contact_scope_mismatch"],
      [{ outboxItemId: "synthetic-outbox-item-2" }, "outbox_item_mismatch"],
      [{ sendKey: "synthetic-send-key-2" }, "send_key_mismatch"],
      [{ dispatchKey: "synthetic-dispatch-key-2" }, "dispatch_key_mismatch"],
      [{ packageArtifact: { id: "synthetic-package-2", digest: A } }, "package_artifact_changed"],
    ]) {
      const decision = await decide(admission, { authorityPatch: patch });
      assert.equal(decision.status, REJECTED, reason);
      assert.equal(decision.reasonCodes.includes(reason), true, `${reason} in ${decision.reasonCodes}`);
    }
  } finally {
    await vite.close();
  }
});

test("simultaneous failures accumulate as a deduplicated, sorted, frozen reason set", async () => {
  const { vite, admission } = await load();
  try {
    const decision = await decide(admission, {
      authorityPatch: {
        itemState: "cancelled",
        suppressionEffective: true,
        stopRuleActive: true,
        messageApprovalImmutable: false,
        preparationState: "absent",
        externalEffectsDisabled: false,
      },
    });
    assert.equal(decision.status, REJECTED);
    assert.equal(Object.isFrozen(decision.reasonCodes), true);
    const codes = [...decision.reasonCodes];
    assert.deepEqual(codes, [...new Set(codes)].sort());
    for (const reason of [
      "item_not_leased",
      "suppression_effective_before_success",
      "stop_rule_active",
      "message_approval_not_immutable",
      "dispatch_preparation_not_current",
      "external_effects_not_disabled",
    ]) assert.equal(codes.includes(reason), true, reason);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual({ ...decision.effects }, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("malformed, hostile, and forged inputs fail closed", async () => {
  const { vite, admission } = await load();
  try {
    const accessor = candidateInput();
    Object.defineProperty(accessor, "outboxItemId", { get: () => "synthetic-outbox-item", enumerable: true });
    const hostile = [
      null,
      [],
      "synthetic",
      { ...candidateInput(), extra: 1 },
      omit(candidateInput(), "lease"),
      accessor,
      candidateInput({ id: "not-synthetic" }),
      candidateInput({ packageApprovalDigest: "zz" }),
      candidateInput({ createdAt: 0 }),
      candidateInput({ finalRecheckStatus: "synthetic_recheck_rejected" }),
      candidateInput({ lease: { id: "synthetic-lease", holderId: "synthetic-worker", generation: 9, acquiredAt: NOW + 20_000, expiresAt: NOW + 10_000 } }),
      candidateInput({ messageApprovalExpiresAt: NOW + 20_000 }),
      candidateInput({ messageArtifact: { id: "synthetic-message-a", digest: B, packageId: "synthetic-other", packageDigest: A } }),
    ];
    for (const value of hostile) {
      await assert.rejects(
        () => admission.buildSyntheticMailPortAdmissionCandidate(value),
        { message: "synthetic_mail_port_admission_candidate_invalid" },
        JSON.stringify(value ?? null),
      );
    }

    const candidate = await admission.buildSyntheticMailPortAdmissionCandidate(candidateInput());
    const forged = { ...candidate };
    await assert.rejects(
      () => admission.evaluateSyntheticMailPortAdmission({
        candidate: forged,
        currentCandidate: candidateInput(),
        currentAuthority: currentAuthority(),
      }),
      { message: "synthetic_mail_port_admission_decision_invalid" },
    );
    await assert.rejects(
      () => admission.evaluateSyntheticMailPortAdmission({
        candidate,
        currentCandidate: candidateInput(),
        currentAuthority: { ...currentAuthority(), extra: 1 },
      }),
      { message: "synthetic_mail_port_admission_decision_invalid" },
    );
  } finally {
    await vite.close();
  }
});

test("no candidate or decision carries a raw address, number, endpoint, or credential", async () => {
  const { vite, admission } = await load();
  try {
    const candidate = await admission.buildSyntheticMailPortAdmissionCandidate(candidateInput());
    const decision = await decide(admission);
    for (const serialized of [JSON.stringify(candidate), JSON.stringify(decision)]) {
      for (const forbidden of ["@", "+1", "http", "bearer", "token", "secret"]) {
        assert.equal(serialized.toLowerCase().includes(forbidden), false, forbidden);
      }
    }
  } finally {
    await vite.close();
  }
});

test("the admission module has no runtime, persistence, provider, network, or effect seam", async () => {
  const source = await readFile(new URL(
    "../preparation/mail-port-admission-decision.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "nodemailer", "sendgrid", "process.env", "import.meta.env",
    "XMLHttpRequest", "WebSocket",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  for (const required of [
    "mailPortResolvable: false",
    "providerInvocationAuthorized: false",
    "dispatchAuthorized: false",
    "automaticRetryAuthorized: false",
    "manualCallAdvisoryOnly: true",
  ]) assert.equal(source.includes(required), true, required);
  // The module must not import anything, including the domain mail port.
  assert.doesNotMatch(source, /^\s*(?:import|export\s+\*|export\s+\{[^}]*\}\s+from)\b/mu);
});

function omit(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
