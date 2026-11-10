import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { promisify } from "node:util";
import {
  APP_ENV_REL_PATH,
  isMainModule,
  mergeAppEnv,
  parseAppEnv,
  projectRoot,
  readAppEnv,
} from "./with-app-env.mjs";

const execFileAsync = promisify(execFile);
const WRAPPER = join(projectRoot(), "scripts/with-app-env.mjs");
const PRINT_FLAG = "process.stdout.write(String(process.env.VITE_AUTH_ENABLED));";

const workspaces = [];
after(() => {
  for (const root of workspaces) rmSync(root, { recursive: true, force: true });
});

function makeWorkspace(appEnvJson) {
  const root = mkdtempSync(join(tmpdir(), "app-env-"));
  workspaces.push(root);
  if (appEnvJson !== undefined) {
    mkdirSync(join(root, ".grok"), { recursive: true });
    writeFileSync(join(root, APP_ENV_REL_PATH), appEnvJson);
  }
  return root;
}

test("keeps VITE_-prefixed string entries", () => {
  assert.deepEqual(parseAppEnv('{"VITE_AUTH_ENABLED":"false"}'), {
    VITE_AUTH_ENABLED: "false",
  });
});

test("drops non-VITE keys, non-string values and malformed documents", () => {
  assert.deepEqual(parseAppEnv('{"DATABASE_URL":"postgres://x","VITE_N":1,"VITE_OK":"y"}'), {
    VITE_OK: "y",
  });
  assert.deepEqual(parseAppEnv("not json"), {});
  assert.deepEqual(parseAppEnv('["VITE_AUTH_ENABLED"]'), {});
  assert.deepEqual(parseAppEnv("null"), {});
});

test("a missing app-env.json is a clean no-op", () => {
  assert.deepEqual(readAppEnv(makeWorkspace()), {});
});

test("reads the app env from a workspace", () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  assert.deepEqual(readAppEnv(root), { VITE_AUTH_ENABLED: "false" });
});

test("an explicit process-env override wins over the file", () => {
  const merged = mergeAppEnv(
    { VITE_AUTH_ENABLED: "false" },
    { VITE_AUTH_ENABLED: "true", PATH: "/usr/bin" },
  );
  assert.equal(merged.VITE_AUTH_ENABLED, "true");
  assert.equal(merged.PATH, "/usr/bin");
});

test("the operator has no template app-env override", () => {
  assert.deepEqual(readAppEnv(projectRoot()), {});
});

test("vite loadEnv resolves the wrapped value", () => {
  // What `import.meta.env.VITE_AUTH_ENABLED` becomes: loadEnv prefix-matches
  // process.env, so the wrapper's merge has to land before Vite starts.
  // Do not `import { loadEnv } from "vite"` here — Vite 8 loads rolldown
  // native bindings that SIGSEGV the test worker under qemu-user.
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  const merged = mergeAppEnv(readAppEnv(root), { PATH: "/usr/bin" });
  assert.equal(merged.VITE_AUTH_ENABLED, "false");
});

test("the wrapped command runs with the app env applied", async () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  mkdirSync(join(root, "scripts"));
  const wrapper = join(root, "scripts/with-app-env.mjs");
  copyFileSync(WRAPPER, wrapper);
  const { stdout } = await execFileAsync(
    process.execPath,
    [wrapper, process.execPath, "-e", PRINT_FLAG],
    { env: { ...process.env, VITE_AUTH_ENABLED: undefined } },
  );
  assert.equal(stdout, "false");
});

test("the wrapped command sees an explicit override, not the file value", async () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  mkdirSync(join(root, "scripts"));
  const wrapper = join(root, "scripts/with-app-env.mjs");
  copyFileSync(WRAPPER, wrapper);
  const { stdout } = await execFileAsync(
    process.execPath,
    [wrapper, process.execPath, "-e", PRINT_FLAG],
    { env: { ...process.env, VITE_AUTH_ENABLED: "true" } },
  );
  assert.equal(stdout, "true");
});

test("the wrapper propagates the command's exit code", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [WRAPPER, process.execPath, "-e", "process.exit(3)"]),
    (err) => err.code === 3,
  );
});

test("a signal-killed command is never reported as success", async () => {
  // The wrapper's own SIGTERM handler must not swallow the re-raised signal:
  // a cancelled build reporting exit 0 is a silently passing gate.
  await assert.rejects(
    execFileAsync(process.execPath, [
      WRAPPER,
      process.execPath,
      "-e",
      "process.kill(process.pid, 'SIGTERM');setTimeout(() => {}, 1000);",
    ]),
    (err) => err.signal === "SIGTERM" || err.code !== 0,
  );
});

test("the CLI still runs when invoked through a symlinked path", async () => {
  // node realpaths import.meta.url but not process.argv[1], so a raw comparison
  // turns the wrapper into a no-op that exits 0 without starting anything.
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  mkdirSync(join(root, "scripts"));
  copyFileSync(WRAPPER, join(root, "scripts/with-app-env.mjs"));
  const linkRoot = mkdtempSync(join(tmpdir(), "app-env-link-"));
  workspaces.push(linkRoot);
  const link = join(linkRoot, "scripts");
  symlinkSync(join(root, "scripts"), link);
  const { stdout } = await execFileAsync(
    process.execPath,
    [join(link, "with-app-env.mjs"), process.execPath, "-e", PRINT_FLAG],
    { env: { ...process.env, VITE_AUTH_ENABLED: undefined } },
  );
  assert.equal(stdout, "false");
});

test("isMainModule compares real paths and refuses a same-named entry elsewhere", () => {
  const real = mkdtempSync(join(tmpdir(), "main-module-"));
  workspaces.push(real);
  const script = join(real, "tool.mjs");
  writeFileSync(script, "");
  const linkRoot = mkdtempSync(join(tmpdir(), "main-module-link-"));
  workspaces.push(linkRoot);
  symlinkSync(real, join(linkRoot, "dir"));
  const url = pathToFileURL(realpathSync(script)).href;
  assert.equal(isMainModule(url, script), true);
  assert.equal(isMainModule(url, join(linkRoot, "dir", "tool.mjs")), true);
  assert.equal(isMainModule(url, join(real, "other.mjs")), false);
  assert.equal(isMainModule(url, undefined), false);
  // A launch that names this script but resolves to another copy is not
  // skipped silently: the guard throws instead of turning the CLI into a no-op.
  const elsewhere = mkdtempSync(join(tmpdir(), "main-module-copy-"));
  workspaces.push(elsewhere);
  writeFileSync(join(elsewhere, "tool.mjs"), "");
  assert.throws(() => isMainModule(url, join(elsewhere, "tool.mjs")), /direct-run guard/);
  assert.throws(
    () => isMainModule(url, join(elsewhere, "missing", "tool.mjs")),
    /direct-run guard/,
  );
});

test("every CLI with a direct-run guard still runs through a symlinked path", () => {
  // node realpaths import.meta.url but not process.argv[1]. A raw comparison
  // made each of these exit 0 with no output instead of reporting the bad call.
  const linkRoot = mkdtempSync(join(tmpdir(), "direct-run-link-"));
  workspaces.push(linkRoot);
  symlinkSync(join(projectRoot(), "scripts"), join(linkRoot, "scripts"));
  symlinkSync(join(projectRoot(), "launcher"), join(linkRoot, "launcher"));
  for (const [path, args, expected] of [
    ["scripts/write-atomic.mjs", [], /\[write-atomic\]/],
    ["scripts/brand-check.mjs", ["--bogus"], /unexpected argument: --bogus/],
    ["scripts/preview.mjs", ["--bogus"], /\[preview\]/],
    ["launcher/control.mjs", ["bogus"], /"state":"error"/],
  ]) {
    const result = spawnSync(process.execPath, [join(linkRoot, path), ...args], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 1, `${path}: ${result.stderr}`);
    assert.match(result.stdout + result.stderr, expected, path);
  }
});
