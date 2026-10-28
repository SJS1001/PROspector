#!/usr/bin/env node
// Run both existing npm-test stages even when the script stage fails. Keep the
// release acceptance contracts separate: they intentionally expose A/B/C gaps.
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
// Include existing vault and qualify-Jev regressions omitted by npm test's list.
const groups = [
  ['scripts', ['--test', ...collect('scripts', '.test.mjs')]],
  ['domain/auth/retrieval + additional source regressions', ['--experimental-strip-types', '--test', ...collect('src', '.test.ts')]],
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
