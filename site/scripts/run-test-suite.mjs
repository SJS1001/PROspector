import { readFile, readdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const USAGE = [
  "Usage: node scripts/run-test-suite.mjs [--no-bail] [--] [test file ...]",
  "",
  "  --no-bail   Run every remaining file after a failure instead of stopping at",
  "              the first one. The run still exits non-zero; no file is retried",
  "              and no failure is masked.",
  "  --          End of options. Every later argument is treated as a file path.",
  "",
  "Paths are resolved relative to the site/ directory. With no paths, every",
  "tests/*.test.mjs file is run.",
].join("\n");

// Usage errors exit 2 so a caller can tell a malformed invocation apart from a
// genuine suite failure, which keeps the failing file's own exit code.
const USAGE_EXIT_CODE = 2;

const childEnvironment = testRunnerChildEnvironment();
const options = parseArguments(process.argv.slice(2));

const testsDirectory = new URL("../tests/", import.meta.url);
const testFiles = (options.requestedFiles.length > 0
  ? options.requestedFiles
  : (await readdir(testsDirectory))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join("tests", name)))
  .sort((left, right) => testWeight(left) - testWeight(right) || left.localeCompare(right));

if (testFiles.length === 0) throw new Error("No test files were found.");

// A requested path that does not exist can never pass, and letting it reach the
// fixture scan below surfaces as an unhandled ENOENT rejection instead of a
// usable message. Reject it as a malformed invocation before anything runs.
for (const testFile of options.requestedFiles) {
  try {
    await access(new URL(`../${testFile}`, import.meta.url));
  } catch {
    exitWithUsageError(`No such test file: ${testFile}`);
  }
}

const results = [];
let firstFailingStatus = 0;
let stoppedAfterFailure = false;
let fixtureWindowCount = 0;

for (const testFile of testFiles) {
  // Once a failure has stopped the run in the default fail-fast mode, the
  // remaining files are recorded as not run. They are never reported as passing
  // and the throttle below is not consulted for them, exactly as before.
  if (stoppedAfterFailure) {
    results.push({ testFile, outcome: "not-run", status: null });
    continue;
  }

  // Miniflare's D1 proxy uses many short-lived loopback connections. macOS
  // retains them for 2× its 15-second TCP MSL. Drain adaptively before the
  // next fixture-heavy suite would exceed the tested safe window.
  const fixtureCount = await countD1Fixtures(testFile);
  if (process.platform === "darwin"
    && fixtureWindowCount > 0
    && fixtureWindowCount + fixtureCount > 12) {
    await delay(30_000);
    fixtureWindowCount = 0;
  }
  const status = await runTestFile(testFile);
  fixtureWindowCount += fixtureCount;
  results.push({ testFile, outcome: status === 0 ? "pass" : "fail", status });
  if (status !== 0) {
    if (firstFailingStatus === 0) firstFailingStatus = status;
    if (!options.continueAfterFailure) stoppedAfterFailure = true;
  }
}

process.exitCode = firstFailingStatus;
reportResults(results, options.continueAfterFailure);

/**
 * Separates the opt-in flags from the file paths. An unrecognised option is a
 * malformed invocation rather than a file name, because silently treating it as
 * a path produces a missing-file crash several steps later.
 */
function parseArguments(argv) {
  const requestedFiles = [];
  let continueAfterFailure = false;
  let endOfOptions = false;

  for (const argument of argv) {
    if (!endOfOptions && argument === "--") {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && argument === "--no-bail") {
      continueAfterFailure = true;
      continue;
    }
    if (!endOfOptions && argument.startsWith("-")) {
      exitWithUsageError(`Unknown option: ${argument}`);
    }
    if (argument === "") exitWithUsageError("A test file path cannot be empty.");
    requestedFiles.push(argument);
  }

  return { continueAfterFailure, requestedFiles };
}

function exitWithUsageError(message) {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(USAGE_EXIT_CODE);
}

/**
 * Prints one line per file so a run's outcome is readable without scrolling the
 * inherited child output, and so a stopped run states which files it skipped
 * instead of leaving their status implicit.
 */
function reportResults(fileResults, continueAfterFailure) {
  const passed = fileResults.filter((result) => result.outcome === "pass").length;
  const failed = fileResults.filter((result) => result.outcome === "fail").length;
  const notRun = fileResults.filter((result) => result.outcome === "not-run").length;

  const counts = [
    `${fileResults.length} ${fileResults.length === 1 ? "file" : "files"}`,
    `${passed} passed`,
    `${failed} failed`,
  ];
  if (notRun > 0) counts.push(`${notRun} not run`);

  const lines = ["", `Test suite results: ${counts.join(" · ")}`];
  for (const result of fileResults) {
    lines.push(`  ${label(result).padEnd(9)} ${result.testFile}`);
  }
  if (failed > 0 && !continueAfterFailure) {
    lines.push("");
    lines.push("Stopped at the first failing file. Re-run with --no-bail to execute the"
      + " remaining files in the same order; failures are still reported and never retried.");
  }
  lines.push("");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function label(result) {
  if (result.outcome === "pass") return "PASS";
  if (result.outcome === "fail") return `FAIL(${result.status})`;
  return "NOT RUN";
}

function runTestFile(testFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-concurrency=1", testFile],
      { cwd: process.cwd(), env: childEnvironment, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${testFile} terminated by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

/**
 * `node --test` refuses to run files when it detects that it is already inside
 * a test context, and it exits zero for the files it skipped. Clearing that
 * marker means a run launched from within another test still executes its
 * files instead of reporting a silent pass.
 */
function testRunnerChildEnvironment() {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  return environment;
}

function testWeight(testFile) {
  // Miniflare leaves short-lived loopback sockets in TIME_WAIT on macOS.
  // Run the fixture-heavy suites last so later lightweight suites never need
  // to allocate ports after the system's ephemeral range has been exercised.
  if (testFile.endsWith("market-discovery-repository.test.mjs")) return 2;
  if (testFile.endsWith("product-readiness-repository.test.mjs")) return 1;
  return 0;
}

async function countD1Fixtures(testFile) {
  const source = await readFile(new URL(`../${testFile}`, import.meta.url), "utf8");
  return source.match(/\bcreateD1Fixture\s*\(/g)?.length ?? 0;
}
