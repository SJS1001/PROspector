import assert from "node:assert/strict";
import test from "node:test";

import { inspectWorkflow, verifyRepository } from "../scripts/verify-ci-runner-policy.mjs";

test("current repository satisfies the CI runner policy", async () => {
  assert.deepEqual(await verifyRepository(new URL("..", import.meta.url).pathname), []);
});

test("accepts scalar, flow-list, and block-list self-hosted declarations", () => {
  const workflow = `
jobs:
  scalar:
    runs-on: self-hosted
  flow:
    runs-on: [self-hosted, linux, x64]
  block:
    runs-on:
      - self-hosted
      - local
`;
  assert.deepEqual(inspectWorkflow(workflow), []);
});

test("rejects GitHub-hosted runner labels", () => {
  for (const label of ["ubuntu-latest", "windows-2025", "macos-15"]) {
    const violations = inspectWorkflow(`jobs:\n  test:\n    runs-on: ${label}\n`);
    assert.ok(violations.some((violation) => violation.includes("must statically include self-hosted")));
    assert.ok(violations.some((violation) => violation.includes("GitHub-hosted runner label")));
  }
});

test("rejects a GitHub-hosted label mixed with self-hosted", () => {
  const violations = inspectWorkflow("jobs:\n  test:\n    runs-on: [self-hosted, ubuntu-latest]\n");
  assert.deepEqual(violations, ["workflow:3: GitHub-hosted runner label is prohibited"]);
});

test("rejects quoted runs-on keys and inline job mappings", () => {
  assert.deepEqual(inspectWorkflow("jobs:\n  test:\n    'runs-on': ubuntu-latest\n"), [
    "workflow:3: runs-on must statically include self-hosted",
    "workflow:3: GitHub-hosted runner label is prohibited",
  ]);
  assert.deepEqual(inspectWorkflow("jobs:\n  test: { runs-on: windows-latest }\n"), [
    "workflow:2: runs-on must statically include self-hosted",
    "workflow:2: GitHub-hosted runner label is prohibited",
  ]);
});

test("fails closed for dynamic-only runner selection", () => {
  const violations = inspectWorkflow("jobs:\n  test:\n    runs-on: ${{ matrix.runner }}\n");
  assert.deepEqual(violations, ["workflow:3: runs-on must statically include self-hosted"]);
});

test("ignores comments and reusable-workflow jobs without runs-on", () => {
  const workflow = `
# runs-on: ubuntu-latest
jobs:
  delegated:
    uses: owner/repository/.github/workflows/reusable.yml@main
`;
  assert.deepEqual(inspectWorkflow(workflow), []);
});
