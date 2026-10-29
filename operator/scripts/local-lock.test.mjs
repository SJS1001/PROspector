import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  linkSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireDatabaseLock, isDatabaseLocked } from "./local-data.mjs";

function child(dir) {
  const source = `import { acquireDatabaseLock } from ${JSON.stringify(new URL("./local-data.mjs", import.meta.url).href)};
    try { acquireDatabaseLock(process.argv[1]); process.send('held'); setInterval(() => {}, 1000); }
    catch (error) { process.send(error.code || error.message); process.exitCode = 2; }`;
  const proc = spawn(process.execPath, ["--input-type=module", "-e", source, dir], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const exited = once(proc, "exit");
  const result = once(proc, "message").then(([message]) => message);
  return { proc, result, exited };
}
function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "prospector-lock-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("same-process probes cannot release the owner's OS lock", { timeout: 10000 }, async (t) => {
  const dir = scratch(t);
  const release = acquireDatabaseLock(dir);
  t.after(release);
  assert.throws(() => acquireDatabaseLock(dir), /locked/);
  assert.equal(isDatabaseLocked(dir), true);
  const contender = child(dir);
  assert.equal(await contender.result, "OPERATOR_DATABASE_LOCKED");
  await contender.exited;
  release();
  assert.equal(isDatabaseLocked(dir), false);
  assert.equal(statSync(join(dir, ".database.lock")).mode & 0o777, 0o600);
});
test(
  "simultaneous starts have one owner; SIGKILL releases its lock without cleanup",
  { timeout: 10000 },
  async (t) => {
    const dir = scratch(t);
    const contenders = Array.from({ length: 6 }, () => child(dir));
    t.after(() => contenders.forEach(({ proc }) => proc.kill("SIGKILL")));
    const results = await Promise.all(contenders.map((c) => c.result));
    assert.equal(results.filter((r) => r === "held").length, 1);
    assert.equal(results.filter((r) => r === "OPERATOR_DATABASE_LOCKED").length, 5);
    const owner = contenders[results.indexOf("held")];
    assert.equal(isDatabaseLocked(dir), true);
    owner.proc.kill("SIGKILL");
    await Promise.all(contenders.map((c) => c.exited));
    assert.equal(isDatabaseLocked(dir), false);
    const restarted = child(dir);
    t.after(() => restarted.proc.kill("SIGKILL"));
    assert.equal(await restarted.result, "held");
    restarted.proc.kill("SIGKILL");
    await restarted.exited;
  },
);
test("unsafe files and legacy directory locks fail closed", (t) => {
  const base = scratch(t);
  for (const kind of ["symlink", "hardlink", "public", "legacy"]) {
    const dir = join(base, kind);
    mkdirSync(dir);
    const path = join(dir, ".database.lock");
    if (kind === "legacy") mkdirSync(path);
    else if (kind === "public") writeFileSync(path, "", { mode: 0o644 });
    else {
      const target = join(base, `${kind}-target`);
      writeFileSync(target, "", { mode: 0o600 });
      if (kind === "symlink") symlinkSync(target, path);
      else linkSync(target, path);
    }
    assert.throws(() => acquireDatabaseLock(dir), /Unsafe|Legacy/);
  }
});
