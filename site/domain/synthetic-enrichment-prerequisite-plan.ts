/**
 * Pure, synthetic preparation for known-contact verification/enrichment.
 *
 * This module deliberately has no persistence, runtime, route, provider-port,
 * browser, or external-effect dependency. It turns already-existing immutable
 * synthetic authority into a deterministic write *plan*; it never applies it.
 */

export type SyntheticEnrichmentRole = "champion" | "economic_buyer" | "general";
export type SyntheticEnrichmentBudgetScope = "grant" | "profile" | "workspace" | "provider";

export type SyntheticGrantSnapshot = Readonly<{
  schema: "synthetic-enrichment-grant-snapshot/v1";
  grantId: string;
  workspaceId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  configurationRevision: number;
  providerId: string;
  providerVersion: string;
  catalogRef: string;
  quoteRevision: number;
  prospectId: string;
  prospectRevision: number;
  maxUnits: number;
  maxCostMinor: number;
  currency: string;
  expiresAt: number;
  snapshotDigest: string;
}>;

export type SyntheticKnownContact = Readonly<{
  schema: "synthetic-known-contact/v1";
  contactId: string;
  workspaceId: string;
  revision: number;
  relevance: Readonly<{
    relationId: string;
    workspaceId: string;
    contactId: string;
    prospectId: string;
    confirmed: true;
    revision: number;
  }>;
  roleApproval: Readonly<{
    workspaceId: string;
    contactId: string;
    prospectId: string;
    role: SyntheticEnrichmentRole;
    ownerApproved: true;
    revision: number;
  }>;
  contactDigest: string;
}>;

export type SyntheticEnrichmentCapPolicy = Readonly<{
  schema: "synthetic-enrichment-cap-policy/v1";
  workspaceId: string;
  grantDigest: string;
  contactDigest: string;
  ownerApproved: true;
  revision: number;
  accounts: readonly Readonly<{
    scope: SyntheticEnrichmentBudgetScope;
    entityId: string;
    currency: string;
    maxUnits: number;
    maxCostMinor: number;
  }>[];
  policyDigest: string;
}>;

export type SyntheticEnrichmentPrerequisiteInput = Readonly<{
  grant: SyntheticGrantSnapshot;
  contact: SyntheticKnownContact;
  capPolicy: SyntheticEnrichmentCapPolicy;
  now: number;
}>;

export type SyntheticEnrichmentBudgetAccount = Readonly<{
  authorityType: "enrichment";
  accountId: string;
  scope: SyntheticEnrichmentBudgetScope;
  workspaceId: string;
  entityId: string;
  currency: string;
  actualUnits: 0;
  reservedUnits: 0;
  maxUnits: number;
  actualCostMinor: 0;
  reservedCostMinor: 0;
  maxCostMinor: number;
}>;

export type SyntheticContactEvidenceAssignment = Readonly<{
  assignmentId: string;
  assignmentDigest: string;
  workspaceId: string;
  grantId: string;
  prospectId: string;
  contactId: string;
  role: SyntheticEnrichmentRole;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  providerId: string;
  providerVersion: string;
  catalogRef: string;
  quoteRevision: number;
}>;

export type SyntheticEnrichmentPrerequisitePlan = Readonly<{
  schema: "synthetic-enrichment-prerequisite-plan/v1";
  workspaceId: string;
  grantId: string;
  grantDigest: string;
  contactId: string;
  contactDigest: string;
  capPolicyDigest: string;
  budgetAccounts: readonly SyntheticEnrichmentBudgetAccount[];
  evidenceAssignments: readonly [SyntheticContactEvidenceAssignment];
  effectAuthority: "none";
  persistenceAuthority: "none";
  planDigest: string;
}>;

export type SyntheticEnrichmentPrerequisiteBlockedReason =
  | "invalid_snapshot"
  | "foreign_or_mismatched"
  | "stale_or_expired"
  | "relevance_not_confirmed"
  | "role_not_approved"
  | "duplicate_data"
  | "insufficient_cap";

export type SyntheticEnrichmentPrerequisiteResult = Readonly<
  | { kind: "planned"; plan: SyntheticEnrichmentPrerequisitePlan }
  | { kind: "blocked"; reason: SyntheticEnrichmentPrerequisiteBlockedReason }
>;

export type SyntheticEnrichmentPrerequisiteComparison = Readonly<
  | { kind: "exact_replay"; planDigest: string }
  | { kind: "conflict"; existingPlanDigest: string; candidatePlanDigest: string }
  | { kind: "invalid_plan" }
>;

const DIGEST = /^[0-9a-f]{64}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const SCOPES = Object.freeze([
  "grant",
  "profile",
  "workspace",
  "provider",
] as const);
const ROLES = new Set<SyntheticEnrichmentRole>(["champion", "economic_buyer", "general"]);

export async function planSyntheticEnrichmentPrerequisites(
  value: SyntheticEnrichmentPrerequisiteInput | unknown,
): Promise<SyntheticEnrichmentPrerequisiteResult> {
  let input: SyntheticEnrichmentPrerequisiteInput | null;
  try {
    input = snapshotInput(value);
  } catch {
    return blocked("invalid_snapshot");
  }
  if (!input) return blocked("invalid_snapshot");

  const { grant, contact, capPolicy, now } = input;
  if (
    await digestWithout(grant, "snapshotDigest") !== grant.snapshotDigest
    || await digestWithout(contact, "contactDigest") !== contact.contactDigest
    || await digestWithout(capPolicy, "policyDigest") !== capPolicy.policyDigest
  ) return blocked("invalid_snapshot");

  if (grant.expiresAt <= now) return blocked("stale_or_expired");
  if (!sameScope(grant, contact, capPolicy)) return blocked("foreign_or_mismatched");
  if (!confirmedRelevance(contact, grant)) return blocked("relevance_not_confirmed");
  if (!approvedRole(contact, grant)) return blocked("role_not_approved");

  const normalizedAccounts = normalizePolicyAccounts(capPolicy.accounts);
  if (!normalizedAccounts) return blocked("duplicate_data");
  if (!accountsMatchAuthority(normalizedAccounts, grant)) return blocked("foreign_or_mismatched");
  if (normalizedAccounts.some((account) =>
    account.maxUnits < grant.maxUnits || account.maxCostMinor < grant.maxCostMinor
  )) return blocked("insufficient_cap");

  const budgetAccounts: SyntheticEnrichmentBudgetAccount[] = [];
  for (const account of normalizedAccounts) {
    budgetAccounts.push({
      authorityType: "enrichment",
      // This is the exact identity consumed independently by the durable
      // reservation authority. The cap-policy digest belongs in the plan
      // digest, not in account identity, because shared scope accounts retain
      // one stable identity across grants.
      accountId: derivedEnrichmentAccountId(
        grant.workspaceId,
        account.scope,
        account.entityId,
      ),
      scope: account.scope,
      workspaceId: grant.workspaceId,
      entityId: account.entityId,
      currency: account.currency,
      actualUnits: 0,
      reservedUnits: 0,
      maxUnits: account.maxUnits,
      actualCostMinor: 0,
      reservedCostMinor: 0,
      maxCostMinor: account.maxCostMinor,
    });
  }

  const assignmentMaterial = {
    schema: "synthetic-contact-evidence-assignment/v1",
    workspaceId: grant.workspaceId,
    grantId: grant.grantId,
    prospectId: grant.prospectId,
    contactId: contact.contactId,
    role: contact.roleApproval.role,
    profileConfigurationId: grant.profileConfigurationId,
    profileConfigurationDigest: grant.profileConfigurationDigest,
    providerId: grant.providerId,
    providerVersion: grant.providerVersion,
    catalogRef: grant.catalogRef,
    quoteRevision: grant.quoteRevision,
    contactDigest: contact.contactDigest,
    grantDigest: grant.snapshotDigest,
  } as const;
  const assignmentDigest = await digestSyntheticEnrichmentMaterial(assignmentMaterial);
  const assignment: SyntheticContactEvidenceAssignment = {
    assignmentId: `cea_${assignmentDigest.slice(0, 24)}`,
    assignmentDigest,
    workspaceId: assignmentMaterial.workspaceId,
    grantId: assignmentMaterial.grantId,
    prospectId: assignmentMaterial.prospectId,
    contactId: assignmentMaterial.contactId,
    role: assignmentMaterial.role,
    profileConfigurationId: assignmentMaterial.profileConfigurationId,
    profileConfigurationDigest: assignmentMaterial.profileConfigurationDigest,
    providerId: assignmentMaterial.providerId,
    providerVersion: assignmentMaterial.providerVersion,
    catalogRef: assignmentMaterial.catalogRef,
    quoteRevision: assignmentMaterial.quoteRevision,
  };

  const planMaterial = {
    schema: "synthetic-enrichment-prerequisite-plan/v1" as const,
    workspaceId: grant.workspaceId,
    grantId: grant.grantId,
    grantDigest: grant.snapshotDigest,
    contactId: contact.contactId,
    contactDigest: contact.contactDigest,
    capPolicyDigest: capPolicy.policyDigest,
    budgetAccounts,
    evidenceAssignments: [assignment] as const,
    effectAuthority: "none" as const,
    persistenceAuthority: "none" as const,
  };
  const plan = deepFreeze({
    ...planMaterial,
    planDigest: await digestSyntheticEnrichmentMaterial(planMaterial),
  }) as SyntheticEnrichmentPrerequisitePlan;
  return Object.freeze({ kind: "planned", plan });
}

export async function compareSyntheticEnrichmentPrerequisitePlans(
  existingValue: SyntheticEnrichmentPrerequisitePlan | unknown,
  candidateValue: SyntheticEnrichmentPrerequisitePlan | unknown,
): Promise<SyntheticEnrichmentPrerequisiteComparison> {
  const existing = snapshotPlan(existingValue);
  const candidate = snapshotPlan(candidateValue);
  if (!existing || !candidate || !await validPlan(existing) || !await validPlan(candidate)) {
    return Object.freeze({ kind: "invalid_plan" });
  }
  if (canonical(existing) === canonical(candidate)) {
    return Object.freeze({ kind: "exact_replay", planDigest: existing.planDigest });
  }
  return Object.freeze({
    kind: "conflict",
    existingPlanDigest: existing.planDigest,
    candidatePlanDigest: candidate.planDigest,
  });
}

export async function digestSyntheticEnrichmentMaterial(value: unknown): Promise<string> {
  const snapshot = snapshotExactDataGraph(value);
  if (snapshot === null && value !== null) throw new TypeError("invalid_synthetic_enrichment_material");
  const bytes = new TextEncoder().encode(canonical(snapshot));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function snapshotInput(value: unknown): SyntheticEnrichmentPrerequisiteInput | null {
  const snapshot = snapshotExactDataGraph(value);
  const root = exactRecord(snapshot, ["grant", "contact", "capPolicy", "now"]);
  const grant = root && exactRecord(root.grant, [
    "schema", "grantId", "workspaceId", "profileConfigurationId", "profileConfigurationDigest",
    "configurationRevision", "providerId", "providerVersion", "catalogRef", "quoteRevision",
    "prospectId", "prospectRevision", "maxUnits", "maxCostMinor", "currency", "expiresAt",
    "snapshotDigest",
  ]);
  const contact = root && exactRecord(root.contact, [
    "schema", "contactId", "workspaceId", "revision", "relevance", "roleApproval", "contactDigest",
  ]);
  const relevance = contact && exactRecord(contact.relevance, [
    "relationId", "workspaceId", "contactId", "prospectId", "confirmed", "revision",
  ]);
  const role = contact && exactRecord(contact.roleApproval, [
    "workspaceId", "contactId", "prospectId", "role", "ownerApproved", "revision",
  ]);
  const policy = root && exactRecord(root.capPolicy, [
    "schema", "workspaceId", "grantDigest", "contactDigest", "ownerApproved", "revision", "accounts", "policyDigest",
  ]);
  const accounts = policy && exactArray(policy.accounts, 4);
  if (!root || !grant || !contact || !relevance || !role || !policy || !accounts) return null;
  if (accounts.some((entry) => !exactRecord(entry, ["scope", "entityId", "currency", "maxUnits", "maxCostMinor"]))) return null;
  if (
    grant.schema !== "synthetic-enrichment-grant-snapshot/v1"
    || contact.schema !== "synthetic-known-contact/v1"
    || policy.schema !== "synthetic-enrichment-cap-policy/v1"
    || !id(grant.grantId) || !id(grant.workspaceId) || !id(grant.profileConfigurationId)
    || !digest(grant.profileConfigurationDigest) || !positive(grant.configurationRevision)
    || !id(grant.providerId) || !id(grant.providerVersion) || !id(grant.catalogRef)
    || !positive(grant.quoteRevision) || !id(grant.prospectId) || !positive(grant.prospectRevision)
    || !positive(grant.maxUnits) || !nonNegative(grant.maxCostMinor) || !currency(grant.currency)
    || !positive(grant.expiresAt) || !digest(grant.snapshotDigest)
    || !id(contact.contactId) || !id(contact.workspaceId) || !positive(contact.revision)
    || !id(relevance.relationId) || !id(relevance.workspaceId) || !id(relevance.contactId)
    || !id(relevance.prospectId) || relevance.confirmed !== true || !positive(relevance.revision)
    || !id(role.workspaceId) || !id(role.contactId) || !id(role.prospectId)
    || !ROLES.has(role.role as SyntheticEnrichmentRole) || role.ownerApproved !== true || !positive(role.revision)
    || !digest(contact.contactDigest) || !id(policy.workspaceId) || !digest(policy.grantDigest)
    || !digest(policy.contactDigest) || policy.ownerApproved !== true || !positive(policy.revision)
    || !digest(policy.policyDigest) || !positive(root.now)
    || accounts.some((entry) => {
      const account = entry as Record<string, unknown>;
      return !SCOPES.includes(account.scope as SyntheticEnrichmentBudgetScope)
        || !id(account.entityId) || !currency(account.currency)
        || !positive(account.maxUnits) || !nonNegative(account.maxCostMinor);
    })
  ) return null;
  return deepFreeze(snapshot) as SyntheticEnrichmentPrerequisiteInput;
}

function sameScope(
  grant: SyntheticGrantSnapshot,
  contact: SyntheticKnownContact,
  policy: SyntheticEnrichmentCapPolicy,
): boolean {
  return contact.workspaceId === grant.workspaceId
    && policy.workspaceId === grant.workspaceId
    && policy.grantDigest === grant.snapshotDigest
    && policy.contactDigest === contact.contactDigest;
}

function confirmedRelevance(contact: SyntheticKnownContact, grant: SyntheticGrantSnapshot): boolean {
  return contact.relevance.confirmed === true
    && contact.relevance.workspaceId === grant.workspaceId
    && contact.relevance.contactId === contact.contactId
    && contact.relevance.prospectId === grant.prospectId;
}

function approvedRole(contact: SyntheticKnownContact, grant: SyntheticGrantSnapshot): boolean {
  return contact.roleApproval.ownerApproved === true
    && contact.roleApproval.workspaceId === grant.workspaceId
    && contact.roleApproval.contactId === contact.contactId
    && contact.roleApproval.prospectId === grant.prospectId
    && ROLES.has(contact.roleApproval.role);
}

function normalizePolicyAccounts(accounts: SyntheticEnrichmentCapPolicy["accounts"]): SyntheticEnrichmentCapPolicy["accounts"] | null {
  const byScope = new Map<SyntheticEnrichmentBudgetScope, SyntheticEnrichmentCapPolicy["accounts"][number]>();
  for (const account of accounts) {
    if (byScope.has(account.scope)) return null;
    byScope.set(account.scope, account);
  }
  if (SCOPES.some((scope) => !byScope.has(scope))) return null;
  return SCOPES.map((scope) => ({ ...byScope.get(scope)! }));
}

function accountsMatchAuthority(
  accounts: SyntheticEnrichmentCapPolicy["accounts"],
  grant: SyntheticGrantSnapshot,
): boolean {
  const expected: Readonly<Record<SyntheticEnrichmentBudgetScope, string>> = {
    grant: grant.grantId,
    profile: grant.profileConfigurationId,
    workspace: grant.workspaceId,
    provider: grant.providerId,
  };
  return accounts.every((account) =>
    account.entityId === expected[account.scope] && account.currency === grant.currency
  );
}

function derivedEnrichmentAccountId(
  workspaceId: string,
  scope: SyntheticEnrichmentBudgetScope,
  entityId: string,
): string {
  return `enrichment:${workspaceId.length}:${workspaceId}:${scope}:${entityId.length}:${entityId}`;
}

function snapshotPlan(value: unknown): SyntheticEnrichmentPrerequisitePlan | null {
  try {
    const cloned = snapshotExactDataGraph(value);
    const root = exactRecord(cloned, [
      "schema", "workspaceId", "grantId", "grantDigest", "contactId", "contactDigest",
      "capPolicyDigest", "budgetAccounts", "evidenceAssignments", "effectAuthority",
      "persistenceAuthority", "planDigest",
    ]);
    const accounts = root && exactArray(root.budgetAccounts, 4);
    const assignments = root && exactArray(root.evidenceAssignments, 1);
    if (!root || !accounts || !assignments) return null;
    if (accounts.some((entry) => !exactRecord(entry, [
      "authorityType", "accountId", "scope", "workspaceId", "entityId", "currency",
      "actualUnits", "reservedUnits", "maxUnits", "actualCostMinor", "reservedCostMinor", "maxCostMinor",
    ]))) return null;
    if (!exactRecord(assignments[0], [
      "assignmentId", "assignmentDigest", "workspaceId", "grantId", "prospectId", "contactId", "role",
      "profileConfigurationId", "profileConfigurationDigest", "providerId", "providerVersion", "catalogRef", "quoteRevision",
    ])) return null;
    return cloned as SyntheticEnrichmentPrerequisitePlan;
  } catch {
    return null;
  }
}

async function validPlan(plan: SyntheticEnrichmentPrerequisitePlan): Promise<boolean> {
  const assignment = plan.evidenceAssignments[0];
  if (
    plan.schema !== "synthetic-enrichment-prerequisite-plan/v1"
    || plan.effectAuthority !== "none" || plan.persistenceAuthority !== "none"
    || !id(plan.workspaceId) || !id(plan.grantId) || !id(plan.contactId)
    || !digest(plan.planDigest) || !digest(plan.grantDigest) || !digest(plan.contactDigest)
    || !digest(plan.capPolicyDigest) || plan.budgetAccounts.length !== 4
    || plan.evidenceAssignments.length !== 1
    || !assignment
    || !id(assignment.assignmentId) || !digest(assignment.assignmentDigest)
    || assignment.assignmentId !== `cea_${assignment.assignmentDigest.slice(0, 24)}`
    || assignment.workspaceId !== plan.workspaceId
    || assignment.grantId !== plan.grantId
    || assignment.contactId !== plan.contactId
    || !id(assignment.prospectId) || !ROLES.has(assignment.role)
    || !id(assignment.profileConfigurationId) || !digest(assignment.profileConfigurationDigest)
    || !id(assignment.providerId) || !id(assignment.providerVersion) || !id(assignment.catalogRef)
    || !positive(assignment.quoteRevision)
  ) return false;
  const expectedEntities: Readonly<Record<SyntheticEnrichmentBudgetScope, string>> = {
    grant: plan.grantId,
    profile: assignment.profileConfigurationId,
    workspace: plan.workspaceId,
    provider: assignment.providerId,
  };
  const currencies = new Set<string>();
  for (let index = 0; index < SCOPES.length; index += 1) {
    const account = plan.budgetAccounts[index];
    const scope = SCOPES[index];
    if (
      !account
      || account.authorityType !== "enrichment"
      || account.scope !== scope
      || account.workspaceId !== plan.workspaceId
      || account.entityId !== expectedEntities[scope]
      || account.accountId !== derivedEnrichmentAccountId(plan.workspaceId, scope, expectedEntities[scope])
      || !currency(account.currency)
      || account.actualUnits !== 0 || account.reservedUnits !== 0
      || account.actualCostMinor !== 0 || account.reservedCostMinor !== 0
      || !positive(account.maxUnits) || !nonNegative(account.maxCostMinor)
    ) return false;
    currencies.add(account.currency);
  }
  if (currencies.size !== 1 || new Set(plan.budgetAccounts.map(({ accountId }) => accountId)).size !== 4) return false;
  const expectedAssignmentDigest = await digestSyntheticEnrichmentMaterial({
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
    contactDigest: plan.contactDigest,
    grantDigest: plan.grantDigest,
  });
  if (assignment.assignmentDigest !== expectedAssignmentDigest) return false;
  const { planDigest, ...material } = plan;
  return await digestSyntheticEnrichmentMaterial(material) === planDigest;
}

async function digestWithout(value: object, key: string): Promise<string> {
  const material = { ...(value as Record<string, unknown>) };
  delete material[key];
  return digestSyntheticEnrichmentMaterial(material);
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.keys(descriptors).sort();
  if (names.length !== keys.length || names.some((name, index) => name !== [...keys].sort()[index])) return null;
  if (Object.values(descriptors).some((descriptor) => !descriptor.enumerable || "get" in descriptor || "set" in descriptor)) return null;
  return value as Record<string, unknown>;
}

function exactArray(value: unknown, length: number): readonly unknown[] | null {
  if (!Array.isArray(value) || value.length !== length || Object.keys(value).length !== length) return null;
  return value;
}

/**
 * Copies an exact JSON-like data graph by reading property descriptors only.
 * Accessors are rejected before invocation. A final native clone probe rejects
 * transparent Proxy wrappers after the graph has proved data-only.
 */
function snapshotExactDataGraph(value: unknown): unknown | null {
  const seen = new WeakSet<object>();
  const copy = (current: unknown): unknown => {
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isSafeInteger(current)) return current;
    if (!current || typeof current !== "object" || seen.has(current)) throw new TypeError("invalid_data_graph");
    seen.add(current);
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const symbolKeys = Object.getOwnPropertySymbols(current);
    if (symbolKeys.length > 0) throw new TypeError("invalid_data_graph");
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) throw new TypeError("invalid_data_graph");
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || "get" in lengthDescriptor || "set" in lengthDescriptor
        || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) throw new TypeError("invalid_data_graph");
      const result: unknown[] = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) throw new TypeError("invalid_data_graph");
        result.push(copy(descriptor.value));
      }
      if (Object.keys(descriptors).some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) throw new TypeError("invalid_data_graph");
      return result;
    }
    if (Object.getPrototypeOf(current) !== Object.prototype) throw new TypeError("invalid_data_graph");
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || "get" in descriptor || "set" in descriptor) throw new TypeError("invalid_data_graph");
      result[key] = copy(descriptor.value);
    }
    return result;
  };
  try {
    const snapshot = copy(value);
    // Native structuredClone rejects Proxy objects (including nested Proxies).
    // It runs only after the descriptor walk has established there are no
    // accessors in an ordinary input graph, so it cannot execute a getter.
    structuredClone(value);
    return snapshot;
  } catch {
    return null;
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new TypeError("invalid_synthetic_enrichment_material");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function id(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 256; }
function digest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function currency(value: unknown): value is string { return typeof value === "string" && CURRENCY.test(value); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function blocked(reason: SyntheticEnrichmentPrerequisiteBlockedReason): SyntheticEnrichmentPrerequisiteResult {
  return Object.freeze({ kind: "blocked", reason });
}
