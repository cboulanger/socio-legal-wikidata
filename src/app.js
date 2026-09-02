import { createStore } from './store.js';
import { mount } from './render.js';
import { filterAssociations } from './core/filter.js';
import { createCache, loadDirectory as loadDirectoryImpl } from './adapters/browser-cache.js';
import { queryDirectory as queryDirectoryImpl } from './adapters/sparql-client.js';
import { renderPanel } from './ui/directory-panel.js';
import { createMapView as createMapViewImpl, toMapPins } from './ui/map-view.js';
import { renderEditChrome } from './ui/edit-panel.js';

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
 *     openWizard: (host: HTMLElement, seed: any) => void,
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

  const store = createStore({
    mode,
    associations: [],
    filter: {},
    selection: null,
    stale: false,
    asOf: null,
    showLeadership: !!config.leadershipLayerDefault,
  });

  const panelHost = doc.getElementById('panel-host');
  const mapHost = doc.getElementById('map');
  const toggle = doc.querySelector('[data-role="leadership-toggle"]');

  const mapView = await createMapView(mapHost, {
    tileUrl: config.tileUrl,
    tileAttribution: config.tileAttribution,
    countriesGeojson: deps.countriesGeojson,
    onSelect: (qid) => select(qid),
    onSelectCountry: (iso) => { win.location.hash = `#/country/${iso}`; },
  });

  function renderPanelRegion() {
    const s = store.getState();
    mount(panelHost, renderPanel({
      associations: s.associations,
      filter: s.filter,
      selection: s.selection,
      centroids,
      stale: s.stale,
      asOf: s.asOf,
      editMode: s.mode === 'edit',
    }));
  }

  function renderMapRegion() {
    const s = store.getState();
    const visible = filterAssociations(s.associations, s.filter);
    mapView.render(toMapPins(visible, { centroids, showLeadership: s.showLeadership }));
  }

  function select(qid) {
    store.setState({ selection: qid });
    const a = store.getState().associations.find((x) => x.qid === qid);
    if (a && a.seatCoord) mapView.focus(a.seatCoord);
    else if (a && a.countryCode && centroids[a.countryCode]) mapView.focus(centroids[a.countryCode]);
  }

  // ---- events (delegated) ----
  panelHost.addEventListener('click', (e) => {
    const row = e.target.closest('button.row');
    if (row) return select(row.dataset.qid);
    if (e.target.closest('[data-role="clear-filter"]')) {
      store.setState((s) => ({ filter: { ...s.filter, countryCode: undefined } }));
    }
  });
  panelHost.addEventListener('input', (e) => {
    if (e.target.matches('input[data-role="search"]')) {
      store.setState((s) => ({ filter: { ...s.filter, text: e.target.value } }));
    }
  });
  if (toggle) {
    toggle.checked = store.getState().showLeadership;
    toggle.addEventListener('change', () => store.setState({ showLeadership: toggle.checked }));
  }
  win.addEventListener('hashchange', () => applyRoute());

  function applyRoute() {
    const hash = win.location.hash || '#/';
    const m = hash.match(/^#\/country\/([A-Za-z]{2})$/);
    if (m) return store.setState((s) => ({ filter: { ...s.filter, countryCode: m[1].toUpperCase() } }));
    const a = hash.match(/^#\/assoc\/(Q\d+)$/);
    if (a) return store.setState({ selection: a[1] });
  }

  store.subscribe(() => {
    renderPanelRegion();
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
      onConnect: () => editRuntime.auth.connect(),
      onLeave: async () => { await editRuntime.auth.disconnect(); win.location.search = ''; },
      onAdd: () => editRuntime.openWizard(drawer, { mode: 'create-association' }),
    });
    paintChrome();

    panelHost.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="edit"]');
      if (!btn) return;
      const a = store.getState().associations.find((x) => x.qid === btn.dataset.qid);
      if (!a) return;
      editRuntime.openWizard(drawer, {
        mode: 'change-president',
        association: { qid: a.qid, label: a.label },
      });
    });
  }

  // ---- initial load ----
  const dir = await loadDirectory({
    cache: createCache({ storage: win.localStorage }),
    queryDirectory: () => queryDirectoryImpl({ fetch: win.fetch.bind(win), endpoint: config.sparqlEndpoint, cfg: config }),
    fetch: win.fetch ? win.fetch.bind(win) : undefined,
    snapshotUrl: config.snapshotUrl,
    ttlMs: config.cacheTtlMs,
  });
  store.setState({ associations: dir.associations, stale: dir.stale, asOf: dir.asOf });
  applyRoute();
  renderPanelRegion();
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
      const write = config.writeMode === 'quickstatements'
        ? createQuickStatementsWriter({ window, config })
        : api;
      return {
        auth,
        openWizard: (host, seed) => createWizard(host, { window, config, ports: { search: api, write }, seed, onClose: () => { host.innerHTML = ''; } }),
      };
    },
  });
}
