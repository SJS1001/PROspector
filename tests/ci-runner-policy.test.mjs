import assert from "node:assert/strict";
import test from "node:test";

import { inspectWorkflow, verifyRepository } from "../scripts/verify-ci-runner-policy.mjs";

const workflowWith = (runsOn) => `jobs:\n  test:\n    runs-on: ${runsOn}\n    steps: []\n`;

test("current repository satisfies the CI runner policy", async () => {
  assert.deepEqual(await verifyRepository(new URL("..", import.meta.url).pathname), []);
});

test("accepts only static literal label sets containing exact self-hosted", () => {
  assert.deepEqual(inspectWorkflow(workflowWith("self-hosted")), []);
  assert.deepEqual(inspectWorkflow(workflowWith("[self-hosted, linux, x64]")), []);
  assert.deepEqual(
    inspectWorkflow("jobs:\n  test:\n    runs-on:\n      - self-hosted\n      - local\n    steps: []\n"),
    [],
  );
  assert.deepEqual(inspectWorkflow(workflowWith("'self-hosted'")), []);
  assert.deepEqual(inspectWorkflow("jobs:\n  test:\n    'runs-on': self-hosted\n    steps: []\n"), []);
});

test("structurally recognizes quoted and escaped runs-on keys", () => {
  for (const key of ["'runs-on'", '"runs-on"', '"runs\\u002don"']) {
    const violations = inspectWorkflow(`jobs:\n  test:\n    ${key}: "ubuntu-latest"\n    steps: []\n`);
    assert.ok(violations.some((violation) => violation.includes("exact self-hosted label")));
    assert.ok(violations.some((violation) => violation.includes("GitHub-hosted runner label")));
  }
});

test("rejects exact and mixed GitHub-hosted runner labels", () => {
  for (const label of ["ubuntu-latest", "ubuntu-24.04-arm", "windows-2025", "macos-15-intel"]) {
    const violations = inspectWorkflow(workflowWith(label));
    assert.ok(violations.some((violation) => violation.includes("exact self-hosted label")));
    assert.ok(violations.some((violation) => violation.includes("GitHub-hosted runner label")));
  }
  assert.deepEqual(inspectWorkflow(workflowWith("[self-hosted, ubuntu-latest]")), [
    "workflow:3: GitHub-hosted runner label is prohibited",
  ]);
});

test("rejects labels that merely contain the self-hosted text", () => {
  assert.deepEqual(inspectWorkflow(workflowWith("not-self-hosted")), [
    "workflow:3: runs-on must contain the exact self-hosted label",
  ]);
});

test("rejects matrix fallback and expression-based runner selection", () => {
  for (const dynamic of [
    "${{ matrix.runner || 'self-hosted' }}",
    "${{ inputs.runner }}",
    "${{ format('{0}', 'self-hosted') }}",
    "[self-hosted, ${{ matrix.arch }}]",
  ]) {
    const violations = inspectWorkflow(workflowWith(dynamic));
    assert.equal(violations.length, 1);
    assert.match(violations[0], /runs-on must be a static literal|invalid YAML/);
  }
});

test("rejects YAML aliases, anchors, and escaped runner labels", () => {
  assert.deepEqual(
    inspectWorkflow("x-runner: &runner self-hosted\njobs:\n  test:\n    runs-on: *runner\n    steps: []\n"),
    ["workflow:4: runs-on must be a static literal label or label list"],
  );
  assert.deepEqual(inspectWorkflow(workflowWith("&runner self-hosted")), [
    "workflow:3: runs-on must be a static literal label or label list",
  ]);
  assert.deepEqual(inspectWorkflow(workflowWith('"self\\u002dhosted"')), [
    "workflow:3: runs-on must be a static literal label or label list",
  ]);
});

test("rejects external and repository-local reusable-workflow jobs", () => {
  for (const target of [
    "owner/repository/.github/workflows/reusable.yml@main",
    "./.github/workflows/reusable.yml",
  ]) {
    const workflow = `jobs:\n  delegated:\n    uses: ${target}\n`;
    assert.deepEqual(inspectWorkflow(workflow), [
      "workflow:3: reusable-workflow job delegated is prohibited",
    ]);
  }
});

test("rejects missing runner declarations and malformed YAML", () => {
  assert.deepEqual(inspectWorkflow("jobs:\n  test:\n    steps: []\n"), [
    "workflow:3: job test must declare runs-on",
  ]);
  assert.ok(inspectWorkflow("jobs: [\n")[0].includes("invalid YAML"));
});
