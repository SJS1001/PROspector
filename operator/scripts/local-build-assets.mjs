/** Nitro bundles JS; PGlite also needs these package-supplied WASM assets beside it. */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = dirname(fileURLToPath(import.meta.resolve("@electric-sql/pglite")));
const target = join(root, ".output/server/_libs");
mkdirSync(target, { recursive: true });
for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"])
  copyFileSync(join(source, file), join(target, file));
console.log("Local PGlite runtime assets copied.");
