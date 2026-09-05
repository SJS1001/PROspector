import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMigrations,
  assertForbiddenOperationalRowsUnchanged,
  countRows,
  createD1Fixture,
  snapshotForbiddenOperationalRows,
} from "./helpers/d1.mjs";

const OWNER = { subject: "a".repeat(64), legacySubject: "b".repeat(64), displayName: "Local owner" };

test("local composer traverses every hierarchy branch deterministically and treats review, not proposal, as completion", async () => {
  const fixture = await createD1Fixture("local-interview-composer-order");
  try {
    const api = await setup(fixture);
    const { workspace, company } = api;
    const newest = Number((await fixture.database.prepare("SELECT MAX(created_at) AS value FROM products WHERE workspace_id = ?").bind(workspace.id).first()).value) + 1;
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO products (id,workspace_id,created_at,updated_at,revision,company_id,name,lifecycle) VALUES ('product-a',?,?,?,?,?,'Product A','draft')").bind(workspace.id,newest,newest,1,company.id),
      fixture.database.prepare("INSERT INTO products (id,workspace_id,created_at,updated_at,revision,company_id,name,lifecycle) VALUES ('product-z',?,?,?,?,?,'Product Z','draft')").bind(workspace.id,newest,newest,1,company.id),
      fixture.database.prepare("INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES ('play-a',?,?,?,?,?,'Play A','draft')").bind(workspace.id,newest,newest,1,'product-a'),
      fixture.database.prepare("INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES ('play-z',?,?,?,?,?,'Play Z','draft')").bind(workspace.id,newest,newest,1,'product-z'),
      fixture.database.prepare("INSERT INTO customer_profiles (id,workspace_id,created_at,updated_at,revision,play_id,name,lifecycle,timezone,weekly_target) VALUES ('profile-a',?,?,?,?,?,'Profile A','draft','UTC',0)").bind(workspace.id,newest,newest,1,'play-a'),
      fixture.database.prepare("INSERT INTO customer_profiles (id,workspace_id,created_at,updated_at,revision,play_id,name,lifecycle,timezone,weekly_target) VALUES ('profile-z',?,?,?,?,?,'Profile Z','draft','UTC',0)").bind(workspace.id,newest,newest,1,'play-z'),
    ]);

    const first = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    assert.equal(first.next.label, "Company");
    assert.equal(first.next.destination.locator, company.name);
    assert.equal(first.next.requiresOwnerInput, true);
    assert.equal(first.next.recommendation, null);

    await api.knowledge.proposeOwnerEdit(fixture.database, OWNER, {
      destination: { scopeType: "company", id: company.id, locator: company.name },
      kind: "identity", value: { excerpt: "A proposed value has no authority." },
      source: { reference: "owner-ui:proposed-only", custody: "owner-entered", retrievedAt: Date.now() },
      privacy: "private", license: { use: "owner review" }, reuseEligibility: "company_only",
      idempotencyKey: key(20),
    });
    assert.equal((await api.composer.readLocalInterviewProgression(fixture.database, OWNER)).next.label, "Company");
    await confirmManualSlot(api, { scopeType: "product", id: "product-z", locator: "Product Z" }, "sibling_context", 24);
    const siblingVersion = await fixture.database.prepare("SELECT id FROM knowledge_versions WHERE workspace_id=? AND scope_id='product-z' AND kind='sibling_context' AND status='confirmed'").bind(workspace.id).first();
    assert.ok(siblingVersion?.id);

    const seen = [];
    for (let index = 0; index < first.totalSlots; index += 1) {
      const progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
      assert.equal(progression.status, "ready");
      seen.push(`${progression.next.label}:${progression.next.destination.locator}`);
      const active = await rejectNext(api, progression, index + 30);
      if (progression.next.destination.locator === "Product A") {
        assert.equal(active.question.prerequisiteKnowledge.some((item) => item.id === siblingVersion.id), false, "a sibling Product's current Knowledge is not causal prerequisite authority");
      }
    }
    const completed = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    assert.equal(completed.status, "complete", JSON.stringify({ seen, completed }, null, 2));
    assert.equal(completed.completedSlots, completed.totalSlots);
    assert.deepEqual(seen.slice(0, 4), [
      `Company:${company.name}`,
      "Product:ONE",
      "Market Play:ONE for Mining",
      "Customer Profile:Operating",
    ]);
    assert.ok(seen.indexOf("Offer:Operating") < seen.indexOf("Product:Product A"), "the first product subtree completes before the next Product");
    assert.ok(seen.indexOf("Product:Product A") < seen.indexOf("Market Play:Play A"));
    assert.ok(seen.indexOf("Market Play:Play A") < seen.indexOf("Customer Profile:Profile A"));
    assert.ok(seen.indexOf("Customer Profile:Profile A") < seen.indexOf("Offer:Profile A"));
    assert.ok(seen.indexOf("Offer:Profile A") < seen.indexOf("Product:Product Z"));
    assert.equal(await countRows(fixture.database, "offers"), 0, "reviewed Offer rejection advances without materializing an Offer");
  } finally {
    await fixture.dispose();
  }
});

test("queue digest, owner input, prerequisites, Offer lineage, and zero-effect boundary hold end to end", async () => {
  const fixture = await createD1Fixture("local-interview-composer-lineage");
  try {
    const api = await setup(fixture);
    const before = await snapshotForbiddenOperationalRows(fixture.database);
    const initial = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    const staleCounts = await counts(fixture.database);
    await fixture.database.prepare("UPDATE products SET revision = revision + 1 WHERE workspace_id = ?").bind(api.workspace.id).run();
    await assert.rejects(api.composer.advanceLocalInterview(fixture.database, OWNER, {
      expectedQueueDigest: initial.queueDigest,
      idempotencyKey: key(100),
    }), isConflict);
    assert.deepEqual(await counts(fixture.database), staleCounts, "stale queue rejection creates no interview or Knowledge rows");

    let progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    let state = await api.composer.advanceLocalInterview(fixture.database, OWNER, {
      expectedQueueDigest: progression.queueDigest,
      idempotencyKey: key(101),
    });
    assert.equal(state.status, "active");
    assert.equal(state.question.requiresOwnerInput, true);
    assert.equal(state.question.recommendationDetail, null);
    const noWrite = await counts(fixture.database);
    await assert.rejects(api.interview.submitInterviewAnswer(fixture.database, OWNER, {
      questionId: state.question.id, expectedRevision: state.question.revision,
      answer: "use_recommendation", idempotencyKey: key(102),
    }), isConflict);
    assert.deepEqual(await counts(fixture.database), noWrite, "a caller cannot forge a recommendation for an owner-input question");

    let sequence = 110;
    while (true) {
      const label = state.question.destination.scopeType === "customer_profile" && state.question.prompt.startsWith("What offer") ? "Offer" : "Other";
      const answer = await api.interview.submitInterviewAnswer(fixture.database, OWNER, {
        questionId: state.question.id, expectedRevision: state.question.revision,
        answer: "write_correction", value: { excerpt: label === "Offer" ? `Owner offer ${sequence}` : `Owner value ${sequence}` },
        reason: "Owner supplied this value explicitly for the disposable local demo.", idempotencyKey: key(sequence++),
      });
      state = await api.interview.recordInterviewDecision(fixture.database, OWNER, {
        answerId: answer.answer.id, expectedSessionRevision: answer.session.revision,
        expectedQuestionRevision: answer.question.revision, decision: "accept", idempotencyKey: key(sequence++),
      });
      progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
      if (progression.status === "complete") break;
      state = await api.composer.advanceLocalInterview(fixture.database, OWNER, {
        expectedQueueDigest: progression.queueDigest, idempotencyKey: key(sequence++),
      });
      assert.ok(state.question.prerequisiteKnowledge.length > 0, "later questions bind current Confirmed prerequisites");
    }
    assert.equal(await countRows(fixture.database, "offers"), 2, "one accepted Offer question materializes one Offer per Profile");
    await assertForbiddenOperationalRowsUnchanged(fixture.database, before);
  } finally {
    await fixture.dispose();
  }
});

test("advance replay and concurrency converge before changed session state is recomposed", async () => {
  const fixture = await createD1Fixture("local-interview-replay-race");
  try {
    const api = await setup(fixture);
    const progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    const idempotencyKey = key(300);
    const before = await issuanceCounts(fixture.database);
    const results = await Promise.all([
      api.composer.advanceLocalInterview(fixture.database, OWNER, { expectedQueueDigest: progression.queueDigest, idempotencyKey }),
      api.composer.advanceLocalInterview(fixture.database, OWNER, { expectedQueueDigest: progression.queueDigest, idempotencyKey }),
    ]);
    assert.equal(results[0].status, "active");
    assert.equal(results[1].status, "active");
    assert.equal(results[0].question.id, results[1].question.id);
    const replay = await api.composer.advanceLocalInterview(fixture.database, OWNER, { expectedQueueDigest: progression.queueDigest, idempotencyKey });
    assert.equal(replay.status, "active", "exact replay resolves before an active session could block composition");
    assert.equal(replay.question.id, results[0].question.id);
    assert.deepEqual(await issuanceCounts(fixture.database), {
      commands: before.commands + 1,
      questions: before.questions + 1,
      audits: before.audits + 1,
    });
    await assert.rejects(api.composer.advanceLocalInterview(fixture.database, OWNER, {
      expectedQueueDigest: "f".repeat(64), idempotencyKey,
    }), isConflict);
  } finally {
    await fixture.dispose();
  }
});

test("transaction-local queue fence rejects hierarchy and selected Knowledge interleavings with zero issuance writes", async () => {
  const fixture = await createD1Fixture("local-interview-queue-fence");
  try {
    const api = await setup(fixture);
    let progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    let before = await issuanceCounts(fixture.database);
    const hierarchyRace = interleavingDatabase(fixture.database, () => fixture.database.prepare(
      "UPDATE products SET revision=revision+1 WHERE workspace_id=?",
    ).bind(api.workspace.id).run());
    await assert.rejects(api.composer.advanceLocalInterview(hierarchyRace, OWNER, {
      expectedQueueDigest: progression.queueDigest, idempotencyKey: key(310),
    }), isConflict);
    assert.deepEqual(await issuanceCounts(fixture.database), before);

    await confirmManualSlot(api, { scopeType: "company", id: api.company.id, locator: api.company.name }, "identity", 320);
    progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    assert.equal(progression.next.label, "Product");
    const selected = await fixture.database.prepare(
      "SELECT kv.id FROM knowledge_versions kv JOIN knowledge_items ki ON ki.current_version_id=kv.id AND ki.workspace_id=kv.workspace_id WHERE kv.workspace_id=? AND kv.scope_id=? AND kv.kind='identity' LIMIT 1",
    ).bind(api.workspace.id, api.company.id).first();
    assert.ok(selected?.id);
    before = await issuanceCounts(fixture.database);
    const knowledgeRace = interleavingDatabase(fixture.database, () => fixture.database.prepare(
      "UPDATE knowledge_versions SET value_digest=? WHERE id=? AND workspace_id=?",
    ).bind("c".repeat(64), selected.id, api.workspace.id).run());
    await assert.rejects(api.composer.advanceLocalInterview(knowledgeRace, OWNER, {
      expectedQueueDigest: progression.queueDigest, idempotencyKey: key(330),
    }), isConflict);
    assert.deepEqual(await issuanceCounts(fixture.database), before);

    progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    const product = await fixture.database.prepare("SELECT id FROM products WHERE workspace_id=? ORDER BY created_at,id LIMIT 1").bind(api.workspace.id).first();
    before = await issuanceCounts(fixture.database);
    const destinationRace = interleavingDatabase(fixture.database, () => fixture.database.prepare(
      "UPDATE interview_sessions SET scope_type='product',scope_id=? WHERE workspace_id=? AND state IN ('open','completed') AND active_question_id IS NULL",
    ).bind(product.id, api.workspace.id).run());
    await assert.rejects(api.composer.advanceLocalInterview(destinationRace, OWNER, {
      expectedQueueDigest: progression.queueDigest, idempotencyKey: key(331),
    }), isConflict);
    assert.deepEqual(await issuanceCounts(fixture.database), before, "destination-only session drift is fenced without writes");
  } finally {
    await fixture.dispose();
  }
});

test("queue fence preserves the 29-prerequisite boundary at exactly 100 bindings and rejects 30 without writes", async () => {
  const fixture = await createD1Fixture("local-interview-binding-boundary");
  try {
    const api = await setup(fixture);
    for (let index = 0; index < 28; index += 1) {
      await confirmManualSlot(api, { scopeType: "company", id: api.company.id, locator: api.company.name }, `causal-${index}`, 500 + index * 2);
    }
    let progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    const bindingCounts = [];
    const counted = bindingCountingDatabase(fixture.database, bindingCounts);
    const active = await api.composer.advanceLocalInterview(counted, OWNER, {
      expectedQueueDigest: progression.queueDigest, idempotencyKey: key(600),
    });
    assert.equal(active.question.prerequisiteKnowledge.length, 29);
    assert.deepEqual(bindingCounts, [100], "the queue-fenced authority command uses the D1 maximum, not more");

    await rejectActive(api, active, 601);
    progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    await confirmManualSlot(api, { scopeType: "company", id: api.company.id, locator: api.company.name }, "causal-29", 604);
    const before = await issuanceCounts(fixture.database);
    await assert.rejects(api.composer.advanceLocalInterview(fixture.database, OWNER, {
      expectedQueueDigest: progression.queueDigest, idempotencyKey: key(606),
    }), isConflict);
    assert.deepEqual(await issuanceCounts(fixture.database), before, "30 prerequisites reject before command, question, or audit writes");
  } finally {
    await fixture.dispose();
  }
});

test("hierarchy corruption, cross-table identifier collisions, and oversized manifests fail closed", async () => {
  const fixture = await createD1Fixture("local-interview-malformed-hierarchy");
  try {
    const api = await setup(fixture);
    const before = await issuanceCounts(fixture.database);
    const corruptParent = resultMutatingDatabase(fixture.database, "FROM market_plays", (rows) => rows.map((row, index) => index === 0 ? { ...row, parentId: "missing-parent" } : row));
    await assert.rejects(api.composer.readLocalInterviewProgression(corruptParent, OWNER), isConflict);
    assert.deepEqual(await issuanceCounts(fixture.database), before);

    const product = await fixture.database.prepare("SELECT id,created_at FROM products WHERE workspace_id=? ORDER BY created_at,id LIMIT 1").bind(api.workspace.id).first();
    await fixture.database.prepare("INSERT INTO market_plays (id,workspace_id,created_at,updated_at,revision,product_id,name,lifecycle) VALUES (?,?,?,?,1,?,'Collision','draft')")
      .bind(product.id, api.workspace.id, Number(product.created_at) + 10, Number(product.created_at) + 10, product.id).run();
    await assert.rejects(api.composer.readLocalInterviewProgression(fixture.database, OWNER), isConflict);
    await fixture.database.prepare("DELETE FROM market_plays WHERE workspace_id=? AND id=? AND name='Collision'").bind(api.workspace.id, product.id).run();

    const oversized = resultMutatingDatabase(fixture.database, "FROM customer_profiles", (rows) => {
      const parentId = rows[0].parentId;
      return Array.from({ length: 255 }, (_, index) => ({
        id: `synthetic-profile-${index}`, parentId, name: `Synthetic ${index}`, revision: 1, createdAt: index + 1,
      }));
    });
    await assert.rejects(api.composer.readLocalInterviewProgression(oversized, OWNER), isConflict);
    assert.deepEqual(await issuanceCounts(fixture.database), before, "malformed and over-bound hierarchy projections cannot issue authority");

    assert.throws(() => api.authoring.validateInterviewQueueFence({
      workspaceRevision: 1,
      session: { id: "session", revision: 1, state: "completed", activeQuestionId: null, scopeType: "company", scopeId: "company" },
      hierarchy: [
        { id: "company", type: "company", parentId: null, name: "Company", revision: 1, createdAt: 1 },
        ...Array.from({ length: 253 }, (_, index) => ({
          id: `p${String(index).padStart(3, "0")}${"x".repeat(156)}`, type: "product", parentId: "company", name: "x".repeat(160), revision: 1, createdAt: index + 2,
        })),
      ],
      currentKnowledge: [], reviewedSlots: [],
    }), isConflict, "a below-entry-limit but over-byte-limit manifest fails closed");
  } finally {
    await fixture.dispose();
  }
});

test("only exact interview lineage completes a slot and rescope leaves its source pending", async () => {
  const fixture = await createD1Fixture("local-interview-lineage-policy");
  try {
    const api = await setup(fixture);
    const proposal = await api.knowledge.proposeOwnerEdit(fixture.database, OWNER, {
      destination: { scopeType: "company", id: api.company.id, locator: api.company.name }, kind: "identity",
      value: { excerpt: "Manual rejected identity" }, source: { reference: "owner-ui:manual-reject", custody: "owner", retrievedAt: Date.now() },
      privacy: "private", license: { use: "owner review" }, reuseEligibility: "company_only", idempotencyKey: key(340),
    });
    await api.knowledge.reviewKnowledgeProposal(fixture.database, OWNER, { proposalId: proposal.id, decision: "reject", expectedRevision: 1, idempotencyKey: key(341) });
    let progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    assert.equal(progression.next.label, "Company", "an unrelated manual review is not interview lineage");

    let state = await api.composer.advanceLocalInterview(fixture.database, OWNER, { expectedQueueDigest: progression.queueDigest, idempotencyKey: key(342) });
    const answer = await api.interview.submitInterviewAnswer(fixture.database, OWNER, {
      questionId: state.question.id, expectedRevision: state.question.revision, answer: "write_correction",
      value: { excerpt: "Rescoped identity" }, reason: "Owner explicitly selected another scope.", idempotencyKey: key(343),
    });
    const product = await fixture.database.prepare("SELECT id,name FROM products WHERE workspace_id=? ORDER BY created_at,id LIMIT 1").bind(api.workspace.id).first();
    state = await api.interview.recordInterviewDecision(fixture.database, OWNER, {
      answerId: answer.answer.id, expectedSessionRevision: answer.session.revision, expectedQuestionRevision: answer.question.revision,
      decision: "rescope", destination: { scopeType: "product", id: product.id, locator: product.name },
      value: { excerpt: "Rescoped identity" }, reason: "The value belongs to this Product.", idempotencyKey: key(344),
    });
    assert.equal(state.status, "confirmed");
    progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    assert.equal(progression.next.label, "Company", "rescope does not complete the source Company slot");
    assert.ok(await fixture.database.prepare("SELECT id FROM knowledge_versions WHERE workspace_id=? AND scope_type='product' AND scope_id=? AND kind='identity' AND status='confirmed'").bind(api.workspace.id, product.id).first());
  } finally {
    await fixture.dispose();
  }
});

test("decision atomically rejects a superseded question prerequisite before review, Knowledge, or Offer writes", async () => {
  const fixture = await createD1Fixture("local-interview-decision-prerequisite");
  try {
    const api = await setup(fixture);
    let progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    await rejectNext(api, progression, 360);
    progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    const active = await api.composer.advanceLocalInterview(fixture.database, OWNER, { expectedQueueDigest: progression.queueDigest, idempotencyKey: key(370) });
    assert.ok(active.question.prerequisiteKnowledge.length > 0);
    const answer = await api.interview.submitInterviewAnswer(fixture.database, OWNER, {
      questionId: active.question.id, expectedRevision: active.question.revision, answer: "write_correction",
      value: { excerpt: "Owner product capability" }, reason: "Owner supplied it.", idempotencyKey: key(371),
    });
    await fixture.database.prepare("UPDATE knowledge_versions SET status='superseded' WHERE id=? AND workspace_id=?").bind(active.question.prerequisiteKnowledge[0].id, api.workspace.id).run();
    const before = await decisionCounts(fixture.database);
    await assert.rejects(api.interview.recordInterviewDecision(fixture.database, OWNER, {
      answerId: answer.answer.id, expectedSessionRevision: answer.session.revision, expectedQuestionRevision: answer.question.revision,
      decision: "accept", idempotencyKey: key(372),
    }), isConflict);
    assert.deepEqual(await decisionCounts(fixture.database), before);
  } finally {
    await fixture.dispose();
  }
});

test("decision rejects a manual same-slot confirmation created after the local question", async () => {
  const fixture = await createD1Fixture("local-interview-same-slot-race");
  try {
    const api = await setup(fixture);
    const progression = await api.composer.readLocalInterviewProgression(fixture.database, OWNER);
    const active = await api.composer.advanceLocalInterview(fixture.database, OWNER, {
      expectedQueueDigest: progression.queueDigest, idempotencyKey: key(700),
    });
    const answer = await api.interview.submitInterviewAnswer(fixture.database, OWNER, {
      questionId: active.question.id, expectedRevision: active.question.revision,
      answer: "write_correction", value: { excerpt: "Interview identity" }, reason: "Owner supplied it.", idempotencyKey: key(701),
    });
    await confirmManualSlot(api, active.question.destination, active.question.knowledgeKind, 702);
    const before = await decisionCounts(fixture.database);
    await assert.rejects(api.interview.recordInterviewDecision(fixture.database, OWNER, {
      answerId: answer.answer.id, expectedSessionRevision: answer.session.revision,
      expectedQuestionRevision: answer.question.revision, decision: "accept", idempotencyKey: key(704),
    }), isConflict);
    assert.deepEqual(await decisionCounts(fixture.database), before, "same-slot authority drift creates no command, decision, version, confirmation, or Offer");
  } finally {
    await fixture.dispose();
  }
});

async function setup(fixture) {
  await applyMigrations(fixture.database);
  const [interview, commercial, composer, knowledge, authoring] = await Promise.all([
    fixture.vite.ssrLoadModule(new URL("../domain/interview.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/commercial-model.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/interview-question-composer.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname),
    fixture.vite.ssrLoadModule(new URL("../domain/interview-question-authoring.ts", import.meta.url).pathname),
  ]);
  let state = await interview.bootstrapInterview(fixture.database, OWNER);
  const model = await commercial.initializeCommercialModel(fixture.database, OWNER, { idempotencyKey: key(1) });
  const answer = await interview.submitInterviewAnswer(fixture.database, OWNER, {
    questionId: state.question.id, expectedRevision: state.question.revision, answer: "write_correction",
    value: { excerpt: "Owner baseline policy" }, reason: "Establish the disposable local interview baseline.", idempotencyKey: key(2),
  });
  state = await interview.recordInterviewDecision(fixture.database, OWNER, {
    answerId: answer.answer.id, expectedSessionRevision: answer.session.revision,
    expectedQuestionRevision: answer.question.revision, decision: "accept", idempotencyKey: key(3),
  });
  assert.equal(state.status, "confirmed");
  return { database: fixture.database, interview, commercial, composer, knowledge, authoring, workspace: model.workspace, company: model.path.find((node) => node.type === "company") };
}

async function confirmManualSlot(api, destination, kind, sequence) {
  const proposal = await api.knowledge.proposeOwnerEdit(api.database, OWNER, {
    destination, kind, value: { excerpt: `Confirmed manual slot ${sequence}` },
    source: { reference: `owner-ui:manual-${sequence}`, custody: "owner", retrievedAt: Date.now() },
    privacy: "private", license: { use: "owner review" }, reuseEligibility: "company_only", idempotencyKey: key(sequence),
  });
  return api.knowledge.reviewKnowledgeProposal(api.database, OWNER, { proposalId: proposal.id, decision: "accept", expectedRevision: 1, idempotencyKey: key(sequence + 1) });
}

function interleavingDatabase(database, mutate) {
  let fired = false;
  return {
    prepare(sql) { return database.prepare(sql); },
    async batch(statements) {
      if (!fired) { fired = true; await mutate(); }
      return database.batch(statements);
    },
  };
}

function bindingCountingDatabase(database, bindingCounts) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return new Proxy(statement, {
        get(target, property) {
          if (property === "bind") return (...values) => {
            if (sql.includes("INSERT INTO authority_commands") && sql.includes("interview.question.issue")) bindingCounts.push(values.length);
            return target.bind(...values);
          };
          const value = target[property];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
    batch(statements) { return database.batch(statements); },
  };
}

function resultMutatingDatabase(database, sqlMarker, mutateRows) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return new Proxy(statement, {
        get(target, property) {
          if (property === "bind") return (...values) => {
            const bound = target.bind(...values);
            if (!sql.includes(sqlMarker)) return bound;
            return new Proxy(bound, {
              get(boundTarget, boundProperty) {
                if (boundProperty === "all") return async () => {
                  const result = await boundTarget.all();
                  return { ...result, results: mutateRows(result.results) };
                };
                const value = boundTarget[boundProperty];
                return typeof value === "function" ? value.bind(boundTarget) : value;
              },
            });
          };
          const value = target[property];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
    batch(statements) { return database.batch(statements); },
  };
}

async function issuanceCounts(database) {
  const [commands, questions, audits] = await Promise.all([
    database.prepare("SELECT COUNT(*) AS count FROM authority_commands WHERE command_type='interview.question.issue'").first(),
    database.prepare("SELECT COUNT(*) AS count FROM interview_questions").first(),
    database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='interview.question_issued'").first(),
  ]);
  return { commands: Number(commands.count), questions: Number(questions.count), audits: Number(audits.count) };
}

async function decisionCounts(database) {
  const tables = ["proposal_decisions", "knowledge_items", "knowledge_versions", "interview_confirmations", "offers", "authority_commands", "audit_events"];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await countRows(database, table)])));
}

async function rejectNext(api, progression, sequence) {
  const active = await api.composer.advanceLocalInterview(apiFixtureDatabase(api), OWNER, {
    expectedQueueDigest: progression.queueDigest, idempotencyKey: key(sequence * 3),
  });
  const answer = await api.interview.submitInterviewAnswer(apiFixtureDatabase(api), OWNER, {
    questionId: active.question.id, expectedRevision: active.question.revision, answer: "write_correction",
    value: { excerpt: `Owner-reviewed value ${sequence}` }, reason: "Explicit local review.", idempotencyKey: key(sequence * 3 + 1),
  });
  await api.interview.recordInterviewDecision(apiFixtureDatabase(api), OWNER, {
    answerId: answer.answer.id, expectedSessionRevision: answer.session.revision,
    expectedQuestionRevision: answer.question.revision, decision: "reject", idempotencyKey: key(sequence * 3 + 2),
  });
  const after = await api.composer.readLocalInterviewProgression(apiFixtureDatabase(api), OWNER);
  assert.notEqual(after.next?.knowledgeKind + after.next?.destination.id, progression.next?.knowledgeKind + progression.next?.destination.id,
    "the explicit reviewed decision must advance exactly one queue slot");
  return active;
}

async function rejectActive(api, active, sequence) {
  const answer = await api.interview.submitInterviewAnswer(api.database, OWNER, {
    questionId: active.question.id, expectedRevision: active.question.revision, answer: "write_correction",
    value: { excerpt: `Owner-reviewed value ${sequence}` }, reason: "Explicit local review.", idempotencyKey: key(sequence),
  });
  return api.interview.recordInterviewDecision(api.database, OWNER, {
    answerId: answer.answer.id, expectedSessionRevision: answer.session.revision,
    expectedQuestionRevision: answer.question.revision, decision: "reject", idempotencyKey: key(sequence + 1),
  });
}

function apiFixtureDatabase(api) { return api.database; }

async function counts(database) {
  return Object.fromEntries(await Promise.all(["interview_questions", "interview_answers", "interview_confirmations", "knowledge_proposals", "knowledge_versions", "offers", "authority_commands", "audit_events"].map(async (table) => [table, await countRows(database, table)])));
}

function key(sequence) { return `01990000-0000-7000-8000-${String(sequence).padStart(12, "0")}`; }
function isConflict(error) { return error?.code === "interview_conflict"; }
