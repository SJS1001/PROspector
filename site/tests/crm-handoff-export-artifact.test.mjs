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
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

const digest = (character) => character.repeat(64);

function row(patch = {}) {
  return {
    prospect_id: "prospect-synthetic-2",
    company_id: "company-synthetic",
    product_id: "product-synthetic",
    market_play_id: "play-synthetic",
    profile_id: "profile-synthetic",
    account_target: "Synthetic Northern Metals",
    selected_role: "Operations lead",
    contact_id: "contact-synthetic-2",
    contact_point_id: "point-synthetic-2",
    contact_kind: "email",
    contact_value: "person@example.test",
    verification_class: "mailbox_verified",
    verification_method_ref: "verification-synthetic",
    verification_time: "2026-09-13T12:00:00.000Z",
    qualification_score_ref: "score-synthetic",
    evidence_refs: "evidence-synthetic",
    offer_ref: "offer-synthetic",
    package_ref: "package-synthetic",
    activity_status: "approved",
    source_workspace_id: "workspace-synthetic",
    source_run_id: "run-synthetic",
    export_manifest_ref: "manifest-synthetic",
    ...patch,
  };
}

async function request(subject, rows = [row()], patch = {}) {
  const selectedRows = await Promise.all(rows.map(async (candidate) => ({
    prospectId: candidate.prospect_id,
    contactId: candidate.contact_id,
    contactPointId: candidate.contact_point_id,
    rowDigest: await subject.digestCrmHandoffExportRow(candidate),
  })));
  const draft = {
    schema: "prospector/crm-handoff-selection/v1",
    decision: "authorized",
    dataClassification: "synthetic",
    tenantId: "tenant-synthetic",
    workspaceId: "workspace-synthetic",
    selectionId: "selection-synthetic",
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

function code(expected) {
  return (error) => error?.code === expected;
}

test("builds one deterministic tenant-bound in-memory artifact from an exact authorized selection", async () => {
  const { vite, subject } = await load();
  try {
    const rows = [
      row({
        prospect_id: "prospect-synthetic-b",
        contact_id: "contact-synthetic-b",
        contact_point_id: "point-synthetic-b",
        selected_role: "\t=HYPERLINK(\"https://example.test\")",
      }),
      row({
        prospect_id: "prospect-synthetic-a",
        contact_id: "contact-synthetic-a",
        contact_point_id: "point-synthetic-a",
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
    assert.equal(first.manifest.tenantId, "tenant-synthetic");
    assert.equal(first.manifest.workspaceId, "workspace-synthetic");
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
    assert.match(new TextDecoder().decode(first.bytes), /'\t=HYPERLINK/u);

    const otherTenantInput = await request(subject, rows, {
      selectionDraft: { tenantId: "tenant-other-synthetic" },
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
        rows: [{ ...input.rows[0], selected_role: "changed after selection" }],
      }),
      code("crm_handoff_export_selection_mismatch"),
    );
    await assert.rejects(
      subject.validateCrmHandoffExportRequest({ ...input, rows: [] }),
      code("crm_handoff_export_selection_mismatch"),
    );
    await assert.rejects(
      subject.validateCrmHandoffExportRequest({ ...input, rows: [...input.rows, row({ prospect_id: "prospect-synthetic-extra", contact_id: "contact-synthetic-extra", contact_point_id: "point-synthetic-extra" })] }),
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
      [{ ...input, current: { ...input.current, tenantId: "tenant-other" } }, "crm_handoff_export_cross_tenant"],
      [{ ...input, current: { ...input.current, workspaceId: "workspace-other" } }, "crm_handoff_export_cross_tenant"],
      [{ ...input, rows: [{ ...input.rows[0], source_workspace_id: "workspace-other" }] }, "crm_handoff_export_cross_tenant"],
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
