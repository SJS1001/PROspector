import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const testsDirectory = new URL("../tests/", import.meta.url);
const requestedFiles = process.argv.slice(2);
const testFiles = (requestedFiles.length > 0
  ? requestedFiles
  : (await readdir(testsDirectory))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join("tests", name)))
  .sort((left, right) => testWeight(left) - testWeight(right) || left.localeCompare(right));

if (testFiles.length === 0) throw new Error("No test files were found.");

let fixtureWindowCount = 0;
for (const testFile of testFiles) {
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
  if (status !== 0) process.exitCode = status;
  if (status !== 0) break;
}

function runTestFile(testFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-concurrency=1", testFile],
      { cwd: process.cwd(), stdio: "inherit" },
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
