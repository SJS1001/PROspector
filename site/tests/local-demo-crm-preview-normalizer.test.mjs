import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_780_000_000_000;

function validBody(overrides = {}, decisionOverrides = {}, previewOverrides = {}) {
  return {
    kind: "crm_handoff_local_demo_preview",
    fictional: true,
    decision: {
      admitted: [],
      refused: [{ prospectId: "demo-prospect-1", reason: "crm_export_recheck_blocked" }],
      admittedRowCount: 0,
      refusedCount: 2,
      uniqueProspectCount: 2,
      effects: { evaluatedAt: NOW },
      ...decisionOverrides,
    },
    preview: {
      previewRowsAreFictionalAndUnadmitted: true,
      schemaVersion: "crm-handoff-csv/v1",
      encoding: "utf-8",
      byteOrderMark: false,
      recordSeparator: "\r\n",
      byteLength: 128,
      sha256: "b".repeat(64),
      text: "prospect_id\r\ndemo-prospect-1\r\n",
      ...previewOverrides,
    },
    exportAuthorized: false,
    deliveryAuthorized: false,
    downloadAuthorized: false,
    persistenceAuthorized: false,
    providerInvocationAuthorized: false,
    ...overrides,
  };
}

test("normalizeCrmPreview accepts only a zero-admission fictional response and fails closed on every other shape", async () => {
  await withView(async (view) => {
    const good = view.normalizeCrmPreview(validBody());
    assert.deepEqual(good, {
      admittedRowCount: 0,
      refusedCount: 2,
      schemaVersion: "crm-handoff-csv/v1",
      encoding: "utf-8",
      byteLength: 128,
      sha256: "b".repeat(64),
      text: "prospect_id\r\ndemo-prospect-1\r\n",
    });

    // The load-bearing checks the coordinator flagged: a claimed real
    // admission -- by count, by a nonempty admitted array, or both --
    // must never render as a working preview, even if internally consistent.
    assert.equal(view.normalizeCrmPreview(validBody({}, { admittedRowCount: 1 })), null, "nonzero admittedRowCount rejects");
    assert.equal(view.normalizeCrmPreview(validBody({}, { admittedRowCount: -1 })), null, "negative admittedRowCount rejects");
    assert.equal(
      view.normalizeCrmPreview(validBody({}, { admitted: [{ prospectId: "demo-prospect-1" }] })),
      null,
      "a nonempty admitted array rejects even when admittedRowCount stays 0",
    );
    assert.equal(view.normalizeCrmPreview(validBody({}, { admitted: "not-an-array" })), null, "a non-array admitted field rejects");
    assert.equal(view.normalizeCrmPreview(validBody({}, { admitted: undefined })), null, "a missing admitted field rejects");

    // refusedCount must be a real nonnegative safe integer.
    assert.equal(view.normalizeCrmPreview(validBody({}, { refusedCount: -1 })), null, "negative refusedCount rejects");
    assert.equal(view.normalizeCrmPreview(validBody({}, { refusedCount: 1.5 })), null, "fractional refusedCount rejects");
    assert.equal(view.normalizeCrmPreview(validBody({}, { refusedCount: "2" })), null, "string refusedCount rejects");
    assert.equal(view.normalizeCrmPreview(validBody({}, { refusedCount: Number.MAX_SAFE_INTEGER + 1 })), null, "unsafe-integer refusedCount rejects");
    assert.equal(view.normalizeCrmPreview(validBody({}, { refusedCount: undefined })), null, "missing refusedCount rejects");

    // Every external-effect authorization flag must be exactly false.
    for (const flag of ["exportAuthorized", "deliveryAuthorized", "downloadAuthorized", "persistenceAuthorized", "providerInvocationAuthorized"]) {
      assert.equal(view.normalizeCrmPreview(validBody({ [flag]: true })), null, `${flag}: true rejects`);
      assert.equal(view.normalizeCrmPreview(validBody({ [flag]: undefined })), null, `missing ${flag} rejects`);
    }

    // Envelope and preview-provenance checks.
    assert.equal(view.normalizeCrmPreview(validBody({ kind: "other" })), null, "wrong kind rejects");
    assert.equal(view.normalizeCrmPreview(validBody({ fictional: false })), null, "fictional: false rejects");
    assert.equal(
      view.normalizeCrmPreview(validBody({}, {}, { previewRowsAreFictionalAndUnadmitted: false })),
      null,
      "a preview claiming its rows were admitted rejects",
    );
    assert.equal(
      view.normalizeCrmPreview(validBody({}, {}, { previewRowsAreFictionalAndUnadmitted: undefined })),
      null,
      "a missing fictional-provenance flag rejects",
    );

    // Structural/hostile shapes never throw and never normalize.
    for (const hostile of [null, undefined, "string", 42, [], { decision: null }, { decision: {}, preview: null }]) {
      assert.equal(view.normalizeCrmPreview(hostile), null);
    }
  });
});

async function withView(assertion) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const view = await vite.ssrLoadModule(
      new URL("../app/local-demo/_screen.tsx", import.meta.url).pathname,
    );
    await assertion(view);
  } finally {
    await vite.close();
  }
}
