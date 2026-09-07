import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

/**
 * Machine-enforced conformance check between the modelled `ProspectState`
 * union in `domain/weekly-outcome.ts` and the persisted `profile_prospects`
 * state contract in `db/schema.ts`.
 *
 * Phase 7 persistence work is gated and unimplemented, so most weekly-outcome
 * states have no persisted counterpart yet. This test does not claim they do.
 * Instead, every modelled state must be exactly one of:
 *   - "backed": its snake_case form appears in the persisted
 *     `profile_prospects.state` enum, or
 *   - present in `UNBACKED_PROSPECT_STATES` below, an explicit, exact
 *     allowlist labelled unbacked/pending the gated Phase 7 persistence work.
 *
 * The allowlist must equal the unbacked set exactly (no more, no fewer) so
 * that adding a new `ProspectState` literal, renaming one, or narrowing the
 * persisted enum without updating this file fails the test instead of
 * silently diverging.
 */

// Exact, test-local allowlist of ProspectState literals that currently have
// no corresponding persisted profile_prospects.state value. Each is unbacked
// pending the gated Phase 7 persistence work; this grants no runtime,
// migration, or operational authority.
const UNBACKED_PROSPECT_STATES = Object.freeze([
  "Candidate",
  "NotQualified",
  "InsufficientEvidence",
  "Disqualified",
  "ContactReady",
  "PackageReady",
  "ExportReady",
  "Contacted",
  "NeedsReview",
  "NonContactable",
]);

// The reverse direction of the same gap: persisted profile_prospects.state
// values the reducer does not model. A history stream carrying one of these
// cannot be reduced today, so a future adapter must map or reject it rather
// than pass it through. This grants no runtime, migration, or operational
// authority either.
const UNMODELLED_PERSISTED_STATES = Object.freeze([
  "cooled_down",
]);

// History event kinds `domain/weekly-outcome.ts` consumes. None is persistable
// yet; see the event-kind test below for why that is asserted rather than
// assumed.
const MODELLED_HISTORY_EVENT_KINDS = Object.freeze([
  "prospect_created",
  "state_transition",
  "contact_linked",
]);

async function loadModule(relativePath) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return await vite.ssrLoadModule(new URL(relativePath, import.meta.url).pathname);
  } finally {
    await vite.close();
  }
}

async function readProspectStateLiterals() {
  const source = await readFile(
    new URL("../domain/weekly-outcome.ts", import.meta.url),
    "utf8",
  );
  const declaration = /export type ProspectState =\s*([^;]+);/u.exec(source);
  assert.ok(declaration, "expected an exported ProspectState union declaration");
  const literals = [...declaration[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  assert.ok(literals.length > 0, "expected at least one ProspectState literal");
  assert.equal(
    new Set(literals).size,
    literals.length,
    "ProspectState union must not repeat a literal",
  );
  return literals;
}

/**
 * Reads the runtime `STATES` array the reducer actually enforces, which is a
 * separate hand-maintained copy of the `ProspectState` union above it.
 */
async function readProspectStateRuntimeList() {
  const source = await readFile(
    new URL("../domain/weekly-outcome.ts", import.meta.url),
    "utf8",
  );
  const declaration = /const STATES: readonly ProspectState\[\] = \[([^\]]+)\]/u.exec(source);
  assert.ok(declaration, "expected a runtime STATES array of ProspectState literals");
  const literals = [...declaration[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  assert.ok(literals.length > 0, "expected at least one STATES literal");
  return literals;
}

function pascalToPersistedSnakeCase(value) {
  return value.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
}

test("every ProspectState literal is either persisted or an explicit unbacked allowlist entry", async () => {
  const prospectStates = await readProspectStateLiterals();
  const schema = await loadModule("../db/schema.ts");
  const persistedStates = schema.profileProspects.state.enumValues;
  assert.ok(Array.isArray(persistedStates) && persistedStates.length > 0,
    "expected profile_prospects.state to declare an enum contract");

  const unbackedAllowlist = new Set(UNBACKED_PROSPECT_STATES);
  assert.equal(
    unbackedAllowlist.size,
    UNBACKED_PROSPECT_STATES.length,
    "UNBACKED_PROSPECT_STATES must not repeat an entry",
  );

  const backed = [];
  const unbacked = [];
  for (const state of prospectStates) {
    if (persistedStates.includes(pascalToPersistedSnakeCase(state))) {
      backed.push(state);
    } else {
      unbacked.push(state);
    }
  }

  const stray = UNBACKED_PROSPECT_STATES.filter((state) => !prospectStates.includes(state));
  assert.deepEqual(
    stray,
    [],
    `UNBACKED_PROSPECT_STATES lists states no longer present in ProspectState: ${stray.join(", ")}`,
  );

  const nowBacked = UNBACKED_PROSPECT_STATES.filter((state) => backed.includes(state));
  assert.deepEqual(
    nowBacked,
    [],
    `these states are now backed by the persisted contract and must be removed from the allowlist: ${nowBacked.join(", ")}`,
  );

  const undeclared = unbacked.filter((state) => !unbackedAllowlist.has(state));
  assert.deepEqual(
    undeclared,
    [],
    `these ProspectState literals are unbacked but missing from UNBACKED_PROSPECT_STATES: ${undeclared.join(", ")}`,
  );

  assert.deepEqual(
    [...unbacked].sort(),
    [...UNBACKED_PROSPECT_STATES].sort(),
    "the unbacked ProspectState set must exactly equal UNBACKED_PROSPECT_STATES",
  );
});

test("the reducer's enforced STATES array matches its ProspectState union exactly", async () => {
  const declared = await readProspectStateLiterals();
  const enforced = await readProspectStateRuntimeList();

  assert.equal(
    new Set(enforced).size,
    enforced.length,
    "the runtime STATES array must not repeat a state",
  );
  assert.deepEqual(
    [...enforced].sort(),
    [...declared].sort(),
    "the runtime STATES array and the ProspectState union are separate hand-"
    + "maintained copies; they must list exactly the same states",
  );
});

test("every persisted prospect state is either modelled or an explicit unmodelled allowlist entry", async () => {
  const modelled = new Set((await readProspectStateLiterals()).map(pascalToPersistedSnakeCase));
  const schema = await loadModule("../db/schema.ts");
  const persistedStates = schema.profileProspects.state.enumValues;
  assert.ok(Array.isArray(persistedStates) && persistedStates.length > 0,
    "expected profile_prospects.state to declare an enum contract");

  const unmodelled = persistedStates.filter((state) => !modelled.has(state));

  const stray = UNMODELLED_PERSISTED_STATES.filter((state) => !persistedStates.includes(state));
  assert.deepEqual(
    stray,
    [],
    `UNMODELLED_PERSISTED_STATES lists values profile_prospects.state no longer declares: ${stray.join(", ")}`,
  );

  const nowModelled = UNMODELLED_PERSISTED_STATES.filter((state) => modelled.has(state));
  assert.deepEqual(
    nowModelled,
    [],
    `these persisted values are now modelled by the reducer and must be removed from the allowlist: ${nowModelled.join(", ")}`,
  );

  assert.deepEqual(
    [...unmodelled].sort(),
    [...UNMODELLED_PERSISTED_STATES].sort(),
    "the unmodelled persisted set must exactly equal UNMODELLED_PERSISTED_STATES",
  );
});

test("no persisted event kind can yet carry a modelled prospect history event", async () => {
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );

  const persistable = MODELLED_HISTORY_EVENT_KINDS.filter((kind) => schema.includes(`"${kind}"`));
  assert.deepEqual(
    persistable,
    [],
    "db/schema.ts now declares these modelled history event kinds: "
    + `${persistable.join(", ")}. The reducer's history stream may have become `
    + "persistable, so revisit domain/weekly-outcome.ts and both allowlists "
    + "above rather than deleting this assertion.",
  );
});
