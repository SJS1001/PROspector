import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import net from "node:net";
import dgram from "node:dgram";
import { createServer } from "vite";
import { seed } from "./fixture.mjs";

export const canonical = (v) =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canonical).join(",")}]`
      : `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(",")}}`;
const [mode, file, variant] = process.argv.slice(2);
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: "custom",
});
// Test-only process fence. No provider/runtime TCP, UDP or fetch is permitted.
const deny = () => {
  throw new Error("archive acceptance outbound socket denied");
};
net.Socket.prototype.connect = deny;
dgram.createSocket = deny;
globalThis.fetch = deny;
assert.throws(() => net.connect(443, "provider.invalid"), /outbound socket denied/);
const db = await server.ssrLoadModule("/src/lib/db.ts");
try {
  const sql = await db.getSql();
  const { exportWorkspaceArchive: exp, restoreWorkspaceArchive: restore } =
    await server.ssrLoadModule("/src/lib/server/archive.ts");
  const { getArchiveAdapter } = await server.ssrLoadModule("/src/lib/server/archive-db.ts");
  const adapter = await getArchiveAdapter();
  if (mode === "seed") {
    await seed(sql);
    await sql.query(
      "insert into suppressions(id,user_id,kind,value,reason) values ('foreign-s','foreign-fictional-owner','email','foreign@quarry.example','Fictional foreign opt out')",
    );
  } else if (mode === "export")
    writeFileSync(file, JSON.stringify(await exp("fictional-owner", adapter)));
  else if (mode === "snapshot") {
    const tables = await sql.query(
      "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name",
    );
    const result = {};
    for (const { table_name: table } of tables) {
      if (table === "_migrations") continue;
      result[table] = (await sql.query(`select * from "${table}"`))
        .map((row) => JSON.parse(JSON.stringify(row)))
        .sort((a, b) => canonical(a).localeCompare(canonical(b)));
    }
    writeFileSync(file, canonical(result));
  } else if (mode === "restore") {
    let input = JSON.parse(readFileSync(file, "utf8"));
    const rehash = () => {
      const { checksum: _, ...body } = input;
      input.checksum = createHash("sha256").update(canonical(body)).digest("hex");
    };
    if (variant === "omit-suppression") {
      input.tables.suppressions = [];
      rehash();
    }
    if (variant === "version") input.version = 999;
    if (variant === "digest") input.tables.workspaces[0].company_name = "Fictional tamper";
    if (variant === "reference") {
      input.tables.contacts[0].prospect_id = "missing";
      rehash();
    }
    if (variant === "duplicate") {
      input.tables.contacts.push({ ...input.tables.contacts[0] });
      rehash();
    }
    if (variant === "foreign-owner") {
      input.tables.contacts[0].user_id = "foreign-fictional-owner";
      rehash();
    }
    if (variant === "foreign-collision") {
      input.tables.suppressions[0].id = "foreign-s";
      rehash();
    }
    if (variant === "truncated") input = JSON.stringify(input).slice(0, -20);
    if (variant === "erase-handoff") {
      input.tables.delivery_events = input.tables.delivery_events.filter(
        (e) => e.kind !== "manual_handoff",
      );
      rehash();
    }
    if (variant === "erase-consumed") {
      const m = input.tables.outreach_messages.find((m) => m.status === "handed_off");
      m.status = "draft";
      m.dispatched_at = null;
      rehash();
    }
    const options = {};
    let activeTx;
    const instrumented =
      variant === "sql-failure"
        ? {
            transaction: (fn) =>
              adapter.transaction((tx) => {
                activeTx = tx;
                return fn(tx);
              }),
          }
        : adapter;
    if (variant === "sql-failure")
      options.afterTable = async (table) => {
        if (table === "contacts")
          await activeTx.query("insert into fictional_missing_table values (1)");
      };
    if (variant === "kill")
      options.afterTable = (table) => {
        if (table === "contacts") {
          writeFileSync(
            `${file}.interrupted`,
            "after contacts: deletes and inserts reached, no commit\n",
          );
          process.kill(process.pid, "SIGKILL");
        }
      };
    if (!variant || variant === "kill" || variant === "omit-suppression")
      await restore("fictional-owner", input, instrumented, options);
    else
      await assert.rejects(restore("fictional-owner", input, instrumented, options), {
        message: {
          version: /version/,
          digest: /checksum/,
          reference: /reference/,
          duplicate: /Duplicate contacts id/,
          "foreign-owner": /Invalid contacts fields/,
          "foreign-collision": /another workspace/,
          truncated: /Invalid archive/,
          "erase-handoff": /predates/,
          "erase-consumed": /predates/,
          "sql-failure": /fictional_missing_table/,
        }[variant],
      });
  } else throw new Error(`Unknown worker mode ${mode}`);
} finally {
  await db.closeDatabase();
  await server.close();
}
