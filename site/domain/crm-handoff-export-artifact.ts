/**
 * Pure, local-only CRM handoff artifact boundary.
 *
 * This module consumes an explicit, already-authorized synthetic selection and
 * rechecks it against a caller-supplied current authority projection before it
 * creates CSV bytes in memory. It has no persistence, route, download,
 * provider, environment, or external-export port. The operation digest binds
 * the authorization; it is integrity metadata, not authentication evidence.
 */

import {
  CRM_CSV_FIELD_IDS,
  CRM_CSV_SCHEMA_VERSION,
  type CrmCsvFieldId,
  type CrmCsvRow,
} from "./crm-csv-codec";
import { materializeCrmHandoff } from "./crm-handoff-artifact";

export const CRM_HANDOFF_EXPORT_CONTRACT = Object.freeze({
  selectionSchema: "prospector/crm-handoff-selection/v1" as const,
  artifactSchema: "prospector/crm-handoff-export-artifact/v1" as const,
  privacyPolicy: "closed-fields-synthetic-contact-only/v1" as const,
  dataClassification: "synthetic" as const,
  fieldIds: CRM_CSV_FIELD_IDS,
});

export type CrmHandoffSelectionRowRef = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointId: string;
  rowDigest: string;
}>;

export type CrmHandoffSelectionDraft = Readonly<{
  schema: typeof CRM_HANDOFF_EXPORT_CONTRACT.selectionSchema;
  decision: "authorized";
  dataClassification: typeof CRM_HANDOFF_EXPORT_CONTRACT.dataClassification;
  tenantId: string;
  workspaceId: string;
  selectionId: string;
  selectionRevision: number;
  authorityRevision: number;
  snapshotDigest: string;
  exportDefinitionDigest: string;
  configurationDigest: string;
  packageDigests: readonly string[];
  authorizedAt: string;
  expiresAt: string;
  selectedRows: readonly CrmHandoffSelectionRowRef[];
}>;

export type CrmHandoffSelectionAuthorization = CrmHandoffSelectionDraft & Readonly<{
  operationDigest: string;
}>;

export type CrmHandoffCurrentAuthority = Readonly<{
  tenantId: string;
  workspaceId: string;
  selectionRevision: number;
  authorityRevision: number;
  snapshotDigest: string;
  exportDefinitionDigest: string;
  configurationDigest: string;
}>;

export type CrmHandoffExportRequest = Readonly<{
  evaluatedAt: string;
  current: CrmHandoffCurrentAuthority;
  selection: CrmHandoffSelectionAuthorization;
  rows: readonly CrmCsvRow[];
}>;

export type CrmHandoffExportValidation = Readonly<{
  kind: "crm_handoff_export_validation";
  accepted: true;
  tenantId: string;
  workspaceId: string;
  selectionId: string;
  selectionRevision: number;
  operationDigest: string;
  rowCount: number;
  fieldIds: typeof CRM_CSV_FIELD_IDS;
  privacyPolicy: typeof CRM_HANDOFF_EXPORT_CONTRACT.privacyPolicy;
  dataClassification: "synthetic";
  inMemoryMaterializationAuthorized: true;
  externalExportAuthorized: false;
  persistenceAuthorized: false;
  deliveryAuthorized: false;
  downloadAuthorized: false;
  providerInvocationAuthorized: false;
}>;

export type CrmHandoffExportArtifact = Readonly<{
  bytes: Uint8Array;
  validation: CrmHandoffExportValidation;
  manifest: Readonly<{
    schema: typeof CRM_HANDOFF_EXPORT_CONTRACT.artifactSchema;
    csvSchemaVersion: typeof CRM_CSV_SCHEMA_VERSION;
    fieldIds: typeof CRM_CSV_FIELD_IDS;
    privacyPolicy: typeof CRM_HANDOFF_EXPORT_CONTRACT.privacyPolicy;
    dataClassification: "synthetic";
    tenantId: string;
    workspaceId: string;
    selectionId: string;
    selectionRevision: number;
    selectionOperationDigest: string;
    rowCount: number;
    uniqueProspectCount: number;
    byteLength: number;
    csvSha256: string;
    materializationManifestSha256: string;
    artifactSha256: string;
    externalExportAuthorized: false;
    operationalAuthority: false;
  }>;
}>;

export type CrmHandoffExportErrorCode =
  | "crm_handoff_export_input_invalid"
  | "crm_handoff_export_selection_unauthorized"
  | "crm_handoff_export_cross_tenant"
  | "crm_handoff_export_stale"
  | "crm_handoff_export_selection_mismatch"
  | "crm_handoff_export_not_synthetic";

export class CrmHandoffExportError extends Error {
  readonly code: CrmHandoffExportErrorCode;

  constructor(code: CrmHandoffExportErrorCode) {
    super(code);
    this.name = "CrmHandoffExportError";
    this.code = code;
  }
}

const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const ROW_ID_FIELDS = ["prospect_id", "contact_id", "contact_point_id"] as const;

/** Canonical digest an upstream authority must bind into its selection. */
export async function digestCrmHandoffSelection(value: unknown): Promise<string> {
  const draft = normalizeSelectionDraft(value);
  return sha256(JSON.stringify(draft));
}

/** Canonical row digest used by an upstream selection authority. */
export async function digestCrmHandoffExportRow(value: unknown): Promise<string> {
  const rows = normalizeRows([value]);
  return digestRow(rows[0]);
}

/** Validate explicit selection, tenant binding, freshness, and exact row set. */
export async function validateCrmHandoffExportRequest(value: unknown): Promise<CrmHandoffExportValidation> {
  return (await evaluate(value)).validation;
}

/** Build defensive-copy CSV bytes in memory after the complete validation. */
export async function buildCrmHandoffExportArtifact(value: unknown): Promise<CrmHandoffExportArtifact> {
  const accepted = await evaluate(value);
  const selection = accepted.selection;
  const artifact = await materializeCrmHandoff({
    workspaceId: selection.workspaceId,
    snapshotDigest: selection.snapshotDigest,
    exportDefinitionDigest: selection.exportDefinitionDigest,
    configurationDigest: selection.configurationDigest,
    packageDigests: selection.packageDigests,
    selectedAt: selection.authorizedAt,
    rows: accepted.rows,
  });
  const unsignedManifest = {
    schema: CRM_HANDOFF_EXPORT_CONTRACT.artifactSchema,
    csvSchemaVersion: artifact.manifest.csvSchemaVersion,
    fieldIds: CRM_CSV_FIELD_IDS,
    privacyPolicy: CRM_HANDOFF_EXPORT_CONTRACT.privacyPolicy,
    dataClassification: "synthetic" as const,
    tenantId: selection.tenantId,
    workspaceId: selection.workspaceId,
    selectionId: selection.selectionId,
    selectionRevision: selection.selectionRevision,
    selectionOperationDigest: selection.operationDigest,
    rowCount: artifact.manifest.rowCount,
    uniqueProspectCount: artifact.manifest.uniqueProspectCount,
    byteLength: artifact.manifest.byteLength,
    csvSha256: artifact.manifest.csvSha256,
    materializationManifestSha256: artifact.manifest.manifestSha256,
    externalExportAuthorized: false as const,
    operationalAuthority: false as const,
  };
  const manifest = Object.freeze({
    ...unsignedManifest,
    artifactSha256: await sha256(JSON.stringify(unsignedManifest)),
  });
  return Object.freeze({
    get bytes() { return artifact.bytes; },
    validation: accepted.validation,
    manifest,
  });
}

async function evaluate(value: unknown) {
  try {
    const input = exactRecord(value, ["evaluatedAt", "current", "selection", "rows"]);
    const evaluatedAt = isoTime(input.evaluatedAt);
    const current = normalizeCurrent(input.current);
    const selection = normalizeSelection(input.selection);
    const rows = normalizeRows(input.rows);

    if (selection.decision !== "authorized") fail("crm_handoff_export_selection_unauthorized");
    if (selection.dataClassification !== "synthetic") fail("crm_handoff_export_not_synthetic");
    if (selection.tenantId !== current.tenantId || selection.workspaceId !== current.workspaceId) {
      fail("crm_handoff_export_cross_tenant");
    }
    if (
      selection.selectionRevision !== current.selectionRevision
      || selection.authorityRevision !== current.authorityRevision
      || selection.snapshotDigest !== current.snapshotDigest
      || selection.exportDefinitionDigest !== current.exportDefinitionDigest
      || selection.configurationDigest !== current.configurationDigest
    ) fail("crm_handoff_export_stale");

    const now = Date.parse(evaluatedAt);
    const authorizedAt = Date.parse(selection.authorizedAt);
    const expiresAt = Date.parse(selection.expiresAt);
    if (authorizedAt > now || expiresAt <= authorizedAt || now >= expiresAt) {
      fail("crm_handoff_export_stale");
    }
    if (await digestCrmHandoffSelection(withoutOperationDigest(selection)) !== selection.operationDigest) {
      fail("crm_handoff_export_selection_mismatch");
    }

    const selected = new Map(selection.selectedRows.map((row) => [rowIdentity(row), row]));
    if (selected.size !== selection.selectedRows.length || rows.length !== selected.size) {
      fail("crm_handoff_export_selection_mismatch");
    }
    for (const row of rows) {
      if (row.source_workspace_id !== current.workspaceId) fail("crm_handoff_export_cross_tenant");
      assertSyntheticContact(row);
      const prospectId = id(row.prospect_id);
      const contactId = id(row.contact_id);
      const contactPointId = id(row.contact_point_id);
      const reference = selected.get(rowIdentity({
        prospectId,
        contactId,
        contactPointId,
      }));
      if (!reference || reference.rowDigest !== await digestRow(row)) {
        fail("crm_handoff_export_selection_mismatch");
      }
    }

    const validation = Object.freeze({
      kind: "crm_handoff_export_validation" as const,
      accepted: true as const,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      selectionId: selection.selectionId,
      selectionRevision: selection.selectionRevision,
      operationDigest: selection.operationDigest,
      rowCount: rows.length,
      fieldIds: CRM_CSV_FIELD_IDS,
      privacyPolicy: CRM_HANDOFF_EXPORT_CONTRACT.privacyPolicy,
      dataClassification: "synthetic" as const,
      inMemoryMaterializationAuthorized: true as const,
      externalExportAuthorized: false as const,
      persistenceAuthorized: false as const,
      deliveryAuthorized: false as const,
      downloadAuthorized: false as const,
      providerInvocationAuthorized: false as const,
    });
    return { selection, rows, validation };
  } catch (error) {
    if (error instanceof CrmHandoffExportError) throw error;
    throw new CrmHandoffExportError("crm_handoff_export_input_invalid");
  }
}

function normalizeCurrent(value: unknown): CrmHandoffCurrentAuthority {
  const input = exactRecord(value, [
    "tenantId", "workspaceId", "selectionRevision", "authorityRevision", "snapshotDigest",
    "exportDefinitionDigest", "configurationDigest",
  ]);
  return Object.freeze({
    tenantId: id(input.tenantId),
    workspaceId: id(input.workspaceId),
    selectionRevision: revision(input.selectionRevision),
    authorityRevision: revision(input.authorityRevision),
    snapshotDigest: digest(input.snapshotDigest),
    exportDefinitionDigest: digest(input.exportDefinitionDigest),
    configurationDigest: digest(input.configurationDigest),
  });
}

function normalizeSelection(value: unknown): CrmHandoffSelectionAuthorization {
  const input = exactRecord(value, [
    "schema", "decision", "dataClassification", "tenantId", "workspaceId", "selectionId",
    "selectionRevision", "authorityRevision", "snapshotDigest", "exportDefinitionDigest",
    "configurationDigest", "packageDigests", "authorizedAt", "expiresAt", "selectedRows",
    "operationDigest",
  ]);
  const { operationDigest, ...draftInput } = input;
  const draft = normalizeSelectionDraft(draftInput);
  return Object.freeze({ ...draft, operationDigest: digest(operationDigest) });
}

function normalizeSelectionDraft(value: unknown): CrmHandoffSelectionDraft {
  const expected = [
    "schema", "decision", "dataClassification", "tenantId", "workspaceId", "selectionId",
    "selectionRevision", "authorityRevision", "snapshotDigest", "exportDefinitionDigest",
    "configurationDigest", "packageDigests", "authorizedAt", "expiresAt", "selectedRows",
  ];
  const input = exactRecord(value, expected);
  if (input.schema !== CRM_HANDOFF_EXPORT_CONTRACT.selectionSchema || input.decision !== "authorized") {
    fail("crm_handoff_export_selection_unauthorized");
  }
  if (input.dataClassification !== "synthetic") fail("crm_handoff_export_not_synthetic");
  const packageDigests = normalizeUniqueDigests(input.packageDigests);
  const selectedRows = normalizeSelectedRows(input.selectedRows);
  if (selectedRows.length === 0) fail("crm_handoff_export_selection_mismatch");
  return Object.freeze({
    schema: CRM_HANDOFF_EXPORT_CONTRACT.selectionSchema,
    decision: "authorized" as const,
    dataClassification: "synthetic" as const,
    tenantId: id(input.tenantId),
    workspaceId: id(input.workspaceId),
    selectionId: id(input.selectionId),
    selectionRevision: revision(input.selectionRevision),
    authorityRevision: revision(input.authorityRevision),
    snapshotDigest: digest(input.snapshotDigest),
    exportDefinitionDigest: digest(input.exportDefinitionDigest),
    configurationDigest: digest(input.configurationDigest),
    packageDigests,
    authorizedAt: isoTime(input.authorizedAt),
    expiresAt: isoTime(input.expiresAt),
    selectedRows,
  });
}

function normalizeSelectedRows(value: unknown): readonly CrmHandoffSelectionRowRef[] {
  if (!Array.isArray(value)) fail("crm_handoff_export_input_invalid");
  const rows = value.map((entry) => {
    const row = exactRecord(entry, ["prospectId", "contactId", "contactPointId", "rowDigest"]);
    return Object.freeze({
      prospectId: id(row.prospectId),
      contactId: id(row.contactId),
      contactPointId: id(row.contactPointId),
      rowDigest: digest(row.rowDigest),
    });
  }).sort(compareRowRefs);
  return Object.freeze(rows);
}

function normalizeRows(value: unknown): readonly CrmCsvRow[] {
  if (!Array.isArray(value)) fail("crm_handoff_export_input_invalid");
  const rows = value.map((candidate) => {
    const input = exactRecord(candidate, CRM_CSV_FIELD_IDS);
    const row = {} as Record<CrmCsvFieldId, string | null>;
    for (const field of CRM_CSV_FIELD_IDS) {
      const cell = input[field];
      if (cell !== null && typeof cell !== "string") fail("crm_handoff_export_input_invalid");
      row[field] = cell as string | null;
    }
    for (const field of ROW_ID_FIELDS) id(row[field]);
    return Object.freeze(row);
  });
  return Object.freeze(rows);
}

function assertSyntheticContact(row: CrmCsvRow) {
  if (row.contact_kind === "email") {
    if (typeof row.contact_value !== "string" || !/^[^@\s]+@(?:[A-Za-z0-9-]+\.)*example\.test$/u.test(row.contact_value)) {
      fail("crm_handoff_export_not_synthetic");
    }
    return;
  }
  if (row.contact_kind === "phone") {
    if (typeof row.contact_value !== "string" || !/^\+1555\d{7}$/u.test(row.contact_value)) {
      fail("crm_handoff_export_not_synthetic");
    }
    return;
  }
  fail("crm_handoff_export_not_synthetic");
}

async function digestRow(row: CrmCsvRow) {
  return sha256(JSON.stringify(CRM_CSV_FIELD_IDS.map((field) => row[field])));
}

function withoutOperationDigest(selection: CrmHandoffSelectionAuthorization): CrmHandoffSelectionDraft {
  return {
    schema: selection.schema,
    decision: selection.decision,
    dataClassification: selection.dataClassification,
    tenantId: selection.tenantId,
    workspaceId: selection.workspaceId,
    selectionId: selection.selectionId,
    selectionRevision: selection.selectionRevision,
    authorityRevision: selection.authorityRevision,
    snapshotDigest: selection.snapshotDigest,
    exportDefinitionDigest: selection.exportDefinitionDigest,
    configurationDigest: selection.configurationDigest,
    packageDigests: selection.packageDigests,
    authorizedAt: selection.authorizedAt,
    expiresAt: selection.expiresAt,
    selectedRows: selection.selectedRows,
  };
}

function normalizeUniqueDigests(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) fail("crm_handoff_export_input_invalid");
  const values = value.map(digest);
  if (new Set(values).size !== values.length) fail("crm_handoff_export_input_invalid");
  return Object.freeze(values.sort(compareText));
}

function rowIdentity(value: { prospectId: string; contactId: string; contactPointId: string }) {
  return JSON.stringify([value.prospectId, value.contactId, value.contactPointId]);
}

function compareRowRefs(left: CrmHandoffSelectionRowRef, right: CrmHandoffSelectionRowRef) {
  return compareText(left.prospectId, right.prospectId)
    || compareText(left.contactId, right.contactId)
    || compareText(left.contactPointId, right.contactPointId);
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("crm_handoff_export_input_invalid");
  if (Object.getPrototypeOf(value) !== Object.prototype) fail("crm_handoff_export_input_invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) fail("crm_handoff_export_input_invalid");
  const keys = Object.keys(descriptors).sort(compareText);
  if (keys.join("\0") !== [...expectedKeys].sort(compareText).join("\0")) fail("crm_handoff_export_input_invalid");
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("crm_handoff_export_input_invalid");
    output[key] = descriptor.value;
  }
  return output;
}

function id(value: unknown) {
  if (typeof value !== "string" || !ID.test(value)) fail("crm_handoff_export_input_invalid");
  return value;
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail("crm_handoff_export_input_invalid");
  return value;
}

function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail("crm_handoff_export_input_invalid");
  return value as number;
}

function isoTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    fail("crm_handoff_export_input_invalid");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail("crm_handoff_export_input_invalid");
  return value;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => (
    byte.toString(16).padStart(2, "0")
  )).join("");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: CrmHandoffExportErrorCode): never {
  throw new CrmHandoffExportError(code);
}
