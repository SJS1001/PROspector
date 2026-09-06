import {
  InterviewConflictError,
  readInterviewState,
  requireSelectedDraftInterview,
  type InterviewDestination,
  type InterviewPrincipal,
  type InterviewSelection,
  type InterviewState,
} from "./interview";
import { issueInterviewQuestion, validateInterviewQueueFence } from "./interview-question-authoring";

type ScopeType = InterviewDestination["scopeType"];

type HierarchyRow = {
  id: string;
  type: ScopeType;
  parentId: string | null;
  name: string;
  revision: number;
  createdAt: number;
};

type QueueSlot = {
  key: string;
  label: "Company" | "Product" | "Market Play" | "Customer Profile" | "Offer";
  scopeType: Exclude<ScopeType, "offer">;
  scopeId: string;
  locator: string;
  kind: string;
};

const PRODUCT_QUESTION_KINDS = [
  "capability", "limitation", "delivery", "proof", "ownership", "claim_guardrail",
  "source_policy", "discovery_policy", "default_runner_policy",
] as const;
const MARKET_PLAY_QUESTION_KINDS = [
  "market", "problem", "audience", "language", "evidence", "offer_context",
] as const;
const PROFILE_QUESTION_KINDS = [
  "fit", "disqualifier", "roles", "signals", "timezone", "rubric", "proof_policy",
  "contact_policy", "outreach_policy", "schedule", "output_target",
] as const;

type CurrentKnowledge = {
  itemId: string;
  itemRevision: number;
  versionId: string;
  versionRevision: number;
  scopeType: string;
  scopeId: string;
  kind: string;
  digest: string;
};

type ReviewedSlot = {
  proposalId: string;
  decisionId: string;
  decision: string;
  operationDigest: string;
  scopeType: string;
  scopeId: string;
  kind: string;
  answerId: string;
  questionId: string;
  confirmationId: string;
};

type SessionRow = {
  id: string;
  revision: number;
  scope_type: string;
  scope_id: string;
  state: "open" | "completed";
};

export type LocalInterviewProgression = {
  mode: "local_demo";
  status: "ready" | "complete";
  queueDigest: string;
  completedSlots: number;
  totalSlots: number;
  next: null | {
    label: QueueSlot["label"];
    destination: { scopeType: QueueSlot["scopeType"]; id: string; locator: string };
    knowledgeKind: string;
    requiresOwnerInput: true;
    recommendation: null;
  };
};

type InternalProgression = {
  projection: LocalInterviewProgression;
  workspaceId: string;
  workspaceRevision: number;
  session: SessionRow;
  currentDestination: { scopeType: ScopeType; id: string };
  nextSlot: QueueSlot | null;
  prerequisites: Array<{ id: string; digest: string }>;
  queueFence: InterviewQueueFence;
};

export type InterviewQueueFence = {
  workspaceRevision: number;
  session: {
    id: string;
    revision: number;
    state: "open" | "completed";
    activeQuestionId: null;
    scopeType: ScopeType;
    scopeId: string;
  };
  hierarchy: HierarchyRow[];
  currentKnowledge: CurrentKnowledge[];
  reviewedSlots: ReviewedSlot[];
};

export async function readLocalInterviewProgression(
  database: D1Database,
  principal: InterviewPrincipal,
  selection?: InterviewSelection,
): Promise<LocalInterviewProgression> {
  return (await compose(database, principal, selection)).projection;
}

export async function attachLocalInterviewProgression(
  database: D1Database,
  principal: InterviewPrincipal,
  state: InterviewState,
  selection?: InterviewSelection,
): Promise<InterviewState> {
  if (state.status !== "confirmed" && state.status !== "ready") return state;
  return { ...state, localProgression: await readLocalInterviewProgression(database, principal, selection) };
}

export async function advanceLocalInterview(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { idempotencyKey: string; expectedQueueDigest: string },
  selection?: InterviewSelection,
): Promise<InterviewState> {
  exactKeys(input, ["expectedQueueDigest", "idempotencyKey"]);
  if (!/^[a-f0-9-]{20,80}$/i.test(input.idempotencyKey)) throw conflict("Invalid idempotency key");
  if (!/^[a-f0-9]{64}$/.test(input.expectedQueueDigest)) throw conflict("Invalid interview queue digest");

  const workspace = await ownedWorkspace(database, principal);
  const authorityOperationDigest = await sha256(stableJson({
    action: "advance_local_interview",
    workspaceId: workspace.id,
    idempotencyKey: input.idempotencyKey,
    expectedQueueDigest: input.expectedQueueDigest,
    selection: selection ?? null,
  }));
  const prior = await database.prepare(
    `SELECT subject_id AS subjectId, operation_digest AS operationDigest
     FROM authority_commands
     WHERE workspace_id = ? AND idempotency_key = ? AND command_type = 'interview.question.issue'
     LIMIT 1`,
  ).bind(workspace.id, input.idempotencyKey).first<{ subjectId: string; operationDigest: string }>();
  if (prior) {
    if (prior.operationDigest !== authorityOperationDigest)
      throw conflict("Idempotency key was used for another interview advance");
    const issued = await database.prepare(
      "SELECT id FROM interview_questions WHERE id = ? AND workspace_id = ? LIMIT 1",
    ).bind(prior.subjectId, workspace.id).first<{ id: string }>();
    if (!issued) throw conflict("Prior interview advance is incomplete");
    return attachLocalInterviewProgression(database, principal, await readInterviewState(database, principal, selection), selection);
  }

  const current = await compose(database, principal, selection);
  if (current.projection.queueDigest !== input.expectedQueueDigest)
    throw conflict("The interview queue changed; reload before continuing");
  if (!current.nextSlot) return attachLocalInterviewProgression(database, principal, await readInterviewState(database, principal, selection), selection);

  const slot = current.nextSlot;
  await issueInterviewQuestion(database, principal, {
    sessionId: current.session.id,
    expectedSessionRevision: current.session.revision,
    idempotencyKey: input.idempotencyKey,
    authorityOperationDigest,
    queueFence: current.queueFence,
    transitionFrom: current.currentDestination,
    candidate: {
      schema: "consensus-interview-question/v1",
      prompt: promptFor(slot),
      evidenceFindings: [],
      inference: {
        label: "Inference",
        value: `${slot.label} information for “${slot.locator}” has not been confirmed by the owner.`,
      },
      recommendation: null,
      requiresOwnerInput: true,
      destination: { scopeType: slot.scopeType, id: slot.scopeId },
      prerequisiteKnowledge: current.prerequisites,
      knowledgeKind: slot.kind,
    },
  });
  return readInterviewState(database, principal, selection);
}

async function compose(database: D1Database, principal: InterviewPrincipal, selection?: InterviewSelection): Promise<InternalProgression> {
  const workspace = await database.prepare(
    `SELECT id, revision FROM workspaces WHERE owner_subject IN (?, ?)
     ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string; revision: number }>();
  if (!workspace) throw conflict("Workspace is not initialized");
  if (selection) await requireSelectedDraftInterview(database, workspace.id, selection);

  const [hierarchy, currentKnowledge, reviewed, session] = await Promise.all([
    readHierarchy(database, workspace.id),
    readCurrentKnowledge(database, workspace.id),
    readReviewedSlots(database, workspace.id),
    database.prepare(
      `SELECT id, revision, scope_type, scope_id, state FROM interview_sessions
       WHERE workspace_id = ? AND state IN ('open', 'completed') AND active_question_id IS NULL
       ${selection ? "AND id = ? AND scope_id = ? AND scope_type IN ('market_play','play')" : ""}
       ORDER BY CASE state WHEN 'open' THEN 0 ELSE 1 END, updated_at DESC, id DESC LIMIT 1`,
    ).bind(workspace.id, ...(selection ? [selection.sessionId, selection.marketPlayId] : [])).first<SessionRow>(),
  ]);
  if (!session) throw conflict("Finish the current question before continuing the interview");

  const slots = queueFor(hierarchy, selection?.marketPlayId);
  const confirmedKeys = new Set(currentKnowledge.map((row) => slotKey(row.scopeType, row.scopeId, row.kind)));
  const reviewedKeys = new Set(reviewed.map((row) => slotKey(row.scopeType, row.scopeId, row.kind)));
  const completed = slots.filter((slot) => confirmedKeys.has(slot.key) || reviewedKeys.has(slot.key));
  const nextSlot = slots.find((slot) => !confirmedKeys.has(slot.key) && !reviewedKeys.has(slot.key)) ?? null;
  const causalScopeIds = new Set(nextSlot ? causalScopeIdsFor(nextSlot, hierarchy) : []);
  const prerequisites = currentKnowledge
    .filter((row) => causalScopeIds.has(row.scopeId))
    .map((row) => ({ id: row.versionId, digest: row.digest }))
    .sort((left, right) => `${left.id}:${left.digest}`.localeCompare(`${right.id}:${right.digest}`));
  if (prerequisites.length > 29) throw conflict("The interview has too many current prerequisites for one safe command");

  const currentDestination = await normalizeSessionDestination(database, workspace.id, session);
  const digestModel = {
    schema: "local-interview-queue/v1",
    workspace: { id: workspace.id, revision: Number(workspace.revision) },
    hierarchy: hierarchy.map(({ id, type, parentId, revision, createdAt }) => ({ id, type, parentId, revision, createdAt })),
    currentKnowledge,
    reviewedSlots: reviewed,
    session: { id: session.id, revision: Number(session.revision), state: session.state, destination: currentDestination },
    nextSlot,
    prerequisites,
  };
  const queueDigest = await sha256(stableJson(digestModel));
  const queueFence: InterviewQueueFence = {
    workspaceRevision: Number(workspace.revision),
    session: {
      id: session.id,
      revision: Number(session.revision),
      state: session.state,
      activeQuestionId: null,
      scopeType: currentDestination.scopeType,
      scopeId: currentDestination.id,
    },
    hierarchy,
    currentKnowledge,
    reviewedSlots: reviewed,
  };
  validateInterviewQueueFence(queueFence);
  return {
    projection: {
      mode: "local_demo",
      status: nextSlot ? "ready" : "complete",
      queueDigest,
      completedSlots: completed.length,
      totalSlots: slots.length,
      next: nextSlot ? {
        label: nextSlot.label,
        destination: { scopeType: nextSlot.scopeType, id: nextSlot.scopeId, locator: nextSlot.locator },
        knowledgeKind: nextSlot.kind,
        requiresOwnerInput: true,
        recommendation: null,
      } : null,
    },
    workspaceId: workspace.id,
    workspaceRevision: Number(workspace.revision),
    session,
    currentDestination,
    nextSlot,
    prerequisites,
    queueFence,
  };
}

async function readHierarchy(database: D1Database, workspaceId: string): Promise<HierarchyRow[]> {
  const companyRows = await database.prepare(
    "SELECT id, name, revision, created_at AS createdAt FROM companies WHERE workspace_id = ? ORDER BY created_at, id",
  ).bind(workspaceId).all<Omit<HierarchyRow, "type" | "parentId">>();
  if (companyRows.results.length !== 1) throw conflict("The Company hierarchy is unavailable or ambiguous");
  const company = companyRows.results[0];
  const [products, plays, profiles] = await Promise.all([
    database.prepare("SELECT id, company_id AS parentId, name, revision, created_at AS createdAt FROM products WHERE workspace_id = ? ORDER BY created_at, id").bind(workspaceId).all<Omit<HierarchyRow, "type">>(),
    database.prepare("SELECT id, product_id AS parentId, name, revision, created_at AS createdAt FROM market_plays WHERE workspace_id = ? ORDER BY created_at, id").bind(workspaceId).all<Omit<HierarchyRow, "type">>(),
    database.prepare("SELECT id, play_id AS parentId, name, revision, created_at AS createdAt FROM customer_profiles WHERE workspace_id = ? ORDER BY created_at, id").bind(workspaceId).all<Omit<HierarchyRow, "type">>(),
  ]);
  if (products.results.some((row) => row.parentId !== company.id)) throw conflict("The Product hierarchy contains an invalid parent");
  const productIds = new Set(products.results.map((row) => row.id));
  if (plays.results.some((row) => !productIds.has(row.parentId ?? ""))) throw conflict("The Market Play hierarchy contains an invalid parent");
  const playIds = new Set(plays.results.map((row) => row.id));
  if (profiles.results.some((row) => !playIds.has(row.parentId ?? ""))) throw conflict("The Customer Profile hierarchy contains an invalid parent");
  const hierarchy = [
    { ...company, type: "company", parentId: null },
    ...products.results.map((row) => ({ ...row, type: "product" as const })),
    ...plays.results.map((row) => ({ ...row, type: "market_play" as const })),
    ...profiles.results.map((row) => ({ ...row, type: "customer_profile" as const })),
  ];
  if (new Set(hierarchy.map((row) => row.id)).size !== hierarchy.length) throw conflict("The commercial hierarchy contains duplicate identifiers");
  return hierarchy;
}

function queueFor(hierarchy: HierarchyRow[], selectedMarketPlayId?: string): QueueSlot[] {
  const byType = (type: ScopeType) => hierarchy.filter((row) => row.type === type);
  const slots: QueueSlot[] = [];
  if (!selectedMarketPlayId) for (const row of byType("company")) slots.push(slot("Company", row, "identity"));
  for (const product of byType("product")) {
    if (selectedMarketPlayId && !byType("market_play").some((play) => play.id === selectedMarketPlayId && play.parentId === product.id)) continue;
    if (!selectedMarketPlayId) for (const kind of PRODUCT_QUESTION_KINDS) slots.push(slot("Product", product, kind));
    for (const play of byType("market_play").filter((row) => row.parentId === product.id)) {
      if (selectedMarketPlayId && play.id !== selectedMarketPlayId) continue;
      for (const kind of MARKET_PLAY_QUESTION_KINDS) slots.push(slot("Market Play", play, kind));
      for (const profile of byType("customer_profile").filter((row) => row.parentId === play.id)) {
        for (const kind of PROFILE_QUESTION_KINDS) slots.push(slot("Customer Profile", profile, kind));
        slots.push(slot("Offer", profile, "hierarchy_completion_offer"));
      }
    }
  }
  if (selectedMarketPlayId && !slots.length) throw conflict("The selected Draft Market Play is outside the interview hierarchy");
  return slots;
}

function causalScopeIdsFor(slot: QueueSlot, hierarchy: HierarchyRow[]) {
  const byId = new Map(hierarchy.map((row) => [row.id, row]));
  const ids: string[] = [];
  let current = byId.get(slot.scopeId);
  while (current) {
    ids.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return ids;
}

function slot(label: QueueSlot["label"], row: HierarchyRow, kind: string): QueueSlot {
  return { key: slotKey(row.type, row.id, kind), label, scopeType: row.type as QueueSlot["scopeType"], scopeId: row.id, locator: row.name, kind };
}

async function readCurrentKnowledge(database: D1Database, workspaceId: string): Promise<CurrentKnowledge[]> {
  const rows = await database.prepare(
    `SELECT ki.id AS itemId, ki.revision AS itemRevision, kv.id AS versionId,
            kv.revision AS versionRevision, kv.scope_type AS scopeType, kv.scope_id AS scopeId,
            kv.kind, COALESCE(kv.value_digest, kv.source_digest) AS digest
     FROM knowledge_items ki JOIN knowledge_versions kv
       ON kv.id = ki.current_version_id AND kv.workspace_id = ki.workspace_id
     WHERE ki.workspace_id = ? AND kv.status = 'confirmed'
     ORDER BY kv.scope_type, kv.scope_id, kv.kind, ki.slot, kv.id`,
  ).bind(workspaceId).all<CurrentKnowledge>();
  return rows.results.map((row) => ({ ...row, itemRevision: Number(row.itemRevision), versionRevision: Number(row.versionRevision) }));
}

async function readReviewedSlots(database: D1Database, workspaceId: string): Promise<ReviewedSlot[]> {
  const rows = await database.prepare(
    `SELECT kp.id AS proposalId, pd.id AS decisionId, pd.decision, pd.operation_digest AS operationDigest,
            kp.destination_scope_type AS scopeType, kp.destination_scope_id AS scopeId, kp.kind,
            ans.id AS answerId, q.id AS questionId, c.id AS confirmationId
     FROM proposal_decisions pd
     JOIN knowledge_proposals kp ON kp.id = pd.proposal_id AND kp.workspace_id = pd.workspace_id
     JOIN interview_answers ans ON ans.id = pd.answer_id AND ans.workspace_id = pd.workspace_id
       AND json_extract(ans.proposal_json, '$.knowledgeProposalId') = kp.id
     JOIN interview_questions q ON q.id = ans.question_id AND q.workspace_id = ans.workspace_id
       AND q.session_id = ans.session_id
     JOIN interview_confirmations c ON c.answer_id = ans.id AND c.workspace_id = ans.workspace_id
       AND c.question_id = q.id AND c.session_id = ans.session_id AND c.decision = pd.decision
     WHERE pd.workspace_id = ? AND pd.decision <> 'rescope'
       AND pd.reviewed_snapshot_digest = kp.proposal_digest
     ORDER BY kp.destination_scope_type, kp.destination_scope_id, kp.kind, pd.created_at, pd.id`,
  ).bind(workspaceId).all<ReviewedSlot>();
  return rows.results;
}

async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await database.prepare(
    `SELECT id FROM workspaces WHERE owner_subject IN (?, ?)
     ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string }>();
  if (!workspace) throw conflict("Workspace is not initialized");
  return workspace;
}

async function normalizeSessionDestination(database: D1Database, workspaceId: string, session: SessionRow) {
  const scopeType = session.scope_type === "play" ? "market_play" : session.scope_type === "profile" ? "customer_profile" : session.scope_type;
  if (!["company", "product", "market_play", "customer_profile", "offer"].includes(scopeType)) throw conflict("Interview session destination is invalid");
  if (scopeType === "company" && session.scope_id === workspaceId) {
    const company = await database.prepare("SELECT id FROM companies WHERE workspace_id = ? ORDER BY created_at, id LIMIT 2").bind(workspaceId).all<{ id: string }>();
    if (company.results.length !== 1) throw conflict("Interview Company destination is ambiguous");
    return { scopeType: "company" as const, id: company.results[0].id };
  }
  return { scopeType: scopeType as ScopeType, id: session.scope_id };
}

function promptFor(slot: QueueSlot) {
  if (slot.label === "Offer") return `What offer should be made to the “${slot.locator}” Customer Profile?`;
  return `What should PROspector know about ${humanize(slot.kind)} for the ${slot.label} “${slot.locator}”?`;
}

function humanize(value: string) { return value.replaceAll("_", " "); }

function slotKey(scopeType: string, scopeId: string, kind: string) {
  const normalized = scopeType === "play" ? "market_play" : scopeType === "profile" ? "customer_profile" : scopeType;
  return `${normalized}\u001f${scopeId}\u001f${kind}`;
}

function exactKeys(value: unknown, expected: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || stableJson(Object.keys(value).sort()) !== stableJson([...expected].sort())) throw conflict("Invalid local interview command");
}

function conflict(message: string) { return new InterviewConflictError(message); }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
