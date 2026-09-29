import { html, mount, safeHref } from '../../render.js';
import { emptyDraft, originalFromEntity } from '../../core/draft.js';
import { buildChangeSet, describeChanges } from '../../core/changeset.js';
import { initialLanguages, languageSuggestions, isValidLangCode } from '../../core/languages.js';
import { createTypeahead } from '../components/entity-typeahead.js';
import { STEP_ORDER, validateStep } from './steps.js';
import { renderDetailsForm, refreshDetailsDerived, applyFieldInput } from './details-form.js';

const DRAFT_KEY = 'slw:wizard:draft';

/**
 * @param {HTMLElement} host
 * @param {{
 *   window: Window,
 *   config: any,
 *   ports: { search: import('../../ports/index.js').SearchPort, write: import('../../ports/index.js').WritePort },
 *   seed: { mode: import('../../core/draft.js').DirectoryDraft['mode'], association?: {qid?: string, label?: string} },
 *   onClose?: () => void,
 *   isInDirectory?: (qid: string) => boolean,   // is this item already in the on-screen directory?
 *   onSaved?: (result: import('../../ports/index.js').WriteResult, draft: import('../../core/draft.js').DirectoryDraft) => void,
 * }} opts
 */
export function createWizard(host, opts) {
  const { window: win, config, ports } = opts;
  let mode = opts.seed.mode;
  let steps = STEP_ORDER[mode];
  let index = 0;
  let displayName = opts.seed.association?.label || '';

  // transient UI state (not persisted)
  let loading = false;
  let loadError = '';
  let langError = '';
  let failure = '';
  let done = null;
  let official = [];   // Wikimedia codes of the country's official languages
  let langs = [];      // language rows shown in the details step
  let nameSeeded = false;
  let arrivedFromSearch = false; // switched from "Add association" after the user found an existing match

  const restoredDraft = restore();
  let draft = restoredDraft || seedDraft(mode, opts.seed.association);

  function seedDraft(m, association) {
    const d = emptyDraft(m);
    d.association.classQid ||= config.inScopeClassQid || null;
    d.association.fieldQid ||= config.inScopeFieldQid || null;
    if (association?.qid) d.association.qid = association.qid;
    return d;
  }
  function restore() {
    try {
      const raw = win.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved.mode !== opts.seed.mode) return null;
      if (opts.seed.association?.qid && saved.association?.qid !== opts.seed.association.qid) return null;
      if (!saved.association?.labels) return null; // a draft from before multilingual support
      saved.association.formerNames ||= [];
      saved.association.original ||= {};
      saved.association.original.aliases ||= {};
      saved.association.original.formerNames ||= [];
      return saved;
    } catch { return null; }
  }
  function persist() {
    try { win.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }
  function clearPersisted() {
    try { win.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  const currentStep = () => steps[index];

  // ---- data loading -------------------------------------------------------

  async function loadOfficial(countryQid) {
    official = countryQid && ports.search?.getOfficialLanguageCodes
      ? await ports.search.getOfficialLanguageCodes(countryQid)
      : [];
  }

  /** Edit mode: fetch the item fresh so the form starts from what is on Wikidata. */
  async function loadOriginal() {
    loading = true;
    loadError = '';
    render();
    try {
      const entity = await ports.search.getEntity(draft.association.qid);
      if (!entity) throw new Error(`${draft.association.qid} was not found on Wikidata`);
      const o = originalFromEntity(entity);
      const a = draft.association;
      const classes = new Set([config.inScopeClassQid, ...(config.inScopeClassQids || [])].filter(Boolean));
      const needsClass = !!config.inScopeClassQid && !o.classQids.some((q) => classes.has(q));
      const needsField = !!config.inScopeFieldQid && !o.fieldQids.includes(config.inScopeFieldQid);
      a.original = {
        labels: { ...o.labels }, descriptions: { ...o.descriptions }, aliases: o.aliases, formerNames: o.formerNames,
        website: o.website, email: o.email, needsClass, needsField,
      };
      // someone who searched for this association to add it most likely wants it in the directory
      a.addToDirectory = arrivedFromSearch && (needsClass || needsField);
      a.labels = { ...o.labels };
      a.descriptions = { ...o.descriptions };
      a.website = o.website;
      a.email = o.email;
      a.countryQid = o.countryQid;
      displayName = o.labels.en || Object.values(o.labels)[0] || displayName;
      await loadOfficial(o.countryQid);
      persist();
    } catch (err) {
      loadError = `Could not load the item from Wikidata: ${err.message}`;
    }
    loading = false;
    render();
  }

  /** Make sure the details step has its language rows (national, English, existing, chosen). */
  function ensureLangs() {
    const a = draft.association;
    const existing = [...Object.keys(a.labels), ...Object.keys(a.descriptions)];
    for (const c of initialLanguages({ official, existing })) if (!langs.includes(c)) langs.push(c);
    // the name typed in the "identify" step goes into the first row once
    if (a.identifyName && !nameSeeded && !Object.values(a.labels).some((v) => v && v.trim())) {
      a.labels[langs[0]] = a.identifyName;
    }
    nameSeeded = true;
  }

  // ---- rendering ----------------------------------------------------------

  function chosen(text, role) {
    return html`<p class="wizard__chosen">${text} <button type="button" data-role="${role}">change</button></p>`;
  }

  function stepBody() {
    const step = currentStep();
    const a = draft.association;
    if (loading) return html`<p class="wizard__hint">Loading from Wikidata…</p>`;
    if (loadError) {
      return html`<p class="wizard__fail">${loadError}</p><button type="button" data-role="retry-load">Retry</button>`;
    }
    if (step === 'identify' && mode === 'create-association') {
      return a.identifyName
        ? html`${chosen(html`New association: <strong>${a.identifyName}</strong>`, 'clear-name')}`
        : html`<p class="wizard__hint">Search first, so the association is not added twice. Pick a match to edit it instead.</p>
               <div data-role="ta-identify"></div>`;
    }
    if (step === 'place') {
      return html`
        ${a.countryQid ? chosen(html`Country: <strong>${a.countryLabel || a.countryQid}</strong>`, 'clear-country')
          : html`<div data-role="ta-country"></div>`}
        ${a.seatQid ? chosen(html`Seat: <strong>${a.seatLabel || a.seatQid}</strong>`, 'clear-seat')
          : html`<div data-role="ta-seat"></div>`}`;
    }
    if (step === 'details') {
      return renderDetailsForm({
        draft, langs, langError,
        suggestions: languageSuggestions({ official, shown: langs }),
        labelLanguages: config.labelLanguages || '',
      });
    }
    if (step === 'review') {
      const lines = describeChanges(draft);
      return html`<p class="wizard__hint">This will be written to Wikidata:</p>
        <ul class="wizard__review">${lines.map((l) => html`<li>${l}</li>`)}</ul>
        ${failure ? html`<p class="wizard__fail">${failure}</p>` : ''}`;
    }
    return html`<p class="wizard__hint">Fill the fields for “${step}”.</p>`;
  }

  function render() {
    if (done) {
      mount(host, html`
        <section class="wizard" aria-label="Saved">
          <header class="wizard__head"><strong>${title(mode)}</strong>
            <button type="button" data-role="close" aria-label="Close">×</button></header>
          <div class="wizard__done">
            <h3>Success</h3>
            <ul>${(done.diffUrls || []).map((u) => html`<li><a href="${safeHref(u)}" target="_blank" rel="noopener">${u}</a></li>`)}</ul>
            ${done.handoffUrl ? html`<p><a href="${safeHref(done.handoffUrl)}" target="_blank" rel="noopener">Finish in QuickStatements</a></p>` : ''}
            <button type="button" data-role="close">Done</button>
          </div>
        </section>`);
      return;
    }
    if (currentStep() === 'details' && !loading && !loadError) ensureLangs();
    const errs = loading || loadError ? [] : validateStep(currentStep(), draft);
    const isLast = index === steps.length - 1;
    mount(host, html`
      <section class="wizard" aria-label="Edit ${mode}">
        <header class="wizard__head">
          <strong>${title(mode)}</strong>
          <button type="button" data-role="close" aria-label="Close">×</button>
        </header>
        ${displayName ? html`<p class="wizard__subject">${displayName}</p>` : ''}
        <ol class="wizard__steps">
          ${steps.map((s, i) => html`<li aria-current="${i === index}">${i + 1} ${s}</li>`)}
        </ol>
        <div class="wizard__body" data-step="${currentStep()}">
          ${stepBody()}
          <div data-role="errors">${errorList(errs)}</div>
        </div>
        <footer class="wizard__foot">
          ${index > 0 ? html`<button type="button" data-role="back">Back</button>` : ''}
          ${!isLast
            ? html`<button type="button" data-role="next" ${errs.length || loading || loadError ? 'disabled' : ''}>Next</button>`
            : html`<button type="button" data-role="submit" ${errs.length || loading || loadError ? 'disabled' : ''}>Confirm</button>`}
        </footer>
      </section>`);
    mountPickers();
  }

  /**
   * After a keystroke only the parts that depend on the values change: the error list, the
   * Next/Confirm buttons and the derived bits of the details form. The inputs are left alone,
   * so focus, caret, IME composition and undo history survive. Structural changes (adding a
   * language, changing step, picking from a list) still go through render().
   */
  function refreshDerived() {
    const errs = loading || loadError ? [] : validateStep(currentStep(), draft);
    const errBox = host.querySelector('[data-role="errors"]');
    if (errBox) errBox.innerHTML = String(errorList(errs)); // '' when valid, so not `.value`
    for (const btn of host.querySelectorAll('[data-role="next"], [data-role="submit"]')) {
      btn.disabled = errs.length > 0 || loading || !!loadError;
    }
    if (currentStep() === 'details') refreshDetailsDerived(host, draft, config.labelLanguages || '');
  }

  /** Search pickers are self-contained widgets mounted into placeholders after each render. */
  function mountPickers() {
    const search = (text) => ports.search.searchEntities(text, 'item');
    const a = draft.association;
    const identify = host.querySelector('[data-role="ta-identify"]');
    if (identify) {
      createTypeahead(identify, {
        label: 'Association name',
        searchEntities: search,
        badge: opts.isInDirectory ? (c) => (opts.isInDirectory(c.qid) ? '✓ in directory' : 'not in directory yet') : undefined,
        allowCreate: true,
        alwaysOfferCreate: true,
        onPick: (c) => switchToEdit(c),
        onCreate: (name) => { a.identifyName = name; persist(); render(); },
      });
    }
    const country = host.querySelector('[data-role="ta-country"]');
    if (country) {
      createTypeahead(country, {
        label: 'Country',
        searchEntities: (text) => (ports.search.searchCountries ? ports.search.searchCountries(text) : search(text)),
        onPick: async (c) => {
          a.countryQid = c.qid; a.countryLabel = c.label;
          persist();
          await loadOfficial(c.qid);
          render();
        },
      });
    }
    const seat = host.querySelector('[data-role="ta-seat"]');
    if (seat) {
      createTypeahead(seat, {
        label: 'Seat (city), optional',
        searchEntities: search,
        onPick: (c) => { a.seatQid = c.qid; a.seatLabel = c.label; persist(); render(); },
      });
    }
  }

  /** The user found the association already on Wikidata: continue as "Edit details" for it. */
  function switchToEdit(candidate) {
    mode = 'update-field';
    steps = STEP_ORDER[mode];
    index = 0;
    langs = [];
    official = [];
    nameSeeded = false;
    arrivedFromSearch = true;
    displayName = candidate.label;
    draft = seedDraft(mode, { qid: candidate.qid });
    persist();
    return ports.search.getEntity ? loadOriginal() : render();
  }

  // ---- events (listeners are replaced when the wizard is reopened on the same host) ----

  host._wizardAbort?.abort();
  const ac = new (win.AbortController || AbortController)();
  host._wizardAbort = ac;
  const on = (type, fn) => host.addEventListener(type, fn, { signal: ac.signal });

  function addLanguage(code) {
    const c = (code || '').trim().toLowerCase();
    if (!c) { langError = 'choose a language or type a language code'; return render(); }
    if (!isValidLangCode(c)) { langError = `“${c}” is not a valid language code`; return render(); }
    langError = '';
    if (!langs.includes(c)) langs.push(c);
    render();
  }

  on('input', (e) => {
    if (e.target.closest('.typeahead')) return; // the pickers manage their own state
    if (applyFieldInput(draft, e.target)) { failure = ''; persist(); refreshDerived(); }
  });

  on('click', async (e) => {
    const t = e.target;
    const role = (r) => t.closest(`[data-role="${r}"]`);
    const a = draft.association;
    if (role('back')) { index = Math.max(0, index - 1); render(); }
    else if (role('next')) {
      if (validateStep(currentStep(), draft).length === 0) { index = Math.min(steps.length - 1, index + 1); render(); }
    }
    else if (role('submit') || role('retry')) {
      try { await submitInternal(); } catch (err) { failure = err.message; render(); }
    }
    else if (role('close')) { opts.onClose?.(); }
    else if (role('retry-load')) { loadOriginal(); }
    else if (role('clear-name')) { a.identifyName = ''; persist(); render(); }
    else if (role('clear-country')) { a.countryQid = null; a.countryLabel = null; official = []; persist(); render(); }
    else if (role('clear-seat')) { a.seatQid = null; a.seatLabel = null; persist(); render(); }
    else if (role('add-lang')) { addLanguage(role('add-lang').dataset.lang); }
    else if (role('add-former')) {
      (a.formerNames ||= []).push({ text: '', lang: langs[0] || 'en', start: '', end: '', alias: true });
      persist(); render();
    }
    else if (role('remove-former')) { (a.formerNames || []).splice(Number(role('remove-former').dataset.index), 1); persist(); render(); }
    else if (role('rename-hint')) {
      const lang = role('rename-hint').dataset.lang;
      (a.formerNames ||= []).push({ text: (a.original.labels[lang] || '').trim(), lang, start: '', end: '', alias: true });
      persist(); render();
    }
    else if (role('add-lang-go')) {
      const custom = host.querySelector('[data-role="lang-code"]')?.value;
      const picked = host.querySelector('[data-role="lang-select"]')?.value;
      addLanguage(custom?.trim() ? custom : picked);
    }
  });

  async function submitInternal() {
    failure = '';
    for (const s of steps.slice(0, -1)) {
      const errs = validateStep(s, draft);
      if (errs.length) throw new Error(errs[0]);
    }
    const changeSet = buildChangeSet(draft, config);
    const result = await ports.write.applyChangeSet(changeSet, null);
    clearPersisted();
    done = result;
    render();
    opts.onSaved?.(result, draft);
    return result;
  }

  if (mode === 'update-field' && !restoredDraft && draft.association.qid && ports.search?.getEntity) loadOriginal();
  else {
    if (draft.association.countryQid) loadOfficial(draft.association.countryQid).then(render);
    render();
  }

  return {
    getDraft: () => draft,
    _setDraft(mutator) { mutator(draft); persist(); render(); },
    async submit() { return submitInternal(); },
    destroy() { ac.abort(); host.innerHTML = ''; },
  };
}

function errorList(errs) {
  return errs.length ? html`<ul class="wizard__errors">${errs.map((e) => html`<li>${e}</li>`)}</ul>` : '';
}

function title(mode) {
  return { 'create-association': 'Add association', 'change-president': 'Record new president', 'update-field': 'Edit details' }[mode];
}
