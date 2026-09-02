import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const NOW = Date.parse("2026-09-02T15:45:00.000Z");
const FIELD_IDS = Object.freeze([
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
]);
const SORT_KEY_IDS = Object.freeze(["prospect_id", "contact_id", "contact_point_id"]);
const ZERO_EFFECTS = Object.freeze({
  durableMutations: 0,
  csvSerializations: 0,
  checksumCalculations: 0,
  exportMutations: 0,
  deliveryInvocations: 0,
  downloadInvocations: 0,
  providerCalls: 0,
});

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const policies = await vite.ssrLoadModule(new URL(
      "../preparation/phase7-csv-policy-definition.ts",
      import.meta.url,
    ).pathname);
    return { vite, policies };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function candidateInput(patch = {}) {
  return {
    id: "synthetic-csv-policy-definition-v1",
    schemaVersion: 1,
    fieldIds: [...FIELD_IDS],
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

function decisionInput(artifact, patch = {}) {
  return {
    candidate: artifact,
    currentCandidate: candidateInput(),
    currentAuthority: authority(),
    ...patch,
  };
}

test("CSV policy definitions are deterministic, deeply frozen, generic, and zero-effect", async () => {
  const { vite, policies } = await load();
  try {
    const first = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    const second = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    assert.equal(first.digest, second.digest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.snapshot), true);
    assert.equal(Object.isFrozen(first.snapshot.fieldIds), true);
    assert.equal(Object.isFrozen(first.snapshot.sortKeyIds), true);
    assert.equal(first.operationalPolicyClaimed, false);
    assert.equal(first.csvArtifactClaimed, false);
    assert.equal(first.checksumClaimed, false);
    assert.equal(first.phaseExecutionAuthorized, false);
    assert.equal(first.runtimeCompositionAuthorized, false);
    assert.equal(first.persistenceAuthorized, false);
    assert.equal(first.csvSerializationAuthorized, false);
    assert.equal(first.deliveryAuthorized, false);
    assert.equal(first.downloadAuthorized, false);
    assert.equal(first.exportAuthorized, false);
    assert.equal(first.providerInvocationAuthorized, false);
    assert.deepEqual(first.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("the fixed field order covers the generic CRM handoff contract", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    assert.deepEqual(artifact.snapshot.fieldIds, FIELD_IDS);
    assert.equal(artifact.snapshot.fieldIds.includes("prospect_id"), true);
    assert.equal(artifact.snapshot.fieldIds.includes("contact_point_id"), true);
    assert.equal(artifact.snapshot.fieldIds.includes("contact_kind"), true);
    assert.equal(artifact.snapshot.fieldIds.includes("contact_value"), true);
    assert.equal(artifact.snapshot.fieldIds.includes("verification_class"), true);
    assert.equal(artifact.snapshot.fieldIds.includes("package_ref"), true);
    assert.equal(artifact.snapshot.fieldIds.includes("export_manifest_ref"), true);
    const serialized = JSON.stringify(artifact).toLowerCase();
    assert.equal(serialized.includes("digitalrain"), false);
    assert.equal(serialized.includes("mining"), false);
  } finally {
    await vite.close();
  }
});

test("the canonical stable sort order is Prospect then Contact then contact point", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    assert.deepEqual(artifact.snapshot.sortKeyIds, SORT_KEY_IDS);
  } finally {
    await vite.close();
  }
});

test("the text-safety policy is fixed without materializing bytes", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    assert.equal(artifact.snapshot.encoding, "utf-8");
    assert.equal(artifact.snapshot.byteOrderMark, "absent");
    assert.equal(artifact.snapshot.recordSeparator, "crlf");
    assert.equal(artifact.snapshot.headerPolicy, "single_header_row");
    assert.equal(artifact.snapshot.quotingPolicy, "rfc4180_double_quote");
    assert.equal(artifact.snapshot.nullPolicy, "empty_field");
    assert.equal(
      artifact.snapshot.formulaNeutralizationPolicy,
      "prefix_apostrophe_for_equals_plus_minus_at",
    );
    assert.equal(Object.hasOwn(artifact.snapshot, "bytes"), false);
  } finally {
    await vite.close();
  }
});

test("field and sort order cannot be removed, reordered, duplicated, or extended", async () => {
  const { vite, policies } = await load();
  try {
    const swapped = [...FIELD_IDS];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    for (const patch of [
      { fieldIds: FIELD_IDS.slice(0, -1) },
      { fieldIds: swapped },
      { fieldIds: [...FIELD_IDS.slice(0, -1), FIELD_IDS[0]] },
      { fieldIds: [...FIELD_IDS, "extra_field"] },
      { sortKeyIds: ["contact_id", "prospect_id", "contact_point_id"] },
      { sortKeyIds: ["prospect_id", "contact_point_id"] },
      { sortKeyIds: [...SORT_KEY_IDS, "source_run_id"] },
    ]) {
      await assert.rejects(
        policies.buildSyntheticCsvPolicyDefinition(candidateInput(patch)),
        /synthetic_phase7_csv_policy_definition_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("schema and every policy label are closed to the launch definition", async () => {
  const { vite, policies } = await load();
  try {
    for (const patch of [
      { schemaVersion: 2 },
      { encoding: "utf-16" },
      { byteOrderMark: "present" },
      { recordSeparator: "lf" },
      { headerPolicy: "no_header" },
      { quotingPolicy: "minimal" },
      { nullPolicy: "literal_null" },
      { formulaNeutralizationPolicy: "none" },
    ]) {
      await assert.rejects(
        policies.buildSyntheticCsvPolicyDefinition(candidateInput(patch)),
        /synthetic_phase7_csv_policy_definition_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("a completely current definition remains a zero-authority digest projection", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    const decision = await policies.evaluateSyntheticCsvPolicyDefinition(decisionInput(artifact));
    assert.equal(decision.status, "synthetic_csv_policy_definition_current_no_authority");
    assert.equal(decision.candidateId, artifact.id);
    assert.equal(decision.candidateDigest, artifact.digest);
    assert.equal(decision.currentDefinitionClaimed, true);
    assert.equal(decision.operationalPolicyClaimed, false);
    assert.equal(decision.csvArtifactClaimed, false);
    assert.equal(decision.checksumClaimed, false);
    assert.equal(decision.csvSerializationAuthorized, false);
    assert.equal(decision.persistenceAuthorized, false);
    assert.equal(decision.deliveryAuthorized, false);
    assert.equal(decision.downloadAuthorized, false);
    assert.equal(decision.exportAuthorized, false);
    assert.equal(decision.providerInvocationAuthorized, false);
    assert.deepEqual(decision.reasonCodes, []);
    assert.deepEqual(decision.effects, ZERO_EFFECTS);
  } finally {
    await vite.close();
  }
});

test("every schema and policy authority failure rejects independently", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    const cases = [
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
    ];
    for (const [reason, patch] of cases) {
      const decision = await policies.evaluateSyntheticCsvPolicyDefinition(decisionInput(artifact, {
        currentAuthority: authority(patch),
      }));
      assert.equal(decision.status, "synthetic_csv_policy_definition_rejected", reason);
      assert.equal(decision.reasonCodes.includes(reason), true, reason);
      assert.equal(decision.currentDefinitionClaimed, false, reason);
      assert.deepEqual(decision.effects, ZERO_EFFECTS, reason);
    }
  } finally {
    await vite.close();
  }
});

test("candidate identity or creation-time drift rejects", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    for (const currentCandidate of [
      candidateInput({ id: "synthetic-csv-policy-definition-v1-other" }),
      candidateInput({ createdAt: NOW + 1 }),
    ]) {
      const decision = await policies.evaluateSyntheticCsvPolicyDefinition(decisionInput(artifact, {
        currentCandidate,
      }));
      assert.equal(decision.status, "synthetic_csv_policy_definition_rejected");
      assert.equal(decision.reasonCodes.includes("csv_policy_definition_changed"), true);
    }
  } finally {
    await vite.close();
  }
});

test("evaluation before definition creation rejects", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    const decision = await policies.evaluateSyntheticCsvPolicyDefinition(decisionInput(artifact, {
      currentAuthority: authority({ evaluatedAt: NOW - 1 }),
    }));
    assert.equal(decision.status, "synthetic_csv_policy_definition_rejected");
    assert.equal(decision.reasonCodes.includes("evaluation_precedes_csv_policy_definition"), true);
  } finally {
    await vite.close();
  }
});

test("hostile, sparse, accessor, raw-value, row, byte, checksum, provider, and extra shapes reject", async () => {
  const { vite, policies } = await load();
  try {
    const sparse = [...FIELD_IDS];
    delete sparse[2];
    const accessor = Object.defineProperty(candidateInput(), "encoding", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    for (const value of [
      accessor,
      new Proxy(candidateInput(), { ownKeys() { throw new Error("must-not-run"); } }),
      candidateInput({ fieldIds: sparse }),
      { ...candidateInput(), email: "person@example.com" },
      { ...candidateInput(), phone: "+14165550123" },
      { ...candidateInput(), rows: [] },
      { ...candidateInput(), csvBytes: new Uint8Array() },
      { ...candidateInput(), checksum: "a".repeat(64) },
      { ...candidateInput(), providerHandle: "synthetic-provider" },
      { ...candidateInput(), createdAt: 0 },
    ]) {
      await assert.rejects(
        policies.buildSyntheticCsvPolicyDefinition(value),
        /synthetic_phase7_csv_policy_definition_invalid/,
      );
    }
  } finally {
    await vite.close();
  }
});

test("a forged policy artifact cannot enter current-state evaluation", async () => {
  const { vite, policies } = await load();
  try {
    const artifact = await policies.buildSyntheticCsvPolicyDefinition(candidateInput());
    await assert.rejects(
      policies.evaluateSyntheticCsvPolicyDefinition(decisionInput({ ...artifact })),
      /synthetic_phase7_csv_policy_definition_decision_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("the policy module has no runtime, value, persistence, bytes, checksum, provider, or export seam", async () => {
  const source = await readFile(new URL(
    "../preparation/phase7-csv-policy-definition.ts",
    import.meta.url,
  ), "utf8");
  for (const forbidden of [
    "fetch(", "console.", ".prepare(", "INSERT INTO", "writeFile(", "mailto:", "tel:",
    "gmail", "googleapis", "twilio", "process.env", "import.meta.env", "createObjectURL",
    "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition", "Digitalrain", "Mining",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(source.includes("csvArtifactClaimed: false"), true);
  assert.equal(source.includes("checksumClaimed: false"), true);
  assert.equal(source.includes("csvSerializationAuthorized: false"), true);
  assert.equal(source.includes("persistenceAuthorized: false"), true);
  assert.equal(source.includes("deliveryAuthorized: false"), true);
  assert.equal(source.includes("downloadAuthorized: false"), true);
  assert.equal(source.includes("exportAuthorized: false"), true);
  assert.equal(source.includes("providerInvocationAuthorized: false"), true);
});
