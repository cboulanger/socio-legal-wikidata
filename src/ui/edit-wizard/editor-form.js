import { html } from '../../render.js';

const dateStr = (d) => d || '';

/** "Already on Wikidata" — the read-only list loaded when the wizard opened. */
function existingSection(original) {
  const history = original?.history || [];
  if (!history.length) return '';
  return html`<div class="officer__existing">
      <p class="wizard__hint">Already on Wikidata:</p>
      <ul>${history.map((r) => html`<li>${r.roleLabel}: ${r.personLabel}, ${r.begin || '?'} – ${r.end || 'present'}</li>`)}</ul>
    </div>`;
}

/** Two name fields: a fixed English primary, and an optional second language. */
function nameFields(p, i) {
  const showSecond = !!p._showSecondName || !!p._secondLang || !!p._secondText;
  return html`
    <label>Name (English)
      <input type="text" data-field="editor-name" data-index="${i}" data-lang="en" value="${p.labels.en || ''}" autocomplete="off"></label>
    ${showSecond
      ? html`<label>Language <input type="text" data-field="editor-name2-lang" data-index="${i}" value="${p._secondLang || ''}" placeholder="e.g. pt" autocomplete="off"></label>
          <label>Name <input type="text" data-field="editor-name2-text" data-index="${i}" value="${p._secondText || ''}" autocomplete="off"></label>`
      : html`<button type="button" data-role="editor-add-lang" data-index="${i}">+ add another language</button>`}`;
}

/** Current affiliation: the typeahead placeholder — its chosen/change/remove state is owned by the picker itself. */
function affiliationField(i) {
  return html`<div data-role="ta-editor-affiliation-${i}"></div>`;
}

/** Person picker: search-first, then either "existing person chosen" or the new-person fields. */
function personSection(row, i) {
  const p = row.person;
  if (!p.qid && Object.keys(p.labels).length > 0) {
    return html`<fieldset class="officer__person">
        <legend>New person</legend>
        ${nameFields(p, i)}
        <label>Description <input type="text" data-field="editor-description" data-index="${i}" value="${p.description || ''}" autocomplete="off"></label>
        <label>Birth date <input type="date" data-field="editor-birthdate" data-index="${i}" value="${dateStr(p.birthDate)}"></label>
        <p class="officer__afflabel">Current affiliation, or an ORCID iD below — at least one is required</p>
        ${affiliationField(i)}
        <label>ORCID iD <input type="text" data-field="editor-orcid" data-index="${i}" value="${p.orcid || ''}" autocomplete="off"></label>
        <label>Homepage <input type="text" inputmode="url" data-field="editor-homepage" data-index="${i}" value="${p.homepage || ''}" autocomplete="off"></label>
      </fieldset>`;
  }
  return html`<div data-role="ta-editor-${i}"></div>
    ${p.qid ? html`<p class="officer__afflabel">Current affiliation (optional)</p>${affiliationField(i)}` : ''}`;
}

/** The role <select> (curated list + "Other"), or the typeahead once "Other" was chosen. */
function roleField(row, i, roles) {
  if (row._customRole) return html`<div data-role="ta-editor-role-${i}"></div>`;
  const known = roles.some((r) => r.qid === row.roleQid);
  return html`<select data-field="editor-role" data-index="${i}">
      ${roles.map((r) => html`<option value="${r.qid}" ${row.roleQid === r.qid ? 'selected' : ''}>${r.label}</option>`)}
      <option value="__other__" ${!known && row.roleQid ? 'selected' : ''}>Other — search Wikidata…</option>
    </select>`;
}

/**
 * The "editors" step body: existing editors (read-only) plus rows being added.
 * @param {{draft: import('../../core/draft.js').DirectoryDraft, config: any}} p
 */
export function renderEditorForm({ draft, config }) {
  const roles = config.journalEditorRoles || [];
  const rows = draft.editors || [];
  return html`<div class="officers">
      ${existingSection(draft.editorsOriginal)}
      ${rows.map((row, i) => html`<fieldset class="officer" data-index="${i}">
          <legend>Editor ${i + 1}</legend>
          ${personSection(row, i)}
          <label>Role ${roleField(row, i, roles)}</label>
          <label>Begin <input type="date" data-field="editor-begin" data-index="${i}" value="${dateStr(row.begin)}"></label>
          <label>End (leave blank if current)
            <input type="date" data-field="editor-end" data-index="${i}" value="${dateStr(row.end)}"></label>
          <button type="button" data-role="remove-editor" data-index="${i}">Remove</button>
        </fieldset>`)}
      <button type="button" data-role="add-editor">+ Add another editor</button>
      <label>Reference URL
        <input type="text" inputmode="url" data-field="journal-referenceUrl" value="${draft.journalEntity?.referenceUrl || ''}" autocomplete="off"></label>
    </div>`;
}

/**
 * Write one editors-step form control's value into the draft.
 * @param {import('../../core/draft.js').DirectoryDraft} draft
 * @param {HTMLInputElement} el
 * @returns {boolean} whether the element belonged to this form
 */
export function applyEditorFieldInput(draft, el) {
  const field = el.dataset?.field;
  if (!field || !field.startsWith('editor-')) return false;
  const row = (draft.editors || [])[Number(el.dataset.index)];
  if (!row) return false;
  const p = row.person;
  if (field === 'editor-name') { (p.labels ||= {})[el.dataset.lang] = el.value; return true; }
  if (field === 'editor-name2-lang') { p._secondLang = el.value.trim().toLowerCase(); syncSecondName(p); return true; }
  if (field === 'editor-name2-text') { p._secondText = el.value; syncSecondName(p); return true; }
  if (field === 'editor-description') { p.description = el.value; return true; }
  if (field === 'editor-birthdate') { p.birthDate = el.value || null; return true; }
  if (field === 'editor-orcid') { p.orcid = el.value.trim() || null; return true; }
  if (field === 'editor-homepage') { p.homepage = el.value.trim() || null; return true; }
  if (field === 'editor-begin') { row.begin = el.value; return true; }
  if (field === 'editor-end') { row.end = el.value || null; return true; }
  if (field === 'editor-role') {
    if (el.value === '__other__') { row._customRole = true; return true; }
    row.roleQid = el.value;
    row.roleLabel = el.selectedOptions?.[0]?.textContent || el.value;
    return true;
  }
  return false;
}

/** Keep the second-language labels entry in sync with the two transient input fields. */
function syncSecondName(p) {
  for (const k of Object.keys(p.labels)) if (k !== 'en') delete p.labels[k];
  if (p._secondLang && p._secondText) p.labels[p._secondLang] = p._secondText;
}
