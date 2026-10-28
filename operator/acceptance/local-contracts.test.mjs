import assert from "node:assert/strict";
import { test, beforeEach, after, afterEach } from "node:test";
import {
  handlers,
  sql,
  message,
  effects,
  fixtureSecrets,
  reset,
  close,
  seedEligible,
} from "./handler-harness.mjs";

beforeEach(reset);
after(close);
afterEach(() => assert.deepEqual(effects, [], "no provider stub may be invoked"));
const handoff = (data = {}, userId) =>
  handlers.openInGmail({
    userId,
    data: { messageId: message.id, expectedDigest: message.digest, ...data },
  });

test("foreign workspace cannot approve or hand off the owner message", async () => {
  await seedEligible();
  await assert.rejects(handoff({}, "fictional-other"), /workspace|eligible/i);
  await assert.rejects(
    handlers.approveMessage({
      userId: "fictional-other",
      data: { messageId: message.id, expectedDigest: message.digest, acknowledged: true },
    }),
    /workspace|eligible/i,
  );
  assert.equal(
    (await sql`select status from outreach_messages where id = ${message.id}`)[0].status,
    "approved",
  );
});
test("stale digest is rejected before handoff", async () => {
  await seedEligible();
  await assert.rejects(handoff({ expectedDigest: "stale" }), /changed|digest|approval/i);
});
test("eligible exact approved message creates compose handoff, never delivery evidence", async () => {
  await seedEligible();
  const result = await handoff();
  const [row] =
    await sql`select status, gmail_url, blocked_reason, dispatched_at from outreach_messages where id = ${message.id}`;
  assert.equal(row.status, "handed_off");
  assert.equal(row.gmail_url, null, "compose URL must not be stored or replayed");
  const url = new URL(result.url);
  assert.equal(url.origin, "https://mail.google.com");
  assert.equal(url.searchParams.get("to"), "person@quarry.example");
  assert.equal(url.searchParams.get("su"), message.subject);
  assert.equal(url.searchParams.get("body"), message.body);
  assert.match(row.blocked_reason, /not confirmed|unconfirmed/i);
  assert.equal(row.dispatched_at, null);
  assert.equal(
    (
      await sql`select count(*)::int as n from delivery_events where message_id = ${message.id} and kind = 'manual_handoff'`
    )[0].n,
    1,
  );
});
test("configured fictional SMTP credentials cannot cause provider invocation", async () => {
  await seedEligible();
  fixtureSecrets.set("gmail_user", "owner@example.invalid");
  fixtureSecrets.set("gmail_pass", "FICTIONAL-TEST-NOT-A-CREDENTIAL");
  await handoff();
  assert.equal(
    (await sql`select status from outreach_messages where id = ${message.id}`)[0].status,
    "handed_off",
  );
});
for (const [kind, value] of [
  ["email", "person@quarry.example"],
  ["domain", "quarry.example"],
  ["all", "*"],
  ["contact", "c"],
  ["org", "fictional quarry"],
]) {
  test(`${kind} suppression rejects handoff`, async () => {
    await seedEligible();
    await sql`insert into suppressions (id,user_id,kind,value,reason) values ('s','fictional-owner',${kind},${value},'Fictional stop')`;
    await assert.rejects(handoff(), /suppres|blocked|eligible/i);
    assert.equal(
      (await sql`select gmail_url from outreach_messages where id = ${message.id}`)[0].gmail_url,
      null,
    );
  });
}
test("sent message cannot be handed off again", async () => {
  await seedEligible();
  await sql`update outreach_messages set status = 'sent' where id = ${message.id}`;
  await assert.rejects(handoff(), /sent|already|approve|status/i);
});
test("CSV quotes fields and neutralizes spreadsheet formulas", async () => {
  await seedEligible();
  await sql`update contacts set full_name = '=1+1', role = 'Fictional, "operator"' where id = 'c'`;
  const { csv } = await handlers.exportCrmCsv();
  assert.ok(csv.includes('"Fictional, ""operator"""'));
  assert.ok(csv.includes("'=1+1"), "formula-leading text must be neutralized");
});
test("CSV excludes a currently suppressed recipient", async () => {
  await seedEligible();
  await sql`insert into suppressions (id,user_id,kind,value,reason) values ('s','fictional-owner','email','person@quarry.example','Fictional stop')`;
  const { csv } = await handlers.exportCrmCsv();
  assert.ok(!csv.includes("person@quarry.example"));
});
test("archive rejects corrupt integrity without changing knowledge", async () => {
  const before = await sql`select id,status,confirmed_answer from knowledge_items order by id`;
  const archive = JSON.parse((await handlers.exportArchive()).json);
  archive.checksum = "0".repeat(64);
  archive.tables.knowledge_items[0].confirmed_answer = "CORRUPT FICTIONAL VALUE";
  await assert.rejects(
    handlers.restoreArchive({ data: { json: JSON.stringify(archive) } }),
    /checksum/i,
  );
  assert.deepEqual(
    await sql`select id,status,confirmed_answer from knowledge_items order by id`,
    before,
  );
});
test("archive preserves semantic records and suppression into empty database with authority disabled", async () => {
  await seedEligible();
  await sql`insert into suppressions (id,user_id,kind,value,reason) values ('s','fictional-owner','domain','blocked.example','Fictional stop')`;
  const snapshot = async () => ({
    contacts:
      await sql`select full_name,role,email_display,source from contacts order by email_display`,
    messages: await sql`select to_email,subject,body from outreach_messages order by to_email`,
    packages: await sql`select subject,body from outreach_packages order by subject`,
    suppressions: await sql`select kind,value,reason from suppressions order by kind,value`,
  });
  const before = await snapshot();
  const archive = await handlers.exportArchive();
  assert.deepEqual(effects, []);
  await reset();
  await handlers.restoreArchive({ data: { json: archive.json } });
  assert.deepEqual(await snapshot(), before);
  assert.equal(
    (
      await sql`select count(*)::int as n from outreach_messages where status = 'approved' or lease_token is not null or lease_until is not null`
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql`select count(*)::int as n from enrichment_grants where status in ('approved','active')`
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql`select count(*)::int as n from operator_secrets where name = 'schedule_enabled' and value = '1'`
    )[0].n,
    0,
  );
});

// Exercise the ordinary UI progression again; a terminal refusal at any stage
// is safe, but an unrelated adapter/SQL error must still fail the regression.
async function attemptRestoredHandoff(userId, prospectId, contactId) {
  try {
    await handlers.preparePackage({ userId, data: { prospectId } });
    const [pack] =
      await sql`select id,digest from outreach_packages where user_id = ${userId} and prospect_id = ${prospectId}`;
    assert.ok(pack);
    await handlers.approvePackage({
      userId,
      data: { packageId: pack.id, expectedDigest: pack.digest },
    });
    await handlers.prepareMessage({ userId, data: { packageId: pack.id, contactId } });
    const rows =
      await sql`select id,digest from outreach_messages where user_id = ${userId} and package_id = ${pack.id} and contact_id = ${contactId}`;
    assert.equal(rows.length, 1, "restore and prepare must not create a second message identity");
    const [draft] = rows;
    await handlers.approveMessage({
      userId,
      data: { messageId: draft.id, expectedDigest: draft.digest, acknowledged: true },
    });
    return (
      await handlers.openInGmail({
        userId,
        data: { messageId: draft.id, expectedDigest: draft.digest },
      })
    ).url;
  } catch (error) {
    if (
      error instanceof assert.AssertionError ||
      !(error instanceof Error) ||
      !/already|cannot|eligible|approv|changed|handed|restore|terminal|prior/i.test(error.message)
    )
      throw error;
    return null;
  }
}

test("restoring an earlier backup cannot erase a later compose handoff", async () => {
  await seedEligible();
  const backup = await handlers.exportArchive();
  assert.ok((await handoff()).url, "first exact approved handoff must succeed");
  const afterHandoff = JSON.parse((await handlers.exportArchive()).json);
  let refused = false;
  try {
    await handlers.restoreArchive({ data: { json: backup.json } });
  } catch (error) {
    assert.match(error.message, /terminal|handoff|handed|history|erase|older|restore/i);
    refused = true;
  }
  if (refused) {
    assert.deepEqual(
      JSON.parse((await handlers.exportArchive()).json),
      afterHandoff,
      "refusing an older archive must leave the complete current workspace unchanged",
    );
  }
  assert.equal(
    await attemptRestoredHandoff("fictional-owner", "p", "c"),
    null,
    "an earlier archive must not rearm an already handed-off message",
  );
  assert.equal(
    (
      await sql`select count(*)::int as n from delivery_events where user_id = 'fictional-owner' and kind = 'manual_handoff'`
    )[0].n,
    1,
    "the later handoff history must survive restoration of an earlier backup",
  );
});

test("legacy compose handoff without a dispatch timestamp remains terminal after restore", async () => {
  await seedEligible();
  await sql`update outreach_messages set status = 'handed_to_gmail', dispatched_at = null where id = ${message.id}`;
  const backup = await handlers.exportArchive();
  await reset();
  await handlers.restoreArchive({ data: { json: backup.json } });
  assert.equal(
    await attemptRestoredHandoff("fictional-owner", "p", "c"),
    null,
    "legacy compose evidence is terminal even without SMTP delivery evidence",
  );
  assert.equal(
    (
      await sql`select count(*)::int as n from outreach_messages where user_id = 'fictional-owner'`
    )[0].n,
    1,
  );
});

test("cross-owner restore retains the canonical terminal message identity", async () => {
  await seedEligible();
  assert.ok((await handoff()).url);
  const backup = await handlers.exportArchive();
  const userId = "fictional-restored-owner";
  await handlers.restoreArchive({ userId, data: { json: backup.json } });
  const [restored] =
    await sql`select id,package_id,prospect_id,contact_id from outreach_messages where user_id = ${userId}`;
  assert.ok(restored);
  const url = await attemptRestoredHandoff(userId, restored.prospect_id, restored.contact_id);
  assert.equal(url, null, "owner remapping must not permit another compose URL");
  const { createHash } = await import("node:crypto");
  const canonicalId = createHash("sha256")
    .update(`prospector:${userId}:msg:${restored.package_id}:${restored.contact_id}`)
    .digest("hex")
    .slice(0, 24);
  assert.equal(
    restored.id,
    canonicalId,
    "restore must use the same message identity as prepareMessage",
  );
  assert.equal(
    (
      await sql`select count(*)::int as n from outreach_messages where user_id = ${userId} and contact_id = ${restored.contact_id}`
    )[0].n,
    1,
  );
});


test("workspace projects real database timestamps as ISO strings after a completed run", async () => {
  await seedEligible();
  await sql`insert into prospecting_runs (id,user_id,configuration_digest,trigger,status,started_at,finished_at)
    values ('timestamp-run','fictional-owner','cfg','manual','succeeded','2026-10-28T03:30:00Z','2026-10-28T03:31:00Z')`;
  await sql`insert into discovery_runs (id,user_id,configuration_digest,trigger,status,started_at,finished_at)
    values ('timestamp-discovery','fictional-owner','cfg','manual','succeeded','2026-10-28T03:00:00Z',null)`;
  const [raw] = await sql`select started_at from prospecting_runs where id='timestamp-run'`;
  assert.ok(raw.started_at instanceof Date, "exercise the driver's actual Date result");
  const workspace = await handlers.getWorkspace();
  assert.equal(workspace.runs[0].startedAt, '2026-10-28T03:30:00.000Z');
  assert.equal(workspace.runs[0].finishedAt, '2026-10-28T03:31:00.000Z');
  assert.equal(workspace.discoveryRuns[0].startedAt, '2026-10-28T03:00:00.000Z');
  assert.equal(workspace.discoveryRuns[0].finishedAt, null);
  assert.equal(typeof workspace.packages[0].approvedAt, 'string');
  assert.equal(typeof workspace.messages[0].approvedAt, 'string');
});
