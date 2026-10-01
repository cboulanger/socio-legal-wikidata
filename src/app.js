import { createStore } from './store.js';
import { mount } from './render.js';
import { filterAssociations } from './core/filter.js';
import { emptyAssociation } from './core/model.js';
import { cleanTerms } from './core/draft.js';
import { publishedJournalsFrom, mergeJournals } from './core/journals.js';
import { createCache, loadDirectory as loadDirectoryImpl } from './adapters/browser-cache.js';
import { queryDirectory as queryDirectoryImpl, queryJournals as queryJournalsImpl } from './adapters/sparql-client.js';
import { renderPanel } from './ui/directory-panel.js';
import { renderAssociationCard } from './ui/association-card.js';
import { renderJournalCard } from './ui/journal-card.js';
import { createRevisionClient } from './adapters/wikidata-revisions.js';
import { createMapView as createMapViewImpl, toMapPins } from './ui/map-view.js';
import { renderEditChrome } from './ui/edit-panel.js';
import { mountLeadershipHistory, clearLeadershipHistoryCache } from './ui/components/leadership-history.js';

/**
 * Read-only composition root. Every collaborator is injectable so the whole
 * app can be driven from a jsdom test with fakes.
 * @param {{
 *   window: Window,
 *   config: any,
 *   centroids: Object<string, [number,number]>,
 *   loadDirectory: typeof loadDirectoryImpl,
 *   createMapView: typeof createMapViewImpl,
 *   detectMode: () => ('read'|'edit') | Promise<'read'|'edit'>,
 *   buildEditRuntime?: () => Promise<{
 *     auth: {hasSession: () => boolean, connect: () => Promise<void>, disconnect: () => Promise<void>},
 *     getLeadershipHistory?: (qid: string) => Promise<any>,
 *     getJournalDetails?: (qid: string) => Promise<any>,
 *     getJournalEditorHistory?: (qid: string) => Promise<any>,
 *     openWizard: (host: HTMLElement, seed: any, hooks?: {onSaved?: Function}) => void,
 *   }>,
 * }} deps
 */
export async function createApp(deps) {
  const { window: win, config, centroids } = deps;
  const doc = win.document;
  const createMapView = deps.createMapView || createMapViewImpl;
  const detectMode = deps.detectMode || (() => 'read');
  const loadDirectory = deps.loadDirectory || loadDirectoryImpl;

  const mode = await detectMode();
  let editRuntime = null;
  if (mode === 'edit' && deps.buildEditRuntime) {
    editRuntime = await deps.buildEditRuntime();
  }

  const cache = createCache({ storage: win.localStorage });
  const store = createStore({
    mode,
    associations: [],
    independentJournals: null, // raw Pool B query result, fetched once per session; null = not fetched yet
    showJournals: false,
    filter: {},
    selection: null,
    stale: false,
    asOf: null,
  });

  const currentJournals = () => mergeJournals(publishedJournalsFrom(store.getState().associations), store.getState().independentJournals || []);

  // Who last edited the selected item: the snapshot's value shows at once, a live lookup replaces it.
  const revisions = deps.revisionClient || (win.fetch ? createRevisionClient({ fetch: win.fetch.bind(win), config }) : null);
  const liveEdits = new Map();
  const requestedEdits = new Set();

  // A journal's rich fields and editor history: fetched live, once per qid, when its card opens.
  const journalDetailsCache = new Map(); // qid -> { details, editorHistory, error }

  const panelHost = doc.getElementById('panel-host');
  const detailHost = doc.getElementById('detail-host');
  const mapHost = doc.getElementById('map');

  const mapView = await createMapView(mapHost, {
    countriesGeojson: deps.countriesGeojson,
    // the panel is a left sidebar on wide screens and a bottom sheet on narrow ones
    getInsets: () => {
      const r = panelHost.getBoundingClientRect();
      if (!r.width || !r.height) return {};
      const m = mapHost.getBoundingClientRect();
      return r.top > m.top ? { bottom: m.bottom - r.top } : { left: r.right };
    },
    onSelect: (qid) => select('association', qid),
    onSelectCountry: (iso) => { win.location.hash = `#/country/${iso}`; },
  });

  function renderPanelRegion() {
    const s = store.getState();
    mount(panelHost, renderPanel({
      associations: s.associations,
      journals: currentJournals(),
      showJournals: s.showJournals,
      filter: s.filter,
      selection: s.selection,
      centroids,
      stale: s.stale,
      asOf: s.asOf,
    }));
  }

  function loadJournalDetails(qid) {
    journalDetailsCache.set(qid, { details: null, editorHistory: null, error: '' }); // dedup while in flight
    Promise.all([
      editRuntime.getJournalDetails(qid),
      editRuntime.getJournalEditorHistory ? editRuntime.getJournalEditorHistory(qid) : Promise.resolve({ history: [] }),
    ]).then(([details, editors]) => {
      journalDetailsCache.set(qid, { details, editorHistory: editors.history, error: '' });
      const sel = store.getState().selection;
      if (sel?.kind === 'journal' && sel.qid === qid) renderDetailRegion();
    }).catch((err) => {
      journalDetailsCache.set(qid, { details: null, editorHistory: null, error: `Could not load journal details: ${err.message}` });
      const sel = store.getState().selection;
      if (sel?.kind === 'journal' && sel.qid === qid) renderDetailRegion();
    });
  }

  // the selected item's card lives in a right-hand sidebar (the edit drawer covers it)
  function renderDetailRegion() {
    const s = store.getState();
    const sel = s.selection;
    const showHost = (el) => { detailHost.hidden = false; doc.getElementById('app').classList.toggle('has-detail', true); el(); };
    const hideHost = () => { detailHost.innerHTML = ''; detailHost.hidden = true; doc.getElementById('app').classList.toggle('has-detail', false); };

    if (sel?.kind === 'journal') {
      const j = currentJournals().find((x) => x.qid === sel.qid);
      if (!j) return hideHost();
      const cached = journalDetailsCache.get(j.qid);
      return showHost(() => {
        mount(detailHost, renderJournalCard(j, {
          editMode: s.mode === 'edit',
          details: cached?.details || null,
          editorHistory: cached?.editorHistory || null,
          loadError: cached?.error || '',
        }));
        if (s.mode === 'edit' && editRuntime?.getJournalDetails && !cached) loadJournalDetails(j.qid);
      });
    }

    const a = sel?.kind === 'association' ? s.associations.find((x) => x.qid === sel.qid) : null;
    if (!a) return hideHost();
    showHost(() => {
      mount(detailHost, renderAssociationCard(a, { editMode: s.mode === 'edit', lastEdit: liveEdits.get(a.qid) || a.lastEdit || null }));
      if (s.mode === 'edit' && editRuntime?.getLeadershipHistory) {
        mountLeadershipHistory(detailHost, { qid: a.qid, getHistory: editRuntime.getLeadershipHistory });
      }
      if (revisions && !requestedEdits.has(a.qid)) {
        requestedEdits.add(a.qid);
        revisions.getLastEdit(a.qid).then((edit) => {
          if (!edit) return; // keep what the snapshot knew
          liveEdits.set(a.qid, edit);
          const cur = store.getState().selection;
          if (cur?.kind === 'association' && cur.qid === a.qid) renderDetailRegion();
        });
      }
    });
  }

  function renderMapRegion() {
    const s = store.getState();
    const visible = filterAssociations(s.associations, s.filter);
    mapView.render(toMapPins(visible, { centroids }));
  }

  function select(kind, qid) {
    store.setState({ selection: { kind, qid } });
    if (kind !== 'association') return;
    const a = store.getState().associations.find((x) => x.qid === qid);
    if (a && a.seatCoord) mapView.focus(a.seatCoord);
    else if (a && a.countryCode && centroids[a.countryCode]) mapView.focus(centroids[a.countryCode]);
  }

  async function fetchIndependentJournals() {
    try {
      const rows = await queryJournalsImpl({ fetch: win.fetch.bind(win), endpoint: config.sparqlEndpoint, cfg: config });
      store.setState({ independentJournals: rows });
    } catch {
      store.setState({ independentJournals: [] }); // best-effort: the "Journals" group stays limited to association-published ones
    }
  }

  // ---- events (delegated) ----
  panelHost.addEventListener('click', (e) => {
    const row = e.target.closest('button.row');
    if (row) return select(row.dataset.kind || 'association', row.dataset.qid);
    if (e.target.closest('[data-role="reload-data"]')) {
      // drop only the cached directory (not the login session or a wizard draft), then re-query Wikidata
      try { cache.remove('directory'); } catch { /* storage blocked */ }
      win.location.reload();
      return;
    }
    if (e.target.closest('[data-role="clear-search"]')) {
      store.setState((s) => ({ filter: { ...s.filter, text: '' } }));
      panelHost.querySelector('input[data-role="search"]')?.focus();
      return;
    }
    if (e.target.closest('[data-role="clear-filter"]')) {
      store.setState((s) => ({ filter: { ...s.filter, countryCode: undefined } }));
      // The country filter can only ever have been set by way of #/country/XX (see
      // onSelectCountry below), so clearing it must also clear that hash — otherwise
      // a reload (or copying the URL) re-applies a filter the UI just showed as cleared.
      if (/^#\/country\//.test(win.location.hash)) win.location.hash = '';
    }
  });
  panelHost.addEventListener('change', (e) => {
    if (!e.target.matches('input[data-role="show-journals"]')) return;
    const checked = e.target.checked;
    store.setState({ showJournals: checked });
    if (checked && store.getState().independentJournals == null) fetchIndependentJournals();
  });
  detailHost.addEventListener('click', (e) => {
    if (e.target.closest('[data-role="close-card"]')) {
      store.setState({ selection: null });
      // a selection can also come from #/assoc/Q… or #/journal/Q…; clear it so a reload doesn't re-open the card
      if (/^#\/(assoc|journal)\//.test(win.location.hash)) win.location.hash = '';
      return;
    }
    const journalLink = e.target.closest('[data-action="select-journal"]');
    if (journalLink) return select('journal', journalLink.dataset.qid);
    const assocLink = e.target.closest('[data-action="select-association"]');
    if (assocLink) return select('association', assocLink.dataset.qid);
    const retry = e.target.closest('[data-role="retry-journal-load"]');
    if (retry) { journalDetailsCache.delete(retry.dataset.qid); return renderDetailRegion(); }
  });
  panelHost.addEventListener('input', (e) => {
    if (e.target.matches('input[data-role="search"]')) {
      store.setState((s) => ({ filter: { ...s.filter, text: e.target.value } }));
    }
  });
  win.addEventListener('hashchange', () => applyRoute());

  function applyRoute() {
    const hash = win.location.hash || '#/';
    const m = hash.match(/^#\/country\/([A-Za-z]{2})$/);
    if (m) return store.setState((s) => ({ filter: { ...s.filter, countryCode: m[1].toUpperCase() } }));
    const j = hash.match(/^#\/journal\/(Q\d+)$/);
    if (j) return store.setState({ selection: { kind: 'journal', qid: j[1] } });
    const a = hash.match(/^#\/assoc\/(Q\d+)$/);
    if (a) return store.setState({ selection: { kind: 'association', qid: a[1] } });
  }

  store.subscribe(() => {
    renderPanelRegion();
    renderDetailRegion();
    renderMapRegion();
  });

  if (mode === 'edit' && editRuntime) {
    const bar = doc.createElement('div');
    bar.id = 'edit-chrome';
    doc.getElementById('app').appendChild(bar);
    const drawer = doc.createElement('div');
    drawer.id = 'wizard-host';
    doc.getElementById('app').appendChild(drawer);

    const paintChrome = () => renderEditChrome(bar, {
      connected: editRuntime.auth.hasSession(),
      devWriteMocked: !!editRuntime.devWriteMocked,
      onConnect: () => editRuntime.auth.connect(),
      onLeave: async () => { await editRuntime.auth.disconnect(); win.location.search = ''; },
      onAdd: () => editRuntime.openWizard(drawer, { mode: 'create-association' }, { onSaved: applySaved, isInDirectory }),
      onAddJournal: () => editRuntime.openWizard(drawer, { mode: 'create-journal' }, { onSaved: applySaved }),
    });

    const isInDirectory = (qid) => store.getState().associations.some((x) => x.qid === qid);

    // The SPARQL-backed list lags behind Wikidata, so show what was just saved right away.
    function applySaved(result, draft) {
      patchStore(result, draft);
      // keep the browser cache in step, so a reload before the query service catches up still shows the edit
      const s = store.getState();
      if (!s.stale) { try { cache.set('directory', s.associations); } catch { /* storage full or blocked */ } }
    }

    function patchStore(result, draft) {
      if (draft.mode === 'create-journal' || draft.mode === 'update-journal' || draft.mode === 'manage-journal-editors') {
        return patchJournalStore(result, draft);
      }
      const a = draft.association;
      if (a.qid) { revisions?.forget(a.qid); liveEdits.delete(a.qid); requestedEdits.delete(a.qid); } // the item just changed
      const labels = cleanTerms({ ...a.original.labels, ...a.labels });
      const descriptions = cleanTerms({ ...a.original.descriptions, ...a.descriptions });
      const pick = (m) => (config.labelLanguages || 'en').split(',').map((l) => l.trim()).map((l) => m[l]).find(Boolean) || '';
      const inList = store.getState().associations.some((x) => x.qid === a.qid);
      if (draft.mode === 'update-field' && !inList && (a.addToDirectory && (a.original.needsClass || a.original.needsField))) {
        // an existing Wikidata item that has just been made an in-scope association
        store.setState((s) => ({
          associations: [...s.associations, {
            ...emptyAssociation(a.qid), label: pick(labels) || Object.values(labels)[0] || a.qid,
            description: pick(descriptions), website: a.website, email: a.email,
          }],
          selection: { kind: 'association', qid: a.qid },
        }));
      } else if (draft.mode === 'update-field') {
        store.setState((s) => ({
          associations: s.associations.map((x) => (x.qid !== a.qid ? x : {
            ...x, label: pick(labels) || x.label, description: pick(descriptions) || x.description,
            website: a.website || x.website, email: a.email || x.email,
          })),
        }));
      } else if (draft.mode === 'create-association') {
        const created = result.created?.find((c) => c.ref === 'assoc');
        if (!created) return;
        const added = {
          ...emptyAssociation(created.qid), label: pick(labels) || Object.values(labels)[0] || created.qid,
          description: pick(descriptions), website: a.website, email: a.email,
          countryLabel: a.countryLabel, seatQid: a.seatQid, seatLabel: a.seatLabel,
        };
        store.setState((s) => ({ associations: [...s.associations, added], selection: { kind: 'association', qid: created.qid } }));
      } else if (draft.mode === 'manage-leadership') {
        clearLeadershipHistoryCache(a.qid);
      }
    }

    function patchJournalStore(result, draft) {
      const j = draft.journalEntity;
      if (draft.mode === 'manage-journal-editors') {
        journalDetailsCache.delete(j.qid);
        return;
      }
      const labels = cleanTerms({ ...j.original.labels, ...j.labels });
      const descriptions = cleanTerms({ ...j.original.descriptions, ...j.descriptions });
      const pick = (m) => (config.labelLanguages || 'en').split(',').map((l) => l.trim()).map((l) => m[l]).find(Boolean) || '';
      let qid = j.qid;
      if (draft.mode === 'create-journal') {
        const created = result.created?.find((c) => c.ref === 'journal');
        if (!created) return;
        qid = created.qid;
      }
      journalDetailsCache.delete(qid);
      const row = {
        qid, label: pick(labels) || Object.values(labels)[0] || qid, description: pick(descriptions),
        publisherQid: j.publisherQid, publisherLabel: j.publisherLabel,
        // left unset so mergeJournals falls back to the publisher's country, when there is one
        countryCode: null, countryLabel: null,
      };
      store.setState((s) => {
        const list = s.independentJournals || [];
        const idx = list.findIndex((x) => x.qid === qid);
        const next = idx === -1 ? [...list, row] : list.map((x, i) => (i === idx ? { ...x, ...row } : x));
        return { independentJournals: next, selection: { kind: 'journal', qid } };
      });
    }
    paintChrome();

    detailHost.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-action="edit"]');
      const leadershipBtn = e.target.closest('[data-action="leadership"]');
      const linkJournalBtn = e.target.closest('[data-action="link-journal"]');
      const editJournalBtn = e.target.closest('[data-action="edit-journal"]');
      const manageEditorsBtn = e.target.closest('[data-action="manage-editors"]');
      if (editBtn) {
        const a = store.getState().associations.find((x) => x.qid === editBtn.dataset.qid);
        if (!a) return;
        editRuntime.openWizard(drawer, { mode: 'update-field', association: { qid: a.qid, label: a.label } }, { onSaved: applySaved });
      } else if (leadershipBtn) {
        const a = store.getState().associations.find((x) => x.qid === leadershipBtn.dataset.qid);
        if (!a) return;
        editRuntime.openWizard(drawer, { mode: 'manage-leadership', association: { qid: a.qid, label: a.label } }, { onSaved: applySaved });
      } else if (linkJournalBtn) {
        const a = store.getState().associations.find((x) => x.qid === linkJournalBtn.dataset.qid);
        if (!a) return;
        editRuntime.openWizard(drawer, { mode: 'create-journal', journal: { publisherQid: a.qid, publisherLabel: a.label } }, { onSaved: applySaved });
      } else if (editJournalBtn) {
        editRuntime.openWizard(drawer, { mode: 'update-journal', journal: { qid: editJournalBtn.dataset.qid } }, { onSaved: applySaved });
      } else if (manageEditorsBtn) {
        editRuntime.openWizard(drawer, { mode: 'manage-journal-editors', journal: { qid: manageEditorsBtn.dataset.qid } }, { onSaved: applySaved });
      }
    });
  }

  // ---- initial load ----
  const dir = await loadDirectory({
    cache,
    queryDirectory: () => queryDirectoryImpl({ fetch: win.fetch.bind(win), endpoint: config.sparqlEndpoint, cfg: config }),
    fetch: win.fetch ? win.fetch.bind(win) : undefined,
    snapshotUrl: config.snapshotUrl,
    ttlMs: config.cacheTtlMs,
  });
  store.setState({ associations: dir.associations, stale: dir.stale, asOf: dir.asOf });
  applyRoute();
  renderPanelRegion();
  renderDetailRegion();
  renderMapRegion();

  return { store };
}

/** Browser entry point. */
if (typeof window !== 'undefined' && window.document?.getElementById('app')) {
  const config = await (await fetch('config.json')).json();
  const centroids = await (await fetch(config.centroidsUrl)).json();
  const countriesGeojson = await (await fetch('data/countries.geojson')).json();

  const storage = config.tokenPersistence === 'session' ? window.sessionStorage : window.localStorage;
  const trigger = config.editTrigger || 'either';
  const hasEditParam = new URLSearchParams(window.location.search).has(config.editParam || 'edit');
  const hasStoredSession = !!storage.getItem('slw:oauth:refresh');
  // Cheap pre-check using the same trigger semantics as ui/mode.js's detectMode, but
  // without importing any edit/auth module — a definite read-only visitor (no ?edit,
  // no stored session) never causes oauth-pkce.js or later edit modules to load.
  const mightBeEdit =
    ((trigger === 'session' || trigger === 'either') && hasStoredSession) ||
    ((trigger === 'param' || trigger === 'either') && hasEditParam);

  let detectModeFn = async () => 'read';
  let auth = null;
  if (mightBeEdit) {
    const [{ detectMode }, { createAuth }] = await Promise.all([
      import('./ui/mode.js'),
      import('./adapters/oauth-pkce.js'),
    ]);
    auth = createAuth({
      fetch: window.fetch.bind(window),
      storage,
      location: window.location,
      crypto: window.crypto,
      config,
    });
    detectModeFn = () => detectMode({ location: window.location, auth, config });
  }

  await createApp({
    window,
    config,
    centroids,
    countriesGeojson,
    loadDirectory: loadDirectoryImpl,
    createMapView: createMapViewImpl,
    detectMode: detectModeFn,
    buildEditRuntime: async () => {
      // Only ever invoked when detectModeFn resolved to 'edit', which only happens
      // when mightBeEdit was true, so `auth` is guaranteed non-null here.
      const [{ createWikibaseApi }, { createQuickStatementsWriter }, { createWizard }] = await Promise.all([
        import('./adapters/wikibase-api.js'),
        import('./adapters/quickstatements-handoff.js'),
        import('./ui/edit-wizard/wizard.js'),
      ]);
      const api = createWikibaseApi({ fetch: window.fetch.bind(window), config, getToken: () => auth.getToken() });
      let write = config.writeMode === 'quickstatements'
        ? createQuickStatementsWriter({ window, config })
        : api;
      let runtimeAuth = auth;
      let devWriteMocked = false;

      // No Wikidata OAuth consumer can work on localhost — Wikimedia must approve a
      // new consumer before anyone but its owner can authorize it (see README.md
      // "Edit mode"), and only the production consumer is registered. So on localhost
      // the edit UI is shown as already "connected" and saves are simulated locally,
      // letting every read, search and UI flow be tested without ever touching
      // real Wikidata or requiring a Wikimedia sign-in.
      if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        const [{ createDevAuth }, { createDevWriteMock }] = await Promise.all([
          import('./adapters/dev-auth-mock.js'),
          import('./adapters/dev-write-mock.js'),
        ]);
        runtimeAuth = createDevAuth();
        write = createDevWriteMock();
        devWriteMocked = true;
      }

      return {
        auth: runtimeAuth,
        devWriteMocked,
        getLeadershipHistory: api.getLeadershipHistory,
        getJournalDetails: api.getJournalDetails,
        getJournalEditorHistory: api.getJournalEditorHistory,
        openWizard: (host, seed, hooks = {}) => createWizard(host, { window, config, ports: { search: api, write }, seed, onClose: () => { host.innerHTML = ''; }, ...hooks }),
      };
    },
  });
}
