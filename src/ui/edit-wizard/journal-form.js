import { html, safeHref } from '../../render.js';
import { COMMON_LANGUAGES, languageName } from '../../core/languages.js';
import { hasJournalTermChanges, hasJournalFieldChanges, hasJournalScopeChanges } from '../../core/draft.js';

const label = (code) => `${languageName(code)} (${code})`;
const openAlexUrl = (id) => `https://openalex.org/${id}`;

function derived(draft) {
  const j = draft.journalEntity;
  return {
    refRequired: draft.mode === 'create-journal' || hasJournalTermChanges(j) || hasJournalFieldChanges(j) || hasJournalScopeChanges(j),
  };
}

/** Edit mode only: the item exists on Wikidata but is not shown as a journal in the directory yet. */
const scopeNotice = (draft) => {
  const j = draft.journalEntity;
  const o = j?.original;
  if (draft.mode !== 'update-journal' || !(o?.needsClass || o?.needsField)) return '';
  const parts = [o.needsClass ? '“instance of” academic journal' : null, o.needsField ? '“main subject” sociology of law' : null].filter(Boolean);
  return html`<div class="details__scope" data-role="scope-notice">
      <label><input type="checkbox" name="journalAddToDirectory" data-field="journal-addToDirectory" ${j.addToDirectory ? 'checked' : ''}>
        This item is not shown as a journal in this directory yet. Add it.</label>
      <p class="details__scopehint">Adds ${parts.join(' and ')} to the Wikidata item (existing statements are kept). A reference URL is required.</p>
    </div>`;
};

const refLabel = (d) => (d.refRequired ? '(required)' : '(needed when a field changes)');

const openAlexHint = (j) => (j.openAlexId
  ? html`Look up this journal at openalex.org to confirm the id — link:
      <a href="${safeHref(openAlexUrl(j.openAlexId))}" rel="noopener" target="_blank">${openAlexUrl(j.openAlexId)}</a>`
  : 'Look up the journal at openalex.org to find its OpenAlex ID (a persistent identifier usable across academic databases).');

/**
 * The "details" step body for create-journal / update-journal.
 * @param {{
 *   draft: import('../../core/draft.js').DirectoryDraft,
 *   langs: string[],
 *   suggestions: string[],
 *   config: any,
 *   langError?: string,
 * }} p
 */
export function renderJournalForm({ draft, langs, suggestions, langError = '' }) {
  const j = draft.journalEntity;
  const addable = COMMON_LANGUAGES.filter((c) => !langs.includes(c));
  const d = derived(draft);

  return html`
    <div class="details journal-details">
      ${scopeNotice(draft)}
      ${langs.map((c) => html`
        <fieldset class="lang" data-lang="${c}">
          <legend>${label(c)}</legend>
          <label>Title
            <input type="text" name="journal-label-${c}" data-field="journal-label" data-lang="${c}" lang="${c}"
                   value="${j.labels[c] || ''}" autocomplete="off"></label>
          <label>Description
            <input type="text" name="journal-description-${c}" data-field="journal-description" data-lang="${c}" lang="${c}"
                   value="${j.descriptions[c] || ''}" autocomplete="off"></label>
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
      <label>Founded (year) <input type="text" inputmode="numeric" name="journal-founded" data-field="journal-founded" value="${j.founded || ''}" autocomplete="off"></label>
      <label>Closed (year, if discontinued) <input type="text" inputmode="numeric" name="journal-closed" data-field="journal-closed" value="${j.closed || ''}" autocomplete="off"></label>
      <label>ISSN <input type="text" name="journal-issn" data-field="journal-issn" value="${j.issn || ''}" autocomplete="off"></label>
      <label>Official website <input type="text" inputmode="url" name="journal-website" data-field="journal-website" value="${j.website || ''}" autocomplete="off"></label>
      <label>OpenAlex ID <input type="text" name="journal-openalex" data-field="journal-openalex" value="${j.openAlexId || ''}" placeholder="e.g. S58239531" autocomplete="off"></label>
      <p class="wizard__hint" data-role="openalex-hint">${openAlexHint(j)}</p>
      <div class="details__publisher" data-role="publisher-field">
        <div data-role="ta-publisher"></div>
      </div>
      <label>Reference URL <span data-role="journal-ref-label">${refLabel(d)}</span>
        <input type="text" inputmode="url" name="journal-referenceUrl" data-field="journal-referenceUrl" value="${j.referenceUrl || ''}" autocomplete="off"></label>
    </div>`;
}

/**
 * After a keystroke: update only what depends on the values (the reference-URL hint and the
 * error list are handled by the wizard itself; this patches the one journal-form-specific bit).
 * @param {ParentNode} root
 * @param {import('../../core/draft.js').DirectoryDraft} draft
 */
export function refreshJournalFormDerived(root, draft) {
  const d = derived(draft);
  const ref = root.querySelector('[data-role="journal-ref-label"]');
  if (ref) ref.textContent = refLabel(d);
  const hint = root.querySelector('[data-role="openalex-hint"]');
  if (hint) hint.innerHTML = String(openAlexHint(draft.journalEntity));
}

/**
 * Write one journal-details form control's value into the draft.
 * @param {import('../../core/draft.js').DirectoryDraft} draft
 * @param {HTMLInputElement} el
 * @returns {boolean} whether the element belonged to this form
 */
export function applyJournalFieldInput(draft, el) {
  const field = el.dataset?.field;
  if (!field || !field.startsWith('journal-')) return false;
  const j = draft.journalEntity;
  if (field === 'journal-label') j.labels[el.dataset.lang] = el.value;
  else if (field === 'journal-description') j.descriptions[el.dataset.lang] = el.value;
  else if (field === 'journal-founded') j.founded = el.value.trim() || null;
  else if (field === 'journal-closed') j.closed = el.value.trim() || null;
  else if (field === 'journal-issn') j.issn = el.value.trim() || null;
  else if (field === 'journal-website') j.website = el.value.trim() || null;
  else if (field === 'journal-openalex') j.openAlexId = el.value.trim() || null;
  else if (field === 'journal-referenceUrl') j.referenceUrl = el.value.trim() || null;
  else if (field === 'journal-addToDirectory') j.addToDirectory = el.checked;
  else return false;
  return true;
}
