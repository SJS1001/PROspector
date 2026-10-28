import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "../../node_modules/typescript/lib/typescript.js";
import { STUB_NAMES } from "./stubs.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const files =
  `src/lib/server/fns.ts src/lib/server/discover.ts src/lib/server/hunt.ts src/lib/server/reveal.ts src/lib/server/secrets.ts src/lib/server/vault.ts src/lib/server/manual-workflow.ts src/lib/server/profile.ts src/lib/server/toronto.ts src/lib/server/seed.ts src/lib/server/archive.ts src/lib/server/archive-db.ts src/lib/server/archive-request.ts src/lib/domain/catalog.ts src/lib/domain/types.ts src/lib/domain/llm.ts src/lib/domain/qualify.ts src/lib/domain/qualify-jev.ts src/lib/auth/middleware.ts src/lib/auth/isolation.server.ts src/lib/auth/verify.server.ts src/lib/auth/server.ts src/lib/auth/pglite-dialect.ts src/lib/auth/local-request.ts src/lib/db.ts scripts/local-owner.mjs scripts/local-data.mjs scripts/migration-plan.mjs`.split(
    " ",
  );
const allowed = new Set(files);
const external = new Set([
  "node:crypto",
  "node:fs",
  "node:fs/promises",
  "node:path",
  "node:os",
  "node:url",
  "@tanstack/react-start",
  "@tanstack/react-start/server",
  "better-auth",
  "better-auth/crypto",
  "kysely",
  "@electric-sql/pglite",
  "pg",
]);
export function auditGraph() {
  const seen = new Map();
  function visit(path) {
    const name = relative(root, path).replaceAll("\\", "/");
    if (seen.has(name)) return;
    if (!allowed.has(name)) throw new Error("Unreviewed runtime source: " + name);
    const text = readFileSync(path, "utf8");
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const imports = [];
    function walk(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && !node.importClause?.isTypeOnly && !node.isTypeOnly)
          imports.push(node.moduleSpecifier.text);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]))
          throw new Error("Nonliteral dynamic import: " + name);
        imports.push(node.arguments[0].text);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
    seen.set(name, {
      path: name,
      sha256: createHash("sha256").update(text).digest("hex"),
      imports: [...new Set(imports)].sort(),
    });
    for (const specifier of imports) {
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const target = specifier.startsWith("@/")
          ? resolve(root, "src", specifier.slice(2))
          : resolve(dirname(path), specifier);
        const resolved = [target, target + ".ts", target + ".mjs"].find(existsSync);
        if (!resolved) throw new Error("Unresolved source import: " + specifier);
        if (STUB_NAMES.some((n) => resolved === resolve(root, "src/lib/server", n + ".ts")))
          continue;
        visit(resolved);
      } else if (!external.has(specifier))
        throw new Error("Unreviewed runtime package: " + specifier);
    }
  }
  visit(resolve(root, "src/lib/server/fns.ts"));
  visit(resolve(root, "src/lib/auth/server.ts"));
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(auditGraph(), null, 2));
