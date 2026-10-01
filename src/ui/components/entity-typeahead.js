import { html, mount } from '../../render.js';
import { rankCandidates } from '../../core/dedupe.js';

/** "b. 1975 · historian · sociology of law" from whichever parts a candidate carries; '' if none. */
function personDetail(c) {
  const parts = [];
  if (c.birthYear) parts.push(`b. ${c.birthYear}`);
  if (c.occupationLabels?.length) parts.push(c.occupationLabels.join(', '));
  if (c.fieldLabels?.length) parts.push(c.fieldLabels.join(', '));
  return parts.join(' · ');
}

/**
 * Search-first entity picker. Renders into `el`.
 *
 * When `existing` is given (a value already on the draft, e.g. loaded from Wikidata or picked
 * earlier in this session), the picker starts by showing it as a "chosen" line instead of the
 * search box. Clicking "change" opens the search box WITHOUT touching the draft — the caller's
 * `onPick`/`onCreate` is only invoked once a replacement is actually confirmed, so pressing
 * Escape (or clicking "cancel") simply closes the search box again and the original value is
 * still there, never having been cleared. Removing the value entirely (when `onClear` is given)
 * is a separate, explicit "remove" action that asks for confirmation first, since that is the
 * only path that actually discards it.
 *
 * @param {HTMLElement} el
 * @param {{
 *   label: string,
 *   searchEntities: (text: string, type?: string) => Promise<import('../../ports/index.js').EntityCandidate[]>,
 *   onPick: (candidate: import('../../ports/index.js').EntityCandidate) => void,
 *   onCreate?: (name: string) => void,
 *   allowCreate?: boolean,
 *   badge?: (candidate: import('../../ports/index.js').EntityCandidate) => string,  // short note shown next to a match
 *   alwaysOfferCreate?: boolean,  // also offer "create new" while matches are showing (duplicate check)
 *   existing?: {qid: string, label: string}|null,  // a value already chosen; shown instead of the search box
 *   chosenLabel?: string,         // prefix for the "chosen" line, e.g. "Country" (defaults to `label`)
 *   onClear?: () => void,         // remove `existing` entirely, after the user confirms
 *   onCancelEditing?: () => void, // Escape pressed with nothing to fall back to (no `existing`) — let the host collapse its own alternate UI (e.g. a <select>)
 * }} opts
 */
export function createTypeahead(el, opts) {
  const state = {
    query: '', candidates: [], showCreate: false,
    chosen: opts.existing || null,
    editing: !opts.existing,
  };
  let searchSeq = 0;

  const confirmRemove = () => {
    const win = el.ownerDocument?.defaultView || globalThis;
    return win.confirm(`Remove “${state.chosen.label}”?`);
  };

  function render() {
    if (state.chosen && !state.editing) {
      mount(el, html`
        <div class="typeahead" data-label="${opts.label}">
          <p class="typeahead__chosen">${opts.chosenLabel || opts.label}: <strong>${state.chosen.label}</strong>
            <button type="button" data-role="change">change</button>
            ${opts.onClear ? html`<button type="button" data-role="remove">remove</button>` : ''}
          </p>
        </div>`);
      return;
    }
    const ranked = rankCandidates(state.query, state.candidates).slice(0, 8);
    mount(el, html`
      <div class="typeahead" data-label="${opts.label}">
        <label>${opts.label}
          <input type="text" data-role="query" value="${state.query}" autocomplete="off">
        </label>
        ${state.chosen
          ? html`<p class="typeahead__cancel">
              <button type="button" data-role="cancel-edit">cancel</button>
              ${opts.onClear ? html`<button type="button" data-role="remove">remove</button>` : ''}
            </p>`
          : ''}
        <ul class="typeahead__list">
          ${ranked.map((c) => html`<li>
            <button type="button" data-pick="${c.qid}">
              <strong>${c.label}</strong> ${opts.badge && opts.badge(c) ? html`<em class="typeahead__badge">${opts.badge(c)}</em>` : ''}<span>${c.description}</span>${personDetail(c) ? html`<span class="typeahead__detail">${personDetail(c)}</span>` : ''}
            </button></li>`)}
        </ul>
        ${state.query && ranked.length === 0 && !opts.allowCreate
          ? html`<p class="typeahead__none">This item is not on Wikidata — it must be added there first.</p>` : ''}
        ${state.query && (ranked.length === 0 || opts.alwaysOfferCreate) && opts.allowCreate && !state.showCreate
          ? html`<button type="button" data-role="none-of-these">None of these — create new</button>` : ''}
        ${state.showCreate
          ? html`<div data-role="create-form" class="typeahead__create">
              <input type="text" data-role="create-name" value="${state.query}">
              <button type="button" data-role="create-confirm">Create “${state.query}”</button>
            </div>` : ''}
      </div>`);
  }

  async function doSearch(text) {
    state.query = text;
    state.showCreate = false;
    const seq = ++searchSeq;
    const results = text.trim().length >= 2 ? await opts.searchEntities(text, 'item') : [];
    if (seq !== searchSeq) return; // a newer search started while this one was in flight; discard
    state.candidates = results;
    render();
  }

  /** Close the search box without touching the draft: the original value (if any) is untouched. */
  function cancelEditing() {
    if (state.chosen) {
      state.editing = false; state.query = ''; state.candidates = []; state.showCreate = false;
      render();
    } else {
      opts.onCancelEditing?.();
    }
  }

  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-role="query"]')) doSearch(e.target.value);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.editing) { e.preventDefault(); cancelEditing(); }
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-role="change"]')) {
      state.editing = true;
      render();
      el.querySelector('[data-role="query"]')?.focus();
      return;
    }
    if (e.target.closest('[data-role="cancel-edit"]')) { cancelEditing(); return; }
    if (e.target.closest('[data-role="remove"]')) {
      if (!confirmRemove()) return;
      state.chosen = null; state.editing = true; state.query = ''; state.candidates = []; state.showCreate = false;
      render();
      opts.onClear();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const picked = state.candidates.find((c) => c.qid === pick.dataset.pick) || null;
      if (picked) {
        state.chosen = picked; state.editing = false;
        render();
        opts.onPick(picked);
      }
      return;
    }
    if (e.target.closest('[data-role="none-of-these"]')) { state.showCreate = true; render(); return; }
    if (e.target.closest('[data-role="create-confirm"]')) {
      const name = el.querySelector('[data-role="create-name"]').value.trim();
      if (name && opts.onCreate) opts.onCreate(name);
    }
  });

  render();
  return {
    getState: () => ({ ...state }),
    /** test helper: simulate typing */
    async _typeForTest(text) { await doSearch(text); },
  };
}
