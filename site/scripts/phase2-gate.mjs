#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile as nativeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(nativeExecFile);
export const CANONICAL_FIELDS = ["capability", "authorization_reference", "target_project_deployment", "reviewed_source_digest", "migration_identity_status", "post_migration_evidence_reference", "independent_review_reference", "deployed_boundary_proof_reference"];
export const CONSENSUS_KNOWLEDGE_SCOPE = Object.freeze({
  intake: "import_plain_text",
  encoding: "utf-8",
  maximumBytes: 8192,
  destination: "Proposed Knowledge",
  excluded: Object.freeze(["multipart", "file_upload", "import_batch", "filename_authority", "path_authority", "html_parser", "binary_parser", "operational_import"]),
});
const SAFE_VALUE = /^[A-Za-z0-9._:/~-]{3,512}$/u;
const HELP = `Phase 2 consensus_knowledge gate\n\nUsage: node scripts/phase2-gate.mjs inspect --database <name-or-id> --workspace-id <opaque-id>\n\nInspect is read-only. Activation is deliberately unavailable until a trusted server-side authorization anchor is designed, reviewed, and deployed. Values are never printed.\n`;

export function tupleDigest(tuple) { return createHash("sha256").update(CANONICAL_FIELDS.map((field) => `${field}=${tuple[field]}`).join("\n"), "utf8").digest("hex"); }
export function parseGateArgs(args) {
  const [action, ...rest] = args;
  if (action === "--help" || action === "-h") return { help: true };
  if (action === "activate") throw new Error("activation_not_authorized");
  if (action !== "inspect") throw new Error("unsupported_action");
  const result = { action };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]; const value = rest[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error("invalid_argument");
    const key = flag.slice(2).replaceAll("-", "_");
    if (!new Set(["database", "workspace_id", ...CANONICAL_FIELDS]).has(key) || key in result) throw new Error("unsupported_argument");
    result[key] = value;
  }
  const required = ["database", "workspace_id"];
  if (required.some((field) => !result[field] || !SAFE_VALUE.test(result[field]) || /(?:pending|blocked|human_needed|null|undefined)/iu.test(result[field]))) throw new Error("incomplete_or_unsafe_tuple");
  return result;
}
function sqlValue(value) { if (!SAFE_VALUE.test(value)) throw new Error("unsafe_value"); return `'${value}'`; }
export function buildGateCommands(options) {
  const inspect = `SELECT capability, tuple_digest FROM phase_activation_gates WHERE workspace_id = ${sqlValue(options.workspace_id)} AND capability = 'consensus_knowledge' LIMIT 2`;
  return [{ args: ["d1", "execute", options.database, "--remote", "--json", "--command", inspect] }];
}
export function inspectStatus(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "absent";
  if (rows.length !== 1 || rows[0]?.capability !== "consensus_knowledge" || !/^[a-f0-9]{64}$/u.test(rows[0]?.tuple_digest ?? "")) return "overbroad";
  return "exact";
}
export function inspectRowsFromWrangler(stdout) {
  const parsed = JSON.parse(stdout);
  const rows = parsed?.[0]?.results ?? parsed?.result?.[0]?.results ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({ capability: row?.capability, tuple_digest: row?.tuple_digest }));
}
async function main() { const options = parseGateArgs(process.argv.slice(2)); if (options.help) return process.stdout.write(HELP); const commands = buildGateCommands(options); const first = await execFile("npx", ["wrangler", ...commands[0].args], { cwd: new URL(".", import.meta.url) }); process.stdout.write(`${JSON.stringify({ ok: true, status: inspectStatus(inspectRowsFromWrangler(first.stdout)) })}\n`); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, status: "blocked", reason: error.message })}\n`); process.exitCode = 1; });
