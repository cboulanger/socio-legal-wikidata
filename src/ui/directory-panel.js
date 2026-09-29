import { html } from '../render.js';
import { deriveScope } from '../core/model.js';
import { filterAssociations, partitionByLocation } from '../core/filter.js';

/**
 * @param {{
 *   associations: import('../core/model.js').Association[],
 *   filter: {countryCode?: string, text?: string},
 *   selection: string|null,
 *   centroids: Object<string, [number,number]>,
 *   stale: boolean,
 *   asOf?: string|null,
 * }} state
 * @returns {import('../render.js').Trusted}
 */
export function renderPanel(state) {
  const { associations, filter, selection, centroids, stale, asOf } = state;
  const filtered = filterAssociations(associations, filter);
  const { mapped, unlocated } = partitionByLocation(filtered, centroids);

  const row = (a) => html`
    <li>
      <button type="button" class="row" data-qid="${a.qid}" aria-current="${a.qid === selection}">
        <span class="row__label">${a.label}</span>
        <span class="row__meta">${deriveScope(a)}${a.countryLabel ? html` · ${a.countryLabel}` : ''}</span>
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
      </div>
      ${filter.countryCode
        ? html`<p class="panel__filter">filter: ${filter.countryCode}
            <button type="button" data-role="clear-filter" aria-label="Clear country filter">×</button></p>`
        : ''}
      <ul class="panel__list">${mapped.map(row)}</ul>
      ${unlocated.length
        ? html`<h3 class="panel__group">No fixed location</h3><ul class="panel__list">${unlocated.map(row)}</ul>`
        : ''}
    </div>`;
}
