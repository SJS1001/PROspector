import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_REQUIREMENT_IDS,
  LEDGER_END,
  LEDGER_START,
  parseLedger,
  validateLedger,
  verifyLedgerFile,
} from "../scripts/verify-completion-ledger.mjs";

const ledgerPath = new URL("../COMPLETION_LEDGER.md", import.meta.url);

test("the committed ledger has the 17 canonical rows and does not invent a product percent", async () => {
  const result = await verifyLedgerFile(ledgerPath);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.total, 17);
  assert.equal(result.summary.verified, 0);
  assert.equal(result.summary.formal_acceptance, 0);
  assert.equal(result.summary.product_percent, null);
  assert.equal(result.summary.in_progress + result.summary.open + result.summary.verified, 17);
  const parsed = parseLedger(await import("node:fs/promises").then((fs) => fs.readFile(ledgerPath, "utf8")));
  assert.deepEqual(parsed.ledger.requirements.map((row) => row.id), CANONICAL_REQUIREMENT_IDS);
  assert.equal(parsed.ledger.source.inspected_commit, "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4");
  assert.ok(parsed.ledger.requirements.every((row) => row.last_touched_at && row.last_touched_session));
  assert.ok(parsed.ledger.requirements.every((row) => row.external_acceptance_recorded === false));
});

function sample(overrides = {}) {
  return {
    schema_version: "1",
    project: "prospector",
    source: {
      repo: "SJS1001/PROspector",
      branch: "cursor/schedule-overlap-state-de84",
      pr_url: "https://github.com/SJS1001/PROspector/pull/157",
      pr_number: 157,
      inspected_commit: "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
      canonical_inventory_paths: [".planning/REQUIREMENTS.md"],
      scope: "v1 requirements",
      coverage: "complete",
      expected_requirement_count: 17,
      excluded_scope: "v2",
    },
    snapshot: {
      recorded_at: "2026-11-08T21:00:33Z",
      session: "session",
      seeded_at: "2026-11-08T21:00:33Z",
      last_source_review_at: "2026-11-08T21:00:33Z",
      verification_mapping: "partial",
    },
    requirements: CANONICAL_REQUIREMENT_IDS.map((id) => ({
      id,
      title: id,
      class: "requirement",
      status: "open",
      source_status: "Pending",
      source_refs: [],
      blocker: null,
      user_decision: null,
      accepted_exception: false,
      exception_evidence: [],
      external_acceptance_recorded: false,
      verification_assessment: "not_assessed",
      last_touched_at: "2026-11-08T21:00:33Z",
      last_touched_session: "session",
      evidence: [],
      ...overrides,
    })),
  };
}

test("malformed JSON, duplicate ids, unknown status, and a verified row without acceptance fail", () => {
  assert.ok(parseLedger(`${LEDGER_START}\n\`\`\`json\n{\n\`\`\`\n${LEDGER_END}`).errors.some((error) => error.startsWith("invalid JSON")));
  assert.ok(parseLedger("no marker").errors.length > 0);
  assert.ok(parseLedger(`${LEDGER_START}\n${LEDGER_START}\n\`\`\`json\n{}\n\`\`\`\n${LEDGER_END}`).errors.length > 0);
  const duplicate = sample();
  duplicate.requirements[1].id = duplicate.requirements[0].id;
  assert.ok(validateLedger(duplicate).errors.some((error) => error.includes("duplicate")));
  const badStatus = sample();
  badStatus.requirements[0].status = "closed";
  assert.ok(validateLedger(badStatus).errors.some((error) => error.includes("unknown status")));
  const verified = sample();
  verified.requirements[0].status = "verified";
  verified.requirements[0].verification_assessment = "assessed";
  assert.ok(validateLedger(verified).errors.some((error) => error.includes("without evidence")));
  verified.requirements[0].evidence = [{ kind: "test", evidence_commit: null, observed_at: null, recorded_at: "2026-11-08T21:00:33Z", test_counts: null, exit_code: 0, limitations: "local only" }];
  assert.ok(validateLedger(verified).errors.some((error) => error.includes("without recorded canonical acceptance")));
});

test("a missing touch, a bad timestamp, and a short source SHA are rejected", () => {
  const missingTouch = sample();
  delete missingTouch.requirements[0].last_touched_at;
  assert.ok(validateLedger(missingTouch).errors.some((error) => error.includes("last_touched_at")));
  const stale = sample();
  stale.requirements[0].evidence = [{ kind: "artifact", evidence_commit: "abc", observed_at: "yesterday", recorded_at: "2026-11-08T21:00:33Z", test_counts: { tests: "6" }, exit_code: null, limitations: "stale" }];
  const result = validateLedger(stale);
  assert.ok(result.errors.some((error) => error.includes("observed_at")));
  assert.ok(result.errors.some((error) => error.includes("evidence_commit")));
  assert.ok(result.errors.some((error) => error.includes("test_counts.tests")));
  const selfHash = sample();
  selfHash.source.inspected_commit = "not-a-commit";
  assert.ok(validateLedger(selfHash).errors.some((error) => error.includes("inspected_commit")));
});
