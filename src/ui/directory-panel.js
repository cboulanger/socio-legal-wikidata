import { html } from '../render.js';
import { deriveScope } from '../core/model.js';
import { filterAssociations, partitionByLocation } from '../core/filter.js';
import { renderAssociationCard } from './association-card.js';

/**
 * @param {{
 *   associations: import('../core/model.js').Association[],
 *   filter: {countryCode?: string, text?: string},
 *   selection: string|null,
 *   centroids: Object<string, [number,number]>,
 *   stale: boolean,
 *   asOf?: string|null,
 *   editMode?: boolean,
 * }} state
 * @returns {import('../render.js').Trusted}
 */
export function renderPanel(state) {
  const { associations, filter, selection, centroids, stale, asOf, editMode = false } = state;
  const filtered = filterAssociations(associations, filter);
  const { mapped, unlocated } = partitionByLocation(filtered, centroids);
  const selected = selection ? associations.find((a) => a.qid === selection) : null;

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
      </label>
      ${filter.countryCode
        ? html`<p class="panel__filter">filter: ${filter.countryCode}
            <button type="button" data-role="clear-filter" aria-label="Clear country filter">×</button></p>`
        : ''}
      ${selected ? renderAssociationCard(selected, { editMode }) : ''}
      <ul class="panel__list">${mapped.map(row)}</ul>
      ${unlocated.length
        ? html`<h3 class="panel__group">No fixed location</h3><ul class="panel__list">${unlocated.map(row)}</ul>`
        : ''}
    </div>`;
}
