import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, escapeHtml, safeHref } from '../../src/render.js';

test('escapeHtml neutralises angle brackets, quotes, ampersands', () => {
  assert.equal(escapeHtml(`<a href="x">&`), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('html interpolates and escapes string values', () => {
  assert.equal(String(html`<p>${'<script>'}</p>`), '<p>&lt;script&gt;</p>');
});

test('html joins arrays without separators and does not double-escape trusted fragments', () => {
  const rows = ['a', 'b'].map((c) => html`<li>${c}</li>`);
  assert.equal(String(html`<ul>${rows}</ul>`), '<ul><li>a</li><li>b</li></ul>');
});

test('html renders null/undefined as empty string', () => {
  assert.equal(String(html`x${null}y${undefined}z`), 'xyz');
});

test('a raw string equal to a prior fragment is still escaped (not trusted by value)', () => {
  const frag = html`<li>x</li>`;
  assert.equal(String(html`${'<li>x</li>'}`), '&lt;li&gt;x&lt;/li&gt;');
  assert.equal(String(html`${frag}`), '<li>x</li>');
});

test('safeHref passes http(s) and mailto, rejects javascript: and data:', () => {
  assert.equal(safeHref('https://example.org/x'), 'https://example.org/x');
  assert.equal(safeHref('mailto:a@b.org'), 'mailto:a@b.org');
  assert.equal(safeHref('  javascript:alert(1)'), '#');
  assert.equal(safeHref('JavaScript:alert(1)'), '#');
  assert.equal(safeHref('data:text/html,<script>'), '#');
  assert.equal(safeHref('#frag'), '#frag');
  assert.equal(safeHref(null), '#');
});
