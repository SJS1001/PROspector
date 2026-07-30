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
const HELP = `Phase 2 consensus_knowledge gate\n\nUsage: node scripts/phase2-gate.mjs inspect --database <name-or-id> --workspace-id <opaque-id>\n       node scripts/phase2-gate.mjs activate --database <name-or-id> --workspace-id <opaque-id> --capability consensus_knowledge --authorization-reference <ref> --target-project-deployment <ref> --reviewed-source-digest <sha256-ref> --migration-identity-status <ref> --post-migration-evidence-reference <ref> --independent-review-reference <ref> --deployed-boundary-proof-reference <ref>\n\nInspect is read-only. Activate writes one immutable exact tuple; it is reserved for the separately authorized Plan 19 release step. Values are never printed.\n`;

export function tupleDigest(tuple) { return createHash("sha256").update(CANONICAL_FIELDS.map((field) => `${field}=${tuple[field]}`).join("\n"), "utf8").digest("hex"); }
function assertEvidenceRelations(result) {
  if (!result.target_project_deployment.startsWith("appgprj_") || !result.target_project_deployment.includes("~appgdep_")) throw new Error("target_project_deployment_mismatch");
  if (!/^sha256:[a-f0-9]{64}$/u.test(result.reviewed_source_digest)) throw new Error("reviewed_source_digest_mismatch");
  if (!result.migration_identity_status.startsWith("0004:")) throw new Error("migration_identity_status_mismatch");
  if (!result.authorization_reference.startsWith("authorization-")) throw new Error("authorization_reference_mismatch");
  for (const field of ["post_migration_evidence_reference", "independent_review_reference", "deployed_boundary_proof_reference"]) if (!/^(post-migration-proof|independent-review|deployed-boundary-proof)-/u.test(result[field])) throw new Error(`${field}_mismatch`);
}
export function parseGateArgs(args) {
  const [action, ...rest] = args;
  if (action === "--help" || action === "-h") return { help: true };
  if (!new Set(["inspect", "activate"]).has(action)) throw new Error("unsupported_action");
  const result = { action };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]; const value = rest[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error("invalid_argument");
    const key = flag.slice(2).replaceAll("-", "_");
    if (!new Set(["database", "workspace_id", ...CANONICAL_FIELDS]).has(key) || key in result) throw new Error("unsupported_argument");
    result[key] = value;
  }
  const required = action === "activate" ? ["database", "workspace_id", ...CANONICAL_FIELDS] : ["database", "workspace_id"];
  if (required.some((field) => !result[field] || !SAFE_VALUE.test(result[field]) || /(?:pending|blocked|human_needed|null|undefined)/iu.test(result[field]))) throw new Error("incomplete_or_unsafe_tuple");
  if (action === "activate" && result.capability !== "consensus_knowledge") throw new Error("unsupported_capability");
  if (action === "activate") assertEvidenceRelations(result);
  return result;
}
function sqlValue(value) { if (!SAFE_VALUE.test(value)) throw new Error("unsafe_value"); return `'${value}'`; }
export function buildGateCommands(options) {
  const inspect = `SELECT capability, tuple_digest FROM phase_activation_gates WHERE workspace_id = ${sqlValue(options.workspace_id)} AND capability = 'consensus_knowledge' LIMIT 2`;
  if (options.action === "inspect") return [{ args: ["d1", "execute", options.database, "--remote", "--json", "--command", inspect] }];
  const digest = tupleDigest(options);
  const columns = ["id", "workspace_id", ...CANONICAL_FIELDS, "tuple_digest", "accepted_at", "created_at"];
  const values = ["lower(hex(randomblob(16)))", sqlValue(options.workspace_id), ...CANONICAL_FIELDS.map((field) => sqlValue(options[field])), sqlValue(digest), "unixepoch() * 1000", "unixepoch() * 1000"];
  const insert = `INSERT INTO phase_activation_gates (${columns.join(", ")}) SELECT ${values.join(", ")} WHERE NOT EXISTS (SELECT 1 FROM phase_activation_gates WHERE workspace_id = ${sqlValue(options.workspace_id)} AND capability = 'consensus_knowledge')`;
  return [{ args: ["d1", "execute", options.database, "--remote", "--json", "--command", inspect] }, { args: ["d1", "execute", options.database, "--remote", "--json", "--command", insert] }];
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
async function main() { const options = parseGateArgs(process.argv.slice(2)); if (options.help) return process.stdout.write(HELP); const commands = buildGateCommands(options); const first = await execFile("npx", ["wrangler", ...commands[0].args], { cwd: new URL(".", import.meta.url) }); if (options.action === "inspect") process.stdout.write(`${JSON.stringify({ ok: true, status: inspectStatus(inspectRowsFromWrangler(first.stdout)) })}\n`); else await execFile("npx", ["wrangler", ...commands[1].args], { cwd: new URL(".", import.meta.url) }); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`${JSON.stringify({ ok: false, status: "blocked", reason: error.message })}\n`); process.exitCode = 1; });
