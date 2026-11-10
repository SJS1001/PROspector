// Plan 07-06: the CSV CRM handoff service backed by the 0023 evidence tables
// (through domain/handoff-recovery-repository.ts), plus the owner download
// re-authorization path. Everything is local and synthetic: object bytes live
// in an in-memory fake, eligibility is a synthetic ContactReady fake except in
// the production-composition case, and nothing reaches a provider or a CRM.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { HANDOFF_T0 as T0, handoffFixture, loadDomain } from "./helpers/handoff-fixture.mjs";
import { OUTREACH_NOW, OUTREACH_OWNER } from "./helpers/outreach-fixture.mjs";

const DAY = 24 * 60 * 60 * 1000;
const hex = (character) => character.repeat(64);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const HANDOFF_TABLES = [
  "handoff_recovery_commands", "handoff_export_snapshots", "handoff_export_snapshot_rows",
  "handoff_suppression_exclusions", "handoff_export_artifacts", "handoff_delivery_events",
];

const AUTHORITY = {
  exportScope: { tenantId: "synthetic-tenant-0001", workspaceId: "synthetic-workspace-0001" },
  selectionId: "synthetic-selection-0001",
  selectionRevision: 7,
  authorityRevision: 11,
  configurationDigest: hex("c"),
  exportDefinitionDigest: hex("b"),
};

function row(n, patch = {}) {
  const id = String(n).padStart(4, "0");
  return {
    prospect_id: `synthetic-prospect-${id}`,
    company_id: "synthetic-company-0001",
    product_id: "synthetic-product-0001",
    market_play_id: "synthetic-market-play-0001",
    profile_id: "synthetic-profile-0001",
    account_target: "Fictional Example Mining Company",
    selected_role: "Fictional Example Operations Role",
    contact_id: `synthetic-contact-${id}`,
    contact_point_id: `synthetic-contact-point-${id}`,
    contact_kind: "email",
    contact_value: `person${id}@example.test`,
    verification_class: "synthetic_mailbox_verified",
    verification_method_ref: "synthetic-verification-0001",
    verification_time: "2000-01-01T00:00:00.000Z",
    qualification_score_ref: "synthetic-qualification-score-0001",
    evidence_refs: "synthetic-evidence-0001",
    offer_ref: "synthetic-offer-0001",
    package_ref: "synthetic-package-0001",
    activity_status: "synthetic_no_activity",
    source_workspace_id: "synthetic-workspace-0001",
    source_run_id: "synthetic-run-0001",
    export_manifest_ref: "synthetic-export-manifest-0001",
    ...patch,
  };
}

function authorityRef(context) {
  return {
    prospectId: context.seeded.prospectId,
    contactId: context.seeded.contactId,
    contactPointDigest: context.seeded.contactPointDigest,
    packageVersionId: context.packageVersion.id,
    packageApprovalId: context.packageApproval.id,
  };
}

/** One eligible candidate bound to the fixture's D1 lineage, plus excluded ones. */
function candidates(context, { verificationClass = "mailbox_verified", lineage = true } = {}) {
  const base = (n, patch = {}, cells = {}) => ({
    workspaceId: context.seeded.workspaceId,
    prospectState: "Export-ready",
    deleted: false,
    aliasOf: null,
    verificationClass: "mailbox_verified",
    packageDigest: hex("e"),
    eligibilityInput: {},
    cells: row(n, cells),
    ...patch,
  });
  return [
    base(1, { verificationClass, ...(lineage ? { authorityRef: authorityRef(context) } : {}) }, { verification_class: `synthetic_${verificationClass}` }),
    base(2, { deleted: true }),
    base(3, { prospectState: "Prospect" }),
  ];
}

function memoryObjects() {
  const map = new Map();
  const calls = { put: 0, get: 0 };
  return {
    map,
    calls,
    async putImmutable(objectKey, bytes, contentSha256) {
      calls.put += 1;
      if (sha256(bytes) !== contentSha256) throw new Error("object_checksum_mismatch");
      const prior = map.get(objectKey);
      if (prior) {
        if (Buffer.compare(Buffer.from(prior), Buffer.from(bytes)) !== 0) throw new Error("object_conflict");
        return;
      }
      map.set(objectKey, Uint8Array.from(bytes));
    },
    async get(objectKey) {
      calls.get += 1;
      const bytes = map.get(objectKey);
      return bytes ? Uint8Array.from(bytes) : null;
    },
  };
}

const unsuppressed = { async blockingScopes() { return { blocked: false, scopes: [], complete: true, providerCalls: 0 }; } };

// The D1 Prospect, Contact and verified email are the same identities the CSV
// row for candidate 1 exports, so the persisted lineage is the exported row's.
const IDENTITY = Object.freeze({ prospectId: "synthetic-prospect-0001", contactId: "synthetic-contact-0001", contactEmail: "person0001@example.test" });

/** A D1 handle whose `failOn`-th batch throws once, to model a partial write. */
function failNthBatch(database, failOn) {
  let batches = 0;
  return new Proxy(database, {
    get(target, property) {
      if (property === "batch") {
        return async (statements) => {
          batches += 1;
          if (batches === failOn) throw new Error("synthetic interrupted batch");
          return target.batch(statements);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function setup(name, fixtureOptions = {}) {
  const context = await handoffFixture(name, { identity: IDENTITY, ...fixtureOptions });
  let service;
  let storeModule;
  try {
    service = await loadDomain(context.fixture, "crm-handoff.ts");
    storeModule = await loadDomain(context.fixture, "crm-handoff-d1-store.ts");
  } catch (error) {
    await context.fixture.dispose();
    throw error;
  }
  const clock = { now: T0 };
  const objects = memoryObjects();
  const state = { authority: { ...AUTHORITY }, candidates: candidates(context), eligibilityHook: null };
  const scope = (overrides = {}) => ({ workspaceId: context.seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => clock.now, ...overrides });
  const ports = (overrides = {}) => ({
    source: { async read() { return { ...state.authority, candidates: state.candidates }; } },
    eligibility: {
      async recheck() {
        if (state.eligibilityHook) await state.eligibilityHook();
        return { contactReady: true };
      },
    },
    suppression: unsuppressed,
    store: storeModule.createD1CrmHandoffStore(overrides.database ?? context.fixture.database, scope(overrides.scope), { objects }),
    clock: { nowIso: () => new Date(clock.now).toISOString() },
    ...overrides.ports,
  });
  return { ...context, database: context.fixture.database, service, storeModule, clock, objects, state, scope, ports };
}

async function count(database, table, where = "1=1", bindings = []) {
  return Number((await database.prepare(`SELECT COUNT(*) count FROM ${table} WHERE ${where}`).bind(...bindings).first()).count);
}

async function handoffCounts(database) {
  return Object.fromEntries(await Promise.all(HANDOFF_TABLES.map(async (table) => [table, await count(database, table)])));
}

const ZERO = Object.fromEntries(HANDOFF_TABLES.map((table) => [table, 0]));

test("a materialized handoff persists its frozen snapshot, exact-byte artifact, and issued delivery window in the 0023 tables", async (t) => {
  const context = await setup("crm-d1-store-materialize");
  t.after(() => context.fixture.dispose());
  const { database, service, objects } = context;
  const ports = context.ports();
  const first = await service.materializeCrmHandoff({ workspaceId: context.seeded.workspaceId, idempotencyKey: "crm-d1-key-1", ports });
  assert.equal(first.status, "materialized", JSON.stringify(first));
  assert.equal(first.version, 1);
  assert.equal(first.providerCalls, 0);

  assert.deepEqual(await handoffCounts(database), {
    handoff_recovery_commands: 3, handoff_export_snapshots: 1, handoff_export_snapshot_rows: 1,
    handoff_suppression_exclusions: 0, handoff_export_artifacts: 1, handoff_delivery_events: 1,
  });
  const snapshotRow = await database.prepare("SELECT * FROM handoff_export_snapshot_rows").first();
  assert.deepEqual(
    [snapshotRow.prospect_id, snapshotRow.contact_id, snapshotRow.contact_point_digest, snapshotRow.package_version_id, snapshotRow.package_approval_id],
    Object.values(authorityRef(context)),
  );
  assert.deepEqual([snapshotRow.prospect_id, snapshotRow.contact_id], [row(1).prospect_id, row(1).contact_id], "the persisted lineage is the exported row's Prospect and Contact");
  const snapshot = await database.prepare("SELECT * FROM handoff_export_snapshots").first();
  assert.equal(snapshot.suppression_fence_count, 0);
  assert.equal(snapshot.export_definition_digest, AUTHORITY.exportDefinitionDigest);
  assert.equal(snapshot.configuration_digest, AUTHORITY.configurationDigest);

  const artifact = await database.prepare("SELECT * FROM handoff_export_artifacts").first();
  assert.equal(artifact.content_sha256, first.csvSha256);
  assert.equal(artifact.media_type, "text/csv");
  assert.equal(artifact.snapshot_id, snapshot.id);
  const stored = objects.map.get(artifact.object_key);
  assert.ok(stored, "the exact bytes are stored under the recorded object key");
  assert.equal(sha256(stored), first.csvSha256);
  assert.equal(artifact.byte_length, stored.byteLength);
  const manifest = JSON.parse(artifact.manifest_json);
  assert.equal(manifest.schema, "prospector/crm-handoff-store/v1");
  assert.equal(manifest.artifactId, first.artifactId);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.snapshotDigest, first.snapshotDigest);
  assert.equal(manifest.manifestSha256, first.manifestSha256);
  assert.equal(manifest.artifactManifest.csvSha256, first.csvSha256);
  assert.deepEqual(manifest.exclusions.map((entry) => entry.reason).sort(), ["deleted", "not_export_ready"]);
  assert.equal(artifact.manifest_json.includes("example.test"), false, "the persisted manifest never carries a contact value");

  const issued = await database.prepare("SELECT * FROM handoff_delivery_events").first();
  assert.deepEqual([issued.subject_kind, issued.subject_id, issued.event_kind, issued.occurred_at, issued.expires_at], ["export_artifact", artifact.id, "issued", T0, T0 + DAY]);

  // Retry with the same key replays the stored version and writes nothing.
  const before = await handoffCounts(database);
  const retry = await service.materializeCrmHandoff({ workspaceId: context.seeded.workspaceId, idempotencyKey: "crm-d1-key-1", ports });
  assert.equal(retry.status, "replayed");
  assert.deepEqual([retry.artifactId, retry.version, retry.csvSha256, retry.manifestSha256], [first.artifactId, 1, first.csvSha256, first.manifestSha256]);
  assert.deepEqual(await handoffCounts(database), before);
  assert.equal(objects.calls.put, 1);

  assert.deepEqual(await ports.store.lookup({ workspaceId: context.seeded.workspaceId, idempotencyKey: "crm-d1-key-1" }), {
    workspaceId: context.seeded.workspaceId,
    artifactId: first.artifactId,
    version: 1,
    snapshotDigest: first.snapshotDigest,
    exportDefinitionDigest: AUTHORITY.exportDefinitionDigest,
    idempotencyKey: "crm-d1-key-1",
    csvSha256: first.csvSha256,
    manifestSha256: first.manifestSha256,
    deliveryState: "available",
    deliveryExpiresAt: new Date(T0 + DAY).toISOString(),
  });
  await assert.rejects(ports.store.lookup({ workspaceId: "another-workspace", idempotencyKey: "crm-d1-key-1" }), /crm_handoff_store/u);
});

test("a changed snapshot stores the next immutable version; the same key with a changed snapshot conflicts; version 1 is untouched", async (t) => {
  const context = await setup("crm-d1-store-versions");
  t.after(() => context.fixture.dispose());
  const { database, service, state } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  const first = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-key-1", ports });
  assert.equal(first.status, "materialized");
  const v1 = await database.prepare("SELECT * FROM handoff_export_artifacts").first();

  state.candidates = candidates(context, { verificationClass: "source_verified" });
  const conflict = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-key-1", ports });
  assert.deepEqual({ status: conflict.status, reason: conflict.reason }, { status: "blocked", reason: "idempotency_conflict" });
  const next = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-key-2", ports });
  assert.equal(next.status, "materialized", JSON.stringify(next));
  assert.equal(next.version, 2);
  assert.notEqual(next.csvSha256, first.csvSha256);
  assert.notEqual(next.snapshotDigest, first.snapshotDigest);
  assert.equal(await count(database, "handoff_export_artifacts"), 2);
  assert.deepEqual(await database.prepare("SELECT * FROM handoff_export_artifacts WHERE id=?").bind(v1.id).first(), v1, "version 1 is immutable");

  // An unknown key reads the latest version; a replay of either key is exact.
  const latest = await ports.store.lookup({ workspaceId, idempotencyKey: "crm-d1-unknown" });
  assert.equal(latest.version, 2);
  assert.notEqual(latest.idempotencyKey, "crm-d1-unknown");
  assert.equal((await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-key-2", ports })).status, "replayed");
});

test("a tombstone committed after the plan read its fence refuses the snapshot and writes nothing", async (t) => {
  const context = await setup("crm-d1-store-fence");
  t.after(() => context.fixture.dispose());
  const { database, service, state, objects } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  let inserted = false;
  state.eligibilityHook = async () => {
    if (inserted) return;
    inserted = true;
    await context.outreach.recordSuppression({
      subjectKind: "exact_email", subjectDigest: hex("9"), channel: "email", reason: "unsubscribe",
      sourceEventDigest: hex("c"), aliasDigests: [], effectiveAt: OUTREACH_NOW - 1, idempotencyKey: "crm-d1-late-tombstone",
    });
  };
  const raced = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-fence", ports });
  assert.deepEqual({ status: raced.status, reason: raced.reason }, { status: "blocked", reason: "snapshot_stale" });
  assert.deepEqual(await handoffCounts(database), ZERO);
  assert.equal(objects.calls.put, 0);

  // A fresh request reads the new fence and may proceed.
  const fresh = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-fence-2", ports });
  assert.equal(fresh.status, "materialized", JSON.stringify(fresh));
  assert.equal((await database.prepare("SELECT suppression_fence_count FROM handoff_export_snapshots").first()).suppression_fence_count, 1);
});

test("the D1 fence refuses a row without package lineage or whose package approval was revoked after the plan", async (t) => {
  const context = await setup("crm-d1-store-lineage");
  t.after(() => context.fixture.dispose());
  const { database, service, state, objects } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;

  state.candidates = candidates(context, { lineage: false });
  const unbound = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-unbound", ports });
  assert.deepEqual({ status: unbound.status, reason: unbound.reason }, { status: "blocked", reason: "store_failed" });
  assert.deepEqual(await handoffCounts(database), ZERO);

  state.candidates = candidates(context);
  await context.outreach.revokeApproval({
    targetKind: "package_approval", targetApprovalId: context.packageApproval.id, reasonCode: "owner_revoked",
    sourceEventDigest: hex("4"), idempotencyKey: "crm-d1-revoke-package",
  });
  const revoked = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-revoked", ports });
  assert.deepEqual({ status: revoked.status, reason: revoked.reason }, { status: "blocked", reason: "store_failed" });
  assert.deepEqual(await handoffCounts(database), ZERO);
  assert.equal(objects.calls.put, 0);
});

test("production composition wires the blocked recheckForCrmExport and the real suppression resolver, so nothing is persisted", async (t) => {
  const context = await setup("crm-d1-store-production");
  t.after(() => context.fixture.dispose());
  const { database, service, storeModule, objects, state } = context;
  const source = { async read() { return { ...AUTHORITY, candidates: state.candidates }; } };
  const ports = storeModule.createD1CrmHandoffPorts(database, context.scope(), { source, objects });
  const plan = await service.planCrmHandoff({ workspaceId: context.seeded.workspaceId, ports });
  assert.equal(plan.rows.length, 0, "recheckForCrmExport refuses every candidate");
  const result = await service.materializeCrmHandoff({ workspaceId: context.seeded.workspaceId, ports });
  assert.deepEqual({ status: result.status, reason: result.reason }, { status: "blocked", reason: "no_eligible_rows" });
  assert.deepEqual(await handoffCounts(database), ZERO);
  assert.equal(objects.calls.put, 0);
  // The composition takes no eligibility, suppression, or store override.
  for (const extra of [{ eligibility: { async recheck() { return { contactReady: true }; } } }, { suppression: unsuppressed }, { store: {} }]) {
    assert.throws(() => storeModule.createD1CrmHandoffPorts(database, context.scope(), { source, objects, ...extra }), /crm_handoff_store/u);
  }
});

test("download re-authorizes the owner and current eligibility, returns the exact stored bytes, and never regenerates them", async (t) => {
  const context = await setup("crm-d1-store-access");
  t.after(() => context.fixture.dispose());
  const { database, service, state, objects } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  const made = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-access", ports });
  assert.equal(made.status, "materialized");

  const access = await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports });
  assert.equal(access.status, "authorized", JSON.stringify(access));
  assert.deepEqual([access.artifactId, access.version, access.csvSha256, access.mediaType, access.providerCalls], [made.artifactId, 1, made.csvSha256, "text/csv", 0]);
  assert.equal(sha256(access.bytes), made.csvSha256);
  assert.equal(access.byteLength, access.bytes.byteLength);

  // A forged or stale owner scope is refused before any read.
  const forged = context.ports({ scope: { ownerSubject: "not-the-owner" } });
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports: forged })), { status: "blocked", reason: "artifact_unavailable" });
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId: "another-workspace", artifactId: made.artifactId, ports })), { status: "blocked", reason: "artifact_unavailable" });
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: "crm-handoff-missing-v9", ports })), { status: "blocked", reason: "artifact_unavailable" });

  // Current eligibility changed: the historical artifact stays, but a newly evaluated request is required.
  const artifactsBefore = (await database.prepare("SELECT * FROM handoff_export_artifacts").all()).results;
  state.candidates = candidates(context, { verificationClass: "source_verified" });
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports })), { status: "blocked", reason: "eligibility_changed" });
  assert.equal(await count(database, "handoff_recovery_audit_events", "outcome='refused' AND reason_code='eligibility_changed' AND subject_kind='export_artifact'"), 1);
  assert.deepEqual((await database.prepare("SELECT * FROM handoff_export_artifacts").all()).results, artifactsBefore);
  state.candidates = candidates(context);

  // Tampered object bytes fail the checksum: access is blocked and the delivery is marked failed.
  const artifact = await database.prepare("SELECT id,object_key FROM handoff_export_artifacts").first();
  const tampered = Uint8Array.from(objects.map.get(artifact.object_key));
  tampered[tampered.length - 3] ^= 1;
  objects.map.set(artifact.object_key, tampered);
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports })), { status: "blocked", reason: "artifact_integrity" });
  assert.equal(await count(database, "handoff_delivery_events", "event_kind='failed' AND subject_id=?", [artifact.id]), 1);
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports })), { status: "blocked", reason: "delivery_failed" });
  assert.equal(objects.calls.put, 1, "no access path regenerates or rewrites bytes");
});

test("an expired delivery window blocks download and records the expiry once without regenerating bytes", async (t) => {
  const context = await setup("crm-d1-store-expiry");
  t.after(() => context.fixture.dispose());
  const { database, service, clock, objects } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  const made = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-expiry", ports });
  assert.equal(made.status, "materialized");

  clock.now = T0 + DAY;
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports })), { status: "blocked", reason: "delivery_expired" });
  assert.equal(await count(database, "handoff_delivery_events", "event_kind='expired'"), 1);
  clock.now = T0 + DAY + 5;
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports })), { status: "blocked", reason: "delivery_expired" });
  assert.equal(await count(database, "handoff_delivery_events", "event_kind='expired'"), 1, "the expiry is recorded once");
  assert.equal((await ports.store.lookup({ workspaceId, idempotencyKey: "crm-d1-expiry" })).deliveryState, "expired");
  assert.equal(objects.calls.put, 1);
  assert.equal(await count(database, "handoff_export_artifacts"), 1);
});

test("the access path refuses invalid input and a store without the download methods, and has no tel:/mailto: or network literals", async (t) => {
  const context = await setup("crm-d1-store-access-shape");
  t.after(() => context.fixture.dispose());
  const { service } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  assert.equal((await service.accessCrmHandoffArtifact({ workspaceId: "bad id", artifactId: "crm-handoff-x-v1", ports })).reason, "invalid_request");
  assert.equal((await service.accessCrmHandoffArtifact({ workspaceId, artifactId: "bad id", ports })).reason, "invalid_request");
  const writeOnly = { ...ports, store: { lookup: ports.store.lookup, putImmutable: ports.store.putImmutable } };
  assert.equal((await service.accessCrmHandoffArtifact({ workspaceId, artifactId: "crm-handoff-x-v1", ports: writeOnly })).reason, "invalid_request");

  const { readFileSync } = await import("node:fs");
  for (const path of ["../domain/crm-handoff-d1-store.ts", "../domain/crm-handoff.ts", "../domain/ports/export-delivery.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.equal(/\b(?:tel|mailto):/iu.test(source), false, path);
    assert.equal(/\bfetch\s*\(|process\.env|\benv\./u.test(source), false, path);
  }
});

test("a changed snapshot whose rows match an earlier version stores a new downloadable version, with no orphan snapshot", async (t) => {
  const context = await setup("crm-d1-store-same-rows");
  t.after(() => context.fixture.dispose());
  const { database, service, state } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  const first = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-same-1", ports });
  assert.equal(first.status, "materialized", JSON.stringify(first));

  // Authority revision only: same exported rows, a different snapshot.
  state.authority = { ...AUTHORITY, selectionRevision: AUTHORITY.selectionRevision + 1 };
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: first.artifactId, ports })), { status: "blocked", reason: "eligibility_changed" });
  const second = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-same-2", ports });
  assert.equal(second.status, "materialized", JSON.stringify(second));
  assert.equal(second.version, 2);
  assert.notEqual(second.snapshotDigest, first.snapshotDigest);
  assert.notEqual(second.csvSha256, first.csvSha256, "each version's bytes are distinct, so 0023 can hold them");
  const secondAccess = await service.accessCrmHandoffArtifact({ workspaceId, artifactId: second.artifactId, ports });
  assert.equal(secondAccess.status, "authorized", JSON.stringify(pick(secondAccess)));

  // Exclusion ledger only: candidate 3 is now excluded for a different reason.
  state.candidates = candidates(context).map((candidate, index) => (index === 2 ? { ...candidate, prospectState: "Export-ready", deleted: true } : candidate));
  const third = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-same-3", ports });
  assert.equal(third.status, "materialized", JSON.stringify(third));
  assert.equal(third.version, 3);
  assert.equal((await service.accessCrmHandoffArtifact({ workspaceId, artifactId: third.artifactId, ports })).status, "authorized");

  assert.equal(await count(database, "handoff_export_snapshots"), 3);
  assert.equal(await count(database, "handoff_export_artifacts"), 3, "every recorded snapshot has its artifact");
  assert.equal(await count(database, "handoff_delivery_events", "event_kind='issued'"), 3);
});

test("after a delivery expires, a newly evaluated request with unchanged rows gets a fresh version and window; the original key still replays the expired one and says so", async (t) => {
  // The Package approval outlives the first delivery window, so only the window ended.
  const context = await setup("crm-d1-store-expired-renew", { approvalExpiresAt: OUTREACH_NOW + 3 * DAY });
  t.after(() => context.fixture.dispose());
  const { database, service, clock } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  const made = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-renew-1", ports });
  assert.equal(made.status, "materialized");
  assert.equal(made.deliveryState, "available");

  clock.now = T0 + DAY + 1;
  assert.deepEqual(pick(await service.accessCrmHandoffArtifact({ workspaceId, artifactId: made.artifactId, ports })), { status: "blocked", reason: "delivery_expired" });
  const fresh = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-renew-2", ports });
  assert.equal(fresh.status, "materialized", JSON.stringify(fresh));
  assert.equal(fresh.version, 2);
  assert.equal(fresh.snapshotDigest, made.snapshotDigest, "eligibility did not change");
  assert.notEqual(fresh.artifactId, made.artifactId);
  assert.equal(fresh.deliveryState, "available");
  const access = await service.accessCrmHandoffArtifact({ workspaceId, artifactId: fresh.artifactId, ports });
  assert.equal(access.status, "authorized", JSON.stringify(pick(access)));
  const window = await database.prepare("SELECT expires_at FROM handoff_delivery_events WHERE event_kind='issued' ORDER BY occurred_at DESC LIMIT 1").first();
  assert.equal(window.expires_at, T0 + DAY + 1 + DAY, "a fresh window from the new request");

  const again = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-renew-1", ports });
  assert.deepEqual([again.status, again.version, again.artifactId, again.deliveryState], ["replayed", 1, made.artifactId, "expired"]);
  // The fresh version is deliverable, so another new key replays it.
  const third = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-renew-3", ports });
  assert.deepEqual([third.status, third.version, third.deliveryState], ["replayed", 2, "available"]);
});

test("an artifact committed without its issued event is completed by the retry with its original window, then downloads", async (t) => {
  const context = await setup("crm-d1-store-partial");
  t.after(() => context.fixture.dispose());
  const { database, service, clock } = context;
  const workspaceId = context.seeded.workspaceId;
  // Batches: 1 export snapshot, 2 export artifact, 3 issued delivery event.
  const flaky = context.ports({ database: failNthBatch(database, 3) });
  const first = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-partial", ports: flaky });
  assert.deepEqual(pick(first), { status: "blocked", reason: "store_failed" });
  assert.equal(await count(database, "handoff_export_artifacts"), 1);
  assert.equal(await count(database, "handoff_delivery_events"), 0);

  clock.now = T0 + 5_000;
  const retry = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-partial", ports: flaky });
  assert.deepEqual([retry.status, retry.version, retry.deliveryState], ["replayed", 1, "available"], JSON.stringify(retry));
  const issued = await database.prepare("SELECT occurred_at,expires_at FROM handoff_delivery_events WHERE event_kind='issued'").all();
  assert.deepEqual(issued.results.map((event) => [event.occurred_at, event.expires_at]), [[T0, T0 + DAY]], "the original window, not a new one");
  const access = await service.accessCrmHandoffArtifact({ workspaceId, artifactId: retry.artifactId, ports: context.ports() });
  assert.equal(access.status, "authorized", JSON.stringify(pick(access)));

  // A new key over the same snapshot replays the now-deliverable artifact.
  const other = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: "crm-d1-partial-2", ports: context.ports() });
  assert.deepEqual([other.status, other.artifactId, other.deliveryState], ["replayed", retry.artifactId, "available"]);
  assert.equal(await count(database, "handoff_delivery_events"), 1);
});

test("a row whose D1 lineage names a different Prospect, Contact, or contact point than the exported row is excluded and never persisted", async (t) => {
  const context = await setup("crm-d1-store-lineage-binding");
  t.after(() => context.fixture.dispose());
  const { database, service, state, objects } = context;
  const ports = context.ports();
  const workspaceId = context.seeded.workspaceId;
  const bound = candidates(context)[0];
  const variants = {
    prospect: { ...bound, cells: row(2, { verification_class: "synthetic_mailbox_verified" }) },
    contact: { ...bound, cells: { ...bound.cells, contact_id: "synthetic-contact-0002" } },
    contactPoint: { ...bound, cells: { ...bound.cells, contact_value: "person0009@example.test" } },
  };
  for (const [name, candidate] of Object.entries(variants)) {
    state.candidates = [candidate];
    const plan = await service.planCrmHandoff({ workspaceId, ports });
    assert.equal(plan.rows.length, 0, name);
    assert.deepEqual(plan.exclusions.map((entry) => entry.reason), ["authority_ref_mismatch"], name);
    const result = await service.materializeCrmHandoff({ workspaceId, idempotencyKey: `crm-d1-mismatch-${name}`, ports });
    assert.deepEqual(pick(result), { status: "blocked", reason: "no_eligible_rows" }, name);
  }
  assert.deepEqual(await handoffCounts(database), ZERO);
  assert.equal(objects.calls.put, 0);
});

function pick(result) {
  return { status: result.status, reason: result.reason };
}
