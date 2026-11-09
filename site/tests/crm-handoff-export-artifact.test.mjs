import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      subject: await vite.ssrLoadModule(
        new URL("../domain/crm-handoff-export-artifact.ts", import.meta.url).pathname,
      ),
      codec: await vite.ssrLoadModule(
        new URL("../domain/crm-csv-codec.ts", import.meta.url).pathname,
      ),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

const digest = (character) => character.repeat(64);

function row(patch = {}) {
  return {
    prospect_id: "synthetic-prospect-0002",
    company_id: "synthetic-company-0001",
    product_id: "synthetic-product-0001",
    market_play_id: "synthetic-market-play-0001",
    profile_id: "synthetic-profile-0001",
    account_target: "Fictional Example Mining Company",
    selected_role: "Fictional Example Operations Role",
    contact_id: "synthetic-contact-0002",
    contact_point_id: "synthetic-contact-point-0002",
    contact_kind: "email",
    contact_value: "person@example.test",
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

async function request(subject, rows = [row()], patch = {}) {
  const selectedRows = rows.map((candidate) => ({
    prospectId: candidate.prospect_id,
    contactId: candidate.contact_id,
    contactPointId: candidate.contact_point_id,
    rowDigest: rawRowDigest(subject, candidate),
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
    snapshotDigest: digest("a"),
    exportDefinitionDigest: digest("b"),
    configurationDigest: digest("c"),
    packageDigests: [digest("e"), digest("d")],
    authorizedAt: "2026-09-13T12:00:00.000Z",
    expiresAt: "2026-09-13T12:10:00.000Z",
    selectedRows,
    ...patch.selectionDraft,
  };
  const selection = {
    ...draft,
    operationDigest: await subject.digestCrmHandoffSelection(draft),
    ...patch.selection,
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
    selection,
    rows,
    ...patch.request,
  };
}

function rawRowDigest(subject, candidate) {
  return createHash("sha256")
    .update(JSON.stringify(subject.CRM_HANDOFF_EXPORT_CONTRACT.fieldIds.map((field) => candidate[field])))
    .digest("hex");
}

function code(expected) {
  return (error) => error?.code === expected;
}

test("builds one deterministic tenant-bound in-memory artifact from an exact authorized selection", async () => {
  const { vite, subject } = await load();
  try {
    const rows = [
      row({
        prospect_id: "synthetic-prospect-0002",
        contact_id: "synthetic-contact-0002",
        contact_point_id: "synthetic-contact-point-0002",
        selected_role: "\t=SYNTHETIC(\"https://example.test\")",
      }),
      row({
        prospect_id: "synthetic-prospect-0001",
        contact_id: "synthetic-contact-0001",
        contact_point_id: "synthetic-contact-point-0001",
        contact_value: "other@example.test",
      }),
    ];
    const input = await request(subject, rows);
    const first = await subject.buildCrmHandoffExportArtifact(input);
    const secondInput = await request(subject, [...rows].reverse(), {
      selectionDraft: { selectedRows: [...input.selection.selectedRows].reverse() },
    });
    const second = await subject.buildCrmHandoffExportArtifact(secondInput);

    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(first.manifest.csvSha256, second.manifest.csvSha256);
    assert.equal(first.manifest.materializationManifestSha256, second.manifest.materializationManifestSha256);
    assert.equal(first.manifest.artifactSha256, second.manifest.artifactSha256);
    assert.equal(first.manifest.selectionOperationDigest, second.manifest.selectionOperationDigest);
    assert.equal(first.manifest.tenantId, "synthetic-tenant-0001");
    assert.equal(first.manifest.workspaceId, "synthetic-workspace-0001");
    assert.equal(first.manifest.rowCount, 2);
    assert.equal(first.manifest.uniqueProspectCount, 2);
    assert.equal(first.manifest.externalExportAuthorized, false);
    assert.equal(first.manifest.operationalAuthority, false);
    assert.equal(first.validation.inMemoryMaterializationAuthorized, true);
    assert.equal(first.validation.persistenceAuthorized, false);
    assert.equal(first.validation.deliveryAuthorized, false);
    assert.equal(first.validation.downloadAuthorized, false);
    assert.equal(first.validation.providerInvocationAuthorized, false);
    assert.equal(createHash("sha256").update(first.bytes).digest("hex"), first.manifest.csvSha256);
    const { artifactSha256, ...unsignedManifest } = first.manifest;
    assert.equal(createHash("sha256").update(JSON.stringify(unsignedManifest)).digest("hex"), artifactSha256);
    assert.match(new TextDecoder().decode(first.bytes), /'\t=SYNTHETIC/u);

    const otherTenantInput = await request(subject, rows, {
      selectionDraft: { tenantId: "synthetic-tenant-0002" },
    });
    const otherTenant = await subject.buildCrmHandoffExportArtifact(otherTenantInput);
    assert.deepEqual(first.bytes, otherTenant.bytes);
    assert.notEqual(first.manifest.artifactSha256, otherTenant.manifest.artifactSha256);

    const changed = first.bytes;
    changed[0] ^= 0xff;
    assert.equal(createHash("sha256").update(first.bytes).digest("hex"), first.manifest.csvSha256);
  } finally {
    await vite.close();
  }
});

test("validation requires an explicit intact authorization for the exact selected row set", async () => {
  const { vite, subject } = await load();
  try {
    const input = await request(subject);
    const validation = await subject.validateCrmHandoffExportRequest(input);
    assert.equal(validation.accepted, true);
    assert.equal(validation.operationDigest, input.selection.operationDigest);
    assert.equal(validation.rowCount, 1);

    await assert.rejects(
      subject.validateCrmHandoffExportRequest({
        ...input,
        selection: { ...input.selection, decision: "denied" },
      }),
      code("crm_handoff_export_selection_unauthorized"),
    );
    await assert.rejects(
      subject.validateCrmHandoffExportRequest({
        ...input,
        selection: { ...input.selection, operationDigest: digest("f") },
      }),
      code("crm_handoff_export_selection_mismatch"),
    );
    await assert.rejects(
      subject.validateCrmHandoffExportRequest({
        ...input,
        rows: [{ ...input.rows[0], selected_role: "\t=SYNTHETIC(\"https://example.test\")" }],
      }),
      code("crm_handoff_export_selection_mismatch"),
    );
    await assert.rejects(
      subject.validateCrmHandoffExportRequest({ ...input, rows: [] }),
      code("crm_handoff_export_selection_mismatch"),
    );
    await assert.rejects(
      subject.validateCrmHandoffExportRequest({ ...input, rows: [...input.rows, row({ prospect_id: "synthetic-prospect-0003", contact_id: "synthetic-contact-0003", contact_point_id: "synthetic-contact-point-0003" })] }),
      code("crm_handoff_export_selection_mismatch"),
    );
  } finally {
    await vite.close();
  }
});

test("rejects cross-tenant and stale current projections before materialization", async () => {
  const { vite, subject } = await load();
  try {
    const input = await request(subject);
    const cases = [
      [{ ...input, current: { ...input.current, tenantId: "synthetic-tenant-0002" } }, "crm_handoff_export_cross_tenant"],
      [{ ...input, current: { ...input.current, workspaceId: "synthetic-workspace-0002" } }, "crm_handoff_export_cross_tenant"],
      [{ ...input, rows: [{ ...input.rows[0], source_workspace_id: "synthetic-workspace-0002" }] }, "crm_handoff_export_cross_tenant"],
      [{ ...input, current: { ...input.current, selectionRevision: 8 } }, "crm_handoff_export_stale"],
      [{ ...input, current: { ...input.current, authorityRevision: 12 } }, "crm_handoff_export_stale"],
      [{ ...input, current: { ...input.current, snapshotDigest: digest("f") } }, "crm_handoff_export_stale"],
      [{ ...input, evaluatedAt: input.selection.expiresAt }, "crm_handoff_export_stale"],
      [{ ...input, evaluatedAt: "2026-09-13T11:59:59.999Z" }, "crm_handoff_export_stale"],
    ];
    for (const [candidate, expected] of cases) {
      await assert.rejects(subject.buildCrmHandoffExportArtifact(candidate), code(expected));
    }
  } finally {
    await vite.close();
  }
});

test("keeps the documented schema closed and rejects non-synthetic contact values", async () => {
  const { vite, subject } = await load();
  try {
    const input = await request(subject);
    assert.deepEqual(subject.CRM_HANDOFF_EXPORT_CONTRACT.fieldIds, [
      "prospect_id", "company_id", "product_id", "market_play_id", "profile_id",
      "account_target", "selected_role", "contact_id", "contact_point_id", "contact_kind",
      "contact_value", "verification_class", "verification_method_ref", "verification_time",
      "qualification_score_ref", "evidence_refs", "offer_ref", "package_ref", "activity_status",
      "source_workspace_id", "source_run_id", "export_manifest_ref",
    ]);
    for (const forbidden of ["display_name", "first_name", "last_name", "street_address", "notes"]) {
      assert.equal(subject.CRM_HANDOFF_EXPORT_CONTRACT.fieldIds.includes(forbidden), false);
    }
    await assert.rejects(
      subject.buildCrmHandoffExportArtifact({
        ...input,
        rows: [{ ...input.rows[0], contact_value: "real@example.com" }],
      }),
      code("crm_handoff_export_not_synthetic"),
    );
    await assert.rejects(
      subject.buildCrmHandoffExportArtifact({
        ...input,
        rows: [{ ...input.rows[0], notes: "not an allowed export column" }],
      }),
      code("crm_handoff_export_input_invalid"),
    );
  } finally {
    await vite.close();
  }
});

test("rejects real-looking material in every exported field and authority identifier", async () => {
  const { vite, subject } = await load();
  try {
    const realLookingByField = {
      prospect_id: "prospect-1042",
      company_id: "acme-mining",
      product_id: "operations-platform",
      market_play_id: "canadian-mining",
      profile_id: "enterprise-profile",
      account_target: "Acme Mining Incorporated",
      selected_role: "Chief Operating Officer",
      contact_id: "contact-742",
      contact_point_id: "primary-email",
      contact_kind: "linkedin",
      contact_value: "operator@acme.example",
      verification_class: "mailbox_verified",
      verification_method_ref: "provider-verification-88",
      verification_time: "2026-09-13T12:00:00.000Z",
      qualification_score_ref: "qualification-9-of-10",
      evidence_refs: "evidence-real",
      offer_ref: "offer-enterprise",
      package_ref: "package-approved",
      activity_status: "contacted",
      source_workspace_id: "workspace-production",
      source_run_id: "run-2026-09-13",
      export_manifest_ref: "manifest-2026-09-13",
    };
    const selectionIdentityFields = new Set(["prospect_id", "contact_id", "contact_point_id"]);
    for (const field of subject.CRM_HANDOFF_EXPORT_CONTRACT.fieldIds) {
      const candidate = row({ [field]: realLookingByField[field] });
      if (selectionIdentityFields.has(field)) {
        await assert.rejects(request(subject, [candidate]), code("crm_handoff_export_not_synthetic"), field);
        continue;
      }
      const input = await request(subject, [candidate]);
      await assert.rejects(
        subject.validateCrmHandoffExportRequest(input),
        code("crm_handoff_export_not_synthetic"),
        field,
      );
    }

    for (const [scope, patch] of [
      ["tenantId", { selectionDraft: { tenantId: "tenant-production" } }],
      ["workspaceId", { selectionDraft: { workspaceId: "workspace-production" } }],
      ["selectionId", { selectionDraft: { selectionId: "selection-production" } }],
      ["synthetic-looking tenantId", { selectionDraft: { tenantId: "synthetic-tenant-production" } }],
    ]) {
      await assert.rejects(request(subject, [row()], patch), code("crm_handoff_export_not_synthetic"), scope);
    }
    for (const candidate of [
      row({ account_target: "Synthetic Acme Mining Incorporated" }),
      row({ company_id: "synthetic-company-acme" }),
    ]) {
      await assert.rejects(
        subject.validateCrmHandoffExportRequest(await request(subject, [candidate])),
        code("crm_handoff_export_not_synthetic"),
      );
    }
    const valid = await request(subject);
    await assert.rejects(
      subject.validateCrmHandoffExportRequest({
        ...valid,
        current: { ...valid.current, tenantId: "tenant-production" },
      }),
      code("crm_handoff_export_not_synthetic"),
    );
  } finally {
    await vite.close();
  }
});

test("rejects invalid Unicode in every field before row authorization", async () => {
  const { vite, subject } = await load();
  try {
    for (const field of subject.CRM_HANDOFF_EXPORT_CONTRACT.fieldIds) {
      await assert.rejects(
        subject.digestCrmHandoffExportRow(row({ [field]: "\ud800" })),
        code("crm_handoff_export_input_invalid"),
        field,
      );
    }
    await assert.rejects(
      subject.validateCrmHandoffExportRequest(await request(subject, [row({ account_target: "Synthetic\ud800" })])),
      code("crm_handoff_export_input_invalid"),
    );
  } finally {
    await vite.close();
  }
});

test("runs complete CSV normalization and every codec limit before accepting materialization", async () => {
  const { vite, subject, codec } = await load();
  try {
    const valid = await request(subject);
    const withExtraArrayKey = [row()];
    Object.defineProperty(withExtraArrayKey, "extra", { value: true, enumerable: true });

    const maxRows = Array.from({ length: codec.CRM_CSV_LIMITS.maxRows + 1 }, () => row());
    const overCell = [row({ account_target: "x".repeat(codec.CRM_CSV_LIMITS.maxCellUtf8Bytes + 1) })];
    const overStableId = [row({ prospect_id: `synthetic-${"a".repeat(codec.CRM_CSV_LIMITS.maxStableIdUtf8Bytes)}` })];
    const overInput = Array.from({ length: 257 }, (_, index) => codecLimitRow(
      subject,
      index,
      "x".repeat(codec.CRM_CSV_LIMITS.maxCellUtf8Bytes),
    ));
    const overOutput = Array.from({ length: 256 }, (_, index) => codecLimitRow(
      subject,
      index,
      "\"".repeat(32_760),
    ));

    for (const [label, rows] of [
      ["array normalization", withExtraArrayKey],
      ["row count", maxRows],
      ["cell bytes", overCell],
      ["stable identifier bytes", overStableId],
      ["aggregate input bytes", overInput],
      ["encoded output bytes", overOutput],
    ]) {
      await assert.rejects(
        subject.validateCrmHandoffExportRequest({ ...valid, rows }),
        code("crm_handoff_export_input_invalid"),
        label,
      );
    }
  } finally {
    await vite.close();
  }
});

test("the builder is offline, side-effect free, and absent from runtime composition", async () => {
  const source = await readFile(new URL("../domain/crm-handoff-export-artifact.ts", import.meta.url), "utf8");
  for (const [label, forbidden] of [
    ["network calls", /\bfetch\s*\(/u],
    ["filesystem imports", /from\s+["']node:fs/u],
    ["filesystem writes", /\bwriteFile\s*\(/u],
    ["download invocation", /\bdownload\s*\(/u],
    ["response delivery", /Content-Disposition/u],
    ["adapters", /from\s+["']\.\.\/adapters/u],
    ["database", /from\s+["']\.\.\/db/u],
    ["worker", /from\s+["']\.\.\/worker/u],
  ]) {
    assert.doesNotMatch(source, forbidden, `source must exclude ${label}`);
  }

  const siteRoot = resolve(import.meta.dirname, "..");
  const runtimeFiles = [
    ...await sourceFiles(join(siteRoot, "app")),
    ...await sourceFiles(join(siteRoot, "adapters")),
    ...await sourceFiles(join(siteRoot, "worker"), true),
  ];
  for (const file of runtimeFiles) {
    const runtimeSource = await readFile(file, "utf8");
    assert.equal(runtimeSource.includes("crm-handoff-export-artifact"), false, `${file} must not compose the builder`);
  }
});

async function sourceFiles(directory, optional = false) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (optional && error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

function codecLimitRow(subject, index, accountTarget) {
  return {
    ...Object.fromEntries(subject.CRM_HANDOFF_EXPORT_CONTRACT.fieldIds.map((field) => [field, null])),
    prospect_id: `p${index}`,
    contact_id: "c",
    contact_point_id: `q${index}`,
    account_target: accountTarget,
  };
}
