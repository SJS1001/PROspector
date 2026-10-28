import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvBytes } from "./csv.mjs";
import { downloadCsv } from "./workflow.mjs";

test("CSV preserves exact quoted, Unicode, control and formula-neutralized cells", () => {
  const csv =
    'a,b,c,d,e,f,g,h\r\n"Fictional ""Person"", Quarry\né",,"",\ufeffvalue,\u0001value,\' \t+1,\'=1+1,"source\r\nline"\r\n';
  assert.deepEqual(parseCsvBytes(Buffer.from(csv)), [
    ["a", "b", "c", "d", "e", "f", "g", "h"],
    [
      'Fictional "Person", Quarry\né',
      "",
      "",
      "\ufeffvalue",
      "\u0001value",
      "' \t+1",
      "'=1+1",
      "source\r\nline",
    ],
  ]);
  assert.deepEqual(parseCsv("a,\r\n"), [["a", ""]]);
});

for (const csv of [
  'ab"cd"\r\n',
  '"ab"cd\r\n',
  '"ab" \r\n',
  'a"b",c\r\n',
  '"ab\r\n',
  '"ab"',
  "a,b",
  "a,b\n",
  "a,b\r",
  "a\nb\r\n",
  "a\rb\r\n",
  "a,b\r\n,",
  "",
  '"a""\r\n',
])
  test("CSV rejects malformed bytes " + JSON.stringify(csv), () => {
    assert.throws(() => parseCsvBytes(Buffer.from(csv)), { name: "AssertionError" });
  });

test("CSV byte decoding rejects invalid UTF-8 and preserves leading BOM", () => {
  assert.throws(() => parseCsvBytes(Buffer.from([0xc3, 0x28])), TypeError);
  assert.deepEqual(parseCsvBytes(Buffer.from("\ufeffa\r\n")), [["\ufeffa"]]);
});

test("actual download consumer rejects malformed quoting instead of normalizing it", async () => {
  // Old parser turned the malformed account field into the expected account.
  const csv =
    'prospect_id,contact_id,account_name,full_name,role,email,phone,source\r\np,c,Fictional "Quarry",Fictional Person,champion,person1@fictionalquarry.example,,Published on https://fictionalquarry.example/evidence/1\r\n';
  const page = {
    waitForEvent: async () => ({
      suggestedFilename: () => "crm.csv",
      createReadStream: async () =>
        (async function* () {
          yield Buffer.from(csv);
        })(),
    }),
    getByRole: () => ({ click: async () => {} }),
  };
  await assert.rejects(
    downloadCsv(page, ["person1@fictionalquarry.example"]),
    /quote must begin a field/,
  );
});
