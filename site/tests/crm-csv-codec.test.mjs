import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      codec: await vite.ssrLoadModule(new URL("../domain/crm-csv-codec.ts", import.meta.url).pathname),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function row(patch = {}) {
  return {
    prospect_id: "prospect-2",
    company_id: "company-synthetic",
    product_id: "product-synthetic",
    market_play_id: "market-play-synthetic",
    profile_id: "profile-synthetic",
    account_target: "Northern, Metals",
    selected_role: "Operations \"lead\"",
    contact_id: "contact-2",
    contact_point_id: "contact-point-2",
    contact_kind: "email",
    contact_value: "person@example.test",
    verification_class: "mailbox_verified",
    verification_method_ref: "verification-synthetic",
    verification_time: "2026-09-04T12:00:00.000Z",
    qualification_score_ref: "score-synthetic",
    evidence_refs: "line one\r\nline two",
    offer_ref: null,
    package_ref: "package-synthetic",
    activity_status: "ready — café 🚀",
    source_workspace_id: "workspace-synthetic",
    source_run_id: "run-synthetic",
    export_manifest_ref: "manifest-synthetic",
    ...patch,
  };
}

function decode(document) {
  return new TextDecoder("utf-8", { fatal: true }).decode(document.bytes);
}

function parseCsv(text) {
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\r" && text[index + 1] === "\n") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      index += 1;
    } else {
      cell += character;
    }
  }
  assert.equal(quoted, false);
  assert.equal(record.length, 0);
  assert.equal(cell, "");
  return records;
}

test("encodes the exact 22-column UTF-8 CRLF RFC 4180 policy", async () => {
  const { vite, codec } = await load();
  try {
    const document = await codec.encodeCrmCsv([row()]);
    const text = decode(document);
    const records = parseCsv(text);
    assert.deepEqual(records[0], codec.CRM_CSV_FIELD_IDS);
    assert.equal(records.length, 2);
    assert.equal(records[1].length, 22);
    assert.equal(records[1][5], "Northern, Metals");
    assert.equal(records[1][6], 'Operations "lead"');
    assert.equal(records[1][15], "line one\r\nline two");
    assert.equal(records[1][16], "");
    assert.equal(records[1][18], "ready — café 🚀");
    assert.equal(text.startsWith("\ufeff"), false);
    assert.equal(text.endsWith("\r\n"), true);
    assert.equal(text.replaceAll("\r\n", "").includes("\n"), false, "only embedded quoted LF remains");
    assert.equal(document.encoding, "utf-8");
    assert.equal(document.byteOrderMark, "absent");
    assert.equal(document.recordSeparator, "crlf");
    assert.equal(document.schemaVersion, 1);
  } finally {
    await vite.close();
  }
});

test("neutralizes every dangerous formula prefix before RFC 4180 quoting", async () => {
  const { vite, codec } = await load();
  try {
    const prefixes = ["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd,now"];
    const rows = prefixes.map((contactValue, index) => row({
      prospect_id: `prospect-formula-${index}`,
      contact_id: `contact-formula-${index}`,
      contact_point_id: `contact-point-formula-${index}`,
      contact_value: contactValue,
    }));
    const records = parseCsv(decode(await codec.encodeCrmCsv(rows)));
    assert.deepEqual(records.slice(1).map((record) => record[10]), prefixes.map((value) => `'${value}`));
  } finally {
    await vite.close();
  }
});

test("sorts deterministically, collapses only exact identity repeats, and keeps Prospect counts distinct", async () => {
  const { vite, codec } = await load();
  try {
    const a1 = row({ prospect_id: "prospect-a", contact_id: "contact-b", contact_point_id: "point-2" });
    const a2 = row({ prospect_id: "prospect-a", contact_id: "contact-a", contact_point_id: "point-1" });
    const b1 = row({ prospect_id: "prospect-b", contact_id: "contact-a", contact_point_id: "point-3" });
    const shuffled = await codec.encodeCrmCsv([b1, a1, a2, { ...a1 }]);
    const canonical = await codec.encodeCrmCsv([a2, a1, b1]);
    assert.deepEqual(shuffled.bytes, canonical.bytes);
    assert.equal(shuffled.sha256, canonical.sha256);
    assert.equal(shuffled.rowCount, 3);
    assert.equal(shuffled.uniqueProspectCount, 2);
    const records = parseCsv(decode(shuffled));
    assert.deepEqual(records.slice(1).map((record) => [record[0], record[7], record[8]]), [
      ["prospect-a", "contact-a", "point-1"],
      ["prospect-a", "contact-b", "point-2"],
      ["prospect-b", "contact-a", "point-3"],
    ]);
    await assert.rejects(
      codec.encodeCrmCsv([a1, { ...a1, contact_value: "changed@example.test" }]),
      (error) => error?.code === "crm_csv_duplicate_conflict",
    );
  } finally {
    await vite.close();
  }
});

test("hashes the exact returned bytes and emits a deterministic empty document", async () => {
  const { vite, codec } = await load();
  try {
    const document = await codec.encodeCrmCsv([]);
    const independent = createHash("sha256").update(document.bytes).digest("hex");
    assert.equal(document.sha256, independent);
    assert.equal(document.sha256, "600e4d660c21cccb8079d814f3dadc3b5340ad2aac227eab979894739d865ad6");
    assert.equal(document.byteLength, document.bytes.byteLength);
    assert.equal(document.rowCount, 0);
    assert.equal(document.uniqueProspectCount, 0);
    assert.equal(parseCsv(decode(document)).length, 1);
  } finally {
    await vite.close();
  }
});

test("rejects malformed, unknown, accessor-backed, sparse, and oversized inputs", async () => {
  const { vite, codec } = await load();
  try {
    const missing = row();
    delete missing.package_ref;
    const accessor = Object.defineProperty(row(), "contact_value", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const sparse = [row(), row()];
    delete sparse[0];
    const cases = [
      null,
      {},
      [missing],
      [{ ...row(), unknown_field: "no" }],
      [{ ...row(), contact_value: 7 }],
      [{ ...row(), contact_id: null }],
      [{ ...row(), contact_value: "bad\0value" }],
      [{ ...row(), contact_value: "\ud800" }],
      [accessor],
      sparse,
      new Proxy([row()], { ownKeys() { throw new Error("must-not-run"); } }),
    ];
    for (const [index, value] of cases.entries()) {
      await assert.rejects(
        codec.encodeCrmCsv(value),
        (error) => error?.code === "crm_csv_input_invalid" || error?.code === "crm_csv_stable_id_invalid",
        `malformed case ${index}`,
      );
    }
    await assert.rejects(
      codec.encodeCrmCsv([{ ...row(), contact_value: "x".repeat(codec.CRM_CSV_LIMITS.maxCellUtf8Bytes + 1) }]),
      (error) => error?.code === "crm_csv_cell_too_large",
    );
    await assert.rejects(
      codec.encodeCrmCsv(Array(codec.CRM_CSV_LIMITS.maxRows + 1)),
      (error) => error?.code === "crm_csv_rows_too_many",
    );
  } finally {
    await vite.close();
  }
});

test("the runtime codec is offline and does not import preparation or authority modules", async () => {
  const source = await readFile(new URL("../domain/crm-csv-codec.ts", import.meta.url), "utf8");
  assert.equal(/^import\s/mu.test(source), false);
  for (const forbidden of [
    "from \"../preparation",
    "from \"./contact-eligibility",
    "fetch(",
    "node:fs",
    "D1Database",
    "R2Bucket",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(/\b(?:download|deliver)\w*\s*\(/u.test(source), false);
});
