import assert from "node:assert/strict";
import test from "node:test";

import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

const NOW = 1_785_000_000_000;
const WORKSPACE_ID = "identity-persistence-workspace";
const OWNER = Object.freeze({
  subject: "identity-persistence-owner",
  admittedOwner: true,
});

test("D1 identity repository round-trips the exact canonical suggestion", async () => {
  const fixture = await createD1Fixture("identity-persistence-suggestion");
  try {
    await applyMigrations(fixture.database);
    await seedContactIdentities(fixture.database);
    const domain = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    );
    const persistence = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-repository.ts", import.meta.url).pathname,
    );
    const repository = persistence.createD1IdentityResolutionRepository(
      fixture.database,
      {
        workspaceId: WORKSPACE_ID,
        ownerSubject: OWNER.subject,
        subjectKind: "contact",
        now: () => NOW,
      },
    );

    const suggestion = await domain.planIdentitySuggestion(repository, OWNER, {
      workspaceId: WORKSPACE_ID,
      kind: "merge",
      candidateIds: ["identity-contact-alpha", "identity-contact-beta"],
    });
    const reloaded = await repository.readIdentitySuggestion(
      WORKSPACE_ID,
      OWNER.subject,
      suggestion.id,
    );

    assert.deepEqual(reloaded, suggestion);
    assert.deepEqual(suggestion.sourceLineageIds, [
      "identity-contact-alpha",
      "identity-contact-beta",
    ]);
    assert.equal(suggestion.retainedAliases.length, 2);
    assert.ok(suggestion.retainedAliases.every((alias) => /^iar_[a-f0-9]{24}$/.test(alias)));
    assert.doesNotMatch(JSON.stringify(suggestion.retainedAliases), /Jane Smith|Jane Q\. Smith/);
    assert.deepEqual(
      suggestion.retainedSuppressionSubjectRefs,
      ["b".repeat(64)],
    );
    assert.deepEqual(
      suggestion.associationImpact.map((impact) => impact.id),
      ["identity-relevance-alpha", "identity-relevance-beta"],
    );
    const foreignOwnerRepository =
      persistence.createD1IdentityResolutionRepository(fixture.database, {
        workspaceId: WORKSPACE_ID,
        ownerSubject: "identity-persistence-other-owner",
        subjectKind: "contact",
        now: () => NOW,
      });
    assert.deepEqual(
      await foreignOwnerRepository.readIdentitySnapshots(
        WORKSPACE_ID,
        ["identity-contact-alpha"],
      ),
      [],
    );
  } finally {
    await fixture.dispose();
  }
});

test("D1 identity repository applies one merge transaction and replays it exactly", async () => {
  const fixture = await createD1Fixture("identity-persistence-merge");
  try {
    await applyMigrations(fixture.database);
    await seedContactIdentities(fixture.database);
    const domain = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    );
    const persistence = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-repository.ts", import.meta.url).pathname,
    );
    const repository = persistence.createD1IdentityResolutionRepository(
      fixture.database,
      {
        workspaceId: WORKSPACE_ID,
        ownerSubject: OWNER.subject,
        subjectKind: "contact",
        now: () => NOW,
      },
    );
    const suggestion = await domain.planIdentitySuggestion(repository, OWNER, {
      workspaceId: WORKSPACE_ID,
      kind: "merge",
      candidateIds: ["identity-contact-alpha", "identity-contact-beta"],
    });
    const input = {
      workspaceId: WORKSPACE_ID,
      suggestionId: suggestion.id,
      decision: {
        kind: "merge",
        primaryId: "identity-contact-alpha",
        secondaryIds: ["identity-contact-beta"],
      },
      expectedRevision: suggestion.revision,
      idempotencyKey: "identity-persistence-merge-key",
    };

    const [applied, replay] = await Promise.all([
      domain.applyIdentityResolution(repository, OWNER, input),
      domain.applyIdentityResolution(repository, OWNER, input),
    ]);
    assert.deepEqual(replay, applied);

    const decisionCount = await count(
      fixture.database,
      "identity_decisions",
    );
    const lineageCount = await count(fixture.database, "identity_lineage");
    assert.equal(decisionCount, 1);
    assert.equal(lineageCount, 1);
    const relevance = (await fixture.database.prepare(
      `SELECT id,contact_id FROM contact_relevance
       WHERE workspace_id=? ORDER BY id`,
    ).bind(WORKSPACE_ID).all()).results;
    assert.deepEqual(relevance, [
      {
        id: "identity-relevance-alpha",
        contact_id: "identity-contact-alpha",
      },
      {
        id: "identity-relevance-beta",
        contact_id: "identity-contact-alpha",
      },
    ]);
    const revisions = (await fixture.database.prepare(
      `SELECT id,revision FROM contacts WHERE workspace_id=? ORDER BY id`,
    ).bind(WORKSPACE_ID).all()).results;
    assert.deepEqual(revisions, [
      { id: "identity-contact-alpha", revision: 3 },
      { id: "identity-contact-beta", revision: 4 },
    ]);
    assert.deepEqual(
      await repository.readIdentitySnapshots(
        WORKSPACE_ID,
        ["identity-contact-beta"],
      ),
      [],
      "a merged secondary cannot regain canonical identity authority",
    );
  } finally {
    await fixture.dispose();
  }
});

test("D1 identity repository rolls back a stale merge without partial history", async () => {
  const fixture = await createD1Fixture("identity-persistence-stale");
  try {
    await applyMigrations(fixture.database);
    await seedContactIdentities(fixture.database);
    const domain = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    );
    const persistence = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-repository.ts", import.meta.url).pathname,
    );
    const repository = persistence.createD1IdentityResolutionRepository(
      fixture.database,
      {
        workspaceId: WORKSPACE_ID,
        ownerSubject: OWNER.subject,
        subjectKind: "contact",
        now: () => NOW,
      },
    );
    const suggestion = await domain.planIdentitySuggestion(repository, OWNER, {
      workspaceId: WORKSPACE_ID,
      kind: "merge",
      candidateIds: ["identity-contact-alpha", "identity-contact-beta"],
    });
    await fixture.database.prepare(
      `UPDATE contacts SET revision=revision+1,updated_at=updated_at+1
       WHERE id='identity-contact-beta' AND workspace_id=?`,
    ).bind(WORKSPACE_ID).run();

    await assert.rejects(
      () => domain.applyIdentityResolution(repository, OWNER, {
        workspaceId: WORKSPACE_ID,
        suggestionId: suggestion.id,
        decision: {
          kind: "merge",
          primaryId: "identity-contact-alpha",
          secondaryIds: ["identity-contact-beta"],
        },
        expectedRevision: suggestion.revision,
        idempotencyKey: "identity-persistence-stale-key",
      }),
      /identity_resolution_rejected/,
    );
    assert.equal(await count(fixture.database, "identity_decisions"), 0);
    assert.equal(await count(fixture.database, "identity_lineage"), 0);
    const beta = await fixture.database.prepare(
      `SELECT contact_id FROM contact_relevance
       WHERE id='identity-relevance-beta' AND workspace_id=?`,
    ).bind(WORKSPACE_ID).first();
    assert.equal(beta.contact_id, "identity-contact-beta");
  } finally {
    await fixture.dispose();
  }
});

test("D1 identity repository preserves the server-owned split partition and lineage", async () => {
  const fixture = await createD1Fixture("identity-persistence-split");
  try {
    await applyMigrations(fixture.database);
    await seedContactIdentities(fixture.database);
    const domain = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    );
    const persistence = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-repository.ts", import.meta.url).pathname,
    );
    const repository = persistence.createD1IdentityResolutionRepository(
      fixture.database,
      {
        workspaceId: WORKSPACE_ID,
        ownerSubject: OWNER.subject,
        subjectKind: "contact",
        now: () => NOW,
      },
    );
    const suggestion = await domain.planIdentitySuggestion(repository, OWNER, {
      workspaceId: WORKSPACE_ID,
      kind: "split",
      sourceId: "identity-contact-beta",
      moveAssociationIds: ["identity-relevance-beta"],
    });
    const input = {
      workspaceId: WORKSPACE_ID,
      suggestionId: suggestion.id,
      decision: {
        kind: "split",
        sourceId: "identity-contact-beta",
        moveAssociationIds: ["identity-relevance-beta"],
      },
      expectedRevision: suggestion.revision,
      idempotencyKey: "identity-persistence-split-key",
    };
    const applied = await domain.applyIdentityResolution(
      repository,
      OWNER,
      input,
    );
    assert.equal(
      applied.decision.newIdentityId,
      suggestion.proposedPartition.newIdentityId,
    );
    assert.deepEqual(
      await domain.applyIdentityResolution(repository, OWNER, input),
      applied,
    );

    const destination = await fixture.database.prepare(
      `SELECT id,display_name,revision FROM contacts
       WHERE id=? AND workspace_id=?`,
    ).bind(applied.decision.newIdentityId, WORKSPACE_ID).first();
    assert.deepEqual(destination, {
      id: applied.decision.newIdentityId,
      display_name: "Jane Q. Smith",
      revision: 1,
    });
    const moved = await fixture.database.prepare(
      `SELECT contact_id FROM contact_relevance
       WHERE id='identity-relevance-beta' AND workspace_id=?`,
    ).bind(WORKSPACE_ID).first();
    assert.equal(moved.contact_id, applied.decision.newIdentityId);
    const lineage = await fixture.database.prepare(
      `SELECT source_subject_id,target_subject_id,relationship
       FROM identity_lineage WHERE decision_id=?`,
    ).bind(applied.id).first();
    assert.deepEqual(lineage, {
      source_subject_id: "identity-contact-beta",
      target_subject_id: applied.decision.newIdentityId,
      relationship: "split_from",
    });
  } finally {
    await fixture.dispose();
  }
});

test("D1 identity repository rejects forged child lineage during reconstruction", async () => {
  const fixture = await createD1Fixture("identity-persistence-forged-child");
  try {
    await applyMigrations(fixture.database);
    await seedContactIdentities(fixture.database);
    const persistence = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-repository.ts", import.meta.url).pathname,
    );
    const repository = persistence.createD1IdentityResolutionRepository(
      fixture.database,
      {
        workspaceId: WORKSPACE_ID,
        ownerSubject: OWNER.subject,
        subjectKind: "contact",
        now: () => NOW,
      },
    );
    await fixture.database.batch([
      fixture.database.prepare(
        `INSERT INTO identity_suggestions (
          id,workspace_id,owner_subject,subject_kind,kind,revision,
          candidate_revisions_json,source_lineage_ids_json,
          retained_identity_lineage_ids_json,retained_aliases_json,
          retained_suppression_subject_refs_json,proposed_partition_json,
          suggestion_digest,created_at
        ) VALUES (
          'forged-suggestion',?,'identity-persistence-owner','contact','merge',5,
          '{"identity-contact-alpha":2,"identity-contact-beta":3}',
          '["identity-contact-alpha","identity-contact-beta"]',
          '["identity-contact-alpha","identity-contact-beta"]',
          '["Alpha-Contact","Beta-Contact"]',?,NULL,?,?
        )`,
      ).bind(
        WORKSPACE_ID,
        JSON.stringify(["b".repeat(64)]),
        "c".repeat(64),
        NOW,
      ),
      fixture.database.prepare(
        `INSERT INTO identity_suggestion_candidates (
          id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal
        ) VALUES (
          'forged-child-alpha',?,'forged-suggestion',
          'identity-contact-alpha',2,0
        )`,
      ).bind(WORKSPACE_ID),
      fixture.database.prepare(
        `INSERT INTO identity_suggestion_candidates (
          id,workspace_id,suggestion_id,subject_id,candidate_revision,ordinal
        ) VALUES (
          'forged-child-beta',?,'forged-suggestion',
          'identity-contact-beta',3,1
        )`,
      ).bind(WORKSPACE_ID),
    ]);

    assert.equal(
      await repository.readIdentitySuggestion(
        WORKSPACE_ID,
        OWNER.subject,
        "forged-suggestion",
      ),
      null,
    );
  } finally {
    await fixture.dispose();
  }
});

test("D1 identity repository applies organization associations through the same scoped seam", async () => {
  const fixture = await createD1Fixture("identity-persistence-organization");
  try {
    await applyMigrations(fixture.database);
    await seedOrganizationIdentities(fixture.database);
    const domain = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    );
    const persistence = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-repository.ts", import.meta.url).pathname,
    );
    const repository = persistence.createD1IdentityResolutionRepository(
      fixture.database,
      {
        workspaceId: WORKSPACE_ID,
        ownerSubject: OWNER.subject,
        subjectKind: "organization",
        now: () => NOW,
      },
    );
    const suggestion = await domain.planIdentitySuggestion(repository, OWNER, {
      workspaceId: WORKSPACE_ID,
      kind: "merge",
      candidateIds: ["identity-org-alpha", "identity-org-beta"],
    });
    const applied = await domain.applyIdentityResolution(
      repository,
      OWNER,
      {
        workspaceId: WORKSPACE_ID,
        suggestionId: suggestion.id,
        decision: {
          kind: "merge",
          primaryId: "identity-org-alpha",
          secondaryIds: ["identity-org-beta"],
        },
        expectedRevision: suggestion.revision,
        idempotencyKey: "identity-persistence-org-key",
      },
    );

    assert.equal(applied.decision.primaryId, "identity-org-alpha");
    const accounts = (await fixture.database.prepare(
      `SELECT id,organization_id FROM accounts
       WHERE workspace_id=? ORDER BY id`,
    ).bind(WORKSPACE_ID).all()).results;
    assert.deepEqual(accounts, [
      { id: "identity-account-alpha", organization_id: "identity-org-alpha" },
      { id: "identity-account-beta", organization_id: "identity-org-alpha" },
    ]);
  } finally {
    await fixture.dispose();
  }
});

test("D1 identity repository fails closed when a contact-point suppression has no identity binding", async () => {
  const fixture = await createD1Fixture("identity-persistence-unbound-suppression");
  try {
    await applyMigrations(fixture.database);
    await seedContactIdentities(fixture.database);
    await fixture.database.prepare(
      `INSERT INTO suppressions
        (id,workspace_id,subject_type,subject_digest,channel,reason,created_at)
       VALUES ('identity-unbound-suppression',?,'email',?,'email','synthetic',?)`,
    ).bind(WORKSPACE_ID, "f".repeat(64), NOW).run();
    const domain = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-resolution.ts", import.meta.url).pathname,
    );
    const persistence = await fixture.vite.ssrLoadModule(
      new URL("../domain/identity-repository.ts", import.meta.url).pathname,
    );
    const repository = persistence.createD1IdentityResolutionRepository(
      fixture.database,
      {
        workspaceId: WORKSPACE_ID,
        ownerSubject: OWNER.subject,
        subjectKind: "contact",
        now: () => NOW,
      },
    );

    await assert.rejects(
      () => domain.planIdentitySuggestion(repository, OWNER, {
        workspaceId: WORKSPACE_ID,
        kind: "merge",
        candidateIds: ["identity-contact-alpha", "identity-contact-beta"],
      }),
      /identity_resolution_rejected/,
    );
    assert.equal(await count(fixture.database, "identity_suggestions"), 0);
  } finally {
    await fixture.dispose();
  }
});

async function seedContactIdentities(database) {
  await database.batch([
    database.prepare(
      `INSERT INTO workspaces
        (id,company_name,owner_subject,created_at,updated_at,revision)
       VALUES (?, 'Identity Persistence', ?, ?, ?, 1)`,
    ).bind(WORKSPACE_ID, OWNER.subject, NOW, NOW),
    database.prepare(
      `INSERT INTO companies
        (id,workspace_id,created_at,updated_at,revision,name,status)
       VALUES ('identity-company',?,?,?,1,'Identity Company','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO products
        (id,workspace_id,created_at,updated_at,revision,name,lifecycle)
       VALUES ('identity-product',?,?,?,1,'Identity Product','ready')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO market_plays
        (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle)
       VALUES ('identity-play',?,?,?,1,'identity-product','Identity Play','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO market_plays
        (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle)
       VALUES ('identity-play-beta',?,?,?,1,'identity-product','Beta Play','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO contacts
        (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name)
       VALUES ('identity-contact-alpha',?,?,?,2,'identity-company',?,'Jane Smith')`,
    ).bind(WORKSPACE_ID, NOW, NOW, "a".repeat(64)),
    database.prepare(
      `INSERT INTO contacts
        (id,workspace_id,created_at,updated_at,revision,company_id,identity_digest,display_name)
       VALUES ('identity-contact-beta',?,?,?,3,'identity-company',?,'Jane Q. Smith')`,
    ).bind(WORKSPACE_ID, NOW, NOW, "b".repeat(64)),
    database.prepare(
      `INSERT INTO contact_relevance
        (id,workspace_id,created_at,updated_at,revision,play_id,contact_id,relevance_json)
       VALUES ('identity-relevance-alpha',?,?,?,1,'identity-play','identity-contact-alpha','{}')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO contact_relevance
        (id,workspace_id,created_at,updated_at,revision,play_id,contact_id,relevance_json)
       VALUES ('identity-relevance-beta',?,?,?,1,'identity-play-beta','identity-contact-beta','{}')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO suppressions
        (id,workspace_id,subject_type,subject_digest,channel,reason,created_at)
       VALUES ('identity-suppression-beta',?,'contact',?,'email','synthetic',?)`,
    ).bind(WORKSPACE_ID, "b".repeat(64), NOW),
  ]);
}

async function seedOrganizationIdentities(database) {
  await database.batch([
    database.prepare(
      `INSERT INTO workspaces
        (id,company_name,owner_subject,created_at,updated_at,revision)
       VALUES (?, 'Identity Persistence', ?, ?, ?, 1)`,
    ).bind(WORKSPACE_ID, OWNER.subject, NOW, NOW),
    database.prepare(
      `INSERT INTO companies
        (id,workspace_id,created_at,updated_at,revision,name,status)
       VALUES ('identity-company',?,?,?,1,'Identity Company','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO products
        (id,workspace_id,created_at,updated_at,revision,name,lifecycle)
       VALUES ('identity-product',?,?,?,1,'Identity Product','ready')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO market_plays
        (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle)
       VALUES ('identity-play',?,?,?,1,'identity-product','Identity Play','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO market_plays
        (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle)
       VALUES ('identity-play-beta',?,?,?,1,'identity-product','Beta Play','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO organizations
        (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest)
       VALUES ('identity-org-alpha',?,?,?,2,'identity-company','ACME, Inc.',?)`,
    ).bind(WORKSPACE_ID, NOW, NOW, "d".repeat(64)),
    database.prepare(
      `INSERT INTO organizations
        (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest)
       VALUES ('identity-org-beta',?,?,?,3,'identity-company','ACME Holdings, Inc.',?)`,
    ).bind(WORKSPACE_ID, NOW, NOW, "e".repeat(64)),
    database.prepare(
      `INSERT INTO accounts
        (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state)
       VALUES ('identity-account-alpha',?,?,?,1,'identity-play','identity-org-alpha','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
    database.prepare(
      `INSERT INTO accounts
        (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state)
       VALUES ('identity-account-beta',?,?,?,1,'identity-play-beta','identity-org-beta','active')`,
    ).bind(WORKSPACE_ID, NOW, NOW),
  ]);
}

async function count(database, table) {
  const row = await database.prepare(
    `SELECT count(*) count FROM ${table}`,
  ).first();
  return Number(row.count);
}
