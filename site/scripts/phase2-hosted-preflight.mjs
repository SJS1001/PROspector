#!/usr/bin/env node

import { execFile as nativeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(nativeExecFile);
const MODES = new Set(["old-schema", "post-migration", "inspect-gate"]);
const SAFE_DATABASE = /^[A-Za-z0-9_-]{1,96}$/u;
const FORBIDDEN_SQL = /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|ATTACH|DETACH|VACUUM)\b/iu;
const HELP = `Phase 2 hosted D1 preflight (read-only)\n\nUsage: node scripts/phase2-hosted-preflight.mjs --mode old-schema|post-migration|inspect-gate --database <name-or-id>\n\nThis command executes only fixed SELECT/PRAGMA evidence queries and reports statuses, counts, migration IDs, timestamps, and opaque digests. It never prints rows, identifiers, source content, or secrets.\n`;

export function parsePreflightArgs(args) {
  const options = { mode: "", database: "", help: false };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--help" || key === "-h") options.help = true;
    else if (key === "--mode" || key === "--database") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${key.slice(2).replaceAll("-", "_")}_required`);
      options[key.slice(2)] = value;
    } else throw new Error("unsupported_argument");
  }
  if (!options.help && !MODES.has(options.mode)) throw new Error("unsupported_mode");
  if (!options.help && (!SAFE_DATABASE.test(options.database) || /[\r\n\0]/u.test(options.database))) throw new Error("invalid_database");
  return options;
}

function command(database, sql) {
  if (FORBIDDEN_SQL.test(sql) || !/^(SELECT|PRAGMA)/u.test(sql)) throw new Error("unsafe_internal_query");
  return { args: ["d1", "execute", database, "--remote", "--json", "--command", sql] };
}

export function buildPreflightCommands({ mode, database }) {
  const migrationCommand = { args: ["d1", "migrations", "list", database, "--remote", "--json"] };
  // The child process retains digest values; only their local SHA-256 summary may be emitted.
  const protectedDigestQuery = "SELECT proposal_digest AS value FROM interview_answers UNION ALL SELECT operation_digest AS value FROM interview_confirmations UNION ALL SELECT source_digest AS value FROM knowledge_versions ORDER BY value";
  const absentGateQuery = "SELECT COUNT(*) AS gate_count FROM phase_activation_gates WHERE capability = 'consensus_knowledge'";
  if (mode === "old-schema") return [migrationCommand, command(database, protectedDigestQuery), command(database, "SELECT COUNT(*) AS foreign_key_violations FROM pragma_foreign_key_check")];
  if (mode === "post-migration") return [migrationCommand, command(database, protectedDigestQuery), command(database, "SELECT COUNT(*) AS foreign_key_violations FROM pragma_foreign_key_check"), command(database, "SELECT COUNT(*) AS binding_count FROM interview_authority_bindings"), command(database, "SELECT COUNT(*) AS quarantine_count FROM interview_authority_review WHERE status = 'review_required'"), command(database, absentGateQuery)];
  return [command(database, absentGateQuery)];
}

export function redactPreflightReport(report) {
  const expected = report.mode === "old-schema" ? ["0000", "0001", "0002", "0003"] : report.mode === "post-migration" ? ["0000", "0001", "0002", "0003", "0004"] : undefined;
  if (expected && JSON.stringify(report.migrationIds) !== JSON.stringify(expected)) throw new Error("migration_chain_mismatch");
  if (typeof report.protectedDigest !== "undefined" && !/^[a-f0-9]{64}$/u.test(report.protectedDigest)) throw new Error("invalid_protected_digest");
  return Object.fromEntries(Object.entries(report).filter(([key, value]) => ["mode", "migrationIds", "protectedDigest", "bindingCount", "quarantineCount", "gateCount", "foreignKeyViolations", "checkedAt"].includes(key) && (typeof value === "number" || typeof value === "string" || Array.isArray(value))).concat([["ok", true]]));
}

async function main() {
  const options = parsePreflightArgs(process.argv.slice(2));
  if (options.help) return process.stdout.write(HELP);
  for (const item of buildPreflightCommands(options)) await execFile("npx", ["wrangler", ...item.args], { cwd: new URL(".", import.meta.url) });
  // Release invocations are deliberately fail-closed until their owning hosted plan
  // supplies a reviewed result adapter. Raw Wrangler stdout is never forwarded.
  throw new Error("release_result_adapter_required");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, status: "blocked", reason: error.message })}\n`); process.exitCode = 1; });
