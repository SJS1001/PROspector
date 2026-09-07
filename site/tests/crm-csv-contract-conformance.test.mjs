/**
 * Read-only CRM CSV contract conformance.
 *
 * The Phase 7 preparation policy definition
 * (`preparation/phase7-csv-policy-definition.ts`) and the offline runtime codec
 * (`domain/crm-csv-codec.ts`) deliberately share no import edge. This suite is
 * the only place that binds them: it cross-constructs the policy artifact from
 * the runtime `CRM_CSV_SCHEMA_VERSION`/`CRM_CSV_FIELD_IDS` constants, then
 * proves that every declared policy label is observable in the codec's
 * in-memory bytes.
 *
 * It reads sources and encodes in memory only. It writes, exports, downloads,
 * delivers, and persists nothing, and it claims no phase, plan, runtime,
 * hosted, provider, or effect authority.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const CODEC_URL = new URL("../domain/crm-csv-codec.ts", import.meta.url);
const POLICY_URL = new URL("../preparation/phase7-csv-policy-definition.ts", import.meta.url);
const RUNTIME_DIRECTORIES = ["../app/", "../worker/", "../domain/", "../adapters/", "../db/"];
const RUNTIME_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const NOW = Date.parse("2026-09-07T00:00:00.000Z");
const SORT_KEY_IDS = Object.freeze(["prospect_id", "contact_id", "contact_point_id"]);
const EFFECT_KEYS = Object.freeze([
  "durableMutations",
  "csvSerializations",
  "checksumCalculations",
  "exportMutations",
  "deliveryInvocations",
  "downloadInvocations",
  "providerCalls",
]);
// Absolute references for the canonical artifact and the policy digest,
// derived from these modules. Unlike the relational digest checks elsewhere in
// this suite, they fail when the digest construction or the byte layout changes
// on both sides at once.
const GOLDEN_POLICY_DIGEST = "614f3aa6d41cc1488483de4110098f2ad1d1d34187d96acd3f18fbb0855993d8";
const GOLDEN_ARTIFACT_SHA256 = "c163d3d855825ccaef8a647a11159143c41d5a09b3468b081244b351311cb366";
const GOLDEN_ARTIFACT_BYTE_LENGTH = 1739;
const GOLDEN_HEADER_ONLY_SHA256 = "600e4d660c21cccb8079d814f3dadc3b5340ad2aac227eab979894739d865ad6";
const GOLDEN_HEADER_ONLY_BYTE_LENGTH = 336;
const QUOTE = 0x22;
const COMMA = 0x2c;
const CR = 0x0d;
const LF = 0x0a;
const BOM_BYTES = Object.freeze([0xef, 0xbb, 0xbf]);
const REQUIRES_QUOTES = /["\r\n,]/u;

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      codec: await vite.ssrLoadModule(CODEC_URL.pathname),
      policies: await vite.ssrLoadModule(POLICY_URL.pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

/**
 * Build the preparation policy candidate from the runtime constants. Any
 * runtime schema-version or field-order drift makes this construction reject,
 * which is the parity fence the rest of the suite depends on.
 */
function policyFromRuntime(codec, patch = {}) {
  return {
    id: "synthetic-csv-contract-conformance-v1",
    schemaVersion: codec.CRM_CSV_SCHEMA_VERSION,
    fieldIds: [...codec.CRM_CSV_FIELD_IDS],
    sortKeyIds: [...SORT_KEY_IDS],
    encoding: "utf-8",
    byteOrderMark: "absent",
    recordSeparator: "crlf",
    headerPolicy: "single_header_row",
    quotingPolicy: "rfc4180_double_quote",
    nullPolicy: "empty_field",
    formulaNeutralizationPolicy: "prefix_apostrophe_for_equals_plus_minus_at",
    createdAt: NOW,
    ...patch,
  };
}

function authority(patch = {}) {
  return {
    evaluatedAt: NOW + 1_000,
    schemaCurrent: true,
    fieldOrderCurrent: true,
    sortOrderCurrent: true,
    encodingCurrent: true,
    byteOrderMarkCurrent: true,
    recordSeparatorCurrent: true,
    headerPolicyCurrent: true,
    quotingPolicyCurrent: true,
    nullPolicyCurrent: true,
    formulaNeutralizationCurrent: true,
    externalEffectsDisabled: true,
    ...patch,
  };
}

function row(codec, patch = {}) {
  const candidate = {};
  for (const field of codec.CRM_CSV_FIELD_IDS) candidate[field] = `${field}-synthetic`;
  return {
    ...candidate,
    prospect_id: "prospect-1",
    contact_id: "contact-1",
    contact_point_id: "point-1",
    contact_kind: "email",
    contact_value: "person@example.test",
    offer_ref: null,
    ...patch,
  };
}

/**
 * The fixture the artifact goldens describe. It deliberately spans the cell
 * shapes the byte policies are about: a plain row, one carrying every quoting
 * trigger, and one with a neutralized E.164 value and multibyte text. `row`
 * leaves `offer_ref` null, so the null policy is covered too.
 */
function goldenRows(codec) {
  return [
    row(codec, { prospect_id: "prospect-1", contact_id: "contact-1", contact_point_id: "point-1" }),
    row(codec, {
      prospect_id: "prospect-1",
      contact_id: "contact-2",
      contact_point_id: "point-2",
      account_target: "Northern, Metals",
      selected_role: 'Operations "lead"',
      evidence_refs: "line one\r\nline two",
    }),
    row(codec, {
      prospect_id: "prospect-2",
      contact_id: "contact-1",
      contact_point_id: "point-3",
      contact_kind: "phone",
      contact_value: "+15555550100",
      activity_status: `ready ${String.fromCodePoint(0x2014)} caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x1f680)}`,
    }),
  ];
}

function identity(codec, record) {
  const fields = codec.CRM_CSV_FIELD_IDS;
  return SORT_KEY_IDS.map((key) => record[fields.indexOf(key)].text);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

/**
 * Strict RFC 4180 reader over the raw bytes. It fails on a bare quote, an
 * unterminated quoted field, a lone CR, or a lone LF, so record separation and
 * quoting are verified at the byte layer rather than on decoded text. Each cell
 * is returned with the `quoted` flag actually observed in the bytes.
 */
function readCsvBytes(bytes) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const records = [];
  let record = [];
  let index = 0;
  while (index < bytes.byteLength) {
    const parts = [];
    let quoted = false;
    if (bytes[index] === QUOTE) {
      quoted = true;
      index += 1;
      let start = index;
      for (;;) {
        assert.ok(index < bytes.byteLength, "unterminated quoted field");
        if (bytes[index] !== QUOTE) {
          index += 1;
          continue;
        }
        if (bytes[index + 1] === QUOTE) {
          parts.push(bytes.subarray(start, index + 1));
          index += 2;
          start = index;
          continue;
        }
        parts.push(bytes.subarray(start, index));
        index += 1;
        break;
      }
    } else {
      const start = index;
      while (
        index < bytes.byteLength
        && bytes[index] !== COMMA
        && bytes[index] !== CR
        && bytes[index] !== LF
      ) {
        assert.notEqual(bytes[index], QUOTE, "bare quote inside an unquoted field");
        index += 1;
      }
      parts.push(bytes.subarray(start, index));
    }
    record.push({ text: decoder.decode(concatBytes(parts)), quoted });
    if (index < bytes.byteLength && bytes[index] === COMMA) {
      index += 1;
      continue;
    }
    assert.equal(bytes[index], CR, "a record must end with CR");
    assert.equal(bytes[index + 1], LF, "CR must be followed by LF");
    index += 2;
    records.push(record);
    record = [];
  }
  assert.equal(record.length, 0, "the document must end with a complete record");
  return records;
}

function moduleSpecifiers(source) {
  const specifiers = [];
  for (const pattern of [
    /\bfrom\s*["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']/gu,
    /\brequire\s*\(\s*["']([^"']+)["']/gu,
    /^\s*import\s+["']([^"']+)["']/gmu,
  ]) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

async function runtimeSources() {
  const sources = [];
  for (const directory of RUNTIME_DIRECTORIES) {
    const base = new URL(directory, import.meta.url);
    const names = await readdir(base, { recursive: true });
    for (const name of names) {
      if (!RUNTIME_EXTENSIONS.some((extension) => name.endsWith(extension))) continue;
      sources.push({
        path: `${directory.replace("../", "")}${name}`,
        source: await readFile(new URL(name, base), "utf8"),
      });
    }
  }
  return sources;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((rest) => [value, ...rest]));
}

test("the Phase 7 policy artifact cross-constructs from the runtime schema and field order", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    assert.equal(artifact.snapshot.schemaVersion, codec.CRM_CSV_SCHEMA_VERSION);
    assert.deepEqual([...artifact.snapshot.fieldIds], [...codec.CRM_CSV_FIELD_IDS]);
    assert.deepEqual([...artifact.snapshot.sortKeyIds], [...SORT_KEY_IDS]);
    assert.equal(codec.CRM_CSV_FIELD_IDS.length, 22);
    assert.equal(new Set(codec.CRM_CSV_FIELD_IDS).size, 22);
    assert.equal(Object.isFrozen(codec.CRM_CSV_FIELD_IDS), true);
    for (const key of SORT_KEY_IDS) {
      assert.ok(codec.CRM_CSV_FIELD_IDS.includes(key), `${key} must exist in the runtime schema`);
    }

    const document = await codec.encodeCrmCsv([row(codec)]);
    assert.equal(document.schemaVersion, artifact.snapshot.schemaVersion);
    assert.equal(document.fieldIds, codec.CRM_CSV_FIELD_IDS);
    assert.deepEqual([...document.fieldIds], [...artifact.snapshot.fieldIds]);
  } finally {
    await vite.close();
  }
});

test("runtime schema or field-order drift cannot cross-construct the policy artifact", async () => {
  const { vite, codec, policies } = await load();
  try {
    const fields = [...codec.CRM_CSV_FIELD_IDS];
    const swapped = [...fields];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const moved = [...fields.slice(1), fields[0]];
    for (const [label, patch] of [
      ["schema version drift", { schemaVersion: codec.CRM_CSV_SCHEMA_VERSION + 1 }],
      ["adjacent reorder", { fieldIds: swapped }],
      ["rotated order", { fieldIds: moved }],
      ["dropped field", { fieldIds: fields.slice(0, -1) }],
      ["duplicated field", { fieldIds: [...fields.slice(0, -1), fields[0]] }],
      ["extended field list", { fieldIds: [...fields, "extra_field"] }],
      ["renamed field", { fieldIds: [...fields.slice(0, -1), "manifest_ref"] }],
      ["reordered sort keys", { sortKeyIds: ["contact_id", "prospect_id", "contact_point_id"] }],
      ["truncated sort keys", { sortKeyIds: SORT_KEY_IDS.slice(0, -1) }],
    ]) {
      await assert.rejects(
        policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec, patch)),
        /synthetic_phase7_csv_policy_definition_invalid/u,
        label,
      );
    }
  } finally {
    await vite.close();
  }
});

test("the encoded header row is exactly one unquoted copy of the policy field order", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    const rows = [
      row(codec, { prospect_id: "prospect-1", contact_point_id: "point-1" }),
      row(codec, { prospect_id: "prospect-2", contact_point_id: "point-2" }),
    ];
    const document = await codec.encodeCrmCsv(rows);
    const records = readCsvBytes(document.bytes);
    assert.equal(records.length, document.rowCount + 1);
    assert.equal(artifact.snapshot.headerPolicy, "single_header_row");
    assert.deepEqual(records[0].map((cell) => cell.text), [...artifact.snapshot.fieldIds]);
    assert.deepEqual(records[0].map((cell) => cell.quoted), records[0].map(() => false));
    for (const record of records) {
      assert.equal(record.length, artifact.snapshot.fieldIds.length, "closed column count");
    }
    const headerLine = `${[...artifact.snapshot.fieldIds].join(",")}\r\n`;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(document.bytes);
    assert.equal(text.startsWith(headerLine), true);
    assert.equal(text.indexOf(headerLine), text.lastIndexOf(headerLine), "no repeated header row");

    const empty = await codec.encodeCrmCsv([]);
    assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(empty.bytes), headerLine);
    assert.equal(readCsvBytes(empty.bytes).length, 1);
  } finally {
    await vite.close();
  }
});

test("canonical output order follows the declared sort keys and nothing else", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    assert.deepEqual([...artifact.snapshot.sortKeyIds], ["prospect_id", "contact_id", "contact_point_id"]);

    // Row identity is Prospect plus contact point, so every pair here is
    // distinct while the Contact tie-break still separates `point-4` from
    // `point-5`: sorting by contact point before Contact would reorder them.
    const triples = [
      ["prospect-2", "contact-1", "point-1"],
      ["prospect-1", "contact-2", "point-4"],
      ["prospect-1", "contact-1", "point-3"],
      ["prospect-1", "contact-1", "point-1"],
      ["prospect-1", "contact-1", "point-5"],
    ];
    const rows = triples.map(([prospectId, contactId, pointId], index) => row(codec, {
      prospect_id: prospectId,
      contact_id: contactId,
      contact_point_id: pointId,
      // Non-sort labels deliberately run counter to the canonical order.
      company_id: `company-${triples.length - index}`,
      account_target: `zeta-${index}`,
      source_run_id: `run-${triples.length - index}`,
    }));
    const canonical = await codec.encodeCrmCsv(rows);
    assert.deepEqual(readCsvBytes(canonical.bytes).slice(1).map((record) => identity(codec, record)), [
      ["prospect-1", "contact-1", "point-1"],
      ["prospect-1", "contact-1", "point-3"],
      ["prospect-1", "contact-1", "point-5"],
      ["prospect-1", "contact-2", "point-4"],
      ["prospect-2", "contact-1", "point-1"],
    ]);
    for (const permutation of permutations(rows)) {
      const shuffled = await codec.encodeCrmCsv(permutation);
      assert.deepEqual(shuffled.bytes, canonical.bytes, "input order must not change the bytes");
      assert.equal(shuffled.sha256, canonical.sha256);
    }

    // Reassigning every non-sort-key cell must not move a row.
    const relabelled = rows.map((candidate, index) => ({
      ...candidate,
      company_id: `company-${index}`,
      account_target: `alpha-${triples.length - index}`,
      source_run_id: `run-${index}`,
    }));
    assert.deepEqual(
      readCsvBytes((await codec.encodeCrmCsv(relabelled)).bytes).slice(1).map((record) => identity(codec, record)),
      readCsvBytes(canonical.bytes).slice(1).map((record) => identity(codec, record)),
    );

    // Ordering is by code unit, not locale collation.
    const collation = await codec.encodeCrmCsv([
      row(codec, { prospect_id: "prospect-a", contact_point_id: "point-a" }),
      row(codec, { prospect_id: "prospect-B", contact_point_id: "point-b" }),
      row(codec, { prospect_id: `prospect-${String.fromCodePoint(0xe9)}`, contact_point_id: "point-c" }),
      row(codec, { prospect_id: "prospect-z", contact_point_id: "point-d" }),
    ]);
    assert.deepEqual(
      readCsvBytes(collation.bytes).slice(1).map((record) => identity(codec, record)[0]),
      ["prospect-B", "prospect-a", "prospect-z", `prospect-${String.fromCodePoint(0xe9)}`],
    );

    // Documented boundary: comparison is UTF-16 code-unit order, so a
    // supplementary-plane ID sorts before U+FFFD rather than after it.
    const astral = await codec.encodeCrmCsv([
      row(codec, { prospect_id: `prospect-${String.fromCodePoint(0xfffd)}`, contact_point_id: "point-a" }),
      row(codec, { prospect_id: `prospect-${String.fromCodePoint(0x10000)}`, contact_point_id: "point-b" }),
    ]);
    assert.deepEqual(
      readCsvBytes(astral.bytes).slice(1).map((record) => identity(codec, record)[2]),
      ["point-b", "point-a"],
    );
  } finally {
    await vite.close();
  }
});

test("declared encoding, byte-order-mark, and record-separator labels hold in the bytes", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    assert.equal(artifact.snapshot.encoding, "utf-8");
    assert.equal(artifact.snapshot.byteOrderMark, "absent");
    assert.equal(artifact.snapshot.recordSeparator, "crlf");

    const multibyte = `caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x1f680)} ${String.fromCodePoint(0x4e2d)}`;
    const rows = [
      row(codec, { prospect_id: "prospect-1", contact_point_id: "point-1", account_target: multibyte }),
      row(codec, { prospect_id: "prospect-2", contact_point_id: "point-2", evidence_refs: "line one\r\nline two" }),
    ];
    const document = await codec.encodeCrmCsv(rows);
    const bytes = document.bytes;

    assert.equal(document.encoding, artifact.snapshot.encoding);
    assert.equal(document.byteOrderMark, artifact.snapshot.byteOrderMark);
    assert.equal(document.recordSeparator, artifact.snapshot.recordSeparator);
    assert.equal(document.mediaType, "text/csv; charset=utf-8");
    assert.equal(document.byteLength, bytes.byteLength);

    // UTF-8: strict decode round-trips, and the encoder emits nothing else.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assert.deepEqual(bytes, new TextEncoder().encode(text));
    assert.equal(text.includes(multibyte), true);

    // No byte-order mark anywhere: not at the head, and never inside a cell the
    // caller did not supply one for.
    assert.notDeepEqual([...bytes.subarray(0, 3)], [...BOM_BYTES]);
    assert.equal(text.startsWith(String.fromCodePoint(0xfeff)), false);
    assert.equal(text.includes(String.fromCodePoint(0xfeff)), false);

    // CRLF: every top-level separator is CRLF, the file ends with CRLF, and the
    // only bare LF bytes are the ones the caller put inside a quoted cell.
    const records = readCsvBytes(bytes);
    assert.equal(bytes[bytes.byteLength - 2], CR);
    assert.equal(bytes[bytes.byteLength - 1], LF);
    let crlfCount = 0;
    for (let index = 0; index + 1 < bytes.byteLength; index += 1) {
      if (bytes[index] === CR && bytes[index + 1] === LF) crlfCount += 1;
    }
    assert.equal(crlfCount, records.length + 1, "one CRLF per record plus the quoted embedded pair");
    assert.equal(text.split("\r\n").length - 1, crlfCount);
    assert.equal(text.replaceAll("\r\n", "").includes("\n"), false, "no lone LF");
    assert.equal(text.replaceAll("\r\n", "").includes("\r"), false, "no lone CR");
  } finally {
    await vite.close();
  }
});

test("declared quoting and null labels hold as minimal RFC 4180 quoting in the bytes", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    assert.equal(artifact.snapshot.quotingPolicy, "rfc4180_double_quote");
    assert.equal(artifact.snapshot.nullPolicy, "empty_field");

    const fields = codec.CRM_CSV_FIELD_IDS;
    const candidate = row(codec, {
      account_target: "Northern, Metals",
      selected_role: `Operations "lead"`,
      evidence_refs: "line one\r\nline two",
      verification_method_ref: "plain-value",
      offer_ref: null,
      package_ref: "",
    });
    const document = await codec.encodeCrmCsv([candidate]);
    const [, record] = readCsvBytes(document.bytes);

    const cell = (field) => record[fields.indexOf(field)];
    assert.deepEqual(cell("account_target"), { text: "Northern, Metals", quoted: true });
    assert.deepEqual(cell("selected_role"), { text: `Operations "lead"`, quoted: true });
    assert.deepEqual(cell("evidence_refs"), { text: "line one\r\nline two", quoted: true });
    assert.deepEqual(cell("verification_method_ref"), { text: "plain-value", quoted: false });

    // The escape is a doubled quote, not a backslash.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(document.bytes);
    assert.equal(text.includes(`"Operations ""lead"""`), true);
    assert.equal(text.includes("\\"), false);

    // Quoting is minimal: exactly the cells that need it are quoted.
    for (const [index, current] of record.entries()) {
      assert.equal(
        current.quoted,
        REQUIRES_QUOTES.test(current.text),
        `${fields[index]} quoting must be minimal`,
      );
    }

    // Null is an empty, unquoted field, byte-identical to the empty string.
    assert.deepEqual(cell("offer_ref"), { text: "", quoted: false });
    assert.deepEqual(cell("package_ref"), { text: "", quoted: false });
    const nulled = await codec.encodeCrmCsv([row(codec, { offer_ref: null })]);
    const emptied = await codec.encodeCrmCsv([row(codec, { offer_ref: "" })]);
    assert.deepEqual(nulled.bytes, emptied.bytes, "empty_field makes null and \"\" indistinguishable");
    assert.equal(nulled.sha256, emptied.sha256);
  } finally {
    await vite.close();
  }
});

test("whitespace, control, and byte-order-mark formula vectors neutralize before quoting", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    assert.equal(
      artifact.snapshot.formulaNeutralizationPolicy,
      "prefix_apostrophe_for_equals_plus_minus_at",
    );

    const cp = (code) => String.fromCodePoint(code);
    const leaders = [
      ["none", ""],
      ["tab", cp(0x09)],
      ["line feed", cp(0x0a)],
      ["vertical tab", cp(0x0b)],
      ["form feed", cp(0x0c)],
      ["carriage return", cp(0x0d)],
      ["space", cp(0x20)],
      ["C0 control", cp(0x01)],
      ["escape", cp(0x1b)],
      ["delete", cp(0x7f)],
      ["next line", cp(0x85)],
      ["no-break space", cp(0xa0)],
      ["ogham space mark", cp(0x1680)],
      ["en quad", cp(0x2000)],
      ["narrow no-break space", cp(0x202f)],
      ["line separator", cp(0x2028)],
      ["paragraph separator", cp(0x2029)],
      ["ideographic space", cp(0x3000)],
      ["byte-order mark", cp(0xfeff)],
      ["mixed run", `${cp(0xfeff)}${cp(0x20)}${cp(0x09)}${cp(0x01)}${cp(0xa0)}`],
    ];
    const payloads = ["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd"];
    const vectors = leaders.flatMap(([label, leader]) => payloads.map((payload) => ({
      label: `${label} ${payload}`,
      value: `${leader}${payload}`,
    })));
    const fields = codec.CRM_CSV_FIELD_IDS;
    const rows = vectors.map((vector, index) => row(codec, {
      prospect_id: `prospect-formula-${String(index).padStart(3, "0")}`,
      contact_point_id: `point-formula-${String(index).padStart(3, "0")}`,
      contact_value: vector.value,
    }));
    const records = readCsvBytes((await codec.encodeCrmCsv(rows)).bytes).slice(1);
    assert.equal(records.length, vectors.length);
    for (const [index, vector] of vectors.entries()) {
      const cell = records[index][fields.indexOf("contact_value")];
      assert.equal(cell.text, `'${vector.value}`, vector.label);
      assert.equal(cell.text.startsWith("'"), true, `${vector.label} apostrophe precedes the leader`);
      assert.equal(cell.text.slice(1), vector.value, `${vector.label} preserves the exact value`);
      assert.equal(cell.quoted, REQUIRES_QUOTES.test(cell.text), `${vector.label} quoting`);
    }

    // Neutralization happens first, then quoting escapes the result.
    const combined = await codec.encodeCrmCsv([row(codec, { contact_value: `=a"b,c` })]);
    const combinedText = new TextDecoder("utf-8", { fatal: true }).decode(combined.bytes);
    assert.equal(combinedText.includes(`"'=a""b,c"`), true);
    const [, combinedRecord] = readCsvBytes(combined.bytes);
    assert.deepEqual(
      combinedRecord[fields.indexOf("contact_value")],
      { text: `'=a"b,c`, quoted: true },
    );

    // The neutralized class is exactly whitespace, C0/C1 controls, and U+FEFF.
    // Values outside it, and values that merely contain a trigger character,
    // are emitted unchanged.
    const untouched = [
      ["plain text", "person@example.test"],
      ["interior equals", "a=1"],
      ["interior minus", "0-1"],
      ["leading apostrophe", "'=1+1"],
      ["zero-width space", `${cp(0x200b)}=1+1`],
      ["left-to-right mark", `${cp(0x200e)}=1+1`],
      ["soft hyphen", `${cp(0xad)}=1+1`],
      ["word joiner", `${cp(0x2060)}=1+1`],
    ];
    const untouchedRows = untouched.map(([label, value], index) => row(codec, {
      prospect_id: `prospect-plain-${index}`,
      contact_point_id: `point-plain-${index}`,
      selected_role: label,
      contact_value: value,
    }));
    const untouchedRecords = readCsvBytes((await codec.encodeCrmCsv(untouchedRows)).bytes).slice(1);
    for (const [index, [label, value]] of untouched.entries()) {
      const cell = untouchedRecords[index][fields.indexOf("contact_value")];
      assert.equal(cell.text, value, label);
      assert.equal(cell.text.startsWith("'="), value.startsWith("'="), `${label} gains no prefix`);
    }
  } finally {
    await vite.close();
  }
});

test("E.164 leading-plus contact values stay exact neutralized text", async () => {
  const { vite, codec } = await load();
  try {
    const fields = codec.CRM_CSV_FIELD_IDS;
    const cases = [
      ["bare E.164", "+14165550123", "'+14165550123", false],
      ["longest E.164", "+123456789012345", "'+123456789012345", false],
      ["spaced E.164", "+1 416 555 0123", "'+1 416 555 0123", false],
      ["leading space", " +14165550123", "' +14165550123", false],
      ["extension with comma", "+14165550123,ext 42", "'+14165550123,ext 42", true],
      ["quoted label", `+14165550123 "mobile"`, `'+14165550123 "mobile"`, true],
      ["scheme prefix", "tel:+14165550123", "tel:+14165550123", false],
      ["national digits", "14165550123", "14165550123", false],
    ];
    const rows = cases.map(([, value], index) => row(codec, {
      prospect_id: `prospect-phone-${index}`,
      contact_point_id: `point-phone-${index}`,
      contact_kind: "phone",
      contact_value: value,
    }));
    const records = readCsvBytes((await codec.encodeCrmCsv(rows)).bytes).slice(1);
    for (const [index, [label, value, expected, quoted]] of cases.entries()) {
      const cell = records[index][fields.indexOf("contact_value")];
      assert.equal(cell.text, expected, label);
      assert.equal(cell.quoted, quoted, `${label} quoting`);
      assert.equal(records[index][fields.indexOf("contact_kind")].text, "phone", label);
      const recovered = value.startsWith("+") || value.startsWith(" +") ? cell.text.slice(1) : cell.text;
      assert.equal(recovered, value, `${label} recovers the exact supplied value`);
      assert.equal(
        cell.text.replace(/[^0-9]/gu, ""),
        value.replace(/[^0-9]/gu, ""),
        `${label} loses no digit`,
      );
    }
  } finally {
    await vite.close();
  }
});

test("duplicate identity collapses only on an exact repeat and every conflict fails closed", async () => {
  const { vite, codec } = await load();
  try {
    const base = row(codec, { prospect_id: "prospect-1", contact_id: "contact-1", contact_point_id: "point-1" });
    const single = await codec.encodeCrmCsv([base]);
    const repeated = await codec.encodeCrmCsv([base, { ...base }, { ...base }]);
    assert.deepEqual(repeated.bytes, single.bytes, "an exact repeat collapses");
    assert.equal(repeated.rowCount, 1);
    assert.equal(repeated.uniqueProspectCount, 1);

    // Row identity is exactly the Prospect plus contact-point pair.
    for (const [label, patch, expectedRows, expectedProspects] of [
      ["new contact point", { contact_point_id: "point-2" }, 2, 1],
      ["new Prospect", { prospect_id: "prospect-2" }, 2, 2],
    ]) {
      const document = await codec.encodeCrmCsv([base, { ...base, ...patch }]);
      assert.equal(document.rowCount, expectedRows, label);
      assert.equal(document.uniqueProspectCount, expectedProspects, label);
    }

    // Any other differing field on the same identity is a conflict, including
    // `contact_id`, which is a sort key but not part of row identity.
    for (const field of codec.CRM_CSV_FIELD_IDS) {
      if (field === "prospect_id" || field === "contact_point_id") continue;
      await assert.rejects(
        codec.encodeCrmCsv([base, { ...base, [field]: "conflicting-value" }]),
        (error) => error?.code === "crm_csv_duplicate_conflict"
          && error?.name === "CrmCsvCodecError"
          && error instanceof codec.CrmCsvCodecError,
        `${field} conflict`,
      );
    }

    // Null and empty string encode to identical bytes but remain distinct row
    // semantics, so reusing one identity for both fails closed.
    await assert.rejects(
      codec.encodeCrmCsv([{ ...base, offer_ref: null }, { ...base, offer_ref: "" }]),
      (error) => error?.code === "crm_csv_duplicate_conflict",
      "null versus empty string conflict",
    );

    // A conflict rejects before any document exists and leaves no residue.
    await assert.rejects(
      codec.encodeCrmCsv([base, { ...base, contact_value: "other@example.test" }]),
      (error) => error?.code === "crm_csv_duplicate_conflict",
    );
    const after = await codec.encodeCrmCsv([base]);
    assert.deepEqual(after.bytes, single.bytes);
    assert.equal(after.sha256, single.sha256);
  } finally {
    await vite.close();
  }
});

test("a runtime-derived policy decision is current while every authority stays false", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    const decision = await policies.evaluateSyntheticCsvPolicyDefinition({
      candidate: artifact,
      currentCandidate: policyFromRuntime(codec),
      currentAuthority: authority(),
    });
    assert.equal(decision.status, "synthetic_csv_policy_definition_current_no_authority");
    assert.deepEqual([...decision.reasonCodes], []);
    assert.equal(decision.currentDefinitionClaimed, true);
    assert.equal(decision.schemaVersion, codec.CRM_CSV_SCHEMA_VERSION);
    assert.deepEqual([...decision.fieldIds], [...codec.CRM_CSV_FIELD_IDS]);

    // Producing real bytes in this process changes no preparation authority.
    await codec.encodeCrmCsv([row(codec)]);
    for (const subject of [artifact, decision]) {
      assert.equal(Object.isFrozen(subject), true);
      assert.equal(Object.isFrozen(subject.effects), true);
      assert.deepEqual(Object.keys(subject.effects).sort(), [...EFFECT_KEYS].sort());
      for (const [key, value] of Object.entries(subject.effects)) {
        assert.equal(value, 0, `${key} must stay zero`);
      }
      for (const [key, value] of Object.entries(subject)) {
        if (key.endsWith("Authorized")) assert.equal(value, false, `${key} must stay false`);
        if (key.endsWith("Claimed") && key !== "currentDefinitionClaimed") {
          assert.equal(value, false, `${key} must stay false`);
        }
      }
    }
    assert.equal(
      artifact.digest,
      (await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec))).digest,
      "encoding must not change the policy digest",
    );

    // Each declared-policy authority predicate still fails independently.
    for (const [reason, patch] of [
      ["csv_schema_not_current", { schemaCurrent: false }],
      ["csv_field_order_not_current", { fieldOrderCurrent: false }],
      ["csv_sort_order_not_current", { sortOrderCurrent: false }],
      ["csv_encoding_not_current", { encodingCurrent: false }],
      ["csv_byte_order_mark_not_current", { byteOrderMarkCurrent: false }],
      ["csv_record_separator_not_current", { recordSeparatorCurrent: false }],
      ["csv_header_policy_not_current", { headerPolicyCurrent: false }],
      ["csv_quoting_policy_not_current", { quotingPolicyCurrent: false }],
      ["csv_null_policy_not_current", { nullPolicyCurrent: false }],
      ["csv_formula_neutralization_not_current", { formulaNeutralizationCurrent: false }],
      ["external_effects_not_disabled", { externalEffectsDisabled: false }],
    ]) {
      const rejected = await policies.evaluateSyntheticCsvPolicyDefinition({
        candidate: artifact,
        currentCandidate: policyFromRuntime(codec),
        currentAuthority: authority(patch),
      });
      assert.equal(rejected.status, "synthetic_csv_policy_definition_rejected", reason);
      assert.equal(rejected.reasonCodes.includes(reason), true, reason);
      assert.equal(rejected.currentDefinitionClaimed, false, reason);
      for (const value of Object.values(rejected.effects)) assert.equal(value, 0, reason);
    }
  } finally {
    await vite.close();
  }
});

test("the policy artifact carries no row, byte, or checksum material from the codec", async () => {
  const { vite, codec, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    const document = await codec.encodeCrmCsv([row(codec)]);
    for (const key of ["bytes", "sha256", "byteLength", "rows", "rowCount", "checksum", "mediaType"]) {
      assert.equal(Object.hasOwn(artifact, key), false, `artifact must not expose ${key}`);
      assert.equal(Object.hasOwn(artifact.snapshot, key), false, `snapshot must not expose ${key}`);
    }
    const serialized = JSON.stringify(artifact);
    assert.equal(serialized.includes(document.sha256), false, "no CSV checksum leaks into the artifact");
    assert.equal(serialized.includes("person@example.test"), false, "no contact value leaks");
    assert.equal(serialized.includes("prospect-1"), false, "no row identity leaks");
    assert.notEqual(artifact.digest, document.sha256, "policy digest is not a CSV checksum");
    assert.equal(artifact.digest.length, 64);
    assert.equal(document.sha256.length, 64);
  } finally {
    await vite.close();
  }
});

test("the pinned policy digest and canonical artifact bytes have not moved", async () => {
  const { vite, codec, policies } = await load();
  try {
    // Every other digest assertion in this suite is relational: it compares a
    // value against another freshly computed one. That cannot see a change to
    // the digest construction itself — swapping the hash, reordering the
    // snapshot serialization, or altering how a cell becomes bytes moves both
    // sides together and stays green. These two constants are the absolute
    // reference the relational checks lack.
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(policyFromRuntime(codec));
    assert.equal(
      artifact.digest,
      GOLDEN_POLICY_DIGEST,
      "policy digest moved: a declared label, the snapshot shape, or the digest construction changed",
    );

    const document = await codec.encodeCrmCsv(goldenRows(codec));
    assert.equal(
      document.sha256,
      GOLDEN_ARTIFACT_SHA256,
      "canonical CSV bytes moved: check field order, quoting, null encoding, or the record terminator",
    );
    assert.equal(document.byteLength, GOLDEN_ARTIFACT_BYTE_LENGTH);
    assert.equal(document.rowCount, 3);
    assert.equal(document.uniqueProspectCount, 2);

    // The golden must describe the canonical artifact, not one input order.
    const reversed = await codec.encodeCrmCsv([...goldenRows(codec)].reverse());
    assert.equal(reversed.sha256, GOLDEN_ARTIFACT_SHA256);

    // The header-only document pins the field order and the trailing terminator
    // on their own, with no cell content in the way.
    const empty = await codec.encodeCrmCsv([]);
    assert.equal(empty.sha256, GOLDEN_HEADER_ONLY_SHA256, "the header row itself moved");
    assert.equal(empty.byteLength, GOLDEN_HEADER_ONLY_BYTE_LENGTH);

    // The goldens are only meaningful if they are the real digests of the real
    // bytes, so recompute one independently of the codec's own reporting.
    const recomputed = new Uint8Array(await crypto.subtle.digest("SHA-256", document.bytes));
    assert.equal(
      Array.from(recomputed, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      GOLDEN_ARTIFACT_SHA256,
    );
  } finally {
    await vite.close();
  }
});

test("the codec stays offline and no runtime module imports preparation code", async () => {
  const codecSource = await readFile(CODEC_URL, "utf8");
  const policySource = await readFile(POLICY_URL, "utf8");

  // The codec's no-import invariant, restated so this suite fails if it weakens.
  assert.equal(/^import\s/mu.test(codecSource), false, "the codec must declare no import");
  assert.deepEqual(moduleSpecifiers(codecSource), []);
  for (const forbidden of [
    "fetch(",
    "node:",
    "process.env",
    "import.meta.env",
    "localStorage",
    "createObjectURL",
    "Content-Disposition",
    "new Response(",
    "new Blob(",
    "Buffer.from",
    "D1Database",
    "R2Bucket",
    "writeFile",
    "INSERT INTO",
    "mailto:",
    "googleapis",
  ]) assert.equal(codecSource.includes(forbidden), false, `codec must not reference ${forbidden}`);
  assert.equal(/\b(?:download|deliver|persist|export)\w*\s*\(/u.test(codecSource), false);

  // The preparation policy must not reach into runtime code either.
  for (const specifier of moduleSpecifiers(policySource)) {
    assert.equal(/domain|adapters|worker|app\//u.test(specifier), false, specifier);
  }

  const sources = await runtimeSources();
  assert.ok(sources.length > 0, "the runtime scan must find files");
  assert.ok(
    sources.some(({ path }) => path === "domain/crm-csv-codec.ts"),
    "the runtime scan must cover the codec",
  );
  for (const { path, source } of sources) {
    for (const specifier of moduleSpecifiers(source)) {
      assert.equal(
        /(?:^|\/)preparation(?:\/|$)/u.test(specifier),
        false,
        `${path} must not import ${specifier}`,
      );
    }
  }
});
