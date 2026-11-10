import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createServer } from "vite";

// 07-02 contract: deterministic CSV CRM handoff.
// Live cases bind to domain/crm-csv-codec.ts, domain/crm-handoff-export-artifact.ts
// and domain/crm-handoff-delivery.ts. Cases for domain/crm-handoff.ts (07-06),
// which does not exist yet, are `todo`. Everything here is synthetic and uses
// fake ports only; no CSV is delivered, persisted, or downloaded.

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const FIELD_IDS = [
  "prospect_id", "company_id", "product_id", "market_play_id", "profile_id",
  "account_target", "selected_role", "contact_id", "contact_point_id", "contact_kind",
  "contact_value", "verification_class", "verification_method_ref", "verification_time",
  "qualification_score_ref", "evidence_refs", "offer_ref", "package_ref", "activity_status",
  "source_workspace_id", "source_run_id", "export_manifest_ref",
];

async function withModules(run) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const load = (path) => vite.ssrLoadModule(new URL(path, import.meta.url).pathname);
    return await run({
      codec: await load("../domain/crm-csv-codec.ts"),
      artifact: await load("../domain/crm-handoff-export-artifact.ts"),
      delivery: await load("../domain/crm-handoff-delivery.ts"),
      load,
    });
  } finally {
    await vite.close();
  }
}

function row(n, patch = {}) {
  const id = String(n).padStart(4, "0");
  return {
    prospect_id: `synthetic-prospect-${id}`,
    company_id: "synthetic-company-0001",
    product_id: "synthetic-product-0001",
    market_play_id: "synthetic-market-play-0001",
    profile_id: "synthetic-profile-0001",
    account_target: "Fictional Example Mining Company",
    selected_role: "Fictional Example Operations Role",
    contact_id: `synthetic-contact-${id}`,
    contact_point_id: `synthetic-contact-point-${id}`,
    contact_kind: "email",
    contact_value: `person${id}@example.test`,
    verification_class: "synthetic_mailbox_verified",
    verification_method_ref: "synthetic-verification-0001",
    verification_time: "2000-01-01T00:00:00.000Z",
    qualification_score_ref: "synthetic-qualification-score-0001",
    evidence_refs: "synthetic-evidence-0001",
    offer_ref: "synthetic-offer-0001",
    package_ref: "synthetic-package-0001",
    activity_status: "synthetic_no_activity",
    source_workspace_id: "synthetic-workspace-0001",
    source_run_id: "synthetic-run-0001",
    export_manifest_ref: "synthetic-export-manifest-0001",
    ...patch,
  };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const decode = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

/** Minimal RFC 4180 reader so assertions check the cells, not the quoting. */
function parseCsv(text) {
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { record.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { record.push(cell); records.push(record); record = []; cell = ""; i += 1; }
    else cell += c;
  }
  assert.equal(cell, "");
  assert.equal(record.length, 0);
  return records;
}

function shuffle(values, seed) {
  const out = [...values];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// -- Formula, quoting and byte vectors ---------------------------------------

test("formula vectors: cells starting with =, +, -, @ (after any whitespace or control prefix) are neutralized before quoting", async () => {
  await withModules(async ({ codec }) => {
    const vectors = [
      ["=1+1", "'=1+1"],
      ["+SUM(A1:A2)", "'+SUM(A1:A2)"],
      ["-2+3", "'-2+3"],
      ["@SUM(1)", "'@SUM(1)"],
      ["  =cmd", "'  =cmd"],
      ["\t=cmd", "'\t=cmd"],
      ["\u0001@x", "'\u0001@x"],
      ["﻿=x", "'﻿=x"],
      ["=HYPERLINK(\"https://example.test\",\"x\")", "'=HYPERLINK(\"https://example.test\",\"x\")"],
      ["=1,2", "'=1,2"],
    ];
    for (const [input, expected] of vectors) {
      const csv = await codec.encodeCrmCsv([row(1, { account_target: input })]);
      const [, data] = parseCsv(decode(csv.bytes));
      assert.equal(data[FIELD_IDS.indexOf("account_target")], expected, JSON.stringify(input));
    }
    // Safe prefixes are left untouched.
    for (const safe of ["a=b", "x+1", "1-2", "name@example.test", "'quoted", "5 - 3"]) {
      const csv = await codec.encodeCrmCsv([row(1, { account_target: safe })]);
      const [, data] = parseCsv(decode(csv.bytes));
      assert.equal(data[FIELD_IDS.indexOf("account_target")], safe, safe);
    }
    // Every column is protected, not only free text.
    for (const field of FIELD_IDS.filter((f) => !["prospect_id", "contact_id", "contact_point_id"].includes(f))) {
      const csv = await codec.encodeCrmCsv([row(1, { [field]: "=BAD()" })]);
      const [, data] = parseCsv(decode(csv.bytes));
      assert.equal(data[FIELD_IDS.indexOf(field)], "'=BAD()", field);
    }
  });
});

test("quote, comma, CR/LF, Unicode and null cells round-trip through RFC 4180 CRLF bytes without a BOM", async () => {
  await withModules(async ({ codec }) => {
    const hostile = row(1, {
      account_target: "Northern, Metals",
      selected_role: 'Operations "lead"',
      evidence_refs: "line one\r\nline two\nline three",
      activity_status: "ready — café 🚀 日本語",
      offer_ref: null,
    });
    const csv = await codec.encodeCrmCsv([hostile]);
    const text = decode(csv.bytes);
    assert.notEqual(csv.bytes[0], 0xef, "no UTF-8 BOM");
    assert.equal(text.startsWith(FIELD_IDS.join(",") + "\r\n"), true);
    assert.equal(text.endsWith("\r\n"), true);
    const records = parseCsv(text);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0], FIELD_IDS);
    for (const field of FIELD_IDS) {
      const expected = hostile[field] ?? "";
      assert.equal(records[1][FIELD_IDS.indexOf(field)], expected, field);
    }
    assert.equal(csv.recordSeparator, "crlf");
    assert.equal(csv.mediaType, "text/csv; charset=utf-8");
    assert.equal(csv.byteLength, csv.bytes.byteLength);
  });
});

test("canonical Prospect-ID then contact-ID ordering gives identical bytes for every input permutation", async () => {
  await withModules(async ({ codec }) => {
    const rows = [
      row(3), row(1),
      row(2, { contact_id: "synthetic-contact-0009", contact_point_id: "synthetic-contact-point-0009", contact_value: "second@example.test" }),
      row(2, { contact_id: "synthetic-contact-0002", contact_point_id: "synthetic-contact-point-0002", contact_value: "first@example.test" }),
    ];
    const baseline = await codec.encodeCrmCsv(rows);
    const order = parseCsv(decode(baseline.bytes)).slice(1).map((r) => `${r[0]}|${r[7]}`);
    assert.deepEqual(order, [
      "synthetic-prospect-0001|synthetic-contact-0001",
      "synthetic-prospect-0002|synthetic-contact-0002",
      "synthetic-prospect-0002|synthetic-contact-0009",
      "synthetic-prospect-0003|synthetic-contact-0003",
    ]);
    for (const seed of [1, 7, 42, 99, 2026]) {
      const shuffled = await codec.encodeCrmCsv(shuffle(rows, seed));
      assert.deepEqual(shuffled.bytes, baseline.bytes, `seed ${seed}`);
      assert.equal(shuffled.sha256, baseline.sha256, `seed ${seed}`);
    }
    assert.equal(baseline.sha256, sha256(baseline.bytes));
  });
});

test("contact rows stay distinct from the Prospect metric; dedupe is by Prospect ID plus contact-point ID only", async () => {
  await withModules(async ({ codec }) => {
    const multi = [
      row(1), row(1, { contact_id: "synthetic-contact-0011", contact_point_id: "synthetic-contact-point-0011", contact_value: "alt@example.test" }),
      row(2), row(2, { contact_id: "synthetic-contact-0012", contact_point_id: "synthetic-contact-point-0012", contact_value: "alt2@example.test" }),
      row(3),
    ];
    const csv = await codec.encodeCrmCsv(multi);
    assert.equal(csv.rowCount, 5);
    assert.equal(csv.uniqueProspectCount, 3);

    // Exact duplicates collapse; same identity with different content fails closed.
    const collapsed = await codec.encodeCrmCsv([row(1), row(1)]);
    assert.equal(collapsed.rowCount, 1);
    await assert.rejects(
      codec.encodeCrmCsv([row(1), row(1, { contact_value: "changed@example.test" })]),
      (error) => error?.code === "crm_csv_duplicate_conflict",
    );

    // No display-name / e-mail / CRM-id dedupe: two Prospects sharing a value stay two rows.
    const shared = await codec.encodeCrmCsv([
      row(1, { contact_value: "same@example.test", account_target: "Same Name" }),
      row(2, { contact_value: "same@example.test", account_target: "Same Name" }),
    ]);
    assert.equal(shared.rowCount, 2);
    assert.equal(shared.uniqueProspectCount, 2);
  });
});

test("malformed, oversized, or foreign-shaped input is refused with a stable code and no partial bytes", async () => {
  await withModules(async ({ codec }) => {
    const bad = [
      ["not an array", {}],
      ["extra field", [{ ...row(1), crm_id: "x" }]],
      ["missing field", [Object.fromEntries(Object.entries(row(1)).filter(([key]) => key !== "offer_ref"))]],
      ["non-string cell", [row(1, { contact_value: 5 })]],
      ["NUL cell", [row(1, { contact_value: "a\u0000b" })]],
      ["lone surrogate", [row(1, { contact_value: "\ud800" })]],
      ["empty prospect id", [row(1, { prospect_id: "" })]],
      ["accessor row", [Object.defineProperty({ ...row(1) }, "contact_value", { enumerable: true, get() { return "x"; } })]],
    ];
    for (const [name, value] of bad) {
      await assert.rejects(codec.encodeCrmCsv(value), (error) => typeof error?.code === "string" && error.code.startsWith("crm_csv_"), name);
    }
    await assert.rejects(
      codec.encodeCrmCsv([row(1, { evidence_refs: "x".repeat(codec.CRM_CSV_LIMITS.maxCellUtf8Bytes + 1) })]),
      (error) => error?.code === "crm_csv_cell_too_large",
    );
  });
});

// -- Immutable artifact, manifest and retry ----------------------------------

async function selectionRequest(artifact, rows, patch = {}) {
  const selectedRows = rows.map((candidate) => ({
    prospectId: candidate.prospect_id,
    contactId: candidate.contact_id,
    contactPointId: candidate.contact_point_id,
    rowDigest: createHash("sha256")
      .update(JSON.stringify(artifact.CRM_HANDOFF_EXPORT_CONTRACT.fieldIds.map((field) => candidate[field])))
      .digest("hex"),
  }));
  const draft = {
    schema: "prospector/crm-handoff-selection/v1",
    decision: "authorized",
    dataClassification: "synthetic",
    tenantId: "synthetic-tenant-0001",
    workspaceId: "synthetic-workspace-0001",
    selectionId: "synthetic-selection-0001",
    selectionRevision: 7,
    authorityRevision: 11,
    snapshotDigest: DIGEST_A,
    exportDefinitionDigest: DIGEST_B,
    configurationDigest: DIGEST_C,
    packageDigests: ["e".repeat(64), "d".repeat(64)],
    authorizedAt: "2026-09-13T12:00:00.000Z",
    expiresAt: "2026-09-13T12:10:00.000Z",
    selectedRows,
    ...patch.selectionDraft,
  };
  return {
    evaluatedAt: "2026-09-13T12:05:00.000Z",
    current: {
      tenantId: draft.tenantId,
      workspaceId: draft.workspaceId,
      selectionRevision: draft.selectionRevision,
      authorityRevision: draft.authorityRevision,
      snapshotDigest: draft.snapshotDigest,
      exportDefinitionDigest: draft.exportDefinitionDigest,
      configurationDigest: draft.configurationDigest,
      ...patch.current,
    },
    selection: { ...draft, operationDigest: await artifact.digestCrmHandoffSelection(draft), ...patch.selection },
    rows,
    ...patch.request,
  };
}

test("a retry of the same frozen selection returns byte-identical CSV, checksum and manifest", async () => {
  await withModules(async ({ artifact }) => {
    const rows = [row(2), row(1), row(1, { contact_id: "synthetic-contact-0005", contact_point_id: "synthetic-contact-point-0005", contact_value: "b@example.test" })];
    const first = await artifact.buildCrmHandoffExportArtifact(await selectionRequest(artifact, rows));
    const retry = await artifact.buildCrmHandoffExportArtifact(
      await selectionRequest(artifact, shuffle(rows, 11)),
    );
    assert.deepEqual(first.bytes, retry.bytes);
    assert.equal(sha256(first.bytes), first.manifest.csvSha256);
    assert.equal(first.manifest.csvSha256, retry.manifest.csvSha256);
    assert.equal(first.manifest.artifactSha256, retry.manifest.artifactSha256);
    assert.equal(first.manifest.materializationManifestSha256, retry.manifest.materializationManifestSha256);
    assert.equal(first.manifest.rowCount, 3);
    assert.equal(first.manifest.uniqueProspectCount, 2);
    assert.equal(first.manifest.byteLength, first.bytes.byteLength);
    assert.equal(first.manifest.workspaceId, "synthetic-workspace-0001");
    assert.equal(first.manifest.schema, "prospector/crm-handoff-export-artifact/v1");
    assert.deepEqual([...first.manifest.fieldIds], FIELD_IDS);
    assert.equal(first.manifest.externalExportAuthorized, false);
    assert.equal(first.manifest.operationalAuthority, false);
    assert.equal(Object.isFrozen(first.manifest), true);

    // Bytes are a defensive copy: mutating one read cannot alter the artifact.
    const tampered = first.bytes;
    tampered[0] ^= 0xff;
    assert.equal(sha256(first.bytes), first.manifest.csvSha256);
  });
});

test("a changed snapshot or definition changes the artifact digest; the earlier bytes are unaffected", async () => {
  await withModules(async ({ artifact }) => {
    const rows = [row(1)];
    const v1 = await artifact.buildCrmHandoffExportArtifact(await selectionRequest(artifact, rows));
    const changed = {
      snapshotDigest: "9".repeat(64),
    };
    const v2 = await artifact.buildCrmHandoffExportArtifact(await selectionRequest(artifact, rows, {
      selectionDraft: changed,
      current: changed,
    }));
    assert.deepEqual(v1.bytes, v2.bytes, "same rows give the same CSV bytes");
    assert.notEqual(v1.manifest.artifactSha256, v2.manifest.artifactSha256);
    assert.notEqual(v1.manifest.selectionOperationDigest, v2.manifest.selectionOperationDigest);
  });
});

test("every stale, revoked, foreign, or substituted input fails closed before any bytes exist", async () => {
  await withModules(async ({ artifact }) => {
    const rows = [row(1), row(2)];
    const code = (expected) => (error) => error?.code === expected;
    const cases = [
      ["authority revision moved", { current: { authorityRevision: 12 } }, "crm_handoff_export_stale"],
      ["selection revision moved", { current: { selectionRevision: 8 } }, "crm_handoff_export_stale"],
      ["snapshot drifted", { current: { snapshotDigest: "9".repeat(64) } }, "crm_handoff_export_stale"],
      ["configuration drifted", { current: { configurationDigest: "9".repeat(64) } }, "crm_handoff_export_stale"],
      ["other tenant", { current: { tenantId: "synthetic-tenant-0002" } }, "crm_handoff_export_cross_tenant"],
      ["other workspace", { current: { workspaceId: "synthetic-workspace-0002" } }, "crm_handoff_export_cross_tenant"],
      ["selection expired", { request: { evaluatedAt: "2026-09-13T12:10:00.000Z" } }, "crm_handoff_export_stale"],
      ["selection from the future", { request: { evaluatedAt: "2026-09-13T11:59:59.999Z" } }, "crm_handoff_export_stale"],
      ["operation digest forged", { selection: { operationDigest: "0".repeat(64) } }, "crm_handoff_export_selection_mismatch"],
    ];
    for (const [name, patch, expected] of cases) {
      const request = await selectionRequest(artifact, rows, patch);
      await assert.rejects(artifact.validateCrmHandoffExportRequest(request), code(expected), name);
      await assert.rejects(artifact.buildCrmHandoffExportArtifact(request), code(expected), name);
    }
    const unauthorized = await selectionRequest(artifact, rows, { selection: { decision: "denied" } });
    await assert.rejects(artifact.buildCrmHandoffExportArtifact(unauthorized), (error) => typeof error?.code === "string");
    // A row that was not selected cannot ride along; a selected row cannot be dropped.
    const request = await selectionRequest(artifact, rows);
    await assert.rejects(
      artifact.buildCrmHandoffExportArtifact({ ...request, rows: [...rows, row(3)] }),
      code("crm_handoff_export_selection_mismatch"),
    );
    await assert.rejects(
      artifact.buildCrmHandoffExportArtifact({ ...request, rows: [rows[0]] }),
      code("crm_handoff_export_selection_mismatch"),
    );
    await assert.rejects(
      artifact.buildCrmHandoffExportArtifact({ ...request, rows: [rows[0], { ...rows[1], contact_value: "swapped@example.test" }] }),
      code("crm_handoff_export_selection_mismatch"),
    );
  });
});

test("validation authorizes in-memory bytes only: no persistence, delivery, download, provider, or external export", async () => {
  await withModules(async ({ artifact }) => {
    const ports = { persist: 0, deliver: 0, download: 0, provider: 0 };
    const validation = await artifact.validateCrmHandoffExportRequest(await selectionRequest(artifact, [row(1)]));
    assert.equal(validation.accepted, true);
    assert.equal(validation.inMemoryMaterializationAuthorized, true);
    for (const flag of ["persistenceAuthorized", "deliveryAuthorized", "downloadAuthorized", "providerInvocationAuthorized", "externalExportAuthorized"]) {
      assert.equal(validation[flag], false, flag);
    }
    assert.deepEqual(ports, { persist: 0, deliver: 0, download: 0, provider: 0 });
  });
});

// -- Immutable retry, versioning and download authorization ------------------

function stored(patch = {}) {
  return {
    workspaceId: "workspace-one",
    artifactId: "artifact-one",
    version: 2,
    snapshotDigest: DIGEST_A,
    exportDefinitionDigest: DIGEST_B,
    idempotencyKey: "idem-one",
    csvSha256: DIGEST_C,
    manifestSha256: DIGEST_A,
    deliveryState: "available",
    deliveryExpiresAt: "2026-11-08T06:00:00.000Z",
    ...patch,
  };
}

function deliveryRequest(counter, patch = {}) {
  return {
    now: "2026-11-08T05:00:00.000Z",
    workspaceId: "workspace-one",
    idempotencyKey: "idem-one",
    snapshotDigest: DIGEST_A,
    exportDefinitionDigest: DIGEST_B,
    operation: "materialize",
    existing: stored(),
    port: { async putImmutable() { counter.calls += 1; throw new Error("port_must_not_be_called"); } },
    ...patch,
  };
}

test("retry returns the stored artifact; a changed snapshot under the same key conflicts; a new key gets the next version", async () => {
  await withModules(async ({ delivery }) => {
    const counter = { calls: 0 };
    const replay = delivery.decideCrmHandoffDelivery(deliveryRequest(counter));
    assert.equal(replay.outcome, "replay");
    assert.equal(replay.artifact.csvSha256, DIGEST_C);
    assert.equal(replay.artifact.version, 2);
    assert.equal(replay.regenerateBytes, false);

    const conflict = delivery.decideCrmHandoffDelivery(deliveryRequest(counter, { snapshotDigest: "9".repeat(64) }));
    assert.equal(conflict.outcome, "blocked");
    assert.equal(conflict.reason, "idempotency_conflict");

    const changedDefinition = delivery.decideCrmHandoffDelivery(deliveryRequest(counter, { exportDefinitionDigest: "9".repeat(64) }));
    assert.equal(changedDefinition.reason, "idempotency_conflict");

    const next = delivery.decideCrmHandoffDelivery(deliveryRequest(counter, { idempotencyKey: "idem-two", snapshotDigest: "9".repeat(64) }));
    assert.equal(next.outcome, "new_version");
    assert.equal(next.nextVersion, 3);
    assert.equal(next.artifact, null);

    const first = delivery.decideCrmHandoffDelivery(deliveryRequest(counter, { existing: null, idempotencyKey: "idem-new" }));
    assert.equal(first.nextVersion, 1);
    assert.equal(counter.calls, 0, "fake delivery port never invoked");
    for (const decision of [replay, conflict, next, first]) {
      assert.equal(decision.portInvocation, false);
      assert.deepEqual({ ...decision.effects }, {
        providerCalls: 0, durableMutations: 0, deliveryInvocations: 0, downloadInvocations: 0, csvSerializations: 0,
      });
    }
  });
});

test("expiry, failure, another workspace, or a different digest blocks download without changing eligibility or bytes", async () => {
  await withModules(async ({ delivery }) => {
    const counter = { calls: 0 };
    const access = (patch, existing = stored()) => delivery.decideCrmHandoffDelivery(
      deliveryRequest(counter, { operation: "access", existing, ...patch }),
    );
    const ok = access({});
    assert.equal(ok.outcome, "access_current");
    assert.equal(ok.artifact.csvSha256, DIGEST_C);

    const blocked = [
      ["state expired", access({}, stored({ deliveryState: "expired" })), "delivery_expired"],
      ["state failed", access({}, stored({ deliveryState: "failed" })), "delivery_failed"],
      ["clock past expiry", access({ now: "2026-11-08T06:00:00.000Z" }), "delivery_expired"],
      ["other workspace", access({ workspaceId: "workspace-two" }), "workspace_mismatch"],
      ["digest moved", access({ snapshotDigest: "9".repeat(64) }), "invalid"],
      ["no artifact", access({}, null), "invalid"],
    ];
    for (const [name, decision, reason] of blocked) {
      assert.equal(decision.outcome, "blocked", name);
      assert.equal(decision.reason, reason, name);
      assert.equal(decision.regenerateBytes, false, name);
      assert.equal(decision.artifact, null, name);
    }
    assert.equal(counter.calls, 0);
    for (const bad of [{ now: "not-a-time" }, { snapshotDigest: "short" }, { workspaceId: "bad id" }, { operation: "delete" }]) {
      const decision = delivery.decideCrmHandoffDelivery(deliveryRequest(counter, bad));
      assert.equal(decision.outcome, "blocked", JSON.stringify(bad));
      assert.equal(decision.reason, "invalid", JSON.stringify(bad));
    }
  });
});

// -- 07-06 service (domain/crm-handoff.ts): not implemented -----------------

async function loadHandoffService() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, service: await vite.ssrLoadModule(new URL("../domain/crm-handoff.ts", import.meta.url).pathname) };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

function fakePorts() {
  const calls = { eligibility: 0, store: 0, delivery: 0, provider: 0 };
  return {
    calls,
    eligibility: { async recheck() { calls.eligibility += 1; return { contactReady: true }; } },
    store: { async putImmutable() { calls.store += 1; } },
    delivery: { async put() { calls.delivery += 1; } },
  };
}

test("only a current Export-ready Prospect with an approved package and fresh verified, unsuppressed contact point yields a row", { todo: "07-06 not implemented" }, async () => {
  const { vite, service } = await loadHandoffService();
  try {
    const ports = fakePorts();
    const plan = await service.planCrmHandoff({ workspaceId: "workspace-one", ports });
    for (const reason of ["stale_verification", "package_revoked", "high_risk_drift", "deleted", "cross_workspace", "alias_merge"]) {
      assert.ok(plan.exclusions.some((entry) => entry.reason === reason), reason);
    }
    assert.ok(plan.rows.every((entry) => ["mailbox_verified", "source_verified"].includes(entry.verificationClass)));
    assert.ok(ports.calls.eligibility > 0, "eligibility is rechecked through the injected port");
  } finally {
    await vite.close();
  }
});

test("exact, domain, contact, organization, and company suppression each exclude separately and yield only a labelled non-contactable manifest entry", { todo: "07-06 not implemented" }, async () => {
  const { vite, service } = await loadHandoffService();
  try {
    const plan = await service.planCrmHandoff({ workspaceId: "workspace-one", ports: fakePorts() });
    for (const scope of ["exact", "domain", "contact", "organization", "company"]) {
      assert.ok(plan.exclusions.some((entry) => entry.reason === `suppressed_${scope}`), scope);
    }
    assert.ok(plan.nonContactable.every((entry) => entry.contactable === false));
    assert.ok(plan.rows.every((entry) => entry.contactValue !== undefined));
  } finally {
    await vite.close();
  }
});

test("a stale prior snapshot or UI selection cannot authorize a row once current projections change", { todo: "07-06 not implemented" }, async () => {
  const { vite, service } = await loadHandoffService();
  try {
    const result = await service.materializeCrmHandoff({ workspaceId: "workspace-one", staleSnapshotDigest: DIGEST_A, ports: fakePorts() });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "snapshot_stale");
  } finally {
    await vite.close();
  }
});

test("the service materializes an immutable version, replays on retry, and a stale snapshot never reaches the delivery port", { todo: "07-06 not implemented" }, async () => {
  const { vite, service } = await loadHandoffService();
  try {
    const ports = fakePorts();
    const first = await service.materializeCrmHandoff({ workspaceId: "workspace-one", idempotencyKey: "idem-1", ports });
    const retry = await service.materializeCrmHandoff({ workspaceId: "workspace-one", idempotencyKey: "idem-1", ports });
    assert.equal(retry.csvSha256, first.csvSha256);
    assert.equal(ports.calls.store, 1);
    assert.equal(ports.calls.provider, 0);
  } finally {
    await vite.close();
  }
});
