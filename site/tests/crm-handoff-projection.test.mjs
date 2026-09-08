/**
 * CRM handoff decision and row projection.
 *
 * The headline property: a contact whose evidence projects ContactReady is
 * still refused, because `recheckForCrmExport` reports the CRM export boundary
 * blocked. Production stays reject-only and nothing here seeds around approval.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const MODULE_URL = new URL("../domain/crm-handoff-projection.ts", import.meta.url);
const NOW = Date.parse("2026-09-08T12:00:00.000Z");
const DIGEST = "a".repeat(64);
const EFFECT_KEYS = Object.freeze([
  "csvSerializations",
  "checksumCalculations",
  "exportMutations",
  "deliveryInvocations",
  "downloadInvocations",
  "durableMutations",
  "providerCalls",
]);

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return {
      vite,
      handoff: await vite.ssrLoadModule(MODULE_URL.pathname),
      eligibility: await vite.ssrLoadModule(
        new URL("../domain/contact-eligibility.ts", import.meta.url).pathname,
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

/**
 * The strongest input this seam can be handed: a fresh mailbox-verified point
 * under a current, non-suppressed, non-drifted authority. Used to prove the
 * boundary still refuses it.
 */
function readyEligibilityInput(patch = {}) {
  return {
    now: NOW,
    target: {
      workspaceId: "workspace-1",
      prospectId: "prospect-1",
      contactId: "contact-1",
    },
    strategy: {
      configurationId: "configuration-1",
      configurationDigest: DIGEST,
    },
    authority: {
      prospectId: "prospect-1",
      configurationId: "configuration-1",
      configurationDigest: DIGEST,
      profileAvailable: true,
      configurationCurrent: true,
      drifted: false,
      disqualified: false,
      suppressed: false,
      phase4Approved: true,
      contactCapabilityEnabled: true,
    },
    points: [],
    ...patch,
  };
}

function cells(patch = {}) {
  return {
    prospect_id: "prospect-1",
    contact_id: "contact-1",
    contact_point_id: "point-1",
    contact_kind: "email",
    contact_value: "fictional.person@example.test",
    ...patch,
  };
}

function candidate(patch = {}) {
  return {
    prospectId: "prospect-1",
    contactId: "contact-1",
    contactPointId: "point-1",
    eligibilityInput: readyEligibilityInput(),
    cells: cells(),
    ...patch,
  };
}

test("the CRM export boundary refuses every candidate, including a fully current one", async () => {
  const { vite, handoff, eligibility } = await load();
  try {
    // Establish from the real contract that this boundary is closed by design.
    const recheck = eligibility.recheckForCrmExport(readyEligibilityInput());
    assert.equal(recheck.blocked, true, "recheckForCrmExport must report blocked");
    assert.equal(recheck.boundary, "crm_export");

    const decision = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [candidate()],
    });
    assert.equal(decision.kind, "crm_handoff_decision");
    assert.deepEqual([...decision.admitted], [], "nothing may be admitted while the boundary is blocked");
    assert.equal(decision.admittedRowCount, 0);
    assert.equal(decision.refusedCount, 1);
    assert.equal(decision.refused[0].reasonCodes.includes("crm_export_recheck_blocked"), true);
    assert.equal(decision.uniqueProspectCount, 1);
  } finally {
    await vite.close();
  }
});

test("the refusal reports the eligibility the real contract projected, never its own", async () => {
  const { vite, handoff, eligibility } = await load();
  try {
    const input = readyEligibilityInput();
    const projected = eligibility.projectContactEligibility(input);
    const decision = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [candidate({ eligibilityInput: input })],
    });
    const refusal = decision.refused[0];
    assert.equal(refusal.eligibilityState, projected.state);
    assert.deepEqual([...refusal.eligibilityReasonCodes], [...projected.reasonCodes]);
  } finally {
    await vite.close();
  }
});

test("a suppressed contact is reported non-contactable and never reaches admitted", async () => {
  const { vite, handoff } = await load();
  try {
    const suppressed = readyEligibilityInput({
      authority: {
        ...readyEligibilityInput().authority,
        suppressed: true,
      },
    });
    const decision = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [candidate({ eligibilityInput: suppressed })],
    });
    assert.deepEqual([...decision.admitted], []);
    const refusal = decision.refused[0];
    assert.equal(refusal.eligibilityState, "NonContactable");
    assert.equal(refusal.reasonCodes.includes("contact_non_contactable"), true);
    // Suppression never silently downgrades to a generic ineligibility.
    assert.equal(refusal.reasonCodes.includes("contact_not_eligible"), false);
  } finally {
    await vite.close();
  }
});

test("row identity is Prospect plus contact point: exact repeats collapse, conflicts fail closed", async () => {
  const { vite, handoff } = await load();
  try {
    const base = candidate();
    const collapsed = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [base, { ...base }],
    });
    assert.equal(collapsed.refusedCount, 1, "an exact repeat collapses");
    assert.equal(collapsed.uniqueProspectCount, 1);

    const conflicting = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [base, { ...base, cells: cells({ contact_value: "other@example.test" }) }],
    });
    assert.equal(
      conflicting.refused.some((item) => item.reasonCodes.includes("duplicate_identity_conflict")),
      true,
      "the same identity carrying different material must fail closed",
    );

    // Contact ID is part of the row signature but not of row identity.
    const contactConflict = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [base, { ...base, contactId: "contact-2" }],
    });
    assert.equal(
      contactConflict.refused.some((item) => item.reasonCodes.includes("duplicate_identity_conflict")),
      true,
    );

    // A different contact point is a distinct row, not a conflict.
    const distinct = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [base, {
        ...base,
        contactPointId: "point-2",
        cells: cells({ contact_point_id: "point-2" }),
      }],
    });
    assert.equal(
      distinct.refused.some((item) => item.reasonCodes.includes("duplicate_identity_conflict")),
      false,
    );
    assert.equal(distinct.refusedCount, 2);
  } finally {
    await vite.close();
  }
});

test("the row projection is the codec's closed field order, inventing nothing", async () => {
  const { vite, handoff, codec } = await load();
  try {
    const row = handoff.projectCrmHandoffRow(cells());
    assert.deepEqual(Object.keys(row), [...codec.CRM_CSV_FIELD_IDS]);
    assert.equal(Object.isFrozen(row), true);
    assert.equal(row.contact_value, "fictional.person@example.test");
    // An unsupplied field is null, which the codec's null policy renders empty.
    assert.equal(row.offer_ref, null);
    assert.equal(row.export_manifest_ref, null);

    // The decision reports the same schema the codec declares, by reference.
    const decision = handoff.projectCrmHandoff({ evaluatedAt: NOW, candidates: [] });
    assert.equal(decision.schemaVersion, codec.CRM_CSV_SCHEMA_VERSION);
    assert.deepEqual([...decision.fieldIds], [...codec.CRM_CSV_FIELD_IDS]);

    // An unknown or non-string cell rejects rather than being coerced.
    assert.throws(() => handoff.projectCrmHandoffRow({ ...cells(), unknown_field: "x" }));
    assert.throws(() => handoff.projectCrmHandoffRow({ ...cells(), contact_value: 7 }));
  } finally {
    await vite.close();
  }
});

test("every authority stays false and every effect counter stays zero", async () => {
  const { vite, handoff } = await load();
  try {
    const decision = handoff.projectCrmHandoff({
      evaluatedAt: NOW,
      candidates: [candidate(), candidate({
        prospectId: "prospect-2",
        contactPointId: "point-9",
        cells: cells({ prospect_id: "prospect-2", contact_point_id: "point-9" }),
      })],
    });
    assert.equal(Object.isFrozen(decision), true);
    assert.equal(Object.isFrozen(decision.effects), true);
    assert.deepEqual(Object.keys(decision.effects).sort(), [...EFFECT_KEYS].sort());
    for (const [key, value] of Object.entries(decision.effects)) {
      assert.equal(value, 0, `${key} must stay zero`);
    }
    for (const [key, value] of Object.entries(decision)) {
      if (key.endsWith("Authorized")) assert.equal(value, false, `${key} must stay false`);
    }
    // No byte, checksum, file, or delivery material may appear on the decision.
    for (const key of ["bytes", "sha256", "byteLength", "mediaType", "checksum", "filename", "url"]) {
      assert.equal(Object.hasOwn(decision, key), false, `decision must not expose ${key}`);
    }
  } finally {
    await vite.close();
  }
});

test("hostile, sparse, accessor, and malformed candidate shapes reject", async () => {
  const { vite, handoff } = await load();
  try {
    const accessor = Object.defineProperty(candidate(), "cells", {
      enumerable: true,
      get() { throw new Error("must-not-run"); },
    });
    const cases = [
      null,
      {},
      { evaluatedAt: NOW },
      { evaluatedAt: NOW, candidates: {} },
      { evaluatedAt: 0, candidates: [] },
      { evaluatedAt: NOW, candidates: [{ ...candidate(), extra: "no" }] },
      { evaluatedAt: NOW, candidates: [{ ...candidate(), prospectId: "" }] },
      { evaluatedAt: NOW, candidates: [{ ...candidate(), prospectId: "../escape" }] },
      { evaluatedAt: NOW, candidates: [accessor] },
      { evaluatedAt: NOW, candidates: [new Proxy(candidate(), {
        ownKeys() { throw new Error("must-not-run"); },
      })] },
    ];
    for (const [index, value] of cases.entries()) {
      assert.throws(() => handoff.projectCrmHandoff(value), `case ${index}`);
    }
  } finally {
    await vite.close();
  }
});

test("the module composes the real boundary and materializes no CSV", async () => {
  const source = await readFile(MODULE_URL, "utf8");

  // It must reach the boundary through the real contract, not restate it.
  assert.match(source, /import \{[\s\S]*?recheckForCrmExport[\s\S]*?\} from "\.\/contact-eligibility"/u);
  assert.match(source, /recheckForCrmExport\(/u);

  // Field order comes from the codec constant, so it cannot drift.
  assert.match(source, /CRM_CSV_FIELD_IDS/u);

  // It must never encode, hash, persist, deliver, or reach a binding.
  // The doc comment names encodeCrmCsv to say it is never called, so assert the
  // absence of a call and of an import rather than of the word itself.
  assert.doesNotMatch(source, /encodeCrmCsv\s*\(/u, "no CSV bytes may be produced here");
  assert.doesNotMatch(source, /import \{[^}]*\bencodeCrmCsv\b[^}]*\} from/u, "the encoder must not be imported");
  for (const forbidden of [
    "crypto.subtle", "TextEncoder", "Blob(", "Buffer.from", "Content-Disposition",
    "fetch(", "node:fs", "process.env", "import.meta.env", "D1Database", "R2Bucket",
    "INSERT INTO", "localStorage",
  ]) assert.equal(source.includes(forbidden), false, `must not reference ${forbidden}`);

  // No preparation module may be imported by this runtime seam.
  for (const match of source.matchAll(/\bfrom\s*["']([^"']+)["']/gu)) {
    assert.doesNotMatch(match[1], /(?:^|\/)preparation(?:\/|$)/u, match[1]);
  }
});
