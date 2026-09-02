import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, escapeHtml } from '../../src/render.js';

test('escapeHtml neutralises angle brackets, quotes, ampersands', () => {
  assert.equal(escapeHtml(`<a href="x">&`), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('html interpolates and escapes string values', () => {
  const out = html`<p>${'<script>'}</p>`;
  assert.equal(out, '<p>&lt;script&gt;</p>');
});

test('html joins arrays without separators and does not double-escape trusted fragments', () => {
  const rows = ['a', 'b'].map((c) => html`<li>${c}</li>`);
  assert.equal(html`<ul>${rows}</ul>`, '<ul><li>a</li><li>b</li></ul>');
});

test('html renders null/undefined as empty string', () => {
  assert.equal(html`x${null}y${undefined}z`, 'xyz');
});
