import { v7 } from "uuid";

import type { InterviewPrincipal } from "./interview";

export class CommercialModelConflictError extends Error {
  readonly code = "commercial_model_conflict";
}

type HierarchyType = "company" | "product" | "market_play" | "customer_profile" | "offer";
type DraftType = Exclude<HierarchyType, "company" | "offer">;

export type CommercialHierarchyNode = {
  id: string;
  type: HierarchyType;
  parentId: string | null;
  name: string;
  lifecycle: string;
  revision: number;
  nurtureState?: "nurture";
};

export type CommercialModelProjection = {
  workspace: { id: string; companyName: string };
  path: CommercialHierarchyNode[];
  products: CommercialHierarchyNode[];
  plays: CommercialHierarchyNode[];
  profiles: CommercialHierarchyNode[];
  offers: CommercialHierarchyNode[];
  knowledgeCategories: {
    product: string[];
    marketPlay: string[];
    customerProfile: string[];
  };
  identities: { organization: { uniqueScope: "company" }; contact: { uniqueScope: "company" } };
  associations: { account: { uniqueScope: "market_play_profile" } };
  scopeLegend: Record<string, string>;
};

const categories = {
  product: ["capability", "limitation", "delivery", "proof", "ownership", "claim_guardrail"],
  marketPlay: ["market", "problem", "audience", "language", "evidence", "offer_context"],
  customerProfile: ["fit", "disqualifier", "roles", "signals", "rubric", "proof_policy", "contact_policy", "outreach_policy", "schedule", "timezone", "output_target"],
};

export async function initializeCommercialModel(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { idempotencyKey: string },
): Promise<CommercialModelProjection> {
  validateKey(input.idempotencyKey);
  const now = Date.now();
  let workspace = await findWorkspace(database, principal);
  if (!workspace) {
    try {
      const id = v7();
      await database.prepare(
        "INSERT INTO workspaces (id, company_name, owner_subject, created_at, updated_at, revision) VALUES (?, 'Digitalrain', ?, ?, ?, 1)",
      ).bind(id, principal.subject, now, now).run();
    } catch (error) {
      if (!isConstraint(error)) throw error;
    }
    workspace = await findWorkspace(database, principal);
  }
  if (!workspace) throw new CommercialModelConflictError("Workspace initialization did not converge");

  const digest = await digestFor({ action: "initialize_commercial_model", key: input.idempotencyKey, workspaceId: workspace.id });
  const existing = await commandForKey(database, workspace.id, input.idempotencyKey);
  if (existing && existing.operation_digest !== digest) throw new CommercialModelConflictError("Idempotency key was reused for another command");
  if (!existing) {
    try {
      await database.prepare(
        `INSERT INTO authority_commands
         (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status)
         VALUES (?, ?, ?, ?, 1, 'commercial.initialize', ?, ?, ?, 'workspace', ?, 'accepted')`,
      ).bind(v7(), workspace.id, now, now, input.idempotencyKey, digest, workspace.revision, workspace.id).run();
    } catch (error) {
      if (!isConstraint(error)) throw error;
    }
  }

  const company = await ensureCompany(database, workspace, now);
  const product = await ensureProduct(database, workspace.id, company.id, "ONE", now);
  const play = await ensurePlay(database, workspace.id, product.id, "ONE for Mining", now);
  await ensureProfile(database, workspace.id, play.id, "Operating", now);
  await ensureProfile(database, workspace.id, play.id, "Greenfield", now);
  return readCommercialModel(database, principal);
}

export async function readCommercialModel(database: D1Database, principal: InterviewPrincipal): Promise<CommercialModelProjection> {
  const workspace = await requireWorkspace(database, principal);
  const company = await database.prepare("SELECT id, name, status, revision FROM companies WHERE workspace_id = ? LIMIT 1").bind(workspace.id).first<Row>();
  if (!company) throw new CommercialModelConflictError("Commercial model is not initialized");
  const products = await database.prepare("SELECT id, name, lifecycle, revision FROM products WHERE workspace_id = ? AND company_id = ? ORDER BY created_at, id").bind(workspace.id, company.id).all<Row>();
  const plays = await database.prepare("SELECT p.id, p.name, p.lifecycle, p.revision, p.product_id AS parent_id FROM market_plays p JOIN products product ON product.id = p.product_id AND product.workspace_id = p.workspace_id WHERE p.workspace_id = ? ORDER BY p.created_at, p.id").bind(workspace.id).all<Row>();
  const profiles = await database.prepare("SELECT p.id, p.name, p.lifecycle, p.revision, p.play_id AS parent_id FROM customer_profiles p JOIN market_plays play ON play.id = p.play_id AND play.workspace_id = p.workspace_id WHERE p.workspace_id = ? ORDER BY p.created_at, p.id").bind(workspace.id).all<Row>();
  const offers = await database.prepare("SELECT o.id, o.name, o.revision, o.profile_id AS parent_id FROM offers o JOIN customer_profiles profile ON profile.id = o.profile_id AND profile.workspace_id = o.workspace_id WHERE o.workspace_id = ? ORDER BY o.created_at, o.id").bind(workspace.id).all<Row>();
  const productNodes = products.results.map((row) => node(row, "product", company.id));
  const playNodes = plays.results.map((row) => node(row, "market_play", row.parent_id));
  const profileNodes = profiles.results.map((row) => ({ ...node(row, "customer_profile", row.parent_id), nurtureState: "nurture" as const }));
  const offerNodes = offers.results.map((row) => node(row, "offer", row.parent_id, "draft"));
  return {
    workspace: { id: workspace.id, companyName: workspace.company_name },
    path: [node(company, "company", null, "active"), ...productNodes, ...playNodes, ...profileNodes],
    products: productNodes,
    plays: playNodes,
    profiles: profileNodes,
    offers: offerNodes,
    knowledgeCategories: categories,
    identities: { organization: { uniqueScope: "company" }, contact: { uniqueScope: "company" } },
    associations: { account: { uniqueScope: "market_play_profile" } },
    scopeLegend: { company: "Company-wide identity", product: "Shared product knowledge", market_play: "Market-scoped relationships", customer_profile: "Profile-scoped authority", offer: "Confirmed hierarchy-interview lineage only" },
  };
}

export async function createHierarchyDraft(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { type: DraftType | "offer"; parentId: string; name: string; expectedRevision: number; idempotencyKey: string; productFundamentalsDiverge?: boolean },
): Promise<CommercialHierarchyNode> {
  validateKey(input.idempotencyKey);
  if (input.type === "offer") throw new CommercialModelConflictError("Offers require confirmed hierarchy-interview authority");
  if (input.productFundamentalsDiverge && input.type === "market_play") throw new CommercialModelConflictError("Fundamentally divergent delivery requires a new Product");
  const name = boundedName(input.name);
  const workspace = await requireWorkspace(database, principal);
  const parent = await parentForDraft(database, workspace.id, input.type, input.parentId);
  if (!parent) throw new CommercialModelConflictError("Parent is outside the authorized workspace or scope");
  if (parent.revision !== input.expectedRevision) throw new CommercialModelConflictError("Stale parent revision");
  const digest = await digestFor({ action: "create_hierarchy_draft", workspaceId: workspace.id, type: input.type, parentId: parent.id, expectedRevision: input.expectedRevision, name, key: input.idempotencyKey });
  const prior = await commandForKey(database, workspace.id, input.idempotencyKey);
  if (prior) {
    if (prior.operation_digest !== digest) throw new CommercialModelConflictError("Idempotency key was reused for another command");
    const existing = await entityForCommand(database, workspace.id, prior.id, input.type);
    if (existing) return existing;
    throw new CommercialModelConflictError("Idempotent draft is incomplete");
  }
  const id = v7(); const commandId = v7(); const auditId = v7(); const now = Date.now();
  const insert = input.type === "product"
    ? database.prepare("INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) VALUES (?, ?, ?, ?, 1, ?, ?, 'draft')").bind(id, workspace.id, now, now, parent.id, name)
    : input.type === "market_play"
      ? database.prepare("INSERT INTO market_plays (id, workspace_id, created_at, updated_at, revision, product_id, name, lifecycle) VALUES (?, ?, ?, ?, 1, ?, ?, 'draft')").bind(id, workspace.id, now, now, parent.id, name)
      : database.prepare("INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) VALUES (?, ?, ?, ?, 1, ?, ?, 'draft', 'UTC', 0)").bind(id, workspace.id, now, now, parent.id, name);
  try {
    await database.batch([
      database.prepare(`INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'accepted' WHERE EXISTS (SELECT 1 FROM ${parent.table} WHERE id = ? AND workspace_id = ? AND revision = ?)`)
        .bind(commandId, workspace.id, now, now, `commercial.create_${input.type}`, input.idempotencyKey, digest, input.expectedRevision, parent.type, parent.id, parent.id, workspace.id, input.expectedRevision),
      insert,
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, ?, ?, ?, ?, ?)").bind(auditId, workspace.id, principal.subject, "commercial.draft_created", input.type, id, JSON.stringify({ commandId, digest }), now),
    ]);
  } catch (error) {
    if (isConstraint(error)) {
      const command = await commandForKey(database, workspace.id, input.idempotencyKey);
      const existing = command && await entityForCommand(database, workspace.id, command.id, input.type);
      if (existing) return existing;
      throw new CommercialModelConflictError("Draft creation conflicted");
    }
    throw error;
  }
  return { id, type: input.type, parentId: parent.id, name, lifecycle: "draft", revision: 1, ...(input.type === "customer_profile" ? { nurtureState: "nurture" as const } : {}) };
}

/** Transaction-only helper for recordInterviewDecision. It accepts only stored lineage IDs. */
export async function materializeOfferFromConfirmedHierarchyDecision(database: D1Database, principal: InterviewPrincipal, input: { profileId: string; questionId: string; answerId: string; proposalId: string; decisionId: string; knowledgeVersionId: string; authorityCommandId: string; auditEventId: string; name: string; value: unknown }): Promise<CommercialHierarchyNode> {
  const workspace = await requireWorkspace(database, principal);
  const lineage = await database.prepare(
    `SELECT p.id FROM customer_profiles p JOIN interview_questions q ON q.id = ? AND q.workspace_id = p.workspace_id
     JOIN interview_answers a ON a.id = ? AND a.question_id = q.id AND a.workspace_id = p.workspace_id
     JOIN proposal_decisions d ON d.id = ? AND d.proposal_id = ? AND d.authority_command_id = ? AND d.workspace_id = p.workspace_id AND d.decision IN ('accept','correct','rescope')
     JOIN knowledge_versions k ON k.id = ? AND k.decision_id = d.id AND k.workspace_id = p.workspace_id
     JOIN audit_events e ON e.id = ? AND e.workspace_id = p.workspace_id
     WHERE p.id = ? AND p.workspace_id = ? LIMIT 1`,
  ).bind(input.questionId, input.answerId, input.decisionId, input.proposalId, input.authorityCommandId, input.knowledgeVersionId, input.auditEventId, input.profileId, workspace.id).first<{ id: string }>();
  if (!lineage) throw new CommercialModelConflictError("Offer requires an exact confirmed hierarchy-interview decision lineage");
  const existing = await database.prepare("SELECT id, name, revision FROM offers WHERE workspace_id = ? AND authority_command_id = ? LIMIT 1").bind(workspace.id, input.authorityCommandId).first<Row>();
  if (existing) return node(existing, "offer", input.profileId, "draft");
  const id = v7(); const now = Date.now();
  await database.prepare("INSERT INTO offers (id, workspace_id, created_at, updated_at, revision, profile_id, name, value_json, question_id, answer_id, proposal_id, decision_id, knowledge_version_id, authority_command_id, audit_event_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, workspace.id, now, now, input.profileId, boundedName(input.name), JSON.stringify(input.value), input.questionId, input.answerId, input.proposalId, input.decisionId, input.knowledgeVersionId, input.authorityCommandId, input.auditEventId).run();
  return { id, type: "offer", parentId: input.profileId, name: boundedName(input.name), lifecycle: "draft", revision: 1 };
}

type Row = { id: string; name: string; revision: number; lifecycle?: string; status?: string; parent_id?: string | null };
function node(row: Row, type: HierarchyType, parentId: string | null, lifecycle = row.lifecycle ?? row.status ?? "draft"): CommercialHierarchyNode { return { id: row.id, type, parentId, name: row.name, lifecycle, revision: Number(row.revision) }; }
async function ensureCompany(database: D1Database, workspace: Workspace, now: number) { await database.prepare("INSERT INTO companies (id, workspace_id, created_at, updated_at, revision, name, status) SELECT ?, ?, ?, ?, 1, 'Digitalrain', 'active' WHERE NOT EXISTS (SELECT 1 FROM companies WHERE workspace_id = ?)").bind(v7(), workspace.id, now, now, workspace.id).run(); const row = await database.prepare("SELECT id FROM companies WHERE workspace_id = ? LIMIT 1").bind(workspace.id).first<{ id: string }>(); if (!row) throw new CommercialModelConflictError("Company initialization failed"); return row; }
async function ensureProduct(database: D1Database, workspaceId: string, companyId: string, name: string, now: number) { await database.prepare("INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) SELECT ?, ?, ?, ?, 1, ?, ?, 'draft' WHERE NOT EXISTS (SELECT 1 FROM products WHERE workspace_id = ? AND company_id = ? AND name = ?)").bind(v7(), workspaceId, now, now, companyId, name, workspaceId, companyId, name).run(); const row = await database.prepare("SELECT id FROM products WHERE workspace_id = ? AND company_id = ? AND name = ? LIMIT 1").bind(workspaceId, companyId, name).first<{ id: string }>(); if (!row) throw new CommercialModelConflictError("Product initialization failed"); return row; }
async function ensurePlay(database: D1Database, workspaceId: string, productId: string, name: string, now: number) { await database.prepare("INSERT INTO market_plays (id, workspace_id, created_at, updated_at, revision, product_id, name, lifecycle) SELECT ?, ?, ?, ?, 1, ?, ?, 'draft' WHERE NOT EXISTS (SELECT 1 FROM market_plays WHERE workspace_id = ? AND product_id = ? AND name = ?)").bind(v7(), workspaceId, now, now, productId, name, workspaceId, productId, name).run(); const row = await database.prepare("SELECT id FROM market_plays WHERE workspace_id = ? AND product_id = ? AND name = ? LIMIT 1").bind(workspaceId, productId, name).first<{ id: string }>(); if (!row) throw new CommercialModelConflictError("Play initialization failed"); return row; }
async function ensureProfile(database: D1Database, workspaceId: string, playId: string, name: string, now: number) { await database.prepare("INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) SELECT ?, ?, ?, ?, 1, ?, ?, 'draft', 'UTC', 0 WHERE NOT EXISTS (SELECT 1 FROM customer_profiles WHERE workspace_id = ? AND play_id = ? AND name = ?)").bind(v7(), workspaceId, now, now, playId, name, workspaceId, playId, name).run(); }
type Workspace = { id: string; company_name: string; revision: number };
async function findWorkspace(database: D1Database, principal: InterviewPrincipal) { return database.prepare("SELECT id, company_name, revision FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject, principal.legacySubject, principal.subject).first<Workspace>(); }
async function requireWorkspace(database: D1Database, principal: InterviewPrincipal) { const workspace = await findWorkspace(database, principal); if (!workspace) throw new CommercialModelConflictError("Workspace is not initialized"); return workspace; }
async function commandForKey(database: D1Database, workspaceId: string, key: string) { return database.prepare("SELECT id, operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1").bind(workspaceId, key).first<{ id: string; operation_digest: string }>(); }
async function parentForDraft(database: D1Database, workspaceId: string, type: DraftType, parentId: string) { const spec = type === "product" ? { table: "companies", parent: "company" } : type === "market_play" ? { table: "products", parent: "product" } : { table: "market_plays", parent: "market_play" }; const row = await database.prepare(`SELECT id, revision FROM ${spec.table} WHERE id = ? AND workspace_id = ? LIMIT 1`).bind(parentId, workspaceId).first<{ id: string; revision: number }>(); return row && { ...row, table: spec.table, type: spec.parent }; }
async function entityForCommand(database: D1Database, workspaceId: string, commandId: string, type: DraftType) { const row = await database.prepare("SELECT subject_id FROM audit_events WHERE workspace_id = ? AND action = 'commercial.draft_created' AND detail_json LIKE ? LIMIT 1").bind(workspaceId, `%${commandId}%`).first<{ subject_id: string }>(); if (!row) return null; const table = type === "product" ? "products" : type === "market_play" ? "market_plays" : "customer_profiles"; const entity = await database.prepare(`SELECT id, name, revision, ${type === "product" ? "company_id" : type === "market_play" ? "product_id" : "play_id"} AS parent_id FROM ${table} WHERE id = ? AND workspace_id = ? LIMIT 1`).bind(row.subject_id, workspaceId).first<Row>(); return entity ? { ...node(entity, type, entity.parent_id ?? null), ...(type === "customer_profile" ? { nurtureState: "nurture" as const } : {}) } : null; }
function validateKey(value: string) { if (!/^[a-f0-9-]{20,80}$/i.test(value)) throw new CommercialModelConflictError("Invalid idempotency key"); }
function boundedName(value: string) { const name = value.trim(); if (!name || name.length > 160) throw new CommercialModelConflictError("Invalid hierarchy name"); return name; }
function isConstraint(error: unknown) { return error instanceof Error && /unique|constraint/i.test(error.message); }
async function digestFor(value: unknown) { const raw = JSON.stringify(value); const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)); return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""); }
