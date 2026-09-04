import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const state = ".local/test-greenfield-baseline-state";
const statePath = resolve(root, state);

test("greenfield attestation builds only a fresh empty local baseline and claims nothing about the original project", async () => {
  await rm(statePath, { recursive: true, force: true });
  try {
    const output = execFileSync(process.execPath, ["scripts/greenfield-baseline.mjs", "--reset", "--state", state], { cwd: root, encoding: "utf8" });
    const report = JSON.parse(output.trim());
    assert.deepEqual(report, {
      status: "ready",
      baselineKind: "greenfield-local",
      migrationSource: "checked-repository-chain",
      originalProjectEvidence: "waived-unavailable",
      originalProjectMigrationClaim: "none",
      hostedEvidence: false,
      disposable: true,
      rowCounts: {
        workspaces: 0,
        phase_activation_gates: 0,
        product_discovery_runs: 0,
        prospects: 0,
        enrichment_grants: 0,
        contact_point_observations: 0,
        suppressions: 0,
      },
    });
  } finally {
    await rm(statePath, { recursive: true, force: true });
  }
});

test("greenfield attestation requires explicit reset and rejects state outside site/.local", () => {
  const missingReset = spawnSync(process.execPath, ["scripts/greenfield-baseline.mjs", "--state", state], { cwd: root, encoding: "utf8" });
  assert.notEqual(missingReset.status, 0);
  assert.match(missingReset.stderr, /greenfield_reset_required/);

  const traversal = spawnSync(process.execPath, ["scripts/greenfield-baseline.mjs", "--reset", "--state", "../unsafe"], { cwd: root, encoding: "utf8" });
  assert.notEqual(traversal.status, 0);
  assert.match(traversal.stderr, /greenfield_state_path_invalid/);

  const nested = spawnSync(process.execPath, ["scripts/greenfield-baseline.mjs", "--reset", "--state", ".local/nested/state"], { cwd: root, encoding: "utf8" });
  assert.notEqual(nested.status, 0);
  assert.match(nested.stderr, /greenfield_state_path_invalid/);
});

test("greenfield attestation rejects a symlinked disposable-state target", async () => {
  const link = resolve(root, ".local/test-greenfield-baseline-link");
  const target = resolve(root, ".local/test-greenfield-baseline-link-target");
  await mkdir(resolve(root, ".local"), { recursive: true });
  await mkdir(target, { recursive: true });
  await rm(link, { recursive: true, force: true });
  try {
    await symlink(target, link);
    const result = spawnSync(process.execPath, ["scripts/greenfield-baseline.mjs", "--reset", "--state", ".local/test-greenfield-baseline-link"], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /greenfield_state_path_symlink/);
  } finally {
    await rm(link, { force: true });
    await rm(target, { recursive: true, force: true });
  }
});
