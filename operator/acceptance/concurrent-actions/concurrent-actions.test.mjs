import { attempts } from "./socket-fence.mjs";
import assert from "node:assert/strict";
import { test, beforeEach, afterEach, after } from "node:test";
import {
  handlers,
  sql,
  message,
  effects,
  reset,
  close,
  seedEligible,
} from "../handler-harness.mjs";

beforeEach(async () => {
  await reset();
  await seedEligible();
});
after(close);
afterEach(async () => {
  assert.deepEqual(effects, [], "zero provider/fetch invocations");
  assert.deepEqual(attempts, [], "zero calls to fenced socket APIs");
  const [row] =
    await sql`select count(*)::int n from outreach_messages where dispatched_at is not null or gmail_url is not null or lease_token is not null or lease_until is not null`;
  assert.equal(row.n, 0, "zero delivery timestamps, stored URLs or live leases");
  assert.equal(
    (await sql`select coalesce(sum(spend_used_cents), 0)::int n from operating_state`)[0].n,
    0,
  );
  assert.equal(
    (
      await sql`select count(*)::int n from enrichment_grants where spent_at is not null or cost_cents <> 0`
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql`select count(*)::int n from delivery_events where kind not in ('manual_handoff', 'archive_restore_package', 'archive_restore_message')`
    )[0].n,
    0,
  );
});
const handoff = (digest = message.digest) =>
  handlers.openInGmail({ data: { messageId: message.id, expectedDigest: digest } });
const approve = (digest = message.digest) =>
  handlers.approveMessage({
    data: { messageId: message.id, expectedDigest: digest, acknowledged: true },
  });
const events = async () =>
  (await sql`select count(*)::int n from delivery_events where kind = 'manual_handoff'`)[0].n;
const refusal = /changed|eligible|approv|handed|terminal|history|restore|erase/i;

// Pause real queries after their read completes, before the real CAS write.
// No replacement rows or production admission bypass is added by this gate.
async function atSnapshots(count, action, mutation) {
  const original = sql.query;
  let reached = 0,
    release,
    ready;
  const released = new Promise((r) => {
    release = r;
  });
  const arrived = new Promise((r) => {
    ready = r;
  });
  sql.query = async (text, params) => {
    const rows = await original(text, params);
    if (text.startsWith("select ") && text.includes("m.digest, m.status")) {
      if (++reached === count) ready();
      await released;
    }
    return rows;
  };
  const pending = Promise.allSettled(Array.from({ length: count }, action));
  try {
    await Promise.race([
      arrived,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(Error("snapshot barrier timeout")), 5000);
        timer.unref();
        arrived.then(() => clearTimeout(timer));
      }),
    ]);
    if (mutation) await mutation();
  } finally {
    release();
    await pending;
    sql.query = original;
  }
  return pending;
}

test("duplicate handoff returns one URL and one unconfirmed event", async () => {
  assert.ok((await handoff()).url);
  assert.equal((await handoff()).url, null);
  assert.equal(await events(), 1);
});
test("two simultaneous handler requests both read approved; exactly one CAS wins", async () => {
  const results = await atSnapshots(2, () => handoff());
  assert.ok(results.every((r) => r.status === "fulfilled"));
  assert.equal(results.filter((r) => r.value.url).length, 1);
  assert.equal(await events(), 1);
  assert.equal((await sql`select status from outreach_messages`)[0].status, "handed_off");
});
test("stale approval and handoff digest cannot create history", async () => {
  await assert.rejects(approve("stale"), refusal);
  await assert.rejects(handoff("stale"), refusal);
  assert.equal(await events(), 0);
});
for (const [label, mutate] of [
  ["message body", () => sql`update outreach_messages set body = 'Fictional changed message'`],
  ["contact email", () => sql`update contacts set email_display = 'changed@quarry.example'`],
  ["package body", () => sql`update outreach_packages set body = 'Fictional changed package'`],
  [
    "package approval revision",
    () => sql`update outreach_packages set approved_at = approved_at + interval '1 second'`,
  ],
]) {
  test(`${label} changed after approval rejects stale tab`, async () => {
    await mutate();
    await assert.rejects(approve(), refusal);
    await assert.rejects(handoff(), refusal);
    assert.equal(await events(), 0);
  });
  test(`${label} changed between snapshot and handoff CAS elects no winner`, async () => {
    const results = await atSnapshots(1, () => handoff(), mutate);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[0].value.url, null);
    assert.equal(await events(), 0);
  });
}
for (const [kind, value] of [
  ["email", " PERSON@QUARRY.EXAMPLE "],
  ["domain", " QUARRY.EXAMPLE "],
  ["contact", "c"],
  ["org", " FICTIONAL QUARRY "],
  ["all", "*"],
  ["phone", "+1 (202) 555-0100"],
]) {
  test(`${kind} suppression committed in second handler before CAS blocks handoff and export`, async () => {
    await sql`update contacts set phone_display = '12025550100'`;
    const results = await atSnapshots(
      1,
      () => handoff(),
      () =>
        handlers.addSuppression({
          data: { kind, value, reason: "Fictional stop from second tab" },
        }),
    );
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[0].value.url, null);
    const { csv } = await handlers.exportCrmCsv();
    assert.ok(!csv.includes("person@quarry.example"));
    assert.equal(await events(), 0);
    assert.equal((await sql`select count(*)::int n from suppressions`)[0].n, 1);
  });
}
test("lost handler response then workspace reload cannot replay a compose URL", async () => {
  // Discard the result as a client losing the response would; no HTTP abort claimed.
  await handoff();
  const workspace = await handlers.getWorkspace();
  assert.ok(workspace);
  assert.equal((await handoff()).url, null);
  await assert.rejects(approve(), refusal);
  assert.equal(await events(), 1);
});
test("current archive restored into empty DB preserves terminal replay refusal", async () => {
  await handoff();
  const archive = await handlers.exportArchive();
  const { id, digest } = message;
  await reset();
  await handlers.restoreArchive({ data: { json: archive.json } });
  await assert.rejects(
    handlers.openInGmail({ data: { messageId: id, expectedDigest: digest } }),
    refusal,
  );
  const [row] = await sql`select package_id, contact_id from outreach_messages where id = ${id}`;
  const [pack] = await sql`select id,digest from outreach_packages where id = ${row.package_id}`;
  await handlers.approvePackage({ data: { packageId: pack.id, expectedDigest: pack.digest } });
  await assert.rejects(
    handlers.prepareMessage({ data: { packageId: row.package_id, contactId: row.contact_id } }),
    refusal,
  );
  assert.equal(await events(), 1);
});
test("pre-handoff archive cannot erase terminal history and rearm stale tab", async () => {
  const archive = await handlers.exportArchive();
  await handoff();
  await assert.rejects(handlers.restoreArchive({ data: { json: archive.json } }), refusal);
  assert.equal((await handoff()).url, null);
  assert.equal(await events(), 1);
});

test("suppression between approval snapshot and approval write refuses stale approval", async () => {
  await sql`update outreach_messages set status = 'draft', acknowledged = false, approved_at = null`;
  const results = await atSnapshots(
    1,
    () => approve(),
    () =>
      handlers.addSuppression({
        data: { kind: "contact", value: "c", reason: "Fictional concurrent stop" },
      }),
  );
  assert.equal(results[0].status, "rejected");
  assert.match(results[0].reason.message, refusal);
  assert.equal((await sql`select status from outreach_messages`)[0].status, "draft");
  assert.equal(await events(), 0);
});
