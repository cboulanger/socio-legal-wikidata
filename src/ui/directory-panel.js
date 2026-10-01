import { html } from '../render.js';
import { deriveScope } from '../core/model.js';
import { filterAssociations, partitionByLocation } from '../core/filter.js';

/**
 * @param {{
 *   associations: import('../core/model.js').Association[],
 *   journals?: import('../core/model.js').Journal[],
 *   showJournals?: boolean,
 *   filter: {countryCode?: string, text?: string},
 *   selection: {kind: 'association'|'journal', qid: string}|null,
 *   centroids: Object<string, [number,number]>,
 *   stale: boolean,
 *   asOf?: string|null,
 * }} state
 * @returns {import('../render.js').Trusted}
 */
export function renderPanel(state) {
  const { associations, journals = [], showJournals = false, filter, selection, centroids, stale, asOf } = state;
  const filtered = filterAssociations(associations, filter);
  const { mapped, unlocated } = partitionByLocation(filtered, centroids);
  const filteredJournals = showJournals ? filterAssociations(journals, filter) : [];

  const isSelected = (kind, qid) => !!selection && selection.kind === kind && selection.qid === qid;

  const row = (a, kind = 'association') => html`
    <li>
      <button type="button" class="row" data-kind="${kind}" data-qid="${a.qid}" aria-current="${isSelected(kind, a.qid)}">
        <span class="row__label">${a.label}</span>
        <span class="row__meta">${kind === 'journal'
          ? (a.publisherLabel || a.countryLabel || '')
          : html`${deriveScope(a)}${a.countryLabel ? html` · ${a.countryLabel}` : ''}`}</span>
      </button>
    </li>`;

  return html`
    <div class="panel">
      ${stale ? html`<p class="panel__banner">Showing a saved copy from ${asOf || 'an earlier date'}.</p>` : ''}
      <label class="panel__search">
        <span class="visually-hidden">Search associations</span>
        <input type="search" placeholder="Search…" value="${filter.text || ''}" data-role="search">
        ${filter.text
          ? html`<button type="button" class="panel__searchclear" data-role="clear-search" aria-label="Clear search">×</button>`
          : ''}
      </label>
      <div class="panel__toolbar">
        <button type="button" data-role="reload-data" title="Clear the saved copy and reload the data from Wikidata">Reload data</button>
        <label class="panel__toggle"><input type="checkbox" data-role="show-journals" ${showJournals ? 'checked' : ''}> Show journals</label>
      </div>
      ${filter.countryCode
        ? html`<p class="panel__filter">filter: ${filter.countryCode}
            <button type="button" data-role="clear-filter" aria-label="Clear country filter">×</button></p>`
        : ''}
      <ul class="panel__list">${mapped.map((a) => row(a))}</ul>
      ${unlocated.length
        ? html`<h3 class="panel__group">No fixed location</h3><ul class="panel__list">${unlocated.map((a) => row(a))}</ul>`
        : ''}
      ${showJournals
        ? html`<h3 class="panel__group">Journals</h3><ul class="panel__list">${filteredJournals.map((j) => row(j, 'journal'))}</ul>`
        : ''}
    </div>`;
}
