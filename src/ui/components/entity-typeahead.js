import { html, mount } from '../../render.js';
import { rankCandidates } from '../../core/dedupe.js';

/**
 * Search-first entity picker. Renders into `el`.
 * @param {HTMLElement} el
 * @param {{
 *   label: string,
 *   searchEntities: (text: string, type?: string) => Promise<import('../../ports/index.js').EntityCandidate[]>,
 *   onPick: (candidate: import('../../ports/index.js').EntityCandidate) => void,
 *   onCreate?: (name: string) => void,
 *   allowCreate?: boolean,
 * }} opts
 */
export function createTypeahead(el, opts) {
  const state = { query: '', candidates: [], showCreate: false, chosen: null };
  let searchSeq = 0;

  function render() {
    const ranked = rankCandidates(state.query, state.candidates).slice(0, 8);
    mount(el, html`
      <div class="typeahead" data-label="${opts.label}">
        <label>${opts.label}
          <input type="text" data-role="query" value="${state.query}" autocomplete="off">
        </label>
        ${state.chosen
          ? html`<p class="typeahead__chosen">Selected: ${state.chosen.label}
              <button type="button" data-role="clear">change</button></p>`
          : html`
            <ul class="typeahead__list">
              ${ranked.map((c) => html`<li>
                <button type="button" data-pick="${c.qid}">
                  <strong>${c.label}</strong> <span>${c.description}</span>
                </button></li>`)}
            </ul>
            ${state.query && ranked.length === 0 && !opts.allowCreate
              ? html`<p class="typeahead__none">This item is not on Wikidata — it must be added there first.</p>` : ''}
            ${state.query && ranked.length === 0 && opts.allowCreate && !state.showCreate
              ? html`<button type="button" data-role="none-of-these">None of these — create new</button>` : ''}
            ${state.showCreate
              ? html`<div data-role="create-form" class="typeahead__create">
                  <input type="text" data-role="create-name" value="${state.query}">
                  <button type="button" data-role="create-confirm">Create “${state.query}”</button>
                </div>` : ''}`}
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

  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-role="query"]')) doSearch(e.target.value);
  });
  el.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      state.chosen = state.candidates.find((c) => c.qid === pick.dataset.pick) || null;
      render();
      if (state.chosen) opts.onPick(state.chosen);
      return;
    }
    if (e.target.closest('[data-role="clear"]')) { state.chosen = null; render(); return; }
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
