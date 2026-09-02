/**
 * Registry of strings that were produced by `html` and are therefore already
 * escaped / trusted. Lets nested `html` fragments compose without being
 * re-escaped, while `html` itself still returns a plain string (so
 * `assert.equal(html`...`, 'string')` holds).
 * @type {Set<string>}
 */
const trusted = new Set();

/** @param {unknown} s @returns {string} */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @param {unknown} v @returns {string} */
function part(v) {
  if (v == null || v === false) return '';
  if (typeof v === 'string' && trusted.has(v)) return v;
  if (Array.isArray(v)) return v.map(part).join('');
  return escapeHtml(v);
}

/**
 * Tagged template that escapes interpolations. Nest with `html` to compose
 * trusted fragments (arrays of fragments are joined without separators).
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {string}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  trusted.add(out);
  return out;
}

/**
 * Replace the contents of `parent` with the rendered fragment.
 * @param {Element} parent
 * @param {string} rendered
 */
export function mount(parent, rendered) {
  parent.innerHTML = String(rendered);
}
