import assert from "node:assert/strict";

export function parseCsvBytes(bytes) {
  // ignoreBOM=true preserves U+FEFF instead of silently removing download bytes.
  return parseCsv(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
}

export function parseCsv(text) {
  assert.equal(typeof text, "string");
  const rows = [];
  let row = [],
    cell = "",
    state = "start";
  function endCell() {
    row.push(cell);
    cell = "";
    state = "start";
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else state = "closed";
      } else cell += ch;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\r" && text[i + 1] === "\n") {
      endCell();
      rows.push(row);
      row = [];
      i++;
    } else {
      assert.notEqual(state, "closed", "CSV closing quote must precede a delimiter or CRLF");
      assert.ok(ch !== "\r" && ch !== "\n", "CSV records require CRLF");
      if (ch === '"') {
        assert.equal(state, "start", "CSV quote must begin a field");
        state = "quoted";
      } else {
        cell += ch;
        state = "unquoted";
      }
    }
  }
  assert.equal(state, "start", "CSV must end in CRLF with no open field");
  assert.deepEqual(row, [], "CSV must end in CRLF");
  assert.equal(cell, "");
  assert.ok(rows.length, "CSV must contain a record");
  return rows;
}
