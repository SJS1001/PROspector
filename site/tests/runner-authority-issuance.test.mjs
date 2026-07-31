import assert from "node:assert/strict";
import test from "node:test";

import { applyMigrations, countRows, createD1Fixture } from "./helpers/d1.mjs";

const NOW = 1_790_500_000_000;

test("runner authority issuance is idempotent and reuses the same monthly ledger after workspace revision advances", async () => {
  const fixture = await createD1Fixture("phase5-runner-authority-issuance");
  try {
    await applyMigrations(fixture.database);
    const [persistence, runner] = await Promise.all([
      fixture.vite.ssrLoadModule(new URL("../domain/enrichment-repository.ts", import.meta.url).pathname),
      fixture.vite.ssrLoadModule(new URL("../domain/runner-spend-authority.ts", import.meta.url).pathname),
    ]);
    const workspaceId = "runner-authority-workspace";
    const ownerSubject = "runner-authority-owner";
    await fixture.database.prepare(
      `INSERT INTO workspaces
        (id,company_name,owner_subject,created_at,updated_at,revision)
       VALUES (?, 'Runner Authority Workspace', ?, ?, ?, 1)`,
    ).bind(workspaceId, ownerSubject, NOW, NOW).run();
    const issue = (expectedRevision, idempotencyKey, monthlyCostMinor = 100) =>
      persistence.issueD1RunnerSpendAuthority(
        fixture.database,
        { workspaceId, ownerSubject, now: () => NOW },
        {
          providerId: "runner-provider",
          model: "runner-model",
          catalogRef: "runner-catalog",
          runType: "prospecting",
          scopeId: "runner-profile",
          perRunCostMinor: 10,
          monthlyCostMinor,
          currency: "CAD",
          maxRetries: 1,
          expiresAt: NOW + 10_000,
          expectedRevision,
          idempotencyKey,
        },
      );

    const first = await issue(1, "runner-authority-first");
    const replay = await issue(1, "runner-authority-first");
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.grant, first.grant);
    assert.equal(await countRows(fixture.database, "runner_spend_grants"), 1);
    assert.equal(await countRows(fixture.database, "authority_commands"), 1);

    await fixture.database.prepare(
      "UPDATE workspaces SET revision=2,updated_at=? WHERE id=?",
    ).bind(NOW + 1, workspaceId).run();
    const second = await issue(2, "runner-authority-second", 50);
    assert.notEqual(second.grant.id, first.grant.id);
    assert.equal(second.monthlyAccountId, first.monthlyAccountId);
    assert.equal(
      await countRows(fixture.database, "runner_budget_accounts"),
      5,
      "one shared monthly account plus two attempts for each grant",
    );

    const repository = persistence.createD1RunnerSpendRepository(
      fixture.database,
      { workspaceId, ownerSubject, now: () => NOW },
    );
    assert.equal(await repository.loadRunnerAuthority(first.grant.id), null, "the stale grant is no longer authority");
    const current = await repository.loadRunnerAuthority(second.grant.id);
    assert.ok(current, "the current grant can reuse historically issued monthly accounting");
    const reserved = await runner.reserveRunnerSpend(repository, {
      grantId: second.grant.id,
      principalSubject: ownerSubject,
      operationKey: await runner.deriveRunnerOperationKey(current),
      now: NOW,
    });
    assert.equal(reserved.kind, "reserved");
  } finally {
    await fixture.dispose();
  }
});
