import { html } from '../../render.js';
import { looksPersonal } from '../../core/email-guard.js';
import { cleanTerms, changedStatements } from '../../core/draft.js';
import { COMMON_LANGUAGES, languageName } from '../../core/languages.js';

const label = (code) => `${languageName(code)} (${code})`;

/**
 * Everything on the form that depends on the current values but is not an input itself.
 * Typing must only refresh these parts (see `refreshDetailsDerived`), never rebuild the inputs.
 */
function derived(draft, labelLanguages) {
  const a = draft.association;
  const visible = labelLanguages.split(',').map((s) => s.trim()).filter(Boolean);
  const named = Object.keys({ ...cleanTerms(a.original?.labels), ...cleanTerms(a.labels) });
  const changed = changedStatements(a);
  return {
    visible,
    invisible: visible.length > 0 && named.length > 0 && !named.some((l) => visible.includes(l)),
    needsConfirm: !!(a.email && looksPersonal(a.email) && (draft.mode === 'create-association' || changed.email)),
    refRequired: draft.mode === 'create-association' || !!(changed.website || changed.email),
  };
}

const warnMarkup = (d) => (d.invisible
  ? html`<p class="details__warn">The directory shows names in ${d.visible.join(', ')}. With only the languages above,
      this association will appear as its Wikidata ID in the directory until a name in one of those languages is added.</p>`
  : '');

const confirmMarkup = (draft) => html`<label class="details__confirm"><input type="checkbox" name="emailConfirmedShared"
    data-field="emailConfirmedShared" ${draft.association.emailConfirmedShared ? 'checked' : ''}> This is a shared role address, not a personal one</label>`;

const refLabel = (d) => (d.refRequired ? '(required)' : '(needed when website or e-mail change)');

/**
 * Shared "details" step body for Add association and Edit details.
 * @param {{
 *   draft: import('../../core/draft.js').DirectoryDraft,
 *   langs: string[],              // language rows to show, in order
 *   suggestions: string[],        // official languages not shown yet (one-click chips)
 *   labelLanguages?: string,      // comma list the directory query shows names for
 *   langError?: string,
 * }} p
 */
export function renderDetailsForm({ draft, langs, suggestions, labelLanguages = '', langError = '' }) {
  const a = draft.association;
  const addable = COMMON_LANGUAGES.filter((c) => !langs.includes(c));
  const d = derived(draft, labelLanguages);

  return html`
    <div class="details">
      ${langs.map((c) => html`
        <fieldset class="lang" data-lang="${c}">
          <legend>${label(c)}</legend>
          <label>Name
            <input type="text" name="label-${c}" data-field="label" data-lang="${c}" lang="${c}"
                   value="${a.labels[c] || ''}" autocomplete="off"></label>
          <label>Description
            <input type="text" name="description-${c}" data-field="description" data-lang="${c}" lang="${c}"
                   value="${a.descriptions[c] || ''}" autocomplete="off"></label>
        </fieldset>`)}
      ${suggestions.length
        ? html`<p class="details__chips">Official language(s):
            ${suggestions.map((c) => html`<button type="button" data-role="add-lang" data-lang="${c}">+ ${label(c)}</button>`)}</p>`
        : ''}
      <div class="details__addlang">
        <select data-role="lang-select" aria-label="Add a language">
          <option value="">Add language…</option>
          ${addable.map((c) => html`<option value="${c}">${label(c)}</option>`)}
        </select>
        <input type="text" name="lang-code" data-role="lang-code" placeholder="or a code, e.g. pt-br" autocomplete="off">
        <button type="button" data-role="add-lang-go">Add</button>
      </div>
      ${langError ? html`<p class="wizard__errors">${langError}</p>` : ''}
      <div data-role="visibility-warn">${warnMarkup(d)}</div>
      <label>Website
        <input type="text" inputmode="url" name="website" data-field="website" value="${a.website || ''}" autocomplete="off"></label>
      <label>E-mail (shared role address)
        <input type="text" inputmode="email" name="email" data-field="email" value="${a.email || ''}" autocomplete="off"></label>
      <div data-role="email-confirm">${d.needsConfirm ? confirmMarkup(draft) : ''}</div>
      <label>Reference URL <span data-role="ref-label">${refLabel(d)}</span>
        <input type="text" inputmode="url" name="referenceUrl" data-field="referenceUrl" value="${a.referenceUrl || ''}" autocomplete="off"></label>
    </div>`;
}

/**
 * After a keystroke: update only what depends on the values. The inputs themselves are never
 * replaced, so focus, caret, IME composition and undo history in the field being typed in survive.
 * @param {ParentNode} root
 * @param {import('../../core/draft.js').DirectoryDraft} draft
 * @param {string} [labelLanguages]
 */
export function refreshDetailsDerived(root, draft, labelLanguages = '') {
  const d = derived(draft, labelLanguages);
  const warn = root.querySelector('[data-role="visibility-warn"]');
  if (warn) warn.innerHTML = String(warnMarkup(d));
  const ref = root.querySelector('[data-role="ref-label"]');
  if (ref) ref.textContent = refLabel(d);
  const box = root.querySelector('[data-role="email-confirm"]');
  if (box) {
    const present = !!box.querySelector('input');
    if (d.needsConfirm && !present) box.innerHTML = confirmMarkup(draft).value;
    else if (!d.needsConfirm && present) box.innerHTML = '';
    const cb = box.querySelector('input');
    if (cb) cb.checked = !!draft.association.emailConfirmedShared; // changing the e-mail resets the confirmation
  }
}

/**
 * Write one form control's value into the draft.
 * @param {import('../../core/draft.js').DirectoryDraft} draft
 * @param {HTMLInputElement} el
 * @returns {boolean} whether the element belonged to the details form
 */
export function applyFieldInput(draft, el) {
  const field = el.dataset?.field;
  if (!field) return false;
  const a = draft.association;
  if (field === 'label') a.labels[el.dataset.lang] = el.value;
  else if (field === 'description') a.descriptions[el.dataset.lang] = el.value;
  else if (field === 'emailConfirmedShared') a.emailConfirmedShared = el.checked;
  else if (field === 'website' || field === 'referenceUrl') a[field] = el.value.trim() || null;
  else if (field === 'email') {
    a.email = el.value.trim() || null;
    a.emailConfirmedShared = false; // the confirmation belongs to the address it was given for
  } else return false;
  return true;
}
