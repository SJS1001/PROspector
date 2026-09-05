import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.UTC(2026, 8, 5, 12);
const HASH = "a".repeat(64);

async function load(vite) {
  return vite.ssrLoadModule(new URL("../domain/synthetic-enrichment-prerequisite-plan.ts", import.meta.url).pathname);
}

async function fixture(module, mutate = (value) => value) {
  const grant = {
    schema: "synthetic-enrichment-grant-snapshot/v1",
    grantId: "synthetic-grant-1",
    workspaceId: "synthetic-workspace-1",
    profileConfigurationId: "synthetic-profile-configuration-1",
    profileConfigurationDigest: HASH,
    configurationRevision: 3,
    providerId: "synthetic-provider",
    providerVersion: "synthetic-v1",
    catalogRef: "synthetic-known-contact-lookup",
    quoteRevision: 2,
    prospectId: "synthetic-prospect-1",
    prospectRevision: 7,
    maxUnits: 1,
    maxCostMinor: 25,
    currency: "CAD",
    expiresAt: NOW + 60_000,
  };
  grant.snapshotDigest = await module.digestSyntheticEnrichmentMaterial(grant);
  const contact = {
    schema: "synthetic-known-contact/v1",
    contactId: "synthetic-contact-1",
    workspaceId: grant.workspaceId,
    revision: 4,
    relevance: {
      relationId: "synthetic-relevance-1",
      workspaceId: grant.workspaceId,
      contactId: "synthetic-contact-1",
      prospectId: grant.prospectId,
      confirmed: true,
      revision: 2,
    },
    roleApproval: {
      workspaceId: grant.workspaceId,
      contactId: "synthetic-contact-1",
      prospectId: grant.prospectId,
      role: "economic_buyer",
      ownerApproved: true,
      revision: 2,
    },
  };
  contact.contactDigest = await module.digestSyntheticEnrichmentMaterial(contact);
  const entities = {
    grant: grant.grantId,
    profile: grant.profileConfigurationId,
    workspace: grant.workspaceId,
    provider: grant.providerId,
  };
  const capPolicy = {
    schema: "synthetic-enrichment-cap-policy/v1",
    workspaceId: grant.workspaceId,
    grantDigest: grant.snapshotDigest,
    contactDigest: contact.contactDigest,
    ownerApproved: true,
    revision: 1,
    accounts: ["provider", "workspace", "grant", "profile"].map((scope) => ({
      scope,
      entityId: entities[scope],
      currency: grant.currency,
      maxUnits: 10,
      maxCostMinor: 250,
    })),
  };
  capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(capPolicy);
  return mutate({ grant, contact, capPolicy, now: NOW });
}

async function withModule(run) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    await run(await load(vite));
  } finally {
    await vite.close();
  }
}

test("derives exactly four ordered zero-balance accounts and one canonical known-contact assignment", async () => {
  await withModule(async (module) => {
    const input = await fixture(module);
    const result = await module.planSyntheticEnrichmentPrerequisites(input);
    assert.equal(result.kind, "planned");
    assert.deepEqual(result.plan.budgetAccounts.map((account) => account.scope), ["grant", "profile", "workspace", "provider"]);
    assert.equal(result.plan.budgetAccounts.length, 4);
    const entities = {
      grant: input.grant.grantId,
      profile: input.grant.profileConfigurationId,
      workspace: input.grant.workspaceId,
      provider: input.grant.providerId,
    };
    for (const account of result.plan.budgetAccounts) {
      assert.equal(account.actualUnits, 0);
      assert.equal(account.reservedUnits, 0);
      assert.equal(account.actualCostMinor, 0);
      assert.equal(account.reservedCostMinor, 0);
      assert.equal(
        account.accountId,
        `enrichment:${input.grant.workspaceId.length}:${input.grant.workspaceId}:${account.scope}:${entities[account.scope].length}:${entities[account.scope]}`,
      );
    }
    assert.equal(result.plan.evidenceAssignments.length, 1);
    assert.deepEqual(result.plan.evidenceAssignments[0], {
      assignmentId: `cea_${result.plan.evidenceAssignments[0].assignmentDigest.slice(0, 24)}`,
      assignmentDigest: result.plan.evidenceAssignments[0].assignmentDigest,
      workspaceId: input.grant.workspaceId,
      grantId: input.grant.grantId,
      prospectId: input.grant.prospectId,
      contactId: input.contact.contactId,
      role: "economic_buyer",
      profileConfigurationId: input.grant.profileConfigurationId,
      profileConfigurationDigest: input.grant.profileConfigurationDigest,
      providerId: input.grant.providerId,
      providerVersion: input.grant.providerVersion,
      catalogRef: input.grant.catalogRef,
      quoteRevision: input.grant.quoteRevision,
    });
    assert.equal(result.plan.effectAuthority, "none");
    assert.equal(result.plan.persistenceAuthority, "none");
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.plan), true);
    assert.equal(Object.isFrozen(result.plan.budgetAccounts), true);
    assert.equal(Object.isFrozen(result.plan.evidenceAssignments), true);
    assert.ok(result.plan.budgetAccounts.every(Object.isFrozen));
    assert.ok(result.plan.evidenceAssignments.every(Object.isFrozen));
  });
});

test("exact replay is deterministic despite policy account input ordering", async () => {
  await withModule(async (module) => {
    const firstInput = await fixture(module);
    const secondInput = await fixture(module, (value) => {
      value.capPolicy.accounts.reverse();
      delete value.capPolicy.policyDigest;
      return value;
    });
    secondInput.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(secondInput.capPolicy);
    const first = await module.planSyntheticEnrichmentPrerequisites(firstInput);
    const second = await module.planSyntheticEnrichmentPrerequisites(secondInput);
    assert.equal(first.kind, "planned");
    assert.equal(second.kind, "planned");
    assert.notEqual(first.plan.capPolicyDigest, second.plan.capPolicyDigest, "policy snapshots retain their own immutable order");
    assert.equal((await module.compareSyntheticEnrichmentPrerequisitePlans(first.plan, first.plan)).kind, "exact_replay");
    assert.equal((await module.compareSyntheticEnrichmentPrerequisitePlans(first.plan, second.plan)).kind, "conflict");
  });
});

test("an exact immutable input replay produces identical bytes and digest", async () => {
  await withModule(async (module) => {
    const input = await fixture(module);
    const first = await module.planSyntheticEnrichmentPrerequisites(input);
    const second = await module.planSyntheticEnrichmentPrerequisites(structuredClone(input));
    assert.deepEqual(second, first);
    assert.equal((await module.compareSyntheticEnrichmentPrerequisitePlans(first.plan, second.plan)).kind, "exact_replay");
  });
});

test("every material authority change yields a separately detectable conflict", async () => {
  await withModule(async (module) => {
    const original = await fixture(module);
    const changed = await fixture(module, (value) => {
      value.capPolicy.accounts[0].maxCostMinor += 1;
      delete value.capPolicy.policyDigest;
      return value;
    });
    changed.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(changed.capPolicy);
    const before = await module.planSyntheticEnrichmentPrerequisites(original);
    const after = await module.planSyntheticEnrichmentPrerequisites(changed);
    assert.equal(before.kind, "planned");
    assert.equal(after.kind, "planned");
    assert.notEqual(after.plan.planDigest, before.plan.planDigest);
    assert.deepEqual(await module.compareSyntheticEnrichmentPrerequisitePlans(before.plan, after.plan), {
      kind: "conflict",
      existingPlanDigest: before.plan.planDigest,
      candidatePlanDigest: after.plan.planDigest,
    });
  });
});

test("rejects expired grants and foreign or mismatched workspace, prospect, provider, configuration, and policy bindings", async () => {
  await withModule(async (module) => {
    const cases = [
      ["expired", (value) => { value.now = value.grant.expiresAt; }, "stale_or_expired"],
      ["foreign contact", (value) => { value.contact.workspaceId = "foreign"; }, "invalid_snapshot"],
      ["wrong prospect", (value) => { value.contact.relevance.prospectId = "foreign"; }, "invalid_snapshot"],
      ["wrong policy grant", (value) => { value.capPolicy.grantDigest = "b".repeat(64); }, "invalid_snapshot"],
      ["wrong provider entity", (value) => { value.capPolicy.accounts.find((entry) => entry.scope === "provider").entityId = "foreign"; }, "invalid_snapshot"],
      ["wrong configuration entity", (value) => { value.capPolicy.accounts.find((entry) => entry.scope === "profile").entityId = "foreign"; }, "invalid_snapshot"],
    ];
    for (const [name, mutate, reason] of cases) {
      const input = await fixture(module, (value) => { mutate(value); return value; });
      const result = await module.planSyntheticEnrichmentPrerequisites(input);
      assert.deepEqual(result, { kind: "blocked", reason }, name);
    }
  });
});

test("rejects unconfirmed relevance, unapproved roles, duplicates, missing accounts, and insufficient caps", async () => {
  await withModule(async (module) => {
    const cases = [
      ["unconfirmed", (value) => { value.contact.relevance.confirmed = false; }, "invalid_snapshot"],
      ["role unapproved", (value) => { value.contact.roleApproval.ownerApproved = false; }, "invalid_snapshot"],
      ["duplicate", (value) => { value.capPolicy.accounts[3].scope = "grant"; }, "invalid_snapshot"],
      ["missing", (value) => { value.capPolicy.accounts.pop(); }, "invalid_snapshot"],
      ["units", (value) => { value.capPolicy.accounts[0].maxUnits = 0; }, "invalid_snapshot"],
      ["cost", (value) => { value.capPolicy.accounts[0].maxCostMinor = 24; }, "invalid_snapshot"],
    ];
    for (const [name, mutate, reason] of cases) {
      const input = await fixture(module, (value) => { mutate(value); return value; });
      const result = await module.planSyntheticEnrichmentPrerequisites(input);
      assert.deepEqual(result, { kind: "blocked", reason }, name);
    }
  });
});

test("validly re-digested adverse snapshots still fail their semantic gates", async () => {
  await withModule(async (module) => {
    const foreignWorkspace = await fixture(module, (value) => {
      value.contact.workspaceId = "foreign-workspace";
      delete value.contact.contactDigest;
      return value;
    });
    foreignWorkspace.contact.contactDigest = await module.digestSyntheticEnrichmentMaterial(foreignWorkspace.contact);
    foreignWorkspace.capPolicy.contactDigest = foreignWorkspace.contact.contactDigest;
    delete foreignWorkspace.capPolicy.policyDigest;
    foreignWorkspace.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(foreignWorkspace.capPolicy);
    assert.deepEqual(
      await module.planSyntheticEnrichmentPrerequisites(foreignWorkspace),
      { kind: "blocked", reason: "foreign_or_mismatched" },
    );

    const foreignProviderAccount = await fixture(module, (value) => {
      value.capPolicy.accounts.find((entry) => entry.scope === "provider").entityId = "foreign-provider";
      delete value.capPolicy.policyDigest;
      return value;
    });
    foreignProviderAccount.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(foreignProviderAccount.capPolicy);
    assert.deepEqual(
      await module.planSyntheticEnrichmentPrerequisites(foreignProviderAccount),
      { kind: "blocked", reason: "foreign_or_mismatched" },
    );

    const relevance = await fixture(module, (value) => {
      value.contact.relevance.prospectId = "foreign-prospect";
      delete value.contact.contactDigest;
      return value;
    });
    relevance.contact.contactDigest = await module.digestSyntheticEnrichmentMaterial(relevance.contact);
    relevance.capPolicy.contactDigest = relevance.contact.contactDigest;
    delete relevance.capPolicy.policyDigest;
    relevance.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(relevance.capPolicy);
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(relevance), { kind: "blocked", reason: "relevance_not_confirmed" });

    const role = await fixture(module, (value) => {
      value.contact.roleApproval.prospectId = "foreign-prospect";
      delete value.contact.contactDigest;
      return value;
    });
    role.contact.contactDigest = await module.digestSyntheticEnrichmentMaterial(role.contact);
    role.capPolicy.contactDigest = role.contact.contactDigest;
    delete role.capPolicy.policyDigest;
    role.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(role.capPolicy);
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(role), { kind: "blocked", reason: "role_not_approved" });

    const duplicate = await fixture(module, (value) => {
      value.capPolicy.accounts[3].scope = "grant";
      value.capPolicy.accounts[3].entityId = value.grant.grantId;
      delete value.capPolicy.policyDigest;
      return value;
    });
    duplicate.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(duplicate.capPolicy);
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(duplicate), { kind: "blocked", reason: "duplicate_data" });

    const insufficient = await fixture(module, (value) => {
      value.capPolicy.accounts[0].maxCostMinor = 24;
      delete value.capPolicy.policyDigest;
      return value;
    });
    insufficient.capPolicy.policyDigest = await module.digestSyntheticEnrichmentMaterial(insufficient.capPolicy);
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(insufficient), { kind: "blocked", reason: "insufficient_cap" });
  });
});

test("rejects stale immutable digests, extra data, sparse accounts, and forged plans", async () => {
  await withModule(async (module) => {
    const stale = await fixture(module, (value) => { value.grant.prospectRevision += 1; return value; });
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(stale), { kind: "blocked", reason: "invalid_snapshot" });

    const extra = await fixture(module, (value) => ({ ...value, contactCoordinate: "forbidden" }));
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(extra), { kind: "blocked", reason: "invalid_snapshot" });

    const sparse = await fixture(module);
    delete sparse.capPolicy.accounts[2];
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(sparse), { kind: "blocked", reason: "invalid_snapshot" });

    const planned = await module.planSyntheticEnrichmentPrerequisites(await fixture(module));
    const forged = structuredClone(planned.plan);
    forged.planDigest = "f".repeat(64);
    assert.deepEqual(await module.compareSyntheticEnrichmentPrerequisitePlans(planned.plan, forged), { kind: "invalid_plan" });
  });
});

test("rejects accessor-backed and proxy inputs without evaluating caller code", async () => {
  await withModule(async (module) => {
    const input = await fixture(module);
    let getterCalls = 0;
    const accessor = { ...input };
    Object.defineProperty(accessor, "now", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return NOW;
      },
    });
    assert.deepEqual(await module.planSyntheticEnrichmentPrerequisites(accessor), { kind: "blocked", reason: "invalid_snapshot" });
    assert.equal(getterCalls, 0);
    assert.deepEqual(
      await module.planSyntheticEnrichmentPrerequisites(new Proxy(input, { ownKeys() { throw new Error("caller trap"); } })),
      { kind: "blocked", reason: "invalid_snapshot" },
    );
  });
});

test("exported digest rejects hostile accessors and proxies without invoking getters", async () => {
  await withModule(async (module) => {
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, "secret", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "must-not-run";
      },
    });
    await assert.rejects(module.digestSyntheticEnrichmentMaterial(accessor), /invalid_synthetic_enrichment_material/u);
    assert.equal(getterCalls, 0);
    await assert.rejects(
      module.digestSyntheticEnrichmentMaterial(new Proxy({ safe: true }, {})),
      /invalid_synthetic_enrichment_material/u,
    );
  });
});

test("exported comparator rejects hostile accessors and proxies without invoking getters", async () => {
  await withModule(async (module) => {
    const planned = await module.planSyntheticEnrichmentPrerequisites(await fixture(module));
    let getterCalls = 0;
    const accessor = { ...planned.plan };
    Object.defineProperty(accessor, "planDigest", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return planned.plan.planDigest;
      },
    });
    assert.deepEqual(
      await module.compareSyntheticEnrichmentPrerequisitePlans(accessor, planned.plan),
      { kind: "invalid_plan" },
    );
    assert.equal(getterCalls, 0);
    assert.deepEqual(
      await module.compareSyntheticEnrichmentPrerequisitePlans(new Proxy(planned.plan, {}), planned.plan),
      { kind: "invalid_plan" },
    );
  });
});

test("comparator rejects re-digested nested account and assignment forgeries", async () => {
  await withModule(async (module) => {
    const planned = await module.planSyntheticEnrichmentPrerequisites(await fixture(module));
    const redigestPlan = async (mutate, redigestAssignment = false) => {
      const forged = structuredClone(planned.plan);
      mutate(forged);
      if (redigestAssignment) {
        const assignment = forged.evidenceAssignments[0];
        assignment.assignmentDigest = await module.digestSyntheticEnrichmentMaterial({
          schema: "synthetic-contact-evidence-assignment/v1",
          workspaceId: assignment.workspaceId,
          grantId: assignment.grantId,
          prospectId: assignment.prospectId,
          contactId: assignment.contactId,
          role: assignment.role,
          profileConfigurationId: assignment.profileConfigurationId,
          profileConfigurationDigest: assignment.profileConfigurationDigest,
          providerId: assignment.providerId,
          providerVersion: assignment.providerVersion,
          catalogRef: assignment.catalogRef,
          quoteRevision: assignment.quoteRevision,
          contactDigest: forged.contactDigest,
          grantDigest: forged.grantDigest,
        });
        assignment.assignmentId = `cea_${assignment.assignmentDigest.slice(0, 24)}`;
      }
      const material = structuredClone(forged);
      delete material.planDigest;
      forged.planDigest = await module.digestSyntheticEnrichmentMaterial(material);
      return forged;
    };
    const cases = [
      ["account schema", (plan) => { plan.budgetAccounts[0].authorityType = "other"; }],
      ["account id", (plan) => { plan.budgetAccounts[0].accountId += "-forged"; }],
      ["scope order", (plan) => { [plan.budgetAccounts[0], plan.budgetAccounts[1]] = [plan.budgetAccounts[1], plan.budgetAccounts[0]]; }],
      ["duplicate scope", (plan) => { plan.budgetAccounts[1].scope = "grant"; }],
      ["nonzero balance", (plan) => { plan.budgetAccounts[2].reservedUnits = 1; }],
      ["currency split", (plan) => { plan.budgetAccounts[3].currency = "USD"; }],
      ["invalid cap", (plan) => { plan.budgetAccounts[0].maxUnits = 0; }],
      ["foreign entity", (plan) => { plan.budgetAccounts[3].entityId = "foreign"; }],
      ["assignment workspace", (plan) => { plan.evidenceAssignments[0].workspaceId = "foreign"; }, true],
      ["assignment grant", (plan) => { plan.evidenceAssignments[0].grantId = "foreign"; }, true],
      ["assignment contact", (plan) => { plan.evidenceAssignments[0].contactId = "foreign"; }, true],
      ["assignment configuration", (plan) => { plan.evidenceAssignments[0].profileConfigurationId = "foreign"; }, true],
      ["assignment provider", (plan) => { plan.evidenceAssignments[0].providerId = "foreign"; }, true],
      ["assignment digest", (plan) => { plan.evidenceAssignments[0].assignmentDigest = "f".repeat(64); }],
      ["assignment id", (plan) => { plan.evidenceAssignments[0].assignmentId = "cea_forged"; }],
    ];
    for (const [name, mutate, redigestAssignment] of cases) {
      const forged = await redigestPlan(mutate, redigestAssignment);
      assert.deepEqual(
        await module.compareSyntheticEnrichmentPrerequisitePlans(planned.plan, forged),
        { kind: "invalid_plan" },
        name,
      );
    }
  });
});

test("does not import persistence, routes, providers, browser types, coordinates, or source locators", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../domain/synthetic-enrichment-prerequisite-plan.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import\s/mu);
  assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:D1Database|Request|Response|ProviderPort|ContactPoint)\b/u);
  assert.doesNotMatch(source, /(?:email|phone|sourceReference|sourceLocator|credential)\s*:/u);

  for (const directory of ["app", "worker"]) {
    const root = new URL(`../${directory}/`, import.meta.url);
    const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.[cm]?[jt]sx?$/u.test(entry.name)) continue;
      const body = await fs.readFile(`${entry.parentPath}/${entry.name}`, "utf8");
      assert.doesNotMatch(body, /synthetic-enrichment-prerequisite-plan/u, `${directory}/${entry.name} must not compose the synthetic planner`);
    }
  }
});
