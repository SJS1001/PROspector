import { readFile } from "node:fs/promises";

export const LEDGER_START = "<!-- completion-ledger:v1 -->";
export const LEDGER_END = "<!-- /completion-ledger:v1 -->";
export const CANONICAL_REQUIREMENT_IDS = [
  "REQ-private-human-governed-gtm",
  "REQ-company-workspace-isolation",
  "REQ-commercial-hierarchy",
  "REQ-consensus-interview",
  "REQ-versioned-knowledge-and-drift",
  "REQ-product-readiness",
  "REQ-market-discovery",
  "REQ-profile-readiness",
  "REQ-deterministic-qualification",
  "REQ-evidence-provenance",
  "REQ-untrusted-runner-boundary",
  "REQ-controlled-enrichment",
  "REQ-contact-verification",
  "REQ-immutable-outreach-approval",
  "REQ-hard-company-suppression",
  "REQ-crm-and-workspace-exports",
  "REQ-initial-operating-target",
];

const STATUSES = new Set(["open", "in_progress", "verified"]);
const ASSESSMENTS = new Set(["assessed", "not_assessed", "stale", "insufficient"]);
const PROJECTS = new Set(["prospector", "distributor", "digitalrain"]);
const COVERAGE = new Set(["complete", "partial", "unknown"]);
const SHA = /^[0-9a-f]{40}$/;

function iso(value, label, errors) {
  if (value === null) return;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) errors.push(`${label} is not an ISO timestamp or null`);
}

export function parseLedger(markdown) {
  const starts = markdown.split(LEDGER_START).length - 1;
  const ends = markdown.split(LEDGER_END).length - 1;
  if (starts !== 1 || ends !== 1) {
    return { ledger: null, errors: ["the ledger must contain exactly one completion-ledger:v1 marker pair"] };
  }
  const region = markdown.slice(markdown.indexOf(LEDGER_START) + LEDGER_START.length, markdown.indexOf(LEDGER_END));
  const fences = [...region.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (fences.length !== 1) return { ledger: null, errors: ["the marked region must contain exactly one json block"] };
  try {
    return { ledger: JSON.parse(fences[0][1]), errors: [] };
  } catch (error) {
    return { ledger: null, errors: [`invalid JSON: ${error.message}`] };
  }
}

export function validateLedger(ledger, options = {}) {
  const errors = [];
  const expectedProject = options.project ?? "prospector";
  if (!ledger || typeof ledger !== "object") return { ok: false, errors: ["ledger is missing"], summary: null };
  if (String(ledger.schema_version) !== "1") errors.push("schema_version must be 1");
  if (ledger.project !== expectedProject) errors.push(`project must be ${expectedProject}`);
  const source = ledger.source ?? {};
  if (source.repo !== "SJS1001/PROspector" && expectedProject === "prospector") errors.push("source.repo must be SJS1001/PROspector");
  if (!SHA.test(source.inspected_commit ?? "")) errors.push("source.inspected_commit must be the 40-character source SHA, not a guessed self-hash");
  if (source.coverage && !COVERAGE.has(source.coverage)) errors.push("source.coverage is unknown");
  if (source.expected_requirement_count !== null && source.expected_requirement_count !== CANONICAL_REQUIREMENT_IDS.length && expectedProject === "prospector") {
    errors.push("expected_requirement_count must stay 17");
  }
  const snapshot = ledger.snapshot ?? {};
  for (const field of ["recorded_at", "seeded_at", "last_source_review_at"]) iso(snapshot[field], `snapshot.${field}`, errors);
  if (!snapshot.session) errors.push("snapshot.session is required");
  if (snapshot.verification_mapping && !COVERAGE.has(snapshot.verification_mapping)) errors.push("snapshot.verification_mapping is unknown");
  const rows = Array.isArray(ledger.requirements) ? ledger.requirements : [];
  if (expectedProject === "prospector" && rows.length !== CANONICAL_REQUIREMENT_IDS.length) errors.push("the ledger must contain exactly 17 requirement rows");
  const seen = new Set();
  const counts = { open: 0, in_progress: 0, verified: 0 };
  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`duplicate id ${row.id}`);
    seen.add(row.id);
    if (!STATUSES.has(row.status)) errors.push(`${row.id || "row"} has an unknown status`);
    else counts[row.status] += 1;
    if (!ASSESSMENTS.has(row.verification_assessment)) errors.push(`${row.id} has an unknown verification_assessment`);
    if (!row.last_touched_at || Number.isNaN(Date.parse(row.last_touched_at))) errors.push(`${row.id} requires last_touched_at`);
    if (!row.last_touched_session) errors.push(`${row.id} requires last_touched_session`);
    if (row.source_status === undefined) errors.push(`${row.id} requires source_status`);
    if (row.external_acceptance_recorded !== true && row.external_acceptance_recorded !== false) errors.push(`${row.id} requires external_acceptance_recorded`);
    if (row.status === "verified") {
      if (row.verification_assessment !== "assessed") errors.push(`${row.id} cannot be verified without an assessed mapping`);
      if (!Array.isArray(row.evidence) || row.evidence.length === 0) errors.push(`${row.id} cannot be verified without evidence`);
      if (row.external_acceptance_recorded !== true) errors.push(`${row.id} cannot be verified without recorded canonical acceptance`);
    }
    for (const item of row.evidence ?? []) {
      iso(item.observed_at, `${row.id} evidence.observed_at`, errors);
      iso(item.recorded_at, `${row.id} evidence.recorded_at`, errors);
      if (item.evidence_commit !== null && !SHA.test(item.evidence_commit ?? "")) errors.push(`${row.id} evidence_commit must be 40 hex characters or null`);
      if (item.test_counts !== null && item.test_counts !== undefined) {
        for (const key of ["tests", "passed", "failed", "cancelled", "skipped", "todo"]) {
          const value = item.test_counts[key];
          if (value !== null && !Number.isInteger(value)) errors.push(`${row.id} test_counts.${key} must be an integer or null`);
        }
      }
    }
  }
  if (expectedProject === "prospector") {
    for (const id of CANONICAL_REQUIREMENT_IDS) if (!seen.has(id)) errors.push(`missing canonical id ${id}`);
  }
  const summary = {
    total: rows.length,
    ...counts,
    formal_acceptance: counts.verified,
    product_percent: snapshot.verification_mapping === "complete" && source.coverage === "complete" ? Math.round((100 * counts.verified) / rows.length) : null,
  };
  return { ok: errors.length === 0, errors, summary };
}

export async function verifyLedgerFile(path, options) {
  const markdown = await readFile(path, "utf8");
  const parsed = parseLedger(markdown);
  if (parsed.errors.length) return { ok: false, errors: parsed.errors, summary: null };
  return validateLedger(parsed.ledger, options);
}
