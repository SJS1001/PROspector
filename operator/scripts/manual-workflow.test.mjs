import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  prepareManualMessage,
  approveManualMessage,
  handoffManualMessage,
  manualCrmCsv,
  csvCell,
  packageDigest,
} from "../src/lib/server/manual-workflow.ts";
let pg;
const sql = { query: async (text, params) => (await pg.query(text, params)).rows };
before(async () => {
  pg = new PGlite();
  for (const n of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8"));
});
after(async () => pg?.close());
async function fixture() {
  await pg.exec(
    "truncate outreach_messages,outreach_packages,contacts,prospects,suppressions,delivery_events",
  );
  await sql.query(
    `insert into prospects(id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ('r','owner','Fictional Works','account','Target','target','offer',8,'Passed','approved','config','assessment','{}','Fictional evidence','https://fictional.example/evidence',1,'2026-10-28')`,
  );
  const subject = 'Fictional subject, "quoted"',
    body = "Fictional approved body\nLine two.";
  await sql.query(
    `insert into outreach_packages(id,user_id,prospect_id,status,subject,body,digest,approved_at) values ('p','owner','r','approved',$1,$2,$3,now())`,
    [subject, body, packageDigest(subject, body, "r")],
  );
  await sql.query(
    `insert into contacts(id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence,published_url,phone_display) values ('c','owner','r','=HYPERLINK("fictional")','champion','public_source','person@fictional.example','Published, "fictional"\nsource','medium','https://fictional.example/team','+1 416 555 0100')`,
  );
}
async function draft() {
  await prepareManualMessage(sql, "owner", "p", "c", "m");
  return (await sql.query("select digest from outreach_messages where id='m'"))[0].digest;
}
async function approved() {
  const d = await draft();
  await approveManualMessage(sql, "owner", "m", d);
  return d;
}
test("eligible exact approval hands off full content without recording sent", async () => {
  await fixture();
  const d = await approved();
  const u = new URL(await handoffManualMessage(sql, "owner", "m", d));
  assert.equal(u.origin, "https://mail.google.com");
  assert.equal(u.searchParams.get("to"), "person@fictional.example");
  assert.equal(u.searchParams.get("body"), "Fictional approved body\nLine two.");
  const [m] = await sql.query("select * from outreach_messages where id='m'");
  assert.equal(m.status, "handed_off");
  assert.equal(m.dispatched_at, null);
  assert.equal(m.gmail_url, null);
  assert.equal((await sql.query("select * from delivery_events")).length, 1);
});
test("eight concurrent tabs plus retries receive one URL and one event", async () => {
  await fixture();
  const d = await approved();
  const urls = await Promise.all(
    Array.from({ length: 8 }, () => handoffManualMessage(sql, "owner", "m", d)),
  );
  assert.equal(urls.filter(Boolean).length, 1);
  assert.equal(await handoffManualMessage(sql, "owner", "m", d), null);
  assert.equal((await sql.query("select * from delivery_events")).length, 1);
});
test("drafts, forged digests, foreign owners and arbitrary IDs are denied", async () => {
  await fixture();
  const d = await draft();
  for (const [o, id, h] of [
    ["owner", "m", d],
    ["other", "m", d],
    ["owner", "unknown", d],
    ["owner", "m", "forged"],
  ])
    await assert.rejects(handoffManualMessage(sql, o, id, h));
  await assert.rejects(approveManualMessage(sql, "owner", "m", "stale"));
  assert.equal((await sql.query("select * from delivery_events")).length, 0);
});
for (const [kind, value] of [
  ["email", "PERSON@FICTIONAL.EXAMPLE"],
  ["domain", "fictional.example"],
  ["contact", "c"],
  ["org", "Fictional Works"],
  ["phone", "14165550100"],
  ["all", "all"],
])
  test(`${kind} suppression after approval wins handoff and CSV`, async () => {
    await fixture();
    const d = await approved();
    await sql.query(
      "insert into suppressions(id,user_id,kind,value,reason) values ($1,$2,$3,$4,$5)",
      ["s", "owner", kind, value, "Fictional stop"],
    );
    await assert.rejects(handoffManualMessage(sql, "owner", "m", d));
    assert.equal((await manualCrmCsv(sql, "owner")).split("\r\n").length, 2);
    assert.equal((await sql.query("select * from delivery_events")).length, 0);
  });
for (const [name, change] of [
  ["contact mailbox", "update contacts set email_display='changed@fictional.example'"],
  ["contact ownership", "update contacts set user_id='other'"],
  ["prospect ownership", "update prospects set user_id='other'"],
  ["package ownership", "update outreach_packages set user_id='other'"],
  ["contact suggestion", "update contacts set email_kind='suggestion'"],
  ["unknown class", "update contacts set email_kind='guessed'"],
  ["unpublished contact", "update contacts set published_url=null"],
  ["prospect rejection", "update prospects set state='rejected'"],
  ["package revocation", "update outreach_packages set status='draft'"],
  [
    "package reapproval",
    "update outreach_packages set approved_at=approved_at+interval '1 second'",
  ],
  ["message edit", "update outreach_messages set body='Changed'"],
  ["package edit", "update outreach_packages set body='Changed'"],
  ["acknowledgement", "update outreach_messages set acknowledged=false"],
])
  test(`${name} invalidation prevents handoff`, async () => {
    await fixture();
    const d = await approved();
    await pg.exec(change);
    assert.equal(await handoffManualMessage(sql, "owner", "m", d).catch(() => null), null);
    assert.equal((await sql.query("select * from delivery_events")).length, 0);
  });
for (const state of ["handed_off", "handed_to_gmail", "sent"])
  test(`${state} cannot be redrafted or reapproved`, async () => {
    await fixture();
    const d = await approved();
    await sql.query("update outreach_messages set status=$1", [state]);
    await assert.rejects(draft());
    await assert.rejects(approveManualMessage(sql, "owner", "m", d));
    assert.equal(await handoffManualMessage(sql, "owner", "m", d).catch(() => null), null);
  });
test("suppression inserted between validation and CAS denies handoff", async () => {
  await fixture();
  const d = await approved();
  let changed = false;
  const raced = {
    query: async (t, p) => {
      const r = await sql.query(t, p);
      if (!changed && t.startsWith("select ")) {
        changed = true;
        await sql.query(
          "insert into suppressions values ('s','owner','all','all','Fictional stop',now())",
        );
      }
      return r;
    },
  };
  assert.equal(await handoffManualMessage(raced, "owner", "m", d), null);
  assert.equal((await sql.query("select * from delivery_events")).length, 0);
});
test("CSV is deterministic, escaped, formula-safe, owner-scoped and package-gated", async () => {
  await fixture();
  const csv = await manualCrmCsv(sql, "owner");
  assert.match(csv, /"'=HYPERLINK\(""fictional""\)"/);
  assert.match(csv, /"'\+1 416 555 0100"/);
  assert.match(csv, /"Published, ""fictional""\nsource"/);
  assert.equal(await manualCrmCsv(sql, "owner"), csv);
  assert.equal((await manualCrmCsv(sql, "other")).split("\r\n").length, 2);
  await pg.exec("update outreach_packages set status='draft'");
  assert.equal((await manualCrmCsv(sql, "owner")).split("\r\n").length, 2);
  for (const v of ["=1", "+1", "-1", "@SUM(A1)", " \t=1", "\r=1", "\ntext"])
    assert.ok(csvCell(v).startsWith("\"'"));
});
for (const action of ["approve", "handoff"])
  test(`contact transplant after validation cannot ${action}`, async () => {
    await fixture();
    const d = await approved();
    await sql.query(
      `insert into contacts select 'replacement', user_id, prospect_id, full_name, role, email_kind, email_display, source, confidence, published_url, phone_display, provider_id from contacts where id='c'`,
    );
    let changed = false;
    const raced = {
      query: async (t, p) => {
        const result = await sql.query(t, p);
        if (!changed && t.startsWith("select ")) {
          changed = true;
          await pg.exec("update outreach_messages set contact_id='replacement'");
          await sql.query(
            "insert into suppressions values ('s','owner','contact','c','Fictional stop',now())",
          );
        }
        return result;
      },
    };
    if (action === "approve") await assert.rejects(approveManualMessage(raced, "owner", "m", d));
    else assert.equal(await handoffManualMessage(raced, "owner", "m", d), null);
    assert.equal((await sql.query("select * from delivery_events")).length, 0);
  });
test("restart of durable fictional state does not re-arm a handoff", async () => {
  const dir = mkdtempSync(join(tmpdir(), "prospector-manual-test-"));
  await pg.close();
  pg = await PGlite.create(dir);
  for (const n of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8"));
  await fixture();
  const d = await approved();
  await handoffManualMessage(sql, "owner", "m", d);
  await pg.close();
  pg = await PGlite.create(dir);
  try {
    assert.equal(await handoffManualMessage(sql, "owner", "m", d), null);
    await assert.rejects(draft());
  } finally {
    await pg.close();
    rmSync(dir, { recursive: true, force: true });
    pg = null;
  }
});
