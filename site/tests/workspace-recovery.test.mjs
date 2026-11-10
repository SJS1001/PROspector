import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";
import { applyMigrationsThrough, createD1Fixture } from "./helpers/d1.mjs";

// 07-03 contract: encrypted portable-workspace recovery.
// The first cases bind to domain/local-portable-backup.ts (the synthetic 07-03
// backup contract) and only exercise its refusal paths. The 07-08 cases bind
// the workspace archive (domain/workspace-archive.ts), the read-only dry run
// (domain/restore-verifier.ts) and the fenced restore (domain/restore-apply.ts)
// on owner-delegated decision D-4. They run against synthetic in-memory ports
// and the local 0023 repository only: nothing installs a package or reaches a
// host. The 07-09 handler case stays `todo`; its body states a proposed call
// shape, and the invariants are the part that binds.

const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);
const PASSPHRASE = "synthetic-test-passphrase-0001";

async function withBackup(run) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return await run(await vite.ssrLoadModule(new URL("../domain/local-portable-backup.ts", import.meta.url).pathname));
  } finally {
    await vite.close();
  }
}

function source(patch = {}) {
  return {
    workspaceId: "workspace-synthetic",
    createdAt: "2026-11-09T12:00:00.000Z",
    provenance: {
      kind: "synthetic_disposable",
      snapshotId: "snapshot-synthetic",
      snapshotDigest: DIGEST,
      migrationLineageDigest: OTHER_DIGEST,
    },
    records: [
      { kind: "prospect", id: "prospect-1", value: { companyId: "company-main", state: "ExportReady" } },
      { kind: "history", id: "history-1", value: { prospectId: "prospect-1", sequence: 1 } },
    ],
    objectDigests: [DIGEST],
    suppressionTombstones: [{ kind: "suppression", id: "tombstone-1", value: { scopeDigest: OTHER_DIGEST } }],
    ...patch,
  };
}

const expectation = {
  workspaceId: "workspace-synthetic",
  schemaVersion: "prospector/portable-workspace-schema/v1",
  snapshotId: "snapshot-synthetic",
  snapshotDigest: DIGEST,
  migrationLineageDigest: OTHER_DIGEST,
};

const emptyState = {
  workspaceId: "workspace-synthetic",
  archiveDigest: null,
  records: [],
  objectDigests: [],
  suppressionTombstones: [],
  effectsEnabled: false,
};

function invalidArchive(error) {
  return error instanceof Error && error.message === "portable_backup_invalid";
}

// -- Live: refusal paths of the existing synthetic backup module -------------

test("the archive schema version and public surface are pinned, with no restore-authority export", async () => {
  await withBackup(async (backup) => {
    assert.equal(backup.PORTABLE_WORKSPACE_SCHEMA_VERSION, "prospector/portable-workspace-schema/v1");
    assert.deepEqual(Object.keys(backup).sort(), [
      "PORTABLE_WORKSPACE_SCHEMA_VERSION",
      "createEncryptedLocalBackup",
      "restoreEncryptedLocalBackup",
      "verifyEncryptedLocalBackupCompatibility",
    ]);
  });
});

test("archive inputs containing a passphrase, password, secret, credential, OAuth, bearer, or token field are refused at any depth", async () => {
  await withBackup(async (backup) => {
    for (const key of ["passphrase", "password", "secret", "credential", "oauth", "bearer", "token", "apiToken", "client_secret", "refreshToken"]) {
      const topLevel = source({ records: [{ kind: "prospect", id: "p-1", value: { [key]: "x" } }] });
      await assert.rejects(backup.createEncryptedLocalBackup(topLevel, PASSPHRASE), invalidArchive, key);
      const nested = source({ records: [{ kind: "prospect", id: "p-1", value: { a: [{ b: { [key]: "x" } }] } }] });
      await assert.rejects(backup.createEncryptedLocalBackup(nested, PASSPHRASE), invalidArchive, `nested ${key}`);
    }
    await assert.rejects(
      backup.createEncryptedLocalBackup(source({
        suppressionTombstones: [{ kind: "suppression", id: "t-1", value: { scopeDigest: DIGEST, token: "x" } }],
      }), PASSPHRASE),
      invalidArchive,
    );
  });
});

test("archive inputs that are non-synthetic, malformed, or ambiguous are refused before any key is derived", async () => {
  await withBackup(async (backup) => {
    const cases = [
      ["hosted provenance", source({ provenance: { ...source().provenance, kind: "production" } })],
      ["bad snapshot digest", source({ provenance: { ...source().provenance, snapshotDigest: "short" } })],
      ["non-UTC timestamp", source({ createdAt: "2026-11-09T12:00:00-05:00" })],
      ["impossible timestamp", source({ createdAt: "2026-02-30T12:00:00.000Z" })],
      ["bad workspace id", source({ workspaceId: "has space" })],
      ["unknown top-level field", { ...source(), extra: true }],
      ["missing field", Object.fromEntries(Object.entries(source()).filter(([key]) => key !== "records"))],
      ["duplicate record identity", source({ records: [
        { kind: "prospect", id: "p-1", value: {} }, { kind: "prospect", id: "p-1", value: { a: 1 } },
      ] })],
      ["record id reused by a tombstone", source({
        records: [{ kind: "suppression", id: "t-1", value: {} }],
        suppressionTombstones: [{ kind: "suppression", id: "t-1", value: { scopeDigest: DIGEST } }],
      })],
      ["tombstone with wrong kind", source({ suppressionTombstones: [{ kind: "prospect", id: "t-1", value: { scopeDigest: DIGEST } }] })],
      ["tombstone with extra value", source({ suppressionTombstones: [{ kind: "suppression", id: "t-1", value: { scopeDigest: DIGEST, email: "a@example.test" } }] })],
      ["bad object digest", source({ objectDigests: ["not-a-digest"] })],
      ["non-finite value", source({ records: [{ kind: "prospect", id: "p-1", value: { n: Number.NaN } }] })],
      ["class instance value", source({ records: [{ kind: "prospect", id: "p-1", value: new Date() }] })],
    ];
    for (const [name, value] of cases) {
      await assert.rejects(backup.createEncryptedLocalBackup(value, PASSPHRASE), invalidArchive, name);
    }
    for (const bad of ["", "short", 42, null, "x".repeat(1025)]) {
      await assert.rejects(backup.createEncryptedLocalBackup(source(), bad), invalidArchive, String(bad).slice(0, 8));
    }
  });
});

test("an unsupported or tampered-shape envelope is refused with one indistinguishable error on restore and compatibility check", async () => {
  await withBackup(async (backup) => {
    const envelope = {
      format: "prospector/local-portable-backup/v2",
      kdf: "PBKDF2-SHA-256",
      iterations: 210_000,
      cipher: "AES-256-GCM",
      salt: "AAAAAAAAAAAAAAAAAAAAAA==",
      iv: "AAAAAAAAAAAAAAAA",
      ciphertext: "AAAA",
    };
    const variants = [
      ["unknown format", { ...envelope, format: "prospector/local-portable-backup/v1" }],
      ["downgraded KDF", { ...envelope, kdf: "none" }],
      ["lowered iterations", { ...envelope, iterations: 1 }],
      ["other cipher", { ...envelope, cipher: "AES-128-CBC" }],
      ["extra field", { ...envelope, note: "x" }],
      ["missing field", Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "iv"))],
      ["non-object", "ciphertext"],
      ["null", null],
    ];
    for (const [name, value] of variants) {
      await assert.rejects(
        backup.restoreEncryptedLocalBackup(value, PASSPHRASE, emptyState, expectation),
        (error) => error?.message === "portable_backup_untrusted",
        `restore ${name}`,
      );
      await assert.rejects(
        backup.verifyEncryptedLocalBackupCompatibility(value, PASSPHRASE, expectation),
        (error) => error?.message === "portable_backup_untrusted",
        `compat ${name}`,
      );
    }
    // A malformed expectation is the same indistinguishable refusal.
    await assert.rejects(
      backup.verifyEncryptedLocalBackupCompatibility(envelope, PASSPHRASE, { ...expectation, schemaVersion: "other" }),
      (error) => error?.message === "portable_backup_untrusted",
    );
  });
});

test("the backup module has no network, filesystem, scheduler, provider, or preparation dependency and leaves effects off", async () => {
  const text = await readFile(new URL("../domain/local-portable-backup.ts", import.meta.url), "utf8");
  assert.doesNotMatch(text, /^\s*import\b/mu);
  assert.doesNotMatch(text, /\b(fetch|XMLHttpRequest|WebSocket|process\.env|localStorage|sessionStorage|indexedDB)\b/u);
  assert.doesNotMatch(text, /node:|require\(/u);
  assert.match(text, /effectsEnabled: false/u);
  assert.doesNotMatch(text, /effectsEnabled:\s*true/u);
});

// -- 07-08: encrypted workspace archive, dry run, and fenced restore ---------
//
// Owner-delegated decision D-4 (2026-11-10) fixes the envelope: scrypt with
// N = 2^17, r = 8, p = 1, a 32-byte key and a 16-byte random salt from the
// runtime's built-in crypto, then AES-256-GCM. Every port below is an
// in-memory fake that counts each write and effect call; the one D1 case runs
// the local 0023 repository on Miniflare. No case reaches a host, a provider,
// a scheduler, or a hosted restore target (07-07's target gate stays blocked).

const SOURCE_WS = "workspace-source";
const TARGET_WS = "workspace-target";
const SCHEMA_V1 = "prospector/portable-workspace-schema/v1";
const ARCHIVE_FORMAT = "prospector/portable-workspace-archive/v1";
const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const MINUTE = 60_000;
const SCRYPT = Object.freeze({ N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
const textEncoder = new TextEncoder();
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function loadModule(path) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, module: await vite.ssrLoadModule(new URL(path, import.meta.url).pathname) };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

async function loadRecovery() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const load = (path) => vite.ssrLoadModule(new URL(path, import.meta.url).pathname);
    return {
      vite,
      archive: await load("../domain/workspace-archive.ts"),
      verifier: await load("../domain/restore-verifier.ts"),
      restore: await load("../domain/restore-apply.ts"),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

/** Fake target and effect ports: every write and external effect is counted. */
function fakeTarget(patch = {}) {
  const counters = {
    d1Writes: 0, objectWrites: 0, scheduler: 0, runner: 0, send: 0, provider: 0, delivery: 0, audit: 0,
  };
  const count = (name) => async () => { counters[name] += 1; };
  return {
    counters,
    state: { clean: true, schemaVersion: "prospector/portable-workspace-schema/v1", workspaceId: "workspace-target", ...patch },
    ports: {
      d1: { write: count("d1Writes"), read: async () => [] },
      objects: { put: count("objectWrites"), get: async () => null },
      scheduler: { enable: count("scheduler") },
      runner: { start: count("runner") },
      mail: { send: count("send") },
      provider: { call: count("provider") },
      delivery: { deliver: count("delivery") },
      audit: { record: count("audit") },
    },
  };
}

function assertZeroEffects(counters, { allowAudit = true } = {}) {
  const { audit, ...rest } = counters;
  for (const [name, value] of Object.entries(rest)) assert.equal(value, 0, name);
  if (!allowAudit) assert.equal(audit, 0);
}

function assertNoEffectCalls(counters) {
  for (const name of ["scheduler", "runner", "send", "provider", "delivery"]) assert.equal(counters[name], 0, name);
}

/** A generic Company / Market Play hierarchy with every archive section populated. */
function sourceWorkspace({ companyId = "company-main", marketPlayId = "play-main" } = {}) {
  const csv = textEncoder.encode(`prospect_id,company_id\nprospect-1,${companyId}\n`);
  const evidence = textEncoder.encode(`synthetic evidence for ${marketPlayId}`);
  const csvDigest = sha256Hex(csv);
  const evidenceDigest = sha256Hex(evidence);
  return {
    objects: new Map([[csvDigest, csv], [evidenceDigest, evidence]]),
    snapshot: {
      workspaceId: SOURCE_WS,
      schemaVersion: SCHEMA_V1,
      records: [
        { kind: "prospect", id: "prospect-1", value: { marketPlayId, state: "ExportReady", evidenceObjectDigest: evidenceDigest } },
        { kind: "company", id: companyId, value: { name: "Synthetic Company" } },
        { kind: "market_play", id: marketPlayId, value: { companyId, state: "accepted" } },
        { kind: "contact", id: "contact-1", value: { prospectId: "prospect-1", emailAddress: "person@example.test" } },
      ],
      decisions: [{ kind: "review_decision", id: "decision-1", value: { subjectKind: "prospect", subjectId: "prospect-1", outcome: "approved" } }],
      history: [
        { stream: "prospect:prospect-1", sequence: 2, id: "history-2", value: { state: "ExportReady" } },
        { stream: "prospect:prospect-1", sequence: 1, id: "history-1", value: { state: "Qualified" } },
      ],
      audit: [{ stream: "workspace", sequence: 1, id: "audit-1", value: { action: "prospect.qualified" } }],
      objects: [
        { digest: csvDigest, byteLength: csv.byteLength, mediaType: "text/csv" },
        { digest: evidenceDigest, byteLength: evidence.byteLength, mediaType: "text/plain" },
      ],
      dependencies: [{ kind: "configuration", id: "configuration-1", value: { configurationDigest: "c".repeat(64) } }],
      exportArtifacts: [{ kind: "crm_csv", id: "artifact-1", value: { objectDigest: csvDigest, rowCount: 1 } }],
      tombstones: [
        { kind: "suppression", id: "tombstone-1", value: { scopeKind: "domain", scopeDigest: OTHER_DIGEST } },
        { kind: "deletion", id: "tombstone-2", value: { scopeKind: "contact", scopeDigest: DIGEST } },
      ],
    },
  };
}

function freshAuthority(workspaceId, patch = {}) {
  return { workspaceId, ownerSubject: "owner-synthetic", reauthenticatedAt: NOW - MINUTE, reauthReferenceDigest: "d".repeat(64), ...patch };
}

/** Source-side ports. `seen` holds every value that crosses a persistence, audit, or log boundary. */
function archiveHarness({ source = sourceWorkspace(), authority = freshAuthority(SOURCE_WS), random } = {}) {
  const fake = fakeTarget();
  const seen = [];
  const stored = new Map();
  const rows = [];
  const ports = {
    now: () => NOW,
    ...(random ? { random } : {}),
    authority: { current: async () => authority },
    source: { readSnapshot: async () => source.snapshot, readObject: async (digest) => source.objects.get(digest) ?? null },
    archiveStore: {
      putImmutable: async (key, bytes, metadata) => {
        await fake.ports.objects.put(key, bytes, metadata);
        stored.set(key, { bytes, metadata });
        seen.push(key, JSON.stringify(metadata), new TextDecoder().decode(bytes));
      },
    },
    evidence: {
      recordArchive: async (row) => { await fake.ports.d1.write(row); rows.push(["archive", row]); seen.push(JSON.stringify(row)); return { id: `rar_${"1".repeat(32)}`, digest: "1".repeat(64), replayed: false }; },
      recordDeliveryEvent: async (row) => { await fake.ports.d1.write(row); rows.push(["delivery", row]); seen.push(JSON.stringify(row)); return { id: `hde_${"2".repeat(32)}`, digest: "2".repeat(64), replayed: false }; },
      recordRefusal: async (row) => { await fake.ports.audit.record(row); rows.push(["refusal", row]); seen.push(JSON.stringify(row)); return { id: `hra_${"3".repeat(32)}`, digest: "3".repeat(64), replayed: false }; },
    },
    log: (line) => seen.push(String(line)),
  };
  return { fake, ports, seen, stored, rows };
}

/** Restore target data store. Data writes go through the counting fake d1/object ports. */
function memoryRestoreTarget(fake, { schemaVersion = SCHEMA_V1, effectsEnabled = false, preload = [] } = {}) {
  let rows = [...preload];
  let objects = new Map();
  let effects = null;
  return {
    readState: async () => ({ schemaVersion, empty: rows.length === 0 && objects.size === 0, effectsEnabled }),
    apply: async (plan) => {
      for (const row of plan.rows) { await fake.ports.d1.write(row); rows.push(structuredClone(row)); }
      for (const object of plan.objects) { await fake.ports.objects.put(object.digest, object.bytes, { digest: object.digest }); objects.set(object.digest, object.bytes); }
      await fake.ports.d1.write({ effects: plan.effects });
      effects = { ...plan.effects };
    },
    discard: async () => { rows = []; objects = new Map(); effects = null; },
    readRestored: async () => ({
      rows: structuredClone(rows),
      objects: [...objects].sort(([left], [right]) => left.localeCompare(right)).map(([digest, bytes]) => ({ digest, bytes: Uint8Array.from(bytes) })),
      effects,
    }),
  };
}

/** In-memory evidence port with the 0023 repository's replay, nonce, lock, and single-apply semantics. */
function memoryEvidence(fake, target, clock) {
  const commands = new Map();
  const dryRuns = new Map();
  const locks = new Map();
  const results = new Map();
  const conflict = (reason) => new Error(`handoff_recovery_conflict:${reason}`);
  const applied = () => [...results.values()].some((result) => result.outcome === "applied");
  const write = async (kind, key, input, make) => {
    const op = JSON.stringify([kind, input]);
    const prior = commands.get(key);
    if (prior) {
      if (prior.op !== op) throw conflict("idempotency_conflict");
      return { ...(await prior.pending), replayed: true };
    }
    const pending = (async () => make())();
    commands.set(key, { op, pending });
    try {
      const result = await pending;
      await fake.ports.audit.record({ kind, input });
      return { ...result, replayed: false };
    } catch (error) {
      commands.delete(key);
      throw error;
    }
  };
  return {
    dryRuns, locks, results,
    readRestoreTargetState: async () => {
      const state = await target.readState();
      return { clean: state.empty && !applied(), nonEmptyTables: state.empty ? [] : ["restored_rows"], restoreApplied: applied(), digest: "0".repeat(64) };
    },
    recordDryRun: (input) => write("dry_run", input.idempotencyKey, input, async () => {
      if (input.outcome === "accepted" && (!(await target.readState()).empty || applied())) throw conflict("restore_target_not_clean");
      const id = `rdr_${String(dryRuns.size + 1).padStart(32, "0")}`;
      dryRuns.set(id, { ...input });
      return { id, digest: "5".repeat(64) };
    }),
    acquireRestoreLock: (input) => write("lock", input.idempotencyKey, input, async () => {
      const dryRun = dryRuns.get(input.dryRunId);
      if (!dryRun || dryRun.outcome !== "accepted" || dryRun.nonceDigest !== input.nonceDigest || clock.now > dryRun.expiresAt) throw conflict("dry_run_not_accepted");
      if ([...locks.values()].some((lock) => lock.dryRunId === input.dryRunId || !results.has(lock.id)) || applied()) throw conflict("restore_lock_unavailable");
      const id = `rrl_${String(locks.size + 1).padStart(32, "0")}`;
      locks.set(id, { id, ...input });
      return { id, digest: "6".repeat(64) };
    }),
    recordRestoreResult: (input) => write("result", input.idempotencyKey, input, async () => {
      if (!locks.has(input.lockId) || results.has(input.lockId)) throw conflict("restore_lock_unavailable");
      results.set(input.lockId, { ...input });
      return { id: `rrr_${String(results.size).padStart(32, "0")}`, digest: "7".repeat(64) };
    }),
    recordRefusal: async (input) => {
      await fake.ports.audit.record({ kind: "refusal", input });
      return { id: `hra_${"8".repeat(32)}`, digest: "8".repeat(64), replayed: false };
    },
  };
}

/** Target-side ports for one archive upload. Target identity comes only from `authority`. */
function restoreHarness(envelopeBytes, { schemaVersion, effectsEnabled, preload, authority = freshAuthority(TARGET_WS), archiveExpiresAt = NOW + 60 * MINUTE } = {}) {
  const fake = fakeTarget();
  const clock = { now: NOW };
  const target = memoryRestoreTarget(fake, { schemaVersion, effectsEnabled, preload });
  const evidence = memoryEvidence(fake, target, clock);
  const uploads = new Map([["archive-1", { bytes: envelopeBytes, expiresAt: archiveExpiresAt }]]);
  return {
    fake, clock, target, evidence, uploads,
    ports: {
      now: () => clock.now,
      authority: { current: async () => authority },
      archives: { readArchive: async (ref) => uploads.get(ref) ?? null },
      target,
      evidence,
    },
  };
}

async function createArchive(archive, options = {}) {
  const harness = archiveHarness(options);
  const created = await archive.createWorkspaceArchive({ passphrase: PASSPHRASE, ports: harness.ports });
  return { ...harness, created, bytes: textEncoder.encode(JSON.stringify(created.envelope)) };
}

// Independent D-4 reference implementation: node:crypto scrypt and AES-256-GCM
// with the documented additional data (canonical JSON of every header field).
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function headerOf(envelope) {
  return Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "ciphertext" && key !== "tag"));
}

function referenceKey(passphrase, saltHex) {
  return scryptSync(Buffer.from(passphrase.normalize("NFC"), "utf8"), Buffer.from(saltHex, "hex"), 32, SCRYPT);
}

function referenceOpen(envelope, passphrase) {
  const key = referenceKey(passphrase, envelope.kdf.salt);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "hex"));
  decipher.setAAD(Buffer.from(canonicalJson(headerOf(envelope)), "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

/** Re-seals a mutated payload exactly as an attacker who knows the passphrase could. */
async function reseal(archive, envelope, mutate) {
  const payload = referenceOpen(envelope, PASSPHRASE);
  mutate(payload.sections);
  const snapshot = {
    workspaceId: payload.manifest.workspaceId,
    schemaVersion: payload.manifest.schemaVersion,
    ...payload.sections,
    objects: payload.sections.objects.map(({ digest, byteLength, mediaType }) => ({ digest, byteLength, mediaType })),
  };
  payload.manifest = await archive.buildArchiveManifest(snapshot);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = { ...headerOf(envelope), manifestDigest: payload.manifest.digest, kdf: { ...envelope.kdf, salt: salt.toString("hex") }, iv: iv.toString("hex") };
  const cipher = createCipheriv("aes-256-gcm", referenceKey(PASSPHRASE, header.kdf.salt), iv);
  cipher.setAAD(Buffer.from(canonicalJson(header), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(canonicalJson(payload), "utf8")), cipher.final()]);
  return textEncoder.encode(JSON.stringify({ ...header, ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") }));
}

test("the archive manifest is canonical and ordered: records, history, audit, objects, dependencies, export artifacts, and tombstones; no secrets", async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const { snapshot } = sourceWorkspace();
    const manifest = await module.buildArchiveManifest(snapshot);
    assert.deepEqual(Object.keys(manifest.sections), [
      "records", "decisions", "history", "audit", "objects", "dependencies", "exportArtifacts", "tombstones",
    ]);
    assert.doesNotMatch(JSON.stringify(manifest), /passphrase|password|secret|token|credential/iu);
    assert.equal(manifest.digest, (await module.buildArchiveManifest(snapshot)).digest);
    // Canonical: input order never changes the digest; content always does.
    const reordered = { ...snapshot, records: [...snapshot.records].reverse(), history: [...snapshot.history].reverse(), objects: [...snapshot.objects].reverse() };
    assert.equal((await module.buildArchiveManifest(reordered)).digest, manifest.digest);
    const changed = { ...snapshot, records: snapshot.records.map((record) => record.id === "prospect-1" ? { ...record, value: { ...record.value, state: "Qualified" } } : record) };
    assert.notEqual((await module.buildArchiveManifest(changed)).digest, manifest.digest);
    // The manifest is public metadata: counts and digests only, never raw contact values.
    assert.doesNotMatch(JSON.stringify(manifest), /example\.test|Synthetic Company/u);
    assert.deepEqual(Object.values(manifest.sections).map((section) => section.count), [4, 1, 2, 1, 2, 1, 1, 2]);
  } finally { await vite.close(); }
});

test("the passphrase exists only in operation memory: never in D1/R2 metadata, audit, browser storage, logs, or fixture output", async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const harness = archiveHarness();
    const created = await module.createWorkspaceArchive({ passphrase: PASSPHRASE, ports: harness.ports });
    assert.ok(harness.seen.length > 0);
    for (const line of harness.seen) assert.equal(line.includes(PASSPHRASE), false);
    assert.equal(JSON.stringify(created).includes(PASSPHRASE), false);
    // Exactly one immutable archive object and one archive record plus its delivery expiry.
    assert.equal(harness.stored.size, 1);
    assert.deepEqual(harness.rows.map(([kind]) => kind), ["archive", "delivery"]);
    const [, archiveRow] = harness.rows[0];
    assert.equal(archiveRow.kdf, "scrypt");
    assert.equal(archiveRow.cipher, "aes-256-gcm");
    assert.deepEqual(Object.keys(archiveRow.kdfParameters).sort(), ["N", "keyLength", "memoryHard", "name", "p", "r", "salt"]);
    assert.equal(archiveRow.reauthReferenceDigest, "d".repeat(64));
    const [, deliveryRow] = harness.rows[1];
    assert.equal(deliveryRow.subjectKind, "recovery_archive");
    assert.equal(deliveryRow.eventKind, "issued");
    assert.ok(deliveryRow.expiresAt > NOW, "delivery expiry is server-derived from the server clock");
    // No module-level state survives the operation: the module exports no cache or key handle.
    assert.deepEqual(Object.keys(module).sort(), [
      "ARCHIVE_CIPHER", "ARCHIVE_FORMAT_VERSION", "ARCHIVE_KDF", "WORKSPACE_ARCHIVE_SCHEMA_VERSION",
      "WorkspaceArchiveUntrustedError", "buildArchiveManifest", "createWorkspaceArchive", "openWorkspaceArchive",
    ]);
  } finally { await vite.close(); }
});

test("a wrong passphrase, tampered ciphertext, and a truncated archive are one indistinguishable untrusted failure", async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const { created } = await createArchive(module);
    const archive = created.envelope;
    const failures = [];
    for (const attempt of [
      () => module.openWorkspaceArchive(archive, "wrong-passphrase-0000"),
      () => module.openWorkspaceArchive({ ...archive, ciphertext: archive.ciphertext.slice(0, -4) }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, tag: "AAAA" }, PASSPHRASE),
      // Header fields are bound as additional data, so relabelling one fails authentication.
      () => module.openWorkspaceArchive({ ...archive, sourceWorkspaceId: "workspace-other" }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, manifestDigest: "0".repeat(64) }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, createdAt: "2026-11-10T12:00:00.001Z" }, PASSPHRASE),
      // Downgrades and unknown versions are refused before any key is derived.
      () => module.openWorkspaceArchive({ ...archive, kdf: { ...archive.kdf, N: 2 ** 10 } }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, kdf: { ...archive.kdf, r: 1 } }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, kdf: { ...archive.kdf, name: "pbkdf2" } }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, kdf: { ...archive.kdf, memoryHard: false } }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, cipher: "aes-128-gcm" }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, format: "prospector/portable-workspace-archive/v0" }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, extra: true }, PASSPHRASE),
      () => module.openWorkspaceArchive(null, PASSPHRASE),
    ]) {
      await assert.rejects(attempt(), (error) => { failures.push(error.message); return true; });
    }
    assert.equal(new Set(failures).size, 1);
    assert.equal(failures[0], "workspace_archive_untrusted");
    assert.equal(archive.kdf.memoryHard, true, "07-07 owner decision: memory-hard KDF");
    const opened = await module.openWorkspaceArchive(archive, PASSPHRASE);
    assert.equal(opened.manifest.digest, archive.manifestDigest);
  } finally { await vite.close(); }
});

test("the envelope is exactly D-4: an independent node:crypto scrypt + AES-256-GCM implementation opens it, and it opens theirs", async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const { created } = await createArchive(module);
    const envelope = created.envelope;
    assert.equal(envelope.format, ARCHIVE_FORMAT);
    assert.equal(envelope.cipher, "aes-256-gcm");
    assert.deepEqual({ ...envelope.kdf, salt: undefined }, { name: "scrypt", N: 131072, r: 8, p: 1, keyLength: 32, memoryHard: true, salt: undefined });
    assert.match(envelope.kdf.salt, /^[a-f0-9]{32}$/u, "16-byte salt");
    assert.match(envelope.iv, /^[a-f0-9]{24}$/u, "12-byte GCM nonce");
    assert.equal(Buffer.from(envelope.tag, "base64").byteLength, 16, "128-bit tag");
    const payload = referenceOpen(envelope, PASSPHRASE);
    assert.equal(payload.manifest.digest, envelope.manifestDigest);
    assert.deepEqual(payload.sections.records.map((record) => `${record.kind}:${record.id}`), ["company:company-main", "contact:contact-1", "market_play:play-main", "prospect:prospect-1"]);
    // A payload sealed by the reference implementation opens in the module.
    const resealed = JSON.parse(new TextDecoder().decode(await reseal(module, envelope, () => {})));
    const opened = await module.openWorkspaceArchive(resealed, PASSPHRASE);
    assert.equal(opened.manifest.digest, envelope.manifestDigest);
    // Fresh randomness per archive; a fixed test seam makes the output deterministic.
    const second = (await createArchive(module)).created.envelope;
    assert.notEqual(second.kdf.salt, envelope.kdf.salt);
    assert.notEqual(second.iv, envelope.iv);
    const fixed = (length) => new Uint8Array(length).fill(7);
    const left = (await createArchive(module, { random: fixed })).created.envelope;
    const right = (await createArchive(module, { random: fixed })).created.envelope;
    assert.deepEqual(left, right);
  } finally { await vite.close(); }
});

test("archive creation refuses stale reauthentication, a foreign snapshot, secrets, missing or altered objects, and broken invariants before any write", async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const base = sourceWorkspace();
    const withSnapshot = (patch) => ({ ...base, snapshot: { ...base.snapshot, ...patch } });
    const cases = [
      ["no authority", { authority: null }, "not_authorized"],
      ["stale reauthentication", { authority: freshAuthority(SOURCE_WS, { reauthenticatedAt: NOW - 16 * MINUTE }) }, "reauthentication_required"],
      ["future reauthentication", { authority: freshAuthority(SOURCE_WS, { reauthenticatedAt: NOW + MINUTE }) }, "reauthentication_required"],
      ["foreign snapshot", { source: withSnapshot({ workspaceId: "workspace-other" }) }, "archive_source_invalid"],
      ["secret field", { source: withSnapshot({ records: [...base.snapshot.records, { kind: "integration", id: "i-1", value: { nested: [{ apiToken: "x" }] } }] }) }, "archive_source_invalid"],
      ["missing object", { source: { ...base, objects: new Map([...base.objects].slice(1)) } }, "archive_object_missing"],
      ["altered object", { source: { ...base, objects: new Map([...base.objects].map(([digest, bytes]) => [digest, Uint8Array.from(bytes, (byte) => byte ^ 1)])) } }, "archive_object_missing"],
      ["dangling object reference", { source: withSnapshot({ exportArtifacts: [{ kind: "crm_csv", id: "artifact-1", value: { objectDigest: DIGEST, rowCount: 1 } }] }) }, "archive_object_missing"],
      ["duplicate identity", { source: withSnapshot({ records: [...base.snapshot.records, base.snapshot.records[0]] }) }, "archive_invariant_failed"],
      ["history gap", { source: withSnapshot({ history: [base.snapshot.history[0]] }) }, "archive_invariant_failed"],
      ["unknown section", { source: withSnapshot({ extra: [] }) }, "archive_source_invalid"],
    ];
    for (const [name, options, reason] of cases) {
      const harness = archiveHarness(options);
      await assert.rejects(module.createWorkspaceArchive({ passphrase: PASSPHRASE, ports: harness.ports }), (error) => error.message === reason, name);
      assert.equal(harness.stored.size, 0, name);
      assert.deepEqual(harness.rows.filter(([kind]) => kind !== "refusal"), [], name);
      assert.equal(harness.fake.counters.objectWrites + harness.fake.counters.d1Writes, 0, name);
    }
    for (const bad of ["", "short", 42, null, "x".repeat(1025)]) {
      const harness = archiveHarness();
      await assert.rejects(module.createWorkspaceArchive({ passphrase: bad, ports: harness.ports }), (error) => error.message === "archive_request_invalid");
    }
    // Workspace scope is never accepted from the request.
    const harness = archiveHarness();
    await assert.rejects(module.createWorkspaceArchive({ passphrase: PASSPHRASE, workspaceId: "workspace-other", ports: harness.ports }), (error) => error.message === "archive_request_invalid");
  } finally { await vite.close(); }
});

test("dry run refuses unauthorized, expired, tampered, missing-object, non-clean, version-skewed, and invariant-failed input with zero target writes and zero effect calls", async () => {
  const { vite, archive, verifier, restore } = await loadRecovery();
  try {
    const { bytes, created } = await createArchive(archive);
    const tampered = Uint8Array.from(bytes);
    tampered[Math.floor(tampered.length / 2)] ^= 1;
    const missingObject = await reseal(archive, created.envelope, (sections) => { sections.objects = sections.objects.slice(1); });
    const duplicate = await reseal(archive, created.envelope, (sections) => { sections.records.splice(1, 0, sections.records[0]); });
    // Content-addressed objects whose bytes no longer match their declared digest or length.
    const alteredObject = await reseal(archive, created.envelope, (sections) => {
      const altered = Buffer.from(sections.objects[0].bytes, "base64");
      altered[0] ^= 1;
      sections.objects[0].bytes = altered.toString("base64");
    });
    const shortObject = await reseal(archive, created.envelope, (sections) => {
      sections.objects[0].bytes = Buffer.from(sections.objects[0].bytes, "base64").subarray(0, 1).toString("base64");
    });
    const swappedObjects = await reseal(archive, created.envelope, (sections) => {
      const [first, second] = sections.objects;
      [first.bytes, second.bytes] = [second.bytes, first.bytes];
    });
    const cases = [
      ["unauthorized", bytes, { authority: null }, "not_authorized"],
      ["expired authorization", bytes, { authority: freshAuthority(TARGET_WS, { reauthenticatedAt: NOW - 16 * MINUTE }) }, "reauthentication_required"],
      ["expired archive", bytes, { archiveExpiresAt: NOW - 1 }, "archive_expired"],
      ["tampered archive", tampered, {}, "archive_untrusted"],
      ["missing object", missingObject, {}, "archive_object_missing"],
      ["altered object bytes", alteredObject, {}, "archive_object_missing"],
      ["object bytes shorter than declared", shortObject, {}, "archive_object_missing"],
      ["object bytes swapped between digests", swappedObjects, {}, "archive_object_missing"],
      ["non-clean target", bytes, { preload: [{ section: "records", kind: "company", id: "existing", value: {} }] }, "target_not_clean"],
      ["effects not fenced", bytes, { effectsEnabled: true }, "target_effects_enabled"],
      ["version skew", bytes, { schemaVersion: "prospector/portable-workspace-schema/v0" }, "version_skew"],
      ["invariant failure", duplicate, {}, "archive_invariant_failed"],
    ];
    for (const [name, archiveBytes, options, reason] of cases) {
      const target = restoreHarness(archiveBytes, options);
      const result = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: target.ports });
      assert.equal(result.status, "refused", name);
      assert.equal(result.reason, reason, name);
      assert.deepEqual(Object.keys(result).sort(), ["reason", "status"], name);
      assert.equal(target.fake.counters.d1Writes, 0, name);
      assert.equal(target.fake.counters.objectWrites, 0, name);
      assert.equal(target.evidence.dryRuns.size, 0, name);
      assertZeroEffects(target.fake.counters);
    }
    // Opening an archive checks every object's bytes against its digest and length, and so does apply.
    for (const [name, archiveBytes] of [["altered", alteredObject], ["short", shortObject], ["swapped", swappedObjects]]) {
      const envelope = JSON.parse(new TextDecoder().decode(archiveBytes));
      await assert.rejects(archive.openWorkspaceArchive(envelope, PASSPHRASE), (error) => error.message === "archive_object_missing", name);
      const target = restoreHarness(archiveBytes);
      const applied = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: `rdr_${"9".repeat(32)}`, nonce: "f".repeat(32), passphrase: PASSPHRASE, ports: target.ports });
      assert.deepEqual(applied, { status: "refused", reason: "archive_object_missing" }, name);
      assertZeroEffects(target.fake.counters);
      assert.equal(target.evidence.locks.size, 0, name);
    }
    // A wrong passphrase is the same untrusted refusal as tampering.
    const wrong = restoreHarness(bytes);
    assert.deepEqual(await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: "wrong-passphrase-0000", ports: wrong.ports }), { status: "refused", reason: "archive_untrusted" });
    const absent = restoreHarness(bytes);
    assert.deepEqual(await verifier.dryRunRestore({ archiveRef: "archive-2", passphrase: PASSPHRASE, ports: absent.ports }), { status: "refused", reason: "archive_unavailable" });
  } finally { await vite.close(); }
});

test("a successful dry run is read-only: a compatible clean target shows a nonce and writes nothing", async () => {
  const { vite, archive, verifier } = await loadRecovery();
  try {
    const { bytes, created } = await createArchive(archive);
    const target = restoreHarness(bytes);
    const result = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: target.ports });
    assert.equal(result.status, "verified");
    assert.match(result.nonce, /^[a-f0-9]{32,}$/u);
    assert.equal(result.manifestDigest, created.envelope.manifestDigest);
    assert.equal(result.expiresAt, NOW + 15 * MINUTE);
    assert.deepEqual([result.recordCount, result.objectCount, result.tombstoneCount], [12, 2, 2]);
    assert.equal(target.fake.counters.d1Writes, 0);
    assert.equal(target.fake.counters.objectWrites, 0);
    assertZeroEffects(target.fake.counters);
    // Only the nonce digest is kept as evidence, never the nonce or passphrase.
    const [dryRun] = target.evidence.dryRuns.values();
    assert.equal(dryRun.outcome, "accepted");
    assert.equal(dryRun.sourceWorkspaceId, SOURCE_WS);
    assert.match(dryRun.nonceDigest, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(dryRun).includes(result.nonce), false);
    assert.equal(JSON.stringify(dryRun).includes(PASSPHRASE), false);
    // Client-supplied target scope is never accepted as authority.
    const forged = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, clientTargetScope: "workspace-other", ports: target.ports });
    assert.equal(forged.status, "refused");
    const forgedWorkspace = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, workspaceId: "workspace-other", ports: target.ports });
    assert.equal(forgedWorkspace.status, "refused");
    assert.equal(target.fake.counters.d1Writes, 0);
  } finally { await vite.close(); }
});

test("restore applies only after a current successful dry run with a matching nonce, once, and idempotently", async () => {
  const { vite, archive, verifier, restore } = await loadRecovery();
  try {
    const { bytes } = await createArchive(archive);
    const other = await createArchive(archive, { source: sourceWorkspace({ companyId: "company-logistics", marketPlayId: "play-port-operators" }) });
    const target = restoreHarness(bytes);
    target.uploads.set("archive-other", { bytes: other.bytes, expiresAt: NOW + 60 * MINUTE });
    const apply = (patch) => restore.applyRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ...patch, ports: target.ports });

    const noDryRun = await apply({ dryRunId: `rdr_${"9".repeat(32)}`, nonce: "f".repeat(32) });
    assert.equal(noDryRun.status, "refused");
    assert.equal(target.fake.counters.d1Writes, 0);

    const dry = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: target.ports });
    assert.equal(dry.status, "verified");
    for (const [name, patch] of [
      ["wrong nonce", { dryRunId: dry.dryRunId, nonce: "0".repeat(32) }],
      ["another archive with this nonce", { archiveRef: "archive-other", dryRunId: dry.dryRunId, nonce: dry.nonce }],
      ["wrong passphrase", { dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: "wrong-passphrase-0000" }],
      ["browser target scope", { dryRunId: dry.dryRunId, nonce: dry.nonce, workspaceId: TARGET_WS }],
    ]) {
      const refused = await apply(patch);
      assert.equal(refused.status, "refused", name);
      assert.equal(target.fake.counters.d1Writes, 0, name);
    }
    // An expired dry run never applies, even with a freshly reauthenticated owner.
    const authority = target.ports.authority;
    target.clock.now = NOW + 16 * MINUTE;
    target.ports.authority = { current: async () => freshAuthority(TARGET_WS, { reauthenticatedAt: NOW + 15 * MINUTE }) };
    assert.deepEqual(await apply({ dryRunId: dry.dryRunId, nonce: dry.nonce }), { status: "refused", reason: "dry_run_not_current" });
    assert.equal(target.fake.counters.d1Writes, 0);
    target.clock.now = NOW;
    target.ports.authority = authority;

    const applied = await apply({ dryRunId: dry.dryRunId, nonce: dry.nonce });
    assert.equal(applied.status, "restored");
    assert.equal(applied.archiveDigest, dry.manifestDigest);
    const writesAfterFirst = target.fake.counters.d1Writes;
    assert.ok(writesAfterFirst > 0);
    const again = await apply({ dryRunId: dry.dryRunId, nonce: dry.nonce });
    assert.equal(again.status, "already_restored");
    assert.equal(again.archiveDigest, applied.archiveDigest);
    assert.equal(target.fake.counters.d1Writes, writesAfterFirst);
    // A restored target is never clean again: a fresh dry run is refused.
    const second = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: target.ports });
    assert.deepEqual(second, { status: "refused", reason: "target_not_clean" });
    assert.equal(target.evidence.results.size, 1);
    assertNoEffectCalls(target.fake.counters);
  } finally { await vite.close(); }
});

test("replay keeps stable IDs, append-only history, hashes, digests, and tombstones, and every effect starts paused or disabled", async () => {
  const { vite, archive, verifier, restore } = await loadRecovery();
  try {
    for (const hierarchy of [
      { companyId: "company-main", marketPlayId: "play-main" },
      { companyId: "company-logistics", marketPlayId: "play-port-operators" },
    ]) {
      const source = sourceWorkspace(hierarchy);
      const { bytes } = await createArchive(archive, { source });
      const target = restoreHarness(bytes);
      const dry = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: target.ports });
      const result = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports });
      assert.equal(result.status, "restored");
      const restored = await target.target.readRestored();
      const identities = (rows) => rows.filter((row) => row.section !== "history" && row.section !== "audit").map((row) => `${row.section}/${row.kind}:${row.id}`).sort();
      const before = source.snapshot;
      const idsBefore = ["records", "decisions", "dependencies", "exportArtifacts", "tombstones"].flatMap((section) => before[section].map((entry) => `${section}/${entry.kind}:${entry.id}`)).sort();
      assert.deepEqual(identities(restored.rows), idsBefore);
      const historyAfter = restored.rows.filter((row) => row.section === "history").map(({ stream, sequence, id, value }) => ({ stream, sequence, id, value }));
      const historyBefore = [...before.history].sort((left, right) => left.sequence - right.sequence);
      assert.deepEqual(historyAfter.slice(0, historyBefore.length), historyBefore);
      assert.deepEqual(restored.objects.map((object) => object.digest), before.objects.map((object) => object.digest).sort());
      for (const object of restored.objects) {
        assert.equal(sha256Hex(object.bytes), object.digest);
        assert.deepEqual(Buffer.from(object.bytes), Buffer.from(source.objects.get(object.digest)));
      }
      const tombstonesAfter = restored.rows.filter((row) => row.section === "tombstones").map(({ kind, id, value }) => ({ kind, id, value }));
      assert.deepEqual(tombstonesAfter, [...before.tombstones].sort((left, right) => left.kind.localeCompare(right.kind)));
      assert.equal(result.effects.scheduler, "disabled");
      assert.equal(result.effects.runner, "disabled");
      assert.equal(result.effects.outbox, "paused");
      assert.equal(result.effects.provider, "disabled");
      assert.equal(result.effects.delivery, "disabled");
      assert.deepEqual(restored.effects, result.effects);
      // The original todo ended with assertZeroEffects(target.counters), which also demands zero d1 and object
      // writes. A restore must write its target, and this harness routes those writes through the same counting
      // fake (the original apply todo already expected d1Writes to grow on apply). So the data counters are pinned
      // to exactly the verified plan instead: one d1 write per restored row plus the effect fence, one object write
      // per archived object, nothing more. Every effect counter must stay at zero, as before.
      assert.equal(target.fake.counters.d1Writes, restored.rows.length + 1);
      assert.equal(target.fake.counters.objectWrites, before.objects.length);
      assertNoEffectCalls(target.fake.counters);
      assertZeroEffects({ ...target.fake.counters, d1Writes: 0, objectWrites: 0 });
      const [stored] = target.evidence.results.values();
      assert.equal(stored.outcome, "applied");
      assert.deepEqual([stored.restoredRecordCount, stored.restoredObjectCount], [12, 2]);
    }
  } finally { await vite.close(); }
});

// 07-10: restore replay is deterministic. The same archive restored into two
// separate clean compatible targets yields identical rows, objects, and effect
// fence; each target restores once, and every restored effect stays off.
test("the same archive restored into two clean targets yields identical rows, objects, and effect fence", async () => {
  const { vite, archive, verifier, restore } = await loadRecovery();
  try {
    const { bytes } = await createArchive(archive);
    const restoreInto = async () => {
      const target = restoreHarness(bytes);
      const dry = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: target.ports });
      assert.equal(dry.status, "verified");
      const result = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports });
      assert.equal(result.status, "restored");
      const replay = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports });
      assert.equal(replay.status, "already_restored");
      assertNoEffectCalls(target.fake.counters);
      return { result, restored: await target.target.readRestored(), counters: { ...target.fake.counters } };
    };
    const left = await restoreInto();
    const right = await restoreInto();
    assert.deepEqual(right.restored.rows, left.restored.rows);
    assert.deepEqual(right.restored.objects.map(({ digest, bytes: data }) => [digest, Buffer.from(data).toString("base64")]), left.restored.objects.map(({ digest, bytes: data }) => [digest, Buffer.from(data).toString("base64")]));
    assert.deepEqual(right.restored.effects, left.restored.effects);
    assert.deepEqual(left.restored.effects, { scheduler: "disabled", runner: "disabled", outbox: "paused", provider: "disabled", delivery: "disabled" });
    assert.equal(right.result.archiveDigest, left.result.archiveDigest);
    assert.deepEqual([right.result.recordCount, right.result.objectCount], [left.result.recordCount, left.result.objectCount]);
    assert.deepEqual(right.counters, left.counters, "each target took the same writes exactly once");
  } finally { await vite.close(); }
});

test("a lock or nonce race and a partial write roll back to the clean target with a minimized outcome", async () => {
  const { vite, archive, verifier, restore } = await loadRecovery();
  try {
    const { bytes } = await createArchive(archive);
    const target = restoreHarness(bytes);
    const dry = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: target.ports });
    let writes = 0;
    target.fake.ports.d1.write = async () => { writes += 1; if (writes === 3) throw new Error("injected_failure"); };
    const result = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports });
    assert.equal(result.status, "rolled_back");
    assert.equal(result.target.clean, true);
    assert.deepEqual(Object.keys(result).sort(), ["status", "target", "reason", "auditRef"].sort());
    assert.equal(result.reason, "partial_write");
    assert.equal((await target.target.readState()).empty, true);
    assert.equal(JSON.stringify(result).includes("injected_failure"), false, "the outcome is minimized");
    assertZeroEffects(target.fake.counters);
    const [rolledBack] = target.evidence.results.values();
    assert.deepEqual([rolledBack.outcome, rolledBack.restoredRecordCount, rolledBack.restoredObjectCount], ["rolled_back", 0, 0]);
    // The nonce is consumed: the same dry run cannot be replayed into a restore.
    target.fake.ports.d1.write = async () => {};
    const replay = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports });
    assert.equal(replay.status, "refused");

    // Two racing applies with one dry run: exactly one restores.
    const racing = restoreHarness(bytes);
    const raceDry = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: racing.ports });
    const outcomes = await Promise.all([0, 1].map(() => restore.applyRestore({ archiveRef: "archive-1", dryRunId: raceDry.dryRunId, nonce: raceDry.nonce, passphrase: PASSPHRASE, ports: racing.ports })));
    // The loser is refused while the winner holds the lock, or sees the finished restore as already restored.
    assert.equal(outcomes.filter((outcome) => outcome.status === "restored").length, 1);
    assert.ok(outcomes.every((outcome) => ["restored", "refused", "already_restored"].includes(outcome.status)));
    assert.equal(racing.evidence.locks.size, 1);
    assert.equal(racing.evidence.results.size, 1);

    // A readback that does not match the verified archive, or an unfenced effect, also rolls back.
    for (const [name, corrupt] of [
      ["readback mismatch", (restored) => ({ ...restored, rows: restored.rows.slice(1) })],
      ["readback object bytes", (restored) => ({
        ...restored,
        objects: restored.objects.map((object, index) => (index === 0 ? { ...object, bytes: Uint8Array.from(object.bytes, (byte, at) => (at === 0 ? byte ^ 1 : byte)) } : object)),
      })],
      ["readback missing object", (restored) => ({ ...restored, objects: restored.objects.slice(1) })],
      ["effect fence", (restored) => ({ ...restored, effects: { ...restored.effects, scheduler: "enabled" } })],
    ]) {
      const corrupted = restoreHarness(bytes);
      const read = corrupted.target.readRestored;
      corrupted.target.readRestored = async () => corrupt(await read());
      const corruptedDry = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports: corrupted.ports });
      const outcome = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: corruptedDry.dryRunId, nonce: corruptedDry.nonce, passphrase: PASSPHRASE, ports: corrupted.ports });
      assert.equal(outcome.status, "rolled_back", name);
      assert.equal(outcome.reason, "restore_verification_failed", name);
      assert.equal(outcome.target.clean, true, name);
      assertNoEffectCalls(corrupted.fake.counters);
    }
  } finally { await vite.close(); }
});

test("on the 0023 repository: archive, dry run, lock, and result are recorded once, with schedules and effects disabled and no passphrase stored", async (t) => {
  const fixture = await createD1Fixture("workspace-recovery-0023");
  t.after(() => fixture.dispose());
  const { database } = fixture;
  await applyMigrationsThrough(database, "0023_handoff_recovery.sql");
  for (const [id, owner] of [[SOURCE_WS, "source-owner"], [TARGET_WS, "target-owner"]]) {
    await database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)")
      .bind(id, "Synthetic recovery workspace", owner, NOW - 60 * MINUTE, NOW - 60 * MINUTE).run();
  }
  const load = (path) => fixture.vite.ssrLoadModule(new URL(path, import.meta.url).pathname);
  const [repositoryModule, archive, verifier, restore] = await Promise.all([
    load("../domain/handoff-recovery-repository.ts"), load("../domain/workspace-archive.ts"), load("../domain/restore-verifier.ts"), load("../domain/restore-apply.ts"),
  ]);
  const repository = (workspaceId, ownerSubject) => repositoryModule.createD1HandoffRecoveryRepository(database, { workspaceId, ownerSubject, now: () => NOW });

  const harness = archiveHarness({ authority: freshAuthority(SOURCE_WS, { ownerSubject: "source-owner" }) });
  harness.ports.evidence = repository(SOURCE_WS, "source-owner");
  const created = await archive.createWorkspaceArchive({ passphrase: PASSPHRASE, ports: harness.ports });
  const archiveRow = await database.prepare("SELECT * FROM recovery_archives WHERE id=?").bind(created.archiveId).first();
  assert.equal(archiveRow.workspace_id, SOURCE_WS);
  assert.equal(archiveRow.kdf, "scrypt");
  assert.equal(archiveRow.cipher, "aes-256-gcm");
  assert.equal(archiveRow.format_version, ARCHIVE_FORMAT);
  assert.equal(archiveRow.manifest_digest, created.envelope.manifestDigest, "the repository and the envelope agree on the manifest digest");
  assert.equal(JSON.parse(archiveRow.kdf_parameters_json).N, 131072);
  const delivery = await database.prepare("SELECT * FROM handoff_delivery_events WHERE subject_id=?").bind(created.archiveId).first();
  assert.equal(delivery.event_kind, "issued");
  assert.equal(Number(delivery.expires_at), created.deliveryExpiresAt);

  const fake = fakeTarget();
  const target = memoryRestoreTarget(fake);
  const evidence = repository(TARGET_WS, "target-owner");
  const ports = {
    now: () => NOW,
    authority: { current: async () => freshAuthority(TARGET_WS, { ownerSubject: "target-owner" }) },
    archives: { readArchive: async (ref) => ref === "archive-1" ? { bytes: textEncoder.encode(JSON.stringify(created.envelope)), expiresAt: created.deliveryExpiresAt } : null },
    target,
    evidence,
  };
  const dry = await verifier.dryRunRestore({ archiveRef: "archive-1", passphrase: PASSPHRASE, ports });
  assert.equal(dry.status, "verified");
  assert.equal(fake.counters.d1Writes + fake.counters.objectWrites, 0);
  const applied = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports });
  assert.equal(applied.status, "restored");
  const again = await restore.applyRestore({ archiveRef: "archive-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports });
  assert.equal(again.status, "already_restored");

  const count = async (table) => Number((await database.prepare(`SELECT COUNT(*) count FROM ${table} WHERE workspace_id=?`).bind(TARGET_WS).first()).count);
  assert.deepEqual(
    [await count("recovery_dry_runs"), await count("recovery_restore_locks"), await count("recovery_restore_results")],
    [1, 1, 1],
  );
  const result = await database.prepare("SELECT * FROM recovery_restore_results WHERE workspace_id=?").bind(TARGET_WS).first();
  assert.deepEqual([result.outcome, Number(result.schedules_enabled), Number(result.effects_enabled)], ["applied", 0, 0]);
  const dryRow = await database.prepare("SELECT * FROM recovery_dry_runs WHERE workspace_id=?").bind(TARGET_WS).first();
  assert.equal(dryRow.source_workspace_id, SOURCE_WS);
  assert.equal(dryRow.archive_manifest_digest, created.envelope.manifestDigest);
  // Nothing in any 0023 table holds the passphrase, the nonce, or a raw contact value.
  const tables = (await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'recovery_%' OR name LIKE 'handoff_%')").all()).results.map((row) => row.name);
  for (const table of tables) {
    const dump = JSON.stringify((await database.prepare(`SELECT * FROM "${table}"`).all()).results);
    for (const value of [PASSPHRASE, dry.nonce, "person@example.test"]) assert.equal(dump.includes(value), false, `${table} must not hold ${value === PASSPHRASE ? "the passphrase" : value}`);
  }
  assertNoEffectCalls(fake.counters);
});

test("the archive and restore modules reach no network, storage, scheduler, provider, or browser surface, and import only built-in crypto", async () => {
  for (const path of ["../domain/workspace-archive.ts", "../domain/restore-verifier.ts", "../domain/restore-apply.ts", "../domain/ports/workspace-archive.ts"]) {
    const text = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\b(fetch|XMLHttpRequest|WebSocket|process\.env|localStorage|sessionStorage|indexedDB|console\.)\b/u, path);
    assert.doesNotMatch(text, /(?:tel|mailto):/u, path);
    assert.doesNotMatch(text, /contact-eligibility|preparation\//u, path);
    const imports = [...text.matchAll(/^\s*import\b[^;]*?from\s+["']([^"']+)["']/gmu)].map((match) => match[1]);
    for (const specifier of imports) assert.match(specifier, /^(?:node:crypto|\.{1,2}\/[\w./-]+)$/u, `${path} imports ${specifier}`);
  }
  const archiveText = await readFile(new URL("../domain/workspace-archive.ts", import.meta.url), "utf8");
  assert.match(archiveText, /from "node:crypto"/u, "scrypt comes from the runtime's built-in crypto");
  assert.doesNotMatch(archiveText, /PBKDF2/u);
});

test("archive creation needs recent owner reauthentication and a server-derived workspace; client scope is ignored", { todo: "07-09 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/handoff-recovery-handler.ts");
  try {
    const target = fakeTarget();
    const stale = await module.handleCreateArchive({ session: { workspaceId: "workspace-a", reauthAt: "2020-01-01T00:00:00.000Z" }, body: { workspaceId: "workspace-b" }, ports: target.ports });
    assert.equal(stale.status, 403);
    const fresh = await module.handleCreateArchive({ session: { workspaceId: "workspace-a", reauthAt: new Date().toISOString() }, body: { workspaceId: "workspace-b" }, ports: target.ports });
    assert.equal(fresh.scope.workspaceId, "workspace-a");
    assertZeroEffects(target.counters);
  } finally { await vite.close(); }
});
