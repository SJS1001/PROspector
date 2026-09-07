import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { CANONICAL_MIGRATION_COUNT, CANONICAL_MIGRATION_HEAD } from "../scripts/migration-chain.mjs";

const root = resolve(import.meta.dirname, "..");
const state = ".local/test-greenfield-baseline-state";
const statePath = resolve(root, state);

test("greenfield attestation covers the whole checked chain and claims nothing about the original project", async () => {
  await rm(statePath, { recursive: true, force: true });
  try {
    const output = execFileSync(process.execPath, ["scripts/greenfield-baseline.mjs", "--reset", "--state", state], { cwd: root, encoding: "utf8" });
    const report = JSON.parse(output.trim());
    assert.deepEqual(report, {
      status: "ready",
      baselineKind: "greenfield-local",
      migrationSource: "checked-repository-chain",
      appliedMigrations: CANONICAL_MIGRATION_COUNT,
      checkedChainMigrations: CANONICAL_MIGRATION_COUNT,
      coversCheckedChain: true,
      migrationHead: CANONICAL_MIGRATION_HEAD,
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
        contacts: 0,
        contacts_projection_generations: 0,
        person_discovery_runs: 0,
        person_discovery_run_events: 0,
        person_discovery_candidates: 0,
        person_discovery_provenance: 0,
        person_discovery_owner_decisions: 0,
        prospect_contact_role_relevance: 0,
        contact_verification_intents: 0,
      },
    });
    // The attestation must actually prove the Contacts/Person Discovery schema,
    // not merely tolerate its absence.
    for (const table of ["contacts", "person_discovery_runs", "person_discovery_candidates", "contact_verification_intents", "prospect_contact_role_relevance"]) {
      assert.ok(table in report.rowCounts, `${table} must be attested by the greenfield baseline`);
    }
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
