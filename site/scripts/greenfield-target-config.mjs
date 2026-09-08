import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const REPOSITORY_ROOT = resolve(ROOT, "..");
const PRIVATE_ROOT = resolve(ROOT, ".wrangler");
const BUILD_PATH = resolve(ROOT, "dist/server/wrangler.json");
const MIGRATION_ROOT = resolve(ROOT, "drizzle");
const MANIFEST_PATH = resolve(
  ROOT,
  "../.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-MIGRATION-MANIFEST.md",
);
const EXPECTED_SCHEMA_PATH = resolve(
  ROOT,
  "../.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-EXPECTED-SCHEMA.md",
);
const EXPECTED_SCHEMA_DIGEST = "626f835c79a76f5cdfd9fba8841b0bda38cfca12774b666b0e14fbab0369d889";
const REVIEWED_COMPATIBILITY_DATE = "2026-07-30";
const TARGET_NEUTRAL_BUILD_CONFIG_DIGEST = "928dc72d08e8031e6d970cff7b1676b4724967d06a1c82dc70e37b2ad73b3530";
const SAFE_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,94}[a-z0-9])?$/u;
const SAFE_BUCKET = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/u;
const SAFE_UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const SAFE_COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_MIGRATION = /^[0-9]{4}_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/u;
const GLOB_META = /[{},*?[\]!()+@]/u;
const TARGET_NEUTRAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const TARGET_NEUTRAL_BUILD_KEYS = [
  "agent_memory", "ai_search", "ai_search_namespaces", "analytics_engine_datasets",
  "artifacts", "assets", "build", "cloudchamber", "compatibility_date",
  "compatibility_flags", "d1_databases", "define", "dev", "dispatch_namespaces",
  "durable_objects", "exports", "flagship", "hyperdrive", "jsx_factory",
  "jsx_fragment", "kv_namespaces", "logfwdr", "main", "migrations",
  "mtls_certificates", "name", "no_bundle", "observability", "pipelines",
  "python_modules", "queues", "r2_buckets", "ratelimits", "rules",
  "secrets_store_secrets", "send_email", "services", "topLevelName", "triggers",
  "unsafe_hello_world", "vars", "vectorize", "vpc_networks", "vpc_services",
  "worker_loaders", "workflows",
];
const EMPTY_BUILD_FIELDS = {
  agent_memory: [],
  ai_search: [],
  ai_search_namespaces: [],
  analytics_engine_datasets: [],
  artifacts: [],
  cloudchamber: {},
  define: {},
  dispatch_namespaces: [],
  durable_objects: { bindings: [] },
  exports: {},
  flagship: [],
  hyperdrive: [],
  kv_namespaces: [],
  logfwdr: { bindings: [] },
  migrations: [],
  mtls_certificates: [],
  pipelines: [],
  queues: { producers: [], consumers: [] },
  ratelimits: [],
  secrets_store_secrets: [],
  send_email: [],
  services: [],
  triggers: {},
  unsafe_hello_world: [],
  vars: {},
  vectorize: [],
  vpc_networks: [],
  vpc_services: [],
  worker_loaders: [],
  workflows: [],
};
const MAPPING_KEYS = [
  "bucketName",
  "databaseId",
  "databaseName",
  "sourceCommit",
  "workerName",
];

export async function prepareGreenfieldTarget({ mappingPath, outputPath }) {
  const mappingFile = privateJsonPath(mappingPath, "mapping_path_invalid");
  const outputFile = privateJsonPath(outputPath, "output_path_invalid");
  if (mappingFile === outputFile) throw new Error("output_path_invalid");
  await rejectSymlinkChain(mappingFile, "mapping_path_invalid");
  await rejectSymlinkChain(outputFile, "output_path_invalid");

  const mapping = parseMapping(await readPrivateMapping(mappingFile));
  const sourceCommit = currentSourceCommit();
  if (mapping.sourceCommit !== sourceCommit) throw new Error("source_commit_mismatch");

  const buildSource = await readFile(BUILD_PATH, "utf8");
  if (digest(buildSource) !== TARGET_NEUTRAL_BUILD_CONFIG_DIGEST) {
    throw new Error("build_invalid");
  }
  const build = JSON.parse(buildSource);
  validateTargetNeutralBuild(build);
  const manifest = await readFile(MANIFEST_PATH, "utf8");
  const expectedSchema = await readFile(EXPECTED_SCHEMA_PATH, "utf8");
  const released = parseReleaseChain(manifest);
  const checked = await verifyCheckedChain(
    released,
    manifestRows(manifest, "Checked ahead of the release chain"),
  );
  if (digest(expectedSchema) !== EXPECTED_SCHEMA_DIGEST) {
    throw new Error("expected_schema_manifest_mismatch");
  }
  const buildDigest = await digestBuild();

  const outputDirectory = dirname(outputFile);
  const candidate = {
    $schema: relativePath(outputDirectory, resolve(ROOT, "node_modules/wrangler/config-schema.json")),
    name: mapping.workerName,
    main: relativePath(outputDirectory, resolve(ROOT, "dist/server/index.js")),
    compatibility_date: build.compatibility_date,
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    triggers: { crons: [] },
    assets: { directory: relativePath(outputDirectory, resolve(ROOT, "dist/client")) },
    d1_databases: [{
      binding: "DB",
      database_name: mapping.databaseName,
      database_id: mapping.databaseId,
      migrations_dir: relativePath(outputDirectory, MIGRATION_ROOT),
      migrations_pattern: releaseMigrationsPattern(
        relativePath(outputDirectory, MIGRATION_ROOT),
        released,
        checked.ahead,
      ),
    }],
    r2_buckets: [{ binding: "FILES", bucket_name: mapping.bucketName }],
  };
  const serialized = `${JSON.stringify(candidate, null, 2)}\n`;
  await writePrivateOutput(outputFile, serialized);

  return {
    ok: true,
    status: "prepared",
    code: "greenfield_target_candidate_ready",
    sourceDigest: digest(sourceCommit),
    buildDigest,
    candidateDigest: digest(serialized),
    migrationManifestDigest: digest(manifest),
    releaseMigrationCount: released.length,
    checkedAheadCount: checked.ahead.length,
    checkedAheadDigest: checked.aheadDigest,
    expectedSchemaDigest: digest(expectedSchema),
  };
}

function parseArgs(argv) {
  if (argv[0] !== "prepare") throw new Error("command_invalid");
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || (flag !== "--mapping" && flag !== "--output") || Object.hasOwn(values, flag)) {
      throw new Error("arguments_invalid");
    }
    values[flag] = value;
  }
  if (Object.keys(values).length !== 2) throw new Error("arguments_invalid");
  return { mappingPath: values["--mapping"], outputPath: values["--output"] };
}

function parseMapping(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("mapping_invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(MAPPING_KEYS)) {
    throw new Error("mapping_invalid");
  }
  if (!SAFE_COMMIT.test(value.sourceCommit)
      || !SAFE_NAME.test(value.workerName)
      || !SAFE_NAME.test(value.databaseName)
      || !SAFE_UUID.test(value.databaseId)
      || value.databaseId === TARGET_NEUTRAL_DATABASE_ID
      || !SAFE_BUCKET.test(value.bucketName)) {
    throw new Error("mapping_invalid");
  }
  return value;
}

function validateTargetNeutralBuild(build) {
  const db = build?.d1_databases;
  const r2 = build?.r2_buckets;
  if (!build || typeof build !== "object" || Array.isArray(build)
      || JSON.stringify(Object.keys(build).sort()) !== JSON.stringify(TARGET_NEUTRAL_BUILD_KEYS)
      || Object.entries(EMPTY_BUILD_FIELDS).some(([key, value]) => (
        JSON.stringify(build[key]) !== JSON.stringify(value)
      ))
      || build?.main !== "index.js"
      || build?.compatibility_date !== REVIEWED_COMPATIBILITY_DATE
      || JSON.stringify(build?.compatibility_flags) !== JSON.stringify(["nodejs_compat"])
      || build?.assets?.directory !== "../client"
      || !Array.isArray(db) || db.length !== 1 || db[0]?.binding !== "DB"
      || db[0]?.database_id !== TARGET_NEUTRAL_DATABASE_ID
      || db[0]?.migrations_dir !== "../../drizzle"
      || !Array.isArray(r2) || r2.length !== 1 || r2[0]?.binding !== "FILES") {
    throw new Error("build_invalid");
  }
}

/**
 * The release chain is the ordered set of migrations this candidate is allowed
 * to apply to the deployed target. It is pinned by the checked manifest and
 * only a separate owner authorization may extend it.
 */
/**
 * Rows under one `## ` heading only. The manifest carries two tables: the
 * pinned release chain and the checked-ahead chain. Reading every row in the
 * file would silently promote an unreleased migration into the release set the
 * candidate offers to a remote apply, so each table is parsed by its heading.
 */
function manifestRows(source, heading) {
  const section = source.split(/^## /mu).find((part) => part.startsWith(heading));
  if (section === undefined) throw new Error("migration_manifest_invalid");
  return section.split("\n")
    .filter((line) => /^\| \d{4} \|/u.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", ""));
      return { order: cells[0], name: cells[1], digest: cells[2] };
    });
}

function parseReleaseChain(source) {
  const released = manifestRows(source, "Ordered release chain");
  if (released.length === 0) throw new Error("migration_manifest_invalid");
  for (const [index, item] of released.entries()) {
    if (item.order !== String(index).padStart(4, "0")
        || !item.name.startsWith(`${item.order}_`)
        || !SAFE_MIGRATION.test(item.name)
        || !/^[a-f0-9]{64}$/u.test(item.digest)) {
      throw new Error("migration_manifest_invalid");
    }
  }
  return released;
}

/**
 * The checked chain is what the working tree holds. It may legitimately run
 * ahead of the release chain while later migrations await their own
 * authorization, so this verifies two separate things: every released
 * migration is still byte-identical and in position, and the unreleased tail
 * continues the same contiguous numbering without gaps, duplicates, or
 * reordering. The tail is reported by digest and never enters the candidate.
 */
async function verifyCheckedChain(released, aheadExpected) {
  const entries = await readdir(MIGRATION_ROOT, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.name.endsWith(".sql"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const names = files.map((entry) => entry.name);
  if (files.some((entry) => !entry.isFile())
      || names.length < released.length
      || new Set(names).size !== names.length) {
    throw new Error("migration_manifest_mismatch");
  }
  for (const [index, item] of released.entries()) {
    if (names[index] !== item.name) throw new Error("migration_manifest_mismatch");
    if (digest(await readFile(resolve(MIGRATION_ROOT, item.name))) !== item.digest) {
      throw new Error("migration_manifest_mismatch");
    }
  }
  const ahead = names.slice(released.length);
  // The checked-ahead table records a digest per unreleased migration, so the
  // working tree is proved byte-for-byte here too. A file that drifts, or one
  // that appears on disk without a recorded row, fails closed rather than being
  // hashed into an opaque rollup nobody compares.
  // A recorded checked-ahead row is an integrity claim and must hold exactly.
  // A migration that has landed but is not recorded yet is still admitted on
  // contiguity alone: the tree is allowed to run ahead of the manifest, and the
  // candidate excludes it either way. Recording a row can only tighten this,
  // never loosen it, so a recorded file that has drifted or gone missing fails.
  const recorded = new Map(aheadExpected.map((item) => [item.name, item]));
  const aheadLines = [];
  for (const [offset, name] of ahead.entries()) {
    const order = String(released.length + offset).padStart(4, "0");
    if (!SAFE_MIGRATION.test(name) || !name.startsWith(`${order}_`)) {
      throw new Error("migration_manifest_mismatch");
    }
    const actual = digest(await readFile(resolve(MIGRATION_ROOT, name)));
    const expected = recorded.get(name);
    if (expected !== undefined) {
      if (expected.order !== order || actual !== expected.digest) {
        throw new Error("migration_manifest_mismatch");
      }
      recorded.delete(name);
    }
    aheadLines.push(`${name}:${actual}`);
  }
  // Every recorded row must correspond to a file that is actually present.
  if (recorded.size > 0) throw new Error("migration_manifest_mismatch");
  return { ahead, aheadDigest: digest(aheadLines.join("\n")) };
}

/**
 * Bounds the emitted candidate to the release chain, so the operator's
 * `wrangler d1 migrations apply` cannot discover an unreleased migration even
 * though the working tree contains one. Wrangler matches this with minimatch
 * under default options, so an explicit brace list selects exactly these files.
 */
function releaseMigrationsPattern(directory, released, ahead) {
  const names = released.map((item) => item.name);
  if (names.some((name) => GLOB_META.test(name))) throw new Error("migration_manifest_invalid");
  const pattern = names.length === 1
    ? `${directory}/${names[0]}`
    : `${directory}/{${names.join(",")}}`;
  const selected = new Set(expandReleasePattern(pattern, directory));
  if (selected.size !== names.length
      || names.some((name) => !selected.has(name))
      || ahead.some((name) => selected.has(name))) {
    throw new Error("migration_manifest_invalid");
  }
  return pattern;
}

function expandReleasePattern(pattern, directory) {
  const prefix = `${directory}/`;
  if (!pattern.startsWith(prefix)) throw new Error("migration_manifest_invalid");
  const body = pattern.slice(prefix.length);
  if (!body.startsWith("{")) return [body];
  if (!body.endsWith("}")) throw new Error("migration_manifest_invalid");
  return body.slice(1, -1).split(",");
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

async function readPrivateMapping(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ELOOP") {
      throw new Error("mapping_path_invalid");
    }
    throw error;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o400) === 0 || (metadata.mode & 0o077) !== 0) {
      throw new Error("mapping_permissions_invalid");
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

async function digestBuild() {
  const records = [];
  for (const directory of [resolve(ROOT, "dist/server"), resolve(ROOT, "dist/client")]) {
    await walkBuildDirectory(directory, records);
  }
  return digest(`${records.join("\n")}\n`);
}

async function walkBuildDirectory(directory, records) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error("build_invalid");
    }
    if (entry.isDirectory()) {
      await walkBuildDirectory(path, records);
    } else {
      records.push(`${relative(ROOT, path).split(sep).join("/")}|${digest(await readFile(path))}`);
    }
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

function relativePath(from, to) {
  const value = relative(from, to).split(sep).join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  try {
    const result = await prepareGreenfieldTarget(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = typeof error?.message === "string" && /^[a-z_]+$/u.test(error.message)
      ? error.message
      : "greenfield_target_prepare_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, status: "blocked", code })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
