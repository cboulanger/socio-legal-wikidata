import { html, safeHref } from '../render.js';
import { deriveScope } from '../core/model.js';
import { historyFeedUrl, watchlistUrl } from './components/notify-link.js';
import { historyUrl, revisionUrl, userUrl } from '../core/revisions.js';

/**
 * @param {import('../core/model.js').Association} a
 * @param {{editMode?: boolean, lastEdit?: import('../core/revisions.js').LastEdit|null}} opts
 * @returns {import('../render.js').Trusted}
 */
export function renderAssociationCard(a, { editMode = false, lastEdit = null } = {}) {
  const scope = deriveScope(a);
  const place = a.seatLabel || a.countryLabel || 'no fixed location';
  return html`
    <article class="card" data-qid="${a.qid}">
      <button type="button" class="card__close" data-role="close-card" aria-label="Close">×</button>
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
      ${lastEdit ? renderLastEdit(a.qid, lastEdit) : ''}
      ${editMode
        ? html`<p class="card__actions">
            <a class="card__notify" href="${watchlistUrl(a.qid)}" rel="noopener" target="_blank"
               data-feed="${historyFeedUrl(a.qid)}">Notify me of changes</a>
          </p>
          <p class="card__actions"><button type="button" data-action="edit" data-qid="${a.qid}">Edit</button></p>`
        : ''}
    </article>`;
}

/** "Last edited by <user> on <date> · history", each part linking to its Wikidata page. */
function renderLastEdit(qid, edit) {
  const who = edit.userHidden || !edit.user
    ? '(username hidden)'
    : html`<a href="${safeHref(userUrl(edit))}" rel="noopener" target="_blank">${edit.user}</a>`;
  return html`<p class="card__row card__lastedit">Last edited by ${who} on
    <a href="${safeHref(revisionUrl(qid, edit.revid))}" rel="noopener" target="_blank"
       title="${edit.comment}">${edit.timestamp.slice(0, 10)}</a>
    · <a href="${safeHref(historyUrl(qid))}" rel="noopener" target="_blank">history</a></p>`;
}
