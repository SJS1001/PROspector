import assert from "node:assert/strict";
import test from "node:test";

import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

const NOW = 1_790_500_000_000;

test("direct SQL cannot reserve runner spend after the issuing workspace revision drifts", async () => {
  const fixture = await createD1Fixture("phase5-runner-source-revision-redteam");
  try {
    await applyMigrations(fixture.database);
    const [persistence, runner] = await Promise.all([
      fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname),
    ]);
    const workspaceId = "runner-source-revision-workspace";
    const ownerSubject = "runner-source-revision-owner";
    await fixture.database.prepare(
      `INSERT INTO workspaces
        (id,company_name,owner_subject,created_at,updated_at,revision)
       VALUES (?, 'Runner Revision Workspace', ?, ?, ?, 1)`,
    ).bind(workspaceId, ownerSubject, NOW, NOW).run();
    const issued = await persistence.issueD1RunnerSpendAuthority(
      fixture.database,
      { workspaceId, ownerSubject, now: () => NOW },
      {
        providerId: "runner-provider",
        model: "runner-model",
        catalogRef: "runner-catalog",
        runType: "prospecting",
        scopeId: "runner-profile",
        perRunCostMinor: 10,
        monthlyCostMinor: 100,
        currency: "CAD",
        maxRetries: 0,
        expiresAt: NOW + 10_000,
        expectedRevision: 1,
        idempotencyKey: "runner-source-revision-grant",
      },
    );
    const repository = persistence.createD1RunnerSpendRepository(
      fixture.database,
      { workspaceId, ownerSubject, now: () => NOW },
    );
    const authority = await repository.loadRunnerAuthority(issued.grant.id);
    assert.ok(authority);
    const operationKey = await runner.deriveRunnerOperationKey(authority);
    const period = runner.deriveRunnerUtcMonthPeriod(NOW);
    const perRun = await fixture.database.prepare(
      "SELECT revision FROM runner_budget_accounts WHERE id=? AND workspace_id=?",
    ).bind(issued.perRunAccountIds[0], workspaceId).first();
    const monthly = await fixture.database.prepare(
      "SELECT revision FROM runner_budget_accounts WHERE id=? AND workspace_id=?",
    ).bind(issued.monthlyAccountId, workspaceId).first();
    assert.ok(perRun && monthly);

    await fixture.database.prepare(
      "UPDATE workspaces SET revision=2,updated_at=? WHERE id=?",
    ).bind(NOW + 1, workspaceId).run();

    await assert.rejects(
      fixture.database.prepare(
        `INSERT INTO runner_spend_reservations (
          id,workspace_id,grant_id,per_run_account_id,monthly_account_id,operation_key,attempt_number,
          period,previous_outcome,previous_operation_keys_json,per_run_account_expected_revision,
          monthly_account_expected_revision,provider_id,model,catalog_ref,scope_id,run_type,currency,
          reserved_cost_minor,max_retries,attempt_digest,created_at
        ) VALUES (?,?,?,?,?,?,0,?,'none','[]',?,?,?,?,?,?,?,?,?,0,?,?)`,
      ).bind(
        "stale-direct-runner-reservation",
        workspaceId,
        issued.grant.id,
        issued.perRunAccountIds[0],
        issued.monthlyAccountId,
        operationKey,
        period,
        Number(perRun.revision),
        Number(monthly.revision),
        issued.grant.providerId,
        issued.grant.model,
        issued.grant.catalogRef,
        issued.grant.scopeId,
        issued.grant.runType,
        issued.grant.currency,
        issued.grant.perRunCostMinor,
        "a".repeat(64),
        NOW + 2,
      ).run(),
      /invalid runner reservation authority/,
    );
  } finally {
    await fixture.dispose();
  }
});
