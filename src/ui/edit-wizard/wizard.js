import { html, mount, safeHref } from '../../render.js';
import { emptyDraft } from '../../core/draft.js';
import { buildChangeSet } from '../../core/changeset.js';
import { STEP_ORDER, validateStep } from './steps.js';

const DRAFT_KEY = 'slw:wizard:draft';

/**
 * @param {HTMLElement} host
 * @param {{
 *   window: Window,
 *   config: any,
 *   ports: { search: import('../../ports/index.js').SearchPort, write: import('../../ports/index.js').WritePort },
 *   seed: { mode: import('../../core/draft.js').DirectoryDraft['mode'], association?: any },
 *   onClose?: () => void,
 * }} opts
 */
export function createWizard(host, opts) {
  const { window: win, config, ports } = opts;
  const steps = STEP_ORDER[opts.seed.mode];
  let index = 0;

  let draft = restore() || seedDraft();
  function seedDraft() {
    const d = emptyDraft(opts.seed.mode);
    d.association.classQid ||= config.inScopeClassQid || null;
    d.association.fieldQid ||= config.inScopeFieldQid || null;
    if (opts.seed.association) Object.assign(d.association, opts.seed.association);
    return d;
  }
  function restore() {
    try {
      const raw = win.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved.mode !== opts.seed.mode) return null;
      if (opts.seed.association?.qid && saved.association?.qid !== opts.seed.association.qid) return null;
      return saved;
    } catch { return null; }
  }
  function persist() {
    try { win.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }
  function clearPersisted() {
    try { win.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  function currentStep() { return steps[index]; }

  function render(extra = '') {
    const errs = validateStep(currentStep(), draft);
    mount(host, html`
      <section class="wizard" aria-label="Edit ${opts.seed.mode}">
        <header class="wizard__head">
          <strong>${title(opts.seed.mode)}</strong>
          <button type="button" data-role="close" aria-label="Close">×</button>
        </header>
        <ol class="wizard__steps">
          ${steps.map((s, i) => html`<li aria-current="${i === index}">${i + 1} ${s}</li>`)}
        </ol>
        <div class="wizard__body" data-step="${currentStep()}">
          <p class="wizard__hint">Fill the fields for “${currentStep()}”. (Field widgets are wired in app.js / manual QA.)</p>
          ${errs.length ? html`<ul class="wizard__errors">${errs.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
        </div>
        <footer class="wizard__foot">
          ${index > 0 ? html`<button type="button" data-role="back">Back</button>` : ''}
          ${index < steps.length - 1
            ? html`<button type="button" data-role="next" ${errs.length ? 'disabled' : ''}>Next</button>`
            : html`<button type="button" data-role="submit" ${errs.length ? 'disabled' : ''}>Confirm</button>`}
        </footer>
        ${extra}
      </section>`);
  }

  host.addEventListener('click', async (e) => {
    if (e.target.closest('[data-role="back"]')) { index = Math.max(0, index - 1); render(); }
    else if (e.target.closest('[data-role="next"]')) {
      if (validateStep(currentStep(), draft).length === 0) { index = Math.min(steps.length - 1, index + 1); render(); }
    }
    else if (e.target.closest('[data-role="submit"]')) {
      try { await submitInternal(); } catch (err) { render(html`<p class="wizard__fail">${err.message}</p>
        <button type="button" data-role="retry">Retry</button>`); }
    }
    else if (e.target.closest('[data-role="close"]')) { opts.onClose?.(); }
  });

  async function submitInternal() {
    for (const s of steps.slice(0, -1)) {
      const errs = validateStep(s, draft);
      if (errs.length) throw new Error(errs[0]);
    }
    const changeSet = buildChangeSet(draft, config);
    const result = await ports.write.applyChangeSet(changeSet, null);
    clearPersisted();
    render(html`
      <div class="wizard__done">
        <h3>Success</h3>
        <ul>${(result.diffUrls || []).map((u) => html`<li><a href="${safeHref(u)}" target="_blank" rel="noopener">${u}</a></li>`)}</ul>
        ${result.handoffUrl ? html`<p><a href="${safeHref(result.handoffUrl)}" target="_blank" rel="noopener">Finish in QuickStatements</a></p>` : ''}
        <button type="button" data-role="close">Done</button>
      </div>`);
    return result;
  }

  render();

  return {
    getDraft: () => draft,
    _setDraft(mutator) { mutator(draft); persist(); render(); },
    async submit() { return submitInternal(); },
    destroy() { host.innerHTML = ''; },
  };
}

function title(mode) {
  return { 'create-association': 'Add association', 'change-president': 'Record new president', 'update-field': 'Update details' }[mode];
}
