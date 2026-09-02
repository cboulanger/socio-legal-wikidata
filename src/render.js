/** Marker for already-escaped, trusted HTML produced by `html`. */
class Trusted {
  /** @param {string} s */
  constructor(s) {
    this.value = s;
  }
  toString() {
    return this.value;
  }
}

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
  if (v instanceof Trusted) return v.value;
  if (Array.isArray(v)) return v.map(part).join('');
  return escapeHtml(v);
}

/**
 * Tagged template that escapes interpolations. Nest with `html` to compose
 * trusted fragments (arrays of fragments are joined without separators).
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {Trusted}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Trusted(out);
}

/**
 * Replace the contents of `parent` with the rendered fragment.
 * @param {Element} parent
 * @param {Trusted|string} rendered
 */
export function mount(parent, rendered) {
  parent.innerHTML = rendered instanceof Trusted ? rendered.value : String(rendered);
}
