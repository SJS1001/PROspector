import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const testsDirectory = new URL("../tests/", import.meta.url);
const caseIsolatedFiles = new Set([
  "tests/market-discovery-repository.test.mjs",
]);
const requestedFiles = process.argv.slice(2);
const testFiles = (requestedFiles.length > 0
  ? requestedFiles
  : (await readdir(testsDirectory))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join("tests", name)))
  .sort((left, right) => testWeight(left) - testWeight(right) || left.localeCompare(right));

if (testFiles.length === 0) throw new Error("No test files were found.");

for (const testFile of testFiles) {
  // Each Miniflare fixture owns native loopback services. Most suites need a
  // fresh parent per file; a fixture-heavy suite needs one per test case to
  // stay below the macOS/Node loopback lifecycle ceiling.
  const status = caseIsolatedFiles.has(testFile)
    ? await runIsolatedTestCases(testFile)
    : await runTestFile(testFile);
  if (status !== 0) process.exitCode = status;
  if (status !== 0) break;
}

async function runIsolatedTestCases(testFile) {
  const source = await readFile(new URL(`../${testFile}`, import.meta.url), "utf8");
  const declarations = source.match(/^test\(/gm) ?? [];
  const names = [...source.matchAll(/^test\(\s*(["'])(.*?)\1\s*,/gm)]
    .map((match) => match[2]);

  if (names.length === 0 || names.length !== declarations.length || new Set(names).size !== names.length) {
    throw new Error(`${testFile} case isolation could not account for every unique top-level test.`);
  }

  for (const name of names) {
    const status = await runTestFile(testFile, `^${escapeRegularExpression(name)}$`);
    if (status !== 0) return status;
  }
  return 0;
}

function runTestFile(testFile, namePattern) {
  const argumentsList = ["--test", "--test-concurrency=1"];
  if (namePattern) argumentsList.push(`--test-name-pattern=${namePattern}`);
  argumentsList.push(testFile);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      argumentsList,
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

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
