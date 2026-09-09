import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const MODULE_URL = new URL("../domain/synthetic-enrichment-reconciliation-triage.ts", import.meta.url);
const DECISION_URL = new URL("../domain/synthetic-enrichment-reconciliation-decision.ts", import.meta.url);
const AUTHORITY_URL = new URL("../domain/enrichment-authority.ts", import.meta.url);
const OPERATION_URL = new URL("../domain/enrichment-operation.ts", import.meta.url);
const MODULE_NAME = "synthetic-enrichment-reconciliation-triage";

const CLAIMED_AT = Date.UTC(2026, 8, 7, 12);
const OBSERVED_AT = CLAIMED_AT + 30_000;
const OPERATION_KEY = `op_${"c".repeat(64)}`;
const ASSIGNMENT_DIGEST = "d".repeat(64);

async function withModule(run) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    await run(await vite.ssrLoadModule(MODULE_URL.pathname), vite);
  } finally {
    await vite.close();
  }
}

async function fixture(module, overrides = {}, mutate = (value) => value) {
  const value = {
    schema: "synthetic-enrichment-reconciliation-case/v1",
    workspaceId: "synthetic-workspace-1",
    reservationId: "synthetic-reservation-1",
    operationKey: OPERATION_KEY,
    assignmentDigest: ASSIGNMENT_DIGEST,
    reason: "timeout",
    outcomeKind: "needs_reconciliation",
    claimedAt: CLAIMED_AT,
    observedAt: OBSERVED_AT,
    ...overrides,
  };
  value.caseDigest = await module.digestSyntheticReconciliationMaterial(value);
  return mutate(value);
}

/** The canonical union the runtime actually passes to markNeedsReconciliation. */
async function canonicalReasons() {
  const source = await readFile(AUTHORITY_URL, "utf8");
  const declaration = /export type ReconciliationReason =([^;]+);/u.exec(source);
  assert.ok(declaration, "the canonical ReconciliationReason union must remain declared");
  return declaration[1]
    .split("|")
    .map((part) => part.trim().replace(/^"|"$/gu, ""))
    .filter((part) => part.length > 0);
}

async function runtimeSourceUrls(directory = new URL("../", import.meta.url)) {
  const ignored = new Set([".next", ".wrangler", "dist", "node_modules", "tests"]);
  const urls = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) urls.push(...await runtimeSourceUrls(url));
    else if (/\.(?:c|m)?(?:j|t)sx?$/u.test(entry.name) && !entry.name.startsWith(MODULE_NAME)) urls.push(url);
  }
  return urls;
}

async function everyReason(module, overrides = {}) {
  const triaged = [];
  for (const [index, reason] of module.SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS.entries()) {
    const result = await module.triageSyntheticEnrichmentReconciliation(
      await fixture(module, { reason, reservationId: `synthetic-reservation-${index + 1}`, ...overrides }),
    );
    assert.equal(result.kind, "triaged", reason);
    triaged.push(result.triage);
  }
  return triaged;
}

test("routes exactly the canonical post-claim reason set, not only timeout and ambiguous", async () => {
  await withModule(async (module) => {
    const canonical = await canonicalReasons();
    assert.deepEqual(
      [...module.SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS],
      canonical,
      "the restated reason union must stay exactly the canonical authority union",
    );
    assert.equal(canonical.length, 8);
    assert.deepEqual(
      Object.keys(module.SYNTHETIC_ENRICHMENT_RECONCILIATION_TRIAGE_TABLE).sort(),
      [...canonical].sort(),
      "every canonical reason needs one explicit triage row",
    );
    for (const reason of canonical) {
      const row = module.SYNTHETIC_ENRICHMENT_RECONCILIATION_TRIAGE_TABLE[reason];
      assert.equal(row.reason, reason);
      assert.equal(Object.isFrozen(row), true);
    }
    // Every reason the runtime can pass to reconcile() must be represented.
    const operationSource = await readFile(OPERATION_URL, "utf8");
    const reconciled = new Set(
      [...operationSource.matchAll(/reconcile\(\s*repository,\s*[^,]+,\s*"([a-z_]+)"/gu)].map(([, reason]) => reason),
    );
    reconciled.add("timeout");
    reconciled.add("ambiguous");
    for (const reason of reconciled) {
      assert.ok(canonical.includes(reason), `${reason} must be canonical`);
      assert.ok(
        Object.prototype.hasOwnProperty.call(module.SYNTHETIC_ENRICHMENT_RECONCILIATION_TRIAGE_TABLE, reason),
        `${reason} must have an explicit triage row`,
      );
    }
    assert.equal(reconciled.size, 8, "every post-claim reconcile reason must be exercised by the table");
  });
});

test("delegates settlement wholly to the statement-based closure decision", async () => {
  await withModule(async (module) => {
    assert.equal(module.STATEMENT_BASED_CLOSURE_DECISION, "decideSyntheticEnrichmentReconciliation");
    const source = await readFile(MODULE_URL, "utf8");
    for (const forbidden of [
      /projectedFutureState/u,
      /projectedTerminalReason/u,
      /documentedUnits/u,
      /documentedCostMinor/u,
      /releasedUnits/u,
      /"settled"/u,
      /"released"/u,
      /"partial"/u,
    ]) {
      assert.doesNotMatch(source, forbidden, "triage must project no terminal state, amount, or charge");
    }
    for (const triage of await everyReason(module)) {
      assert.equal(triage.settlementAuthority, "none", triage.reason);
      assert.equal(Object.hasOwn(triage, "disposition"), false, triage.reason);
      assert.equal(Object.hasOwn(triage, "documentedSpend"), false, triage.reason);
    }
  });
});

test("routes one exhaustive frozen zero-effect result per canonical reason", async () => {
  await withModule(async (module) => {
    const expected = {
      timeout: ["attempted", "applicable", true, "statement_based_closure_decision", "not_required"],
      ambiguous: ["attempted", "applicable", true, "statement_based_closure_decision", "not_required"],
      provider_port_mismatch: ["not_attempted", "inapplicable_no_provider_request", false, "no_statement_possible", "not_required"],
      invalid_provider_outcome: ["attempted", "applicable", true, "statement_based_closure_decision", "not_required"],
      invalid_assignment: ["not_attempted", "inapplicable_no_provider_request", false, "no_statement_possible", "not_required"],
      invalid_evidence: ["attempted", "applicable", true, "statement_based_closure_decision", "not_required"],
      provider_throw: ["indeterminate", "applicable", true, "statement_based_closure_decision", "not_required"],
      settlement_failure: ["attempted", "applicable", true, "durable_state_reread_required", "required"],
    };
    for (const triage of await everyReason(module)) {
      const [invocation, applicability, covered, route, verification] = expected[triage.reason];
      assert.equal(triage.providerInvocation, invocation, triage.reason);
      assert.equal(triage.statementApplicability, applicability, triage.reason);
      assert.equal(triage.coveredByStatementDecision, covered, triage.reason);
      assert.equal(triage.route, route, triage.reason);
      assert.equal(triage.durableStateVerification, verification, triage.reason);
      assert.equal(triage.durableReconciliationRecorded, true, triage.reason);
      assert.equal(triage.settlementAuthority, "none", triage.reason);
      assert.equal(triage.retryAuthority, "none", triage.reason);
      assert.equal(triage.providerCallAuthority, "none", triage.reason);
      assert.equal(triage.persistenceAuthority, "none", triage.reason);
      assert.equal(triage.effectAuthority, "none", triage.reason);
      assert.match(triage.triageDigest, /^[a-f0-9]{64}$/u);
      assert.equal(Object.isFrozen(triage), true, triage.reason);
    }
  });
});

test("only pre-invocation reasons remain outside the statement-based closure decision", async () => {
  await withModule(async (module, vite) => {
    const triaged = await everyReason(module);
    const decisionModule = await vite.ssrLoadModule(DECISION_URL.pathname);
    const covered = triaged.filter((triage) => triage.coveredByStatementDecision).map((triage) => triage.reason);
    const uncovered = triaged.filter((triage) => !triage.coveredByStatementDecision).map((triage) => triage.reason);
    assert.deepEqual(covered, [...decisionModule.SYNTHETIC_STATEMENT_RECONCILABLE_REASONS]);
    assert.deepEqual(uncovered.sort(), [
      "invalid_assignment",
      "provider_port_mismatch",
    ]);
    // A reason with no possible provider request has no billing line to route.
    for (const triage of triaged) {
      if (triage.statementApplicability === "inapplicable_no_provider_request") {
        assert.equal(triage.providerInvocation, "not_attempted", triage.reason);
        assert.equal(triage.route, "no_statement_possible", triage.reason);
      }
    }
  });
});

test("an unrecorded reconciliation marker forces a durable re-read for every reason", async () => {
  await withModule(async (module) => {
    for (const triage of await everyReason(module, { outcomeKind: "reconciliation_persistence_failure" })) {
      assert.equal(triage.durableReconciliationRecorded, false, triage.reason);
      assert.equal(triage.route, "durable_state_reread_required", triage.reason);
      assert.equal(triage.durableStateVerification, "required", triage.reason);
      assert.equal(triage.settlementAuthority, "none", triage.reason);
      assert.equal(triage.retryAuthority, "none", triage.reason);
      assert.equal(triage.providerCallAuthority, "none", triage.reason);
    }
  });
});

test("an exact immutable replay produces identical bytes and digests", async () => {
  await withModule(async (module) => {
    const input = await fixture(module);
    const first = await module.triageSyntheticEnrichmentReconciliation(input);
    const second = await module.triageSyntheticEnrichmentReconciliation(structuredClone(input));
    assert.deepEqual(second, first);
    assert.equal(second.triage.triageDigest, first.triage.triageDigest);

    const otherReason = await module.triageSyntheticEnrichmentReconciliation(await fixture(module, { reason: "provider_throw" }));
    assert.notEqual(otherReason.triage.triageDigest, first.triage.triageDigest);

    const stranded = await module.triageSyntheticEnrichmentReconciliation(
      await fixture(module, { outcomeKind: "reconciliation_persistence_failure" }),
    );
    assert.notEqual(stranded.triage.triageDigest, first.triage.triageDigest);
  });
});

test("unknown, malformed, hostile, mis-digested, and out-of-order inputs fail closed", async () => {
  await withModule(async (module) => {
    const cases = [
      ["unknown reason", await fixture(module, { reason: "provider_unavailable" }), "unknown_reason"],
      ["empty reason", await fixture(module, { reason: "" }), "unknown_reason"],
      ["prototype-named reason", await fixture(module, { reason: "constructor" }), "unknown_reason"],
      ["unknown outcome", await fixture(module, { outcomeKind: "settled" }), "unknown_outcome"],
      ["simultaneous observation", await fixture(module, {}, (value) => ({ ...value, observedAt: value.claimedAt })), "non_monotonic_time"],
      ["reversed observation", await fixture(module, {}, (value) => ({ ...value, observedAt: value.claimedAt - 1 })), "non_monotonic_time"],
      ["re-digested case", await fixture(module, {}, (value) => ({ ...value, caseDigest: "e".repeat(64) })), "digest_mismatch"],
      ["reason swapped after digest", await fixture(module, {}, (value) => ({ ...value, reason: "invalid_evidence" })), "digest_mismatch"],
      ["missing schema brand", await fixture(module, { schema: "reconciliation-case/v1" }), "invalid_snapshot"],
      ["extra field", await fixture(module, {}, (value) => ({ ...value, retry: true })), "invalid_snapshot"],
      ["missing field", await fixture(module, {}, (value) => { const copy = { ...value }; delete copy.assignmentDigest; return copy; }), "invalid_snapshot"],
      ["short assignment digest", await fixture(module, { assignmentDigest: "d".repeat(63) }), "invalid_snapshot"],
      ["unbranded operation key", await fixture(module, { operationKey: "c".repeat(64) }), "invalid_snapshot"],
      ["empty workspace", await fixture(module, { workspaceId: "" }), "invalid_snapshot"],
      ["non-integer time", await fixture(module, {}, (value) => ({ ...value, claimedAt: CLAIMED_AT + 0.5 })), "invalid_snapshot"],
      ["negative time", await fixture(module, { claimedAt: -1 }), "invalid_snapshot"],
      ["null input", null, "invalid_snapshot"],
      ["array input", [], "invalid_snapshot"],
      ["string input", "timeout", "invalid_snapshot"],
      ["undefined input", undefined, "invalid_snapshot"],
    ];
    for (const [name, input, reason] of cases) {
      const result = await module.triageSyntheticEnrichmentReconciliation(input);
      assert.deepEqual(result, { kind: "blocked", reason }, name);
      assert.equal(Object.isFrozen(result), true, name);
    }
  });
});

test("accessor, proxy, and prototype-polluting shapes fail closed without evaluation", async () => {
  await withModule(async (module) => {
    let evaluated = 0;
    const accessor = await fixture(module);
    Object.defineProperty(accessor, "reason", { get() { evaluated += 1; return "timeout"; }, enumerable: true, configurable: true });
    assert.deepEqual(
      await module.triageSyntheticEnrichmentReconciliation(accessor),
      { kind: "blocked", reason: "invalid_snapshot" },
    );
    assert.equal(evaluated, 0, "an input getter must never be evaluated");

    const proxied = new Proxy(await fixture(module), {});
    assert.deepEqual(
      await module.triageSyntheticEnrichmentReconciliation(proxied),
      { kind: "blocked", reason: "invalid_snapshot" },
    );

    const polluted = await fixture(module);
    assert.deepEqual(
      await module.triageSyntheticEnrichmentReconciliation(
        Object.defineProperty({ ...polluted }, "__proto__", { value: { admin: true }, enumerable: true, configurable: true, writable: true }),
      ),
      { kind: "blocked", reason: "invalid_snapshot" },
    );
    assert.equal({}.admin, undefined);

    const exotic = Object.assign(Object.create({ inherited: true }), await fixture(module));
    assert.deepEqual(
      await module.triageSyntheticEnrichmentReconciliation(exotic),
      { kind: "blocked", reason: "invalid_snapshot" },
    );
  });
});

test("a complete ledger proves every canonical reason is routed exactly once", async () => {
  await withModule(async (module) => {
    const triaged = await everyReason(module);
    const complete = await module.projectSyntheticEnrichmentReconciliationCoverage(triaged);
    assert.equal(complete.kind, "complete");
    assert.deepEqual([...complete.coveredReasons], [...module.SYNTHETIC_ENRICHMENT_RECONCILIATION_REASONS]);
    assert.match(complete.ledgerDigest, /^[a-f0-9]{64}$/u);

    const shuffled = await module.projectSyntheticEnrichmentReconciliationCoverage([...triaged].reverse());
    assert.equal(shuffled.kind, "complete");
    assert.equal(shuffled.ledgerDigest, complete.ledgerDigest, "coverage order must not change the ledger digest");
  });
});

test("an incomplete, duplicated, foreign, or forged ledger never reports complete", async () => {
  await withModule(async (module) => {
    const triaged = await everyReason(module);

    const statementDecisionOnly = await module.projectSyntheticEnrichmentReconciliationCoverage(
      triaged.filter((triage) => triage.coveredByStatementDecision),
    );
    assert.equal(statementDecisionOnly.kind, "incomplete");
    assert.deepEqual(
      [...statementDecisionOnly.missingReasons],
      ["provider_port_mismatch", "invalid_assignment"],
      "statement closure coverage must not pretend the two pre-invocation cases have billing evidence",
    );

    const duplicated = await module.projectSyntheticEnrichmentReconciliationCoverage([...triaged, structuredClone(triaged[0])]);
    assert.equal(duplicated.kind, "invalid");

    const foreign = structuredClone(triaged.map((triage) => ({ ...triage })));
    foreign[3].workspaceId = "synthetic-workspace-2";
    assert.equal((await module.projectSyntheticEnrichmentReconciliationCoverage(foreign)).kind, "invalid");

    for (const forge of [
      (list) => { list[0].route = "no_statement_possible"; },
      (list) => { list[2].statementApplicability = "applicable"; },
      (list) => { list[4].coveredByStatementDecision = true; },
      (list) => { list[5].settlementAuthority = "documented_charge"; },
      (list) => { list[6].retryAuthority = "single"; },
      (list) => { list[7].effectAuthority = "settlement"; },
      (list) => { list[1].triageDigest = "f".repeat(64); },
      (list) => { list[1].reason = "unknown_reason"; },
      (list) => { delete list[0].caseDigest; },
    ]) {
      const forged = structuredClone(triaged.map((triage) => ({ ...triage })));
      forge(forged);
      assert.equal((await module.projectSyntheticEnrichmentReconciliationCoverage(forged)).kind, "invalid");
    }

    for (const input of [null, undefined, [], "timeout", {}, [{}], new Array(65).fill(triaged[0])]) {
      assert.deepEqual(await module.projectSyntheticEnrichmentReconciliationCoverage(input), { kind: "invalid" });
    }
  });
});

test("the triage module remains pure, adapter-free, and runtime-unreachable", async () => {
  const [moduleSource, runtimeUrls] = await Promise.all([
    readFile(MODULE_URL, "utf8"),
    runtimeSourceUrls(),
  ]);
  assert.doesNotMatch(
    moduleSource,
    /^\s*import(?:\s|\()|require\s*\(|D1Database|fetch\(|\.prepare\(|database\.|process\.env|crypto\.subtle\.(?!digest)/mu,
    "no import, adapter, persistence, network, environment, or key material is permitted",
  );
  assert.doesNotMatch(
    moduleSource,
    /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/(?![^\s"]*\.invalid)/u,
    "no real contact coordinate or endpoint may appear",
  );
  // The delegate is named by its exported decision function, never by its
  // module path, so this reference cannot trip that module's composition guard.
  assert.doesNotMatch(moduleSource, /synthetic-enrichment-reconciliation-decision/u);
  const dependencyReference = new RegExp(MODULE_NAME, "u");
  for (const example of [
    `  import value from "../domain/${MODULE_NAME}";`,
    `const value = import("../domain/${MODULE_NAME}");`,
    `const value = require("../domain/${MODULE_NAME}");`,
  ]) assert.match(example, dependencyReference);
  for (const url of runtimeUrls) {
    assert.doesNotMatch(await readFile(url, "utf8"), dependencyReference, url.pathname);
  }
});
