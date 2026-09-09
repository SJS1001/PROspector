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
  // The rsc environment emits unminified output, so an unreachable statement is
  // still carried into the artifact -- folding alone is not enough. Both of
  // these therefore sit inside branches whose *whole block* is eliminated: the
  // demo identity behind a positive `if (import.meta.env.DEV && ...)` gate that
  // dynamic-imports app/_local-demo-identity, and the test-port symbol behind
  // the `import.meta.env.PROD` guard that collapses to `return false`.
  assertAbsent(files, [
    { pattern: "local-owner@prospector.invalid", label: "app/_local-demo-identity.ts LOCAL_DEMO_IDENTITY" },
    { pattern: "prospector.person-discovery.test-port", label: "domain/person-discovery.ts:579 test-port symbol key" },
  ], "the build-mode gate folded but the dead branch was not eliminated");
});

test("the production build does not emit the local-demo routes", async () => {
  const files = await deployedTextFiles();
  // The route files stay routable in every mode -- vinext discovers them from
  // the filesystem -- so each one is a thin dev-gated shell whose body lives in
  // a sibling `_`-prefixed module reached only by a dynamic import inside an
  // `import.meta.env.DEV` branch. That branch folds away in a production build
  // and Rollup drops the chunk, so the markup never reaches `dist/` and the
  // routes answer like any unknown path. Before that split, `/local-demo`
  // served 200 with LOCAL_DEMO-branded HTML and no identity check at all.
  assertAbsent(files, [
    { pattern: "data-local-demo-visible", label: "app/local-demo/_screen.tsx:49" },
    { pattern: "Local demo interview", label: "app/local-demo/_screen.tsx:52" },
    { pattern: "synthetic_seed_failed", label: "app/api/local-demo/person-discovery-c4/_handler.ts:17" },
  ], "a local-demo route module reached the deployed artifact");
});

test("the production build does not emit the CRM preview fixture", async () => {
  const files = await deployedTextFiles();
  // The CRM preview screen and its fictional rows are also reachable only
  // through a dev-gated dynamic import. Keep representative markers from both
  // modules here so a future eager/static import cannot silently publish the
  // local-demo response shape or its synthetic contact values.
  assertAbsent(files, [
    { pattern: "crm_handoff_local_demo_preview", label: "CRM preview response kind" },
    { pattern: "fictional.buyer@example.test", label: "CRM preview synthetic contact value" },
    { pattern: "FICTIONAL · NOT APPROVED FOR EXPORT", label: "CRM preview screen banner" },
  ], "the CRM handoff local-demo fixture reached the deployed artifact");
});

test("the production build does not emit the E1 operator-journey fixture", async () => {
  const files = await deployedTextFiles();
  // domain/operator-journey-e1-acceptance.ts is reachable only from the
  // dev-gated seed route, and its `operatorJourneyE1Enabled` guard is a
  // cross-function check the bundler does not constant-propagate, so the
  // fixture literals would survive if the route ever reached the artifact.
  assertAbsent(files, [
    { pattern: "synthetic-zero-network-e1-v1", label: "OPERATOR_JOURNEY_E1_BINDING_VALUE" },
    { pattern: "e1-qualified-prospect", label: "OPERATOR_JOURNEY_E1_PROSPECT_ID" },
    { pattern: "Synthetic Terminal Operator", label: "domain/operator-journey-e1-acceptance.ts synthetic organization" },
    { pattern: "Synthetic Operations Site", label: "domain/operator-journey-e1-acceptance.ts synthetic target" },
  ], "an E1 operator-journey fixture reached the deployed artifact");
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
    { pattern: "synthetic-local-verification", label: "domain/person-discovery-c4-verification.ts synthetic provider" },
    { pattern: "person-discovery-c4-attestation-key-v1", label: "domain/person-discovery-c4-verification.ts synthetic attestor material" },
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
