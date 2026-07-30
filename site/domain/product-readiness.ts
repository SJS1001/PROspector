import { v7 } from "uuid";

import type { InterviewPrincipal } from "./interview";

export const PRODUCT_READINESS_CATEGORIES = [
  "capability",
  "limitation",
  "delivery",
  "proof",
  "ownership",
  "claim_guardrail",
  "source_policy",
  "discovery_policy",
  "default_runner_policy",
] as const;

type ReadinessCategory = (typeof PRODUCT_READINESS_CATEGORIES)[number];
type VersionReference = { id: string; digest: string };
type KnowledgeAuthority = VersionReference & {
  category: string;
  scopeType: string;
  scopeId: string;
  status: string;
  authority: string;
  value?: unknown;
};
type ProductRow = { id: string; company_id: string | null; name: string; lifecycle: string; revision: number };
type Workspace = { id: string; companyId: string };

export class ProductReadinessConflictError extends Error {
  readonly code = "product_readiness_conflict";
}

export function evaluateProductReadiness(input: {
  product: { id: string };
  knowledge: KnowledgeAuthority[];
  clientFlags?: unknown;
}) {
  const byCategory = new Map<ReadinessCategory, KnowledgeAuthority[]>();
  for (const category of PRODUCT_READINESS_CATEGORIES) byCategory.set(category, []);
  for (const item of input.knowledge ?? []) {
    if (!PRODUCT_READINESS_CATEGORIES.includes(item.category as ReadinessCategory)) continue;
    if (
      item.authority !== "confirmed_knowledge_version" ||
      item.status !== "confirmed" ||
      item.scopeType !== "product" ||
      item.scopeId !== input.product.id ||
      !validDigest(item.digest) ||
      !item.id
    ) continue;
    byCategory.get(item.category as ReadinessCategory)?.push(item);
  }
  const items = PRODUCT_READINESS_CATEGORIES.map((category) => {
    const candidates = byCategory.get(category) ?? [];
    return {
      category,
      status: candidates.length === 1 ? "confirmed" as const : "missing" as const,
    };
  });
  const missingCategories = items.filter((item) => item.status === "missing").map((item) => item.category);
  const confirmedVersions = missingCategories.length === 0
    ? PRODUCT_READINESS_CATEGORIES.flatMap((category) => byCategory.get(category) ?? [])
      .map(({ id, digest, category }) => ({ id, digest, category }))
      .sort((left, right) => left.id.localeCompare(right.id))
    : [];
  return { complete: missingCategories.length === 0, items, missingCategories, confirmedVersions };
}

export async function readProductReadiness(
  database: D1Database,
  principal: InterviewPrincipal,
  productId: string,
) {
  const workspace = await ownedWorkspace(database, principal);
  const product = await ownedProduct(database, workspace.id, productId);
  const knowledge = await confirmedKnowledge(database, workspace.id, product.id);
  const readiness = evaluateProductReadiness({ product, knowledge });
  const base = {
    product: productProjection(product),
    checklist: readiness.items,
    missingCategories: readiness.missingCategories,
    confirmedVersions: readiness.confirmedVersions,
  };
  if (product.lifecycle !== "ready") return { status: "incomplete" as const, ...base };

  const configuration = await database.prepare(
    "SELECT id, digest, revision, manifest_json, active FROM typed_configurations WHERE workspace_id = ? AND owner_type = 'product' AND owner_id = ? AND kind = 'product_discovery' AND active = 1 LIMIT 1",
  ).bind(workspace.id, product.id).first<{ id: string; digest: string; revision: number; manifest_json: string; active: number }>();
  if (!configuration || !validDigest(configuration.digest)) {
    throw new ProductReadinessConflictError("Ready Product configuration authority is unavailable");
  }
  const initialRun = await database.prepare(
    "SELECT id, revision, configuration_id, configuration_digest, trigger_key, execution_state FROM product_discovery_runs WHERE workspace_id = ? AND product_id = ? AND trigger_kind = 'initial' ORDER BY created_at, id LIMIT 1",
  ).bind(workspace.id, product.id).first<{ id: string; revision: number; configuration_id: string; configuration_digest: string; trigger_key: string; execution_state: string }>();
  const schedule = await database.prepare(
    "SELECT id, revision, cadence, execution_state, next_run_at FROM product_discovery_schedules WHERE workspace_id = ? AND product_id = ? AND cadence = 'monthly' AND active = 1 LIMIT 1",
  ).bind(workspace.id, product.id).first<{ id: string; revision: number; cadence: string; execution_state: string; next_run_at: number }>();
  if (!initialRun || !schedule) throw new ProductReadinessConflictError("Ready Product discovery intent is unavailable");
  const descendants = await descendantCounts(database, workspace.id, product.id);
  return {
    status: "ready" as const,
    ...base,
    configuration: {
      id: configuration.id,
      digest: configuration.digest,
      revision: Number(configuration.revision),
      manifest: parseObject(configuration.manifest_json, "Product configuration manifest"),
      active: Number(configuration.active) === 1,
      immutable: true,
    },
    initialRun: {
      id: initialRun.id,
      revision: Number(initialRun.revision),
      configurationId: initialRun.configuration_id,
      configurationDigest: initialRun.configuration_digest,
      triggerKey: initialRun.trigger_key,
      executionState: initialRun.execution_state,
    },
    manualDiscovery: { available: true, executionState: "blocked_missing_capability" as const },
    monthlySchedule: {
      id: schedule.id,
      revision: Number(schedule.revision),
      cadence: schedule.cadence,
      executionState: schedule.execution_state,
      nextRunAt: Number(schedule.next_run_at),
    },
    descendants,
  };
}

export async function makeProductReady(
  database: D1Database,
  principal: InterviewPrincipal,
  input: {
    productId: string;
    expectedProductRevision: number;
    confirmedVersions: VersionReference[];
    idempotencyKey: string;
    [key: string]: unknown;
  },
) {
  validateKey(input.idempotencyKey);
  validateRevision(input.expectedProductRevision);
  const workspace = await ownedWorkspace(database, principal);
  const product = await ownedProduct(database, workspace.id, input.productId);
  const suppliedVersions = exactReferences(input.confirmedVersions);
  const operationDigest = await sha256(stable({
    action: "product.ready",
    productId: product.id,
    expectedProductRevision: input.expectedProductRevision,
    confirmedVersions: suppliedVersions,
  }));
  const prior = await commandForKey(database, workspace.id, input.idempotencyKey);
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw new ProductReadinessConflictError("Idempotency key was used for another operation");
    return readProductReadiness(database, principal, product.id);
  }
  if (product.revision !== input.expectedProductRevision) throw new ProductReadinessConflictError("Stale Product revision; reload readiness");
  if (product.lifecycle === "paused" || product.lifecycle === "archived") throw new ProductReadinessConflictError(`Product is ${product.lifecycle}`);
  if (product.lifecycle !== "draft") throw new ProductReadinessConflictError("Product Ready operation already has an authoritative winner");

  const knowledge = await confirmedKnowledge(database, workspace.id, product.id);
  const readiness = evaluateProductReadiness({ product, knowledge });
  if (!readiness.complete) throw new ProductReadinessConflictError("Complete confirmed Product authority is required");
  const authoritative = readiness.confirmedVersions.map(({ id, digest }) => ({ id, digest }));
  if (stable(suppliedVersions) !== stable(authoritative)) {
    throw new ProductReadinessConflictError("Exact confirmed Version IDs and digests are required");
  }

  const policySnapshot = buildPolicySnapshot(knowledge);
  const manifest = {
    schema: "product-discovery-configuration/v1",
    productId: product.id,
    confirmedVersions: suppliedVersions,
    policySnapshot,
  };
  const manifestJson = stable(manifest);
  const configurationDigest = await sha256(manifestJson);
  const policyJson = stable(policySnapshot);
  const policyDigest = await sha256(policyJson);
  const now = Date.now();
  const configurationId = v7();
  const runId = v7();
  const scheduleId = v7();
  const commandId = v7();
  const triggerKey = `initial:product:${product.id}:${configurationId}`;
  const scheduleKey = `monthly:product:${product.id}:${configurationId}`;
  const runOperationDigest = await sha256(stable({ action: "product.discovery.initial", triggerKey, configurationDigest }));
  const scheduleOperationDigest = await sha256(stable({ action: "product.discovery.monthly", scheduleKey, configurationDigest }));
  const nextRunAt = nextMonthlyIntent(now);
  const statements: D1PreparedStatement[] = [
    database.prepare(
      "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) SELECT ?, ?, ?, ?, 1, 'product.ready', ?, ?, ?, 'product', ?, 'accepted' WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND workspace_id = ? AND lifecycle = 'draft' AND revision = ?)",
    ).bind(commandId, workspace.id, now, now, input.idempotencyKey, operationDigest, input.expectedProductRevision, product.id, product.id, workspace.id, input.expectedProductRevision),
    database.prepare(
      "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) SELECT ?, ?, ?, ?, 1, ?, 'product', ?, 'product_discovery', ?, ?, 1 WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)",
    ).bind(configurationId, workspace.id, now, now, product.company_id, product.id, configurationDigest, manifestJson, commandId, workspace.id),
    ...readiness.confirmedVersions.map((version, ordinal) => database.prepare(
      "INSERT INTO product_discovery_configuration_prerequisites (id, workspace_id, product_id, configuration_id, knowledge_version_id, knowledge_version_digest, category, ordinal, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)",
    ).bind(v7(), workspace.id, product.id, configurationId, version.id, version.digest, version.category, ordinal, now, commandId, workspace.id)),
    ...readiness.confirmedVersions.map((version) => database.prepare(
      "INSERT INTO configuration_knowledge_dependencies (configuration_id, knowledge_version_id, created_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)",
    ).bind(configurationId, version.id, now, commandId, workspace.id)),
    database.prepare(
      "INSERT INTO product_discovery_runs (id, workspace_id, created_at, updated_at, revision, product_id, configuration_id, configuration_digest, trigger_kind, trigger_key, source_event_id, started_at, window_lower_exclusive, window_upper_inclusive, last_successful_watermark, successful_watermark, manifest_json, manifest_digest, policy_snapshot_json, policy_snapshot_digest, execution_state, operation_digest, idempotency_key, completed_at) SELECT ?, ?, ?, ?, 1, ?, ?, ?, 'initial', ?, NULL, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, 'blocked_missing_capability', ?, ?, NULL WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)",
    ).bind(runId, workspace.id, now, now, product.id, configurationId, configurationDigest, triggerKey, now, now, manifestJson, configurationDigest, policyJson, policyDigest, runOperationDigest, `${input.idempotencyKey}:initial`, commandId, workspace.id),
    database.prepare(
      "INSERT INTO product_discovery_schedules (id, workspace_id, created_at, updated_at, revision, product_id, configuration_id, configuration_digest, cadence, schedule_key, timezone, next_run_at, last_successful_watermark, execution_state, active, operation_digest, idempotency_key) SELECT ?, ?, ?, ?, 1, ?, ?, ?, 'monthly', ?, 'UTC', ?, NULL, 'blocked_missing_capability', 1, ?, ? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)",
    ).bind(scheduleId, workspace.id, now, now, product.id, configurationId, configurationDigest, scheduleKey, nextRunAt, scheduleOperationDigest, `${input.idempotencyKey}:monthly`, commandId, workspace.id),
    database.prepare(
      "INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) SELECT ?, ?, 'owner', ?, 'product.ready', 'product', ?, ?, ? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)",
    ).bind(v7(), workspace.id, principal.subject, product.id, stable({ commandId, configurationId, configurationDigest, initialRunId: runId, monthlyScheduleId: scheduleId }), now, commandId, workspace.id),
    database.prepare(
      "UPDATE products SET lifecycle = 'ready', updated_at = ?, revision = revision + 1 WHERE id = ? AND workspace_id = ? AND lifecycle = 'draft' AND revision = ? AND EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)",
    ).bind(now, product.id, workspace.id, input.expectedProductRevision, commandId, workspace.id),
  ];
  try {
    await database.batch(statements);
  } catch (error) {
    if (isConstraint(error)) throw new ProductReadinessConflictError("Another Product Ready operation won; reload readiness");
    throw new ProductReadinessConflictError(`Product Ready failed atomically: ${errorMessage(error)}`);
  }
  const accepted = await commandForKey(database, workspace.id, input.idempotencyKey);
  if (!accepted) throw new ProductReadinessConflictError("Product Ready conflict; no partial authority was accepted");
  return readProductReadiness(database, principal, product.id);
}

export async function markInitialDiscoveryNeedsAttention(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { runId: string; expectedRunRevision: number; outcome: string; reason: string; idempotencyKey: string },
) {
  validateKey(input.idempotencyKey);
  validateRevision(input.expectedRunRevision);
  if (input.outcome !== "exhausted" || !input.reason?.trim()) throw new ProductReadinessConflictError("Exhausted discovery outcome and reason are required");
  const workspace = await ownedWorkspace(database, principal);
  const run = await database.prepare(
    "SELECT r.id, r.revision, r.product_id, r.execution_state, p.lifecycle FROM product_discovery_runs r JOIN products p ON p.id = r.product_id AND p.workspace_id = r.workspace_id WHERE r.id = ? AND r.workspace_id = ? AND r.trigger_kind = 'initial' LIMIT 1",
  ).bind(input.runId, workspace.id).first<{ id: string; revision: number; product_id: string; execution_state: string; lifecycle: string }>();
  if (!run) throw new ProductReadinessConflictError("Initial discovery run is unavailable");
  const operationDigest = await sha256(stable({ action: "product.discovery.needs_attention", runId: run.id, expectedRunRevision: input.expectedRunRevision, outcome: input.outcome, reason: input.reason }));
  const prior = await commandForKey(database, workspace.id, input.idempotencyKey);
  if (prior) {
    if (prior.operation_digest !== operationDigest) throw new ProductReadinessConflictError("Idempotency key was used for another operation");
    return readNeedsAttention(database, workspace.id, run.id);
  }
  if (run.lifecycle !== "ready") throw new ProductReadinessConflictError(`Product is ${run.lifecycle}`);
  if (run.revision !== input.expectedRunRevision) throw new ProductReadinessConflictError("Stale initial run revision");
  if (run.execution_state !== "blocked_missing_capability") throw new ProductReadinessConflictError("Initial discovery run outcome is no longer eligible");
  const now = Date.now();
  const commandId = v7();
  const eventJson = stable({ outcome: input.outcome, reason: input.reason, retainedProductLifecycle: "ready" });
  const eventDigest = await sha256(eventJson);
  try {
    await database.batch([
      database.prepare("INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) SELECT ?, ?, ?, ?, 1, 'product.discovery.needs_attention', ?, ?, ?, 'product_discovery_run', ?, 'accepted' WHERE EXISTS (SELECT 1 FROM product_discovery_runs r JOIN products p ON p.id = r.product_id AND p.workspace_id = r.workspace_id WHERE r.id = ? AND r.workspace_id = ? AND r.trigger_kind = 'initial' AND r.revision = ? AND r.execution_state = 'blocked_missing_capability' AND p.lifecycle = 'ready')").bind(commandId, workspace.id, now, now, input.idempotencyKey, operationDigest, input.expectedRunRevision, run.id, run.id, workspace.id, input.expectedRunRevision),
      database.prepare("UPDATE product_discovery_runs SET execution_state = 'needs_attention', updated_at = ?, revision = revision + 1, completed_at = ? WHERE id = ? AND workspace_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)").bind(now, now, run.id, workspace.id, input.expectedRunRevision, commandId, workspace.id),
      database.prepare("INSERT INTO product_discovery_run_events (id, workspace_id, run_id, event_type, event_json, event_digest, operation_digest, created_at) SELECT ?, ?, ?, 'needs_attention', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)").bind(v7(), workspace.id, run.id, eventJson, eventDigest, operationDigest, now, commandId, workspace.id),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) SELECT ?, ?, 'owner', ?, 'product.discovery_needs_attention', 'product_discovery_run', ?, ?, ? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id = ? AND workspace_id = ?)").bind(v7(), workspace.id, principal.subject, run.id, eventJson, now, commandId, workspace.id),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw new ProductReadinessConflictError(`Needs-attention transition failed atomically: ${errorMessage(error)}`);
    const accepted = await commandForKey(database, workspace.id, input.idempotencyKey);
    if (!accepted || accepted.operation_digest !== operationDigest) throw new ProductReadinessConflictError("Needs-attention transition conflicted; reload the run");
  }
  return readNeedsAttention(database, workspace.id, run.id);
}

export async function consumeProductReplacementActivation(
  database: D1Database,
  principal: InterviewPrincipal,
  input: { activationId?: string; proposalId?: string; expectedProductRevision: number; idempotencyKey: string },
) {
  validateKey(input.idempotencyKey);
  validateRevision(input.expectedProductRevision);
  if (!input.activationId) throw new ProductReadinessConflictError("Confirmed replacement activation is required");
  const workspace = await ownedWorkspace(database, principal);
  const activation = await database.prepare(
    `SELECT a.id, a.previous_configuration_id, a.next_configuration_id,
      rc.owner_id AS product_id, rc.status AS replacement_status,
      p.lifecycle, p.revision AS product_revision,
      next.digest AS next_digest, next.manifest_json AS next_manifest, next.active AS next_active
     FROM configuration_activations a
     JOIN replacement_candidates rc ON rc.id = a.replacement_candidate_id AND rc.workspace_id = a.workspace_id
     JOIN products p ON p.id = rc.owner_id AND p.workspace_id = a.workspace_id
     JOIN typed_configurations next ON next.id = a.next_configuration_id AND next.workspace_id = a.workspace_id
     WHERE a.id = ? AND a.workspace_id = ? AND rc.owner_type = 'product' AND next.kind = 'product_discovery' LIMIT 1`,
  ).bind(input.activationId, workspace.id).first<{
    id: string; previous_configuration_id: string; next_configuration_id: string; product_id: string;
    replacement_status: string; lifecycle: string; product_revision: number; next_digest: string; next_manifest: string; next_active: number;
  }>();
  if (!activation || activation.replacement_status !== "activated") throw new ProductReadinessConflictError("Confirmed Product replacement activation is unavailable");
  if (activation.lifecycle === "paused" || activation.lifecycle === "archived") throw new ProductReadinessConflictError(`Product is ${activation.lifecycle}`);
  if (activation.lifecycle !== "ready") throw new ProductReadinessConflictError("Product is not Ready");
  if (Number(activation.product_revision) !== input.expectedProductRevision) throw new ProductReadinessConflictError("Stale Product revision for replacement activation");
  if (Number(activation.next_active) !== 1 || !validDigest(activation.next_digest)) throw new ProductReadinessConflictError("Activated replacement configuration authority is unavailable");
  const priorLineage = await readConfigurationLineage(database, workspace.id, activation.id);
  if (priorLineage) return priorLineage;

  const manifest = parseObject(activation.next_manifest, "Replacement configuration manifest");
  const policySnapshot = (manifest.policySnapshot && typeof manifest.policySnapshot === "object") ? manifest.policySnapshot : {};
  const manifestJson = stable(manifest);
  const policyJson = stable(policySnapshot);
  const policyDigest = await sha256(policyJson);
  const triggerKey = `material-change:product:${activation.product_id}:${activation.next_configuration_id}`;
  const operationDigest = await sha256(stable({
    action: "product.discovery.material_change",
    activationId: activation.id,
    productId: activation.product_id,
    expectedProductRevision: input.expectedProductRevision,
    predecessorConfigurationId: activation.previous_configuration_id,
    successorConfigurationId: activation.next_configuration_id,
    configurationDigest: activation.next_digest,
  }));
  const lineageJson = stable({
    activationId: activation.id,
    predecessorConfigurationId: activation.previous_configuration_id,
    successorConfigurationId: activation.next_configuration_id,
    materialChangeTriggerKey: triggerKey,
  });
  const lineageDigest = await sha256(lineageJson);
  const now = Date.now();
  const runId = v7();
  try {
    await database.batch([
      database.prepare("INSERT INTO product_discovery_runs (id, workspace_id, created_at, updated_at, revision, product_id, configuration_id, configuration_digest, trigger_kind, trigger_key, source_event_id, started_at, window_lower_exclusive, window_upper_inclusive, last_successful_watermark, successful_watermark, manifest_json, manifest_digest, policy_snapshot_json, policy_snapshot_digest, execution_state, operation_digest, idempotency_key, completed_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'material_change', ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, 'blocked_missing_capability', ?, ?, NULL)").bind(runId, workspace.id, now, now, activation.product_id, activation.next_configuration_id, activation.next_digest, triggerKey, activation.id, now, now, manifestJson, activation.next_digest, policyJson, policyDigest, operationDigest, input.idempotencyKey),
      database.prepare("INSERT INTO product_configuration_lineage (id, workspace_id, product_id, replacement_activation_id, predecessor_configuration_id, successor_configuration_id, material_change_run_id, lineage_json, lineage_digest, operation_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(v7(), workspace.id, activation.product_id, activation.id, activation.previous_configuration_id, activation.next_configuration_id, runId, lineageJson, lineageDigest, operationDigest, now),
      database.prepare("INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', ?, 'product.discovery_material_change', 'product', ?, ?, ?)").bind(v7(), workspace.id, principal.subject, activation.product_id, lineageJson, now),
    ]);
  } catch (error) {
    if (!isConstraint(error)) throw new ProductReadinessConflictError(`Material-change intent failed atomically: ${errorMessage(error)}`);
    const winner = await readConfigurationLineage(database, workspace.id, activation.id);
    if (!winner) throw new ProductReadinessConflictError("Material-change intent conflicted; reload Product authority");
    return winner;
  }
  const result = await readConfigurationLineage(database, workspace.id, activation.id);
  if (!result) throw new ProductReadinessConflictError("Material-change intent was not recorded");
  return result;
}

async function readConfigurationLineage(database: D1Database, workspaceId: string, activationId: string) {
  const row = await database.prepare(
    `SELECT l.replacement_activation_id, l.predecessor_configuration_id, l.successor_configuration_id,
      r.id AS run_id, r.revision AS run_revision, r.trigger_key, r.execution_state,
      r.configuration_id, r.configuration_digest
     FROM product_configuration_lineage l JOIN product_discovery_runs r ON r.id = l.material_change_run_id AND r.workspace_id = l.workspace_id
     WHERE l.workspace_id = ? AND l.replacement_activation_id = ? LIMIT 1`,
  ).bind(workspaceId, activationId).first<{
    replacement_activation_id: string; predecessor_configuration_id: string; successor_configuration_id: string;
    run_id: string; run_revision: number; trigger_key: string; execution_state: string; configuration_id: string; configuration_digest: string;
  }>();
  if (!row) return null;
  return {
    materialChangeRun: {
      id: row.run_id,
      revision: Number(row.run_revision),
      configurationId: row.configuration_id,
      configurationDigest: row.configuration_digest,
      triggerKey: row.trigger_key,
      executionState: row.execution_state,
    },
    configurationLineage: {
      activationId: row.replacement_activation_id,
      predecessorConfigurationId: row.predecessor_configuration_id,
      successorConfigurationId: row.successor_configuration_id,
      immutable: true,
    },
  };
}

async function readNeedsAttention(database: D1Database, workspaceId: string, runId: string) {
  const row = await database.prepare(
    "SELECT r.id, r.revision, r.execution_state, p.id AS product_id, p.lifecycle, p.revision AS product_revision FROM product_discovery_runs r JOIN products p ON p.id = r.product_id AND p.workspace_id = r.workspace_id WHERE r.id = ? AND r.workspace_id = ? LIMIT 1",
  ).bind(runId, workspaceId).first<{ id: string; revision: number; execution_state: string; product_id: string; lifecycle: string; product_revision: number }>();
  if (!row || row.execution_state !== "needs_attention") throw new ProductReadinessConflictError("Needs-attention run authority is unavailable");
  return {
    status: "needs_attention" as const,
    run: { id: row.id, revision: Number(row.revision), executionState: row.execution_state },
    product: { id: row.product_id, lifecycle: row.lifecycle, revision: Number(row.product_revision) },
  };
}

async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal): Promise<Workspace> {
  const row = await database.prepare(
    "SELECT w.id, c.id AS company_id FROM workspaces w JOIN companies c ON c.workspace_id = w.id WHERE w.owner_subject IN (?, ?) ORDER BY CASE w.owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1",
  ).bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string; company_id: string }>();
  if (!row) throw new ProductReadinessConflictError("Commercial workspace authority is unavailable");
  return { id: row.id, companyId: row.company_id };
}

async function ownedProduct(database: D1Database, workspaceId: string, productId: string): Promise<ProductRow> {
  const row = await database.prepare(
    "SELECT id, company_id, name, lifecycle, revision FROM products WHERE id = ? AND workspace_id = ? LIMIT 1",
  ).bind(productId, workspaceId).first<ProductRow>();
  if (!row) throw new ProductReadinessConflictError("Product authority is unavailable");
  return { ...row, revision: Number(row.revision) };
}

async function confirmedKnowledge(database: D1Database, workspaceId: string, productId: string): Promise<KnowledgeAuthority[]> {
  const placeholders = PRODUCT_READINESS_CATEGORIES.map(() => "?").join(",");
  const rows = await database.prepare(
    `SELECT kv.id, COALESCE(kv.value_digest, kv.source_digest) AS digest, kv.kind AS category,
      kv.scope_type, kv.scope_id, kv.status, kv.value_json
     FROM knowledge_versions kv
     JOIN knowledge_items ki ON ki.id = kv.knowledge_item_id AND ki.workspace_id = kv.workspace_id AND ki.current_version_id = kv.id
     WHERE kv.workspace_id = ? AND kv.scope_type = 'product' AND kv.scope_id = ? AND kv.status = 'confirmed'
       AND kv.kind IN (${placeholders})
     ORDER BY kv.id`,
  ).bind(workspaceId, productId, ...PRODUCT_READINESS_CATEGORIES).all<{
    id: string; digest: string; category: string; scope_type: string; scope_id: string; status: string; value_json: string;
  }>();
  return rows.results.map((row) => ({
    id: row.id,
    digest: row.digest,
    category: row.category,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    status: row.status,
    authority: "confirmed_knowledge_version",
    value: parseObject(row.value_json, "Confirmed Knowledge value"),
  }));
}

function buildPolicySnapshot(knowledge: KnowledgeAuthority[]) {
  const reference = (category: ReadinessCategory) => {
    const row = knowledge.find((item) => item.category === category);
    return row ? { versionId: row.id, digest: row.digest, value: row.value } : null;
  };
  return {
    schema: "product-discovery-policy-snapshot/v1",
    runnerPolicy: reference("default_runner_policy"),
    sourcePolicy: reference("source_policy"),
    discoveryPolicy: reference("discovery_policy"),
    instructionPolicy: { mode: "bounded-product-market-fit-discovery", claimGuardrail: reference("claim_guardrail") },
    outputSchemaPolicy: { schema: "market-play-proposal/v1", maximumCandidates: 3 },
    toolPolicy: { hostedDispatch: false, providerCalls: false, downstreamWrites: false },
  };
}

async function descendantCounts(database: D1Database, workspaceId: string, productId: string) {
  const row = await database.prepare(
    `SELECT
      (SELECT COUNT(*) FROM market_plays p WHERE p.workspace_id = ? AND p.product_id = ?) AS market_plays,
      (SELECT COUNT(*) FROM customer_profiles cp JOIN market_plays p ON p.id = cp.play_id AND p.workspace_id = cp.workspace_id WHERE cp.workspace_id = ? AND p.product_id = ?) AS customer_profiles,
      (SELECT COUNT(*) FROM offers o JOIN customer_profiles cp ON cp.id = o.profile_id AND cp.workspace_id = o.workspace_id JOIN market_plays p ON p.id = cp.play_id AND p.workspace_id = cp.workspace_id WHERE o.workspace_id = ? AND p.product_id = ?) AS offers`,
  ).bind(workspaceId, productId, workspaceId, productId, workspaceId, productId).first<{ market_plays: number; customer_profiles: number; offers: number }>();
  return { marketPlays: Number(row?.market_plays ?? 0), customerProfiles: Number(row?.customer_profiles ?? 0), offers: Number(row?.offers ?? 0) };
}

async function commandForKey(database: D1Database, workspaceId: string, key: string) {
  return database.prepare("SELECT id, operation_digest FROM authority_commands WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1")
    .bind(workspaceId, key).first<{ id: string; operation_digest: string }>();
}

function productProjection(product: ProductRow) {
  return { id: product.id, name: product.name, lifecycle: product.lifecycle, revision: Number(product.revision) };
}

function exactReferences(input: VersionReference[]) {
  if (!Array.isArray(input) || input.some((item) => !item?.id || !validDigest(item.digest))) {
    throw new ProductReadinessConflictError("Exact confirmed Version IDs and digests are required");
  }
  const sorted = input.map(({ id, digest }) => ({ id, digest })).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(sorted.map((item) => item.id)).size !== sorted.length) throw new ProductReadinessConflictError("Exact confirmed Version set contains duplicates");
  return sorted;
}

function nextMonthlyIntent(now: number) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 9, 0, 0, 0);
}

function validateKey(value: string) {
  if (!/^[a-f0-9-]{20,80}$/i.test(value)) throw new ProductReadinessConflictError("Invalid idempotency key");
}
function validateRevision(value: number) {
  if (!Number.isInteger(value) || value < 1) throw new ProductReadinessConflictError("Invalid expected revision");
}
function validDigest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function isConstraint(error: unknown) { return error instanceof Error && /unique|constraint/i.test(error.message); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "unknown failure"; }
function parseObject(raw: string, label: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new ProductReadinessConflictError(`${label} is invalid`);
  }
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
