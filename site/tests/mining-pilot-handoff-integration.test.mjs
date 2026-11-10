import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

// 07-10 Task 1: adversarial synthetic Phase 7 lifecycle proof.
//
// This file composes the Phase 7 pieces that the per-plan suites prove one at
// a time: the read-only Phase 4 schedule projection in the Morning Brief, the
// weekly cohort and loss ledger, CSV handoff eligibility, determinism and
// suppression, the encrypted workspace archive, the read-only dry run, the
// fenced restore and its replay, and the owner handoff and recovery transport.
//
// Everything is synthetic. Time and randomness are fixed. Every external port
// (scheduler, runner, provider, Gmail, send, CRM sync, archive delivery,
// object store) is an in-memory fake that counts calls; nothing reaches a host.
// This is local evidence only. It is not the independent review or the
// clean-target restore drill of 07-10 Task 2, which stay blocked, and it makes
// no claim about scheduler provisioning: Phase 4 owns the recurring schedule.

const AS_OF = "2026-03-16T03:59:59.999Z"; // Sunday 23:59:59.999 America/Toronto (EDT)
const AS_OF_MS = Date.parse(AS_OF);
const CRM_NOW = "2026-03-16T03:30:00.000Z";
const MINUTE = 60_000;
const DIGEST = "a".repeat(64);
const CONFIG_DIGEST = "c".repeat(64);
const PASSPHRASE = "synthetic-integration-passphrase-0001";
const SCHEMA_V1 = "prospector/portable-workspace-schema/v1";
const EFFECT_FENCE = Object.freeze({ scheduler: "disabled", runner: "disabled", outbox: "paused", provider: "disabled", delivery: "disabled" });
const textEncoder = new TextEncoder();
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ref = (id) => ({ id, digest: DIGEST });

/** The Generic Operating hierarchy and a second, non-Mining hierarchy. Nothing below branches on either. */
const HIERARCHIES = Object.freeze([
  Object.freeze({
    key: "operating",
    workspaceId: "workspace-source-operating",
    companyId: "company-main", productId: "product-main", marketPlayId: "play-main",
    profileId: "profile-operating", profileName: "Operating",
    csv: { n: "0001" },
  }),
  Object.freeze({
    key: "logistics",
    workspaceId: "workspace-source-logistics",
    companyId: "company-logistics", productId: "product-routing", marketPlayId: "play-port-operators",
    profileId: "profile-terminal-operators", profileName: "Terminal operators",
    csv: { n: "0002" },
  }),
]);

async function withModules(run, plugins = []) {
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins, server: { middlewareMode: true } });
  try {
    const load = (path) => vite.ssrLoadModule(new URL(path, import.meta.url).pathname);
    return await run({
      brief: await load("../domain/morning-brief.ts"),
      weekly: await load("../domain/weekly-outcome.ts"),
      crm: await load("../domain/crm-handoff.ts"),
      archive: await load("../domain/workspace-archive.ts"),
      verifier: await load("../domain/restore-verifier.ts"),
      restore: await load("../domain/restore-apply.ts"),
      load,
    });
  } finally {
    await vite.close();
  }
}

/**
 * Counting traps for the two effect seams the code under test can actually
 * reach at runtime: the global network (`trapNetwork` replaces `fetch`) and
 * immutable archive delivery (wired as the restore handler's
 * `archiveStore.putImmutable`). Each records the call and then throws, so a
 * wrongly wired call both fails the operation and shows up in the counters.
 *
 * No Phase 7 module accepts a scheduler, runner, provider, Gmail, send, or CRM
 * sync port, so a counting fake for one would never be handed to anything and
 * would pass by construction. The evidence that no such path exists is the
 * static source scan in "Phase 7 has no scheduler provisioning, callback, or
 * schedule-command path", not these counters.
 */
function effectPorts() {
  const calls = { archiveDelivery: 0, network: 0 };
  const hit = (name) => async () => { calls[name] += 1; throw new Error(`${name}_must_not_be_called`); };
  return {
    calls,
    archiveDelivery: Object.freeze({ deliver: hit("archiveDelivery") }),
  };
}

function assertNoEffects(effects, label = "") {
  assert.deepEqual(effects.calls, { archiveDelivery: 0, network: 0 }, label);
}

/** Replaces the global network seam for one pure-domain case; any call is counted and refused. */
function trapNetwork(effects) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { effects.calls.network += 1; throw new Error("network_must_not_be_called"); };
  return () => { globalThis.fetch = original; };
}

// -- Fixture: weekly history, schedule observation, and brief input ----------

function exportPath(at) {
  const t = (occurredAt, fromState, toState) => ({ kind: "state_transition", occurredAt, fromState, toState });
  return [
    { kind: "prospect_created", occurredAt: "2026-01-05T05:00:00.000Z", initialState: "Candidate" },
    t("2026-02-01T05:00:00.000Z", "Candidate", "Qualified"),
    t("2026-02-02T05:00:00.000Z", "Qualified", "Approved"),
    t("2026-02-03T05:00:00.000Z", "Approved", "ContactReady"),
    t("2026-02-04T05:00:00.000Z", "ContactReady", "PackageReady"),
    t(at, "PackageReady", "ExportReady"),
  ];
}

function prospectHistory(hierarchy, prospectId, specs) {
  return {
    prospectId,
    workspaceId: hierarchy.workspaceId,
    companyId: hierarchy.companyId,
    productId: hierarchy.productId,
    marketPlayId: hierarchy.marketPlayId,
    profileId: hierarchy.profileId,
    events: specs.map((spec, index) => ({
      eventId: `event-${prospectId}-${index + 1}`,
      sequence: index + 1,
      auditRef: ref(`audit-${prospectId}-${index + 1}`),
      ...spec,
    })),
  };
}

/**
 * Three Export-ready Prospects this Toronto week (one with two contact rows),
 * one exported the week before, and one rejected. The cohort is three.
 */
function weeklyHistories(hierarchy) {
  const id = (n) => `prospect-${hierarchy.key}-${n}`;
  return [
    prospectHistory(hierarchy, id(1), [
      ...exportPath("2026-03-10T14:00:00.000Z"),
      { kind: "contact_linked", occurredAt: "2026-03-10T15:00:00.000Z", contactId: `contact-${hierarchy.key}-1a` },
      { kind: "contact_linked", occurredAt: "2026-03-10T15:01:00.000Z", contactId: `contact-${hierarchy.key}-1b` },
    ]),
    prospectHistory(hierarchy, id(2), [
      ...exportPath("2026-03-12T14:00:00.000Z"),
      { kind: "contact_linked", occurredAt: "2026-03-12T15:00:00.000Z", contactId: `contact-${hierarchy.key}-2a` },
    ]),
    prospectHistory(hierarchy, id(3), [
      ...exportPath("2026-03-15T14:00:00.000Z"),
      { kind: "contact_linked", occurredAt: "2026-03-15T15:00:00.000Z", contactId: `contact-${hierarchy.key}-3a` },
    ]),
    prospectHistory(hierarchy, id(4), exportPath("2026-03-05T14:00:00.000Z")),
    prospectHistory(hierarchy, id(5), [
      { kind: "prospect_created", occurredAt: "2026-01-05T05:00:00.000Z", initialState: "Candidate" },
      { kind: "loss", occurredAt: "2026-03-11T12:00:00.000Z", category: "rejected", contactId: null },
    ]),
  ];
}

function weeklyInput(hierarchy, histories = weeklyHistories(hierarchy), asOf = AS_OF) {
  return {
    scope: {
      workspaceId: hierarchy.workspaceId,
      companyId: hierarchy.companyId,
      productId: hierarchy.productId,
      marketPlayId: hierarchy.marketPlayId,
      profileId: hierarchy.profileId,
      profileLifecycle: "Operating",
    },
    timeZone: "America/Toronto",
    asOf,
    coverage: { from: "prospect_origin", through: asOf, prospectIds: histories.map((entry) => entry.prospectId) },
    histories,
  };
}

/** A current Phase 4 observation of the weekday 06:00 America/Toronto schedule. */
function scheduleObservation(hierarchy, patch = {}) {
  return {
    observationRef: ref(`schedule-observation-${hierarchy.key}`),
    profileId: hierarchy.profileId,
    configurationDigest: CONFIG_DIGEST,
    cadence: "weekdays",
    localTime: "06:00",
    timeZone: "America/Toronto",
    upstreamAuthority: "phase4_profile_readiness",
    readinessRef: ref(`phase4-readiness-${hierarchy.key}`),
    state: "enabled",
    observedAt: "2026-03-16T03:00:00.000Z",
    ...patch,
  };
}

function briefInput(hierarchy, patch = {}) {
  const histories = patch.histories ?? weeklyHistories(hierarchy);
  return {
    scope: {
      workspaceId: hierarchy.workspaceId,
      companyId: hierarchy.companyId,
      productId: hierarchy.productId,
      marketPlayId: hierarchy.marketPlayId,
      profileId: hierarchy.profileId,
      profileName: hierarchy.profileName,
      profileLifecycle: "ready",
      activeConfigurationDigest: CONFIG_DIGEST,
    },
    asOf: patch.asOf ?? AS_OF,
    weeklyHistory: weeklyInput(hierarchy, histories, patch.asOf ?? AS_OF),
    scheduleObservation: "scheduleObservation" in patch ? patch.scheduleObservation : scheduleObservation(hierarchy),
    handoffReadiness: patch.handoffReadiness ?? null,
    reviewFunnel: null,
    workspaceOrigin: patch.workspaceOrigin ?? { kind: "original" },
    greenfieldProfiles: [{ profileId: `profile-greenfield-${hierarchy.key}`, label: "Greenfield — Draft / nurture" }],
  };
}

// -- Fixture: CSV handoff candidates and in-memory access store --------------

function csvCells(hierarchy, index, patch = {}) {
  const id = String(index).padStart(4, "0");
  const n = hierarchy.csv.n;
  return {
    prospect_id: `synthetic-prospect-${id}`,
    company_id: `synthetic-company-${n}`,
    product_id: `synthetic-product-${n}`,
    market_play_id: `synthetic-market-play-${n}`,
    profile_id: `synthetic-profile-${n}`,
    // The 07-02 synthetic gate admits one fixed fictional label for every hierarchy.
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
    source_workspace_id: `synthetic-workspace-${n}`,
    source_run_id: "synthetic-run-0001",
    export_manifest_ref: "synthetic-export-manifest-0001",
    ...patch,
  };
}

/**
 * Two eligible contact rows for Prospect 1, one for Prospect 2, one contact
 * under a suppressed domain, and one Prospect that is not Export-ready.
 */
function csvCandidates(hierarchy) {
  const candidate = (index, patch = {}, cells = {}) => ({
    workspaceId: hierarchy.workspaceId,
    prospectState: "Export-ready",
    deleted: false,
    aliasOf: null,
    verificationClass: "mailbox_verified",
    packageDigest: "e".repeat(64),
    eligibilityInput: {},
    cells: csvCells(hierarchy, index, cells),
    ...patch,
  });
  return [
    candidate(1),
    candidate(2, {}, { prospect_id: "synthetic-prospect-0001" }),
    candidate(3),
    candidate(4, {}, { contact_value: "person0004@blocked.example.test" }),
    candidate(5, { prospectState: "Prospect" }),
  ];
}

const domainDigest = (domain) => sha256Hex(textEncoder.encode(`domain:${domain}`));

/** Suppression resolver fake: blocks a confirmed domain and its whole-label subdomains, from tombstone digests. */
function suppressionPort(tombstones, counter) {
  const blocked = new Set(tombstones.filter((entry) => entry.value.scopeKind === "domain").map((entry) => entry.value.scopeDigest));
  return {
    async blockingScopes(input) {
      counter.suppression += 1;
      const domain = input.email?.toLowerCase().split("@")[1] ?? "";
      const labels = domain.split(".");
      const hit = labels.some((_, index) => blocked.has(domainDigest(labels.slice(index).join("."))));
      return { blocked: hit, scopes: hit ? ["confirmed_email_domain"] : [], complete: true, providerCalls: 0 };
    },
  };
}

/** An in-memory store with the access path; it refuses to overwrite a version. */
function memoryCrmStore(counter) {
  const records = [];
  const ends = [];
  const refusals = [];
  const find = ({ workspaceId, artifactId }) => records.find((entry) => entry.stored.workspaceId === workspaceId && entry.stored.artifactId === artifactId);
  return {
    records, ends, refusals,
    async lookup({ workspaceId, idempotencyKey }) {
      const mine = records.filter((entry) => entry.stored.workspaceId === workspaceId);
      return (mine.find((entry) => entry.stored.idempotencyKey === idempotencyKey) ?? mine.at(-1))?.stored ?? null;
    },
    async putImmutable(record) {
      counter.store += 1;
      if (find(record.stored)) throw new Error("object_conflict");
      records.push({ ...record, bytes: Uint8Array.from(record.bytes) });
    },
    async readArtifact(request) {
      const entry = find(request);
      if (!entry) return null;
      const end = ends.find((item) => item.artifactId === request.artifactId);
      return end ? { ...entry.stored, deliveryState: end.eventKind } : entry.stored;
    },
    async readBytes(request) { const entry = find(request); return entry ? Uint8Array.from(entry.bytes) : null; },
    async recordDeliveryEnd(request) { ends.push({ ...request }); },
    async recordAccessRefusal(request) { refusals.push({ ...request }); },
  };
}

function crmPorts(hierarchy, { candidates = csvCandidates(hierarchy), tombstones, eligible = () => true, store, counter, nowIso = () => CRM_NOW }) {
  return {
    source: { async read() {
      return {
        exportScope: { tenantId: "synthetic-tenant-0001", workspaceId: `synthetic-workspace-${hierarchy.csv.n}` },
        selectionId: "synthetic-selection-0001",
        selectionRevision: 1,
        authorityRevision: 1,
        configurationDigest: CONFIG_DIGEST,
        exportDefinitionDigest: "b".repeat(64),
        candidates,
      };
    } },
    eligibility: { async recheck(request) {
      counter.eligibility += 1;
      return eligible(request) ? { contactReady: true } : { contactReady: false, reasonCode: "verification_stale" };
    } },
    suppression: suppressionPort(tombstones, counter),
    store,
    clock: { nowIso },
  };
}

function sourceTombstones() {
  return [{ kind: "suppression", id: "tombstone-domain-1", value: { scopeKind: "domain", scopeDigest: domainDigest("blocked.example.test") } }];
}

// -- Fixture: archive source, restore target, and evidence -------------------

/** The source workspace snapshot: hierarchy, schedule record, weekly history, the CSV artifact object, and tombstones. */
function sourceSnapshot(hierarchy, { histories, csv, tombstones }) {
  const records = [
    { kind: "company", id: hierarchy.companyId, value: { name: "Synthetic Company" } },
    { kind: "product", id: hierarchy.productId, value: { companyId: hierarchy.companyId } },
    { kind: "market_play", id: hierarchy.marketPlayId, value: { productId: hierarchy.productId, state: "accepted" } },
    { kind: "profile", id: hierarchy.profileId, value: { marketPlayId: hierarchy.marketPlayId, lifecycle: "ready" } },
    // The source carried an enabled Phase 4 schedule. Restore must never carry that state forward as enabled.
    { kind: "prospecting_schedule", id: `schedule-${hierarchy.key}`, value: { profileId: hierarchy.profileId, cadence: "weekdays", localTime: "06:00", timeZone: "America/Toronto", state: "enabled" } },
    ...histories.map((entry) => ({
      kind: "prospect", id: entry.prospectId,
      value: { companyId: entry.companyId, productId: entry.productId, marketPlayId: entry.marketPlayId, profileId: entry.profileId, workspaceId: entry.workspaceId },
    })),
  ];
  const history = histories.flatMap((entry) => entry.events.map(({ eventId, sequence, ...value }) => ({
    stream: `prospect:${entry.prospectId}`, sequence, id: eventId, value,
  })));
  return {
    objects: new Map([[csv.csvSha256, csv.bytes]]),
    snapshot: {
      workspaceId: hierarchy.workspaceId,
      schemaVersion: SCHEMA_V1,
      records,
      decisions: [],
      history,
      audit: [{ stream: "workspace", sequence: 1, id: `audit-${hierarchy.key}-1`, value: { action: "crm_handoff.materialized" } }],
      objects: [{ digest: csv.csvSha256, byteLength: csv.bytes.byteLength, mediaType: "text/csv" }],
      dependencies: [{ kind: "configuration", id: `configuration-${hierarchy.key}`, value: { configurationDigest: CONFIG_DIGEST } }],
      exportArtifacts: [{ kind: "crm_csv", id: csv.artifactId, value: { objectDigest: csv.csvSha256, rowCount: csv.rowCount } }],
      tombstones,
    },
  };
}

function freshAuthority(workspaceId, now, patch = {}) {
  return { workspaceId, ownerSubject: "owner-synthetic", reauthenticatedAt: now - MINUTE, reauthReferenceDigest: "d".repeat(64), ...patch };
}

/** Archive-side ports. The object store counts each immutable put. */
function archivePorts(hierarchy, source, { random, now = AS_OF_MS } = {}) {
  const counter = { objectWrites: 0, evidenceWrites: 0, refusals: 0 };
  const stored = new Map();
  let sequence = 0;
  const next = (prefix) => { sequence += 1; return `${prefix}_${String(sequence).padStart(32, "0")}`; };
  return {
    counter, stored,
    ports: {
      now: () => now,
      ...(random ? { random } : {}),
      authority: { current: async () => freshAuthority(hierarchy.workspaceId, now) },
      source: { readSnapshot: async () => source.snapshot, readObject: async (digest) => source.objects.get(digest) ?? null },
      archiveStore: { putImmutable: async (key, bytes) => { counter.objectWrites += 1; if (stored.has(key)) throw new Error("object_conflict"); stored.set(key, Uint8Array.from(bytes)); } },
      evidence: {
        recordArchive: async () => { counter.evidenceWrites += 1; return { id: next("rar"), digest: "1".repeat(64), replayed: false }; },
        recordDeliveryEvent: async () => { counter.evidenceWrites += 1; return { id: next("hde"), digest: "2".repeat(64), replayed: false }; },
        recordRefusal: async () => { counter.refusals += 1; return { id: next("hra"), digest: "3".repeat(64), replayed: false }; },
      },
    },
  };
}

/** A clean compatible restore target. Data writes are counted; the applied effect state is recorded for assertion. */
function memoryRestoreTarget({ schemaVersion = SCHEMA_V1 } = {}) {
  const counter = { dataWrites: 0, objectWrites: 0 };
  let rows = [];
  let objects = new Map();
  let effectState = null;
  return {
    counter,
    readState: async () => ({ schemaVersion, empty: rows.length === 0 && objects.size === 0, effectsEnabled: false }),
    apply: async (plan) => {
      for (const row of plan.rows) { counter.dataWrites += 1; rows.push(structuredClone(row)); }
      for (const object of plan.objects) { counter.objectWrites += 1; objects.set(object.digest, Uint8Array.from(object.bytes)); }
      effectState = { ...plan.effects };
    },
    discard: async () => { rows = []; objects = new Map(); effectState = null; },
    readRestored: async () => ({
      rows: structuredClone(rows),
      objects: [...objects].sort(([left], [right]) => left.localeCompare(right)).map(([digest, bytes]) => ({ digest, bytes: Uint8Array.from(bytes) })),
      effects: effectState,
    }),
  };
}

/** In-memory 0023 evidence: replay by key, one accepted dry run per nonce, one lock, one result. */
function memoryEvidence(target, clock) {
  const commands = new Map();
  const dryRuns = new Map();
  const locks = new Map();
  const results = new Map();
  const conflict = (reason) => new Error(`handoff_recovery_conflict:${reason}`);
  const applied = () => [...results.values()].some((result) => result.outcome === "applied");
  const write = async (kind, key, input, make) => {
    const op = JSON.stringify([kind, input]);
    const prior = commands.get(key);
    if (prior) {
      if (prior.op !== op) throw conflict("idempotency_conflict");
      return { ...(await prior.pending), replayed: true };
    }
    const pending = (async () => make())();
    commands.set(key, { op, pending });
    try {
      return { ...(await pending), replayed: false };
    } catch (error) {
      commands.delete(key);
      throw error;
    }
  };
  return {
    dryRuns, locks, results,
    readRestoreTargetState: async () => {
      const state = await target.readState();
      return { clean: state.empty && !applied(), nonEmptyTables: state.empty ? [] : ["restored_rows"], restoreApplied: applied(), digest: "0".repeat(64) };
    },
    recordDryRun: (input) => write("dry_run", input.idempotencyKey, input, async () => {
      if (input.outcome === "accepted" && (!(await target.readState()).empty || applied())) throw conflict("restore_target_not_clean");
      const id = `rdr_${String(dryRuns.size + 1).padStart(32, "0")}`;
      dryRuns.set(id, { ...input });
      return { id, digest: "5".repeat(64) };
    }),
    acquireRestoreLock: (input) => write("lock", input.idempotencyKey, input, async () => {
      const dryRun = dryRuns.get(input.dryRunId);
      if (!dryRun || dryRun.outcome !== "accepted" || dryRun.nonceDigest !== input.nonceDigest || clock.now > dryRun.expiresAt) throw conflict("dry_run_not_accepted");
      if ([...locks.values()].some((lock) => lock.dryRunId === input.dryRunId || !results.has(lock.id)) || applied()) throw conflict("restore_lock_unavailable");
      const id = `rrl_${String(locks.size + 1).padStart(32, "0")}`;
      locks.set(id, { id, ...input });
      return { id, digest: "6".repeat(64) };
    }),
    recordRestoreResult: (input) => write("result", input.idempotencyKey, input, async () => {
      if (!locks.has(input.lockId) || results.has(input.lockId)) throw conflict("restore_lock_unavailable");
      results.set(input.lockId, { ...input });
      return { id: `rrr_${String(results.size).padStart(32, "0")}`, digest: "7".repeat(64) };
    }),
    recordRefusal: async () => ({ id: `hra_${"8".repeat(32)}`, digest: "8".repeat(64), replayed: false }),
  };
}

function restorePorts(envelopeBytes, effects, { now = AS_OF_MS, archiveExpiresAt = AS_OF_MS + 60 * MINUTE, schemaVersion, targetWorkspaceId = "workspace-restore-target" } = {}) {
  const clock = { now };
  const target = memoryRestoreTarget({ schemaVersion });
  const evidence = memoryEvidence(target, clock);
  const uploads = new Map([["archive-upload-1", { bytes: envelopeBytes, expiresAt: archiveExpiresAt }]]);
  return {
    clock, target, evidence, uploads,
    ports: {
      now: () => clock.now,
      authority: { current: async () => freshAuthority(targetWorkspaceId, clock.now) },
      archives: { readArchive: async (key) => uploads.get(key) ?? null },
      target,
      evidence,
    },
  };
}

/** Rebuilds the weekly reducer input from restored rows only. */
function weeklyHistoriesFromRestored(rows) {
  const prospects = rows.filter((row) => row.section === "records" && row.kind === "prospect");
  return prospects.map((prospect) => ({
    prospectId: prospect.id,
    ...prospect.value,
    events: rows
      .filter((row) => row.section === "history" && row.stream === `prospect:${prospect.id}`)
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => ({ eventId: row.id, sequence: row.sequence, ...row.value })),
  })).sort((left, right) => left.prospectId.localeCompare(right.prospectId));
}

/** Materializes the CSV handoff for one hierarchy and returns its exact stored bytes. */
async function materializeCsv(crm, hierarchy, { tombstones = sourceTombstones(), store } = {}) {
  const counter = { eligibility: 0, suppression: 0, store: 0 };
  const csvStore = store ?? memoryCrmStore(counter);
  const ports = crmPorts(hierarchy, { tombstones, store: csvStore, counter });
  const plan = await crm.planCrmHandoff({ workspaceId: hierarchy.workspaceId, ports });
  const result = await crm.materializeCrmHandoff({ workspaceId: hierarchy.workspaceId, staleSnapshotDigest: plan.snapshotDigest, ports });
  assert.equal(result.status, "materialized", JSON.stringify(result));
  const access = await crm.accessCrmHandoffArtifact({ workspaceId: hierarchy.workspaceId, artifactId: result.artifactId, ports });
  assert.equal(access.status, "authorized", JSON.stringify(access));
  return { counter, store: csvStore, ports, plan, result, bytes: access.bytes, csvSha256: access.csvSha256, artifactId: result.artifactId, rowCount: plan.rows.length };
}

// ---------------------------------------------------------------------------
// 1. The whole local lifecycle, for two hierarchies, with zero effect calls
// ---------------------------------------------------------------------------

test("two hierarchies compose schedule projection, weekly cohort and losses, CSV handoff, archive, dry run, restore, and replay with no network or archive-delivery call", async () => {
  await withModules(async ({ brief, weekly, crm, archive, verifier, restore }) => {
    const effects = effectPorts();
    const release = trapNetwork(effects);
    try {
      const restoredDigests = [];
      for (const hierarchy of HIERARCHIES) {
        const label = hierarchy.key;

        // Schedule state: exact read-only projection of the upstream weekday 06:00 America/Toronto definition.
        const original = brief.composeMorningBrief(briefInput(hierarchy));
        assert.equal(original.status, "available", label);
        assert.deepEqual({ ...original.schedule.definition }, { cadence: "weekdays", localTime: "06:00", timeZone: "America/Toronto", upstreamAuthority: "phase4_profile_readiness" }, label);
        assert.equal(original.schedule.status, "current", label);
        assert.equal(original.schedule.reportedState, "enabled", label);
        assert.equal(original.schedule.changeableFromThisSurface, false, label);
        assert.equal(original.schedule.readinessRef.id, `phase4-readiness-${hierarchy.key}`, label);

        // Cohort, loss, and report: three Prospects this week, never the four contact rows.
        const report = weekly.reduceWeeklyOutcome(weeklyInput(hierarchy));
        assert.equal(report.status, "available", label);
        assert.equal(report.counts.newlyExportReadyProspectCount, 3, label);
        assert.equal(report.counts.remainingProspectsToTarget, 4, label);
        assert.equal(report.counts.distinctStableContactCount, 4, label);
        assert.equal(original.weekly.newlyExportReadyProspectCount, 3, label);
        assert.equal(original.weekly.target, 7, label);
        assert.equal(original.weekly.week.start.localDate, "2026-03-09", label);
        assert.equal(original.losses.rejected.distinctProspectCount, 1, label);
        assert.equal(original.greenfield.profiles.length, 1, label);
        assert.equal(original.greenfield.profiles[0].contributesToSchedule, false, label);
        assert.equal(original.greenfield.profiles[0].contributesToWeeklyOutcome, false, label);
        assert.doesNotMatch(JSON.stringify(original), /mining/iu, `${label}: the brief carries no Mining-specific behavior`);

        // CSV: current eligibility, suppression, Prospect-vs-row distinction, and byte determinism.
        const csv = await materializeCsv(crm, hierarchy);
        assert.deepEqual(csv.plan.rows.map((row) => row.contactId), ["synthetic-contact-0001", "synthetic-contact-0002", "synthetic-contact-0003"], label);
        assert.equal(new Set(csv.plan.rows.map((row) => row.prospectId)).size, 2, `${label}: two Prospects, three contact rows`);
        assert.deepEqual(csv.plan.exclusions.map((entry) => [entry.contactId, entry.reason]), [
          ["synthetic-contact-0004", "suppressed_domain"],
          ["synthetic-contact-0005", "not_export_ready"],
        ], label);
        assert.equal(JSON.stringify(csv.plan.nonContactable).includes("example.test"), false, label);
        assert.equal(sha256Hex(csv.bytes), csv.csvSha256, label);
        assert.doesNotMatch(new TextDecoder().decode(csv.bytes), /blocked\.example\.test|person0005/u, `${label}: suppressed and ineligible contacts never reach the bytes`);
        const independent = await materializeCsv(crm, hierarchy);
        assert.equal(independent.csvSha256, csv.csvSha256, `${label}: an independent store builds byte-identical CSV`);
        assert.deepEqual(Buffer.from(independent.bytes), Buffer.from(csv.bytes), label);
        const replay = await crm.materializeCrmHandoff({ workspaceId: hierarchy.workspaceId, ports: csv.ports });
        assert.equal(replay.status, "replayed", label);
        assert.equal(csv.counter.store, 1, `${label}: a retry stores nothing new`);

        // Archive: the CSV artifact object, history, and tombstones are sealed with integrity.
        const histories = weeklyHistories(hierarchy);
        const source = sourceSnapshot(hierarchy, { histories, csv, tombstones: sourceTombstones() });
        const fixedRandom = (length) => new Uint8Array(length).fill(9);
        const sourcePorts = archivePorts(hierarchy, source, { random: fixedRandom });
        const created = await archive.createWorkspaceArchive({ passphrase: PASSPHRASE, ports: sourcePorts.ports });
        assert.equal(sourcePorts.counter.objectWrites, 1, label);
        assert.equal(JSON.stringify(created).includes(PASSPHRASE), false, label);
        const again = await archive.createWorkspaceArchive({ passphrase: PASSPHRASE, ports: archivePorts(hierarchy, source, { random: fixedRandom }).ports });
        assert.deepEqual(again.envelope, created.envelope, `${label}: fixed randomness and time give a deterministic envelope`);
        const envelopeBytes = textEncoder.encode(JSON.stringify(created.envelope));

        // Dry run: read-only. Restore: once, fenced, then replayed.
        const target = restorePorts(envelopeBytes, effects);
        const dry = await verifier.dryRunRestore({ archiveRef: "archive-upload-1", passphrase: PASSPHRASE, ports: target.ports });
        assert.equal(dry.status, "verified", `${label}: ${JSON.stringify(dry)}`);
        assert.deepEqual(target.target.counter, { dataWrites: 0, objectWrites: 0 }, `${label}: the dry run writes no target data`);
        assert.equal(dry.manifestDigest, created.envelope.manifestDigest, label);
        const applied = await restore.applyRestore({ archiveRef: "archive-upload-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports });
        assert.equal(applied.status, "restored", label);
        assert.deepEqual({ ...applied.effects }, EFFECT_FENCE, label);
        const writes = { ...target.target.counter };
        const replayed = await restore.applyRestore({ archiveRef: "archive-upload-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports });
        assert.equal(replayed.status, "already_restored", label);
        assert.deepEqual(target.target.counter, writes, `${label}: a replayed restore writes nothing`);

        // Restore replay is deterministic: a second clean target receives identical rows and objects.
        const restored = await target.target.readRestored();
        const second = restorePorts(envelopeBytes, effects);
        const secondDry = await verifier.dryRunRestore({ archiveRef: "archive-upload-1", passphrase: PASSPHRASE, ports: second.ports });
        assert.equal((await restore.applyRestore({ archiveRef: "archive-upload-1", dryRunId: secondDry.dryRunId, nonce: secondDry.nonce, passphrase: PASSPHRASE, ports: second.ports })).status, "restored", label);
        const secondRestored = await second.target.readRestored();
        assert.deepEqual(secondRestored.rows, restored.rows, label);
        assert.deepEqual(secondRestored.objects.map((object) => [object.digest, Buffer.from(object.bytes).toString("base64")]), restored.objects.map((object) => [object.digest, Buffer.from(object.bytes).toString("base64")]), label);
        restoredDigests.push(applied.archiveDigest);

        // The restored CSV object is the exact artifact; the restored history reproduces the same weekly report.
        const [csvObject] = restored.objects;
        assert.equal(csvObject.digest, csv.csvSha256, label);
        assert.deepEqual(Buffer.from(csvObject.bytes), Buffer.from(csv.bytes), label);
        const restoredReport = weekly.reduceWeeklyOutcome(weeklyInput(hierarchy, weeklyHistoriesFromRestored(restored.rows)));
        assert.deepEqual(restoredReport, report, `${label}: the restored history yields the identical weekly report`);

        // Restored tombstones still suppress: the restored target re-plans the same snapshot and excludes the same contact.
        const restoredTombstones = restored.rows.filter((row) => row.section === "tombstones").map(({ kind, id, value }) => ({ kind, id, value }));
        assert.deepEqual(restoredTombstones, sourceTombstones(), label);
        const restoredCounter = { eligibility: 0, suppression: 0, store: 0 };
        const replanned = await crm.planCrmHandoff({ workspaceId: hierarchy.workspaceId, ports: crmPorts(hierarchy, { tombstones: restoredTombstones, store: memoryCrmStore(restoredCounter), counter: restoredCounter }) });
        assert.equal(replanned.snapshotDigest, csv.plan.snapshotDigest, label);
        assert.ok(replanned.exclusions.some((entry) => entry.contactId === "synthetic-contact-0004" && entry.reason === "suppressed_domain"), label);

        // The restored workspace reports its schedule disabled until a fresh upstream Phase 4 activation.
        const restoredOrigin = { kind: "restored", restoreRef: ref(applied.restoreResultId), restoredAt: "2026-03-15T12:00:00.000Z", freshUpstreamActivation: null };
        const pending = brief.composeMorningBrief(briefInput(hierarchy, { workspaceOrigin: restoredOrigin }));
        assert.equal(pending.schedule.status, "disabled_pending_fresh_upstream_activation", label);
        assert.equal(pending.schedule.reportedState, "disabled", `${label}: the source's enabled state is not carried forward`);
        assert.equal(pending.workspace.restoredEffectsFenced, true, label);
        const stale = brief.composeMorningBrief(briefInput(hierarchy, { workspaceOrigin: { ...restoredOrigin, freshUpstreamActivation: { activationRef: ref("activation-before-restore"), activatedAt: "2026-03-15T11:00:00.000Z" } } }));
        assert.equal(stale.schedule.status, "disabled_pending_fresh_upstream_activation", `${label}: an activation from before the restore is not fresh`);
        const fresh = brief.composeMorningBrief(briefInput(hierarchy, { workspaceOrigin: { ...restoredOrigin, freshUpstreamActivation: { activationRef: ref("activation-after-restore"), activatedAt: "2026-03-15T18:00:00.000Z" } } }));
        assert.equal(fresh.schedule.status, "current", `${label}: only a fresh Phase 4 activation is reported as current`);
        for (const result of [original, pending, stale, fresh]) {
          assert.ok(Object.values(result.authority).every((value) => value === false), label);
          assert.ok(Object.values(result.effects).every((value) => value === 0), label);
        }
      }
      assert.notEqual(restoredDigests[0], restoredDigests[1], "each hierarchy restores its own archive");
      assertNoEffects(effects, "no network or archive-delivery call");
    } finally {
      release();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Schedule evidence: read-only, never activated, never recorded as a command
// ---------------------------------------------------------------------------

test("missing, stale, future, foreign, mis-defined, drifted, Greenfield, and restored schedule evidence never reports a current enabled schedule and refuses an injected scheduler or runner", async () => {
  await withModules(async ({ brief }) => {
    const effects = effectPorts();
    const release = trapNetwork(effects);
    try {
      for (const hierarchy of HIERARCHIES) {
        const restored = { kind: "restored", restoreRef: ref("restore-1"), restoredAt: "2026-03-15T12:00:00.000Z", freshUpstreamActivation: null };
        const cases = [
          ["missing", { scheduleObservation: null }, "unknown", ["schedule_observation_absent"]],
          ["stale", { scheduleObservation: scheduleObservation(hierarchy, { observedAt: "2026-03-14T03:00:00.000Z" }) }, "blocked", ["schedule_observation_stale"]],
          ["future", { scheduleObservation: scheduleObservation(hierarchy, { observedAt: "2026-03-16T05:00:00.000Z" }) }, "blocked", ["schedule_observation_in_future"]],
          ["foreign profile", { scheduleObservation: scheduleObservation(hierarchy, { profileId: "profile-other-workspace" }) }, "blocked", ["schedule_scope_mismatch"]],
          ["Greenfield profile", { scheduleObservation: scheduleObservation(hierarchy, { profileId: `profile-greenfield-${hierarchy.key}` }) }, "blocked", ["schedule_scope_mismatch"]],
          ["wrong cadence", { scheduleObservation: scheduleObservation(hierarchy, { cadence: "daily" }) }, "blocked", ["schedule_definition_mismatch"]],
          ["wrong local time", { scheduleObservation: scheduleObservation(hierarchy, { localTime: "07:00" }) }, "blocked", ["schedule_definition_mismatch"]],
          ["wrong time zone", { scheduleObservation: scheduleObservation(hierarchy, { timeZone: "UTC" }) }, "blocked", ["schedule_definition_mismatch"]],
          ["configuration drift", { scheduleObservation: scheduleObservation(hierarchy, { configurationDigest: "f".repeat(64) }) }, "blocked", ["schedule_configuration_drift"]],
          ["non-Phase 4 authority", { scheduleObservation: scheduleObservation(hierarchy, { upstreamAuthority: "phase7_morning_brief" }) }, "blocked", ["schedule_upstream_authority_invalid"]],
          ["absence on an original workspace", { scheduleObservation: { kind: "no_active_schedule_row", profileId: hierarchy.profileId } }, "unknown", ["schedule_observation_absent"]],
          ["foreign absence", { scheduleObservation: { kind: "no_active_schedule_row", profileId: "profile-other-workspace" } }, "blocked", ["schedule_observation_absent", "schedule_scope_mismatch"]],
          ["restored with an enabled source observation", { workspaceOrigin: restored }, "disabled_pending_fresh_upstream_activation", ["workspace_restored_pending_fresh_upstream_activation"]],
          ["restored with absence evidence", { workspaceOrigin: restored, scheduleObservation: { kind: "no_active_schedule_row", profileId: hierarchy.profileId } }, "disabled_pending_fresh_upstream_activation", ["schedule_observation_absent", "workspace_restored_pending_fresh_upstream_activation"]],
          ["restored and stale", { workspaceOrigin: restored, scheduleObservation: scheduleObservation(hierarchy, { observedAt: "2026-03-14T03:00:00.000Z" }) }, "blocked", ["schedule_observation_stale", "workspace_restored_pending_fresh_upstream_activation"]],
          ["restore in progress", { workspaceOrigin: { kind: "restore_in_progress", lockedAt: "2026-03-15T12:00:00.000Z" } }, "blocked", null],
        ];
        for (const [name, patch, status, reasons] of cases) {
          const label = `${hierarchy.key}: ${name}`;
          const result = brief.composeMorningBrief(briefInput(hierarchy, patch));
          assert.equal(result.status, "available", label);
          assert.equal(result.schedule.status, status, label);
          assert.notEqual(result.schedule.reportedState, "enabled", label);
          if (reasons) assert.deepEqual([...result.schedule.reasonCodes].sort(), [...reasons].sort(), label);
          assert.equal(result.schedule.changeableFromThisSurface, false, label);
          assert.ok(Object.values(result.authority).every((value) => value === false), label);
          assert.ok(Object.values(result.effects).every((value) => value === 0), label);
          // A read projects state only: no command, audit, idempotency key, or schedule write is part of the result.
          assert.doesNotMatch(JSON.stringify(result), /"(command|commandId|auditEventId|idempotencyKey|scheduleCommand)"/u, label);
        }
      }
      // A scheduler or runner handed to the brief is an unknown input and fails closed without being touched.
      const touched = [];
      const trap = (name) => () => { touched.push(name); throw new Error(`${name}_must_not_be_called`); };
      for (const hierarchy of HIERARCHIES) {
        const injected = brief.composeMorningBrief({ ...briefInput(hierarchy), scheduler: { enable: trap("scheduler") }, runner: { start: trap("runner") } });
        assert.equal(injected.status, "unavailable");
        assert.deepEqual(injected.reasonCodes, ["morning_brief_input_malformed"]);
      }
      assert.deepEqual(touched, []);
      assertNoEffects(effects);
    } finally {
      release();
    }
  });
});

test("Phase 7 has no scheduler provisioning, callback, or schedule-command path", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const phase7 = [
    "../domain/morning-brief.ts", "../domain/morning-brief-read.ts", "../domain/morning-brief-handler.ts", "../domain/weekly-outcome.ts",
    "../domain/crm-handoff.ts", "../domain/crm-handoff-d1-store.ts", "../domain/crm-handoff-delivery.ts", "../domain/crm-handoff-export-artifact.ts",
    "../domain/workspace-archive.ts", "../domain/restore-verifier.ts", "../domain/restore-apply.ts",
    "../domain/handoff-recovery-handler.ts", "../domain/handoff-recovery-repository.ts",
    "../app/api/handoff-recovery/route.ts", "../app/exports/handoff-recovery-workspace.tsx", "../app/exports/handoff-recovery-leaves.tsx",
    "../app/morning-brief/morning-brief-workspace.tsx",
  ];
  // This scan, not a runtime counter, is the evidence that Phase 7 has no
  // scheduler, runner, provider, Gmail, send, or CRM sync path: no Phase 7
  // module accepts such a port, so there is nothing for a counting fake to
  // intercept. The effect-authority modules it must never import:
  const forbiddenImport = /(?:from\s+|import\s*\(\s*)["'][^"']*(prospecting-schedule|runner-runtime|runner-assignment|runner-spend-authority|prospecting-run-admission|phase-activation|outbox|originated-mail-sync|contact-provider-port|enrichment-authority|enrichment-operation|enrichment-grant-issuance|enrichment-repository)(?:\.tsx?)?["']/u;
  const forbiddenGmailOrProvider = /\bgmail\b|googleapis|\bnodemailer\b|\bsendgrid\b|\btwilio\b|\bhubspot\b|\bsalesforce\b|\bpipedrive\b/iu;
  // Positive controls: the patterns match the seams they guard, so a clean scan is not vacuous.
  for (const sample of [
    'import { scheduleNext } from "./prospecting-schedule";', 'import { startRunner } from "../domain/runner-runtime.ts";',
    'import { releaseOutbox } from "./outbox";', 'import { syncSent } from "./originated-mail-sync";',
    'import { lookup } from "./contact-provider-port";', 'const enrichment = await import("./enrichment-operation");',
  ]) assert.match(sample, forbiddenImport, sample);
  for (const sample of ['const gmail = client.gmail("v1");', 'import { google } from "googleapis";', 'await hubspot.crm.contacts.create(row);']) {
    assert.match(sample, forbiddenGmailOrProvider, sample);
  }
  for (const path of phase7) {
    const text = await read(path);
    // No Phase 7 module writes the Phase 4 schedule or runner tables, or imports an effect-authority module.
    assert.doesNotMatch(text, /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+"?(prospecting_schedules|prospecting_runs|runner_assignments|profile_configuration_activations)\b/iu, path);
    assert.doesNotMatch(text, forbiddenImport, path);
    // No Gmail, mail-provider, or CRM-vendor client: the CRM handoff is a CSV download, never a sync.
    assert.doesNotMatch(text, forbiddenGmailOrProvider, path);
    // No cron, scheduled-event, alarm, or webhook callback seam.
    assert.doesNotMatch(text, /\bscheduled\s*\(|ScheduledController|ScheduledEvent|setAlarm\(|\bcrons?\b|webhook/iu, path);
    // Server modules reach no network; the two client workspaces fetch only their own same-origin owner API.
    if (path.startsWith("../domain/")) assert.doesNotMatch(text, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/u, path);
    else for (const call of text.matchAll(/\bfetch\(\s*([^,)]+)/gu)) assert.match(call[1], /^(HANDOFF_RECOVERY_API|"\/api\/morning-brief")$/u, path);
    assert.doesNotMatch(text, /(?:tel|mailto):/u, path);
  }
  // The worker entry exposes fetch only, and local configuration declares no cron trigger.
  const worker = await read("../worker/index.ts");
  assert.doesNotMatch(worker, /\bscheduled\b/u);
  const wrangler = await read("../wrangler.local.jsonc");
  assert.doesNotMatch(wrangler, /"triggers"|"crons"/u);
  // The owner route is GET/POST over one closed command set with no schedule action.
  const route = await read("../app/api/handoff-recovery/route.ts");
  assert.deepEqual([...route.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gmu)].map((match) => match[1]), ["GET", "POST"]);
  await withModules(async ({ load }) => {
    const handler = await load("../domain/handoff-recovery-handler.ts");
    for (const action of ["enable_schedule", "disable_schedule", "provision_schedule", "schedule_callback", "record_schedule_observation", "start_runner", "run_now", "activate_profile", "confirm_readiness", "enable_effects"]) {
      assert.throws(() => handler.parseHandoffRecoveryCommand({ action }), undefined, action);
    }
    for (const forged of [
      { action: "restore_verified_archive", archiveRef: "archive-upload-1", dryRunId: "rdr-1", nonce: "a".repeat(32), passphrase: PASSPHRASE, confirmed: true, enableSchedules: true },
      { action: "run_dry_run", archiveRef: "archive-upload-1", passphrase: PASSPHRASE, schedule: { cadence: "weekdays" } },
      { action: "create_csv_handoff", snapshotDigest: DIGEST, timeZone: "America/Toronto" },
    ]) assert.throws(() => handler.parseHandoffRecoveryCommand(forged), undefined, JSON.stringify(forged));
  });
});

// ---------------------------------------------------------------------------
// 3. Suppression and eligibility reversal, delivery expiry, archive tamper
// ---------------------------------------------------------------------------

test("a suppression or eligibility reversal after materialization blocks the download, never rebuilds bytes, and drops the contact from the next plan", async () => {
  await withModules(async ({ crm }) => {
    const effects = effectPorts();
    const release = trapNetwork(effects);
    try {
      for (const hierarchy of HIERARCHIES) {
        const label = hierarchy.key;
        const csv = await materializeCsv(crm, hierarchy);
        const storedBefore = csv.store.records.map((entry) => Buffer.from(entry.bytes).toString("base64"));

        // A new domain tombstone now covers a contact that is already in the stored CSV.
        const widened = [...sourceTombstones(), { kind: "suppression", id: "tombstone-domain-2", value: { scopeKind: "domain", scopeDigest: domainDigest("example.test") } }];
        const counter = { eligibility: 0, suppression: 0, store: 0 };
        const suppressedPorts = crmPorts(hierarchy, { tombstones: widened, store: csv.store, counter });
        const suppressedAccess = await crm.accessCrmHandoffArtifact({ workspaceId: hierarchy.workspaceId, artifactId: csv.artifactId, ports: suppressedPorts });
        assert.deepEqual({ status: suppressedAccess.status, reason: suppressedAccess.reason }, { status: "blocked", reason: "eligibility_changed" }, label);
        assert.equal("bytes" in suppressedAccess, false, label);
        const suppressedPlan = await crm.planCrmHandoff({ workspaceId: hierarchy.workspaceId, ports: suppressedPorts });
        assert.equal(suppressedPlan.rows.length, 0, `${label}: every contact is now suppressed`);
        assert.deepEqual((await crm.materializeCrmHandoff({ workspaceId: hierarchy.workspaceId, ports: suppressedPorts })).reason, "no_eligible_rows", label);

        // Eligibility reversal: one contact is no longer ContactReady.
        const reversedPorts = crmPorts(hierarchy, { tombstones: sourceTombstones(), store: csv.store, counter, eligible: (request) => request.contactId !== "synthetic-contact-0002" });
        const reversedAccess = await crm.accessCrmHandoffArtifact({ workspaceId: hierarchy.workspaceId, artifactId: csv.artifactId, ports: reversedPorts });
        assert.equal(reversedAccess.reason, "eligibility_changed", label);
        const reversedPlan = await crm.planCrmHandoff({ workspaceId: hierarchy.workspaceId, ports: reversedPorts });
        assert.deepEqual(reversedPlan.rows.map((row) => row.contactId), ["synthetic-contact-0001", "synthetic-contact-0003"], label);
        assert.notEqual(reversedPlan.snapshotDigest, csv.plan.snapshotDigest, label);
        // A browser that still holds the earlier snapshot cannot materialize it.
        assert.equal((await crm.materializeCrmHandoff({ workspaceId: hierarchy.workspaceId, staleSnapshotDigest: csv.plan.snapshotDigest, ports: reversedPorts })).reason, "snapshot_stale", label);

        assert.deepEqual(csv.store.records.map((entry) => Buffer.from(entry.bytes).toString("base64")), storedBefore, `${label}: stored bytes are never rebuilt or edited`);
        assert.equal(csv.store.refusals.filter((entry) => entry.reasonCode === "eligibility_changed").length, 2, label);
        assert.equal(counter.store, 0, `${label}: no refused path stored anything`);
      }
      assertNoEffects(effects);
    } finally {
      release();
    }
  });
});

test("CSV delivery expiry and archive upload expiry refuse with no bytes, no target delta, and no delivery call", async () => {
  await withModules(async ({ crm, archive, verifier, restore }) => {
    const effects = effectPorts();
    const release = trapNetwork(effects);
    try {
      for (const hierarchy of HIERARCHIES) {
        const label = hierarchy.key;
        const csv = await materializeCsv(crm, hierarchy);
        const counter = { eligibility: 0, suppression: 0, store: 0 };
        const late = crmPorts(hierarchy, { tombstones: sourceTombstones(), store: csv.store, counter, nowIso: () => "2026-03-17T03:30:00.001Z" });
        const expired = await crm.accessCrmHandoffArtifact({ workspaceId: hierarchy.workspaceId, artifactId: csv.artifactId, ports: late });
        assert.deepEqual({ status: expired.status, reason: expired.reason }, { status: "blocked", reason: "delivery_expired" }, label);
        assert.deepEqual(csv.store.ends.map((entry) => entry.eventKind), ["expired"], `${label}: the expiry is recorded once`);
        const after = await crm.accessCrmHandoffArtifact({ workspaceId: hierarchy.workspaceId, artifactId: csv.artifactId, ports: late });
        assert.equal(after.status, "blocked", label);
        assert.equal(csv.store.ends.length, 1, label);
        // A new request over the unchanged snapshot gets the next version; the expired one stays expired.
        const renewed = await crm.materializeCrmHandoff({ workspaceId: hierarchy.workspaceId, idempotencyKey: "renewal-after-expiry", ports: late });
        assert.equal(renewed.status, "materialized", label);
        assert.equal(renewed.version, 2, label);
        assert.equal(renewed.csvSha256 === csv.csvSha256, false, `${label}: each version carries its own manifest reference`);

        // Archive upload expiry and a tampered upload: zero target writes, zero locks, zero results.
        const source = sourceSnapshot(hierarchy, { histories: weeklyHistories(hierarchy), csv, tombstones: sourceTombstones() });
        const created = await archive.createWorkspaceArchive({ passphrase: PASSPHRASE, ports: archivePorts(hierarchy, source).ports });
        const bytes = textEncoder.encode(JSON.stringify(created.envelope));
        const tampered = textEncoder.encode(JSON.stringify({ ...created.envelope, ciphertext: `${created.envelope.ciphertext.slice(0, -8)}AAAAAAA=` }));
        for (const [name, upload, options, reason] of [
          ["expired upload", bytes, { archiveExpiresAt: AS_OF_MS - 1 }, "archive_expired"],
          ["tampered ciphertext", tampered, {}, "archive_untrusted"],
          ["wrong passphrase", bytes, { passphrase: "not-the-synthetic-passphrase-01" }, "archive_untrusted"],
          ["version skew", bytes, { schemaVersion: "prospector/portable-workspace-schema/v0" }, "version_skew"],
        ]) {
          const target = restorePorts(upload, effects, options);
          const result = await verifier.dryRunRestore({ archiveRef: "archive-upload-1", passphrase: options.passphrase ?? PASSPHRASE, ports: target.ports });
          assert.deepEqual(result, { status: "refused", reason }, `${label}: ${name}`);
          const applied = await restore.applyRestore({ archiveRef: "archive-upload-1", dryRunId: `rdr_${"9".repeat(32)}`, nonce: "f".repeat(32), passphrase: options.passphrase ?? PASSPHRASE, ports: target.ports });
          assert.equal(applied.status, "refused", `${label}: ${name}`);
          assert.deepEqual(target.target.counter, { dataWrites: 0, objectWrites: 0 }, `${label}: ${name}`);
          assert.equal(target.evidence.dryRuns.size + target.evidence.locks.size + target.evidence.results.size, 0, `${label}: ${name}`);
        }

        // A dry run that expires before the restore never applies, and a second dry run supersedes nothing it did not verify.
        const target = restorePorts(bytes, effects);
        const dry = await verifier.dryRunRestore({ archiveRef: "archive-upload-1", passphrase: PASSPHRASE, ports: target.ports });
        target.clock.now = dry.expiresAt + 1;
        assert.deepEqual(await restore.applyRestore({ archiveRef: "archive-upload-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, ports: target.ports }), { status: "refused", reason: "dry_run_not_current" }, label);
        assert.deepEqual(target.target.counter, { dataWrites: 0, objectWrites: 0 }, label);
      }
      assertNoEffects(effects);
    } finally {
      release();
    }
  });
});

test("dry-run nonce races and concurrent restores apply exactly once; a nonce from another dry run or archive never applies", async () => {
  await withModules(async ({ crm, archive, verifier, restore }) => {
    const effects = effectPorts();
    const release = trapNetwork(effects);
    try {
      const [hierarchy, other] = HIERARCHIES;
      const csv = await materializeCsv(crm, hierarchy);
      const otherCsv = await materializeCsv(crm, other);
      const seal = async (h, c) => textEncoder.encode(JSON.stringify((await archive.createWorkspaceArchive({
        passphrase: PASSPHRASE,
        ports: archivePorts(h, sourceSnapshot(h, { histories: weeklyHistories(h), csv: c, tombstones: sourceTombstones() })).ports,
      })).envelope));
      const bytes = await seal(hierarchy, csv);
      const target = restorePorts(bytes, effects);
      target.uploads.set("archive-upload-other", { bytes: await seal(other, otherCsv), expiresAt: AS_OF_MS + 60 * MINUTE });
      const apply = (patch) => restore.applyRestore({ archiveRef: "archive-upload-1", passphrase: PASSPHRASE, ...patch, ports: target.ports });

      // Two dry runs of the same archive race; each nonce is bound to its own dry run.
      const [first, second] = await Promise.all([0, 1].map(() => verifier.dryRunRestore({ archiveRef: "archive-upload-1", passphrase: PASSPHRASE, ports: target.ports })));
      assert.equal(first.status, "verified");
      assert.equal(second.status, "verified");
      assert.notEqual(first.nonce, second.nonce);
      for (const [name, patch] of [
        ["crossed nonce", { dryRunId: first.dryRunId, nonce: second.nonce }],
        ["crossed dry run", { dryRunId: second.dryRunId, nonce: first.nonce }],
        ["nonce on another archive", { archiveRef: "archive-upload-other", dryRunId: first.dryRunId, nonce: first.nonce }],
      ]) {
        assert.equal((await apply(patch)).status, "refused", name);
        assert.deepEqual(target.target.counter, { dataWrites: 0, objectWrites: 0 }, name);
      }

      // Both racing dry runs try to restore at once, twice each: exactly one restore is applied.
      const outcomes = await Promise.all([first, second, first, second].map((dry) => apply({ dryRunId: dry.dryRunId, nonce: dry.nonce })));
      assert.equal(outcomes.filter((outcome) => outcome.status === "restored").length, 1, JSON.stringify(outcomes));
      assert.ok(outcomes.every((outcome) => ["restored", "refused", "already_restored"].includes(outcome.status)), JSON.stringify(outcomes));
      assert.equal([...target.evidence.results.values()].filter((result) => result.outcome === "applied").length, 1);
      const restoredRows = (await target.target.readRestored()).rows.length;
      assert.equal(target.target.counter.dataWrites, restoredRows, "rows were written once");
      // After the restore the target is never clean again.
      assert.deepEqual(await verifier.dryRunRestore({ archiveRef: "archive-upload-1", passphrase: PASSPHRASE, ports: target.ports }), { status: "refused", reason: "target_not_clean" });
      assertNoEffects(effects);
    } finally {
      release();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. End to end through the owner handler on the local 0023 repository
// ---------------------------------------------------------------------------

/** The authoritative projection of the restored target, rendered by the next case. */
let restoredUiProjection = null;

const PEPPER = "mining-pilot-handoff-integration-pepper-0001";
const SOURCE_OWNER = "source-owner@example.invalid";
const TARGET_OWNER = "target-owner@example.invalid";
const SOURCE_WS = "workspace-source-operating";
const TARGET_WS = "workspace-restore-target";
const T_RESTORE = Date.UTC(2026, 2, 15, 12, 0, 0);
const T_READ = Date.UTC(2026, 2, 16, 3, 30, 0);
const ARTIFACT_TABLES = ["recovery_archives", "recovery_dry_runs", "recovery_restore_locks", "recovery_restore_results", "handoff_export_artifacts", "handoff_schedule_observations"];
const D1_HIERARCHIES = Object.freeze([
  Object.freeze({ key: "operating", productId: "product-main", marketPlayId: "play-main", profileId: "profile-operating", profileName: "Operating" }),
  Object.freeze({ key: "logistics", productId: "product-routing", marketPlayId: "play-port-operators", profileId: "profile-terminal-operators", profileName: "Terminal operators" }),
]);

function ownerDependencies(database, email, overrides = {}) {
  return {
    database, subjectPepper: PEPPER, pilotOwnerEmail: email,
    getIdentity: async () => ({ email, displayName: "Owner" }), ...overrides,
  };
}

function mutation(body, headers = {}) {
  const merged = new Headers({
    origin: "https://prospector.test", "sec-fetch-site": "same-origin",
    "x-prospector-intent": "handoff-recovery-mutation", "content-type": "application/json",
  });
  for (const [name, value] of Object.entries(headers)) { if (value === null) merged.delete(name); else merged.set(name, value); }
  return new Request("https://prospector.test/api/handoff-recovery", { method: "POST", headers: merged, body: typeof body === "string" ? body : JSON.stringify(body) });
}

const sqlRun = (database, sql, ...bind) => database.prepare(sql).bind(...bind).run();

/**
 * Phase 4 writes these row ids with uuid v7(), and about one real v7 id in nine
 * carries seven decimal digits in a row. Every id the brief takes from a Phase 4
 * row is seeded in that canonical v7 shape with such a run, so the identity
 * fence is exercised against the ids production actually writes.
 */
function phase4RowId(label) {
  const hex = sha256Hex(textEncoder.encode(`phase4-row:${label}`));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-1234567${hex.slice(20, 25)}`;
}

/** The restored Phase 4 hierarchy the target's Phase 4 read sees: both profiles carry the source's ACTIVE schedule row. */
async function seedRestoredPhase4(database) {
  const at = Date.UTC(2026, 0, 5);
  const ws = TARGET_WS;
  await sqlRun(database, "INSERT INTO companies (id, workspace_id, created_at, updated_at, revision, name, status) VALUES (?, ?, ?, ?, 1, 'Synthetic Company', 'active')", "company-restored", ws, at, at);
  await sqlRun(database, "INSERT INTO workspace_companies (workspace_id, company_id, created_at) VALUES (?, ?, ?)", ws, "company-restored", at);
  for (const h of D1_HIERARCHIES) {
    await sqlRun(database, "INSERT INTO products (id, workspace_id, created_at, updated_at, revision, company_id, name, lifecycle) VALUES (?, ?, ?, ?, 1, ?, ?, 'ready')", h.productId, ws, at, at, "company-restored", `Product ${h.key}`);
    await sqlRun(database, "INSERT INTO market_plays (id, workspace_id, created_at, updated_at, revision, product_id, name, lifecycle) VALUES (?, ?, ?, ?, 1, ?, ?, 'active')", h.marketPlayId, ws, at, at, h.productId, `Play ${h.key}`);
    await sqlRun(database, "INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) VALUES (?, ?, ?, ?, 1, ?, ?, 'ready', 'America/Toronto', 7)", h.profileId, ws, at, at, h.marketPlayId, h.profileName);
    const configDigest = sha256Hex(textEncoder.encode(`restored-config:${h.key}`));
    await sqlRun(database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES (?, ?, ?, ?, 1, ?, 'profile', ?, 'profile_effective', ?, '{}', 1)", `config-${h.key}`, ws, at, at, "company-restored", h.profileId, configDigest);
    await sqlRun(database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'prospecting_schedule', ?, ?, 1, 'profile', ?, 'accepted')", phase4RowId(`command-schedule-${h.key}`), ws, at, at, `key-schedule-${h.key}`, sha256Hex(textEncoder.encode(`schedule-command:${h.key}`)), h.profileId);
    await sqlRun(
      database,
      `INSERT INTO prospecting_schedules
        (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id,
         configuration_digest, schedule_key, timezone, intended_local_time, utc_offset_minutes,
         cadence, next_run_at, last_successful_watermark, active, execution_state,
         authority_command_id, operation_digest, idempotency_key)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'America/Toronto', '06:00', -240, 'weekdays', ?, NULL, 1, 'active', ?, ?, ?)`,
      phase4RowId(`schedule-${h.key}`), ws, at, Date.UTC(2026, 2, 16, 3, 0, 0), h.profileId, `config-${h.key}`, configDigest, `sk-schedule-${h.key}`,
      Date.UTC(2026, 2, 16, 10, 0, 0), phase4RowId(`command-schedule-${h.key}`), sha256Hex(textEncoder.encode(`schedule-op:${h.key}`)), `idem-schedule-${h.key}`,
    );
  }
  await sqlRun(database, "INSERT INTO customer_profiles (id, workspace_id, created_at, updated_at, revision, play_id, name, lifecycle, timezone, weekly_target) VALUES (?, ?, ?, ?, 1, ?, 'Greenfield', 'draft', 'America/Toronto', 0)", "profile-greenfield", ws, at + 1, at + 1, "play-main");
}

/** A Phase 4 profile activation, written the way Phase 4 records it. Phase 7 never writes these rows. */
async function seedPhase4Activation(database, h, key, createdAt) {
  const ws = TARGET_WS;
  const sha = (value) => sha256Hex(textEncoder.encode(value));
  await sqlRun(database, "INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at) VALUES (?, ?, 'owner', 'owner', 'profile.activate', 'profile', ?, '{}', ?)", `audit-${key}`, ws, h.profileId, createdAt);
  for (const kind of ["candidate", "activation"]) {
    await sqlRun(database, "INSERT INTO authority_commands (id, workspace_id, created_at, updated_at, revision, command_type, idempotency_key, operation_digest, expected_revision, subject_type, subject_id, status) VALUES (?, ?, ?, ?, 1, 'profile_activation', ?, ?, 1, 'profile', ?, 'accepted')", `cmd-${kind}-${key}`, ws, createdAt, createdAt, `k-${kind}-${key}`, sha(`${kind}:${key}`), h.profileId);
  }
  await sqlRun(database, "INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES (?, ?, ?, ?, 1, ?, 'profile', ?, 'profile_effective', ?, '{}', 0)", `config-${key}`, ws, createdAt, createdAt, "company-restored", h.profileId, sha(`config:${key}`));
  await sqlRun(database, "INSERT INTO profile_configuration_candidates (id, workspace_id, created_at, updated_at, revision, profile_id, configuration_id, predecessor_configuration_id, authority_command_id, audit_event_id, candidate_digest, status) VALUES (?, ?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, 'candidate')", `candidate-${key}`, ws, createdAt, createdAt, h.profileId, `config-${key}`, `cmd-candidate-${key}`, `audit-${key}`, sha(`candidate-digest:${key}`));
  const operationDigest = sha(`activation-digest:${key}`);
  const activationId = phase4RowId(`activation-${key}`);
  await sqlRun(database, "INSERT INTO profile_configuration_activations (id, workspace_id, profile_id, candidate_id, previous_configuration_id, configuration_id, authority_command_id, audit_event_id, operation_digest, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)", activationId, ws, h.profileId, `candidate-${key}`, `config-${key}`, `cmd-activation-${key}`, `audit-${key}`, operationDigest, createdAt);
  return { id: activationId, digest: operationDigest };
}

async function counts(database, workspaceId) {
  const entries = [];
  for (const table of ARTIFACT_TABLES) {
    entries.push([table, Number((await database.prepare(`SELECT COUNT(*) count FROM ${table} WHERE workspace_id=?`).bind(workspaceId).first()).count)]);
  }
  entries.push(["accepted_dry_runs", Number((await database.prepare("SELECT COUNT(*) count FROM recovery_dry_runs WHERE workspace_id=? AND outcome='accepted'").bind(workspaceId).first()).count)]);
  return Object.fromEntries(entries);
}

async function scheduleState(database) {
  return (await database.prepare("SELECT id,revision,active,execution_state,updated_at,next_run_at FROM prospecting_schedules WHERE workspace_id=? ORDER BY id").bind(TARGET_WS).all()).results;
}

test("through the owner handler on D1: every invalid principal, scope, CSRF, reauthentication, passphrase, archive, target, version, and nonce condition has zero target delta; one restore applies; the restored target stays disabled pending fresh Phase 4 activation", async () => {
  const { createD1Fixture, applyMigrationsThrough } = await import("./helpers/d1.mjs");
  const { CANONICAL_MIGRATION_FILENAMES } = await import("../scripts/migration-chain.mjs");
  const fixture = await createD1Fixture("mining-pilot-handoff-integration");
  try {
    const { database } = fixture;
    await applyMigrationsThrough(database, CANONICAL_MIGRATION_FILENAMES.at(-1));
    const load = (path) => fixture.vite.ssrLoadModule(new URL(path, import.meta.url).pathname);
    const [interview, handler, repositoryModule, crm] = await Promise.all([
      load("../domain/interview.ts"), load("../domain/handoff-recovery-handler.ts"), load("../domain/handoff-recovery-repository.ts"), load("../domain/crm-handoff.ts"),
    ]);
    const principals = {
      source: await interview.principalFromIdentity(SOURCE_OWNER, "Owner", PEPPER),
      target: await interview.principalFromIdentity(TARGET_OWNER, "Owner", PEPPER),
    };
    for (const [id, subject] of [[SOURCE_WS, principals.source.subject], [TARGET_WS, principals.target.subject]]) {
      await database.prepare("INSERT INTO workspaces (id,company_name,owner_subject,created_at,updated_at,revision) VALUES (?,?,?,?,?,1)")
        .bind(id, "Synthetic workspace", subject, T_RESTORE - 60 * MINUTE, T_RESTORE - 60 * MINUTE).run();
    }
    const clock = { now: T_RESTORE };
    const effects = effectPorts();
    const reauth = { at: T_RESTORE - MINUTE };
    const authorityFor = (scope) => ({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, reauthenticatedAt: reauth.at, reauthReferenceDigest: "d".repeat(64) });

    // -- Source: the archive is created through the handler with server-derived scope.
    const operating = HIERARCHIES[0];
    const csv = await materializeCsv(crm, operating);
    const source = sourceSnapshot(operating, { histories: weeklyHistories(operating), csv, tombstones: sourceTombstones() });
    const sourceStore = new Map();
    const sourceState = { objects: source.objects };
    const sourceServices = (db, scope) => {
      const repository = repositoryModule.createD1HandoffRecoveryRepository(db, scope);
      return {
        mode: "synthetic", crm: null,
        recovery: {
          archive: {
            now: () => clock.now,
            random: (length) => new Uint8Array(length).fill(5),
            authority: { current: async () => authorityFor(scope) },
            source: { readSnapshot: async () => source.snapshot, readObject: async (digest) => sourceState.objects.get(digest) ?? null },
            archiveStore: { putImmutable: async (key, bytes) => { if (sourceStore.has(key)) throw new Error("object_conflict"); sourceStore.set(key, Uint8Array.from(bytes)); } },
            evidence: repository,
          },
          restore: { now: () => clock.now, authority: { current: async () => authorityFor(scope) }, archives: { readArchive: async () => null }, target: memoryRestoreTarget(), evidence: repository },
          currentRestoreArchiveRef: async () => null,
        },
      };
    };
    const sourceDeps = ownerDependencies(database, SOURCE_OWNER, { services: sourceServices, now: () => clock.now });
    const cookieFor = async (deps) => {
      const response = await handler.handleHandoffRecoveryGet(new Request("https://prospector.test/api/handoff-recovery"), deps);
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie").split(";")[0];
    };
    const postAs = async (deps, body, headers = {}) => handler.handleHandoffRecoveryPost(mutation(body, { cookie: await cookieFor(deps), ...headers }), deps);

    const sourceCases = [
      ["stale reauthentication", () => { reauth.at = clock.now - 16 * MINUTE; }, 409, ["reauthentication_required"]],
      ["missing archive object", () => { sourceState.objects = new Map(); }, 409, ["archive_object_missing"]],
    ];
    for (const [name, arrange, status, reasons] of sourceCases) {
      reauth.at = clock.now - MINUTE; sourceState.objects = source.objects;
      arrange();
      const response = await postAs(sourceDeps, { action: "create_archive", passphrase: PASSPHRASE });
      assert.equal(response.status, status, name);
      const text = await response.text();
      assert.doesNotMatch(text, new RegExp(PASSPHRASE, "u"), name);
      assert.deepEqual(JSON.parse(text).command.reasonCodes, reasons, name);
      assert.equal(sourceStore.size, 0, name);
      assert.equal((await counts(database, SOURCE_WS)).recovery_archives, 0, name);
    }
    reauth.at = clock.now - MINUTE; sourceState.objects = source.objects;
    const createdResponse = await postAs(sourceDeps, { action: "create_archive", passphrase: PASSPHRASE });
    assert.equal(createdResponse.status, 200);
    const createdText = await createdResponse.text();
    assert.doesNotMatch(createdText, new RegExp(PASSPHRASE, "u"));
    assert.doesNotMatch(createdText, /"ciphertext"|"salt"/u, "the sealed envelope never reaches the browser");
    assert.equal(sourceStore.size, 1);
    const [envelopeBytes] = sourceStore.values();

    // -- Target: the owner's upload is the exact sealed object, plus adversarial variants.
    const envelope = JSON.parse(new TextDecoder().decode(envelopeBytes));
    const uploads = new Map([
      ["archive-upload-1", { bytes: envelopeBytes, expiresAt: T_RESTORE + 60 * MINUTE }],
      ["archive-upload-tampered", { bytes: textEncoder.encode(JSON.stringify({ ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -8)}AAAAAAA=` })), expiresAt: T_RESTORE + 60 * MINUTE }],
      ["archive-upload-expired", { bytes: envelopeBytes, expiresAt: T_RESTORE - 1 }],
    ]);
    const current = { ref: "archive-upload-1", target: memoryRestoreTarget() };
    const cleanTarget = current.target;
    const targetServices = (db, scope) => ({
      mode: "synthetic", crm: null,
      recovery: {
        archive: {
          now: () => clock.now,
          authority: { current: async () => authorityFor(scope) },
          source: { readSnapshot: async () => { throw new Error("archive_source_invalid"); }, readObject: async () => null },
          archiveStore: { putImmutable: effects.archiveDelivery.deliver },
          evidence: repositoryModule.createD1HandoffRecoveryRepository(db, scope),
        },
        restore: {
          now: () => clock.now,
          authority: { current: async () => authorityFor(scope) },
          archives: { readArchive: async (key) => uploads.get(key) ?? null },
          target: current.target,
          evidence: repositoryModule.createD1HandoffRecoveryRepository(db, scope),
        },
        currentRestoreArchiveRef: async () => current.ref,
      },
    });
    const targetDeps = ownerDependencies(database, TARGET_OWNER, { services: targetServices, now: () => clock.now });
    const read = async () => (await handler.handleHandoffRecoveryGet(new Request("https://prospector.test/api/handoff-recovery"), targetDeps)).json();
    const zero = { recovery_archives: 0, recovery_dry_runs: 0, recovery_restore_locks: 0, recovery_restore_results: 0, handoff_export_artifacts: 0, handoff_schedule_observations: 0, accepted_dry_runs: 0 };
    const assertNoDelta = async (label) => {
      const now = await counts(database, TARGET_WS);
      assert.deepEqual({ ...now, recovery_dry_runs: 0 }, { ...zero }, label);
      assert.deepEqual(cleanTarget.counter, { dataWrites: 0, objectWrites: 0 }, label);
      assert.equal((await cleanTarget.readState()).empty, true, label);
      assertNoEffects(effects, label);
    };

    const initial = await read();
    assert.deepEqual(initial.recovery.gates.dryRun, { available: true, firstUnmetPredicate: null });
    assert.deepEqual(initial.recovery.gates.restore, { available: false, firstUnmetPredicate: "dry_run_required" });
    assert.equal(initial.context.workspaceId, TARGET_WS, "the target owner sees only the target workspace");

    const dryBody = (patch = {}) => ({ action: "run_dry_run", archiveRef: "archive-upload-1", passphrase: PASSPHRASE, ...patch });
    const transportCases = [
      ["non-owner principal", async () => handler.handleHandoffRecoveryPost(mutation(dryBody(), { cookie: await cookieFor(targetDeps) }), ownerDependencies(database, TARGET_OWNER, { services: targetServices, now: () => clock.now, getIdentity: async () => ({ email: "intruder@example.invalid", displayName: "Other" }) })), 404],
      ["source owner reaching for the target", async () => postAs(sourceDeps, dryBody()), 409],
      ["foreign origin", async () => postAs(targetDeps, dryBody(), { origin: "https://foreign.test" }), 403],
      ["missing intent", async () => postAs(targetDeps, dryBody(), { "x-prospector-intent": null }), 403],
      ["missing CSRF", async () => handler.handleHandoffRecoveryPost(mutation(dryBody()), targetDeps), 403],
      ["client-supplied target scope", async () => postAs(targetDeps, dryBody({ targetWorkspaceId: SOURCE_WS })), 400],
      ["client-supplied workspace", async () => postAs(targetDeps, dryBody({ workspaceId: TARGET_WS })), 400],
      ["short passphrase", async () => postAs(targetDeps, dryBody({ passphrase: "too-short" })), 400],
      ["schedule action", async () => postAs(targetDeps, { action: "enable_schedule" }), 400],
    ];
    for (const [name, attempt, status] of transportCases) {
      const response = await attempt();
      assert.equal(response.status, status, name);
      assert.doesNotMatch(await response.text(), new RegExp(PASSPHRASE, "u"), name);
      await assertNoDelta(name);
    }
    // A CSRF token is single use: the replay is refused before any service runs.
    const cookie = await cookieFor(targetDeps);
    const firstUse = await handler.handleHandoffRecoveryPost(mutation(dryBody({ archiveRef: "archive-upload-2" }), { cookie }), targetDeps);
    assert.equal(firstUse.status, 409);
    const replayedToken = await handler.handleHandoffRecoveryPost(mutation(dryBody(), { cookie }), targetDeps);
    assert.equal(replayedToken.status, 403, "replayed CSRF");
    await assertNoDelta("replayed CSRF");

    const versionSkewTarget = memoryRestoreTarget({ schemaVersion: "prospector/portable-workspace-schema/v0" });
    const serviceCases = [
      ["stale archive reference", () => {}, dryBody({ archiveRef: "archive-upload-2" }), ["stale_projection"]],
      ["stale reauthentication", () => { reauth.at = clock.now - 16 * MINUTE; }, dryBody(), ["reauthentication_required"]],
      ["wrong passphrase", () => {}, dryBody({ passphrase: "not-the-synthetic-passphrase-01" }), ["archive_untrusted"]],
      ["tampered archive", () => { current.ref = "archive-upload-tampered"; }, dryBody({ archiveRef: "archive-upload-tampered" }), ["archive_untrusted"]],
      ["expired archive delivery", () => { current.ref = "archive-upload-expired"; }, dryBody({ archiveRef: "archive-upload-expired" }), ["archive_expired"]],
      ["version-skewed target", () => { current.target = versionSkewTarget; }, dryBody(), ["version_skew"]],
    ];
    for (const [name, arrange, body, reasons] of serviceCases) {
      reauth.at = clock.now - MINUTE; current.ref = "archive-upload-1"; current.target = cleanTarget;
      arrange();
      const response = await postAs(targetDeps, body);
      assert.equal(response.status, 409, name);
      const result = await response.json();
      assert.equal(result.command.status, "refused", name);
      assert.deepEqual(result.command.reasonCodes, reasons, name);
      assert.equal(result.command.targetWrites, 0, name);
      assert.ok([result.command.schedulerCalls, result.command.runnerCalls, result.command.providerCalls, result.command.sends, result.command.crmSyncs].every((value) => value === 0), name);
      assert.equal(result.projection.recovery.currentDryRun, null, name);
      assert.equal(result.projection.recovery.gates.restore.available, false, name);
      await assertNoDelta(name);
      assert.deepEqual(versionSkewTarget.counter, { dataWrites: 0, objectWrites: 0 }, name);
    }
    reauth.at = clock.now - MINUTE; current.ref = "archive-upload-1"; current.target = cleanTarget;

    // -- Nonce race: two verified dry runs; only the current one, with its own nonce, can restore.
    const firstDry = (await (await postAs(targetDeps, dryBody())).json()).command;
    clock.now += 1;
    const secondDry = (await (await postAs(targetDeps, dryBody())).json()).command;
    assert.equal(firstDry.status, "applied");
    assert.equal(secondDry.status, "applied");
    assert.notEqual(firstDry.nonce, secondDry.nonce);
    assert.deepEqual(cleanTarget.counter, { dataWrites: 0, objectWrites: 0 }, "dry runs write no target data");
    const restoreBody = (dry, patch = {}) => ({ action: "restore_verified_archive", archiveRef: "archive-upload-1", dryRunId: dry.dryRunId, nonce: dry.nonce, passphrase: PASSPHRASE, confirmed: true, ...patch });
    for (const [name, body, status] of [
      ["superseded dry run", restoreBody(firstDry), 409],
      ["nonce from the other dry run", restoreBody(secondDry, { nonce: firstDry.nonce }), 409],
      ["unconfirmed", restoreBody(secondDry, { confirmed: false }), 400],
      ["wrong passphrase", restoreBody(secondDry, { passphrase: "not-the-synthetic-passphrase-01" }), 409],
    ]) {
      const response = await postAs(targetDeps, body);
      assert.equal(response.status, status, name);
      assert.deepEqual(cleanTarget.counter, { dataWrites: 0, objectWrites: 0 }, name);
      assert.equal((await counts(database, TARGET_WS)).recovery_restore_results, 0, name);
    }
    const locksAfterRefusals = (await counts(database, TARGET_WS)).recovery_restore_locks;

    // -- Concurrent restores with the current dry run: exactly one applies.
    const cookies = await Promise.all([0, 1].map(() => cookieFor(targetDeps)));
    const raced = await Promise.all(cookies.map((value) => handler.handleHandoffRecoveryPost(mutation(restoreBody(secondDry), { cookie: value }), targetDeps)));
    const racedBodies = await Promise.all(raced.map(async (response) => ({ status: response.status, body: await response.json() })));
    const winners = racedBodies.filter((entry) => entry.status === 200 && entry.body.command.status === "applied");
    assert.equal(winners.length, 1, JSON.stringify(racedBodies.map((entry) => [entry.status, entry.body.command?.reasonCodes ?? entry.body.error])));
    for (const entry of racedBodies.filter((value) => value !== winners[0])) {
      assert.ok(entry.status === 409 || entry.status === 503, `the loser is refused or an unknown outcome, never a second restore: ${JSON.stringify(entry)}`);
    }
    const [winner] = winners;
    assert.deepEqual(winner.body.command.effects, EFFECT_FENCE);
    const writesAfterRestore = { ...cleanTarget.counter };
    assert.ok(writesAfterRestore.dataWrites > 0);
    assert.equal(writesAfterRestore.objectWrites, 1, "the CSV artifact object is restored once");
    const settled = await counts(database, TARGET_WS);
    assert.equal(settled.recovery_restore_results, 1);
    assert.equal(settled.recovery_restore_locks, locksAfterRefusals + 1);
    const restoreRow = await database.prepare("SELECT outcome,schedules_enabled,effects_enabled,completed_at FROM recovery_restore_results WHERE workspace_id=?").bind(TARGET_WS).first();
    assert.deepEqual([restoreRow.outcome, Number(restoreRow.schedules_enabled), Number(restoreRow.effects_enabled)], ["applied", 0, 0]);

    // -- Replay: the same restore again changes nothing.
    const replay = await postAs(targetDeps, restoreBody(secondDry));
    assert.equal(replay.status, 409);
    assert.deepEqual(cleanTarget.counter, writesAfterRestore);
    const again = await (await postAs(targetDeps, dryBody())).json();
    assert.equal(again.command.status, "refused", "a restored target is never clean again");
    assert.deepEqual(cleanTarget.counter, writesAfterRestore);
    const restoredProjection = await read();
    assert.deepEqual(restoredProjection.recovery.gates.restore, { available: false, firstUnmetPredicate: "target_already_restored" });
    assert.deepEqual(restoredProjection.recovery.restores.map((entry) => [entry.outcome, entry.schedulesEnabled, entry.effectsEnabled]), [["applied", false, false]]);
    assert.deepEqual(restoredProjection.recovery.effectFence, EFFECT_FENCE);

    // -- The restored Phase 4 rows arrive carrying the source's ACTIVE schedules. Phase 7 reports them disabled.
    await seedRestoredPhase4(database);
    await seedPhase4Activation(database, D1_HIERARCHIES[0], "source-before-restore", T_RESTORE - 24 * 60 * MINUTE);
    clock.now = T_READ;
    const schedulesBefore = await scheduleState(database);
    const auditBefore = Number((await database.prepare("SELECT COUNT(*) count FROM audit_events WHERE workspace_id=?").bind(TARGET_WS).first()).count);
    const pending = await read();
    assert.equal(pending.context.briefStatus, "available", JSON.stringify(pending.context));
    assert.deepEqual(pending.context.profiles.map((profile) => profile.profileId).sort(), D1_HIERARCHIES.map((h) => h.profileId).sort(), "Greenfield is not an operating profile");
    for (const profile of pending.context.profiles) {
      assert.equal(profile.schedule.status, "disabled_pending_fresh_upstream_activation", profile.profileId);
      assert.equal(profile.schedule.reportedState, "disabled", profile.profileId);
      assert.deepEqual([profile.schedule.cadence, profile.schedule.localTime, profile.schedule.timeZone], ["weekdays", "06:00", "America/Toronto"], profile.profileId);
      assert.equal(profile.schedule.changeableFromThisSurface, false, profile.profileId);
    }

    // Every further Phase 7 read and refused command leaves the Phase 4 schedule rows and audit untouched.
    for (const body of [{ action: "enable_schedule" }, dryBody(), restoreBody(secondDry)]) await postAs(targetDeps, body);
    await read();
    assert.deepEqual(await scheduleState(database), schedulesBefore, "Phase 7 never changes a Phase 4 schedule row");
    assert.equal(Number((await database.prepare("SELECT COUNT(*) count FROM audit_events WHERE workspace_id=?").bind(TARGET_WS).first()).count), auditBefore, "Phase 7 writes no Phase 4 audit event");
    assert.equal((await counts(database, TARGET_WS)).handoff_schedule_observations, 0, "no schedule observation is recorded by a read");
    const commandKinds = (await database.prepare("SELECT DISTINCT command_kind FROM handoff_recovery_commands").all()).results.map((row) => row.command_kind);
    assert.deepEqual(commandKinds.filter((kind) => /schedule|runner|activation/u.test(kind)), [], `no schedule command: ${commandKinds.join(",")}`);

    // Only a fresh upstream Phase 4 activation, after the restore, is then reported, never caused, by Phase 7.
    await seedPhase4Activation(database, D1_HIERARCHIES[0], "fresh-after-restore", T_RESTORE + 6 * 60 * MINUTE);
    const activated = await read();
    const byProfile = Object.fromEntries(activated.context.profiles.map((profile) => [profile.profileId, profile.schedule]));
    assert.equal(byProfile["profile-operating"].status, "current");
    assert.equal(byProfile["profile-operating"].reportedState, "enabled");
    assert.equal(byProfile["profile-terminal-operators"].status, "disabled_pending_fresh_upstream_activation", "another profile's activation releases nothing");
    assert.deepEqual(await scheduleState(database), schedulesBefore);
    assertNoEffects(effects, "no network or archive-delivery call");
    restoredUiProjection = activated;
  } finally {
    await fixture.dispose();
  }
});

test("the Exports & History view renders the restored target's real projection with every control honest and no schedule, runner, or CRM control", async () => {
  assert.ok(restoredUiProjection, "the D1 end-to-end case produced the restored projection");
  await withModules(async ({ load }) => {
    const leaves = await load("../app/exports/handoff-recovery-leaves.tsx");
    const workspace = await load("../app/exports/handoff-recovery-workspace.tsx");
    const projection = leaves.normalizeHandoffRecoveryProjection(restoredUiProjection);
    assert.ok(projection, "the server projection normalizes");
    const html = renderToStaticMarkup(React.createElement(workspace.HandoffRecoveryView, { projection, interaction: workspace.READ_ONLY_RECOVERY_INTERACTION }));
    const text = html.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ");
    // Schedule state is reported per profile: only the freshly activated one is shown as reported by Phase 4.
    assert.match(text, /Weekdays · 06:00 · America\/Toronto — reported enabled by Phase 4/u);
    assert.ok(text.includes(leaves.SCHEDULE_BLOCKED_COPY), "the profile still pending activation is not shown as current");
    // Restore is complete and fenced; the restore control is natively disabled with its reason.
    const restoreButton = html.match(/<button[^>]*>[^<]*Restore[^<]*<\/button>/u)?.[0] ?? "";
    if (restoreButton) assert.match(restoreButton, /disabled=""/u);
    assert.match(text, /target already restored|already restored/iu);
    // No control can start, enable, schedule, run, or sync anything.
    for (const label of ["Start", "Enable", "Run now", "Schedule", "Sync"]) {
      assert.doesNotMatch(html, new RegExp(`<button[^>]*>[^<]*\\b${label}\\b`, "u"), label);
    }
    assert.doesNotMatch(html, new RegExp(PASSPHRASE, "u"));
    assert.doesNotMatch(html, /(?:tel|mailto):/u);
  }, [react()]);
});
