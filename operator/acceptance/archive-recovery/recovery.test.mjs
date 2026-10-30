import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, realpathSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url));
function run(dir, mode, file = "", variant = "") {
  const r = spawnSync(process.execPath, [worker, mode, file, variant], {
    cwd: root,
    env: { PATH: process.env.PATH, NODE_ENV: "test", DATABASE_URL: "", OPERATOR_DATA_DIR: dir },
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(r.error);
  if (variant === "kill") {
    assert.equal(r.signal, "SIGKILL", r.stderr);
    assert.ok(existsSync(`${file}.interrupted`));
    rmdirSync(join(dir, ".database.lock"));
  } else assert.equal(r.status, 0, `${mode}/${variant}: ${r.stdout}\n${r.stderr}`);
}
function scratch(fn) {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "prospector-archive-recovery-")));
  try {
    fn(d);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}
function snapshot(d, f) {
  run(d, "snapshot", f);
  return readFileSync(f, "utf8");
}
test(
  "durable 19-table semantic roundtrip into empty DB, authority reset and restart",
  { timeout: 180000 },
  () =>
    scratch((base) => {
      const source = join(base, "source"),
        target = join(base, "target"),
        archive = join(base, "archive.json"),
        out = join(base, "out.json");
      run(source, "seed");
      run(source, "export", archive);
      const original = JSON.parse(readFileSync(archive));
      assert.equal(Object.keys(original.tables).length, 19);
      for (const [t, rows] of Object.entries(original.tables))
        assert.ok(rows.length, `missing ${t}`);
      assert.doesNotMatch(
        readFileSync(archive, "utf8"),
        /excluded-secret|excluded-active-lease|source-grant|schedule_enabled|operator_secrets|expires_at/,
      );
      const empty = JSON.parse(snapshot(target, join(base, "empty.json")));
      for (const rows of Object.values(empty)) assert.equal(rows.length, 0);
      run(target, "restore", archive);
      run(target, "export", out);
      const actual = JSON.parse(readFileSync(out)),
        expected = structuredClone(original.tables);
      for (const r of expected.outreach_packages) if (r.status === "approved") r.status = "draft";
      for (const r of expected.outreach_messages) {
        if (["approved", "sending"].includes(r.status)) r.status = "blocked";
        r.acknowledged = false;
      }
      expected.operating_state[0].monthly_budget_cents = 0;
      const audits = actual.tables.delivery_events.filter((e) =>
        e.kind.startsWith("archive_restore_"),
      );
      assert.ok(audits.some((e) => e.kind === "archive_restore_package"));
      assert.ok(audits.some((e) => e.kind === "archive_restore_message"));
      actual.tables.delivery_events = actual.tables.delivery_events.filter(
        (e) => !e.kind.startsWith("archive_restore_"),
      );
      assert.deepEqual(actual.tables, expected);
      const disk = JSON.parse(snapshot(target, join(base, "disk.json")));
      assert.ok(
        disk.outreach_messages.every(
          (m) => m.lease_token === null && m.lease_until === null && !m.acknowledged,
        ),
      );
      assert.ok(
        disk.enrichment_grants.every(
          (g) => g.spent_at !== null && g.expires_at === null && g.status !== "active",
        ),
      );
      assert.equal(disk.operator_secrets.length, 0);
      assert.equal(snapshot(target, join(base, "again.json")), JSON.stringify(disk));
    }),
);
test(
  "rejections, SQL failure and SIGKILL each preserve canonical full DB after restart",
  { timeout: 360000 },
  () =>
    scratch((base) => {
      const dir = join(base, "data"),
        archive = join(base, "archive.json");
      run(dir, "seed");
      run(dir, "export", archive);
      const before = snapshot(dir, join(base, "before.json"));
      for (const v of [
        "version",
        "digest",
        "reference",
        "duplicate",
        "foreign-owner",
        "foreign-collision",
        "truncated",
        "erase-handoff",
        "erase-consumed",
        "sql-failure",
        "kill",
      ]) {
        run(dir, "restore", archive, v);
        assert.equal(
          snapshot(dir, join(base, `${v}.json`)),
          before,
          `${v}: durable rows/history/suppression/authority changed`,
        );
      }
    }),
);

test(
  "restore retains local opt-outs omitted by backup and disables populated authority durably",
  { timeout: 90000 },
  () =>
    scratch((base) => {
      const dir = join(base, "data"),
        archive = join(base, "archive.json");
      run(dir, "seed");
      run(dir, "export", archive);
      const before = JSON.parse(snapshot(dir, join(base, "before.json")));
      assert.ok(before.enrichment_grants.some((g) => g.status === "active"));
      assert.ok(
        before.operator_secrets.some((s) => s.name === "schedule_enabled" && s.value === "1"),
      );
      run(dir, "restore", archive, "omit-suppression");
      const after = JSON.parse(snapshot(dir, join(base, "after.json")));
      assert.deepEqual(after.suppressions, before.suppressions);
      assert.deepEqual(
        after.delivery_events.filter((e) => e.kind === "manual_handoff"),
        before.delivery_events.filter((e) => e.kind === "manual_handoff"),
      );
      assert.ok(after.enrichment_grants.every((g) => g.spent_at !== null && g.expires_at === null));
      assert.ok(
        after.outreach_messages.every(
          (m) => !m.acknowledged && m.lease_token === null && m.lease_until === null,
        ),
      );
      assert.equal(after.operator_secrets.find((s) => s.name === "schedule_enabled").value, "0");
      assert.deepEqual(
        after.operator_secrets.filter((s) => s.name !== "schedule_enabled"),
        before.operator_secrets.filter((s) => s.name !== "schedule_enabled"),
      );
    }),
);
