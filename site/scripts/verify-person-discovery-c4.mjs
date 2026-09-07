import { strict as assert } from "node:assert";
import { readdir, realpath, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { relative, resolve, sep } from "node:path";

const EXACT = Object.freeze({
  workspaces: 1, companies: 1, workspace_companies: 1, products: 1, market_plays: 1,
  customer_profiles: 2, offers: 1, profile_prospects: 1, prospect_review_decisions: 1,
  prospecting_schedules: 0, product_discovery_schedules: 0,
  person_discovery_runs: 1, person_discovery_run_events: 2,
  person_discovery_candidates: 2, person_discovery_provenance: 2,
  person_discovery_owner_decisions: 1, prospect_contact_role_relevance: 1,
  contacts: 1, contact_verification_intents: 2,
});
const FORBIDDEN = Object.freeze([
  "contact_point_observations", "contact_evidence_assignments", "contact_verification_receipts", "contact_eligibility_snapshots",
  "enrichment_budget_accounts", "enrichment_grant_issuance_events", "enrichment_grant_prospects", "enrichment_grants",
  "enrichment_reservation_budget_entries", "enrichment_reservation_events", "enrichment_reservations", "provider_quotes",
  "runner_budget_accounts", "runner_spend_grants", "runner_spend_reservation_events", "runner_spend_reservations",
  "outreach_artifact_bindings", "outreach_audit_records", "outreach_commands", "outreach_message_approval_consumptions",
  "outreach_message_approvals", "outreach_message_versions", "outreach_messages", "outreach_package_approvals",
  "outreach_package_versions", "outreach_packages", "outreach_stop_events", "outreach_suppression_tombstones",
  "outreach_outbox_events", "outreach_outbox_items", "outreach_sender_connections", "outreach_approval_revocations",
  "outreach_recipient_dispatch_authorities", "outreach_sender_capability_snapshots", "outreach_sender_verified_addresses",
  "outreach_unsubscribe_authority_events", "outreach_pre_call_recheck_receipts", "outreach_dispatch_attempt_preparations",
  "outreach_dispatch_attempt_preparation_events", "product_discovery_runs", "product_discovery_run_events", "product_discovery_submissions",
  "prospecting_signals", "prospecting_source_lineage", "runner_assignment_revocations", "phase_activation_gates",
]);
const ALLOWED_NONEMPTY = new Set([
  ...Object.keys(EXACT), "authority_commands", "audit_events", "typed_configurations", "product_discovery_configuration_prerequisites",
  "knowledge_items", "knowledge_versions", "interview_sessions", "interview_questions", "interview_answers", "knowledge_proposals",
  "proposal_decisions", "prospecting_runs", "runner_assignments", "runner_submissions", "prospecting_candidates", "qualification_assessments",
  "contacts_projection_generations", "csrf_tokens",
]);
const root = resolve(import.meta.dirname, ".."), state = requiredAfter("--state"), local = await realpath(resolve(root, ".local"));
const resolved = await realpath(resolve(state)); assertInside(local, resolved); assert.equal((await stat(resolved)).isDirectory(), true);
let application;
let objectRows = 0, multipartRows = 0;
for (const path of await walk(resolved)) if (path.endsWith(".sqlite")) {
  const db = new DatabaseSync(path, { readOnly: true });
  const has = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  if (has("_mf_objects")) objectRows += count(db, "_mf_objects");
  if (has("_mf_multipart_uploads")) multipartRows += count(db, "_mf_multipart_uploads");
  if (has("workspaces")) { if (application) throw new Error("multiple_application_databases"); application = db; } else db.close();
}
if (!application) throw new Error("application_database_not_found");
try {
  assert.equal(objectRows, 0, "R2 must remain empty"); assert.equal(multipartRows, 0, "R2 multipart state must remain empty");
  const tables = application.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => String(row.name));
  const applicationTables = tables.filter((table) => !table.startsWith("_cf_") && !table.startsWith("_mf_"));
  for (const table of FORBIDDEN) if (tables.includes(table)) assert.equal(count(application, table), 0, `${table} must remain empty`);
  for (const [table, expected] of Object.entries(EXACT)) { assert.ok(tables.includes(table), `${table} missing`); assert.equal(count(application, table), expected, `${table} exact synthetic count`); }
  for (const table of applicationTables) { const rows = count(application, table); if (rows > 0) assert.ok(ALLOWED_NONEMPTY.has(table), `unexpected nonempty table: ${table}`); }
  const candidate = application.prepare("SELECT display_name,role_title FROM person_discovery_candidates ORDER BY ordinal LIMIT 1").get();
  assert.deepEqual(candidate, Object.assign(Object.create(null), { display_name: "Jordan Synthetic", role_title: "Operations Director" }));
  const linkage = application.prepare("SELECT candidate_id,contact_id FROM person_discovery_owner_decisions").get();
  assert.notEqual(linkage.candidate_id, linkage.contact_id, "a suggestion row must never become a Contact row");
  const intentions = application.prepare("SELECT channel,intent FROM contact_verification_intents ORDER BY channel").all();
  assert.deepEqual(intentions.map((row) => `${row.channel}:${row.intent}`), ["email:initial_verification", "phone:initial_verification"]);
  process.stdout.write(`${JSON.stringify({ status: "passed", synthetic: true, migrationCount: 20, exact: EXACT, forbiddenRows: 0, r2Objects: objectRows, r2Multipart: multipartRows })}\n`);
} finally { application.close(); }

function count(db, table) { assert.match(table, /^[a-z_][a-z0-9_]*$/); return Number(db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count); }
function requiredAfter(flag) { const index = process.argv.indexOf(flag); const value = index >= 0 ? process.argv[index + 1] : undefined; if (!value) throw new Error("state_required"); return value; }
function assertInside(parent, child) { const path = relative(parent, child); if (!path || path === ".." || path.startsWith(`..${sep}`) || resolve(parent, path) !== child) throw new Error("c4_state_path_invalid"); }
async function walk(directory) { const result=[]; for (const entry of await readdir(directory,{withFileTypes:true})) { const path=resolve(directory,entry.name); if(entry.isSymbolicLink())throw new Error("c4_state_symlink_forbidden"); if(entry.isDirectory())result.push(...await walk(path)); else if(entry.isFile())result.push(path); } return result; }
