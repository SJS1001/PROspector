import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const REPOSITORY_ROOT = resolve(ROOT, "..");
const PRIVATE_ROOT = resolve(ROOT, ".wrangler");
const SAFE_COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_DIGEST = /^[a-f0-9]{64}$/u;
const SAFE_AUDIENCE = /^[A-Za-z0-9_-]{16,128}$/u;
const SAFE_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,94}[a-z0-9])?$/u;
const SAFE_BUCKET = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/u;
const SAFE_UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const REVIEWED_COMPATIBILITY_DATE = "2026-07-30";
const TARGET_KEYS = [
  "$schema",
  "assets",
  "compatibility_date",
  "compatibility_flags",
  "d1_databases",
  "main",
  "name",
  "preview_urls",
  "r2_buckets",
  "triggers",
  "workers_dev",
];
const ACCESS_KEYS = [
  "accessAudience",
  "accessIssuer",
  "sourceCommit",
  "targetCandidateDigest",
];

export async function prepareGreenfieldRuntime({ targetPath, accessPath, outputPath }) {
  const targetFile = privateJsonPath(targetPath, "target_path_invalid");
  const accessFile = privateJsonPath(accessPath, "access_path_invalid");
  const outputFile = privateJsonPath(outputPath, "output_path_invalid");
  if (new Set([targetFile, accessFile, outputFile]).size !== 3) {
    throw new Error("paths_not_distinct");
  }
  if (dirname(targetFile) !== dirname(outputFile)) {
    throw new Error("output_directory_mismatch");
  }
  await rejectSymlinkChain(targetFile, "target_path_invalid");
  await rejectSymlinkChain(accessFile, "access_path_invalid");
  await rejectSymlinkChain(outputFile, "output_path_invalid");

  const targetSource = await readPrivateJson(targetFile, "target");
  const accessSource = await readPrivateJson(accessFile, "access");
  const target = parseTarget(targetSource, targetFile);
  const access = parseAccess(accessSource);
  const sourceCommit = currentSourceCommit();
  const targetCandidateDigest = digest(targetSource);
  if (access.sourceCommit !== sourceCommit) throw new Error("source_commit_mismatch");
  if (access.targetCandidateDigest !== targetCandidateDigest) {
    throw new Error("target_candidate_digest_mismatch");
  }

  const runtime = {
    ...target,
    vars: {
      TRUSTED_IDENTITY_PROVIDER: "cloudflare-access",
      CLOUDFLARE_ACCESS_ISSUER: access.accessIssuer,
      CLOUDFLARE_ACCESS_AUDIENCE: access.accessAudience,
    },
    secrets: {
      required: ["OWNER_SUBJECT_PEPPER", "PILOT_OWNER_EMAIL"],
    },
  };
  const serialized = `${JSON.stringify(runtime, null, 2)}\n`;
  await writePrivateOutput(outputFile, serialized);

  return {
    ok: true,
    status: "prepared",
    code: "greenfield_runtime_candidate_ready",
    sourceDigest: digest(sourceCommit),
    targetCandidateDigest,
    accessConfigDigest: digest(accessSource),
    runtimeCandidateDigest: digest(serialized),
  };
}

function parseArgs(argv) {
  if (argv[0] !== "prepare") throw new Error("command_invalid");
  const values = {};
  const allowed = new Set(["--target", "--access", "--output"]);
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || !value || Object.hasOwn(values, flag)) {
      throw new Error("arguments_invalid");
    }
    values[flag] = value;
  }
  if (Object.keys(values).length !== allowed.size) throw new Error("arguments_invalid");
  return {
    targetPath: values["--target"],
    accessPath: values["--access"],
    outputPath: values["--output"],
  };
}

function parseAccess(source) {
  const value = parseJson(source, "access_config_invalid");
  if (!isRecord(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(ACCESS_KEYS)
      || !SAFE_COMMIT.test(value.sourceCommit)
      || !SAFE_DIGEST.test(value.targetCandidateDigest)
      || !SAFE_AUDIENCE.test(value.accessAudience)
      || !validAccessIssuer(value.accessIssuer)) {
    throw new Error("access_config_invalid");
  }
  return value;
}

function validAccessIssuer(value) {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const issuer = new URL(value);
    return issuer.protocol === "https:"
      && issuer.username === ""
      && issuer.password === ""
      && issuer.port === ""
      && issuer.pathname === "/"
      && issuer.search === ""
      && issuer.hash === ""
      && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/u.test(issuer.hostname);
  } catch {
    return false;
  }
}

function parseTarget(source, targetFile) {
  const value = parseJson(source, "target_candidate_invalid");
  if (!isRecord(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(TARGET_KEYS)
      || !SAFE_NAME.test(value.name)
      || value.compatibility_date !== REVIEWED_COMPATIBILITY_DATE
      || JSON.stringify(value.compatibility_flags) !== JSON.stringify(["nodejs_compat"])
      || value.workers_dev !== false
      || value.preview_urls !== false
      || JSON.stringify(value.triggers) !== JSON.stringify({ crons: [] })) {
    throw new Error("target_candidate_invalid");
  }
  const base = dirname(targetFile);
  if (!exactResolvedPath(base, value.$schema, resolve(ROOT, "node_modules/wrangler/config-schema.json"))
      || !exactResolvedPath(base, value.main, resolve(ROOT, "dist/server/index.js"))
      || !isRecord(value.assets)
      || Object.keys(value.assets).length !== 1
      || !exactResolvedPath(base, value.assets.directory, resolve(ROOT, "dist/client"))) {
    throw new Error("target_candidate_invalid");
  }
  const database = Array.isArray(value.d1_databases) && value.d1_databases.length === 1
    ? value.d1_databases[0]
    : null;
  const bucket = Array.isArray(value.r2_buckets) && value.r2_buckets.length === 1
    ? value.r2_buckets[0]
    : null;
  if (!isRecord(database)
      || JSON.stringify(Object.keys(database).sort()) !== JSON.stringify([
        "binding", "database_id", "database_name", "migrations_dir", "migrations_pattern",
      ])
      || database.binding !== "DB"
      || !SAFE_NAME.test(database.database_name)
      || !SAFE_UUID.test(database.database_id)
      || !exactResolvedPath(base, database.migrations_dir, resolve(ROOT, "drizzle"))
      || database.migrations_pattern !== `${database.migrations_dir}/*.sql`
      || !isRecord(bucket)
      || JSON.stringify(Object.keys(bucket).sort()) !== JSON.stringify(["binding", "bucket_name"])
      || bucket.binding !== "FILES"
      || !SAFE_BUCKET.test(bucket.bucket_name)) {
    throw new Error("target_candidate_invalid");
  }
  return value;
}

function exactResolvedPath(base, value, expected) {
  return typeof value === "string" && resolve(base, value) === expected;
}

function parseJson(source, code) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(code);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function privateJsonPath(path, code) {
  if (typeof path !== "string" || !path.endsWith(".json")) throw new Error(code);
  const absolute = resolve(ROOT, path);
  const local = relative(PRIVATE_ROOT, absolute);
  if (!local || local.startsWith("..") || local.includes(`..${sep}`)) throw new Error(code);
  return absolute;
}

async function rejectSymlinkChain(path, code) {
  const local = relative(PRIVATE_ROOT, path);
  let cursor = PRIVATE_ROOT;
  const segments = ["", ...local.split(sep)];
  for (const [index, segment] of segments.entries()) {
    if (segment) cursor = resolve(cursor, segment);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) throw new Error(code);
      if (index < segments.length - 1
          && (!metadata.isDirectory()
            || (typeof process.getuid === "function" && metadata.uid !== process.getuid())
            || (metadata.mode & 0o022) !== 0)) {
        throw new Error(code);
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

async function readPrivateJson(path, kind) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ELOOP") {
      throw new Error(`${kind}_path_invalid`);
    }
    throw error;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o400) === 0 || (metadata.mode & 0o077) !== 0) {
      throw new Error(`${kind}_permissions_invalid`);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function writePrivateOutput(path, value) {
  let handle;
  try {
    handle = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("output_exists");
    throw error;
  }
  try {
    await handle.writeFile(value, "utf8");
  } finally {
    await handle.close();
  }
}

function currentSourceCommit() {
  const value = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  }).trim();
  if (!SAFE_COMMIT.test(value)) throw new Error("source_commit_invalid");
  return value;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  try {
    const result = await prepareGreenfieldRuntime(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = typeof error?.message === "string" && /^[a-z_]+$/u.test(error.message)
      ? error.message
      : "greenfield_runtime_prepare_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, status: "blocked", code })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
