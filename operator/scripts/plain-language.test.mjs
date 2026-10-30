import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/lib/domain/plain-language.ts', import.meta.url), 'utf8');
const { uiText, uiLabel } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);

test('older saved system messages have plain display text without rewriting the saved record', () => {
  const record = Object.freeze({ message: 'Audience and likely buyer are required to confirm a draft play.', revision: 7 });
  const before = JSON.stringify(record);
  assert.equal(uiText(record.message), 'Enter the target customers and likely buyer before confirming this market.');
  assert.equal(JSON.stringify(record), before);
});

test('unknown messages and user wording are preserved exactly, including object property names', () => {
  for (const text of ['Our draft play targets mining companies.', 'A hunt is our customer’s own term.', '', 'toString', '__proto__']) {
    assert.equal(uiText(text), text);
  }
});

test('status labels do not imply Gmail delivery or turn unknown errors into success', () => {
  assert.equal(uiLabel('handed_off'), 'Gmail requested');
  assert.equal(uiLabel('failed'), 'Failed');
  assert.equal(uiText('Unexpected provider error 123'), 'Unexpected provider error 123');
  assert.equal(uiLabel('unknown_status'), 'Unknown status');
});
