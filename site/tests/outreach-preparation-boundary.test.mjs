import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("greenfield production composition has no direct outreach provider or static call/mail effect", async () => {
  await assertProductionComposition(root);
});

test("worker source is guarded against nested provider patterns and all preparation import forms", async () => {
  const cases = [
    ["nested provider endpoint", "worker/nested/provider.mjs", 'const endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages";\n', /provider\/effect free/],
    ["static preparation import", "worker/nested/static.mjs", 'import "../../preparation/outreach-artifacts";\n', /must not compose any preparation-only module/],
    ["dynamic preparation import", "worker/nested/dynamic.mjs", 'await import("../../preparation/outreach-artifacts");\n', /must not compose any preparation-only module/],
    ["preparation re-export", "worker/nested/re-export.mjs", 'export { buildOutreachPackage } from "../../preparation/outreach-artifacts";\n', /must not compose any preparation-only module/],
  ];

  for (const [name, relativePath, source, expected] of cases) {
    await withFixture(async (fixture) => {
      await writeFixtureFile(fixture, relativePath, source);
      await assert.rejects(() => assertProductionComposition(fixture), expected, name);
    });
  }
});

test("an absent worker directory is safe, while unrelated filesystem errors are not hidden", async () => {
  await withFixture(async (fixture) => {
    await assert.doesNotReject(() => assertProductionComposition(fixture));
  });

  await withFixture(async (fixture) => {
    await writeFixtureFile(fixture, "worker", "not a directory\n");
    await assert.rejects(() => assertProductionComposition(fixture), { code: "ENOTDIR" });
  });
});

async function assertProductionComposition(projectRoot) {
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for (const packageName of ["googleapis", "@googleapis/gmail", "nodemailer", "twilio", "@sendgrid/mail"]) {
    assert.equal(dependencies[packageName], undefined, `${packageName} must remain absent before provider authorization`);
  }

  const runtimeFiles = [
    ...(await sourceFiles(join(projectRoot, "app"))),
    ...(await sourceFiles(join(projectRoot, "domain"))),
    ...(await sourceFiles(join(projectRoot, "adapters"))),
    ...(await sourceFiles(join(projectRoot, "worker"), { optional: true })),
  ];
  const productionFiles = [
    ...runtimeFiles,
    ...(await sourceFiles(join(projectRoot, "preparation"))),
    join(projectRoot, "wrangler.local.jsonc"),
  ];
  const forbidden = [
    /gmail\.googleapis\.com/i,
    /api\.twilio\.com/i,
    /\bGMAIL_(?:CLIENT|SECRET|TOKEN|REFRESH|OAUTH)/,
    /\bTWILIO_(?:SID|TOKEN|SECRET)/,
    /(?:href\s*=\s*["']|new URL\s*\(\s*["'])(?:mailto|tel):/i,
  ];
  for (const file of productionFiles) {
    const source = await readFile(file, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} must remain provider/effect free`);
    }
  }
  // This lexical guard deliberately covers import forms, not all JavaScript indirection.
  for (const file of runtimeFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /(?:^|["'/])preparation\//mu, `${file} must not compose any preparation-only module`);
  }
}

async function sourceFiles(directory, { optional = false } = {}) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (optional && error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".ts", ".tsx", ".js", ".mjs", ".json", ".jsonc"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

async function withFixture(run) {
  const fixture = await mkdtemp(join(tmpdir(), "prospector-outreach-boundary-"));
  try {
    await Promise.all([
      writeFixtureFile(fixture, "package.json", '{"dependencies":{},"devDependencies":{}}\n'),
      writeFixtureFile(fixture, "wrangler.local.jsonc", "{}\n"),
      mkdir(join(fixture, "app"), { recursive: true }),
      mkdir(join(fixture, "domain"), { recursive: true }),
      mkdir(join(fixture, "adapters"), { recursive: true }),
      mkdir(join(fixture, "preparation"), { recursive: true }),
    ]);
    await run(fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

async function writeFixtureFile(rootDirectory, relativePath, source) {
  const path = join(rootDirectory, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source);
}
