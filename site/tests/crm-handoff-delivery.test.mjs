import assert from "node:assert/strict";
import test from "node:test";
import { decideCrmHandoffDelivery } from "../domain/crm-handoff-delivery.ts";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const NOW = "2026-11-08T05:00:00.000Z";
const LATER = "2026-11-08T06:00:00.000Z";

function stored(patch = {}) {
  return {
    workspaceId: "workspace-one",
    artifactId: "artifact-one",
    version: 2,
    snapshotDigest: DIGEST_A,
    exportDefinitionDigest: DIGEST_B,
    idempotencyKey: "idem-one",
    csvSha256: DIGEST_C,
    manifestSha256: DIGEST_A,
    deliveryState: "available",
    deliveryExpiresAt: LATER,
    ...patch,
  };
}

function request(patch = {}) {
  return {
    now: NOW,
    workspaceId: "workspace-one",
    idempotencyKey: "idem-one",
    snapshotDigest: DIGEST_A,
    exportDefinitionDigest: DIGEST_B,
    operation: "materialize",
    existing: stored(),
    port: { async putImmutable() { throw new Error("port_must_not_be_called"); } },
    ...patch,
  };
}

test("the same frozen snapshot replays without calling delivery", () => {
  const decision = decideCrmHandoffDelivery(request());
  assert.equal(decision.outcome, "replay");
  assert.equal(decision.reason, "same_frozen_digest");
  assert.equal(decision.portInvocation, false);
  assert.equal(decision.regenerateBytes, false);
  assert.equal(decision.nextVersion, null);
  assert.equal(decision.artifact.version, 2);
  assert.deepEqual(decision.effects, {
    providerCalls: 0,
    durableMutations: 0,
    deliveryInvocations: 0,
    downloadInvocations: 0,
    csvSerializations: 0,
  });
});

test("the same idempotency key with a changed snapshot conflicts", () => {
  const decision = decideCrmHandoffDelivery(request({ snapshotDigest: DIGEST_C }));
  assert.equal(decision.outcome, "blocked");
  assert.equal(decision.reason, "idempotency_conflict");
  assert.equal(decision.artifact, null);
  assert.equal(decision.regenerateBytes, false);
});

test("a changed snapshot under a new idempotency key allocates the next version only", () => {
  const decision = decideCrmHandoffDelivery(request({
    idempotencyKey: "idem-two",
    snapshotDigest: DIGEST_C,
  }));
  assert.equal(decision.outcome, "new_version");
  assert.equal(decision.nextVersion, 3);
  assert.equal(decision.artifact, null);
  assert.equal(decision.effects.csvSerializations, 0);
  assert.equal(decision.effects.deliveryInvocations, 0);
});

test("the first materialization allocates version 1 and writes nothing", () => {
  const decision = decideCrmHandoffDelivery(request({ existing: null, idempotencyKey: "idem-new" }));
  assert.equal(decision.outcome, "new_version");
  assert.equal(decision.nextVersion, 1);
  assert.equal(decision.effects.durableMutations, 0);
});

test("expired or failed delivery blocks access and does not regenerate bytes", () => {
  const expired = decideCrmHandoffDelivery(request({
    operation: "access",
    existing: stored({ deliveryState: "expired" }),
  }));
  const failed = decideCrmHandoffDelivery(request({
    operation: "access",
    existing: stored({ deliveryState: "failed" }),
  }));
  const past = decideCrmHandoffDelivery(request({
    operation: "access",
    now: "2026-11-08T07:00:00.000Z",
  }));
  for (const decision of [expired, failed, past]) {
    assert.equal(decision.outcome, "blocked");
    assert.equal(decision.regenerateBytes, false);
    assert.equal(decision.artifact, null);
    assert.equal(decision.effects.downloadInvocations, 0);
  }
  assert.equal(expired.reason, "delivery_expired");
  assert.equal(failed.reason, "delivery_failed");
  assert.equal(past.reason, "delivery_expired");
});

test("current access is authorized without a download or port call", () => {
  const decision = decideCrmHandoffDelivery(request({ operation: "access" }));
  assert.equal(decision.outcome, "access_current");
  assert.equal(decision.artifact.artifactId, "artifact-one");
  assert.equal(decision.effects.downloadInvocations, 0);
  assert.equal(decision.effects.providerCalls, 0);
});

test("a cross-workspace artifact is blocked", () => {
  const decision = decideCrmHandoffDelivery(request({
    existing: stored({ workspaceId: "workspace-two" }),
  }));
  assert.equal(decision.outcome, "blocked");
  assert.equal(decision.reason, "workspace_mismatch");
});
