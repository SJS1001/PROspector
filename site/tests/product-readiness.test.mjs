import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function loadDomain(vite) {
  try { return await vite.ssrLoadModule(new URL("../domain/product-readiness.ts", import.meta.url).pathname); }
  catch { assert.fail("missing production behavior: site/domain/product-readiness.ts must reproduce evaluateProductReadiness in trusted application code"); }
}

const PRODUCT_ID = "product-under-test";
const OTHER_PRODUCT_ID = "some-other-product";

const REQUIRED_CATEGORIES = [
  "capability",
  "limitation",
  "delivery",
  "proof",
  "ownership",
  "claim_guardrail",
  "source_policy",
  "discovery_policy",
  "default_runner_policy",
];

function digest(seed) {
  return seed.repeat(64).slice(0, 64);
}

function confirmedItem(category, id, digestSeed = id[0] ?? "a") {
  return {
    id,
    digest: digest(digestSeed),
    category,
    scopeType: "product",
    scopeId: PRODUCT_ID,
    status: "confirmed",
    authority: "confirmed_knowledge_version",
  };
}

function digestSeedFor(index) {
  return index.toString(16);
}

function fullConfirmedKnowledge() {
  return REQUIRED_CATEGORIES.map((category, index) =>
    confirmedItem(category, `version-${category}`, digestSeedFor(index)));
}

function evaluate(qualification, knowledge) {
  return qualification.evaluateProductReadiness({ product: { id: PRODUCT_ID }, knowledge });
}

test("all nine categories confirmed exactly once yields a complete, sorted result", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const readiness = await loadDomain(vite);
    const result = evaluate(readiness, fullConfirmedKnowledge());
    assert.equal(result.complete, true);
    assert.deepEqual(result.missingCategories, []);
    assert.equal(result.items.length, REQUIRED_CATEGORIES.length);
    for (const category of REQUIRED_CATEGORIES) {
      const item = result.items.find((entry) => entry.category === category);
      assert.equal(item.status, "confirmed", category);
    }
    // items preserve the fixed PRODUCT_READINESS_CATEGORIES order regardless of input order.
    assert.deepEqual(result.items.map((item) => item.category), REQUIRED_CATEGORIES);
    assert.equal(result.confirmedVersions.length, REQUIRED_CATEGORIES.length);
    const sortedIds = result.confirmedVersions.map((version) => version.id);
    const expectedSortedIds = [...sortedIds].sort((left, right) => left.localeCompare(right));
    assert.deepEqual(sortedIds, expectedSortedIds, "confirmedVersions must be sorted by id");
    for (const [index, category] of REQUIRED_CATEGORIES.entries()) {
      const version = result.confirmedVersions.find((entry) => entry.category === category);
      assert.ok(version, `${category} must appear in confirmedVersions`);
      assert.equal(version.id, `version-${category}`, category);
      assert.equal(version.digest, digest(digestSeedFor(index)), category);
    }
  } finally { await vite.close(); }
});

test("each of the nine required categories reports missing individually when absent", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const readiness = await loadDomain(vite);
    for (const omittedCategory of REQUIRED_CATEGORIES) {
      const knowledge = fullConfirmedKnowledge().filter((item) => item.category !== omittedCategory);
      const result = evaluate(readiness, knowledge);
      assert.equal(result.complete, false, omittedCategory);
      assert.deepEqual(result.missingCategories, [omittedCategory], omittedCategory);
      assert.deepEqual(result.confirmedVersions, [], omittedCategory);
      const item = result.items.find((entry) => entry.category === omittedCategory);
      assert.equal(item.status, "missing", omittedCategory);
      for (const category of REQUIRED_CATEGORIES) {
        if (category === omittedCategory) continue;
        const other = result.items.find((entry) => entry.category === category);
        assert.equal(other.status, "confirmed", `${category} while ${omittedCategory} is missing`);
      }
    }
  } finally { await vite.close(); }
});

test("proposed and unconfirmed knowledge versions do not satisfy a category", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const readiness = await loadDomain(vite);
    const base = fullConfirmedKnowledge();
    const replaceCapability = (overrides) => base.map((item) =>
      item.category === "capability" ? { ...item, ...overrides } : item);

    const cases = [
      ["proposed status", { status: "proposed" }],
      ["unconfirmed status", { status: "unconfirmed" }],
      ["non-confirmed authority", { authority: "proposed_knowledge_version" }],
      ["wrong scope type", { scopeType: "company" }],
      ["wrong scope id", { scopeId: OTHER_PRODUCT_ID }],
      ["malformed digest", { digest: "not-a-digest" }],
      ["missing id", { id: undefined }],
    ];
    for (const [name, overrides] of cases) {
      const result = evaluate(readiness, replaceCapability(overrides));
      assert.equal(result.complete, false, name);
      assert.deepEqual(result.missingCategories, ["capability"], name);
      const item = result.items.find((entry) => entry.category === "capability");
      assert.equal(item.status, "missing", name);
    }
  } finally { await vite.close(); }
});

test("an unrecognized knowledge category is ignored rather than crashing evaluation", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const readiness = await loadDomain(vite);
    const knowledge = [
      ...fullConfirmedKnowledge(),
      confirmedItem("not_a_real_category", "version-unknown", "z"),
    ];
    const result = evaluate(readiness, knowledge);
    assert.equal(result.complete, true);
    assert.deepEqual(result.missingCategories, []);
    assert.equal(result.items.length, REQUIRED_CATEGORIES.length);
    assert.equal(result.confirmedVersions.length, REQUIRED_CATEGORIES.length);
  } finally { await vite.close(); }
});

test("two confirmed knowledge versions in the same category leave that category missing, not duplicate-flagged", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const readiness = await loadDomain(vite);
    const knowledge = [
      ...fullConfirmedKnowledge(),
      confirmedItem("capability", "version-capability-second", "f"),
    ];
    const result = evaluate(readiness, knowledge);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missingCategories, ["capability"]);
    const item = result.items.find((entry) => entry.category === "capability");
    assert.equal(item.status, "missing");
    assert.deepEqual(result.confirmedVersions, []);
  } finally { await vite.close(); }
});

test("no knowledge at all reports every category missing and an incomplete result", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const readiness = await loadDomain(vite);
    const result = evaluate(readiness, []);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missingCategories, REQUIRED_CATEGORIES);
    assert.deepEqual(result.confirmedVersions, []);
    for (const item of result.items) assert.equal(item.status, "missing", item.category);
  } finally { await vite.close(); }
});
