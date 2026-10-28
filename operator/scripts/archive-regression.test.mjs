import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Include the named TypeScript cases in the canonical scripts test glob.
// Direct entry execution reports their positive case counts; a missing driver,
// subprocess restriction or test failure remains a failure rather than a skip.
for (const file of ["archive-request.test.ts", "archive.test.ts"]) {
  test(`workspace archive: ${file}`, { timeout: 120_000 }, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        fileURLToPath(new URL(`../src/lib/server/${file}`, import.meta.url)),
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        encoding: "utf8",
        timeout: 110_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /tests\s+[1-9][0-9]*/, "The child must execute named cases");
  });
}
