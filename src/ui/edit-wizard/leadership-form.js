import { html } from '../../render.js';

const dateStr = (d) => d || '';

/** "Already on Wikidata" — the read-only list loaded when the wizard opened. */
function existingSection(original) {
  const history = original?.history || [];
  if (!history.length) return '';
  return html`<div class="officer__existing">
      <p class="wizard__hint">Already on Wikidata:</p>
      <ul>${history.map((r) => html`<li>${r.officeLabel}: ${r.personLabel}, ${r.begin || '?'} – ${r.end || 'present'}</li>`)}</ul>
    </div>`;
}

/** Two name fields: a fixed English primary, and an optional second language. */
function nameFields(p, i) {
  const showSecond = !!p._showSecondName || !!p._secondLang || !!p._secondText;
  return html`
    <label>Name (English)
      <input type="text" data-field="officer-name" data-index="${i}" data-lang="en" value="${p.labels.en || ''}" autocomplete="off"></label>
    ${showSecond
      ? html`<label>Language <input type="text" data-field="officer-name2-lang" data-index="${i}" value="${p._secondLang || ''}" placeholder="e.g. pt" autocomplete="off"></label>
          <label>Name <input type="text" data-field="officer-name2-text" data-index="${i}" value="${p._secondText || ''}" autocomplete="off"></label>`
      : html`<button type="button" data-role="officer-add-lang" data-index="${i}">+ add another language</button>`}`;
}

/** Current affiliation: chosen state, or the typeahead placeholder the wizard mounts into. */
function affiliationField(p, i) {
  return p.affiliationQid
    ? html`<p class="wizard__chosen">Current affiliation: <strong>${p.affiliationLabel || p.affiliationQid}</strong>
        <button type="button" data-role="clear-officer-affiliation" data-index="${i}">change</button></p>`
    : html`<div data-role="ta-officer-affiliation-${i}"></div>`;
}

/** Person picker: search-first, then either "existing person chosen" or the new-person fields. */
function personSection(row, i) {
  const p = row.person;
  if (p.qid) {
    const who = p.pickedLabel || p.qid;
    const display = p.pickedBirthYear ? `${who} (b. ${p.pickedBirthYear})` : who;
    return html`<p class="wizard__chosen">Person: <strong>${display}</strong>
        <button type="button" data-role="clear-officer-person" data-index="${i}">change</button></p>
      <p class="officer__afflabel">Current affiliation (optional)</p>
      ${affiliationField(p, i)}`;
  }
  if (Object.keys(p.labels).length === 0) {
    return html`<div data-role="ta-officer-${i}"></div>`;
  }
  return html`<fieldset class="officer__person">
      <legend>New person</legend>
      ${nameFields(p, i)}
      <label>Description <input type="text" data-field="officer-description" data-index="${i}" value="${p.description || ''}" autocomplete="off"></label>
      <label>Birth date <input type="date" data-field="officer-birthdate" data-index="${i}" value="${dateStr(p.birthDate)}"></label>
      <p class="officer__afflabel">Current affiliation, or an ORCID iD below — at least one is required</p>
      ${affiliationField(p, i)}
      <label>ORCID iD <input type="text" data-field="officer-orcid" data-index="${i}" value="${p.orcid || ''}" autocomplete="off"></label>
      <label>Homepage <input type="text" inputmode="url" data-field="officer-homepage" data-index="${i}" value="${p.homepage || ''}" autocomplete="off"></label>
    </fieldset>`;
}

/** The office <select> (curated list + "Other"), or the typeahead once "Other" was chosen. */
function officeField(row, i, officeTypes) {
  if (row._customOffice) return html`<div data-role="ta-officer-office-${i}"></div>`;
  const known = officeTypes.some((o) => o.qid === row.officeQid);
  return html`<select data-field="officer-office" data-index="${i}">
      ${officeTypes.map((o) => html`<option value="${o.qid}" ${row.officeQid === o.qid ? 'selected' : ''}>${o.label}</option>`)}
      <option value="__other__" ${!known && row.officeQid ? 'selected' : ''}>Other — search Wikidata…</option>
    </select>`;
}

/**
 * The "officers" step body: existing leadership (read-only) plus rows being added.
 * @param {{draft: import('../../core/draft.js').DirectoryDraft, config: any}} p
 */
export function renderLeadershipForm({ draft, config }) {
  const officeTypes = config.officeTypes || [];
  const rows = draft.officers || [];
  return html`<div class="officers">
      ${existingSection(draft.leadershipOriginal)}
      ${rows.map((row, i) => html`<fieldset class="officer" data-index="${i}">
          <legend>Officeholder ${i + 1}</legend>
          ${personSection(row, i)}
          <label>Office ${officeField(row, i, officeTypes)}</label>
          <label>Begin <input type="date" data-field="officer-begin" data-index="${i}" value="${dateStr(row.begin)}"></label>
          <label>End (leave blank if current)
            <input type="date" data-field="officer-end" data-index="${i}" value="${dateStr(row.end)}"></label>
          <button type="button" data-role="remove-officer" data-index="${i}">Remove</button>
        </fieldset>`)}
      <button type="button" data-role="add-officer">+ Add another officeholder</button>
      <label>Reference URL
        <input type="text" inputmode="url" data-field="referenceUrl" value="${draft.association.referenceUrl || ''}" autocomplete="off"></label>
    </div>`;
}

/**
 * Write one officers-step form control's value into the draft.
 * @param {import('../../core/draft.js').DirectoryDraft} draft
 * @param {HTMLInputElement} el
 * @returns {boolean} whether the element belonged to this form
 */
export function applyLeadershipFieldInput(draft, el) {
  const field = el.dataset?.field;
  if (!field) return false;
  if (field === 'referenceUrl') { draft.association.referenceUrl = el.value.trim() || null; return true; }
  const row = (draft.officers || [])[Number(el.dataset.index)];
  if (!row) return false;
  const p = row.person;
  if (field === 'officer-name') { (p.labels ||= {})[el.dataset.lang] = el.value; return true; }
  if (field === 'officer-name2-lang') { p._secondLang = el.value.trim().toLowerCase(); syncSecondName(p); return true; }
  if (field === 'officer-name2-text') { p._secondText = el.value; syncSecondName(p); return true; }
  if (field === 'officer-description') { p.description = el.value; return true; }
  if (field === 'officer-birthdate') { p.birthDate = el.value || null; return true; }
  if (field === 'officer-orcid') { p.orcid = el.value.trim() || null; return true; }
  if (field === 'officer-homepage') { p.homepage = el.value.trim() || null; return true; }
  if (field === 'officer-begin') { row.begin = el.value; return true; }
  if (field === 'officer-end') { row.end = el.value || null; return true; }
  if (field === 'officer-office') {
    if (el.value === '__other__') { row._customOffice = true; return true; }
    row.officeQid = el.value;
    row.officeLabel = el.selectedOptions?.[0]?.textContent || el.value;
    return true;
  }
  return false;
}

/** Keep the second-language labels entry in sync with the two transient input fields. */
function syncSecondName(p) {
  for (const k of Object.keys(p.labels)) if (k !== 'en') delete p.labels[k];
  if (p._secondLang && p._secondText) p.labels[p._secondLang] = p._secondText;
}
