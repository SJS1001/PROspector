import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (process.argv[2] === "child") {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true },
    appType: "custom",
  });
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  try {
    const sql = await db.getSql();
    const { ensureWorkspace } = await server.ssrLoadModule("/src/lib/server/seed.ts");
    const { exportWorkspaceArchive, restoreWorkspaceArchive } = await server.ssrLoadModule(
      "/src/lib/server/archive.ts",
    );
    const { getArchiveAdapter } = await server.ssrLoadModule("/src/lib/server/archive-db.ts");
    const adapter = await getArchiveAdapter();
    const owner = "fictional-integration-owner";
    if (process.argv[3] === "write") {
      await ensureWorkspace(sql, owner);
      await sql`update knowledge_items set question = 'Historical fictional question', evidence = 'Historical fictional evidence', inference = 'Historical inference', sort_order = 987 where user_id = ${owner} and question_id = 'company.legal_name'`;
      await sql`insert into prospects (id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ('p',${owner},'Fictional Quarry','a','Fictional Plant','t','o',9,'Passed','approved','cfg','assessment','{"passRule":"Fictional rule","hardDisqualifier":null,"dimensions":[]}','Fictional evidence','https://quarry.example',1,'2026-10-28')`;
      await sql`insert into contacts (id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence) values ('c',${owner},'p','Fictional Person','champion','public_source','person@quarry.example','https://quarry.example','high')`;
      await sql`insert into outreach_packages (id,user_id,prospect_id,status,subject,body,digest) values ('pack',${owner},'p','draft','Fictional subject','Fictional body','d')`;
      await sql`insert into outreach_messages (id,user_id,package_id,prospect_id,contact_id,to_email,subject,body,digest,status,acknowledged) values ('m',${owner},'pack','p','c','person@quarry.example','Fictional subject','Fictional body','d','handed_off',false)`;
      await sql`insert into delivery_events (id,user_id,message_id,kind,note) values ('manual-handoff:m',${owner},'m','manual_handoff','Delivery unconfirmed')`;
      const archive = await exportWorkspaceArchive(owner, adapter);
      await restoreWorkspaceArchive(owner, archive, adapter);
      const restored = await exportWorkspaceArchive(owner, adapter);
      await ensureWorkspace(sql, owner);
      assert.deepEqual(
        (await exportWorkspaceArchive(owner, adapter)).tables,
        restored.tables,
        "ordinary workspace read preserves all restored history",
      );
      assert.equal(restored.tables.outreach_messages[0].status, "handed_off");
      assert.equal(
        restored.tables.delivery_events.filter((e) => e.kind === "manual_handoff").length,
        1,
      );
      await assert.rejects(
        adapter.transaction(async (tx) => {
          await tx`delete from knowledge_items where user_id = ${owner}`;
          throw new Error("fictional restore failure");
        }),
        /fictional restore failure/,
      );
      assert.deepEqual((await exportWorkspaceArchive(owner, adapter)).tables, restored.tables);
      writeFileSync(
        join(process.env.OPERATOR_DATA_DIR, "integration-snapshot.json"),
        JSON.stringify(restored.tables),
        { mode: 0o600 },
      );
    } else {
      await ensureWorkspace(sql, owner);
      const archive = await exportWorkspaceArchive(owner, adapter);
      const snapshot = JSON.parse(
        readFileSync(join(process.env.OPERATOR_DATA_DIR, "integration-snapshot.json"), "utf8"),
      );
      assert.deepEqual(
        archive.tables,
        snapshot,
        "archive and terminal handoff survive separate process restart",
      );
    }
  } finally {
    await db.closeDatabase();
    await server.close();
  }
} else {
  test(
    "durable archive adapter preserves restored metadata and terminal handoff through reload, rollback and restart",
    { timeout: 90000 },
    () => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), "prospector-integration-")));
      try {
        for (const mode of ["write", "read"]) {
          const result = spawnSync(process.execPath, [import.meta.filename, "child", mode], {
            cwd: process.cwd(),
            env: { ...process.env, DATABASE_URL: "", OPERATOR_DATA_DIR: dir },
            encoding: "utf8",
            timeout: 40000,
          });
          assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
}
