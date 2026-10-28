import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const nativeProbe = `const r = process.binding("spawn_sync").spawn({
  file: process.execPath, args: [process.execPath, "-e", "process.exit(23)"],
  stdio: [{type:"ignore"},{type:"ignore"},{type:"ignore"}], envPairs: []
}); if(r.status !== 23) throw new Error("native probe failed");`;

test("JS instrumentation demonstrably does not contain native subprocess execution", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", new URL("./instrumentation.mjs", import.meta.url).href, "-e", nativeProbe],
    { encoding: "utf8", env: { PATH: process.env.PATH } },
  );
  assert.equal(result.status, 0, result.stderr);
});

for (const payload of [
  nativeProbe,
  'process.binding("process_wrap"); process.exit(23)',
  'new (require("node:worker_threads").Worker)("process.exit(23)", {eval:true});',
])
  test(
    "guard refuses admission before native/process/worker payload evaluation: " +
      payload.slice(0, 40),
    () => {
      const dir = mkdtempSync(join(tmpdir(), "prospector-boundary-"));
      try {
        const marker = join(dir, "payload-ran");
        const result = spawnSync(
          process.execPath,
          [
            "--import",
            new URL("./guard.mjs", import.meta.url).href,
            "-e",
            `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran"); ${payload}`,
          ],
          { encoding: "utf8", env: { PATH: process.env.PATH, ACCEPTANCE_NATIVE_CONTAINMENT: "1" } },
        );
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /ACCEPTANCE_NATIVE_CONTAINMENT_UNAVAILABLE/);
        assert.equal(existsSync(marker), false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

test("runner fails before orchestrator import and replaces stale PASS evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "prospector-preflight-"));
  try {
    for (const file of ["run.mjs", "native-boundary.mjs"])
      copyFileSync(new URL("./" + file, import.meta.url), join(dir, file));
    writeFileSync(join(dir, "last-run.json"), '{"status":"PASS"}');
    writeFileSync(join(dir, "orchestrator.mjs"), 'throw new Error("ORCHESTRATOR_REACHED");');
    const result = spawnSync(process.execPath, [join(dir, "run.mjs")], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, ACCEPTANCE_NATIVE_CONTAINMENT: "1" },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stderr, /ORCHESTRATOR_REACHED/);
    const evidence = JSON.parse(readFileSync(join(dir, "last-run.json"), "utf8"));
    assert.equal(evidence.status, "BLOCKED_NATIVE_CONTAINMENT");
    assert.equal(evidence.workflowExecuted, false);
    assert.deepEqual(evidence.cases, []);
    assert.deepEqual(evidence.snapshots, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
