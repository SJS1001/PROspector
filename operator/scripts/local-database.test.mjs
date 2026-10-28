import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, statSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ensurePrivateDataDir,
  writePrivateFile,
  readPrivateFile,
  acquireDatabaseLock,
} from "./local-data.mjs";

if (process.argv[2] === "child") {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
  });
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  try {
    const sql = await db.getSql();
    if (process.argv[3] === "write") {
      await sql`create table if not exists local_test (value text)`;
      await sql`insert into local_test values (${"fictional"})`;
      await assert.rejects(
        sql.transaction(async (tx) => {
          await tx`insert into local_test values (${"rolled back"})`;
          throw new Error("rollback");
        }),
      );
      await assert.rejects(
        sql.transaction(async (tx) => {
          await tx`insert into local_test values (${"failed migration"})`;
          await tx.query("invalid fictional migration");
        }),
      );
      const migrations = await sql`select count(*) as n from _migrations`;
      assert.ok(migrations[0].n > 0);
    } else {
      assert.deepEqual(await sql`select value from local_test`, [{ value: "fictional" }]);
    }
  } finally {
    await db.closeDatabase();
    await server.close();
  }
} else {
  test("durable database survives a separate process and transactions roll back", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "operator-db-")));
    try {
      for (const mode of ["write", "read"]) {
        const result = spawnSync(process.execPath, [import.meta.filename, "child", mode], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: "", OPERATOR_DATA_DIR: dir },
          encoding: "utf8",
          timeout: 90000,
        });
        assert.equal(result.status, 0, result.stderr);
      }
      assert.equal(statSync(join(dir, "database")).mode & 0o777, 0o700);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("private files and symlink paths are rejected", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "operator-private-")));
    const prior = process.env.OPERATOR_DATA_DIR;
    try {
      process.env.OPERATOR_DATA_DIR = join(dir, "data");
      ensurePrivateDataDir();
      const release = acquireDatabaseLock();
      assert.throws(acquireDatabaseLock, /locked/);
      release();
      writePrivateFile("owner", "fictional");
      assert.equal(readPrivateFile("owner").toString(), "fictional");
      assert.equal(statSync(join(dir, "data", "owner")).mode & 0o777, 0o600);
      symlinkSync(join(dir, "data"), join(dir, "link"));
      process.env.OPERATOR_DATA_DIR = join(dir, "link");
      assert.throws(ensurePrivateDataDir, /Unsafe/);
    } finally {
      if (prior === undefined) delete process.env.OPERATOR_DATA_DIR;
      else process.env.OPERATOR_DATA_DIR = prior;
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
