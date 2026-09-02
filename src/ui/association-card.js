import { html, safeHref } from '../render.js';
import { deriveScope } from '../core/model.js';
import { historyFeedUrl, watchlistUrl } from './components/notify-link.js';

/**
 * @param {import('../core/model.js').Association} a
 * @param {{editMode?: boolean}} opts
 * @returns {import('../render.js').Trusted}
 */
export function renderAssociationCard(a, { editMode = false } = {}) {
  const scope = deriveScope(a);
  const place = a.seatLabel || a.countryLabel || 'no fixed location';
  return html`
    <article class="card" data-qid="${a.qid}">
      <h2 class="card__title">${a.label}</h2>
      <p class="card__meta">${scope}${a.countryLabel ? html` · ${a.countryLabel}` : ''}</p>
      ${a.parentLabel ? html`<p class="card__row">part of ${a.parentLabel}</p>` : ''}
      <p class="card__row">seat: ${place}</p>
      ${a.website ? html`<p class="card__row"><a href="${safeHref(a.website)}" rel="noopener" target="_blank">website</a></p>` : ''}
      ${a.email ? html`<p class="card__row"><a href="mailto:${a.email}">${a.email}</a></p>` : ''}
      ${a.president
        ? html`<p class="card__row">president:
            ${a.president.url
              ? html`<a href="${safeHref(a.president.url)}" rel="noopener" target="_blank">${a.president.label}</a>`
              : a.president.label}
            ${a.leadUniLabel ? html`<span class="card__sub">${a.leadUniLabel}</span>` : ''}</p>`
        : ''}
      <p class="card__row">journal:
        ${a.journal
          ? html`<a href="${safeHref(a.journal.url || '#')}" rel="noopener" target="_blank">${a.journal.label}</a>`
          : '—'}</p>
      <p class="card__actions">
        <a class="card__notify" href="${watchlistUrl(a.qid)}" rel="noopener" target="_blank"
           data-feed="${historyFeedUrl(a.qid)}">Notify me of changes</a>
        ${editMode ? html`<button type="button" data-action="edit" data-qid="${a.qid}">Edit</button>` : ''}
      </p>
    </article>`;
}
