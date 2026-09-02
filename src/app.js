import { createStore } from './store.js';
import { mount } from './render.js';
import { filterAssociations } from './core/filter.js';
import { createCache, loadDirectory as loadDirectoryImpl } from './adapters/browser-cache.js';
import { queryDirectory as queryDirectoryImpl } from './adapters/sparql-client.js';
import { renderPanel } from './ui/directory-panel.js';
import { createMapView as createMapViewImpl, toMapPins } from './ui/map-view.js';

/**
 * Read-only composition root. Every collaborator is injectable so the whole
 * app can be driven from a jsdom test with fakes.
 * @param {{
 *   window: Window,
 *   config: any,
 *   centroids: Object<string, [number,number]>,
 *   loadDirectory: typeof loadDirectoryImpl,
 *   createMapView: typeof createMapViewImpl,
 *   detectMode: () => 'read'|'edit',
 * }} deps
 */
export async function createApp(deps) {
  const { window: win, config, centroids } = deps;
  const doc = win.document;
  const createMapView = deps.createMapView || createMapViewImpl;
  const detectMode = deps.detectMode || (() => 'read');
  const loadDirectory = deps.loadDirectory || loadDirectoryImpl;

  const store = createStore({
    mode: detectMode(),
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
  await createApp({
    window,
    config,
    centroids,
    countriesGeojson,
    loadDirectory: loadDirectoryImpl,
    createMapView: createMapViewImpl,
    detectMode: () => 'read',
  });
}
