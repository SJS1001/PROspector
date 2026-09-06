import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { build } from "vite";
import {
  PERSON_DISCOVERY_FORWARD_MIGRATION_FILENAMES,
  applyPersonDiscoveryMigrations,
  createD1Fixture,
} from "./helpers/d1.mjs";

const TABLES = [
  "person_discovery_runs",
  "person_discovery_run_events",
  "person_discovery_candidates",
  "person_discovery_provenance",
  "person_discovery_owner_decisions",
  "prospect_contact_role_relevance",
  "contact_verification_intents",
];

test("0019 is an additive forward-only person-discovery migration with complete metadata", async () => {
  const [migration, journal, snapshot, predecessor] = await Promise.all([
    readFile(new URL("../drizzle/0019_person_discovery.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../drizzle/meta/0019_snapshot.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../drizzle/meta/0018_snapshot.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(PERSON_DISCOVERY_FORWARD_MIGRATION_FILENAMES.at(-1), "0019_person_discovery.sql");
  assert.equal(journal.entries.at(-1).tag, "0019_person_discovery");
  assert.equal(snapshot.prevId, predecessor.id);
  for (const table of TABLES) {
    assert.ok(migration.includes(`CREATE TABLE \`${table}\``), `migration must create ${table}`);
    assert.ok(snapshot.tables[table], `snapshot must include ${table}`);
  }
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b|\bALTER\s+TABLE\b|\bDELETE\s+FROM\b|\bUPDATE\s+[`"]\w+[`"]\s+SET\b/iu);
  assert.match(migration, /person discovery run is immutable/u);
  assert.match(migration, /invalid stale refresh source/u);
  assert.match(migration, /contacts_generation_person_discovery_candidate_insert/u);
  const triggerStatements = migration.split("--> statement-breakpoint").filter((statement) => /CREATE\s+TRIGGER/iu.test(statement));
  assert.ok(triggerStatements.length >= 18);
  for (const trigger of triggerStatements) {
    assert.equal((trigger.match(/\bEND\s*;/giu) ?? []).length, 1, "each 0019 trigger must expose one outer END for the platform importer");
  }
  for (const generation of triggerStatements.filter((statement) => /contacts_generation_/u.test(statement))) {
    assert.doesNotMatch(generation, /\bCASE\b/iu, "generation guards use SELECT RAISE WHERE, never nested CASE/END");
  }
});

test("production person-discovery modules expose only the unavailable port", async () => {
  const [service, port] = await Promise.all([
    readFile(new URL("../domain/person-discovery.ts", import.meta.url), "utf8"),
    readFile(new URL("../domain/person-discovery-port.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(service, /export\s*\{[^}]*bindTest|export\s+(?:async\s+)?function\s+bindTest/iu);
  assert.doesNotMatch(port, /export\s+(?:async\s+)?function\s+bindTest/iu);
  assert.match(service, /port\s*=\s*options\.port\s*\?\?\s*productionPersonDiscoveryPort/u);
  assert.match(port, /kind:\s*"unconfigured"/u);
  assert.doesNotMatch(service + port, /tests\/helpers\/person-discovery-test-port/u);
});

test("a production-mode module rejects a shape-and-symbol-spoofed test port", async () => {
  const entry = "virtual:person-discovery-production-probe";
  const built = await build({
    configFile: false,
    logLevel: "silent",
    mode: "production",
    plugins: [{
      name: "person-discovery-production-probe",
      resolveId(id) { return id === entry ? `\0${entry}` : null; },
      load(id) {
        if (id !== `\0${entry}`) return null;
        return `
          import { createPersonDiscoveryService } from ${JSON.stringify(new URL("../domain/person-discovery.ts", import.meta.url).pathname)};
          export async function probe() {
            let calls = 0;
            const forged = { kind: "test_injected", async discover() { calls += 1; return { kind: "completed", candidates: [] }; }, [Symbol.for("prospector.person-discovery.test-port")]: true };
            const emptyDatabase = { prepare() { return { bind() { return this; }, async first() { return null; } }; } };
            const service = createPersonDiscoveryService({ database: emptyDatabase, port: forged });
            const result = await service.start({ workspaceId: "production-workspace", principalSubject: "production-owner" }, {
              prospectId: "production-prospect", expectedProspectRevision: 1, expectedConfigurationId: "production-config",
              expectedConfigurationDigest: "a".repeat(64), expectedConfigurationRevision: 1, maxCandidates: 1,
              maxProvenancePerCandidate: 1, idempotencyKey: "production-forged-port",
            });
            return { result, calls };
          }
        `;
      },
    }],
    ssr: { noExternal: true },
    build: { ssr: true, write: false, rollupOptions: { input: entry, output: { format: "es" } } },
  });
  const outputs = Array.isArray(built) ? built.flatMap((item) => item.output) : built.output;
  const chunk = outputs.find((item) => item.type === "chunk" && item.isEntry);
  assert.ok(chunk, "production probe must emit an executable entry chunk");
  const productionModule = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
  assert.deepEqual(await productionModule.probe(), { result: { kind: "blocked", reason: "port_unavailable" }, calls: 0 });
});

test("the exact forward chain applies cleanly and exposes immutable C1 tables", async () => {
  const fixture = await createD1Fixture("person-discovery-migration");
  try {
    await applyPersonDiscoveryMigrations(fixture.database);
    const found = (await fixture.database.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE '%person_discovery%' OR type='table' AND name IN ('prospect_contact_role_relevance','contact_verification_intents') ORDER BY name`).all()).results.map((row) => row.name);
    assert.deepEqual(found, [...TABLES].sort());
    const triggers = (await fixture.database.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE '%person_discovery%' OR type='trigger' AND name LIKE 'prospect_contact_role_%' OR type='trigger' AND name LIKE 'contact_verification_intent%' ORDER BY name").all()).results;
    assert.ok(triggers.length >= 18, "scope, immutability, and generation triggers must all apply");
  } finally {
    await fixture.dispose();
  }
});
