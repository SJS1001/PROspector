import { CRM_CSV_FIELD_IDS, CRM_CSV_SCHEMA_VERSION, encodeCrmCsv, type CrmCsvRow } from "./crm-csv-codec";

export type CrmHandoffArtifactInput = Readonly<{
  workspaceId: string;
  snapshotDigest: string;
  exportDefinitionDigest: string;
  configurationDigest: string;
  packageDigests: readonly string[];
  selectedAt: string;
  rows: readonly CrmCsvRow[];
}>;

export type CrmHandoffArtifact = Readonly<{
  bytes: Uint8Array;
  manifest: Readonly<{
    schema: "prospector/crm-handoff-manifest/v1";
    csvSchemaVersion: typeof CRM_CSV_SCHEMA_VERSION;
    fieldIds: typeof CRM_CSV_FIELD_IDS;
    workspaceId: string;
    snapshotDigest: string;
    exportDefinitionDigest: string;
    configurationDigest: string;
    packageDigests: readonly string[];
    selectedAt: string;
    rowCount: number;
    uniqueProspectCount: number;
    byteLength: number;
    csvSha256: string;
    manifestSha256: string;
    operationalAuthority: false;
  }>;
}>;

const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;

/** Pure materialization only. It has no persistence, delivery, or provider port. */
export async function materializeCrmHandoff(input: CrmHandoffArtifactInput): Promise<CrmHandoffArtifact> {
  if (!plainExact(input, ["workspaceId", "snapshotDigest", "exportDefinitionDigest", "configurationDigest", "packageDigests", "selectedAt", "rows"])) throw new Error("crm_handoff_manifest_invalid");
  if (!ID.test(input.workspaceId) || !validTime(input.selectedAt)) throw new Error("crm_handoff_manifest_invalid");
  if (!Array.isArray(input.packageDigests) || input.packageDigests.length === 0 || new Set(input.packageDigests).size !== input.packageDigests.length) throw new Error("crm_handoff_manifest_invalid");
  const digests = [input.snapshotDigest, input.exportDefinitionDigest, input.configurationDigest, ...input.packageDigests];
  if (!digests.every((value) => DIGEST.test(value))) throw new Error("crm_handoff_manifest_invalid");
  if (!Array.isArray(input.rows) || input.rows.some((row) => row?.source_workspace_id !== input.workspaceId)) {
    throw new Error("crm_handoff_manifest_invalid");
  }
  const packageDigests = Object.freeze([...new Set(input.packageDigests)].sort());
  const csv = await encodeCrmCsv(input.rows);
  const unsigned = {
    schema: "prospector/crm-handoff-manifest/v1" as const,
    csvSchemaVersion: CRM_CSV_SCHEMA_VERSION,
    fieldIds: CRM_CSV_FIELD_IDS,
    workspaceId: input.workspaceId,
    snapshotDigest: input.snapshotDigest,
    exportDefinitionDigest: input.exportDefinitionDigest,
    configurationDigest: input.configurationDigest,
    packageDigests,
    selectedAt: input.selectedAt,
    rowCount: csv.rowCount,
    uniqueProspectCount: csv.uniqueProspectCount,
    byteLength: csv.byteLength,
    csvSha256: csv.sha256,
    operationalAuthority: false as const,
  };
  const manifestSha256 = await sha256(new TextEncoder().encode(JSON.stringify(unsigned)));
  return Object.freeze({
    get bytes() { return csv.bytes; },
    manifest: Object.freeze({ ...unsigned, manifestSha256 }),
  });
}

function validTime(value: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function plainExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => typeof key === "string")
    && Object.keys(descriptors).sort().join("\0") === [...keys].sort().join("\0")
    && Object.values(descriptors).every((descriptor) => "value" in descriptor);
}

async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
