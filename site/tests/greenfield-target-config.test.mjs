import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(root, "..");
const script = resolve(root, "scripts/greenfield-target-config.mjs");

/** The release chain: what the candidate may apply to the deployed target. */
function releaseChain() {
  const manifest = readFileSync(
    resolve(repositoryRoot, ".planning/phases/02-consensus-knowledge-and-commercial-model/02-99-MIGRATION-MANIFEST.md"),
    "utf8",
  );
  // Only the rows under the pinned release heading. The manifest also carries a
  // "Checked ahead of the release chain" table, and counting those as released
  // would assert exactly the widening the release pin exists to prevent.
  const section = manifest.split(/^## /mu).find((part) => part.startsWith("Ordered release chain"));
  if (section === undefined) throw new Error("release chain section missing");
  return section.split("\n")
    .filter((line) => /^\| \d{4} \|/u.test(line))
    .map((line) => line.split("|")[2].trim().replaceAll("`", ""));
}

/** The checked chain: every migration present in the working tree. */
function checkedMigrations() {
  return readdirSync(resolve(root, "drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
}

test("the approved CLI seam prepares one private fail-closed target candidate", async () => {
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

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const receipt = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(receipt).sort(), [
      "buildDigest",
      "candidateDigest",
      "checkedAheadCount",
      "checkedAheadDigest",
      "code",
      "expectedSchemaDigest",
      "migrationManifestDigest",
      "ok",
      "releaseMigrationCount",
      "sourceDigest",
      "status",
    ]);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.status, "prepared");
    assert.equal(receipt.code, "greenfield_target_candidate_ready");
    assert.match(receipt.buildDigest, /^[a-f0-9]{64}$/u);
    assert.match(receipt.expectedSchemaDigest, /^[a-f0-9]{64}$/u);
    // The release chain and the checked chain are reported separately: the
    // working tree may run ahead while later migrations await authorization.
    assert.equal(receipt.releaseMigrationCount, releaseChain().length);
    assert.equal(receipt.checkedAheadCount, checkedMigrations().length - releaseChain().length);
    assert.match(receipt.checkedAheadDigest, /^[a-f0-9]{64}$/u);
    for (const privateValue of Object.values(mapping)) {
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(privateValue, "u"));
    }

    const candidate = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(candidate.name, mapping.workerName);
    assert.equal(candidate.main, "../../dist/server/index.js");
    assert.deepEqual(candidate.compatibility_flags, ["nodejs_compat"]);
    assert.equal(candidate.workers_dev, false);
    assert.equal(candidate.preview_urls, false);
    assert.deepEqual(candidate.triggers, { crons: [] });
    assert.deepEqual(candidate.assets, { directory: "../../dist/client" });
    assert.deepEqual(candidate.d1_databases, [{
      binding: "DB",
      database_name: mapping.databaseName,
      database_id: mapping.databaseId,
      migrations_dir: "../../drizzle",
      migrations_pattern: `../../drizzle/{${releaseChain().join(",")}}`,
    }]);
    // The candidate must not expose an unreleased migration to the operator's
    // `wrangler d1 migrations apply`, so the pattern is an explicit list rather
    // than a directory wildcard.
    assert.doesNotMatch(candidate.d1_databases[0].migrations_pattern, /\*/u);
    for (const ahead of checkedMigrations().slice(releaseChain().length)) {
      assert.equal(candidate.d1_databases[0].migrations_pattern.includes(ahead), false, ahead);
    }
    assert.deepEqual(candidate.r2_buckets, [{
      binding: "FILES",
      bucket_name: mapping.bucketName,
    }]);
    for (const forbidden of [
      "routes", "route", "vars", "services", "queues", "send_email",
      "workflows", "pipelines", "durable_objects", "ai", "browser",
      "logfwdr", "tail_consumers", "unsafe", "env",
    ]) {
      assert.equal(Object.hasOwn(candidate, forbidden), false, forbidden);
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
    assert.deepEqual(JSON.parse(result.stderr), {
      ok: false,
      status: "blocked",
      code: "output_exists",
    });
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


test("the CLI accepts a contiguous unreleased migration but keeps it out of the candidate", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-target-ahead-test-${nonce}`);
  const mappingPath = resolve(directory, "mapping.json");
  const outputPath = resolve(directory, "candidate.json");
  const nextOrder = String(checkedMigrations().length).padStart(4, "0");
  const aheadMigration = resolve(root, `drizzle/${nextOrder}_unreleased_candidate.sql`);
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

  await mkdir(directory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify({
    sourceCommit,
    workerName: "prospector-ahead-test",
    databaseName: "prospector-ahead-db",
    databaseId: "22222222-3333-4444-8555-666666666666",
    bucketName: "prospector-ahead-files",
  })}\n`, { mode: 0o600 });
  await writeFile(aheadMigration, "SELECT 1;\n");
  try {
    const result = spawnSync(process.execPath, [
      script, "prepare", "--mapping", mappingPath, "--output", outputPath,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    // The unreleased migration is counted and digested, never released.
    assert.equal(receipt.releaseMigrationCount, releaseChain().length);
    assert.equal(receipt.checkedAheadCount, checkedMigrations().length - releaseChain().length);

    const candidate = JSON.parse(await readFile(outputPath, "utf8"));
    const pattern = candidate.d1_databases[0].migrations_pattern;
    assert.equal(pattern.includes(`${nextOrder}_unreleased_candidate.sql`), false);
    assert.equal(pattern, `../../drizzle/{${releaseChain().join(",")}}`);
  } finally {
    await rm(aheadMigration, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("the CLI rejects a released migration whose bytes no longer match the manifest", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-target-drift-test-${nonce}`);
  const mappingPath = resolve(directory, "mapping.json");
  const outputPath = resolve(directory, "candidate.json");
  const releasedName = releaseChain().at(-1);
  const releasedPath = resolve(root, "drizzle", releasedName);
  const original = await readFile(releasedPath);
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

  await mkdir(directory, { recursive: true });
  await writeFile(mappingPath, `${JSON.stringify({
    sourceCommit,
    workerName: "prospector-drift-test",
    databaseName: "prospector-drift-db",
    databaseId: "33333333-4444-4555-8666-777777777777",
    bucketName: "prospector-drift-files",
  })}\n`, { mode: 0o600 });
  try {
    await writeFile(releasedPath, `${original.toString("utf8")}-- drift\n`);
    const result = spawnSync(process.execPath, [
      script, "prepare", "--mapping", mappingPath, "--output", outputPath,
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
    await writeFile(releasedPath, original);
    await rm(directory, { recursive: true, force: true });
  }
});
