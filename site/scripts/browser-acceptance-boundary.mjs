import { realpathSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const RUNTIME_ENTRIES = Object.freeze([
  ".openai",
  "app",
  "build",
  "db",
  "domain",
  "node_modules",
  "package.json",
  "postcss.config.mjs",
  "public",
  "tsconfig.json",
  "worker",
]);

export const BROWSER_ACCEPTANCE_BINDINGS = Object.freeze({
  TRUSTED_IDENTITY_PROVIDER: "local-demo",
  LOCAL_DEMO: "1",
  PILOT_OWNER_EMAIL: "browser-owner@prospector.invalid",
  OWNER_SUBJECT_PEPPER: "synthetic-browser-acceptance-pepper-32-bytes-minimum",
});

export const BROWSER_ACCEPTANCE_CONFIG = "wrangler.browser-acceptance.json";

export function browserAcceptanceStatePath(stateRoot) {
  return resolve(stateRoot, "runtime-state");
}

export function browserAcceptanceCloudflareOptions({ projectRoot, runtimeRoot, statePath }) {
  if (!isAbsolute(runtimeRoot) || !isAbsolute(statePath)) {
    throw new Error("browser acceptance runtime and state paths must be absolute");
  }
  const realProjectRoot = realpathSync(projectRoot);
  const realRuntimeRoot = realpathSync(runtimeRoot);
  const realStatePath = realpathSync(statePath);
  const realLocalRoot = realpathSync(resolve(realProjectRoot, ".local"));
  assertInside(realLocalRoot, realRuntimeRoot);
  assertInside(realLocalRoot, realStatePath);
  const stateRoot = dirname(realRuntimeRoot);
  if (!basename(stateRoot).startsWith("browser-acceptance-state-")) {
    throw new Error("browser acceptance runtime root is not per-run state");
  }
  if (realStatePath !== resolve(stateRoot, "runtime-state")) {
    throw new Error("browser acceptance persistence must share the per-run state root");
  }
  return Object.freeze({
    persistState: Object.freeze({ path: realStatePath }),
    configPath: resolve(realRuntimeRoot, BROWSER_ACCEPTANCE_CONFIG),
  });
}

export function browserAcceptanceWorkerConfig({ d1, r2 }) {
  return {
    name: "prospector-browser-acceptance",
    main: "worker/index.ts",
    // Pinned to the newest date supported by the exact local workerd package.
    compatibility_date: "2026-08-06",
    compatibility_flags: ["nodejs_compat"],
    vars: BROWSER_ACCEPTANCE_BINDINGS,
    secrets: {},
    d1_databases: d1 ? [{
      binding: d1,
      database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: "drizzle",
    }] : [],
    r2_buckets: r2 ? [{ binding: r2, bucket_name: "site-creator-r2" }] : [],
  };
}

export async function createBrowserAcceptanceRuntimeRoot(projectRoot, stateRoot, bindings) {
  const runtimeRoot = resolve(stateRoot, "runtime-root");
  await mkdir(runtimeRoot, { recursive: true });
  for (const entry of RUNTIME_ENTRIES) {
    await symlink(resolve(projectRoot, entry), resolve(runtimeRoot, entry));
  }
  await writeFile(
    resolve(runtimeRoot, BROWSER_ACCEPTANCE_CONFIG),
    `${JSON.stringify(browserAcceptanceWorkerConfig(bindings), null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  return runtimeRoot;
}

export function scrubbedBrowserEnvironment(additions, source = process.env) {
  const environment = {};
  for (const name of ["PATH", "SHELL", "LANG", "LC_ALL", "TERM"]) {
    if (source[name]) environment[name] = source[name];
  }
  return { ...environment, ...additions };
}

function assertInside(parent, child) {
  const path = relative(parent, child);
  if (!path || path === ".." || path.startsWith(`..${sep}`) || resolve(parent, path) !== child) {
    throw new Error("browser acceptance path is outside project-local state");
  }
}
