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
