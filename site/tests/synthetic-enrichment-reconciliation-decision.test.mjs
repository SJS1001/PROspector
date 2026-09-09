import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.UTC(2026, 8, 7, 12);
const RECORDED_AT = NOW - 3_600_000;
const HASH = "a".repeat(64);
const ACK = "b".repeat(64);
const OPERATION_KEY = `op_${"c".repeat(64)}`;

async function load(vite) {
  return vite.ssrLoadModule(new URL("../domain/synthetic-enrichment-reconciliation-decision.ts", import.meta.url).pathname);
}

function subjectInput(overrides = {}) {
  return {
    reservationId: "synthetic-reservation-1",
    workspaceId: "synthetic-workspace-1",
    ownerSubject: "synthetic-owner-1",
    grantId: "synthetic-grant-1",
    operationKey: OPERATION_KEY,
    providerId: "synthetic-provider",
    providerVersion: "synthetic-v1",
    catalogRef: "synthetic-business-contact-lookup",
    quoteRevision: 2,
    configurationId: "synthetic-profile-configuration-1",
    configurationDigest: HASH,
    operation: "business_contact_lookup/v1",
    terminalState: "needs_reconciliation",
    terminalReason: "ambiguous",
    durableRevision: 3,
    acknowledgementDigest: ACK,
    reservedUnits: 4,
    reservedCostMinor: 100,
    currency: "CAD",
    recordedAt: RECORDED_AT,
    ...overrides,
  };
}

function statementInput(overrides = {}) {
  return {
    statementId: "synthetic-statement-1",
    reservationId: "synthetic-reservation-1",
    workspaceId: "synthetic-workspace-1",
    grantId: "synthetic-grant-1",
    operationKey: OPERATION_KEY,
    providerId: "synthetic-provider",
    providerVersion: "synthetic-v1",
    catalogRef: "synthetic-business-contact-lookup",
    quoteRevision: 2,
    outcome: "documented_charge",
    documentedUnits: 1,
    documentedCostMinor: 25,
    currency: "CAD",
    statementReference: "synthetic-owner-transcribed-invoice-line-1",
    observedAt: NOW - 60_000,
    ...overrides,
  };
}

function authorityInput(overrides = {}) {
  return {
    workspaceId: "synthetic-workspace-1",
    ownerSubject: "synthetic-owner-1",
    admittedOwner: true,
    reservationId: "synthetic-reservation-1",
    durableState: "needs_reconciliation",
    durableRevision: 3,
    acknowledgementDigest: ACK,
    grantConsumed: true,
    configurationId: "synthetic-profile-configuration-1",
    configurationDigest: HASH,
    ownerReviewedStatement: true,
    externalEffectsDisabled: true,
    evaluatedAt: NOW,
    ...overrides,
  };
}

async function decide(decisionModule, { subject = {}, statement = {}, authority = {} } = {}) {
  return decisionModule.decideSyntheticEnrichmentReconciliation({
    reservation: await decisionModule.buildSyntheticUncertainReservation(subjectInput(subject)),
    statement: await decisionModule.buildSyntheticProviderBillingStatement(statementInput(statement)),
    currentAuthority: authorityInput(authority),
  });
}

function assertNoAuthority(decision, label) {
  assert.equal(decision.persistenceAuthorized, false, `${label}: persistence`);
  assert.equal(decision.retryAuthorized, false, `${label}: retry`);
  assert.equal(decision.providerSwitchAuthorized, false, `${label}: provider switch`);
  assert.equal(decision.expiryExtensionAuthorized, false, `${label}: expiry extension`);
  assert.equal(decision.providerInvocationAuthorized, false, `${label}: provider invocation`);
  assert.equal(decision.budgetIncreaseAuthorized, false, `${label}: budget increase`);
  assert.equal(decision.contactEvidencePromotionAuthorized, false, `${label}: evidence promotion`);
  assert.deepEqual({ ...decision.effects }, {
    providerCalls: 0,
    spendAuthorizations: 0,
    reservationMutations: 0,
    budgetMutations: 0,
    contactEvidenceMutations: 0,
    retryInvocations: 0,
  }, `${label}: effects`);
}

test("synthetic enrichment reconciliation decision", async (t) => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  t.after(async () => { await vite.close(); });
  const decisionModule = await load(vite);

  await t.test("an exactly bound documented charge settles only its billable amount", async () => {
    const decision = await decide(decisionModule);
    assert.equal(decision.status, "synthetic_reconciliation_resolvable");
    assert.equal(decision.projectedFutureState, "settled");
    // The contact outcome was never observed, so a documented charge can only
    // ever be partial. `completed` is not a reachable reconciliation result.
    assert.equal(decision.projectedTerminalReason, "partial");
    assert.equal(decision.projectedDocumentedUnits, 1);
    assert.equal(decision.projectedDocumentedCostMinor, 25);
    assert.equal(decision.projectedReleasedUnits, 3);
    assert.equal(decision.projectedReleasedCostMinor, 75);
    assert.equal(decision.currency, "CAD");
    assert.equal(decision.ownerActionRequired, false);
    assert.deepEqual([...decision.reasonCodes], []);
    assertNoAuthority(decision, "documented charge");
  });

  await t.test("a documented no-charge statement releases the whole reservation", async () => {
    const decision = await decide(decisionModule, {
      statement: { outcome: "documented_no_charge", documentedUnits: 0, documentedCostMinor: 0 },
    });
    assert.equal(decision.status, "synthetic_reconciliation_resolvable");
    assert.equal(decision.projectedFutureState, "released");
    assert.equal(decision.projectedTerminalReason, "rejected");
    assert.equal(decision.projectedDocumentedUnits, 0);
    assert.equal(decision.projectedDocumentedCostMinor, 0);
    assert.equal(decision.projectedReleasedUnits, 4);
    assert.equal(decision.projectedReleasedCostMinor, 100);
    assertNoAuthority(decision, "documented no charge");
  });

  await t.test("an undocumented outcome holds the reservation uncertain", async () => {
    const decision = await decide(decisionModule, { statement: { outcome: "undocumented", documentedUnits: 0, documentedCostMinor: 0 } });
    assert.equal(decision.status, "synthetic_reconciliation_held");
    assert.equal(decision.projectedFutureState, "needs_reconciliation");
    assert.equal(decision.projectedTerminalReason, "ambiguous");
    assert.equal(decision.projectedDocumentedUnits, 0);
    assert.equal(decision.projectedReleasedUnits, 0);
    assert.equal(decision.projectedReleasedCostMinor, 0);
    assert.equal(decision.ownerActionRequired, true);
    assert.deepEqual([...decision.reasonCodes], ["charge_undocumented"]);
    assertNoAuthority(decision, "undocumented");
  });

  await t.test("a timeout subject keeps its own uncertain reason when held", async () => {
    const decision = await decide(decisionModule, {
      subject: { terminalReason: "timeout" },
      statement: { outcome: "undocumented", documentedUnits: 0, documentedCostMinor: 0 },
    });
    assert.equal(decision.projectedTerminalReason, "timeout");
    assert.equal(decision.status, "synthetic_reconciliation_held");
  });

  await t.test("every statement-applicable runtime reason can be closed without gaining authority", async () => {
    assert.deepEqual([...decisionModule.SYNTHETIC_STATEMENT_RECONCILABLE_REASONS], [
      "timeout",
      "ambiguous",
      "invalid_provider_outcome",
      "invalid_evidence",
      "provider_throw",
      "settlement_failure",
    ]);
    for (const terminalReason of decisionModule.SYNTHETIC_STATEMENT_RECONCILABLE_REASONS) {
      const charged = await decide(decisionModule, { subject: { terminalReason } });
      assert.equal(charged.status, "synthetic_reconciliation_resolvable", terminalReason);
      assert.equal(charged.projectedFutureState, "settled", terminalReason);
      assert.equal(charged.projectedTerminalReason, "partial", terminalReason);
      assertNoAuthority(charged, terminalReason);

      const noCharge = await decide(decisionModule, {
        subject: { terminalReason },
        statement: { outcome: "documented_no_charge", documentedUnits: 0, documentedCostMinor: 0 },
      });
      assert.equal(noCharge.status, "synthetic_reconciliation_resolvable", terminalReason);
      assert.equal(noCharge.projectedFutureState, "released", terminalReason);
      assertNoAuthority(noCharge, `${terminalReason} no charge`);

      const undocumented = await decide(decisionModule, {
        subject: { terminalReason },
        statement: { outcome: "undocumented", documentedUnits: 0, documentedCostMinor: 0 },
      });
      assert.equal(undocumented.status, "synthetic_reconciliation_held", terminalReason);
      assert.equal(undocumented.projectedTerminalReason, terminalReason);
      assertNoAuthority(undocumented, `${terminalReason} undocumented`);
    }
  });

  await t.test("documented amounts can never exceed the committed reservation", async () => {
    const overUnits = await decide(decisionModule, { statement: { documentedUnits: 5, documentedCostMinor: 25 } });
    assert.equal(overUnits.status, "synthetic_reconciliation_held");
    assert.deepEqual([...overUnits.reasonCodes], ["documented_units_exceed_reservation"]);
    assert.equal(overUnits.projectedDocumentedCostMinor, 0);

    const overCost = await decide(decisionModule, { statement: { documentedUnits: 1, documentedCostMinor: 101 } });
    assert.equal(overCost.status, "synthetic_reconciliation_held");
    assert.deepEqual([...overCost.reasonCodes], ["documented_cost_exceeds_reservation"]);

    const noUnits = await decide(decisionModule, { statement: { documentedUnits: 0, documentedCostMinor: 25 } });
    assert.equal(noUnits.status, "synthetic_reconciliation_held");
    assert.deepEqual([...noUnits.reasonCodes], ["documented_units_absent"]);

    const contradictoryRelease = await decide(decisionModule, {
      statement: { outcome: "documented_no_charge", documentedUnits: 0, documentedCostMinor: 5 },
    });
    assert.equal(contradictoryRelease.status, "synthetic_reconciliation_held");
    assert.deepEqual([...contradictoryRelease.reasonCodes], ["no_charge_statement_documents_amount"]);

    for (const decision of [overUnits, overCost, noUnits, contradictoryRelease]) assertNoAuthority(decision, "amount bounds");
  });

  await t.test("every statement binding must match the exact uncertain operation", async () => {
    const cases = [
      ["statement_reservation_mismatch", { reservationId: "synthetic-reservation-2" }],
      ["statement_workspace_mismatch", { workspaceId: "synthetic-workspace-2" }],
      ["statement_grant_mismatch", { grantId: "synthetic-grant-2" }],
      ["statement_operation_key_mismatch", { operationKey: `op_${"d".repeat(64)}` }],
      ["statement_provider_mismatch", { providerId: "synthetic-other-provider" }],
      ["statement_provider_version_mismatch", { providerVersion: "synthetic-v2" }],
      ["statement_catalog_mismatch", { catalogRef: "synthetic-other-catalog" }],
      ["statement_quote_revision_mismatch", { quoteRevision: 3 }],
      ["statement_currency_mismatch", { currency: "USD" }],
      ["statement_precedes_uncertainty", { observedAt: RECORDED_AT - 1 }],
      ["statement_from_future", { observedAt: NOW + 1 }],
    ];
    for (const [reason, statement] of cases) {
      const decision = await decide(decisionModule, { statement });
      assert.equal(decision.status, "synthetic_reconciliation_held", reason);
      assert.ok(decision.reasonCodes.includes(reason), `${reason} missing from ${decision.reasonCodes.join(",")}`);
      assert.equal(decision.projectedFutureState, "needs_reconciliation", reason);
      assertNoAuthority(decision, reason);
    }
  });

  await t.test("current durable authority must still hold the exact uncertain row", async () => {
    const cases = [
      ["reservation_scope_mismatch", { reservationId: "synthetic-reservation-2" }],
      ["workspace_scope_mismatch", { workspaceId: "synthetic-workspace-2" }],
      ["owner_scope_mismatch", { ownerSubject: "synthetic-owner-2" }],
      ["owner_not_admitted", { admittedOwner: false }],
      ["reservation_not_uncertain", { durableState: "reserved" }],
      ["reservation_not_uncertain", { durableState: "invoking" }],
      ["reservation_not_uncertain", { durableState: "settled" }],
      ["reservation_not_uncertain", { durableState: "released" }],
      ["durable_revision_changed", { durableRevision: 4 }],
      ["acknowledgement_digest_changed", { acknowledgementDigest: "e".repeat(64) }],
      ["grant_not_consumed", { grantConsumed: false }],
      ["configuration_scope_mismatch", { configurationId: "synthetic-profile-configuration-2" }],
      ["configuration_digest_mismatch", { configurationDigest: "f".repeat(64) }],
      ["owner_statement_review_missing", { ownerReviewedStatement: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ];
    for (const [reason, authority] of cases) {
      const decision = await decide(decisionModule, { authority });
      assert.equal(decision.status, "synthetic_reconciliation_held", reason);
      assert.ok(decision.reasonCodes.includes(reason), `${reason} missing from ${decision.reasonCodes.join(",")}`);
      assert.equal(decision.projectedDocumentedCostMinor, 0, reason);
      assertNoAuthority(decision, reason);
    }
  });

  await t.test("an already-closed reservation is never reopened by a later statement", async () => {
    for (const durableState of ["settled", "released"]) {
      const decision = await decide(decisionModule, { authority: { durableState } });
      assert.equal(decision.status, "synthetic_reconciliation_held", durableState);
      assert.equal(decision.projectedFutureState, "needs_reconciliation", durableState);
      assert.equal(decision.projectedReleasedCostMinor, 0, durableState);
    }
  });

  await t.test("decisions are deterministic and bind their exact material", async () => {
    const first = await decide(decisionModule);
    const second = await decide(decisionModule);
    assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));

    const changedAmount = await decide(decisionModule, { statement: { documentedCostMinor: 26 } });
    assert.notEqual(changedAmount.resolutionDigest, first.resolutionDigest);
    const changedSubject = await decide(decisionModule, { subject: { reservedCostMinor: 101 } });
    assert.notEqual(changedSubject.subjectDigest, first.subjectDigest);
    assert.notEqual(changedSubject.resolutionDigest, first.resolutionDigest);
    const held = await decide(decisionModule, { statement: { outcome: "undocumented", documentedUnits: 0, documentedCostMinor: 0 } });
    assert.notEqual(held.resolutionDigest, first.resolutionDigest);
  });

  await t.test("a billing statement is money evidence only, never contact verification", async () => {
    const statement = await decisionModule.buildSyntheticProviderBillingStatement(statementInput());
    assert.equal(statement.providerEvidence, false);
    assert.equal(statement.persistenceAuthorized, false);
    assert.deepEqual(Object.keys(statement.snapshot).filter((key) => /email|phone|address|credential|token/iu.test(key)), []);
    const reservation = await decisionModule.buildSyntheticUncertainReservation(subjectInput());
    assert.equal(reservation.providerInvocationAuthorized, false);
    assert.equal(reservation.persistenceAuthorized, false);
    assert.ok(Object.isFrozen(reservation.snapshot) && Object.isFrozen(statement.snapshot));
  });

  await t.test("unbranded, malformed, and hostile material is rejected", async () => {
    const reservation = await decisionModule.buildSyntheticUncertainReservation(subjectInput());
    const statement = await decisionModule.buildSyntheticProviderBillingStatement(statementInput());
    const forgedReservation = JSON.parse(JSON.stringify(reservation));
    const forgedStatement = JSON.parse(JSON.stringify(statement));
    const rejects = [
      ["forged reservation artifact", { reservation: forgedReservation, statement, currentAuthority: authorityInput() }],
      ["forged statement artifact", { reservation, statement: forgedStatement, currentAuthority: authorityInput() }],
      ["missing authority key", { reservation, statement, currentAuthority: (() => { const value = authorityInput(); delete value.grantConsumed; return value; })() }],
      ["extra authority key", { reservation, statement, currentAuthority: { ...authorityInput(), extra: 1 } }],
      ["extra input key", { reservation, statement, currentAuthority: authorityInput(), extra: 1 }],
      ["array input", [reservation, statement]],
      ["null input", null],
      ["accessor authority", { reservation, statement, currentAuthority: Object.defineProperty({ ...authorityInput() }, "admittedOwner", { get: () => true, enumerable: true, configurable: true }) }],
      ["non-boolean admission", { reservation, statement, currentAuthority: { ...authorityInput(), admittedOwner: "true" } }],
      ["non-synthetic identifier", { reservation, statement, currentAuthority: { ...authorityInput(), workspaceId: "real-workspace" } }],
    ];
    for (const [label, input] of rejects) {
      await assert.rejects(
        () => decisionModule.decideSyntheticEnrichmentReconciliation(input),
        /synthetic_enrichment_reconciliation_invalid/u,
        label,
      );
    }

    const badSubjects = [
      ["settled subject", { terminalState: "settled" }],
      ["pre-invocation port mismatch", { terminalReason: "provider_port_mismatch" }],
      ["pre-invocation invalid assignment", { terminalReason: "invalid_assignment" }],
      ["zero reserved units", { reservedUnits: 0 }],
      ["real provider identity", { providerId: "hunter-io" }],
      ["client operation key", { operationKey: "chosen-by-client" }],
      ["unbounded currency", { currency: "cad" }],
    ];
    for (const [label, overrides] of badSubjects) {
      await assert.rejects(
        () => decisionModule.buildSyntheticUncertainReservation(subjectInput(overrides)),
        /synthetic_uncertain_enrichment_reservation_invalid/u,
        label,
      );
    }

    await assert.rejects(
      () => decisionModule.buildSyntheticProviderBillingStatement(statementInput({ outcome: "documented_retry" })),
      /synthetic_provider_billing_statement_invalid/u,
      "retry is not a documented outcome",
    );
  });
});

test("the reconciliation decision is runtime-unreachable and provider-free", async () => {
  const fs = await import("node:fs/promises");
  const moduleUrl = new URL("../domain/synthetic-enrichment-reconciliation-decision.ts", import.meta.url);
  const source = await fs.readFile(moduleUrl, "utf8");
  assert.doesNotMatch(source, /^import\s/mu);
  assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:D1Database|Request|Response|ContactProviderPort)\b/u);
  assert.doesNotMatch(source, /(?:email|phone|apiKey|credential|token|endpoint)\s*:/u);

  for (const directory of ["app", "worker", "adapters", "scripts"]) {
    const root = new URL(`../${directory}/`, import.meta.url);
    const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.[cm]?[jt]sx?$/u.test(entry.name)) continue;
      const body = await fs.readFile(`${entry.parentPath}/${entry.name}`, "utf8");
      assert.doesNotMatch(
        body,
        /synthetic-enrichment-reconciliation-decision/u,
        `${directory}/${entry.name} must not compose the synthetic reconciliation decision`,
      );
    }
  }
});
