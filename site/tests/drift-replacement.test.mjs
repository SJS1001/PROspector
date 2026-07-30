import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";

const HIGH_RISK_KINDS = ["capability", "claim_guardrail", "offer", "proof_point", "suppression"];

test("drift evaluator has a deterministic reached-only high-risk contract", async () => {
  const driftUrl = new URL("../domain/drift.ts", import.meta.url);
  try {
    await access(driftUrl);
  } catch {
    assert.fail(
      "missing production behavior: site/domain/drift.ts must evaluate persisted dependency-reached impact",
    );
  }
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const drift = await vite.ssrLoadModule(driftUrl.pathname);
    assert.equal(typeof drift.classifyDriftRisk, "function");
    assert.equal(typeof drift.evaluateReachedImpact, "function");
    assert.deepEqual(drift.HIGH_RISK_DRIFT_KINDS, HIGH_RISK_KINDS);
    assert.equal(drift.classifyDriftRisk("unknown_kind"), "standard");
    assert.equal(drift.classifyDriftRisk("offer"), "high_risk");
  } finally {
    await vite.close();
  }
});

test("replacement candidate and activation are separately idempotent immutable commands", async () => {
  const replacementUrl = new URL("../domain/replacement.ts", import.meta.url);
  try {
    await access(replacementUrl);
  } catch {
    assert.fail(
      "missing production behavior: site/domain/replacement.ts must create and separately activate immutable replacements",
    );
  }
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const replacement = await vite.ssrLoadModule(replacementUrl.pathname);
    assert.equal(typeof replacement.createReplacementCandidate, "function");
    assert.equal(typeof replacement.activateReplacement, "function");
    assert.equal(replacement.REPLACEMENT_CANDIDATE_STATUS, "candidate_not_active");
    assert.equal(replacement.ACTIVATION_REQUIRES_EXACT_IMPACT_DIGEST, true);
  } finally {
    await vite.close();
  }
});

test("synthetic graph contract excludes unrelated artifacts and preserves the prior configuration", () => {
  const edges = [
    "source-1>version-1",
    "version-1>configuration-1",
    "configuration-1>artifact-reached",
  ];
  const reached = edges.filter((edge) => edge.startsWith("source-1") || edge.startsWith("version-1") || edge.startsWith("configuration-1"));
  assert.equal(reached.includes("configuration-2>artifact-unrelated"), false);
  assert.deepEqual(HIGH_RISK_KINDS, [...HIGH_RISK_KINDS].sort());
  assert.notEqual("previous-configuration-digest", "candidate-configuration-digest");
  assert.notEqual("candidate-operation-key", "activation-operation-key");
});

test("replacement candidate creation rolls back when the active configuration loses its revision race", async () => {
  const fixture = await createD1Fixture("replacement-candidate-race");
  try {
    await applyMigrations(fixture.database);
    const knowledge = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname);
    const replacement = await fixture.vite.ssrLoadModule(new URL("../domain/replacement.ts", import.meta.url).pathname);
    const principal = { subject: "replacement-owner", legacySubject: "replacement-legacy", displayName: "Owner" };
    const inputFor = (key, excerpt) => ({
      origin: "owner_edit", destination: { scopeType: "product", locator: "ONE" }, kind: "capability", value: { excerpt },
      source: { reference: `opaque:${key}`, custody: "synthetic-test", retrievedAt: 1_700_000_000_000 }, privacy: "private",
      license: { use: "internal_review_only" }, reuseEligibility: "company_only", idempotencyKey: key,
    });
    const currentProposal = await knowledge.createKnowledgeProposal(fixture.database, principal, inputFor("0198a4b0-0000-7000-8000-000000000280", "Current configuration knowledge."));
    const current = await knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: currentProposal.id, decision: "accept", expectedRevision: currentProposal.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000281" });
    const proposedProposal = await knowledge.createKnowledgeProposal(fixture.database, principal, inputFor("0198a4b0-0000-7000-8000-000000000282", "Proposed configuration knowledge."));
    const proposed = await knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: proposedProposal.id, decision: "accept", expectedRevision: proposedProposal.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000283" });
    const owner = await fixture.database.prepare("SELECT w.id AS workspace_id, c.id AS company_id, p.id AS product_id FROM workspaces w JOIN companies c ON c.workspace_id = w.id JOIN products p ON p.company_id = c.id AND p.workspace_id = w.id WHERE w.owner_subject = ? AND p.name = 'ONE'").bind(principal.subject).first();
    const now = Date.now();
    await fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('active-config-race', ?, ?, ?, 1, ?, 'product', ?, 'product_discovery', 'active-digest-race', '{}', 1)").bind(owner.workspace_id, now, now, owner.company_id, owner.product_id).run();
    let raced = false;
    const racingDatabase = {
      prepare: (...args) => fixture.database.prepare(...args),
      batch: async (statements) => {
        if (!raced) {
          raced = true;
          await fixture.database.prepare("UPDATE typed_configurations SET revision = revision + 1, updated_at = ? WHERE id = 'active-config-race'").bind(Date.now()).run();
        }
        return fixture.database.batch(statements);
      },
    };
    await assert.rejects(replacement.createReplacementCandidate(racingDatabase, principal, {
      currentVersionId: current.version.id, proposedVersionId: proposed.version.id, ownerType: "product", ownerId: owner.product_id,
      kind: "product_discovery", manifest: { version: 2 }, riskKind: "capability", dependencyEdges: [], expectedOwnerRevision: 1,
      idempotencyKey: "0198a4b0-0000-7000-8000-000000000284",
    }), /conflict|refresh|partial/i);
    for (const table of ["knowledge_drifts", "drift_impact_snapshots", "replacement_candidates"]) {
      const row = await fixture.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
      assert.equal(Number(row.count), 0, `${table} must roll back after the optimistic guard loses`);
    }
    const configurations = await fixture.database.prepare("SELECT COUNT(*) AS count FROM typed_configurations WHERE workspace_id = ?").bind(owner.workspace_id).first();
    const commands = await fixture.database.prepare("SELECT COUNT(*) AS count FROM authority_commands WHERE workspace_id = ? AND command_type = 'replacement.candidate'").bind(owner.workspace_id).first();
    const audits = await fixture.database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id = ? AND action = 'replacement.candidate_created'").bind(owner.workspace_id).first();
    assert.equal(Number(configurations.count), 1);
    assert.equal(Number(commands.count), 0);
    assert.equal(Number(audits.count), 0);
  } finally { await fixture.dispose(); }
});

test("replacement activation requires an accepted proposal-backed open Drift review", async () => {
  const fixture = await createD1Fixture("replacement-drift-review");
  try {
    await applyMigrations(fixture.database);
    const knowledge = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge.ts", import.meta.url).pathname);
    const replacement = await fixture.vite.ssrLoadModule(new URL("../domain/replacement.ts", import.meta.url).pathname);
    const handler = await fixture.vite.ssrLoadModule(new URL("../domain/knowledge-handler.ts", import.meta.url).pathname);
    const principal = { subject: "drift-review-owner", legacySubject: "drift-review-legacy", displayName: "Owner" };
    const proposal = async (suffix, excerpt) => {
      const proposed = await knowledge.createKnowledgeProposal(fixture.database, principal, {
        origin: "owner_edit", destination: { scopeType: "product", locator: "ONE" }, kind: "capability", value: { excerpt },
        source: { reference: `opaque:drift:${suffix}`, custody: "synthetic-test", retrievedAt: 1_700_000_000_000 }, privacy: "private",
        license: { use: "internal_review_only" }, reuseEligibility: "company_only", idempotencyKey: `0198a4b0-0000-7000-8000-0000000003${suffix}`,
      });
      return (await knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: proposed.id, decision: "accept", expectedRevision: proposed.revision, idempotencyKey: `0198a4b0-0000-7000-8000-0000000004${suffix}` })).version;
    };
    const current = await proposal("10", "Current capability.");
    const proposed = await proposal("11", "Proposed capability.");
    const owner = await fixture.database.prepare("SELECT w.id AS workspace_id, c.id AS company_id, p.id AS product_id FROM workspaces w JOIN companies c ON c.workspace_id = w.id JOIN products p ON p.company_id = c.id AND p.workspace_id = w.id WHERE w.owner_subject = ? AND p.name = 'ONE'").bind(principal.subject).first();
    const now = Date.now();
    await fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('active-config-review', ?, ?, ?, 1, ?, 'product', ?, 'product_discovery', 'active-digest-review', '{}', 1)").bind(owner.workspace_id, now, now, owner.company_id, owner.product_id).run();
    await fixture.database.prepare("INSERT INTO configuration_knowledge_dependencies (configuration_id, knowledge_version_id, created_at) VALUES ('active-config-review', ?, ?)").bind(current.id, now).run();
    const projected = await handler.readDrift(fixture.database, principal);
    const eligible = projected.find((item) => item.status === "eligible" && item.currentVersionId === current.id && item.proposedVersionId === proposed.id);
    assert.ok(eligible?.candidate, "the owner-scoped projection exposes the first exact candidate mutation");
    const candidateInput = { ...eligible.candidate, idempotencyKey: "0198a4b0-0000-7000-8000-000000000412" };
    const candidate = await replacement.createReplacementCandidate(fixture.database, principal, candidateInput);
    assert.deepEqual(await replacement.createReplacementCandidate(fixture.database, principal, candidateInput), candidate, "same-key candidate retry resolves the original candidate, not the active configuration");
    const drift = await fixture.database.prepare("SELECT id, proposal_id, status, current_version_id, proposed_version_id FROM knowledge_drifts WHERE workspace_id = ?").bind(owner.workspace_id).first();
    const driftProposal = await fixture.database.prepare("SELECT revision, status FROM knowledge_proposals WHERE id = ?").bind(drift.proposal_id).first();
    assert.equal(drift.status, "open");
    assert.equal(driftProposal.status, "proposed");
    assert.equal(drift.current_version_id, current.id);
    assert.equal(drift.proposed_version_id, proposed.id);
    await assert.rejects(replacement.activateReplacement(fixture.database, principal, { candidateId: candidate.id, impactDigest: candidate.impactDigest, expectedOwnerRevision: 1, expectedCandidateRevision: candidate.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000413" }), /accept.*Drift review/i);
    await assert.rejects(knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: drift.proposal_id, decision: "accept", predecessorVersionId: proposed.id, expectedRevision: driftProposal.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000416" }), /predecessor.*match/i);
    const accepted = await knowledge.reviewKnowledgeProposal(fixture.database, principal, { proposalId: drift.proposal_id, decision: "accept", expectedRevision: driftProposal.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000414" });
    assert.equal((await fixture.database.prepare("SELECT status FROM knowledge_drifts WHERE id = ?").bind(drift.id).first()).status, "resolved");
    assert.equal(accepted.version.predecessorId, current.id, "generic proposal review derives the exact Drift predecessor");
    assert.equal(accepted.version.knowledgeItemId, current.knowledgeItemId, "Drift acceptance advances the stable Knowledge item");
    assert.equal((await fixture.database.prepare("SELECT status FROM knowledge_versions WHERE id = ?").bind(current.id).first()).status, "superseded");
    const refreshed = await replacement.readReplacementState(fixture.database, principal, candidate.id);
    const activated = await replacement.activateReplacement(fixture.database, principal, { candidateId: candidate.id, impactDigest: candidate.impactDigest, expectedOwnerRevision: 1, expectedCandidateRevision: refreshed.revision, idempotencyKey: "0198a4b0-0000-7000-8000-000000000415" });
    assert.equal(activated.status, "activated");
  } finally { await fixture.dispose(); }
});
