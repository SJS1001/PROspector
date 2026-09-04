import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { assessReleaseEvidence } from "../scripts/phase3-release-preflight.mjs";

const NOW = "2026-07-30T12:00:00.000Z";
const SOURCE_REVISION = "a".repeat(40);
const MIGRATION_DIGEST = "b".repeat(64);
const FIXTURE_DIGEST = "c".repeat(64);

function validEvidence() {
  return {
    phase2: { status: "complete", evidenceReference: "phase2-hosted-acceptance" },
    local: {
      testPhase3: "passed",
      reviewedSourceRevision: SOURCE_REVISION,
      migration: { identity: "0000-0006", digest: MIGRATION_DIGEST },
    },
    target: { productId: "product-opaque-1", expectedRevision: "7" },
    capability: "private-hosted-synthetic-proposal-proof",
    authorization: {
      admittedOwnerId: "owner-opaque-1",
      workspaceId: "workspace-opaque-1",
      productId: "product-opaque-1",
      expectedRevision: "7",
      sourceRevision: SOURCE_REVISION,
      migrationDigest: MIGRATION_DIGEST,
      fixtureDigest: FIXTURE_DIGEST,
      fixtureProvenance: "fixed-local-synthetic-fixture-v1",
      expiresAt: "2026-07-31T12:00:00.000Z",
      reference: "owner-authorization-opaque-1",
    },
    consumption: {
      singleUse: true,
      operationId: "operation-opaque-1",
      winnerOperationId: "operation-opaque-1",
      consumedByOperationId: "operation-opaque-1",
      reference: "consumption-opaque-1",
    },
    noEffect: {
      auditReference: "audit-opaque-1",
      logReference: "log-opaque-1",
      externalProviderAttempts: 0,
      downstreamEffects: 0,
    },
  };
}

test("accepts only a complete owner-scoped private synthetic proof and keeps transport blocked", () => {
  const report = assessReleaseEvidence(validEvidence(), { now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.acceptedCapability, "private-hosted-synthetic-proposal-proof");
  assert.deepEqual(report.capabilities, {
    "private-hosted-synthetic-proposal-proof": "ACCEPTED",
    scheduler: "BLOCKED",
    runner: "BLOCKED",
    retrieval: "BLOCKED",
    "provider-transport": "BLOCKED",
  });
  assert.equal(report.references.authorization, "owner-authorization-opaque-1");
  assert.equal(report.references.audit, "audit-opaque-1");
  assert.equal(report.requirements.scheduler, "separate_future_proof_reference_required");
  assert.equal("admittedOwnerId" in report, false);
});

test("fails closed for absent, expired, mismatched, replayed, stale, and unknown evidence", () => {
  const cases = [
    [undefined, "evidence_manifest_required"],
    [{}, "unknown_evidence_field"],
    [Object.assign(validEvidence(), { capability: "scheduler" }), "unsupported_capability"],
    [Object.assign(validEvidence(), { authorization: { ...validEvidence().authorization, expiresAt: NOW } }), "authorization_expired"],
    [Object.assign(validEvidence(), { authorization: { ...validEvidence().authorization, sourceRevision: "d".repeat(40) } }), "source_revision_mismatch"],
    [Object.assign(validEvidence(), { authorization: { ...validEvidence().authorization, migrationDigest: "d".repeat(64) } }), "migration_digest_mismatch"],
    [Object.assign(validEvidence(), { target: { ...validEvidence().target, productId: "product-opaque-2" } }), "product_scope_mismatch"],
    [Object.assign(validEvidence(), { consumption: { ...validEvidence().consumption, consumedByOperationId: "other-operation" } }), "consumption_operation_mismatch"],
    [Object.assign(validEvidence(), { noEffect: { ...validEvidence().noEffect, downstreamEffects: 1 } }), "effect_evidence_not_zero"],
    [Object.assign(validEvidence(), { capabilities: ["private-hosted-synthetic-proposal-proof", "runner"] }), "unknown_capability_evidence"],
    [Object.assign(validEvidence(), { ownerToken: "never-admitted" }), "secret_material_not_allowed"],
  ];
  for (const [evidence, reason] of cases) {
    assert.throws(() => assessReleaseEvidence(evidence, { now: NOW }), new RegExp(reason, "u"));
  }
});

test("CLI requires an explicit local manifest and has no ambient release path", () => {
  const result = spawnSync(process.execPath, ["scripts/phase3-release-preflight.mjs"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /evidence_manifest_required/u);
});
