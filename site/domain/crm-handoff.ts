/**
 * CSV CRM handoff service shell (Plan 07-06, partial).
 *
 * Composes the existing pure pieces -- the CRM CSV codec, the export-artifact
 * boundary, and the delivery decision -- behind injected ports:
 *
 *   source       current authority revisions and the candidate contact points
 *   eligibility  per-candidate recheck; production composition wires
 *                `recheckForCrmExport` (see `createCrmExportEligibilityPort`),
 *                which refuses every candidate today. Only tests inject a
 *                synthetic ContactReady.
 *   suppression  Lane B's `createSuppressionResolver(...).blockingScopes`,
 *                which fails closed on any input or lookup error and reports
 *                every scope that blocks, so exclusions carry an accurate label
 *   store        immutable versioned artifact record (fake in tests)
 *
 * A row is emitted only for a candidate that is in the supplied workspace, not
 * deleted or alias-merged, in the Export-ready state, carrying an accepted
 * verification class, and passing BOTH the eligibility recheck and the
 * suppression check at plan time. Every other candidate becomes an exclusion
 * carrying safe identity references and a reason code only. A suppressed
 * candidate additionally yields a non-contactable manifest entry that never
 * carries the contact value.
 *
 * Not implemented here: D1 persistence of the version (needs Plan 07-04), an
 * ExportDeliveryPort invocation, download authorization, routes, UI and any
 * provider. This shell has no network, provider, or environment access and
 * reports `providerCalls: 0` everywhere. It grants no plan credit.
 */

import {
  recheckForCrmExport,
  type DownstreamRecheck,
} from "./contact-eligibility";
import { CRM_CSV_FIELD_IDS, type CrmCsvRow } from "./crm-csv-codec";
import {
  decideCrmHandoffDelivery,
  type StoredCrmHandoffArtifact,
} from "./crm-handoff-delivery";
import {
  buildCrmHandoffExportArtifact,
  digestCrmHandoffExportRow,
  digestCrmHandoffSelection,
  type CrmHandoffExportArtifact,
} from "./crm-handoff-export-artifact";
import type { BlockingScopes, IdentityLineage, ResolutionInput } from "./suppression";

export const CRM_HANDOFF_SELECTION_TTL_MS = 10 * 60 * 1000;
export const CRM_HANDOFF_DELIVERY_TTL_MS = 24 * 60 * 60 * 1000;

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ACCEPTED_VERIFICATION = ["mailbox_verified", "source_verified"] as const;
const ELIGIBILITY_REASONS = ["stale_verification", "package_revoked", "high_risk_drift"] as const;

export type CrmHandoffVerificationClass = typeof ACCEPTED_VERIFICATION[number];

export type CrmHandoffCandidate = Readonly<{
  workspaceId: string;
  /** Current Prospect state; only "Export-ready" can yield a row. */
  prospectState: string;
  deleted: boolean;
  /** Set when this Prospect was merged into another (alias). */
  aliasOf: string | null;
  verificationClass: string;
  /** Digest of the approved Package this row is exported under. */
  packageDigest: string;
  contactLineage?: IdentityLineage;
  organizationLineage?: IdentityLineage;
  /** Opaque input handed to the eligibility port. */
  eligibilityInput: unknown;
  cells: CrmCsvRow;
}>;

export type CrmHandoffSourceRead = Readonly<{
  exportScope: Readonly<{ tenantId: string; workspaceId: string }>;
  selectionId: string;
  selectionRevision: number;
  authorityRevision: number;
  configurationDigest: string;
  exportDefinitionDigest: string;
  candidates: readonly CrmHandoffCandidate[];
}>;

export type CrmHandoffEligibilityResult = Readonly<{
  contactReady: boolean;
  reasonCode?: string;
}>;

export type CrmHandoffEligibilityPort = Readonly<{
  recheck(request: Readonly<{
    workspaceId: string;
    prospectId: string;
    contactId: string;
    contactPointId: string;
    eligibilityInput: unknown;
  }>): Promise<CrmHandoffEligibilityResult>;
}>;

/** Structurally the `blockingScopes` method of the Lane B suppression resolver. */
export type CrmHandoffSuppressionPort = Readonly<{
  blockingScopes(input: ResolutionInput): Promise<Pick<BlockingScopes, "blocked" | "scopes" | "complete">>;
}>;

export type CrmHandoffStoreRecord = Readonly<{
  stored: StoredCrmHandoffArtifact;
  bytes: Uint8Array;
  manifest: CrmHandoffExportArtifact["manifest"];
}>;

export type CrmHandoffStorePort = Readonly<{
  /** The artifact for this idempotency key if any, else the latest in the workspace, else null. */
  lookup(request: Readonly<{ workspaceId: string; idempotencyKey: string }>): Promise<StoredCrmHandoffArtifact | null>;
  /** Must refuse (throw) to overwrite an existing version. */
  putImmutable(record: CrmHandoffStoreRecord): Promise<void>;
}>;

export type CrmHandoffPorts = Readonly<{
  source: Readonly<{ read(workspaceId: string): Promise<CrmHandoffSourceRead> }>;
  eligibility: CrmHandoffEligibilityPort;
  suppression: CrmHandoffSuppressionPort;
  store: CrmHandoffStorePort;
  clock?: Readonly<{ nowIso(): string }>;
}>;

export type CrmHandoffExclusionReason =
  | "cross_workspace"
  | "deleted"
  | "alias_merge"
  | "not_export_ready"
  | "verification_class_ineligible"
  | "row_cells_invalid"
  | "duplicate_identity_conflict"
  | "stale_verification"
  | "package_revoked"
  | "high_risk_drift"
  | "not_contact_ready"
  | "eligibility_unavailable"
  | "suppressed_exact"
  | "suppressed_domain"
  | "suppressed_contact"
  | "suppressed_organization"
  | "suppressed_company";

export type CrmHandoffExclusion = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointId: string;
  reason: CrmHandoffExclusionReason;
}>;

export type CrmHandoffNonContactable = CrmHandoffExclusion & Readonly<{ contactable: false }>;

export type CrmHandoffPlanRow = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointId: string;
  verificationClass: CrmHandoffVerificationClass;
  contactValue: string;
  packageDigest: string;
  rowDigest: string;
  cells: CrmCsvRow;
}>;

export type CrmHandoffPlan = Readonly<{
  kind: "crm_handoff_plan";
  workspaceId: string;
  authority: Omit<CrmHandoffSourceRead, "candidates">;
  snapshotDigest: string;
  rows: readonly CrmHandoffPlanRow[];
  exclusions: readonly CrmHandoffExclusion[];
  nonContactable: readonly CrmHandoffNonContactable[];
  providerCalls: 0;
}>;

export type CrmHandoffBlockedReason =
  | "invalid_request"
  | "authority_unavailable"
  | "snapshot_stale"
  | "no_eligible_rows"
  | "idempotency_conflict"
  | "artifact_rejected"
  | "store_failed";

export type CrmHandoffResult =
  | Readonly<{ status: "blocked"; reason: CrmHandoffBlockedReason; detail?: string; providerCalls: 0 }>
  | Readonly<{
    status: "materialized" | "replayed";
    artifactId: string;
    version: number;
    snapshotDigest: string;
    csvSha256: string;
    manifestSha256: string;
    providerCalls: 0;
  }>;

export class CrmHandoffServiceError extends Error {
  readonly code: "crm_handoff_service_invalid" | "crm_handoff_service_authority_unavailable";
  constructor(code: CrmHandoffServiceError["code"]) {
    super(code);
    this.name = "CrmHandoffServiceError";
    this.code = code;
  }
}

/**
 * Production eligibility composition: delegates to the existing blocked
 * `recheckForCrmExport`. It reports contactReady only if that recheck is
 * unblocked AND eligible, so today it refuses everything. It never routes
 * around the boundary.
 */
export function createCrmExportEligibilityPort(): CrmHandoffEligibilityPort {
  return Object.freeze({
    async recheck(request) {
      const recheck: DownstreamRecheck = recheckForCrmExport(request.eligibilityInput);
      if (recheck.blocked) return Object.freeze({ contactReady: false, reasonCode: "crm_export_recheck_blocked" });
      return Object.freeze({ contactReady: recheck.eligibility.eligible });
    },
  });
}

export async function planCrmHandoff(value: {
  workspaceId: string;
  ports: CrmHandoffPorts;
}): Promise<CrmHandoffPlan> {
  const { workspaceId, ports } = validateInput(value);
  let source: CrmHandoffSourceRead;
  try {
    source = validateSource(await ports.source.read(workspaceId));
  } catch {
    throw new CrmHandoffServiceError("crm_handoff_service_authority_unavailable");
  }

  const { candidates, ...authority } = source;
  const rows: CrmHandoffPlanRow[] = [];
  const exclusions: CrmHandoffExclusion[] = [];
  const nonContactable: CrmHandoffNonContactable[] = [];
  const exclude = (ref: Identity, reason: CrmHandoffExclusionReason) => {
    exclusions.push(Object.freeze({ ...ref, reason }));
  };

  // Group by Prospect + contact-point identity. An exact repeat collapses; the
  // same identity carrying different material is a conflict and fails closed.
  const groups = new Map<string, CrmHandoffCandidate[]>();
  for (const candidate of candidates) {
    const ref = identityOf(candidate);
    if (!ref) {
      exclude(UNKNOWN_IDENTITY, "row_cells_invalid");
      continue;
    }
    const key = JSON.stringify([ref.prospectId, ref.contactPointId]);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  for (const group of groups.values()) {
    const candidate = group[0];
    const ref = identityOf(candidate) as Identity;
    if (group.some((entry) => signature(entry) !== signature(candidate))) {
      exclude(ref, "duplicate_identity_conflict");
      continue;
    }
    const structural = structuralReason(candidate, workspaceId);
    if (structural) {
      exclude(ref, structural);
      continue;
    }

    let eligibility: CrmHandoffEligibilityResult;
    try {
      eligibility = await ports.eligibility.recheck({
        workspaceId,
        prospectId: ref.prospectId,
        contactId: ref.contactId,
        contactPointId: ref.contactPointId,
        eligibilityInput: candidate.eligibilityInput,
      });
    } catch {
      exclude(ref, "eligibility_unavailable");
      continue;
    }
    if (eligibility?.contactReady !== true) {
      exclude(ref, eligibilityReason(eligibility?.reasonCode));
      continue;
    }

    const scopes = await suppressionScopes(ports.suppression, candidate);
    if (scopes.length > 0) {
      for (const scope of scopes) {
        const entry = Object.freeze({ ...ref, reason: `suppressed_${scope}` as CrmHandoffExclusionReason });
        exclusions.push(entry);
        nonContactable.push(Object.freeze({ ...entry, contactable: false as const }));
      }
      continue;
    }

    rows.push(Object.freeze({
      ...ref,
      verificationClass: candidate.verificationClass as CrmHandoffVerificationClass,
      contactValue: candidate.cells.contact_value as string,
      packageDigest: candidate.packageDigest,
      rowDigest: await sha256(JSON.stringify(CRM_CSV_FIELD_IDS.map((field) => candidate.cells[field]))),
      cells: Object.freeze({ ...candidate.cells }),
    }));
  }

  rows.sort(compareIdentity);
  exclusions.sort((a, b) => compareIdentity(a, b) || compareText(a.reason, b.reason));
  nonContactable.sort((a, b) => compareIdentity(a, b) || compareText(a.reason, b.reason));

  const snapshotDigest = await sha256(JSON.stringify({
    workspaceId,
    authority,
    rows: rows.map((row) => row.rowDigest),
    exclusions: exclusions.map((entry) => [entry.prospectId, entry.contactId, entry.contactPointId, entry.reason]),
  }));

  return Object.freeze({
    kind: "crm_handoff_plan" as const,
    workspaceId,
    authority: Object.freeze(authority),
    snapshotDigest,
    rows: Object.freeze(rows),
    exclusions: Object.freeze(exclusions),
    nonContactable: Object.freeze(nonContactable),
    providerCalls: 0 as const,
  });
}

/**
 * Re-evaluates the current plan at call time, then returns the original
 * immutable version on retry or stores a new one. `staleSnapshotDigest` is the
 * snapshot a caller (for example a UI selection) saw earlier; if the current
 * snapshot differs, nothing is built or stored.
 */
export async function materializeCrmHandoff(value: {
  workspaceId: string;
  idempotencyKey?: string;
  staleSnapshotDigest?: string;
  ports: CrmHandoffPorts;
}): Promise<CrmHandoffResult> {
  let workspaceId: string;
  let ports: CrmHandoffPorts;
  try {
    ({ workspaceId, ports } = validateInput(value));
    if (value.staleSnapshotDigest !== undefined && !DIGEST.test(value.staleSnapshotDigest)) throw new Error("digest");
    if (value.idempotencyKey !== undefined && !ID.test(value.idempotencyKey)) throw new Error("key");
  } catch {
    return blocked("invalid_request");
  }

  let plan: CrmHandoffPlan;
  try {
    plan = await planCrmHandoff({ workspaceId, ports });
  } catch {
    return blocked("authority_unavailable");
  }
  if (value.staleSnapshotDigest !== undefined && value.staleSnapshotDigest !== plan.snapshotDigest) {
    return blocked("snapshot_stale");
  }
  if (plan.rows.length === 0) return blocked("no_eligible_rows");

  const idempotencyKey = value.idempotencyKey ?? `snapshot-${plan.snapshotDigest.slice(0, 32)}`;
  const nowIso = ports.clock?.nowIso() ?? new Date().toISOString();

  let existing: StoredCrmHandoffArtifact | null;
  try {
    existing = await ports.store.lookup({ workspaceId, idempotencyKey });
  } catch {
    return blocked("store_failed");
  }
  const decision = decideCrmHandoffDelivery({
    now: nowIso,
    workspaceId,
    idempotencyKey,
    snapshotDigest: plan.snapshotDigest,
    exportDefinitionDigest: plan.authority.exportDefinitionDigest,
    operation: "materialize",
    existing,
  });
  if (decision.outcome === "replay" && decision.artifact) {
    return Object.freeze({
      status: "replayed" as const,
      artifactId: decision.artifact.artifactId,
      version: decision.artifact.version,
      snapshotDigest: decision.artifact.snapshotDigest,
      csvSha256: decision.artifact.csvSha256,
      manifestSha256: decision.artifact.manifestSha256,
      providerCalls: 0 as const,
    });
  }
  if (decision.outcome !== "new_version" || decision.nextVersion === null) {
    return blocked(decision.reason === "idempotency_conflict" ? "idempotency_conflict" : "invalid_request");
  }

  let artifact: CrmHandoffExportArtifact;
  try {
    const selectedRows = plan.rows.map((row) => ({
      prospectId: row.prospectId,
      contactId: row.contactId,
      contactPointId: row.contactPointId,
    }));
    const draft = {
      schema: "prospector/crm-handoff-selection/v1" as const,
      decision: "authorized" as const,
      dataClassification: "synthetic" as const,
      tenantId: plan.authority.exportScope.tenantId,
      workspaceId: plan.authority.exportScope.workspaceId,
      selectionId: plan.authority.selectionId,
      selectionRevision: plan.authority.selectionRevision,
      authorityRevision: plan.authority.authorityRevision,
      snapshotDigest: plan.snapshotDigest,
      exportDefinitionDigest: plan.authority.exportDefinitionDigest,
      configurationDigest: plan.authority.configurationDigest,
      packageDigests: [...new Set(plan.rows.map((row) => row.packageDigest))],
      authorizedAt: nowIso,
      expiresAt: new Date(Date.parse(nowIso) + CRM_HANDOFF_SELECTION_TTL_MS).toISOString(),
      selectedRows: await Promise.all(plan.rows.map(async (row, index) => ({
        ...selectedRows[index],
        rowDigest: await digestCrmHandoffExportRow(row.cells),
      }))),
    };
    artifact = await buildCrmHandoffExportArtifact({
      evaluatedAt: nowIso,
      current: {
        tenantId: draft.tenantId,
        workspaceId: draft.workspaceId,
        selectionRevision: draft.selectionRevision,
        authorityRevision: draft.authorityRevision,
        snapshotDigest: draft.snapshotDigest,
        exportDefinitionDigest: draft.exportDefinitionDigest,
        configurationDigest: draft.configurationDigest,
      },
      selection: { ...draft, operationDigest: await digestCrmHandoffSelection(draft) },
      rows: plan.rows.map((row) => row.cells),
    });
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    return Object.freeze({
      status: "blocked" as const,
      reason: "artifact_rejected" as const,
      detail: typeof code === "string" ? code : "crm_handoff_artifact_failed",
      providerCalls: 0 as const,
    });
  }

  const stored: StoredCrmHandoffArtifact = Object.freeze({
    workspaceId,
    artifactId: `crm-handoff-${workspaceId}-v${decision.nextVersion}`,
    version: decision.nextVersion,
    snapshotDigest: plan.snapshotDigest,
    exportDefinitionDigest: plan.authority.exportDefinitionDigest,
    idempotencyKey,
    csvSha256: artifact.manifest.csvSha256,
    manifestSha256: artifact.manifest.artifactSha256,
    deliveryState: "available" as const,
    deliveryExpiresAt: new Date(Date.parse(nowIso) + CRM_HANDOFF_DELIVERY_TTL_MS).toISOString(),
  });
  try {
    await ports.store.putImmutable(Object.freeze({ stored, bytes: artifact.bytes, manifest: artifact.manifest }));
  } catch {
    return blocked("store_failed");
  }
  return Object.freeze({
    status: "materialized" as const,
    artifactId: stored.artifactId,
    version: stored.version,
    snapshotDigest: stored.snapshotDigest,
    csvSha256: stored.csvSha256,
    manifestSha256: stored.manifestSha256,
    providerCalls: 0 as const,
  });
}

// -- internals --------------------------------------------------------------

type Identity = { prospectId: string; contactId: string; contactPointId: string };
const UNKNOWN_IDENTITY: Identity = { prospectId: "unknown", contactId: "unknown", contactPointId: "unknown" };

function blocked(reason: CrmHandoffBlockedReason): CrmHandoffResult {
  return Object.freeze({ status: "blocked" as const, reason, providerCalls: 0 as const });
}

function validateInput(value: { workspaceId: string; ports: CrmHandoffPorts }) {
  const ports = value?.ports;
  if (
    typeof value?.workspaceId !== "string" || !ID.test(value.workspaceId)
    || !ports || typeof ports.source?.read !== "function"
    || typeof ports.eligibility?.recheck !== "function"
    || typeof ports.suppression?.blockingScopes !== "function"
    || typeof ports.store?.lookup !== "function" || typeof ports.store?.putImmutable !== "function"
  ) throw new CrmHandoffServiceError("crm_handoff_service_invalid");
  return { workspaceId: value.workspaceId, ports };
}

function validateSource(source: CrmHandoffSourceRead): CrmHandoffSourceRead {
  if (
    !source || !Array.isArray(source.candidates)
    || !source.exportScope || typeof source.exportScope.tenantId !== "string" || typeof source.exportScope.workspaceId !== "string"
    || typeof source.selectionId !== "string"
    || !Number.isSafeInteger(source.selectionRevision) || !Number.isSafeInteger(source.authorityRevision)
    || !DIGEST.test(source.configurationDigest) || !DIGEST.test(source.exportDefinitionDigest)
  ) throw new Error("source_invalid");
  return source;
}

function identityOf(candidate: CrmHandoffCandidate): Identity | null {
  const cells = candidate?.cells;
  if (!cells || typeof cells !== "object") return null;
  const { prospect_id: prospectId, contact_id: contactId, contact_point_id: contactPointId } = cells;
  if ([prospectId, contactId, contactPointId].some((id) => typeof id !== "string" || !ID.test(id))) return null;
  return { prospectId: prospectId as string, contactId: contactId as string, contactPointId: contactPointId as string };
}

function signature(candidate: CrmHandoffCandidate) {
  return JSON.stringify([
    candidate.workspaceId, candidate.prospectState, candidate.deleted, candidate.aliasOf,
    candidate.verificationClass, candidate.packageDigest,
    CRM_CSV_FIELD_IDS.map((field) => candidate.cells[field]),
  ]);
}

function structuralReason(candidate: CrmHandoffCandidate, workspaceId: string): CrmHandoffExclusionReason | null {
  if (candidate.workspaceId !== workspaceId) return "cross_workspace";
  if (candidate.deleted !== false) return "deleted";
  if (candidate.aliasOf !== null) return "alias_merge";
  if (candidate.prospectState !== "Export-ready") return "not_export_ready";
  const verification = candidate.verificationClass;
  if (!(ACCEPTED_VERIFICATION as readonly string[]).includes(verification)) return "verification_class_ineligible";
  const cellClass = candidate.cells.verification_class;
  if (cellClass !== verification && cellClass !== `synthetic_${verification}`) return "row_cells_invalid";
  const kind = candidate.cells.contact_kind;
  if (
    (kind !== "email" && kind !== "phone")
    || typeof candidate.cells.contact_value !== "string" || candidate.cells.contact_value === ""
    || !DIGEST.test(candidate.packageDigest) || candidate.cells.package_ref === null
  ) return "row_cells_invalid";
  return null;
}

function eligibilityReason(code: unknown): CrmHandoffExclusionReason {
  return (ELIGIBILITY_REASONS as readonly unknown[]).includes(code) ? code as CrmHandoffExclusionReason : "not_contact_ready";
}

type SuppressionLabel = "company" | "organization" | "contact" | "domain" | "exact";

const SUPPRESSION_LABELS: ReadonlyMap<string, SuppressionLabel> = new Map([
  ["company", "company"],
  ["organization", "organization"],
  ["contact", "contact"],
  ["confirmed_email_domain", "domain"],
  ["exact_email", "exact"],
  ["e164_phone", "exact"],
]);
const LABEL_ORDER: readonly SuppressionLabel[] = ["company", "organization", "contact", "domain", "exact"];

/**
 * Every suppression scope that blocks this contact, from one scope-aware
 * resolver read; there is no probing. Only a strict `blocked: false`,
 * `complete: true`, empty-scope answer counts as unsuppressed. Any other
 * answer is blocked. When the scope cannot be fully resolved (the port threw,
 * reported an incomplete or unknown answer, or named no known scope),
 * "company" is added as the fail-closed label for the unresolved scope,
 * next to any scope that was positively found.
 */
async function suppressionScopes(
  port: CrmHandoffSuppressionPort,
  candidate: CrmHandoffCandidate,
): Promise<SuppressionLabel[]> {
  const kind = candidate.cells.contact_kind as "email" | "phone";
  const value = candidate.cells.contact_value as string;
  const input: ResolutionInput = {
    channel: kind,
    ...(kind === "email" ? { email: value } : { phone: value }),
    ...(candidate.contactLineage ? { contact: candidate.contactLineage } : {}),
    ...(candidate.organizationLineage ? { organization: candidate.organizationLineage } : {}),
  };
  let result: unknown;
  try {
    result = await port.blockingScopes(input);
  } catch {
    return ["company"];
  }
  const answer = result && typeof result === "object" ? result as Record<string, unknown> : null;
  const scopes = answer && Array.isArray(answer.scopes) ? answer.scopes as unknown[] : null;
  if (answer?.blocked === false && answer.complete === true && scopes?.length === 0) return [];

  const labels = new Set<SuppressionLabel>();
  let resolved = answer?.blocked === true && answer.complete === true && scopes !== null && scopes.length > 0;
  for (const scope of scopes ?? []) {
    const label = typeof scope === "string" ? SUPPRESSION_LABELS.get(scope) : undefined;
    if (label) labels.add(label);
    else resolved = false;
  }
  if (!resolved) labels.add("company");
  return LABEL_ORDER.filter((label) => labels.has(label));
}

function compareIdentity(a: Identity, b: Identity) {
  return compareText(a.prospectId, b.prospectId)
    || compareText(a.contactId, b.contactId)
    || compareText(a.contactPointId, b.contactPointId);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
