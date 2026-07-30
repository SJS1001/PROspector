#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const CAPABILITY = "private-hosted-synthetic-proposal-proof";
const TRANSPORT_CAPABILITIES = ["scheduler", "runner", "retrieval", "provider-transport"];
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_REVISION = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,160}$/u;
const SECRET_FIELD = /secret|token|password|credential|cookie|authorizationheader|apikey/iu;

function fail(reason) {
  throw new Error(reason);
}

function object(value, reason) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(reason);
  return value;
}

function exactKeys(value, keys, reason) {
  const record = object(value, reason);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(reason);
  return record;
}

function opaque(value, reason) {
  if (typeof value !== "string" || !OPAQUE_REFERENCE.test(value)) fail(reason);
  return value;
}

function containsSecretField(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => SECRET_FIELD.test(key) || containsSecretField(nested));
}

function parseExpiry(value, now) {
  if (typeof value !== "string") fail("authorization_expiry_invalid");
  const expiry = Date.parse(value);
  if (!Number.isFinite(expiry)) fail("authorization_expiry_invalid");
  if (expiry <= now) fail("authorization_expired");
}

export function assessReleaseEvidence(evidence, { now = new Date().toISOString() } = {}) {
  if (!evidence) fail("evidence_manifest_required");
  if (containsSecretField(evidence)) fail("secret_material_not_allowed");
  if (Object.hasOwn(evidence, "capabilities")) fail("unknown_capability_evidence");
  const manifest = exactKeys(evidence, ["phase2", "local", "target", "capability", "authorization", "consumption", "noEffect"], "unknown_evidence_field");

  const phase2 = exactKeys(manifest.phase2, ["status", "evidenceReference"], "phase2_dependency_incomplete");
  if (phase2.status !== "complete") fail("phase2_dependency_incomplete");
  opaque(phase2.evidenceReference, "phase2_evidence_reference_invalid");

  const local = exactKeys(manifest.local, ["testPhase3", "reviewedSourceRevision", "migration"], "local_evidence_incomplete");
  if (local.testPhase3 !== "passed") fail("local_phase3_test_incomplete");
  if (typeof local.reviewedSourceRevision !== "string" || !GIT_REVISION.test(local.reviewedSourceRevision)) fail("reviewed_source_revision_invalid");
  const migration = exactKeys(local.migration, ["identity", "digest"], "migration_identity_incomplete");
  opaque(migration.identity, "migration_identity_incomplete");
  if (typeof migration.digest !== "string" || !SHA256.test(migration.digest)) fail("migration_digest_invalid");

  const target = exactKeys(manifest.target, ["productId", "expectedRevision"], "target_identity_incomplete");
  opaque(target.productId, "target_identity_incomplete");
  if (typeof target.expectedRevision !== "string" || !/^[1-9][0-9]{0,15}$/u.test(target.expectedRevision)) fail("target_identity_incomplete");

  if (manifest.capability !== CAPABILITY) fail("unsupported_capability");
  const authorization = exactKeys(manifest.authorization, ["admittedOwnerId", "workspaceId", "productId", "expectedRevision", "sourceRevision", "migrationDigest", "fixtureDigest", "fixtureProvenance", "expiresAt", "reference"], "authorization_incomplete");
  for (const key of ["admittedOwnerId", "workspaceId", "productId", "fixtureProvenance", "reference"]) opaque(authorization[key], "authorization_incomplete");
  if (typeof authorization.expectedRevision !== "string" || !/^[1-9][0-9]{0,15}$/u.test(authorization.expectedRevision)) fail("authorization_incomplete");
  if (authorization.productId !== target.productId || authorization.expectedRevision !== target.expectedRevision) fail("product_scope_mismatch");
  if (typeof authorization.sourceRevision !== "string" || !GIT_REVISION.test(authorization.sourceRevision)) fail("authorization_source_revision_invalid");
  if (authorization.sourceRevision !== local.reviewedSourceRevision) fail("source_revision_mismatch");
  if (authorization.migrationDigest !== migration.digest) fail("migration_digest_mismatch");
  if (!SHA256.test(authorization.fixtureDigest)) fail("fixture_digest_invalid");
  parseExpiry(authorization.expiresAt, Date.parse(now));

  const consumption = exactKeys(manifest.consumption, ["singleUse", "operationId", "winnerOperationId", "consumedByOperationId", "reference"], "consumption_incomplete");
  if (consumption.singleUse !== true) fail("consumption_not_single_use");
  for (const key of ["operationId", "winnerOperationId", "consumedByOperationId", "reference"]) opaque(consumption[key], "consumption_incomplete");
  if (consumption.operationId !== consumption.winnerOperationId || consumption.operationId !== consumption.consumedByOperationId) fail("consumption_operation_mismatch");

  const noEffect = exactKeys(manifest.noEffect, ["auditReference", "logReference", "externalProviderAttempts", "downstreamEffects"], "no_effect_evidence_incomplete");
  opaque(noEffect.auditReference, "no_effect_evidence_incomplete");
  opaque(noEffect.logReference, "no_effect_evidence_incomplete");
  if (noEffect.externalProviderAttempts !== 0 || noEffect.downstreamEffects !== 0) fail("effect_evidence_not_zero");

  return {
    ok: true,
    acceptedCapability: CAPABILITY,
    capabilities: Object.fromEntries([[CAPABILITY, "ACCEPTED"], ...TRANSPORT_CAPABILITIES.map((name) => [name, "BLOCKED"])]),
    requirements: Object.fromEntries(TRANSPORT_CAPABILITIES.map((name) => [name, "separate_future_proof_reference_required"])),
    references: {
      phase2: phase2.evidenceReference,
      authorization: authorization.reference,
      consumption: consumption.reference,
      audit: noEffect.auditReference,
      log: noEffect.logReference,
    },
  };
}

export function parsePreflightArgs(args) {
  if (args.length !== 2 || args[0] !== "--manifest" || !args[1] || args[1].startsWith("-")) fail("evidence_manifest_required");
  return { manifestPath: args[1] };
}

export async function loadEvidenceManifest(manifestPath) {
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    fail("evidence_manifest_unreadable");
  }
  try {
    return JSON.parse(raw);
  } catch {
    fail("evidence_manifest_invalid_json");
  }
}

async function main() {
  const { manifestPath } = parsePreflightArgs(process.argv.slice(2));
  const evidence = await loadEvidenceManifest(manifestPath);
  process.stdout.write(`${JSON.stringify(assessReleaseEvidence(evidence))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, status: "blocked", reason: error.message })}\n`);
    process.exitCode = 1;
  });
}
