import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const testsDirectory = new URL("../tests/", import.meta.url);
const requestedFiles = process.argv.slice(2);
const testFiles = requestedFiles.length > 0
  ? requestedFiles
  : (await readdir(testsDirectory))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join("tests", name));

if (testFiles.length === 0) throw new Error("No test files were found.");

for (const testFile of testFiles) {
  // Each Miniflare fixture owns native loopback services. A fresh test-runner
  // parent per file releases those services before the next fixture-heavy
  // suite starts, while preserving the existing serial assertions in a file.
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
