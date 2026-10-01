import { html, safeHref } from '../render.js';

const openAlexUrl = (id) => `https://openalex.org/${id}`;
const wikidataUrl = (qid) => `https://www.wikidata.org/wiki/${qid}`;

/**
 * @param {import('../core/model.js').Journal} journal
 * @param {{
 *   editMode?: boolean,
 *   details?: null|{founded: string|null, closed: string|null, issn: string|null, website: string|null, websiteAsOf: string|null, openAlexId: string|null, publisherQid: string|null, publisherLabel: string|null},
 *   editorHistory?: null|import('../core/draft.js').EditorHistoryRow[],
 *   loadError?: string,
 * }} opts
 * @returns {import('../render.js').Trusted}
 */
export function renderJournalCard(journal, { editMode = false, details = null, editorHistory = null, loadError = '' } = {}) {
  const d = details || {};
  const period = d.founded || d.closed ? `${d.founded || '?'} – ${d.closed || 'present'}` : '';
  const publisherQid = journal.publisherQid || d.publisherQid;
  const publisherLabel = journal.publisherLabel || d.publisherLabel;
  return html`
    <article class="card card--journal" data-qid="${journal.qid}">
      <button type="button" class="card__close" data-role="close-card" aria-label="Close">×</button>
      <h2 class="card__title">${journal.label}</h2>
      ${journal.description ? html`<p class="card__meta">${journal.description}</p>` : ''}
      ${period ? html`<p class="card__row">${period}</p>` : ''}
      ${d.issn ? html`<p class="card__row">ISSN: ${d.issn}</p>` : ''}
      ${d.website
        ? html`<p class="card__row"><a href="${safeHref(d.website)}" rel="noopener" target="_blank">website</a>${d.websiteAsOf ? html` <span class="card__sub">(as of ${d.websiteAsOf})</span>` : ''}</p>`
        : ''}
      ${d.openAlexId ? html`<p class="card__row"><a href="${safeHref(openAlexUrl(d.openAlexId))}" rel="noopener" target="_blank">OpenAlex</a></p>` : ''}
      ${publisherLabel
        ? html`<p class="card__row">published by
            <button type="button" class="card__link" data-action="select-association" data-qid="${publisherQid}">${publisherLabel}</button></p>`
        : ''}
      <p class="card__row"><a href="${safeHref(wikidataUrl(journal.qid))}" rel="noopener" target="_blank">view on Wikidata</a></p>
      ${loadError
        ? html`<p class="card__row card__fail">${loadError} <button type="button" data-role="retry-journal-load" data-qid="${journal.qid}">Retry</button></p>`
        : (!details ? html`<p class="card__row">Loading details…</p>` : '')}
      <section class="card__editors">
        <h3>Editors</h3>
        ${editorHistory
          ? (editorHistory.length
              ? html`<ul>${editorHistory.map((r) => html`<li>${r.roleLabel}: ${r.personLabel}, ${r.begin || '?'} – ${r.end || 'present'}</li>`)}</ul>`
              : html`<p>No editors recorded.</p>`)
          : (loadError ? '' : html`<p>Loading…</p>`)}
      </section>
      ${editMode
        ? html`<p class="card__actions">
            <button type="button" data-action="edit-journal" data-qid="${journal.qid}">Edit journal</button>
            <button type="button" data-action="manage-editors" data-qid="${journal.qid}">Manage editors</button>
          </p>`
        : ''}
    </article>`;
}
