/**
 * Offline CRM CSV codec.
 *
 * Traceability: this reproduces the closed schema and byte policies defined by
 * `preparation/phase7-csv-policy-definition.ts` without importing preparation
 * code into runtime. It only validates and encodes caller-supplied rows; it
 * does not read eligibility, persist, deliver, download, or grant authority.
 */

export const CRM_CSV_SCHEMA_VERSION = 1 as const;
export const CRM_CSV_FIELD_IDS = Object.freeze([
  "prospect_id",
  "company_id",
  "product_id",
  "market_play_id",
  "profile_id",
  "account_target",
  "selected_role",
  "contact_id",
  "contact_point_id",
  "contact_kind",
  "contact_value",
  "verification_class",
  "verification_method_ref",
  "verification_time",
  "qualification_score_ref",
  "evidence_refs",
  "offer_ref",
  "package_ref",
  "activity_status",
  "source_workspace_id",
  "source_run_id",
  "export_manifest_ref",
] as const);

export const CRM_CSV_LIMITS = Object.freeze({
  maxRows: 10_000,
  maxCellUtf8Bytes: 32_768,
  maxInputUtf8Bytes: 8 * 1024 * 1024,
  maxOutputUtf8Bytes: 16 * 1024 * 1024,
  maxStableIdUtf8Bytes: 256,
});

export type CrmCsvFieldId = typeof CRM_CSV_FIELD_IDS[number];
export type CrmCsvRow = Readonly<Record<CrmCsvFieldId, string | null>>;
export type CrmCsvCodecErrorCode =
  | "crm_csv_input_invalid"
  | "crm_csv_rows_too_many"
  | "crm_csv_cell_too_large"
  | "crm_csv_input_too_large"
  | "crm_csv_output_too_large"
  | "crm_csv_stable_id_invalid"
  | "crm_csv_duplicate_conflict";

export type EncodedCrmCsv = Readonly<{
  schemaVersion: 1;
  fieldIds: typeof CRM_CSV_FIELD_IDS;
  encoding: "utf-8";
  byteOrderMark: "absent";
  recordSeparator: "crlf";
  mediaType: "text/csv; charset=utf-8";
  rowCount: number;
  uniqueProspectCount: number;
  byteLength: number;
  sha256: string;
  bytes: Uint8Array;
}>;

export class CrmCsvCodecError extends Error {
  readonly code: CrmCsvCodecErrorCode;

  constructor(code: CrmCsvCodecErrorCode) {
    super(code);
    this.name = "CrmCsvCodecError";
    this.code = code;
  }
}

const encoder = new TextEncoder();
const DANGEROUS_FORMULA_PREFIX = /^[=+\-@]/u;
const REQUIRES_QUOTES = /[",\r\n]/u;
const STABLE_ID_FIELDS = ["prospect_id", "contact_id", "contact_point_id"] as const;

/**
 * Validate, deduplicate, canonically sort, and encode closed 22-column rows.
 * Exact duplicate identities collapse; conflicting reuse of the same
 * Prospect/contact-point identity fails closed.
 */
export async function encodeCrmCsv(value: unknown): Promise<EncodedCrmCsv> {
  try {
    const rows = normalizeRows(value);
    const canonicalRows = deduplicateAndSort(rows);
    const lines = [
      CRM_CSV_FIELD_IDS.join(","),
      ...canonicalRows.map((row) => CRM_CSV_FIELD_IDS.map((field) => encodeCell(row[field])).join(",")),
    ];
    const bytes = encoder.encode(`${lines.join("\r\n")}\r\n`);
    if (bytes.byteLength > CRM_CSV_LIMITS.maxOutputUtf8Bytes) {
      invalid("crm_csv_output_too_large");
    }

    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Object.freeze({
      schemaVersion: CRM_CSV_SCHEMA_VERSION,
      fieldIds: CRM_CSV_FIELD_IDS,
      encoding: "utf-8" as const,
      byteOrderMark: "absent" as const,
      recordSeparator: "crlf" as const,
      mediaType: "text/csv; charset=utf-8" as const,
      rowCount: canonicalRows.length,
      uniqueProspectCount: new Set(canonicalRows.map((row) => row.prospect_id)).size,
      byteLength: bytes.byteLength,
      sha256: toHex(new Uint8Array(digest)),
      bytes,
    });
  } catch (error) {
    if (error instanceof CrmCsvCodecError) throw error;
    throw new CrmCsvCodecError("crm_csv_input_invalid");
  }
}

function normalizeRows(value: unknown): CrmCsvRow[] {
  if (!Array.isArray(value)) invalid("crm_csv_input_invalid");
  if (value.length > CRM_CSV_LIMITS.maxRows) invalid("crm_csv_rows_too_many");

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedIndexes = Array.from({ length: value.length }, (_, index) => String(index));
  const actualKeys = Reflect.ownKeys(descriptors);
  if (
    actualKeys.some((key) => typeof key !== "string")
    || !sameKeys(actualKeys as string[], [...expectedIndexes, "length"])
  ) invalid("crm_csv_input_invalid");

  let inputBytes = 0;
  return expectedIndexes.map((index) => {
    const descriptor = descriptors[index];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      invalid("crm_csv_input_invalid");
    }
    const normalized = normalizeRow(descriptor.value);
    for (const field of CRM_CSV_FIELD_IDS) {
      const cell = normalized[field];
      if (cell === null) continue;
      const byteLength = utf8Length(cell);
      if (byteLength > CRM_CSV_LIMITS.maxCellUtf8Bytes) invalid("crm_csv_cell_too_large");
      inputBytes += byteLength;
      if (inputBytes > CRM_CSV_LIMITS.maxInputUtf8Bytes) invalid("crm_csv_input_too_large");
    }
    for (const field of STABLE_ID_FIELDS) {
      const id = normalized[field];
      if (
        typeof id !== "string"
        || id.length === 0
        || utf8Length(id) > CRM_CSV_LIMITS.maxStableIdUtf8Bytes
      ) invalid("crm_csv_stable_id_invalid");
    }
    return normalized;
  });
}

function normalizeRow(value: unknown): CrmCsvRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid("crm_csv_input_invalid");
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid("crm_csv_input_invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string")
    || !sameKeys(keys as string[], CRM_CSV_FIELD_IDS)
  ) invalid("crm_csv_input_invalid");

  const output = {} as Record<CrmCsvFieldId, string | null>;
  for (const field of CRM_CSV_FIELD_IDS) {
    const descriptor = descriptors[field];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      invalid("crm_csv_input_invalid");
    }
    const cell = descriptor.value;
    if (cell !== null && (typeof cell !== "string" || !validUnicode(cell))) {
      invalid("crm_csv_input_invalid");
    }
    output[field] = cell as string | null;
  }
  return Object.freeze(output);
}

function deduplicateAndSort(rows: readonly CrmCsvRow[]) {
  const byIdentity = new Map<string, { row: CrmCsvRow; signature: string }>();
  for (const row of rows) {
    const identity = JSON.stringify([row.prospect_id, row.contact_point_id]);
    const signature = JSON.stringify(CRM_CSV_FIELD_IDS.map((field) => row[field]));
    const existing = byIdentity.get(identity);
    if (existing) {
      if (existing.signature !== signature) invalid("crm_csv_duplicate_conflict");
      continue;
    }
    byIdentity.set(identity, { row, signature });
  }
  return [...byIdentity.values()].map(({ row }) => row).sort((left, right) => (
    compareText(left.prospect_id, right.prospect_id)
    || compareText(left.contact_id, right.contact_id)
    || compareText(left.contact_point_id, right.contact_point_id)
  ));
}

function encodeCell(value: string | null) {
  if (value === null) return "";
  const safe = DANGEROUS_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return REQUIRES_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function sameKeys(actual: readonly string[], expected: readonly string[]) {
  return [...actual].sort(compareText).join("\0") === [...expected].sort(compareText).join("\0");
}

function utf8Length(value: string) {
  return encoder.encode(value).byteLength;
}

function validUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invalid(code: CrmCsvCodecErrorCode): never {
  throw new CrmCsvCodecError(code);
}
