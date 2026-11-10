import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

// 07-03 contract: encrypted portable-workspace recovery.
// Live cases bind to domain/local-portable-backup.ts and only exercise its
// refusal paths, so no archive is created and no key is derived. Cases for the
// archive, restore and handoff-recovery modules that do not exist yet
// (07-07 crypto choice, 07-08 archive/dry run/restore, 07-09 handler) are
// `todo`. Nothing here installs crypto, creates an archive, or reaches a host.
// The todo bodies state proposed module paths and call shapes; the later plans
// may rename them, and the invariants are the part that binds.

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

// -- 07-07 / 07-08 / 07-09: modules that do not exist yet --------------------

async function loadModule(path) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, module: await vite.ssrLoadModule(new URL(path, import.meta.url).pathname) };
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

test("the archive manifest is canonical and ordered: records, history, audit, objects, dependencies, export artifacts, and tombstones; no secrets", { todo: "07-08 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const manifest = await module.buildArchiveManifest({ workspaceId: "workspace-source" });
    assert.deepEqual(Object.keys(manifest.sections), [
      "records", "decisions", "history", "audit", "objects", "dependencies", "exportArtifacts", "tombstones",
    ]);
    assert.doesNotMatch(JSON.stringify(manifest), /passphrase|password|secret|token|credential/iu);
    assert.equal(manifest.digest, (await module.buildArchiveManifest({ workspaceId: "workspace-source" })).digest);
  } finally { await vite.close(); }
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

test("the passphrase exists only in operation memory: never in D1/R2 metadata, audit, browser storage, logs, or fixture output", { todo: "07-08 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const seen = [];
    const ports = { ...fakeTarget().ports, log: (line) => seen.push(String(line)) };
    ports.d1.write = async (row) => { seen.push(JSON.stringify(row)); };
    ports.objects.put = async (key, bytes, meta) => { seen.push(JSON.stringify(meta)); void key; void bytes; };
    ports.audit.record = async (event) => { seen.push(JSON.stringify(event)); };
    await module.createWorkspaceArchive({ workspaceId: "workspace-source", passphrase: PASSPHRASE, ports });
    assert.ok(seen.length > 0);
    for (const line of seen) assert.equal(line.includes(PASSPHRASE), false);
  } finally { await vite.close(); }
});

test("a wrong passphrase, tampered ciphertext, and a truncated archive are one indistinguishable untrusted failure", { todo: "07-07 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-archive.ts");
  try {
    const archive = await module.createWorkspaceArchive({ workspaceId: "workspace-source", passphrase: PASSPHRASE, ports: fakeTarget().ports });
    const failures = [];
    for (const attempt of [
      () => module.openWorkspaceArchive(archive, "wrong-passphrase-0000"),
      () => module.openWorkspaceArchive({ ...archive, ciphertext: archive.ciphertext.slice(0, -4) }, PASSPHRASE),
      () => module.openWorkspaceArchive({ ...archive, tag: "AAAA" }, PASSPHRASE),
    ]) {
      await assert.rejects(attempt(), (error) => { failures.push(error.message); return true; });
    }
    assert.equal(new Set(failures).size, 1);
    assert.equal(archive.kdf.memoryHard, true, "07-07 owner decision: memory-hard KDF");
  } finally { await vite.close(); }
});

test("dry run refuses unauthorized, expired, tampered, missing-object, non-clean, version-skewed, and invariant-failed input with zero target writes and zero effect calls", { todo: "07-08 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-restore.ts");
  try {
    const cases = [
      ["unauthorized", { authorized: false }],
      ["expired authorization", { authorizationExpired: true }],
      ["tampered archive", { tampered: true }],
      ["missing object", { missingObjectDigest: DIGEST }],
      ["non-clean target", { clean: false }],
      ["version skew", { schemaVersion: "prospector/portable-workspace-schema/v0" }],
      ["invariant failure", { invariantFailure: "unique_violation" }],
    ];
    for (const [name, patch] of cases) {
      const target = fakeTarget(patch);
      const result = await module.dryRunRestore({ archiveRef: "archive-1", target: target.state, ports: target.ports });
      assert.equal(result.status, "refused", name);
      assert.equal(target.counters.d1Writes, 0, name);
      assert.equal(target.counters.objectWrites, 0, name);
      assertZeroEffects(target.counters);
    }
  } finally { await vite.close(); }
});

test("a successful dry run is read-only: a compatible clean target shows a nonce and writes nothing", { todo: "07-08 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-restore.ts");
  try {
    const target = fakeTarget();
    const result = await module.dryRunRestore({ archiveRef: "archive-1", target: target.state, ports: target.ports });
    assert.equal(result.status, "verified");
    assert.match(result.nonce, /^[a-f0-9]{32,}$/u);
    assert.equal(target.counters.d1Writes, 0);
    assert.equal(target.counters.objectWrites, 0);
    assertZeroEffects(target.counters);
    // Client-supplied target scope is never accepted as authority.
    const forged = await module.dryRunRestore({ archiveRef: "archive-1", target: { ...target.state, workspaceId: "workspace-other" }, clientTargetScope: "workspace-other", ports: target.ports });
    assert.equal(forged.status, "refused");
  } finally { await vite.close(); }
});

test("restore applies only after a current successful dry run with a matching nonce, once, and idempotently", { todo: "07-08 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-restore.ts");
  try {
    const target = fakeTarget();
    const dry = await module.dryRunRestore({ archiveRef: "archive-1", target: target.state, ports: target.ports });
    const noDryRun = await module.applyRestore({ archiveRef: "archive-1", nonce: "f".repeat(32), target: target.state, ports: target.ports });
    assert.equal(noDryRun.status, "refused");
    assert.equal(target.counters.d1Writes, 0);
    const applied = await module.applyRestore({ archiveRef: "archive-1", nonce: dry.nonce, target: target.state, ports: target.ports });
    assert.equal(applied.status, "restored");
    const writesAfterFirst = target.counters.d1Writes;
    const again = await module.applyRestore({ archiveRef: "archive-1", nonce: dry.nonce, target: { ...target.state, clean: false, archiveDigest: applied.archiveDigest }, ports: target.ports });
    assert.equal(again.status, "already_restored");
    assert.equal(target.counters.d1Writes, writesAfterFirst);
  } finally { await vite.close(); }
});

test("replay keeps stable IDs, append-only history, hashes, digests, and tombstones, and every effect starts paused or disabled", { todo: "07-08 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-restore.ts");
  try {
    for (const hierarchy of [
      { companyId: "company-main", marketPlayId: "play-main" },
      { companyId: "company-logistics", marketPlayId: "play-port-operators" },
    ]) {
      const target = fakeTarget();
      const result = await module.restoreForTest({ hierarchy, target: target.state, ports: target.ports });
      assert.deepEqual(result.idsAfter, result.idsBefore);
      assert.deepEqual(result.historyAfter.slice(0, result.historyBefore.length), result.historyBefore);
      assert.deepEqual(result.digestsAfter, result.digestsBefore);
      assert.deepEqual(result.tombstonesAfter, result.tombstonesBefore);
      assert.equal(result.effects.scheduler, "disabled");
      assert.equal(result.effects.runner, "disabled");
      assert.equal(result.effects.outbox, "paused");
      assert.equal(result.effects.provider, "disabled");
      assert.equal(result.effects.delivery, "disabled");
      assertZeroEffects(target.counters);
    }
  } finally { await vite.close(); }
});

test("a lock or nonce race and a partial write roll back to the clean target with a minimized outcome", { todo: "07-08 not implemented" }, async () => {
  const { vite, module } = await loadModule("../domain/workspace-restore.ts");
  try {
    const target = fakeTarget();
    let writes = 0;
    target.ports.d1.write = async () => { writes += 1; if (writes === 3) throw new Error("injected_failure"); };
    const result = await module.applyRestore({ archiveRef: "archive-1", nonce: "n".repeat(32), target: target.state, ports: target.ports, simulate: "partial_write" });
    assert.equal(result.status, "rolled_back");
    assert.equal(result.target.clean, true);
    assert.deepEqual(Object.keys(result).sort(), ["status", "target", "reason", "auditRef"].sort());
    assertZeroEffects(target.counters);
  } finally { await vite.close(); }
});
