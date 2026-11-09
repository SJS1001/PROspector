#!/usr/bin/env node
// `npm test`: run every test group even when an earlier group fails, and exit
// non-zero if any group failed. Keep the release acceptance contracts separate:
// they intentionally expose A/B/C gaps and many need loopback or a browser.
// Only the OpenRouter settings keyboard contract, which npm test has always
// run, is included from acceptance/.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
function collect(dir, suffix) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path, suffix) : entry.name.endsWith(suffix) ? [path] : [];
  }).sort();
}
// Every src/**/*.test.ts file is collected, so new source tests cannot be skipped.
const sourceTests = collect('src', '.test.ts');
const groups = [
  ['scripts', ['--test', ...collect('scripts', '.test.mjs')]],
  [`source (${sourceTests.length} src/**/*.test.ts files)`, ['--experimental-strip-types', '--test', ...sourceTests]],
  ['acceptance: OpenRouter settings keyboard', ['--test', 'acceptance/keyboard/openrouter-settings.test.mjs']],
];
let failed = false;
for (const [name, args] of groups) {
  console.log(`\n[operator tests] ${name}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 180_000 });
  const exit = result.status ?? 1;
  console.log(`[operator tests] ${name}: exit ${exit}${result.signal ? ` (${result.signal})` : ''}`);
  if (result.error) console.error(`[operator tests] ${result.error.code || 'spawn failed'}`);
  if (exit !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
