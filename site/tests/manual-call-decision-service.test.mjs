import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const NOW = 1_789_000_000_000;
const D = (character) => character.repeat(64);

async function loadService() {
  return import("../domain/manual-call-decision-service.ts");
}

function authority(patch = {}) {
  return {
    dataClassification: "synthetic",
    workspaceId: "synthetic-workspace",
    ownerSubject: "synthetic-owner",
    authorityRevision: 7,
    packageVersion: {
      id: "synthetic-package-version",
      version: 3,
      artifactDigest: D("a"),
      callScriptDigest: D("0"),
      snapshot: {
        evidenceDigests: [D("1")],
        claimGuardrailDigests: [D("2")],
        recommendedAngle: "Synthetic operational fit",
        selectedRole: "champion",
        selectedContactPointDigests: [D("3")],
        callScript: "Synthetic approved package call script.",
        draftMessageIds: [],
      },
    },
    packageApproval: {
      id: "synthetic-package-approval",
      packageVersionId: "synthetic-package-version",
      artifactDigest: D("a"),
      approvalDigest: D("b"),
      expiresAt: NOW + 10_000,
      revoked: false,
    },
    prospect: { id: "synthetic-prospect", revision: 4, state: "approved", active: true },
    contact: { id: "synthetic-contact", revision: 5, status: "active" },
    contactEligibility: { id: "synthetic-eligibility", snapshotDigest: D("c"), state: "ContactReady", eligible: true, current: true },
    phoneObservation: {
      id: "synthetic-phone-observation",
      contactId: "synthetic-contact",
      kind: "phone",
      contactPointDigest: D("3"),
      verificationClass: "source_verified",
      status: "active",
      freshUntil: NOW + 10_000,
    },
    suppressionSubjects: [
      { kind: "e164_phone", digest: D("3"), channel: "phone" },
      { kind: "contact", digest: D("4"), channel: "all" },
      { kind: "organization", digest: D("5"), channel: "all" },
      { kind: "company", digest: D("6"), channel: "all" },
    ],
    suppressed: false,
    ...patch,
  };
}

function request(patch = {}) {
  return {
    packageApprovalId: "synthetic-package-approval",
    phoneObservationId: "synthetic-phone-observation",
    expectedAuthorityRevision: 7,
    expectedPackageVersion: 3,
    expectedPackageArtifactDigest: D("a"),
    expectedPackageApprovalDigest: D("b"),
    expectedProspectRevision: 4,
    expectedContactRevision: 5,
    expectedContactEligibilityDigest: D("c"),
    ...patch,
  };
}

class SyntheticRepositories {
  constructor(current) {
    this.current = current;
    this.records = new Map();
    this.order = [];
    this.externalEffects = 0;
    this.loadCount = 0;
    this.forcedCommitKind = null;
  }

  async loadCurrentAuthority({ workspaceId, ownerSubject, packageApprovalId, phoneObservationId }) {
    this.loadCount += 1;
    if (workspaceId !== this.current.workspaceId || ownerSubject !== this.current.ownerSubject
      || packageApprovalId !== this.current.packageApproval.id || phoneObservationId !== this.current.phoneObservation.id) return null;
    return structuredClone(this.current);
  }

  async findByIdempotencyKey({ workspaceId, ownerSubject, idempotencyKey }) {
    const record = this.records.get(`${workspaceId}:${ownerSubject}:${idempotencyKey}`);
    return record ? structuredClone(record) : null;
  }

  async commitCurrentOutcome(input) {
    if (this.forcedCommitKind) return { kind: this.forcedCommitKind, record: null };
    const key = `${input.record.workspaceId}:${input.record.actorSubject}:${input.record.idempotencyKey}`;
    const prior = this.records.get(key);
    if (prior) return { kind: prior.operationDigest === input.record.operationDigest ? "committed" : "conflict", record: prior };
    if (this.current.authorityRevision !== input.expectedAuthorityRevision || this.current.suppressed) return { kind: "stale", record: null };
    if (input.suppressionRequiredBeforeOutcome) {
      this.order.push("suppression");
      this.current = { ...this.current, suppressed: true, authorityRevision: this.current.authorityRevision + 1 };
    }
    this.order.push("outcome");
    this.records.set(key, structuredClone(input.record));
    return { kind: "committed", record: structuredClone(input.record) };
  }
}

async function setup(snapshot = authority()) {
  const serviceModule = await loadService();
  const scriptDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ callScript: snapshot.packageVersion.snapshot.callScript, schema: "outreach-call-script/v1" })));
  snapshot.packageVersion.callScriptDigest = Array.from(new Uint8Array(scriptDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const repositories = new SyntheticRepositories(snapshot);
  const service = serviceModule.createManualCallDecisionService({ authorityRepository: repositories, outcomeRepository: repositories, now: () => NOW });
  return { repositories, service };
}

const principal = { workspaceId: "synthetic-workspace", subject: "synthetic-owner" };

test("eligible decision exposes only the approved package script and no callable target", async () => {
  const { repositories, service } = await setup();
  const decision = await service.decide(principal, request());
  assert.equal(decision.eligible, true);
  assert.equal(decision.callScript, "Synthetic approved package call script.");
  assert.equal(decision.phoneTarget, null);
  assert.equal(decision.phoneEffectAuthorized, false);
  assert.deepEqual(decision.effects, { providerInvocations: 0, dialInvocations: 0, uriInvocations: 0 });
  assert.equal(repositories.externalEffects, 0);
});

test("stale approval, revision, artifact, and script binding fail closed", async () => {
  for (const [label, snapshotPatch, requestPatch, reason] of [
    ["expired", { packageApproval: { ...authority().packageApproval, expiresAt: NOW } }, {}, "approval_expired"],
    ["revoked", { packageApproval: { ...authority().packageApproval, revoked: true } }, {}, "approval_revoked"],
    ["revision", {}, { expectedAuthorityRevision: 6 }, "authority_revision_changed"],
    ["artifact", {}, { expectedPackageArtifactDigest: D("f") }, "package_artifact_changed"],
    ["approval digest", {}, { expectedPackageApprovalDigest: D("f") }, "package_approval_changed"],
  ]) {
    const { service } = await setup(authority(snapshotPatch));
    const decision = await service.decide(principal, request(requestPatch));
    assert.equal(decision.eligible, false, label);
    assert.equal(decision.reasonCodes.includes(reason), true, label);
    assert.equal(decision.callScript, null, label);
    assert.equal(decision.phoneTarget, null, label);
  }
});

test("suppressed, noncontactable, stale, and suggestion-only contacts are ineligible", async () => {
  for (const [patch, reason] of [
    [{ suppressed: true }, "suppressed"],
    [{ contact: { ...authority().contact, status: "noncontactable" } }, "contact_noncontactable"],
    [{ phoneObservation: { ...authority().phoneObservation, freshUntil: NOW } }, "phone_not_current_verified"],
    [{ phoneObservation: { ...authority().phoneObservation, verificationClass: "suggestion" } }, "phone_not_current_verified"],
  ]) {
    const { service } = await setup(authority(patch));
    assert.equal((await service.decide(principal, request())).reasonCodes.includes(reason), true);
  }
});

test("an outsider cannot resolve authority or observe the script", async () => {
  const { service } = await setup();
  await assert.rejects(
    service.decide({ workspaceId: "synthetic-workspace", subject: "synthetic-outsider" }, request()),
    /authority_unavailable/,
  );
});

test("synthetic manual outcome is recorded once and exact replay is stable", async () => {
  const { repositories, service } = await setup();
  const decision = await service.decide(principal, request());
  const command = { ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "connected", notes: "Synthetic operator reached the fictional contact.", idempotencyKey: "synthetic-call-outcome-key" };
  const first = await service.recordOutcome(principal, command);
  const replay = await service.recordOutcome(principal, command);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.outcomeId, replay.outcomeId);
  assert.equal(repositories.records.size, 1);
  assert.deepEqual(repositories.order, ["outcome"]);
  assert.equal(repositories.externalEffects, 0);
});

test("same idempotency key with changed notes conflicts", async () => {
  const { service } = await setup();
  const decision = await service.decide(principal, request());
  const command = { ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "voicemail", notes: "Synthetic voicemail outcome.", idempotencyKey: "synthetic-conflict-key" };
  await service.recordOutcome(principal, command);
  await assert.rejects(service.recordOutcome(principal, { ...command, notes: "Synthetic changed note." }), /idempotency_conflict/);
});

test("unsupported outcome and unsafe or unbounded synthetic notes are rejected before persistence", async () => {
  const { repositories, service } = await setup();
  const decision = await service.decide(principal, request());
  const base = { ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "connected", notes: "Synthetic bounded note.", idempotencyKey: "synthetic-invalid-key" };
  await assert.rejects(service.recordOutcome(principal, { ...base, outcome: "busy" }), /invalid_outcome/);
  await assert.rejects(service.recordOutcome(principal, { ...base, notes: "Synthetic secret token." }), /invalid_synthetic_notes/);
  await assert.rejects(service.recordOutcome(principal, { ...base, notes: "S".repeat(513) }), /invalid_synthetic_notes/);
  assert.equal(repositories.records.size, 0);
  assert.equal(repositories.externalEffects, 0);
});

test("suppression racing the prior decision blocks the outcome commit", async () => {
  const { repositories, service } = await setup();
  const decision = await service.decide(principal, request());
  repositories.current = { ...repositories.current, suppressed: true, authorityRevision: 8 };
  await assert.rejects(service.recordOutcome(principal, {
    ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "no_answer",
    notes: "Synthetic no answer outcome.", idempotencyKey: "synthetic-race-key",
  }), /stale_or_ineligible/);
  assert.equal(repositories.records.size, 0);
});

test("a revision race inside the atomic repository commit fails closed", async () => {
  const { repositories, service } = await setup();
  const decision = await service.decide(principal, request());
  repositories.forcedCommitKind = "stale";
  await assert.rejects(service.recordOutcome(principal, {
    ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "wrong_number",
    notes: "Synthetic wrong number outcome.", idempotencyKey: "synthetic-commit-race-key",
  }), /authority_changed/);
  assert.equal(repositories.records.size, 0);
  assert.equal(repositories.externalEffects, 0);
});

test("do_not_call commits suppression before the synthetic outcome", async () => {
  const { repositories, service } = await setup();
  const decision = await service.decide(principal, request());
  const result = await service.recordOutcome(principal, {
    ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "do_not_call",
    notes: "Synthetic do not call request.", idempotencyKey: "synthetic-dnc-key",
  });
  assert.equal(result.suppressionRecordedFirst, true);
  assert.deepEqual(repositories.order, ["suppression", "outcome"]);
  assert.equal(repositories.current.suppressed, true);
  assert.equal(repositories.externalEffects, 0);
  const replay = await service.recordOutcome(principal, {
    ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "do_not_call",
    notes: "Synthetic do not call request.", idempotencyKey: "synthetic-dnc-key",
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(repositories.order, ["suppression", "outcome"]);
});

test("decision remains usable later only while the exact authority is current", async () => {
  let currentTime = NOW;
  const snapshot = authority();
  const serviceModule = await loadService();
  const scriptDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ callScript: snapshot.packageVersion.snapshot.callScript, schema: "outreach-call-script/v1" })));
  snapshot.packageVersion.callScriptDigest = Array.from(new Uint8Array(scriptDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const repositories = new SyntheticRepositories(snapshot);
  const service = serviceModule.createManualCallDecisionService({ authorityRepository: repositories, outcomeRepository: repositories, now: () => currentTime });
  const decision = await service.decide(principal, request());
  currentTime += 1_000;
  const result = await service.recordOutcome(principal, {
    ...request(), expectedDecisionDigest: decision.decisionDigest, outcome: "follow_up",
    notes: "Synthetic follow up requested.", idempotencyKey: "synthetic-later-key",
  });
  assert.equal(result.outcome, "follow_up");
  assert.equal(result.followUpAuthorized, false);
  assert.equal(repositories.externalEffects, 0);
});

test("the service has no provider, network, dialing, or URI invocation seam", async () => {
  const source = await readFile(new URL("../domain/manual-call-decision-service.ts", import.meta.url), "utf8");
  for (const forbidden of ["fetch(", "tel:", "mailto:", "MailPort", "ContactProviderPort", "window.open", "location.href", "href:", "providerPort", "dialPort"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
