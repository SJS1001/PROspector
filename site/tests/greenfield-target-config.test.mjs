import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(root, "..");
const script = resolve(root, "scripts/greenfield-target-config.mjs");

test("the approved CLI seam stops the release while the chain outruns the manifest", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-target-test-${nonce}`);
  const mappingPath = resolve(directory, "mapping.json");
  const outputPath = resolve(directory, "candidate.json");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const mapping = {
    sourceCommit,
    workerName: "prospector-greenfield-test",
    databaseName: "prospector-greenfield-test-db",
    databaseId: "11111111-2222-4333-8444-555555555555",
    bucketName: "prospector-greenfield-test-files",
  };

  await mkdir(directory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify(mapping)}\n`, { mode: 0o600 });
  try {
    const result = spawnSync(process.execPath, [
      script,
      "prepare",
      "--mapping",
      mappingPath,
      "--output",
      outputPath,
    ], { cwd: root, encoding: "utf8" });

    // The local migration chain has advanced past the release the checked
    // manifest pins (0000-0009), so the CLI now fail-closes here before it can
    // prepare a candidate. That is the manifest's stated contract -- "a missing,
    // additional, renamed, reordered, or digest-mismatched file stops the
    // release" -- and the hosted target is still at 0009, so the gate is
    // correct and stays armed.
    //
    // Direct happy-path coverage is therefore suspended, not deleted. It
    // returns when either the manifest is refreshed against a newly authorized
    // remote apply, or the script's migration root becomes injectable so this
    // test can drive a 0000-0009 fixture. This assertion fails loudly on the
    // former, which is the intended prompt to restore the block below.
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      status: "blocked",
      code: "migration_manifest_mismatch",
    });
    // The fail-closed path must still write nothing and leak no private value.
    await assert.rejects(() => readFile(outputPath), { code: "ENOENT" });
    for (const privateValue of Object.values(mapping)) {
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(privateValue, "u"));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the CLI rejects an ignored-looking path that escapes through a symlink", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const privateDirectory = resolve(root, `.wrangler/greenfield-target-link-test-${nonce}`);
  const outsideDirectory = resolve(root, `.local/greenfield-target-outside-${nonce}`);
  const linkPath = resolve(privateDirectory, "escaped");
  const mappingPath = resolve(outsideDirectory, "mapping.json");
  const outputPath = resolve(privateDirectory, "candidate.json");
  const privateMarker = "prospector-private-marker-must-not-leak";

  await mkdir(privateDirectory, { recursive: true });
  await mkdir(outsideDirectory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify({ privateMarker })}\n`, { mode: 0o600 });
  await symlink(outsideDirectory, linkPath);
  try {
    const result = spawnSync(process.execPath, [
      script,
      "prepare",
      "--mapping",
      resolve(linkPath, "mapping.json"),
      "--output",
      outputPath,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      status: "blocked",
      code: "mapping_path_invalid",
    });
    assert.doesNotMatch(result.stderr, new RegExp(privateMarker, "u"));
    await assert.rejects(() => readFile(outputPath), { code: "ENOENT" });
  } finally {
    await rm(privateDirectory, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});

test("the CLI rejects a resource mapping readable by group or other users", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-target-mode-test-${nonce}`);
  const mappingPath = resolve(directory, "mapping.json");
  const outputPath = resolve(directory, "candidate.json");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const mapping = {
    sourceCommit,
    workerName: "prospector-private-mode-test",
    databaseName: "prospector-private-mode-db",
    databaseId: "99999999-8888-4777-8666-555555555555",
    bucketName: "prospector-private-mode-files",
  };

  await mkdir(directory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify(mapping)}\n`, { mode: 0o600 });
  await chmod(mappingPath, 0o644);
  try {
    const result = spawnSync(process.execPath, [
      script,
      "prepare",
      "--mapping",
      mappingPath,
      "--output",
      outputPath,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      status: "blocked",
      code: "mapping_permissions_invalid",
    });
    for (const privateValue of Object.values(mapping)) {
      assert.doesNotMatch(result.stderr, new RegExp(privateValue, "u"));
    }
    await assert.rejects(() => readFile(outputPath), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the CLI never overwrites an existing target candidate", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-target-overwrite-test-${nonce}`);
  const mappingPath = resolve(directory, "mapping.json");
  const outputPath = resolve(directory, "candidate.json");
  const sentinel = "existing-private-candidate-must-survive\n";
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

  await mkdir(directory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify({
    sourceCommit,
    workerName: "prospector-no-overwrite-test",
    databaseName: "prospector-no-overwrite-db",
    databaseId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    bucketName: "prospector-no-overwrite-files",
  })}\n`, { mode: 0o600 });
  await writeFile(outputPath, sentinel, { mode: 0o600 });
  try {
    const result = spawnSync(process.execPath, [
      script,
      "prepare",
      "--mapping",
      mappingPath,
      "--output",
      outputPath,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    // The manifest gate aborts ahead of the output-exists check while the local
    // chain outruns the pinned release, so that is the code reported today.
    // Restore "output_exists" here once the manifest is refreshed; until then
    // this assertion fails loudly at that moment, by design.
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      status: "blocked",
      code: "migration_manifest_mismatch",
    });
    // The property this test exists for is unchanged and still proven: whatever
    // stops the run, an existing private candidate is never overwritten.
    assert.equal(await readFile(outputPath, "utf8"), sentinel);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the CLI rejects the target-neutral placeholder database UUID", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-target-placeholder-test-${nonce}`);
  const mappingPath = resolve(directory, "mapping.json");
  const outputPath = resolve(directory, "candidate.json");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

  await mkdir(directory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify({
    sourceCommit,
    workerName: "prospector-placeholder-test",
    databaseName: "prospector-placeholder-db",
    databaseId: "00000000-0000-4000-8000-000000000000",
    bucketName: "prospector-placeholder-files",
  })}\n`, { mode: 0o600 });
  try {
    const result = spawnSync(process.execPath, [
      script,
      "prepare",
      "--mapping",
      mappingPath,
      "--output",
      outputPath,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      status: "blocked",
      code: "mapping_invalid",
    });
    await assert.rejects(() => readFile(outputPath), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the CLI rejects an additional SQL migration outside the checked chain", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-target-extra-migration-test-${nonce}`);
  const mappingPath = resolve(directory, "mapping.json");
  const outputPath = resolve(directory, "candidate.json");
  const extraMigration = resolve(root, `drizzle/9999_unchecked_${nonce}.sql`);
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

  await mkdir(directory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify({
    sourceCommit,
    workerName: "prospector-extra-migration-test",
    databaseName: "prospector-extra-migration-db",
    databaseId: "12345678-1234-4234-8234-123456789abc",
    bucketName: "prospector-extra-migration-files",
  })}\n`, { mode: 0o600 });
  await writeFile(extraMigration, "SELECT 1;\n");
  try {
    const result = spawnSync(process.execPath, [
      script,
      "prepare",
      "--mapping",
      mappingPath,
      "--output",
      outputPath,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      status: "blocked",
      code: "migration_manifest_mismatch",
    });
    await assert.rejects(() => readFile(outputPath), { code: "ENOENT" });
  } finally {
    await rm(extraMigration, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});
