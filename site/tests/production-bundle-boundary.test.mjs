import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import test from "node:test";

// Every LOCAL_DEMO gate in this application is a *build-time* gate: it rests on
// Vite replacing `import.meta.env.DEV` / `import.meta.env.PROD` with a literal
// and the bundler then discarding the dead branch. Nothing else in the suite
// reads the production bundle -- `tests/rendered-html.test.mjs` only `access()`es
// `dist/server/index.js`, and `scripts/greenfield-target-config.mjs` only
// SHA-256s the tree, which digests a leaking bundle just as happily as a clean
// one. These tests assert the boundary against the emitted artifact itself.
//
// `npm test` runs `npm run build` before the suite, so `dist/` is present.

const root = resolve(import.meta.dirname, "..");

// Only the two directories that are actually deployed: `dist/server/index.js` is
// the Worker `main` and `dist/client` is the assets directory, per
// scripts/greenfield-target-config.mjs. `dist/.openai` is build metadata and
// migrations, not executable output.
const DEPLOYED_DIRECTORIES = ["dist/server", "dist/client"];

const BINARY_EXTENSIONS = new Set([
  ".avif", ".br", ".eot", ".gif", ".gz", ".ico", ".jpeg", ".jpg", ".mp4",
  ".otf", ".pdf", ".png", ".ttf", ".wasm", ".webp", ".woff", ".woff2", ".zip",
]);

// Source maps are excluded from the text scan and asserted separately: a map
// republishes the original TypeScript verbatim, so scanning it would fail every
// other test here for a reason that has nothing to do with constant folding.
const SOURCE_MAP_EXTENSION = ".map";

test("the production build inlines every import.meta.env build-mode gate", async () => {
  const files = await deployedTextFiles();
  // A surviving DEV/PROD lookup means the artifact was not built in production
  // mode (`vinext build --mode development`, a stray NODE_ENV=development), or
  // that this environment does not inline import.meta.env at all. The second
  // case is not uniformly fail-closed: domain/person-discovery.ts:578 guards
  // with `import.meta.env.PROD`, so an un-inlined `undefined` is falsy and
  // *opens* synthetic-port acceptance at the same moment every DEV gate closes.
  assertAbsent(files, [
    { pattern: /import\s*\.\s*meta\s*\.\s*env\s*\.\s*(?:DEV|PROD)\b/, label: "import.meta.env.DEV/PROD property access" },
    { pattern: /import\s*\.\s*meta\s*\.\s*env\s*\[\s*["'](?:DEV|PROD)["']\s*\]/, label: "import.meta.env['DEV'|'PROD'] index access" },
  ], "the build did not resolve to production mode, so every LOCAL_DEMO gate is still live");
});

test("the production build emits no source map that would republish demo source", async () => {
  const emitted = await deployedFiles();
  const maps = emitted.filter((file) => file.path.endsWith(SOURCE_MAP_EXTENSION));
  assert.deepEqual(
    maps.map((file) => file.path),
    [],
    "source maps carry the original TypeScript, including every LOCAL_DEMO constant, into the deployed artifact",
  );
});

test("the production build folds away the LOCAL_DEMO identity and synthetic-port constants", async () => {
  const files = await deployedTextFiles();
  // These live behind gates the bundler can fold within a single function body,
  // so they are the direct read on whether dead-code elimination actually ran.
  // Observed on 0b7935ce: the folds are correct -- resolveRuntimeIdentity ends
  // `|| true) return null` and isTestPersonDiscoveryPort collapses to
  // `return false` -- but the rsc environment emits unminified output, so the
  // now-unreachable DEMO constant is still carried into dist/server/index.js.
  assertAbsent(files, [
    { pattern: "local-owner@prospector.invalid", label: "app/runtime-identity.ts:9 DEMO identity" },
    { pattern: "prospector.person-discovery.test-port", label: "domain/person-discovery.ts:579 test-port symbol key" },
  ], "the build-mode gate folded but the dead branch was not eliminated");
});

test("the production build does not emit the local-demo routes", async () => {
  const files = await deployedTextFiles();
  // app/local-demo/page.tsx and app/api/local-demo/person-discovery-c4/route.ts
  // carry no import.meta.env reference at all. They are file-system routes, so
  // nothing currently keeps them out of a production route table: `/local-demo`
  // answers 200 with LOCAL_DEMO-branded HTML and no identity check whatsoever.
  // Constant folding cannot fix this; the routes have to be excluded from the
  // production build.
  assertAbsent(files, [
    { pattern: "data-local-demo-visible", label: "app/local-demo/page.tsx:49" },
    { pattern: "Local demo interview", label: "app/local-demo/page.tsx:52" },
    { pattern: "synthetic_seed_failed", label: "app/api/local-demo/person-discovery-c4/route.ts:15" },
  ], "a local-demo route module reached the deployed artifact");
});

test("the production build does not emit the C4 synthetic acceptance fixtures", async () => {
  const files = await deployedTextFiles();
  // domain/person-discovery-c4-acceptance.ts is reachable from the local-demo
  // route above, and its `if (!personDiscoveryC4Enabled(...)) return undefined`
  // is a cross-function guard the bundler does not constant-propagate. So the
  // synthetic candidate literals and seed fixtures survive even when the gate
  // itself folds correctly. Excluding the routes removes these with them.
  assertAbsent(files, [
    { pattern: "synthetic-zero-network-c4-v1", label: "PERSON_DISCOVERY_C4_BINDING_VALUE" },
    { pattern: "c4-approved-prospect", label: "PERSON_DISCOVERY_C4_PROSPECT_ID" },
    { pattern: "Jordan Synthetic", label: "PERSON_DISCOVERY_C4_CONTACT_NAME" },
    { pattern: "Morgan Synthetic", label: "supporting synthetic candidate" },
    { pattern: "prospector.person-discovery.c4-acceptance", label: "domain/person-discovery-c4-acceptance.ts:33 synthetic port symbol key" },
  ], "synthetic acceptance fixture data reached the deployed artifact");
});

function assertAbsent(files, markers, why) {
  const findings = [];
  for (const { path, text } of files) {
    for (const { pattern, label } of markers) {
      const index = typeof pattern === "string"
        ? text.indexOf(pattern)
        : text.search(pattern);
      if (index !== -1) findings.push(`${path} @${index} — ${label}`);
    }
  }
  assert.deepEqual(findings, [], `${why}:\n  ${findings.join("\n  ")}`);
}

async function deployedTextFiles() {
  return (await deployedFiles()).filter((file) => file.text !== null);
}

async function deployedFiles() {
  const files = [];
  for (const directory of DEPLOYED_DIRECTORIES) {
    await walk(resolve(root, directory), files);
  }
  assert.ok(
    files.length > 0,
    `${DEPLOYED_DIRECTORIES.join(" and ")} are empty; run \`npm run build\` before this suite`,
  );
  return files;
}

async function walk(directory, files) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      assert.fail(`${relative(root, directory)} is missing; run \`npm run build\` before this suite`);
    }
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = relative(root, path).split(sep).join("/");
    files.push({
      path: relativePath,
      text: isScannable(entry.name) ? await readFile(path, "utf8") : null,
    });
  }
}

function isScannable(name) {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return true;
  const extension = name.slice(dot).toLowerCase();
  return extension !== SOURCE_MAP_EXTENSION && !BINARY_EXTENSIONS.has(extension);
}
