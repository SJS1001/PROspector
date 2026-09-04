import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(root, "..");
const script = resolve(root, "scripts/greenfield-runtime-config.mjs");

test("the runtime CLI prepares one private Access-mode candidate without secret values", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const directory = resolve(root, `.wrangler/greenfield-runtime-test-${nonce}`);
  const targetPath = resolve(directory, "target.json");
  const accessPath = resolve(directory, "access.json");
  const outputPath = resolve(directory, "runtime.json");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const target = targetCandidate(directory);
  const targetSource = `${JSON.stringify(target, null, 2)}\n`;
  const access = {
    accessAudience: "abcdefghijklmnop1234567890",
    accessIssuer: "https://prospector-test.cloudflareaccess.com",
    sourceCommit,
    targetCandidateDigest: digest(targetSource),
  };

  await mkdir(directory, { recursive: true });
  await writeFile(targetPath, targetSource, { mode: 0o600 });
  await writeFile(accessPath, `${JSON.stringify(access)}\n`, { mode: 0o600 });
  try {
    const result = spawnSync(process.execPath, [
      script,
      "prepare",
      "--target",
      targetPath,
      "--access",
      accessPath,
      "--output",
      outputPath,
    ], { cwd: root, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const receipt = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(receipt).sort(), [
      "accessConfigDigest",
      "code",
      "ok",
      "runtimeCandidateDigest",
      "sourceDigest",
      "status",
      "targetCandidateDigest",
    ]);
    assert.deepEqual({ ok: receipt.ok, status: receipt.status, code: receipt.code }, {
      ok: true,
      status: "prepared",
      code: "greenfield_runtime_candidate_ready",
    });
    assert.match(receipt.runtimeCandidateDigest, /^[a-f0-9]{64}$/u);
    assert.doesNotMatch(result.stdout, /prospector-test|abcdefghijklmnop1234567890/u);

    const runtime = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(runtime, {
      ...target,
      vars: {
        TRUSTED_IDENTITY_PROVIDER: "cloudflare-access",
        CLOUDFLARE_ACCESS_ISSUER: access.accessIssuer,
        CLOUDFLARE_ACCESS_AUDIENCE: access.accessAudience,
      },
      secrets: {
        required: ["OWNER_SUBJECT_PEPPER", "PILOT_OWNER_EMAIL"],
      },
    });
    assert.equal(Object.hasOwn(runtime.vars, "LOCAL_DEMO"), false);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the runtime CLI rejects target drift that could expose or schedule the Worker", async () => {
  const fixture = await createFixture("target-drift");
  fixture.target.routes = [{ pattern: "example.com/*", zone_name: "example.com" }];
  const targetSource = `${JSON.stringify(fixture.target, null, 2)}\n`;
  fixture.access.targetCandidateDigest = digest(targetSource);
  await writeFile(fixture.targetPath, targetSource, { mode: 0o600 });
  await writeFile(fixture.accessPath, `${JSON.stringify(fixture.access)}\n`, { mode: 0o600 });
  try {
    const result = run(fixture);
    assertBlocked(result, "target_candidate_invalid");
    await assert.rejects(() => readFile(fixture.outputPath), { code: "ENOENT" });
  } finally {
    await fixture.cleanup();
  }
});

test("the runtime CLI binds Access metadata to the exact target bytes and source commit", async () => {
  const fixture = await createFixture("binding");
  fixture.access.targetCandidateDigest = "f".repeat(64);
  await writeFile(fixture.accessPath, `${JSON.stringify(fixture.access)}\n`, { mode: 0o600 });
  try {
    const digestMismatch = run(fixture);
    assertBlocked(digestMismatch, "target_candidate_digest_mismatch");

    fixture.access.targetCandidateDigest = digest(fixture.targetSource);
    fixture.access.sourceCommit = "a".repeat(40);
    await writeFile(fixture.accessPath, `${JSON.stringify(fixture.access)}\n`, { mode: 0o600 });
    const sourceMismatch = run(fixture);
    assertBlocked(sourceMismatch, "source_commit_mismatch");
    await assert.rejects(() => readFile(fixture.outputPath), { code: "ENOENT" });
  } finally {
    await fixture.cleanup();
  }
});

test("the runtime CLI rejects secret-bearing or malformed Access metadata without leaking it", async () => {
  const fixture = await createFixture("access-invalid");
  const privateMarker = "private-secret-value-must-not-leak";
  fixture.access.ownerSubjectPepper = privateMarker;
  await writeFile(fixture.accessPath, `${JSON.stringify(fixture.access)}\n`, { mode: 0o600 });
  try {
    const secretBearing = run(fixture);
    assertBlocked(secretBearing, "access_config_invalid");
    assert.doesNotMatch(secretBearing.stderr, new RegExp(privateMarker, "u"));

    delete fixture.access.ownerSubjectPepper;
    fixture.access.accessIssuer = "https://example.com";
    await writeFile(fixture.accessPath, `${JSON.stringify(fixture.access)}\n`, { mode: 0o600 });
    const foreignIssuer = run(fixture);
    assertBlocked(foreignIssuer, "access_config_invalid");
    await assert.rejects(() => readFile(fixture.outputPath), { code: "ENOENT" });
  } finally {
    await fixture.cleanup();
  }
});

test("the runtime CLI requires owner-only inputs and rejects symlink escape", async () => {
  const fixture = await createFixture("custody");
  try {
    await chmod(fixture.targetPath, 0o644);
    const looseTargetMode = run(fixture);
    assertBlocked(looseTargetMode, "target_permissions_invalid");
    await chmod(fixture.targetPath, 0o600);

    await chmod(fixture.accessPath, 0o644);
    const looseAccessMode = run(fixture);
    assertBlocked(looseAccessMode, "access_permissions_invalid");
    await chmod(fixture.accessPath, 0o600);

    const outsideDirectory = resolve(root, `.local/greenfield-runtime-outside-${fixture.nonce}`);
    const linkPath = resolve(fixture.directory, "escaped");
    await mkdir(outsideDirectory, { recursive: true });
    await symlink(outsideDirectory, linkPath);
    try {
      const escaped = run({
        ...fixture,
        accessPath: resolve(linkPath, "access.json"),
      });
      assertBlocked(escaped, "access_path_invalid");
    } finally {
      await rm(outsideDirectory, { recursive: true, force: true });
    }
    await assert.rejects(() => readFile(fixture.outputPath), { code: "ENOENT" });
  } finally {
    await fixture.cleanup();
  }
});

test("the runtime CLI never overwrites a prepared runtime candidate", async () => {
  const fixture = await createFixture("overwrite");
  const sentinel = "existing-runtime-candidate-must-survive\n";
  await writeFile(fixture.outputPath, sentinel, { mode: 0o600 });
  try {
    const result = run(fixture);
    assertBlocked(result, "output_exists");
    assert.equal(await readFile(fixture.outputPath, "utf8"), sentinel);
  } finally {
    await fixture.cleanup();
  }
});

function targetCandidate(directory) {
  return {
    $schema: relativePath(directory, resolve(root, "node_modules/wrangler/config-schema.json")),
    name: "prospector-greenfield-test",
    main: relativePath(directory, resolve(root, "dist/server/index.js")),
    compatibility_date: "2026-07-30",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    triggers: { crons: [] },
    assets: { directory: relativePath(directory, resolve(root, "dist/client")) },
    d1_databases: [{
      binding: "DB",
      database_name: "prospector-greenfield-test-db",
      database_id: "11111111-2222-4333-8444-555555555555",
      migrations_dir: relativePath(directory, resolve(root, "drizzle")),
      migrations_pattern: `${relativePath(directory, resolve(root, "drizzle"))}/*.sql`,
    }],
    r2_buckets: [{
      binding: "FILES",
      bucket_name: "prospector-greenfield-test-files",
    }],
  };
}

function relativePath(from, to) {
  const value = relative(from, to).split(sep).join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createFixture(label) {
  const nonce = `${process.pid}-${Date.now()}-${label}`;
  const directory = resolve(root, `.wrangler/greenfield-runtime-test-${nonce}`);
  const targetPath = resolve(directory, "target.json");
  const accessPath = resolve(directory, "access.json");
  const outputPath = resolve(directory, "runtime.json");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const target = targetCandidate(directory);
  const targetSource = `${JSON.stringify(target, null, 2)}\n`;
  const access = {
    accessAudience: "abcdefghijklmnop1234567890",
    accessIssuer: "https://prospector-test.cloudflareaccess.com",
    sourceCommit,
    targetCandidateDigest: digest(targetSource),
  };
  await mkdir(directory, { recursive: true });
  await writeFile(targetPath, targetSource, { mode: 0o600 });
  await writeFile(accessPath, `${JSON.stringify(access)}\n`, { mode: 0o600 });
  return {
    nonce,
    directory,
    targetPath,
    accessPath,
    outputPath,
    target,
    targetSource,
    access,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function run(fixture) {
  return spawnSync(process.execPath, [
    script,
    "prepare",
    "--target",
    fixture.targetPath,
    "--access",
    fixture.accessPath,
    "--output",
    fixture.outputPath,
  ], { cwd: root, encoding: "utf8" });
}

function assertBlocked(result, code) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    ok: false,
    status: "blocked",
    code,
  });
}
