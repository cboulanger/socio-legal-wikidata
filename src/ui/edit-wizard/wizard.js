import { html, mount, safeHref } from '../../render.js';
import { emptyDraft, originalFromEntity, emptyOfficerRow, emptyJournalEntity, emptyEditorRow } from '../../core/draft.js';
import { buildChangeSet, describeChanges } from '../../core/changeset.js';
import { initialLanguages, languageSuggestions, isValidLangCode } from '../../core/languages.js';
import { createTypeahead } from '../components/entity-typeahead.js';
import { STEP_ORDER, validateStep } from './steps.js';
import { renderDetailsForm, refreshDetailsDerived, applyFieldInput } from './details-form.js';
import { renderLeadershipForm, applyLeadershipFieldInput } from './leadership-form.js';
import { renderJournalForm, refreshJournalFormDerived, applyJournalFieldInput } from './journal-form.js';
import { renderEditorForm, applyEditorFieldInput } from './editor-form.js';

const DRAFT_KEY = 'slw:wizard:draft';
const JOURNAL_MODES = ['create-journal', 'update-journal', 'manage-journal-editors'];
const isJournalDetailsMode = (m) => m === 'create-journal' || m === 'update-journal';

/**
 * @param {HTMLElement} host
 * @param {{
 *   window: Window,
 *   config: any,
 *   ports: { search: import('../../ports/index.js').SearchPort, write: import('../../ports/index.js').WritePort },
 *   seed: { mode: import('../../core/draft.js').DirectoryDraft['mode'], association?: {qid?: string, label?: string}, journal?: {qid?: string, label?: string, publisherQid?: string, publisherLabel?: string} },
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
  let displayName = opts.seed.association?.label || opts.seed.journal?.label || '';

  // transient UI state (not persisted)
  let loading = false;
  let loadError = '';
  let langError = '';
  let failure = '';
  let done = null;
  let official = [];   // Wikimedia codes of the country's official languages
  let langs = [];      // language rows shown in the details step
  let nameSeeded = false;
  let arrivedFromSearch = false; // switched to editing an existing match after a search

  const restoredDraft = restore();
  let draft = restoredDraft || seedDraft(mode, opts.seed);

  function seedDraft(m, seed) {
    const d = emptyDraft(m);
    d.association.classQid ||= config.inScopeClassQid || null;
    d.association.fieldQid ||= config.inScopeFieldQid || null;
    if (seed?.association?.qid) d.association.qid = seed.association.qid;
    if (JOURNAL_MODES.includes(m)) {
      d.journalEntity = emptyJournalEntity(seed?.journal?.qid || null);
      if (seed?.journal?.publisherQid) {
        d.journalEntity.publisherQid = seed.journal.publisherQid;
        d.journalEntity.publisherLabel = seed.journal.publisherLabel || null;
      }
    }
    return d;
  }
  function restore() {
    try {
      const raw = win.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved.mode !== opts.seed.mode) return null;
      if (opts.seed.association?.qid && saved.association?.qid !== opts.seed.association.qid) return null;
      if (opts.seed.journal?.qid && saved.journalEntity?.qid !== opts.seed.journal.qid) return null;
      if (!saved.association?.labels) return null; // a draft from before multilingual support
      if (saved.mode === 'manage-leadership' && !Array.isArray(saved.officers)) return null;
      if (saved.mode === 'manage-journal-editors' && !Array.isArray(saved.editors)) return null;
      if (JOURNAL_MODES.includes(saved.mode) && !saved.journalEntity) return null;
      saved.association.formerNames ||= [];
      saved.association.abbreviations ||= {};
      saved.association.original ||= {};
      saved.association.original.aliases ||= {};
      saved.association.original.formerNames ||= [];
      saved.association.original.abbreviations ||= {};
      saved.editors ||= [];
      if (saved.journalEntity) saved.journalEntity.original ||= {};
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
        labels: { ...o.labels }, descriptions: { ...o.descriptions }, aliases: o.aliases, abbreviations: o.abbreviations, formerNames: o.formerNames,
        website: o.website, email: o.email, inception: o.inception, closed: o.closed, parentQid: o.parentQid, operatingAreaQid: o.operatingAreaQid, needsClass, needsField,
      };
      a.parentQid = o.parentQid;
      a.parentLabel = o.parentQid ? await labelOf(o.parentQid) : null;
      a.operatingAreaQid = o.operatingAreaQid;
      a.operatingAreaLabel = o.operatingAreaQid ? await labelOf(o.operatingAreaQid) : null;
      // someone who searched for this association to add it most likely wants it in the directory
      a.addToDirectory = arrivedFromSearch && (needsClass || needsField);
      a.labels = { ...o.labels };
      a.descriptions = { ...o.descriptions };
      a.abbreviations = Object.fromEntries(Object.entries(o.abbreviations).map(([lang, list]) => [lang, list[0]]));
      a.website = o.website;
      a.email = o.email;
      a.inception = o.inception;
      a.closed = o.closed;
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

  /** manage-leadership: fetch existing leadership and seed one blank row. */
  async function loadLeadershipOriginal() {
    loading = true;
    loadError = '';
    render();
    try {
      draft.leadershipOriginal = ports.search.getLeadershipHistory
        ? await ports.search.getLeadershipHistory(draft.association.qid)
        : { history: [], current: null };
      if (draft.officers.length === 0) {
        const first = config.officeTypes?.[0];
        draft.officers.push(emptyOfficerRow(first?.qid || '', first?.label || ''));
      }
      persist();
    } catch (err) {
      loadError = `Could not load leadership from Wikidata: ${err.message}`;
    }
    loading = false;
    render();
  }

  /** update-journal: fetch the journal fresh so the form starts from what is on Wikidata. */
  async function loadJournalOriginal() {
    loading = true;
    loadError = '';
    render();
    try {
      const details = await ports.search.getJournalDetails(draft.journalEntity.qid);
      if (!details) throw new Error(`${draft.journalEntity.qid} was not found on Wikidata`);
      const needsClass = !!config.academicJournalQid && !details.classQids.includes(config.academicJournalQid);
      const needsField = !!config.inScopeFieldQid && !details.fieldQids.includes(config.inScopeFieldQid);
      const j = draft.journalEntity;
      j.original = {
        labels: { ...details.labels }, descriptions: { ...details.descriptions },
        website: details.website, websiteAsOf: details.websiteAsOf, issn: details.issn,
        founded: details.founded, closed: details.closed, openAlexId: details.openAlexId,
        publisherQid: details.publisherQid, needsClass, needsField,
      };
      j.labels = { ...details.labels };
      j.descriptions = { ...details.descriptions };
      j.website = details.website;
      j.issn = details.issn;
      j.founded = details.founded;
      j.closed = details.closed;
      j.openAlexId = details.openAlexId;
      if (!j.publisherQid) { j.publisherQid = details.publisherQid; j.publisherLabel = details.publisherLabel; }
      j.addToDirectory = arrivedFromSearch && (needsClass || needsField);
      displayName = details.labels.en || Object.values(details.labels)[0] || displayName;
      persist();
    } catch (err) {
      loadError = `Could not load the journal from Wikidata: ${err.message}`;
    }
    loading = false;
    render();
  }

  /** manage-journal-editors: fetch existing editors and seed one blank row. */
  async function loadEditorsOriginal() {
    loading = true;
    loadError = '';
    render();
    try {
      draft.editorsOriginal = ports.search.getJournalEditorHistory
        ? await ports.search.getJournalEditorHistory(draft.journalEntity.qid)
        : { history: [] };
      if (draft.editors.length === 0) {
        const first = config.journalEditorRoles?.[0];
        draft.editors.push(emptyEditorRow(first?.qid || '', first?.label || ''));
      }
      persist();
    } catch (err) {
      loadError = `Could not load editors from Wikidata: ${err.message}`;
    }
    loading = false;
    render();
  }

  /** Best-effort display label of an item; falls back to the bare id. */
  async function labelOf(qid) {
    try {
      const labels = (await ports.search.getEntity(qid))?.labels || {};
      return (labels.en || Object.values(labels)[0])?.value || qid;
    } catch { return qid; }
  }

  /** Make sure the details step has its language rows (national, English, existing, chosen). */
  function ensureLangs() {
    const e = isJournalDetailsMode(mode) ? draft.journalEntity : draft.association;
    const existing = [...Object.keys(e.labels), ...Object.keys(e.descriptions), ...Object.keys(e.abbreviations || {})];
    for (const c of initialLanguages({ official, existing })) if (!langs.includes(c)) langs.push(c);
    // the name typed in the "identify" step goes into the first row once
    if (e.identifyName && !nameSeeded && !Object.values(e.labels).some((v) => v && v.trim())) {
      e.labels[langs[0]] = e.identifyName;
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
    if (step === 'identify' && mode === 'create-journal') {
      const j = draft.journalEntity;
      return j.identifyName
        ? html`${chosen(html`New journal: <strong>${j.identifyName}</strong>`, 'clear-journal-name')}`
        : html`<p class="wizard__hint">Search first, so the journal is not added twice. Pick a match to edit it instead.</p>
               <div data-role="ta-identify"></div>`;
    }
    if (step === 'place') {
      return html`
        <div data-role="ta-country"></div>
        <div data-role="ta-seat"></div>`;
    }
    if (step === 'details') {
      if (isJournalDetailsMode(mode)) {
        return renderJournalForm({
          draft, langs, langError, config,
          suggestions: languageSuggestions({ official, shown: langs }),
        });
      }
      return renderDetailsForm({
        draft, langs, langError,
        suggestions: languageSuggestions({ official, shown: langs }),
        labelLanguages: config.labelLanguages || '',
      });
    }
    if (step === 'officers') {
      return renderLeadershipForm({ draft, config });
    }
    if (step === 'editors') {
      return renderEditorForm({ draft, config });
    }
    if (step === 'review') {
      const lines = describeChanges(draft);
      return html`<p class="wizard__hint">This will be written to Wikidata:</p>
        <ul class="wizard__review">${lines.map((l) => html`<li>${l}</li>`)}</ul>
        ${failure ? html`<p class="wizard__fail">${failure}</p>` : ''}
        ${failure && (draft.mode === 'manage-leadership' || draft.mode === 'manage-journal-editors')
          ? html`<p class="wizard__fail">Check the item on Wikidata before retrying — some rows may already be saved.</p>`
          : ''}`;
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
    if (currentStep() === 'details') {
      if (isJournalDetailsMode(mode)) refreshJournalFormDerived(host, draft);
      else refreshDetailsDerived(host, draft, config.labelLanguages || '');
    }
  }

  /** Search pickers are self-contained widgets mounted into placeholders after each render. */
  function mountPickers() {
    mountParentPicker();
    mountAreaPicker();
    mountLeadershipPickers();
    mountPublisherPicker();
    mountEditorPickers();
    const search = (text) => ports.search.searchEntities(text, 'item');
    const a = draft.association;
    const identify = host.querySelector('[data-role="ta-identify"]');
    if (identify) {
      if (mode === 'create-journal') {
        createTypeahead(identify, {
          label: 'Journal title',
          searchEntities: search,
          allowCreate: true,
          alwaysOfferCreate: true,
          onPick: (c) => switchToEdit(c, 'journal'),
          onCreate: (name) => { draft.journalEntity.identifyName = name; persist(); render(); },
        });
      } else {
        createTypeahead(identify, {
          label: 'Association name',
          searchEntities: search,
          badge: opts.isInDirectory ? (c) => (opts.isInDirectory(c.qid) ? '✓ in directory' : 'not in directory yet') : undefined,
          allowCreate: true,
          alwaysOfferCreate: true,
          onPick: (c) => switchToEdit(c, 'association'),
          onCreate: (name) => { a.identifyName = name; persist(); render(); },
        });
      }
    }
    const country = host.querySelector('[data-role="ta-country"]');
    if (country) {
      createTypeahead(country, {
        label: 'Country', chosenLabel: 'Country',
        searchEntities: (text) => (ports.search.searchCountries ? ports.search.searchCountries(text) : search(text)),
        existing: a.countryQid ? { qid: a.countryQid, label: a.countryLabel || a.countryQid } : null,
        onPick: async (c) => {
          a.countryQid = c.qid; a.countryLabel = c.label;
          persist();
          await loadOfficial(c.qid);
          render();
        },
        onClear: () => { a.countryQid = null; a.countryLabel = null; official = []; persist(); render(); },
      });
    }
    const seat = host.querySelector('[data-role="ta-seat"]');
    if (seat) {
      createTypeahead(seat, {
        label: 'Seat (city), optional', chosenLabel: 'Seat',
        searchEntities: search,
        existing: a.seatQid ? { qid: a.seatQid, label: a.seatLabel || a.seatQid } : null,
        onPick: (c) => { a.seatQid = c.qid; a.seatLabel = c.label; persist(); render(); },
        onClear: () => { a.seatQid = null; a.seatLabel = null; persist(); render(); },
      });
    }
  }

  /** Hook for the "part of" picker in the details step. */
  function mountParentPicker() {
    const parent = host.querySelector('[data-role="ta-parent"]');
    if (!parent) return;
    const a = draft.association;
    createTypeahead(parent, {
      label: 'Part of (organization, e.g. the society a section belongs to)', chosenLabel: 'Part of (organization)',
      searchEntities: (text) => ports.search.searchEntities(text, 'item'),
      existing: a.parentQid ? { qid: a.parentQid, label: a.parentLabel || a.parentQid } : null,
      onPick: (c) => { a.parentQid = c.qid; a.parentLabel = c.label; persist(); render(); },
      onClear: () => { a.parentQid = null; a.parentLabel = null; persist(); render(); },
    });
  }

  /** Hook for the "operating area" picker in the details step. */
  function mountAreaPicker() {
    const area = host.querySelector('[data-role="ta-area"]');
    if (!area) return;
    const a = draft.association;
    createTypeahead(area, {
      label: 'Operating area (e.g. Asia; leave empty for a national body)', chosenLabel: 'Operating area (region or countries it covers)',
      searchEntities: (text) => ports.search.searchEntities(text, 'item'),
      existing: a.operatingAreaQid ? { qid: a.operatingAreaQid, label: a.operatingAreaLabel || a.operatingAreaQid } : null,
      onPick: (c) => { a.operatingAreaQid = c.qid; a.operatingAreaLabel = c.label; persist(); render(); },
      onClear: () => { a.operatingAreaQid = null; a.operatingAreaLabel = null; persist(); render(); },
    });
  }

  /** Current-affiliation label for a person's "chosen" display, with the birth year if known. */
  function personExisting(p) {
    if (!p.qid) return null;
    const who = p.pickedLabel || p.qid;
    return { qid: p.qid, label: p.pickedBirthYear ? `${who} (b. ${p.pickedBirthYear})` : who };
  }

  /** One person / affiliation / "other office" typeahead per officer row. */
  function mountLeadershipPickers() {
    const search = (text) => ports.search.searchEntities(text, 'item');
    const personSearch = ports.search.searchPersons ? (text) => ports.search.searchPersons(text) : search;
    (draft.officers || []).forEach((row, i) => {
      const personEl = host.querySelector(`[data-role="ta-officer-${i}"]`);
      if (personEl) {
        createTypeahead(personEl, {
          label: 'Person', chosenLabel: 'Person', searchEntities: personSearch, allowCreate: true,
          existing: personExisting(row.person),
          onPick: (c) => {
            row.person.qid = c.qid; row.person.pickedLabel = c.label; row.person.pickedBirthYear = c.birthYear || null;
            persist(); render();
          },
          onCreate: (name) => {
            row.person.qid = null; row.person.pickedLabel = null; row.person.pickedBirthYear = null;
            row.person.labels = { en: name }; persist(); render();
          },
          onClear: () => {
            row.person.qid = null; row.person.labels = {}; row.person.pickedLabel = null; row.person.pickedBirthYear = null;
            persist(); render();
          },
        });
      }
      const affEl = host.querySelector(`[data-role="ta-officer-affiliation-${i}"]`);
      if (affEl) {
        createTypeahead(affEl, {
          label: 'Current affiliation', chosenLabel: 'Current affiliation', searchEntities: search,
          existing: row.person.affiliationQid ? { qid: row.person.affiliationQid, label: row.person.affiliationLabel || row.person.affiliationQid } : null,
          onPick: (c) => { row.person.affiliationQid = c.qid; row.person.affiliationLabel = c.label; persist(); render(); },
          onClear: () => { row.person.affiliationQid = null; row.person.affiliationLabel = null; persist(); render(); },
        });
      }
      const officeEl = host.querySelector(`[data-role="ta-officer-office-${i}"]`);
      if (officeEl) {
        createTypeahead(officeEl, {
          label: 'Office', searchEntities: search,
          onPick: (c) => { row.officeQid = c.qid; row.officeLabel = c.label; row._customOffice = false; persist(); render(); },
          onCancelEditing: () => { row._customOffice = false; persist(); render(); },
        });
      }
    });
  }

  /** Hook for the "published by" picker in the journal details step. */
  function mountPublisherPicker() {
    const el = host.querySelector('[data-role="ta-publisher"]');
    if (!el) return;
    const j = draft.journalEntity;
    createTypeahead(el, {
      label: 'Published by (association), optional', chosenLabel: 'Published by',
      searchEntities: (text) => ports.search.searchEntities(text, 'item'),
      existing: j.publisherQid ? { qid: j.publisherQid, label: j.publisherLabel || j.publisherQid } : null,
      onPick: (c) => { j.publisherQid = c.qid; j.publisherLabel = c.label; persist(); render(); },
      onClear: () => { j.publisherQid = null; j.publisherLabel = null; persist(); render(); },
    });
  }

  /** One person / affiliation / "other role" typeahead per editor row. */
  function mountEditorPickers() {
    const search = (text) => ports.search.searchEntities(text, 'item');
    const personSearch = ports.search.searchPersons ? (text) => ports.search.searchPersons(text) : search;
    (draft.editors || []).forEach((row, i) => {
      const personEl = host.querySelector(`[data-role="ta-editor-${i}"]`);
      if (personEl) {
        createTypeahead(personEl, {
          label: 'Person', chosenLabel: 'Person', searchEntities: personSearch, allowCreate: true,
          existing: personExisting(row.person),
          onPick: (c) => {
            row.person.qid = c.qid; row.person.pickedLabel = c.label; row.person.pickedBirthYear = c.birthYear || null;
            persist(); render();
          },
          onCreate: (name) => {
            row.person.qid = null; row.person.pickedLabel = null; row.person.pickedBirthYear = null;
            row.person.labels = { en: name }; persist(); render();
          },
          onClear: () => {
            row.person.qid = null; row.person.labels = {}; row.person.pickedLabel = null; row.person.pickedBirthYear = null;
            persist(); render();
          },
        });
      }
      const affEl = host.querySelector(`[data-role="ta-editor-affiliation-${i}"]`);
      if (affEl) {
        createTypeahead(affEl, {
          label: 'Current affiliation', chosenLabel: 'Current affiliation', searchEntities: search,
          existing: row.person.affiliationQid ? { qid: row.person.affiliationQid, label: row.person.affiliationLabel || row.person.affiliationQid } : null,
          onPick: (c) => { row.person.affiliationQid = c.qid; row.person.affiliationLabel = c.label; persist(); render(); },
          onClear: () => { row.person.affiliationQid = null; row.person.affiliationLabel = null; persist(); render(); },
        });
      }
      const roleEl = host.querySelector(`[data-role="ta-editor-role-${i}"]`);
      if (roleEl) {
        createTypeahead(roleEl, {
          label: 'Role', searchEntities: search,
          onPick: (c) => { row.roleQid = c.qid; row.roleLabel = c.label; row._customRole = false; persist(); render(); },
          onCancelEditing: () => { row._customRole = false; persist(); render(); },
        });
      }
    });
  }

  /** The user found the item already on Wikidata: continue as "Edit details" for it. */
  function switchToEdit(candidate, kind = 'association') {
    mode = kind === 'journal' ? 'update-journal' : 'update-field';
    steps = STEP_ORDER[mode];
    index = 0;
    langs = [];
    official = [];
    nameSeeded = false;
    arrivedFromSearch = true;
    displayName = candidate.label;
    if (kind === 'journal') {
      const publisherQid = draft.journalEntity?.publisherQid || null;
      const publisherLabel = draft.journalEntity?.publisherLabel || null;
      draft = seedDraft(mode, { journal: { qid: candidate.qid, publisherQid, publisherLabel } });
    } else {
      draft = seedDraft(mode, { association: { qid: candidate.qid } });
    }
    persist();
    if (kind === 'journal') return ports.search.getJournalDetails ? loadJournalOriginal() : render();
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
    if (applyFieldInput(draft, e.target)) { failure = ''; persist(); refreshDerived(); return; }
    if (applyJournalFieldInput(draft, e.target)) { failure = ''; persist(); refreshDerived(); return; }
    if (e.target.dataset?.field === 'officer-office' && e.target.value === '__other__') {
      applyLeadershipFieldInput(draft, e.target); persist(); render(); return;
    }
    if (applyLeadershipFieldInput(draft, e.target)) { failure = ''; persist(); refreshDerived(); return; }
    if (e.target.dataset?.field === 'editor-role' && e.target.value === '__other__') {
      applyEditorFieldInput(draft, e.target); persist(); render(); return;
    }
    if (applyEditorFieldInput(draft, e.target)) { failure = ''; persist(); refreshDerived(); }
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
    else if (role('retry-load')) {
      if (isJournalDetailsMode(mode)) loadJournalOriginal();
      else loadOriginal();
    }
    else if (role('clear-name')) { a.identifyName = ''; persist(); render(); }
    else if (role('clear-journal-name')) { draft.journalEntity.identifyName = ''; persist(); render(); }
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
    else if (role('add-officer')) {
      const first = config.officeTypes?.[0];
      draft.officers.push(emptyOfficerRow(first?.qid || '', first?.label || ''));
      persist(); render();
    }
    else if (role('remove-officer')) { draft.officers.splice(Number(role('remove-officer').dataset.index), 1); persist(); render(); }
    else if (role('officer-add-lang')) {
      const r = draft.officers[Number(role('officer-add-lang').dataset.index)];
      r.person._showSecondName = true; persist(); render();
    }
    else if (role('add-editor')) {
      const first = config.journalEditorRoles?.[0];
      draft.editors.push(emptyEditorRow(first?.qid || '', first?.label || ''));
      persist(); render();
    }
    else if (role('remove-editor')) { draft.editors.splice(Number(role('remove-editor').dataset.index), 1); persist(); render(); }
    else if (role('editor-add-lang')) {
      const r = draft.editors[Number(role('editor-add-lang').dataset.index)];
      r.person._showSecondName = true; persist(); render();
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
  else if (mode === 'manage-leadership' && !restoredDraft && draft.association.qid) loadLeadershipOriginal();
  else if (mode === 'update-journal' && !restoredDraft && draft.journalEntity.qid && ports.search?.getJournalDetails) loadJournalOriginal();
  else if (mode === 'manage-journal-editors' && !restoredDraft && draft.journalEntity.qid) loadEditorsOriginal();
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
  return {
    'create-association': 'Add association', 'manage-leadership': 'Manage leadership', 'update-field': 'Edit details',
    'create-journal': 'Add journal', 'update-journal': 'Edit journal', 'manage-journal-editors': 'Manage editors',
  }[mode];
}
