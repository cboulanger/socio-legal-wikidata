import { html, mount } from '../render.js';

/**
 * Renders the edit-mode chrome into a dedicated overlay element.
 * @param {HTMLElement} el
 * @param {{ connected: boolean, onConnect: () => void, onLeave: () => void, onAdd: () => void }} opts
 */
export function renderEditChrome(el, opts) {
  mount(el, html`
    <div class="editbar">
      <span class="editbar__badge">Edit mode</span>
      ${opts.connected
        ? html`<button type="button" data-role="add">Add association</button>
               <button type="button" data-role="leave">Leave edit mode</button>`
        : html`<button type="button" data-role="connect">Connect a Wikimedia account</button>`}
    </div>`);
  el.onclick = (e) => {
    if (e.target.closest('[data-role="connect"]')) opts.onConnect();
    else if (e.target.closest('[data-role="leave"]')) opts.onLeave();
    else if (e.target.closest('[data-role="add"]')) opts.onAdd();
  };
}
