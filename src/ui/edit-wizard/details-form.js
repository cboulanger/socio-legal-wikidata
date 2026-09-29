import { html } from '../../render.js';
import { looksPersonal } from '../../core/email-guard.js';
import { cleanTerms, changedStatements, hasScopeChanges, hasFormerNames, changedParent } from '../../core/draft.js';
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
    refRequired: draft.mode === 'create-association' || !!(changed.website || changed.email || hasScopeChanges(a) || hasFormerNames(a) || !!changedParent(a)),
  };
}

const warnMarkup = (d) => (d.invisible
  ? html`<p class="details__warn">The directory shows names in ${d.visible.join(', ')}. With only the languages above,
      this association will appear as its Wikidata ID in the directory until a name in one of those languages is added.</p>`
  : '');

const confirmMarkup = (draft) => html`<label class="details__confirm"><input type="checkbox" name="emailConfirmedShared"
    data-field="emailConfirmedShared" ${draft.association.emailConfirmedShared ? 'checked' : ''}> This is a shared role address, not a personal one</label>`;

/** Edit mode only: the item exists on Wikidata but is not in the directory yet. */
const scopeNotice = (draft) => {
  const o = draft.association.original;
  if (draft.mode !== 'update-field' || !(o?.needsClass || o?.needsField)) return '';
  const a = draft.association;
  const parts = [o.needsClass ? `“instance of” ${a.classQid}` : null, o.needsField ? `“field of work” ${a.fieldQid}` : null].filter(Boolean);
  return html`<div class="details__scope" data-role="scope-notice">
      <label><input type="checkbox" name="addToDirectory" data-field="addToDirectory" ${a.addToDirectory ? 'checked' : ''}>
        This item is not in the directory yet. Add it as a socio-legal association.</label>
      <p class="details__scopehint">Adds ${parts.join(' and ')} to the Wikidata item (existing statements are kept). A reference URL is required.</p>
    </div>`;
};

const norm = (s) => (s || '').trim();

/** "1995–2010", "from 1995", "until 2010" or '' */
const yearsText = (e) => (e.start && e.end ? `${e.start}–${e.end}` : e.start ? `from ${e.start}` : e.end ? `until ${e.end}` : '');

/**
 * One-click shortcuts for names that were just changed: the old name is offered as a former name.
 * Only buttons, so it can be refreshed on every keystroke without touching any input.
 */
function renameHints(draft) {
  const a = draft.association;
  const buttons = [];
  for (const [lang, old] of Object.entries(a.original?.labels || {})) {
    const now = norm(a.labels[lang]);
    if (!norm(old) || !now || now === norm(old)) continue;
    const recorded = [...(a.formerNames || []), ...(a.original?.formerNames || [])]
      .some((r) => norm(r.text) === norm(old) && norm(r.lang).toLowerCase() === lang);
    if (!recorded) buttons.push(html`<button type="button" data-role="rename-hint" data-lang="${lang}">Record “${old}” (${lang}) as a former name</button>`);
  }
  return buttons.length ? html`<p class="details__hint">You changed a name. ${buttons}</p>` : '';
}

/** The "Former names" section: what is on Wikidata already (read-only) plus rows to add. */
function formerSection(draft) {
  const a = draft.association;
  const existing = a.original?.formerNames || [];
  const row = (r, i) => html`
    <div class="former__row" data-index="${i}">
      <label>Name <input type="text" name="former-text-${i}" data-field="former" data-index="${i}" data-prop="text" lang="${r.lang || ''}" value="${r.text || ''}" autocomplete="off"></label>
      <label>Language <input type="text" name="former-lang-${i}" data-field="former" data-index="${i}" data-prop="lang" value="${r.lang || ''}" autocomplete="off"></label>
      <label>From (year) <input type="text" inputmode="numeric" name="former-start-${i}" data-field="former" data-index="${i}" data-prop="start" value="${r.start || ''}" autocomplete="off"></label>
      <label>Until (year) <input type="text" inputmode="numeric" name="former-end-${i}" data-field="former" data-index="${i}" data-prop="end" value="${r.end || ''}" autocomplete="off"></label>
      <label class="former__alias"><input type="checkbox" name="former-alias-${i}" data-field="former" data-index="${i}" data-prop="alias" ${r.alias ? 'checked' : ''}> also an alias (so search finds it)</label>
      <button type="button" data-role="remove-former" data-index="${i}" aria-label="Remove this former name">×</button>
    </div>`;
  return html`
    <fieldset class="former" data-role="former-names">
      <legend>Former names</legend>
      <p class="details__scopehint">Earlier names of the association, with the years they were in use. Each one is recorded on Wikidata
        as a dated “official name” statement. A reference URL is required.</p>
      ${existing.length
        ? html`<ul class="former__existing">${existing.map((e) => html`<li>${e.text} (${e.lang})${yearsText(e) ? html` · ${yearsText(e)}` : ''}</li>`)}</ul>`
        : ''}
      <div data-role="rename-hints">${renameHints(draft)}</div>
      ${(a.formerNames || []).map(row)}
      <button type="button" data-role="add-former">+ Add a former name</button>
    </fieldset>`;
}

/** "Part of": the host organization, picked by typing (the picker is mounted by the wizard). */
function parentSection(a) {
  return html`<div class="details__parent" data-role="parent-field">
      ${a.parentQid
        ? html`<p class="wizard__chosen">Part of (organization): <strong>${a.parentLabel || a.parentQid}</strong>
            <button type="button" data-role="clear-parent">change</button></p>`
        : html`<div data-role="ta-parent"></div>`}
    </div>`;
}

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
      ${scopeNotice(draft)}
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
      ${formerSection(draft)}
      ${parentSection(a)}
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
  const hints = root.querySelector('[data-role="rename-hints"]');
  if (hints) hints.innerHTML = String(renameHints(draft));
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
  else if (field === 'addToDirectory') a.addToDirectory = el.checked;
  else if (field === 'former') {
    const row = (a.formerNames || [])[Number(el.dataset.index)];
    if (!row) return false;
    if (el.dataset.prop === 'alias') row.alias = el.checked;
    else row[el.dataset.prop] = el.value;
  }
  else if (field === 'website' || field === 'referenceUrl') a[field] = el.value.trim() || null;
  else if (field === 'email') {
    a.email = el.value.trim() || null;
    a.emailConfirmedShared = false; // the confirmation belongs to the address it was given for
  } else return false;
  return true;
}
