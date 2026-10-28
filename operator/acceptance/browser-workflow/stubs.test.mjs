import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { stubSource } from "./stubs.mjs";
test("generated providers are deterministic, counted, and reject unknown input", async () => {
  const dir = mkdtempSync(join(tmpdir(), "prospector-stub-test-"));
  const previous = process.env.ACCEPTANCE_EVENTS;
  try {
    process.env.ACCEPTANCE_EVENTS = join(dir, "events");
    writeFileSync(process.env.ACCEPTANCE_EVENTS, "");
    for (const name of ["llm", "retrieve", "mailer"])
      writeFileSync(join(dir, name + ".mjs"), stubSource(name));
    const llm = await import(pathToFileURL(join(dir, "llm.mjs")).href);
    for (const n of [1, 2]) {
      const answer = JSON.parse(await llm.completeJson(null, null, '"candidates"'));
      assert.equal(answer.candidates[0].targetName, "Fictional Plant " + n);
    }
    const rows = readFileSync(process.env.ACCEPTANCE_EVENTS, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.deepEqual(rows, [
      { kind: "stub", name: "hunt" },
      { kind: "stub", name: "hunt" },
    ]);
    await assert.rejects(llm.completeJson(null, null, "unknown"));
    const retrieve = await import(pathToFileURL(join(dir, "retrieve.mjs")).href);
    assert.match(
      (await retrieve.retrieveHttps("https://fictionalquarry.example/evidence/1")).text,
      /person1@fictionalquarry.example/,
    );
    for (const url of [
      "https://example.invalid",
      "http://fictionalquarry.example/evidence/1",
      "https://fictionalquarry.example/evidence/3",
      "https://user@fictionalquarry.example/evidence/1",
    ])
      await assert.rejects(retrieve.retrieveHttps(url));
    const mailer = await import(pathToFileURL(join(dir, "mailer.mjs")).href);
    assert.throws(() => mailer.sendViaGmail(), /Forbidden provider adapter/);
  } finally {
    if (previous === undefined) delete process.env.ACCEPTANCE_EVENTS;
    else process.env.ACCEPTANCE_EVENTS = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
