import { createHash } from "node:crypto";
import { execFile as nativeExecFile, execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(nativeExecFile);
const ROOT = resolve(import.meta.dirname, "..");
const REPOSITORY_ROOT = resolve(ROOT, "..");
const PRIVATE_ROOT = resolve(ROOT, ".wrangler");
const LOCAL_WRANGLER_PATH = resolve(ROOT, "node_modules/.bin/wrangler");
const SAFE_COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_DIGEST = /^[a-f0-9]{64}$/u;
const SAFE_UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const SAFE_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,94}[a-z0-9])?$/u;
const SAFE_BUCKET = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/u;
const BOOTSTRAP_MESSAGE = "Plan 02-99 Stage 3 unreachable bootstrap";
const FINAL_MESSAGE = "Plan 02-99 Stage 3 unreachable private candidate";
const EXPECTATION_KEYS = ["runtimeCandidateDigest", "sourceCommit"];
const BOOTSTRAP_EXPECTATION_KEYS = ["sourceCommit", "targetCandidateDigest"];
const BOOTSTRAP_CONFIG_KEYS = [
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

export function buildStage3ReadCommands(configPath) {
  const configFile = privateJsonPath(configPath, "config_path_invalid");
  return [
    {
      key: "versions",
      file: LOCAL_WRANGLER_PATH,
      args: ["versions", "list", "--config", configFile, "--json"],
    },
    {
      key: "deployments",
      file: LOCAL_WRANGLER_PATH,
      args: ["deployments", "list", "--config", configFile, "--json"],
    },
  ];
}

export async function verifyStage3Evidence({
  configPath,
  expectationPath,
  runCommand = runReadCommand,
}) {
  const configFile = privateJsonPath(configPath, "config_path_invalid");
  const expectationFile = privateJsonPath(expectationPath, "expectation_path_invalid");
  if (configFile === expectationFile) throw new Error("paths_not_distinct");
  await rejectSymlinkChain(configFile, "config_path_invalid");
  await rejectSymlinkChain(expectationFile, "expectation_path_invalid");

  const configSource = await readPrivateFile(configFile, "config");
  const expectationSource = await readPrivateFile(expectationFile, "expectation");
  validateRuntimeConfig(configSource);
  const expectation = parseExpectation(expectationSource);
  const sourceCommit = currentSourceCommit();
  const configDigest = digest(configSource);
  if (expectation.sourceCommit !== sourceCommit) throw new Error("source_commit_mismatch");
  if (expectation.runtimeCandidateDigest !== configDigest) {
    throw new Error("runtime_candidate_digest_mismatch");
  }

  const first = await collect(configFile, runCommand);
  const second = await collect(configFile, runCommand);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("stage3_evidence_drift");

  return {
    ok: true,
    status: "passed",
    code: "stage3_unreachable_private_candidate_verified",
    evidenceStage: "private-candidate",
    sourceDigest: digest(sourceCommit),
    configDigest,
    versionInventoryDigest: digest(JSON.stringify(first.versions)),
    deploymentInventoryDigest: digest(JSON.stringify(first.deployments)),
    versionCount: first.versions.length,
    deploymentCount: first.deployments.length,
  };
}

export async function verifyStage3BootstrapEvidence({
  configPath,
  expectationPath,
  runCommand = runReadCommand,
}) {
  const configFile = privateJsonPath(configPath, "config_path_invalid");
  const expectationFile = privateJsonPath(expectationPath, "expectation_path_invalid");
  if (configFile === expectationFile) throw new Error("paths_not_distinct");
  await rejectSymlinkChain(configFile, "config_path_invalid");
  await rejectSymlinkChain(expectationFile, "expectation_path_invalid");

  const configSource = await readPrivateFile(configFile, "config");
  const expectationSource = await readPrivateFile(expectationFile, "expectation");
  validateBootstrapConfig(configSource);
  const expectation = parseBootstrapExpectation(expectationSource);
  const sourceCommit = currentSourceCommit();
  const configDigest = digest(configSource);
  if (expectation.sourceCommit !== sourceCommit) throw new Error("source_commit_mismatch");
  if (expectation.targetCandidateDigest !== configDigest) {
    throw new Error("target_candidate_digest_mismatch");
  }

  const first = await collectBootstrap(configFile, runCommand);
  const second = await collectBootstrap(configFile, runCommand);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("stage3_evidence_drift");

  return {
    ok: true,
    status: "passed",
    code: "stage3_unreachable_bootstrap_verified",
    evidenceStage: "bootstrap",
    sourceDigest: digest(sourceCommit),
    configDigest,
    versionInventoryDigest: digest(JSON.stringify(first.versions)),
    deploymentInventoryDigest: digest(JSON.stringify(first.deployments)),
    versionCount: first.versions.length,
    deploymentCount: first.deployments.length,
  };
}

async function collect(configPath, runCommand) {
  const outputs = {};
  for (const command of buildStage3ReadCommands(configPath)) {
    let result;
    try {
      result = await runCommand(command);
    } catch {
      throw new Error("provider_read_failed");
    }
    if (!result || typeof result.stdout !== "string") throw new Error("provider_output_invalid");
    outputs[command.key] = parseJson(result.stdout, "provider_output_invalid");
  }
  const versions = normalizeVersions(outputs.versions, [BOOTSTRAP_MESSAGE, FINAL_MESSAGE]);
  const deployments = normalizeBootstrapDeployments(outputs.deployments, versions[0].providerId);
  return { versions, deployments };
}

async function collectBootstrap(configPath, runCommand) {
  const outputs = {};
  for (const command of buildStage3ReadCommands(configPath)) {
    let result;
    try {
      result = await runCommand(command);
    } catch {
      throw new Error("provider_read_failed");
    }
    if (!result || typeof result.stdout !== "string") throw new Error("provider_output_invalid");
    outputs[command.key] = parseJson(result.stdout, "provider_output_invalid");
  }
  const versions = normalizeVersions(outputs.versions, [BOOTSTRAP_MESSAGE]);
  const deployments = normalizeBootstrapDeployments(outputs.deployments, versions[0].providerId);
  return { versions, deployments };
}

function normalizeVersions(value, expectedMessages) {
  if (!Array.isArray(value) || value.length !== expectedMessages.length) {
    throw new Error("version_inventory_invalid");
  }
  const normalized = value.map((version) => {
    if (!isRecord(version)
        || !SAFE_UUID.test(version.id)
        || !Number.isSafeInteger(version.number) || version.number < 1
        || !isRecord(version.metadata)
        || version.metadata.source !== "wrangler"
        || typeof version.metadata.author_email !== "string"
        || version.metadata.author_email.length < 3 || version.metadata.author_email.length > 320
        || !isExactIsoTimestamp(version.metadata.created_on)
        || !isRecord(version.annotations)
        || version.annotations["workers/triggered_by"] !== "upload"
        || ![BOOTSTRAP_MESSAGE, FINAL_MESSAGE].includes(version.annotations["workers/message"])) {
      throw new Error("version_inventory_invalid");
    }
    return {
      providerId: version.id,
      idDigest: digest(version.id),
      message: version.annotations["workers/message"],
      createdOn: version.metadata.created_on,
      source: version.metadata.source,
    };
  }).sort((left, right) => left.createdOn.localeCompare(right.createdOn));
  if (normalized.some((version, index) => version.message !== expectedMessages[index])
      || normalized.some((version, index) => index > 0
        && normalized[index - 1].createdOn >= version.createdOn)
      || new Set(normalized.map((version) => version.idDigest)).size !== normalized.length) {
    throw new Error("version_inventory_invalid");
  }
  return normalized;
}

function normalizeBootstrapDeployments(value, bootstrapVersionId) {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("deployment_inventory_invalid");
  const deployment = value[0];
  const versionTraffic = Array.isArray(deployment?.versions) && deployment.versions.length === 1
    ? deployment.versions[0]
    : null;
  if (!isRecord(deployment)
      || !SAFE_UUID.test(deployment.id)
      || deployment.source !== "wrangler"
      || deployment.strategy !== "percentage"
      || typeof deployment.author_email !== "string"
      || deployment.author_email.length < 3 || deployment.author_email.length > 320
      || !isExactIsoTimestamp(deployment.created_on)
      || !isRecord(deployment.annotations)
      || deployment.annotations["workers/message"] !== BOOTSTRAP_MESSAGE
      || !isRecord(versionTraffic)
      || versionTraffic.version_id !== bootstrapVersionId
      || versionTraffic.percentage !== 100) {
    throw new Error("deployment_inventory_invalid");
  }
  return [{
    idDigest: digest(deployment.id),
    versionIdDigest: digest(versionTraffic.version_id),
    message: deployment.annotations["workers/message"],
    createdOn: deployment.created_on,
    source: deployment.source,
    strategy: deployment.strategy,
    percentage: versionTraffic.percentage,
  }];
}

function validateBootstrapConfig(source) {
  const value = parseJson(source, "bootstrap_candidate_invalid");
  const database = Array.isArray(value?.d1_databases) && value.d1_databases.length === 1
    ? value.d1_databases[0]
    : null;
  const bucket = Array.isArray(value?.r2_buckets) && value.r2_buckets.length === 1
    ? value.r2_buckets[0]
    : null;
  if (!isRecord(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(BOOTSTRAP_CONFIG_KEYS)
      || !SAFE_NAME.test(value.name)
      || value.workers_dev !== false
      || value.preview_urls !== false
      || JSON.stringify(value.triggers) !== JSON.stringify({ crons: [] })
      || typeof value.$schema !== "string"
      || typeof value.main !== "string"
      || typeof value.compatibility_date !== "string"
      || JSON.stringify(value.compatibility_flags) !== JSON.stringify(["nodejs_compat"])
      || !isRecord(value.assets)
      || JSON.stringify(Object.keys(value.assets)) !== JSON.stringify(["directory"])
      || typeof value.assets.directory !== "string"
      || !isRecord(database)
      || JSON.stringify(Object.keys(database).sort()) !== JSON.stringify([
        "binding", "database_id", "database_name", "migrations_dir", "migrations_pattern",
      ])
      || database.binding !== "DB"
      || !SAFE_UUID.test(database.database_id)
      || !SAFE_NAME.test(database.database_name)
      || typeof database.migrations_dir !== "string"
      || typeof database.migrations_pattern !== "string"
      || !isRecord(bucket)
      || JSON.stringify(Object.keys(bucket).sort()) !== JSON.stringify(["binding", "bucket_name"])
      || bucket.binding !== "FILES"
      || !SAFE_BUCKET.test(bucket.bucket_name)) {
    throw new Error("bootstrap_candidate_invalid");
  }
}

function validateRuntimeConfig(source) {
  const value = parseJson(source, "runtime_candidate_invalid");
  const vars = value?.vars;
  const secrets = value?.secrets;
  if (!isRecord(value)
      || !SAFE_NAME.test(value.name)
      || value.workers_dev !== false
      || value.preview_urls !== false
      || JSON.stringify(value.triggers) !== JSON.stringify({ crons: [] })
      || ["routes", "route", "env", "send_email", "services", "queues", "workflows", "pipelines"]
        .some((key) => Object.hasOwn(value, key))
      || !isRecord(vars)
      || JSON.stringify(Object.keys(vars).sort()) !== JSON.stringify([
        "CLOUDFLARE_ACCESS_AUDIENCE",
        "CLOUDFLARE_ACCESS_ISSUER",
        "TRUSTED_IDENTITY_PROVIDER",
      ])
      || vars.TRUSTED_IDENTITY_PROVIDER !== "cloudflare-access"
      || typeof vars.CLOUDFLARE_ACCESS_ISSUER !== "string"
      || typeof vars.CLOUDFLARE_ACCESS_AUDIENCE !== "string"
      || !isRecord(secrets)
      || JSON.stringify(secrets) !== JSON.stringify({
        required: ["OWNER_SUBJECT_PEPPER", "PILOT_OWNER_EMAIL"],
      })) {
    throw new Error("runtime_candidate_invalid");
  }
}

function parseExpectation(source) {
  const value = parseJson(source, "expectation_invalid");
  if (!isRecord(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(EXPECTATION_KEYS)
      || !SAFE_COMMIT.test(value.sourceCommit)
      || !SAFE_DIGEST.test(value.runtimeCandidateDigest)) {
    throw new Error("expectation_invalid");
  }
  return value;
}

function parseBootstrapExpectation(source) {
  const value = parseJson(source, "expectation_invalid");
  if (!isRecord(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(BOOTSTRAP_EXPECTATION_KEYS)
      || !SAFE_COMMIT.test(value.sourceCommit)
      || !SAFE_DIGEST.test(value.targetCandidateDigest)) {
    throw new Error("expectation_invalid");
  }
  return value;
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

async function readPrivateFile(path, kind) {
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

async function runReadCommand(command) {
  return execFile(command.file, command.args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
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

function isExactIsoTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
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

function parseArgs(argv) {
  if (!["verify", "verify-bootstrap"].includes(argv[0])) throw new Error("command_invalid");
  const command = argv[0];
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--config", "--expectation"].includes(flag)
        || !value || Object.hasOwn(values, flag)) {
      throw new Error("arguments_invalid");
    }
    values[flag] = value;
  }
  if (Object.keys(values).length !== 2) throw new Error("arguments_invalid");
  return { command, configPath: values["--config"], expectationPath: values["--expectation"] };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = options.command === "verify-bootstrap"
      ? await verifyStage3BootstrapEvidence(options)
      : await verifyStage3Evidence(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = typeof error?.message === "string" && /^[a-z_]+$/u.test(error.message)
      ? error.message
      : "stage3_evidence_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, status: "blocked", code })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
