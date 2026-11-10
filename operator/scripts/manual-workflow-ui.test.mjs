import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('morning run is explicit and marked manual', () => {
  const shell = read('components/shell.tsx');
  const brief = read('components/brief-view.tsx');
  const workspace = read('lib/workspace.ts');
  assert.doesNotMatch(shell, /useTickSchedule|tickSchedule/);
  assert.match(brief, /onClick=\{\(\) => morning\.mutate\(\)\}/);
  assert.match(workspace, /tickSchedule\(\{ data: \{ manual: true \} \}\)/);
});

test('Gmail handoff uses only the response URL and cannot replay from stored messages', () => {
  const outreach = read('components/outreach-view.tsx');
  assert.match(outreach, /window\.open\("about:blank", "_blank"\)/);
  assert.match(outreach, /if \(!popup\) \{[\s\S]*?return;[\s\S]*?open\.mutate/);
  assert.match(outreach, /popup\.opener = null/);
  assert.match(outreach, /destination\.origin !== "https:\/\/mail\.google\.com"/);
  assert.match(outreach, /popup\.location\.replace\(destination\.href\)/);
  assert.match(outreach, /onError: \(\) => popup\.close\(\)/);
  assert.doesNotMatch(outreach, /gmailUrl|Continue in Gmail/);
  assert.match(outreach, /item\.status === "approved" \? \(/);
  assert.match(outreach, /delivery unconfirmed/);
});

test('contact reveal stays public-source and paid reveal is unavailable', () => {
  const contacts = read('components/contacts-view.tsx');
  assert.match(contacts, /Find published contact details/);
  assert.match(contacts, /Paid contact lookups are unavailable/);
  assert.doesNotMatch(contacts, /Spend Apollo grant|Apollo people match/);
});

test('approvals bind the reviewed digest and terminal contacts cannot be re-prepared', () => {
  const outreach = read('components/outreach-view.tsx');
  const workspace = read('lib/workspace.ts');
  assert.match(outreach, /packageId: item\.id, expectedDigest: item\.digest/);
  assert.match(outreach, /messageId: item\.id,\s*acknowledged: ack,\s*expectedDigest: item\.digest/);
  assert.match(workspace, /messageId: string; acknowledged: boolean; expectedDigest: string/);
  assert.match(workspace, /packageId: string; expectedDigest: string/);
  assert.match(outreach, /\["handed_off", "handed_to_gmail", "sent"\]\.includes\(message\.status\)/);
  assert.match(outreach, /disabled=\{draftMsg\.isPending \|\| handedOff\}/);
});

const normalized = (text) => text.replace(/\s+/g, ' ');

test('search activation consent does not claim a schedule is enabled', () => {
  const prospects = normalized(read('components/prospects-view.tsx'));
  assert.doesNotMatch(prospects, /enables the search schedule/);
  assert.match(
    prospects,
    /Save these settings and start a prospect search\? Searches run only when you start them\. Your connected AI service may charge for searches\. Nothing is sent to prospects\./,
  );
});

test('public-source email copy says it is unverified and included in the CRM export', () => {
  const contacts = normalized(read('components/contacts-view.tsx'));
  assert.doesNotMatch(contacts, /cannot export this contact/);
  assert.match(
    contacts,
    /item\.emailKind === "public_source" \? \( <p[^>]*> Unverified email address: found in a public source, not checked with the mail server\. It is included in the CRM CSV export\. <\/p>/,
  );
});

async function loadDraftRule() {
  const { stripTypeScriptTypes } = await import('node:module');
  const source = read('components/knowledge-view.tsx');
  const start = source.indexOf('type AnswerDraft');
  const end = source.indexOf('// end answer draft rule');
  assert.ok(start >= 0 && end > start, 'answer draft rule is defined in knowledge-view.tsx');
  const js = `${stripTypeScriptTypes(source.slice(start, end))}\nexport { nextAnswerDraft };`;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

test('research refresh never overwrites an answer the owner has typed', async () => {
  const { nextAnswerDraft } = await loadDraftRule();
  const typed = { questionId: 'q1', answer: 'My own answer', dirty: true };
  assert.deepEqual(nextAnswerDraft(typed, 'q1', 'New AI suggestion'), typed);

  const untouched = { questionId: 'q1', answer: 'Old suggestion', dirty: false };
  assert.deepEqual(nextAnswerDraft(untouched, 'q1', 'New AI suggestion'), {
    questionId: 'q1',
    answer: 'New AI suggestion',
    dirty: false,
  });

  assert.deepEqual(nextAnswerDraft(typed, 'q2', 'Question two suggestion'), {
    questionId: 'q2',
    answer: 'Question two suggestion',
    dirty: false,
  });
});

test('question card wires the draft rule to typing, refresh and submit', () => {
  const knowledge = normalized(read('components/knowledge-view.tsx'));
  assert.match(knowledge, /setDraft\(\(current\) => nextAnswerDraft\(current, item\.questionId, seed\)\)/);
  assert.match(knowledge, /onChange=\{\(event\) => setDraft\(\{ questionId: item\.questionId, answer: event\.target\.value, dirty: true \}\)/);
  assert.match(knowledge, /onSuccess: \(\) => \{ setEditing\(false\); setDraft\(\(current\) => \(\{ \.\.\.current, dirty: false \}\)\); \}/);
  assert.doesNotMatch(knowledge, /setAnswer\(/);
});
