import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const exitCode of [23, 0]) {
  test(`public test launcher invalidates stale PASS before unit exit ${exitCode}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "prospector-test-launcher-"));
    try {
      copyFileSync(new URL("./test.mjs", import.meta.url), join(dir, "test.mjs"));
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          type: "module",
          scripts: { "test:unit": "node unit-fixture.mjs" },
        }),
      );
      writeFileSync(join(dir, "last-run.json"), '{"status":"PASS","cases":["stale"]}');
      writeFileSync(
        join(dir, "unit-fixture.mjs"),
        `import assert from 'node:assert/strict';
         import {readFileSync} from 'node:fs';
         const evidence = JSON.parse(readFileSync(new URL('./last-run.json', import.meta.url)));
         assert.equal(evidence.status, 'BLOCKED_UNIT_CHECKS');
         assert.equal(evidence.workflowExecuted, false);
         assert.deepEqual(evidence.cases, []);
         process.exit(${exitCode});`,
      );
      writeFileSync(
        join(dir, "run.mjs"),
        "import {writeFileSync} from 'node:fs'; writeFileSync(new URL('./runtime-reached',import.meta.url), 'reached');",
      );
      const result = spawnSync(process.execPath, [join(dir, "test.mjs")], {
        encoding: "utf8",
        env: { PATH: process.env.PATH },
        timeout: 30000,
      });
      assert.equal(result.status, exitCode === 0 ? 0 : 1, result.stderr);
      assert.equal(existsSync(join(dir, "runtime-reached")), exitCode === 0);
      const evidence = JSON.parse(readFileSync(join(dir, "last-run.json"), "utf8"));
      assert.equal(evidence.status, "BLOCKED_UNIT_CHECKS");
      assert.equal(evidence.workflowExecuted, false);
      assert.deepEqual(evidence.cases, []);
      assert.deepEqual(evidence.snapshots, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
