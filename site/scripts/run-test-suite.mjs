import { readdir } from "node:fs/promises";
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

for (const testFile of testFiles) {
  // Miniflare's D1 proxy uses many short-lived loopback connections. macOS
  // retains them for 2× its 15-second TCP MSL, so drain the prior suites
  // before the final fixture-heavy file instead of exhausting 16,383 ports.
  if (process.platform === "darwin" && testFile.endsWith("market-discovery-repository.test.mjs")) {
    await delay(30_000);
  }
  const status = await runTestFile(testFile);
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
