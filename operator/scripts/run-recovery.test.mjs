import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  INTERRUPTED_RUN_REASON,
  exportWorkspaceArchive,
  recoverInterruptedRuns,
  restoreWorkspaceArchive,
} from "../src/lib/server/archive.ts";

// Synthetic, local-only PGlite fixture. No provider, network or hosted access.
let pg;
const query = async (text, params = []) => (await pg.query(text, params)).rows;
const sql = Object.assign(
  async (parts, ...values) => {
    let text = parts[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${parts[i + 1]}`;
    return query(text, values);
  },
  { query, transaction: (fn) => fn(sql) },
);
const adapter = {
  transaction: (fn) =>
    pg.transaction(async (tx) => {
      const q = async (text, params = []) => (await tx.query(text, params)).rows;
      const inner = Object.assign(
        async (parts, ...values) => {
          let text = parts[0];
          for (let i = 0; i < values.length; i++) text += `$${i + 1}${parts[i + 1]}`;
          return q(text, values);
        },
        { query: q },
      );
      return fn(inner);
    }),
};
before(async () => {
  pg = new PGlite();
  for (const n of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8"));
});
after(async () => pg?.close());

async function reset() {
  await pg.exec("truncate prospecting_runs, discovery_runs, workspaces");
}
const activeProspecting = async (user) =>
  query(
    "select id from prospecting_runs where user_id = $1 and status in ('queued','running')",
    [user],
  );

test("startup recovery fails every queued/running run with a terminal reason", async () => {
  await reset();
  await pg.exec(`
    insert into prospecting_runs (id, user_id, configuration_digest, trigger, status)
      values ('r1','owner','d','manual','running'),('r2','other','d','manual','queued'),
             ('r3','owner','d','manual','succeeded');
    insert into discovery_runs (id, user_id, configuration_digest, trigger, status)
      values ('d1','owner','d','manual','running'),('d2','owner','d','manual','failed');`);
  const counts = await recoverInterruptedRuns(sql);
  assert.deepEqual(counts, { prospecting: 2, discovery: 1 });
  const runs = await query("select id, status, terminal_reason, finished_at from prospecting_runs order by id");
  assert.deepEqual(
    runs.map((r) => [r.id, r.status, r.terminal_reason]),
    [
      ["r1", "failed", INTERRUPTED_RUN_REASON],
      ["r2", "failed", INTERRUPTED_RUN_REASON],
      ["r3", "succeeded", null],
    ],
  );
  assert.ok(runs[0].finished_at && runs[1].finished_at);
  const [d1] = await query("select status, terminal_reason from discovery_runs where id = 'd1'");
  assert.deepEqual(d1, { status: "failed", terminal_reason: INTERRUPTED_RUN_REASON });
  assert.equal(INTERRUPTED_RUN_REASON, "Interrupted; not resumed");
  assert.deepEqual(await activeProspecting("owner"), []);
  // A second sweep is a no-op.
  assert.deepEqual(await recoverInterruptedRuns(sql), { prospecting: 0, discovery: 0 });
});

test("the database refuses a second active run per workspace", async () => {
  await reset();
  await pg.exec(
    "insert into prospecting_runs (id, user_id, configuration_digest, trigger, status) values ('a','owner','d','manual','running')",
  );
  await assert.rejects(
    pg.exec(
      "insert into prospecting_runs (id, user_id, configuration_digest, trigger, status) values ('b','owner','d','manual','queued')",
    ),
    /duplicate key|unique/i,
  );
  await pg.exec(
    "insert into discovery_runs (id, user_id, configuration_digest, trigger, status) values ('a','owner','d','manual','running')",
  );
  await assert.rejects(
    pg.exec(
      "insert into discovery_runs (id, user_id, configuration_digest, trigger, status) values ('b','owner','d','manual','running')",
    ),
    /duplicate key|unique/i,
  );
  // Terminal history is unconstrained.
  await pg.exec(
    "insert into prospecting_runs (id, user_id, configuration_digest, trigger, status) values ('c','owner','d','manual','failed'),('e','owner','d','manual','failed')",
  );
});

test("restoring a backup taken mid-run yields failed, not active, runs", async () => {
  await reset();
  await pg.exec(`
    insert into workspaces (user_id, company_name, company_legal) values ('src','Fictional','Fictional Ltd');
    insert into prospecting_runs (id, user_id, configuration_digest, trigger, status, started_at)
      values ('pr1','src','d','manual','running','2026-11-01T00:00:00Z'),
             ('pr2','src','d','manual','succeeded','2026-10-01T00:00:00Z');
    insert into discovery_runs (id, user_id, configuration_digest, trigger, status, started_at)
      values ('dr1','src','d','manual','queued','2026-11-01T00:00:00Z');`);
  const archive = await exportWorkspaceArchive("src", adapter);
  assert.equal(archive.tables.prospecting_runs.find((r) => r.id === "pr1").status, "running");
  for (const owner of ["src", "dest"]) {
    await restoreWorkspaceArchive(owner, archive, adapter);
    const runs = await query(
      "select status, terminal_reason, finished_at from prospecting_runs where user_id = $1 order by started_at desc",
      [owner],
    );
    assert.equal(runs.length, 2);
    assert.equal(runs[0].status, "failed");
    assert.equal(runs[0].terminal_reason, INTERRUPTED_RUN_REASON);
    assert.ok(runs[0].finished_at);
    assert.equal(runs[1].status, "succeeded");
    const [disc] = await query(
      "select status, terminal_reason from discovery_runs where user_id = $1",
      [owner],
    );
    assert.deepEqual(disc, { status: "failed", terminal_reason: INTERRUPTED_RUN_REASON });
    assert.deepEqual(await activeProspecting(owner), []);
  }
});

test("the server entry sweeps interrupted runs before it serves requests", () => {
  const entry = readFileSync(new URL("../server/local-node-entry.ts", import.meta.url), "utf8");
  const sweep = entry.indexOf("await recoverInterruptedRuns(");
  assert.ok(sweep > 0, "startup must await the recovery sweep");
  assert.ok(sweep < entry.indexOf("serve({"), "the sweep must run before serve()");
});
