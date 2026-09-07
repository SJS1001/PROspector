import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The canonical gate is `node scripts/run-test-suite.mjs`. These cases pin its
// argument handling and its stop/continue behaviour so a future change cannot
// quietly turn a failing file into a passing run, retry a file, or drop the
// serial execution and macOS drain window the D1 fixtures depend on.

const siteRoot = fileURLToPath(new URL("..", import.meta.url));
const runnerPath = "scripts/run-test-suite.mjs";
// `site/.local/` is already git-ignored, so a fixture left behind by an
// interrupted run is never committed, and it is outside `tests/` so the
// runner's own directory discovery can never pick one up.
const disposableRoot = fileURLToPath(new URL("../.local/", import.meta.url));

test("the default run stops at the first failing file and names the files it did not run", async () => {
  await withFixtures(async (workspace) => {
    const files = await workspace.write([
      ["a-pass", "pass"],
      ["b-fail", "fail"],
      ["c-pass", "pass"],
    ]);

    const result = await runRunner(files);

    assert.equal(result.code, 1, "a failing file must still fail the run");
    assert.deepEqual(await workspace.executed(), ["a-pass", "b-fail"], "the run must stop before the third file");
    assert.match(result.stdout, /3 files · 1 passed · 1 failed · 1 not run/u);
    assert.match(result.stdout, new RegExp(`PASS\\s+${escapeRegExp(files[0])}`, "u"));
    assert.match(result.stdout, new RegExp(`FAIL\\(1\\)\\s+${escapeRegExp(files[1])}`, "u"));
    assert.match(result.stdout, new RegExp(`NOT RUN\\s+${escapeRegExp(files[2])}`, "u"));
    assert.match(result.stdout, /Stopped at the first failing file/u);
  });
});

test("--no-bail continues past a failure, still exits non-zero, and reports each file once", async () => {
  await withFixtures(async (workspace) => {
    const files = await workspace.write([
      ["a-pass", "pass"],
      ["b-fail", "fail"],
      ["c-pass", "pass"],
      ["d-fail", "fail"],
    ]);

    const result = await runRunner(["--no-bail", ...files]);

    assert.equal(result.code, 1, "continuing past a failure must not mask it");
    assert.deepEqual(
      await workspace.executed(),
      ["a-pass", "b-fail", "c-pass", "d-fail"],
      "every file must run exactly once, in order, with no retry",
    );
    assert.match(result.stdout, /4 files · 2 passed · 2 failed/u);
    assert.doesNotMatch(result.stdout, /not run/u);
    assert.doesNotMatch(result.stdout, /Stopped at the first failing file/u);
  });
});

test("several failures still produce one non-zero aggregate exit", async () => {
  await withFixtures(async (workspace) => {
    const files = await workspace.write([
      ["a-fail", "fail"],
      ["b-fail", "fail"],
    ]);

    const result = await runRunner(["--no-bail", ...files]);

    assert.notEqual(result.code, 0, "a run with any failure must exit non-zero");
    assert.match(result.stdout, /2 files · 0 passed · 2 failed/u);
    for (const file of files) {
      assert.match(result.stdout, new RegExp(`FAIL\\(1\\)\\s+${escapeRegExp(file)}`, "u"));
    }
  });
});

test("only the first failing status is kept as the aggregate exit code", async () => {
  // `node --test` exits 1 for every kind of failure, so a second distinct
  // status cannot be produced through a fixture. Pin the rule at the source
  // instead of asserting an exit code the runner can never observe.
  const source = await readFile(new URL(`../${runnerPath}`, import.meta.url), "utf8");

  assert.match(source, /if \(firstFailingStatus === 0\) firstFailingStatus = status;/u);
  assert.match(source, /process\.exitCode = firstFailingStatus;/u);
});

test("a selected passing set runs only those files and exits zero", async () => {
  await withFixtures(async (workspace) => {
    const files = await workspace.write([
      ["a-pass", "pass"],
      ["c-pass", "pass"],
      ["z-fail", "fail"],
    ]);
    const selected = [files[0], files[1]];

    const result = await runRunner(selected);

    assert.equal(result.code, 0);
    assert.deepEqual(await workspace.executed(), ["a-pass", "c-pass"], "an unselected file must not run");
    assert.match(result.stdout, /2 files · 2 passed · 0 failed/u);
    assert.doesNotMatch(result.stdout, /FAIL|NOT RUN/u);
    assert.doesNotMatch(result.stdout, /tests\//u, "a selection must not fall back to directory discovery");
  });
});

test("`--` ends option parsing so a later argument is treated as a path", async () => {
  await withFixtures(async (workspace) => {
    const files = await workspace.write([["a-pass", "pass"]]);

    const result = await runRunner(["--", ...files]);

    assert.equal(result.code, 0);
    assert.deepEqual(await workspace.executed(), ["a-pass"]);
  });
});

test("an unknown option is rejected as a usage error before any file runs", async () => {
  await withFixtures(async (workspace) => {
    const files = await workspace.write([["a-pass", "pass"]]);

    const result = await runRunner(["--bail", ...files]);

    assert.equal(result.code, 2, "a malformed invocation must be distinguishable from a suite failure");
    assert.match(result.stderr, /Unknown option: --bail/u);
    assert.match(result.stderr, /--no-bail/u, "the usage text must name the supported flag");
    assert.deepEqual(await workspace.executed(), [], "no file may run after a usage error");
  });
});

test("a requested file that does not exist is rejected before any file runs", async () => {
  await withFixtures(async (workspace) => {
    const files = await workspace.write([["a-pass", "pass"]]);
    const missing = `${workspace.relativeDirectory}/absent.fixture.mjs`;

    const result = await runRunner([...files, missing]);

    assert.equal(result.code, 2);
    assert.match(result.stderr, new RegExp(`No such test file: ${escapeRegExp(missing)}`, "u"));
    assert.deepEqual(await workspace.executed(), [], "a missing path must fail closed, not part-way through");
  });
});

test("an empty path argument is rejected", async () => {
  const result = await runRunner([""]);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /cannot be empty/u);
});

test("a run launched inside a test context still executes its files", async () => {
  // These cases spawn the runner from within `node --test`. Node refuses to run
  // test files when it sees an inherited test context and exits zero for the
  // files it skipped, so without clearing that marker the runner would report a
  // pass for work that never ran.
  assert.ok(process.env.NODE_TEST_CONTEXT, "this case must itself run inside a test context");

  await withFixtures(async (workspace) => {
    const files = await workspace.write([["a-fail", "fail"]]);

    const result = await runRunner(files);

    assert.equal(result.code, 1, "a skipped file must never be reported as a pass");
    assert.deepEqual(await workspace.executed(), ["a-fail"]);
  });
});

test("the runner keeps serial execution and the macOS drain window", async () => {
  const source = await readFile(new URL(`../${runnerPath}`, import.meta.url), "utf8");

  assert.match(source, /--test-concurrency=1/u, "files must keep running one test at a time");
  assert.match(source, /process\.platform === "darwin"/u);
  assert.match(source, /fixtureWindowCount \+ fixtureCount > 12/u);
  assert.match(source, /delay\(30_000\)/u);

  // A file the run never reached must not consume the drain window either, so
  // the not-run branch has to short-circuit ahead of the fixture scan.
  const stopBranch = source.indexOf("if (stoppedAfterFailure)");
  const fixtureScan = source.indexOf("await countD1Fixtures(testFile)");
  assert.ok(stopBranch > 0 && fixtureScan > 0);
  assert.ok(stopBranch < fixtureScan, "the not-run branch must precede the drain accounting");
});

const FIXTURE_BODIES = {
  pass: 'test("synthetic pass", () => {});',
  fail: 'test("synthetic failure", () => { throw new Error("synthetic failure"); });',
};

/**
 * Builds a disposable fixture directory, hands it to the case, and removes it
 * afterwards whether or not the case passed. Each fixture records that it ran
 * by appending its own name to one marker file, so a skipped file and a
 * silently retried file are both observable.
 */
async function withFixtures(run) {
  await mkdir(disposableRoot, { recursive: true });
  const directory = await mkdtemp(`${disposableRoot}run-test-suite-`);
  const marker = `${directory}/executed.log`;
  const relativeDirectory = `.local/${directory.slice(disposableRoot.length)}`;

  const workspace = {
    relativeDirectory,
    async write(entries) {
      const paths = [];
      for (const [name, kind] of entries) {
        const body = FIXTURE_BODIES[kind];
        assert.ok(body, `unknown fixture kind: ${kind}`);
        await writeFile(
          `${directory}/${name}.fixture.mjs`,
          [
            'import test from "node:test";',
            'import { appendFileSync } from "node:fs";',
            `appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(`${name}\n`)});`,
            body,
            "",
          ].join("\n"),
        );
        paths.push(`${relativeDirectory}/${name}.fixture.mjs`);
      }
      return paths;
    },
    async executed() {
      try {
        return (await readFile(marker, "utf8")).split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
  };

  try {
    await run(workspace);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runRunner(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...args], {
      cwd: siteRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`the runner terminated by ${signal}`));
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
