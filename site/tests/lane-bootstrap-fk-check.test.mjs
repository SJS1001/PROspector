import assert from "node:assert/strict";
import test from "node:test";
import { assertForeignKeyCheckClean as assertPersonDiscovery } from "../scripts/person-discovery-browser-bootstrap.mjs";
import { assertForeignKeyCheckClean as assertOperatorJourney } from "../scripts/operator-journey-browser-bootstrap.mjs";

// Wrangler `d1 execute --json` pretty-prints an array of statement envelopes.
const envelope = (results) => JSON.stringify([{ results, success: true, meta: { duration: 0 } }], null, 2);
const violation = { table: "child", rowid: 1, parent: "parent", fkid: 0 };

for (const [lane, check, code] of [
  ["C4 person-discovery", assertPersonDiscovery, "c4_foreign_key_check_failed"],
  ["E1 operator-journey", assertOperatorJourney, "e1_foreign_key_check_failed"],
]) {
  test(`${lane} bootstrap FK check passes only on a parsed, empty results array`, () => {
    assert.doesNotThrow(() => check({ status: 0, stdout: envelope([]) }));
  });

  test(`${lane} bootstrap FK check fails on a violation row even when wrangler exits 0`, () => {
    assert.throws(() => check({ status: 0, stdout: envelope([violation]) }), new RegExp(`^Error: ${code}:violations:1$`));
  });

  test(`${lane} bootstrap FK check fails closed on unreadable or unexpected output`, () => {
    for (const stdout of [
      "┌───────┐\n│ table │\n└───────┘",
      "",
      JSON.stringify({ results: [] }),
      JSON.stringify([]),
      JSON.stringify([{ success: true }]),
      JSON.stringify([{ results: {} }]),
    ]) assert.throws(() => check({ status: 0, stdout }), new RegExp(`^Error: ${code}:unreadable$`), stdout);
    assert.throws(() => check({ status: 1, stdout: envelope([]) }), new RegExp(`^Error: ${code}:exit$`));
    assert.throws(() => check({ status: null, stdout: envelope([]) }), new RegExp(`^Error: ${code}:exit$`));
  });
}
