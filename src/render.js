/** Marker for already-escaped, trusted HTML produced by `html`. */
export class Trusted {
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

/**
 * Allow only http(s), mailto, and protocol-relative/relative URLs in click targets.
 * Anything else (javascript:, data:, vbscript:, …) → '#'.
 * @param {unknown} url
 * @returns {string}
 */
export function safeHref(url) {
  if (typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^(\/|\.\/|\.\.\/|#)/.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '#'; // any other explicit scheme
  return trimmed; // schemeless (e.g. "example.org/x")
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
 * Build a selector that should identify the same element again after a full
 * innerHTML replace, preferring the most stable/unique attribute available.
 * @param {Element} el @returns {string|null}
 */
function stableSelector(el) {
  if (el.id) return `#${CSS?.escape ? CSS.escape(el.id) : el.id}`;
  const role = el.getAttribute('data-role');
  if (role) return `${el.tagName.toLowerCase()}[data-role="${role}"]`;
  const name = el.getAttribute('name');
  if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
  return null;
}

/**
 * Replace the contents of `parent` with the rendered fragment.
 *
 * A full innerHTML replace destroys and recreates every node, including whichever
 * one currently has focus — e.g. a search box would lose focus (and the caret
 * position) on every keystroke, since each keystroke triggers a re-render. This
 * restores focus (and, for text-like inputs, the selection range) onto the
 * corresponding new node when the previously-focused element is identifiable via
 * `stableSelector` (id, then `data-role`, then `name`).
 *
 * @param {Element} parent
 * @param {Trusted|string} rendered
 */
export function mount(parent, rendered) {
  const doc = parent.ownerDocument;
  const active = doc?.activeElement;
  let refocus = null;
  if (active && parent.contains(active)) {
    const selector = stableSelector(active);
    if (selector) {
      refocus = {
        selector,
        selectionStart: 'selectionStart' in active ? active.selectionStart : null,
        selectionEnd: 'selectionEnd' in active ? active.selectionEnd : null,
      };
    }
  }

  parent.innerHTML = rendered instanceof Trusted ? rendered.value : String(rendered);

  if (refocus) {
    const el = parent.querySelector(refocus.selector);
    if (el) {
      el.focus();
      if (refocus.selectionStart != null && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(refocus.selectionStart, refocus.selectionEnd);
        } catch {
          // Some input types (number, email, ...) don't support selection ranges
          // and throw — focus is already restored, which is the important part.
        }
      }
    }
  }
}
