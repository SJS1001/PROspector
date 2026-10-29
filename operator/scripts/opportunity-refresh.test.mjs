import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("refresh preserves confirmed product capabilities and limitations without proposed claims", async () => {
  const owner = "fixture-owner";
  const snapshot = { company: "Seller", product: "ONE", promise: "Investigate", play: "Mining", fit: "Plants" };
  const knowledge = [
    ["product.capability", "Capability", "Relate existing historian and lab data", "confirmed"],
    ["product.limitations", "Limits", "Read-only; cannot operate plant controls", "confirmed"],
    ["product.delivery", "Delivery", "Owner-led diagnostic", "confirmed"],
    ["product.proof", "Proof", "No guaranteed savings", "confirmed"],
    ["profile.signals", "Signals", "Continuing recovery investigations", "confirmed"],
    ["product.limitations", "Unconfirmed claim", "Can operate controls", "proposed"],
    ["company.legal_name", "Company", "Irrelevant seller identity", "confirmed"],
  ].map(([question_id, question, confirmed_answer, status], index) => ({
    id: String(index), question_id, question, confirmed_answer, status,
    proposed_answer: "UNCONFIRMED PROPOSAL", scope: "product", evidence: "",
    inference: "", recommendation: "", sort_order: index,
  }));
  let explanationArgs;
  let updatedAssessment;
  const sql = async (parts, ...values) => {
    const query = parts.join("?");
    assert.ok(values.includes(owner), "every query remains scoped to the owner");
    if (query.includes("select * from prospects")) return [{
      id: "prospect", origin: "run", account_name: "Fictional Mining", target_name: "Copper Plant",
      configuration_digest: "digest", evidence_url: "https://fictional.example/report",
      assessment_json: JSON.stringify({ dimensions: [], passRule: "unchanged" }),
    }];
    if (query.includes("from profile_configurations")) return [{ snapshot_json: JSON.stringify(snapshot) }];
    if (query.includes("from knowledge_items")) return knowledge;
    if (query.includes("update prospects")) {
      updatedAssessment = JSON.parse(values[0]);
      assert.ok(query.includes("revision = revision + 1"));
      assert.ok(values.includes(3));
      return [{ id: "prospect" }];
    }
    throw Error(`Unexpected SQL: ${query}`);
  };
  const exports = {};
  const source = readFileSync(new URL("../src/lib/server/fns.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (name) => {
    if (name === "@tanstack/react-start") return {
      createServerFn: () => ({
        middleware() { return this; },
        validator(validate) { this.validate = validate; return this; },
        handler(fn) { return (data) => fn({ context: { userId: owner }, data: this.validate(data) }); },
      }),
    };
    if (name === "@/lib/db") return { getSql: async () => sql };
    if (name === "./retrieve") return { retrieveHttps: async () => ({ text: "Retrieved report" }) };
    if (name === "./opportunity") return {
      buildOpportunity: async (...args) => { explanationArgs = args; return { version: 1 }; },
    };
    return {};
  };
  vm.runInNewContext(code + "\nloadWorkspace = async () => ({refreshed:true});", { exports, require });
  await exports.explainProspect({ prospectId: "prospect", expectedRevision: 3 });
  assert.equal(explanationArgs[1], owner);
  assert.equal(explanationArgs[2], "Fictional Mining — Copper Plant");
  assert.deepEqual(JSON.parse(JSON.stringify(explanationArgs[4])), snapshot);
  const context = explanationArgs[5];
  assert.match(context, /Limits: Read-only; cannot operate plant controls/);
  assert.match(context, /Capability: Relate existing historian and lab data/);
  assert.match(context, /Proof: No guaranteed savings/);
  assert.match(context, /Delivery: Owner-led diagnostic/);
  assert.match(context, /Signals: Continuing recovery investigations/);
  assert.doesNotMatch(context, /Can operate controls|UNCONFIRMED|Irrelevant/);
  assert.equal(updatedAssessment.passRule, "unchanged");
  assert.deepEqual(updatedAssessment.opportunity, { version: 1 });
});
