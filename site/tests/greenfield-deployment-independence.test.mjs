import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("deployable source and build metadata remain independent of every retired target", async () => {
  const hostingPath = resolve(root, ".openai/hosting.json");
  const hostingSource = await readFile(hostingPath, "utf8");
  const hosting = JSON.parse(hostingSource);

  assert.deepEqual(hosting, { d1: "DB", r2: "FILES" });

  const deployableSources = await Promise.all([
    readFile(resolve(root, "vite.config.ts"), "utf8"),
    readFile(resolve(root, "build/sites-vite-plugin.ts"), "utf8"),
    readFile(resolve(root, "db/index.ts"), "utf8"),
    readFile(resolve(root, "worker/index.ts"), "utf8"),
  ]);

  for (const source of [hostingSource, ...deployableSources]) {
    assert.doesNotMatch(source, /appgprj_[a-z0-9]+/i);
    assert.doesNotMatch(source, /["']project_id["']/i);
  }

  const builtHosting = JSON.parse(
    await readFile(resolve(root, "dist/.openai/hosting.json"), "utf8"),
  );
  assert.deepEqual(builtHosting, { d1: "DB", r2: "FILES" });
});

test("the generated D1 migration path resolves to the checked repository chain", async () => {
  const wranglerPath = resolve(root, "dist/server/wrangler.json");
  const wrangler = JSON.parse(await readFile(wranglerPath, "utf8"));
  const database = wrangler.d1_databases?.find((entry) => entry.binding === "DB");

  assert.ok(database, "the generated deployment manifest must bind D1 as DB");
  assert.equal(database.migrations_dir, "../../drizzle");

  const migrationDirectory = resolve(root, "dist/server", database.migrations_dir);
  for (let index = 0; index <= 9; index += 1) {
    const prefix = index.toString().padStart(4, "0");
    const journal = JSON.parse(
      await readFile(resolve(root, "drizzle/meta/_journal.json"), "utf8"),
    );
    const tag = journal.entries.find((entry) => entry.idx === index)?.tag;
    assert.ok(tag?.startsWith(prefix), `missing checked migration ${prefix}`);
    await access(resolve(migrationDirectory, `${tag}.sql`));
  }
});

test("the hosted shell has no runtime font CDN dependency", async () => {
  const layout = await readFile(resolve(root, "app/layout.tsx"), "utf8");
  const styles = await readFile(resolve(root, "app/globals.css"), "utf8");

  assert.doesNotMatch(layout, /next\/font\/google|Geist(?:_Mono)?\s*\(/);
  assert.match(styles, /--font-geist-sans:\s*-apple-system/);
  assert.match(styles, /--font-geist-mono:\s*ui-monospace/);
});
