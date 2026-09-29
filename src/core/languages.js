/** Languages offered in the "Add language" picker (Wikimedia language codes). */
export const COMMON_LANGUAGES = [
  'en', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'pl', 'ru', 'uk', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'tr',
  'sv', 'da', 'nb', 'fi', 'et', 'lv', 'lt', 'hr', 'sr', 'sl', 'ca', 'eu', 'gl',
  'ar', 'he', 'fa', 'hi', 'bn', 'id', 'ms', 'th', 'vi', 'ja', 'ko', 'zh', 'sw',
];

/** Wikimedia language codes such as `pt`, `pt-br`, `zh-hans`. */
export function isValidLangCode(code) {
  return typeof code === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(code);
}

/**
 * Human-readable language name, falling back to the code itself.
 * @param {string} code
 * @param {string} [locale]
 * @param {typeof Intl} [intl]
 */
export function languageName(code, locale = 'en', intl = globalThis.Intl) {
  try {
    return new intl.DisplayNames([locale], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

/**
 * The language rows to show first: the national (first official) language, English,
 * then every other language already present, alphabetically.
 * @param {{official?: string[], existing?: string[]}} p
 * @returns {string[]}
 */
export function initialLanguages({ official = [], existing = [] }) {
  const out = [];
  const add = (c) => { if (c && !out.includes(c)) out.push(c); };
  add(official[0]);
  add('en');
  [...existing].sort().forEach(add);
  return out;
}

/** Official languages not shown as a row yet (offered as one-click chips). */
export function languageSuggestions({ official = [], shown = [] }) {
  return official.filter((c) => !shown.includes(c));
}
