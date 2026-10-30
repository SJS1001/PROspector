import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'lightningcss';

const source = readFileSync(new URL('../../src/styles.css', import.meta.url));
test('narrow-screen overrides parse and retain scope and desktop boundary', () => {
  const { code } = transform({ filename: 'styles.css', code: source, minify: true });
  const css = code.toString();
  assert.match(css, /(?:max-width:639px|width<=639px)/);
  assert.match(css, /#operator-task/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /flex-wrap:wrap/);
  assert.match(css, /white-space:normal/);
  assert.doesNotMatch(css, /overflow-x:hidden/);
});
