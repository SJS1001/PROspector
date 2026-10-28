import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  exportWorkspaceArchive,
  restoreWorkspaceArchive,
  type ArchiveAdapter,
  type WorkspaceArchive,
} from "./archive.ts";
import type { Sql } from "../db";

async function setup() {
  const pg = new PGlite();
  for (const name of readdirSync("migrations")
    .filter((n) => /^000[2-8]_.*\.sql$/.test(n))
    .sort())
    await pg.exec(readFileSync(`migrations/${name}`, "utf8"));
  const adapter: ArchiveAdapter = {
    transaction: (fn) =>
      pg.transaction(async (tx) => {
        const query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await tx.query<T>(text, params)).rows;
        const sql = (async <T = Record<string, unknown>>(
          parts: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          let text = parts[0];
          for (let i = 0; i < values.length; i++) text += `$${i + 1}${parts[i + 1]}`;
          return query<T>(text, values);
        }) as Sql;
        sql.query = query;
        return fn(sql);
      }),
  };
  return { pg, adapter };
}
const canonical = (v: unknown): string =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canonical).join(",")}]`
      : `{${Object.keys(v as object)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
          .join(",")}}`;
function rehash(a: WorkspaceArchive) {
  const { checksum: _checksum, ...body } = a;
  a.checksum = createHash("sha256").update(canonical(body)).digest("hex");
}
async function fixture(pg: PGlite) {
  await pg.exec(`insert into workspaces(user_id, company_name, company_legal) values ('a','Acme','Acme Ltd'),('b','Other','Other Ltd');
    insert into prospects(id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ('p','a','Acme','account','Name','target','offer',1,'Passed','qualified','digest','assessment','{"passRule":"rule","hardDisqualifier":null,"dimensions":[]}','quote','https://example.com',1,'2026-01-01');
    insert into contacts(id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence) values ('c','a','p','Person','champion','public_source','a@example.com','source','high');
    insert into outreach_packages(id,user_id,prospect_id,status,subject,body,digest,approved_at) values ('pack','a','p','approved','Subject','Body','d',now());
    insert into outreach_messages(id,user_id,package_id,prospect_id,contact_id,to_email,subject,body,digest,status,acknowledged,approved_at) values ('m','a','pack','p','c','a@example.com','Subject','Body','d','approved',true,now());
    insert into suppressions(id,user_id,kind,value,reason) values ('s','a','email','a@example.com','opt out'),('sb','b','email','b@example.com','opt out');
    insert into operator_secrets(user_id,name,value) values ('b','schedule_enabled','1'),('b','api_key','keep');
    insert into enrichment_grants(id,user_id,prospect_id,status,reason) values ('grant','b','x','active','test');`);
}
test("portable restore remaps references, preserves suppressions and disables authority", async () => {
  const { pg, adapter } = await setup();
  try {
    await fixture(pg);
    const archive = await exportWorkspaceArchive("a", adapter);
    await restoreWorkspaceArchive("b", archive, adapter);
    const restored = await exportWorkspaceArchive("b", adapter);
    assert.equal(restored.tables.prospects.length, 1);
    assert.equal(restored.tables.contacts[0].prospect_id, restored.tables.prospects[0].id);
    assert.equal(restored.tables.outreach_messages[0].contact_id, restored.tables.contacts[0].id);
    assert.equal(restored.tables.outreach_messages[0].status, "blocked");
    assert.equal(restored.tables.outreach_messages[0].acknowledged, false);
    assert.ok(restored.tables.outreach_messages[0].approved_at);
    assert.equal(restored.tables.outreach_packages[0].status, "draft");
    assert.equal(restored.tables.suppressions.length, 2);
    assert.equal(
      (await pg.query("select * from enrichment_grants where user_id='b'")).rows.length,
      0,
    );
    assert.deepEqual(
      (await pg.query("select name,value from operator_secrets where user_id='b' order by name"))
        .rows,
      [
        { name: "api_key", value: "keep" },
        { name: "schedule_enabled", value: "0" },
      ],
    );
    assert.deepEqual(await exportWorkspaceArchive("a", adapter), archive);
  } finally {
    await pg.close();
  }
});
test("invalid archives, failures and interruption leave the owner unchanged", async () => {
  const { pg, adapter } = await setup();
  try {
    await fixture(pg);
    const a = await exportWorkspaceArchive("a", adapter),
      before = await exportWorkspaceArchive("b", adapter);
    const invalid = structuredClone(a);
    invalid.tables.contacts[0].prospect_id = "missing";
    rehash(invalid);
    await assert.rejects(restoreWorkspaceArchive("b", invalid, adapter), /reference/);
    const version = structuredClone(a);
    (version as { version: number }).version = 2;
    await assert.rejects(restoreWorkspaceArchive("b", version, adapter), /version/);
    const corrupted = structuredClone(a);
    corrupted.tables.workspaces[0].company_name = "tampered";
    await assert.rejects(restoreWorkspaceArchive("b", corrupted, adapter), /checksum/);
    await assert.rejects(
      restoreWorkspaceArchive("b", a, adapter, {
        afterTable: () => {
          throw new Error("injected");
        },
      }),
      /injected/,
    );
    const controller = new AbortController();
    await assert.rejects(
      restoreWorkspaceArchive("b", a, adapter, {
        signal: controller.signal,
        afterTable: () => controller.abort(),
      }),
      /aborted/,
    );
    assert.deepEqual(await exportWorkspaceArchive("b", adapter), before);
    assert.equal(
      (
        await pg.query<{ value: string }>(
          "select value from operator_secrets where user_id='b' and name='schedule_enabled'",
        )
      ).rows[0].value,
      "1",
    );
    assert.equal(
      (await pg.query("select * from enrichment_grants where user_id='b'")).rows.length,
      1,
    );
  } finally {
    await pg.close();
  }
});

/** Every v1 table has a meaningful row, including decisions and historical events. */
async function fillHistory(pg: PGlite) {
  await fixture(pg);
  const snapshot = JSON.stringify({
    company: "Acme",
    product: "Product",
    promise: "Promise",
    play: "Market",
    fit: "Fit",
    offerId: "offer",
    passRule: "Rule",
    configurationFamily: "family",
  });
  await pg.query(
    "insert into profile_configurations (id,user_id,digest,status,snapshot_json) values ('profile-row','a','digest','active',$1)",
    [snapshot],
  );
  await pg.query(
    "insert into product_configurations (id,user_id,digest,status,snapshot_json) values ('product-row','a','digest','active',$1)",
    [snapshot],
  );
  await pg.exec(`
    insert into knowledge_items (id,user_id,question_id,scope,question,proposed_answer,confirmed_answer,status,evidence,inference,recommendation,sort_order) values ('k','a','q','company','Question','Proposed','Confirmed','confirmed','Evidence','Inference','Recommendation',1);
    insert into market_proposals (id,user_id,title,problem_match,customer_type,examples,likely_buyer,risks,product_fit,evidence,decision,decision_reason,decided_at) values ('proposal','a','Title','Problem','Customer','Examples','Buyer','Risks','Fit','Evidence','explore','Reason',now());
    insert into prospecting_runs (id,user_id,configuration_digest,trigger,status,candidate_count,qualified_count,terminal_reason,finished_at) values ('run','a','digest','manual','succeeded',5,1,'Complete',now());
    update prospects set run_id = 'run', origin = 'run', fingerprint = 'fingerprint', last_reason = 'approved history' where id = 'p';
    insert into review_commands (id,user_id,command_key,operation_digest,prospect_id,decision,reason) values ('review','a','key','digest','p','approve','Review reason');
    insert into signals (id,user_id,run_id,prospect_id,url,title,excerpt,tier,content_hash,publication_date,recency) values ('signal','a','run','p','https://example.com','Source','Excerpt',1,'hash','2026-01-01','recent');
    insert into discovery_runs (id,user_id,configuration_digest,trigger,status,proposal_count,terminal_reason,finished_at) values ('discovery','a','digest','manual','succeeded',1,'Complete',now());
    insert into draft_plays (id,user_id,proposal_id,title,status,notes,audience,likely_buyer,offer,confirmed_at) values ('draft','a','proposal','Draft','confirmed','Notes','Audience','Buyer','Offer',now());
    insert into delivery_events (id,user_id,message_id,kind,note) values ('delivery','a','m','reply','History');
    insert into identity_merges (id,user_id,keep_id,drop_id,reason) values ('merge','a','c','old-contact','Duplicate');
    insert into operating_state (user_id,monthly_budget_cents,spend_month,spend_used_cents) values ('a',5000,'2026-10',321);
    update outreach_messages set lease_token = 'excluded-active-lease', lease_until = now() + interval '1 hour' where id = 'm';
    insert into operator_secrets(user_id,name,value) values ('a','api_key','excluded-secret'),('a','schedule_enabled','1');
    insert into enrichment_grants(id,user_id,prospect_id,status,reason) values ('source-grant','a','p','active','excluded');
    insert into enrichment_grants(id,user_id,prospect_id,status,reason,provider,unit,cost_cents,expires_at,spent_at) values ('spent-grant','a','p','apollo','paid reveal','apollo','person',25,now() + interval '1 hour',now());
  `);
}

test("all tables round-trip into an empty database with explicit safety normalization", async () => {
  const source = await setup(),
    target = await setup();
  try {
    await fillHistory(source.pg);
    const original = await exportWorkspaceArchive("a", source.adapter);
    for (const [table, rows] of Object.entries(original.tables))
      assert.ok(rows.length > 0, `${table} fixture missing`);
    const text = JSON.stringify(original);
    assert.doesNotMatch(
      text,
      /excluded-secret|excluded-active-lease|source-grant|schedule_enabled|operator_secrets|expires_at/,
    );
    await restoreWorkspaceArchive("a", original, target.adapter);
    const restored = await exportWorkspaceArchive("a", target.adapter);
    // Archived approval timestamps and dispatch history remain; active approval,
    // acknowledgement, lease and future spend authority are intentionally reset.
    const expected = structuredClone(original);
    expected.tables.outreach_packages[0].status = "draft";
    expected.tables.outreach_messages[0].status = "blocked";
    expected.tables.outreach_messages[0].acknowledged = false;
    expected.tables.operating_state[0].monthly_budget_cents = 0;
    const audit = restored.tables.delivery_events.filter((e) =>
      String(e.kind).startsWith("archive_restore_"),
    );
    assert.equal(audit.length, 2);
    assert.deepEqual(
      JSON.parse(audit.find((e) => e.kind === "archive_restore_package")!.note as string),
      { status: "approved" },
    );
    assert.deepEqual(
      JSON.parse(audit.find((e) => e.kind === "archive_restore_message")!.note as string),
      { status: "approved", acknowledged: true },
    );
    assert.equal(audit.find((e) => e.kind === "archive_restore_package")!.message_id, "pack");
    assert.equal(audit.find((e) => e.kind === "archive_restore_message")!.message_id, "m");
    const comparison = structuredClone(restored);
    comparison.tables.delivery_events = comparison.tables.delivery_events.filter(
      (e) => !String(e.kind).startsWith("archive_restore_"),
    );
    rehash(comparison);
    rehash(expected);
    assert.deepEqual(comparison, expected);
    const third = await setup();
    try {
      const invalidAudit = structuredClone(restored);
      invalidAudit.tables.delivery_events.find((e) => e.kind === "archive_restore_message")!.note =
        JSON.stringify({ status: "unknown", acknowledged: true });
      rehash(invalidAudit);
      await assert.rejects(restoreWorkspaceArchive("a", invalidAudit, third.adapter), /history/);
      await restoreWorkspaceArchive("a", restored, third.adapter);
      assert.deepEqual(await exportWorkspaceArchive("a", third.adapter), restored);
    } finally {
      await third.pg.close();
    }
    assert.deepEqual(
      (await target.pg.query("select lease_token, lease_until from outreach_messages where id='m'"))
        .rows,
      [{ lease_token: null, lease_until: null }],
    );
    assert.equal((await target.pg.query("select * from operator_secrets")).rows.length, 0);
    assert.deepEqual(
      (await target.pg.query("select id, status, expires_at from enrichment_grants")).rows,
      [{ id: "spent-grant", status: "apollo", expires_at: null }],
    );
  } finally {
    await source.pg.close();
    await target.pg.close();
  }
});

test("invalid fields, JSON, enum values and schema are rejected before mutation", async () => {
  const { pg, adapter } = await setup();
  try {
    await fillHistory(pg);
    const original = await exportWorkspaceArchive("a", adapter);
    const before = await exportWorkspaceArchive("b", adapter);
    const variants: ((a: WorkspaceArchive) => void)[] = [
      (a) => {
        a.tables.prospects[0].unexpected = "field";
      },
      (a) => {
        a.tables.workspaces[0].company_name = "embedded\u0000nul";
      },
      (a) => {
        a.tables.workspaces[0].company_name = "lone\ud800surrogate";
      },
      (a) => {
        a.tables.workspaces[0].seeded_at = "1";
      },
      (a) => {
        a.tables.workspaces[0].seeded_at = "0000-01-01T00:00:00.000Z";
      },
      (a) => {
        a.sourceOwner = "owner\u0000bad";
      },
      (a) => {
        a.tables.workspaces[0].secret = "secret";
      },
      (a) => {
        (a.tables as unknown as Record<string, unknown>).operator_secrets = [];
      },
      (a) => {
        a.tables.enrichment_grants[0].spent_at = null;
      },
      (a) => {
        a.tables.enrichment_grants[0].status = "active";
      },
      (a) => {
        a.tables.enrichment_grants[0].expires_at = "2026-01-01T00:00:00.000Z";
      },
      (a) => {
        a.tables.prospects[0].assessment_json = "null";
      },
      (a) => {
        a.tables.prospects[0].assessment_json =
          '{"passRule":"r","hardDisqualifier":null,"dimensions":[{}]}';
      },
      (a) => {
        a.tables.profile_configurations[0].snapshot_json = "[]";
      },
      (a) => {
        a.tables.prospects[0].state = "made-up";
      },
      (a) => {
        a.tables.outreach_packages[0].status = "made-up";
      },
      (a) => {
        a.tables.outreach_messages[0].prospect_id = "missing";
      },
    ];
    for (const modify of variants) {
      const invalid = structuredClone(original);
      modify(invalid);
      rehash(invalid);
      let started = false;
      await assert.rejects(
        restoreWorkspaceArchive("b", invalid, adapter, {
          afterDelete: () => {
            started = true;
          },
        }),
      );
      assert.equal(started, false);
      assert.deepEqual(await exportWorkspaceArchive("b", adapter), before);
    }
    await pg.exec("alter table workspaces add column unexpected text");
    await assert.rejects(restoreWorkspaceArchive("b", original, adapter), /schema/);
    await pg.exec("alter table workspaces drop column unexpected");
    await pg.exec("create table future_workspace_records (user_id text, payload text)");
    await assert.rejects(restoreWorkspaceArchive("b", original, adapter), /schema table/);
    await pg.exec("drop table future_workspace_records");
    assert.deepEqual(await exportWorkspaceArchive("b", adapter), before);
  } finally {
    await pg.close();
  }
});

test("same-owner forged identity cannot replace another owner's row", async () => {
  const { pg, adapter } = await setup();
  try {
    await fixture(pg);
    await pg.exec(
      "insert into prospects(id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) select 'other-id','b',account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date from prospects where id='p'",
    );
    const beforeA = await exportWorkspaceArchive("a", adapter),
      beforeB = await exportWorkspaceArchive("b", adapter);
    const forged = structuredClone(beforeA);
    forged.tables.prospects[0].id = "other-id";
    for (const table of ["contacts", "outreach_packages", "outreach_messages"] as const)
      for (const row of forged.tables[table]) row.prospect_id = "other-id";
    rehash(forged);
    let deleted = false;
    await assert.rejects(
      restoreWorkspaceArchive("a", forged, adapter, {
        afterDelete: () => {
          deleted = true;
        },
      }),
      /another workspace/,
    );
    assert.equal(deleted, false);
    assert.deepEqual(await exportWorkspaceArchive("a", adapter), beforeA);
    assert.deepEqual(await exportWorkspaceArchive("b", adapter), beforeB);
  } finally {
    await pg.close();
  }
});

test("interruptions at each transactional boundary roll back", async () => {
  const { pg, adapter } = await setup();
  try {
    await fillHistory(pg);
    const original = await exportWorkspaceArchive("a", adapter),
      before = await exportWorkspaceArchive("b", adapter);
    for (const boundary of ["before", "deleted", "first", "last"] as const) {
      const controller = new AbortController();
      if (boundary === "before") controller.abort();
      await assert.rejects(
        restoreWorkspaceArchive("b", original, adapter, {
          signal: controller.signal,
          afterDelete: () => {
            if (boundary === "deleted") controller.abort();
          },
          afterTable: (table) => {
            if (
              (boundary === "first" && table === "workspaces") ||
              (boundary === "last" && table === "operating_state")
            )
              controller.abort();
          },
        }),
        /aborted/,
      );
      assert.deepEqual(await exportWorkspaceArchive("b", adapter), before);
      assert.equal(
        (
          await pg.query<{ value: string }>(
            "select value from operator_secrets where user_id='b' and name='schedule_enabled'",
          )
        ).rows[0].value,
        "1",
      );
      assert.equal(
        (await pg.query("select id from enrichment_grants where user_id='b'")).rows.length,
        1,
      );
    }
  } finally {
    await pg.close();
  }
});

test("merge cycles remain valid historical events and remap consistently", async () => {
  const { pg, adapter } = await setup();
  try {
    await fixture(pg);
    await pg.exec(
      "insert into identity_merges(id,user_id,keep_id,drop_id,reason) values ('m1','a','old-b','old-a','first'),('m2','a','old-a','old-b','rediscovered')",
    );
    const original = await exportWorkspaceArchive("a", adapter);
    await restoreWorkspaceArchive("b", original, adapter);
    const restored = await exportWorkspaceArchive("b", adapter);
    const merges = restored.tables.identity_merges;
    assert.equal(merges.length, 2);
    assert.equal(merges[0].keep_id, merges[1].drop_id);
    assert.equal(merges[0].drop_id, merges[1].keep_id);
    assert.notEqual(merges[0].keep_id, "old-a");
  } finally {
    await pg.close();
  }
});

test("all-table cross-owner restore keeps data and remaps every relational reference", async () => {
  const source = await setup(),
    target = await setup();
  try {
    await fillHistory(source.pg);
    const archive = await exportWorkspaceArchive("a", source.adapter);
    await restoreWorkspaceArchive("b", archive, target.adapter);
    const restored = await exportWorkspaceArchive("b", target.adapter);
    const refs: Record<string, string[]> = {
      prospects: ["assessment_id", "run_id"],
      review_commands: ["prospect_id"],
      contacts: ["prospect_id"],
      signals: ["run_id", "prospect_id"],
      draft_plays: ["proposal_id"],
      outreach_packages: ["prospect_id"],
      outreach_messages: ["package_id", "prospect_id", "contact_id"],
      delivery_events: ["message_id"],
      identity_merges: ["keep_id", "drop_id"],
      enrichment_grants: ["prospect_id"],
    };
    for (const [table, sourceRows] of Object.entries(archive.tables)) {
      const allTargetRows = restored.tables[table as keyof WorkspaceArchive["tables"]];
      const targetRows =
        table === "delivery_events"
          ? allTargetRows.filter((e) => !String(e.kind).startsWith("archive_restore_"))
          : allTargetRows;
      assert.equal(targetRows.length, sourceRows.length, table);
      for (let i = 0; i < sourceRows.length; i++) {
        const expected = { ...sourceRows[i] },
          actual = { ...targetRows[i] };
        for (const field of ["id", ...(refs[table] ?? [])]) {
          delete expected[field];
          delete actual[field];
        }
        if (table === "outreach_packages") expected.status = "draft";
        if (table === "outreach_messages") {
          expected.status = "blocked";
          expected.acknowledged = false;
        }
        if (table === "operating_state") expected.monthly_budget_cents = 0;
        assert.deepEqual(actual, expected, table);
      }
    }
    const t = restored.tables;
    assert.equal(t.prospects[0].run_id, t.prospecting_runs[0].id);
    assert.equal(t.review_commands[0].prospect_id, t.prospects[0].id);
    assert.equal(t.enrichment_grants[0].prospect_id, t.prospects[0].id);
    assert.equal(t.contacts[0].prospect_id, t.prospects[0].id);
    assert.equal(t.signals[0].prospect_id, t.prospects[0].id);
    assert.equal(t.signals[0].run_id, t.prospecting_runs[0].id);
    assert.equal(t.draft_plays[0].proposal_id, t.market_proposals[0].id);
    assert.equal(t.outreach_packages[0].prospect_id, t.prospects[0].id);
    assert.equal(t.outreach_messages[0].prospect_id, t.prospects[0].id);
    assert.equal(t.outreach_messages[0].package_id, t.outreach_packages[0].id);
    assert.equal(t.outreach_messages[0].contact_id, t.contacts[0].id);
    assert.equal(
      t.delivery_events.find((e) => e.kind === "reply")!.message_id,
      t.outreach_messages[0].id,
    );
    assert.equal(
      t.delivery_events.find((e) => e.kind === "archive_restore_message")!.message_id,
      t.outreach_messages[0].id,
    );
    assert.equal(
      t.delivery_events.find((e) => e.kind === "archive_restore_package")!.message_id,
      t.outreach_packages[0].id,
    );
    assert.equal(t.identity_merges[0].keep_id, t.contacts[0].id);
    assert.notEqual(t.identity_merges[0].drop_id, "old-contact");
    assert.equal(
      t.knowledge_items[0].id,
      createHash("sha256").update("prospector:b:q").digest("hex").slice(0, 24),
    );
  } finally {
    await source.pg.close();
    await target.pg.close();
  }
});

test("overlapping restores serialize and leave a complete single archive", async () => {
  const { pg, adapter } = await setup();
  try {
    await fillHistory(pg);
    const first = await exportWorkspaceArchive("a", adapter);
    const second = structuredClone(first);
    first.tables.workspaces[0].company_name = "First workspace";
    first.tables.prospects[0].account_name = "First account";
    second.tables.workspaces[0].company_name = "Second workspace";
    second.tables.prospects[0].account_name = "Second account";
    rehash(first);
    rehash(second);
    let entered!: () => void;
    let release!: () => void;
    const transactionEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const continueFirst = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pendingFirst = restoreWorkspaceArchive("b", first, adapter, {
      afterTable: async (table) => {
        if (table === "workspaces") {
          entered();
          await continueFirst;
        }
      },
    });
    await transactionEntered;
    const pendingSecond = restoreWorkspaceArchive("b", second, adapter);
    release();
    await Promise.all([pendingFirst, pendingSecond]);
    const restored = await exportWorkspaceArchive("b", adapter);
    const pair = [
      restored.tables.workspaces[0].company_name,
      restored.tables.prospects[0].account_name,
    ];
    assert.ok(
      (pair[0] === "First workspace" && pair[1] === "First account") ||
        (pair[0] === "Second workspace" && pair[1] === "Second account"),
      "concurrent restores mixed two snapshots",
    );
    assert.equal(restored.tables.contacts[0].prospect_id, restored.tables.prospects[0].id);
    assert.equal(restored.tables.enrichment_grants[0].prospect_id, restored.tables.prospects[0].id);
    assert.equal(
      restored.tables.outreach_messages[0].package_id,
      restored.tables.outreach_packages[0].id,
    );
    assert.equal(restored.tables.outreach_messages[0].status, "blocked");
    assert.equal(restored.tables.enrichment_grants.length, 1);
    assert.equal(
      restored.tables.delivery_events.filter((e) => e.kind === "archive_restore_message").length,
      1,
    );
  } finally {
    await pg.close();
  }
});

test("sent and handed-to-Gmail classifications survive as historical audit records", async () => {
  const { pg, adapter } = await setup();
  try {
    await fixture(pg);
    for (const status of ["sent", "handed_to_gmail"] as const) {
      await pg.query("update outreach_messages set status=$1, acknowledged=true where id='m'", [
        status,
      ]);
      const original = await exportWorkspaceArchive("a", adapter);
      await restoreWorkspaceArchive("b", original, adapter);
      const restored = await exportWorkspaceArchive("b", adapter);
      const event = restored.tables.delivery_events.find(
        (row) => row.kind === "archive_restore_message",
      );
      assert.ok(event);
      assert.deepEqual(JSON.parse(event.note as string), { status, acknowledged: true });
      assert.equal(restored.tables.outreach_messages[0].status, status);
    }
  } finally {
    await pg.close();
  }
});

test("invalid owner and PostgreSQL-incompatible text fail before deletion", async () => {
  const { pg, adapter } = await setup();
  try {
    await fillHistory(pg);
    const original = await exportWorkspaceArchive("a", adapter);
    const before = await exportWorkspaceArchive("b", adapter);
    let deleted = false;
    await assert.rejects(
      restoreWorkspaceArchive("b\u0000bad", original, adapter, {
        afterDelete: () => {
          deleted = true;
        },
      }),
      /owner/,
    );
    for (const invalidText of ["nul\u0000text", "high\ud800surrogate", "low\udc00surrogate"]) {
      const invalid = structuredClone(original);
      invalid.tables.workspaces[0].company_name = invalidText;
      rehash(invalid);
      await assert.rejects(
        restoreWorkspaceArchive("b", invalid, adapter, {
          afterDelete: () => {
            deleted = true;
          },
        }),
        /Invalid/,
      );
    }
    const invalidDate = structuredClone(original);
    invalidDate.tables.workspaces[0].seeded_at = "1";
    rehash(invalidDate);
    await assert.rejects(
      restoreWorkspaceArchive("b", invalidDate, adapter, {
        afterDelete: () => {
          deleted = true;
        },
      }),
      /Invalid/,
    );
    assert.equal(deleted, false);
    assert.deepEqual(await exportWorkspaceArchive("b", adapter), before);
  } finally {
    await pg.close();
  }
});
