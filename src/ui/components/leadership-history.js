import { html, mount } from '../../render.js';

/** Session-only cache, keyed by association qid. */
const cache = new Map();

/** Clear the cached result for one association (called after a manage-leadership save). */
export function clearLeadershipHistoryCache(qid) {
  cache.delete(qid);
}

/**
 * Wire the lazy "Leadership history" `<details>` already rendered by `association-card.js`.
 * No-ops if that element, or `opts.getHistory`, is not present (e.g. read-only mode).
 * @param {HTMLElement} host
 * @param {{qid: string, getHistory?: (qid: string) => Promise<{history: any[], current: any|null}>}} opts
 */
export function mountLeadershipHistory(host, { qid, getHistory }) {
  const details = host.querySelector('details.card__history');
  if (!details || !getHistory) return;
  const body = details.querySelector('[data-role="leadership-history-body"]');
  let opened = false;

  const renderRows = (rows) => mount(body, rows.length
    ? html`<ul>${rows.map((r) => html`<li>${r.officeLabel}: ${r.personLabel}, ${r.begin || '?'} – ${r.end || 'present'}</li>`)}</ul>`
    : html`<p>No leadership history recorded.</p>`);

  details.addEventListener('toggle', () => {
    if (!details.open || opened) return;
    opened = true;
    if (cache.has(qid)) { renderRows(cache.get(qid).history); return; }
    mount(body, html`<p>Loading…</p>`);
    getHistory(qid).then((result) => {
      cache.set(qid, result);
      renderRows(result.history);
    }).catch(() => {
      opened = false; // allow a retry on the next open
      mount(body, html`<p>Could not load leadership history.</p>`);
    });
  });
}
