import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("greenfield production composition has no direct outreach provider or static call/mail effect", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for (const packageName of ["googleapis", "@googleapis/gmail", "nodemailer", "twilio", "@sendgrid/mail"]) {
    assert.equal(dependencies[packageName], undefined, `${packageName} must remain absent before provider authorization`);
  }

  const runtimeFiles = [
    ...(await sourceFiles(join(root, "app"))),
    ...(await sourceFiles(join(root, "domain"))),
    ...(await sourceFiles(join(root, "adapters"))),
  ];
  const productionFiles = [
    ...runtimeFiles,
    ...(await sourceFiles(join(root, "preparation"))),
    join(root, "wrangler.local.jsonc"),
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
  for (const file of runtimeFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /(?:^|["'/])preparation\//mu, `${file} must not compose any preparation-only module`);
  }
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".ts", ".tsx", ".js", ".mjs", ".json", ".jsonc"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}
