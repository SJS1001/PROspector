import assert from 'node:assert/strict';
import { test, beforeEach, after, afterEach } from 'node:test';
import { handlers, sql, message, effects, fixtureSecrets, reset, close, seedEligible } from './handler-harness.mjs';

beforeEach(reset);
after(close);
afterEach(() => assert.deepEqual(effects, [], 'no provider stub may be invoked'));
const handoff = (data = {}, userId) => handlers.openInGmail({ userId, data: { messageId: message.id, expectedDigest: message.digest, ...data } });

test('foreign workspace cannot approve or hand off the owner message', async () => {
  await seedEligible();
  await assert.rejects(handoff({}, 'fictional-other'), /workspace/);
  await assert.rejects(handlers.approveMessage({ userId: 'fictional-other', data: { messageId: message.id, acknowledged: true } }), /workspace/);
  assert.equal((await sql`select status from outreach_messages where id = ${message.id}`)[0].status, 'approved');
});
test('stale digest is rejected before handoff', async () => {
  await seedEligible();
  await assert.rejects(handoff({ expectedDigest: 'stale' }), /changed|digest|approval/i);
});
test('eligible exact approved message creates compose handoff, never delivery evidence', async () => {
  await seedEligible();
  await handoff();
  const [row] = await sql`select status, gmail_url, blocked_reason from outreach_messages where id = ${message.id}`;
  assert.equal(row.status, 'handed_to_gmail');
  const url = new URL(row.gmail_url);
  assert.equal(url.origin, 'https://mail.google.com');
  assert.equal(url.searchParams.get('to'), 'person@quarry.example');
  assert.equal(url.searchParams.get('su'), message.subject);
  assert.equal(url.searchParams.get('body'), message.body);
  assert.match(row.blocked_reason, /not confirmed|unconfirmed/i);
});
test('configured fictional SMTP credentials cannot cause provider invocation', async () => {
  await seedEligible();
  fixtureSecrets.set('gmail_user', 'owner@example.invalid');
  fixtureSecrets.set('gmail_pass', 'FICTIONAL-TEST-NOT-A-CREDENTIAL');
  await handoff();
  assert.equal((await sql`select status from outreach_messages where id = ${message.id}`)[0].status, 'handed_to_gmail');
});
for (const [kind, value] of [['email', 'person@quarry.example'], ['domain', 'quarry.example'], ['all', '*'], ['contact', 'c'], ['org', 'fictional quarry']]) {
  test(`${kind} suppression rejects handoff`, async () => {
    await seedEligible();
    await sql`insert into suppressions (id,user_id,kind,value,reason) values ('s','fictional-owner',${kind},${value},'Fictional stop')`;
    await assert.rejects(handoff(), /suppres|blocked|eligible/i);
    assert.equal((await sql`select gmail_url from outreach_messages where id = ${message.id}`)[0].gmail_url, null);
  });
}
test('sent message cannot be handed off again', async () => {
  await seedEligible();
  await sql`update outreach_messages set status = 'sent' where id = ${message.id}`;
  await assert.rejects(handoff(), /sent|already|approve|status/i);
});
test('CSV quotes fields and neutralizes spreadsheet formulas', async () => {
  await seedEligible();
  await sql`update contacts set full_name = '=1+1', role = 'Fictional, "operator"' where id = 'c'`;
  const { csv } = await handlers.exportCrmCsv();
  assert.ok(csv.includes('"Fictional, ""operator"""'));
  assert.ok(csv.includes("'=1+1"), 'formula-leading text must be neutralized');
});
test('CSV excludes a currently suppressed recipient', async () => {
  await seedEligible();
  await sql`insert into suppressions (id,user_id,kind,value,reason) values ('s','fictional-owner','email','person@quarry.example','Fictional stop')`;
  const { csv } = await handlers.exportCrmCsv();
  assert.ok(!csv.includes('person@quarry.example'));
});
test('archive rejects corrupt integrity without changing knowledge', async () => {
  const before = await sql`select id,status,confirmed_answer from knowledge_items order by id`;
  const archive = JSON.parse((await handlers.exportArchive()).json);
  archive.digest = 'corrupt';
  if (archive.knowledge?.length) archive.knowledge[0].confirmedAnswer = 'CORRUPT FICTIONAL VALUE';
  await assert.rejects(handlers.restoreArchive({ data: { json: JSON.stringify(archive) } }));
  assert.deepEqual(await sql`select id,status,confirmed_answer from knowledge_items order by id`, before);
});
test('archive preserves semantic records and suppression into empty database with authority disabled', async () => {
  await seedEligible();
  await sql`insert into suppressions (id,user_id,kind,value,reason) values ('s','fictional-owner','domain','blocked.example','Fictional stop')`;
  const snapshot = async () => ({
    contacts: await sql`select full_name,role,email_display,source from contacts order by email_display`,
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
  assert.equal((await sql`select count(*)::int as n from outreach_messages where status = 'approved' or lease_token is not null or lease_until is not null`)[0].n, 0);
  assert.equal((await sql`select count(*)::int as n from enrichment_grants where status in ('approved','active')`)[0].n, 0);
  assert.equal((await sql`select count(*)::int as n from operator_secrets where name = 'schedule_enabled' and value = '1'`)[0].n, 0);
});
