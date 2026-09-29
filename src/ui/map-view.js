import { resolveSeatPin, resolveLeadershipPin } from '../core/resolve-location.js';

/**
 * @typedef {Object} MapPin
 * @property {string} id
 * @property {'seat'|'leadership'} layer
 * @property {[number,number]} coord
 * @property {string} label
 * @property {string} assocQid
 */

/** @param {any} feature @returns {string|null} ISO 3166-1 alpha-2, uppercase */
export function isoOfFeature(feature) {
  const props = feature?.properties || {};
  let iso = String(props.ISO_A2 || props.iso_a2 || '').toUpperCase();
  // Natural Earth marks a few real countries (France, Norway) as '-99' in
  // ISO_A2; the '_EH' variant carries the correct alpha-2 code.
  if (iso === '-99') iso = String(props.ISO_A2_EH || props.iso_a2_eh || '').toUpperCase();
  return iso && iso !== '-99' ? iso : null;
}

/**
 * @param {import('../core/model.js').Association[]} associations
 * @param {{centroids: Object<string, [number,number]>, showLeadership: boolean}} opts
 * @returns {MapPin[]}
 */
export function toMapPins(associations, { centroids, showLeadership }) {
  /** @type {MapPin[]} */
  const pins = [];
  for (const a of associations) {
    const seat = resolveSeatPin(a, centroids);
    if (seat) {
      pins.push({ id: `${a.qid}:seat`, layer: 'seat', coord: seat.coord, label: a.label, assocQid: a.qid });
    }
    if (showLeadership) {
      const lead = resolveLeadershipPin(a);
      if (lead) {
        pins.push({ id: `${a.qid}:leadership`, layer: 'leadership', coord: lead.coord, label: lead.label, assocQid: a.qid });
      }
    }
  }
  return pins;
}

const DEFAULT_SIZE = [960, 480];
const MAX_ZOOM = 40;
const FOCUS_ZOOM = 5;
const SEAT_RADIUS = 7;
const LEAD_RADIUS = 5;

/**
 * Equal Earth world map drawn as SVG with d3-geo (equal-area, no tile server).
 * Requires the global `d3` from the vendored bundle (or pass `d3` in opts).
 * Layout needs a real browser; covered by manual QA plus a jsdom smoke test.
 * @param {HTMLElement} container
 * @param {{onSelect: (assocQid: string) => void, onSelectCountry?: (iso: string) => void, countriesGeojson?: any, getInsets?: () => {left?: number, bottom?: number}, d3?: any}} opts
 * getInsets reports overlay space (px) the world should not be fitted under, e.g. the side panel.
 */
export function createMapView(container, { onSelect, onSelectCountry, countriesGeojson, getInsets = () => ({}), d3 = globalThis.d3 }) {
  const svg = d3.select(container).append('svg')
    .attr('class', 'map-svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('role', 'img')
    .attr('aria-label', 'Equal Earth world map');
  const world = svg.append('g');
  const sphere = world.append('path').attr('class', 'map-sphere');
  const countries = world.append('g').attr('class', 'map-countries');
  const seatLayer = world.append('g').attr('class', 'map-seats');
  const leadLayer = world.append('g').attr('class', 'map-leadership');

  const projection = d3.geoEqualEarth();
  const path = d3.geoPath(projection);
  let width = DEFAULT_SIZE[0];
  let height = DEFAULT_SIZE[1];
  let k = 1;
  /** @type {MapPin[]} */
  let lastPins = [];

  const zoom = d3.zoom()
    .scaleExtent([1, MAX_ZOOM])
    .on('zoom', (event) => {
      k = event.transform.k;
      world.attr('transform', event.transform);
      // keep pins a constant on-screen size while the map scales
      seatLayer.selectAll('circle').attr('r', SEAT_RADIUS / k);
      leadLayer.selectAll('circle').attr('r', LEAD_RADIUS / k);
    });
  svg.call(zoom);

  if (countriesGeojson) {
    countries.selectAll('path')
      .data(countriesGeojson.features)
      .join('path')
      .attr('class', 'map-country')
      .on('click', (event, feature) => {
        const iso = isoOfFeature(feature);
        if (iso && onSelectCountry) onSelectCountry(iso);
      });
  }

  function render(pins) {
    lastPins = pins;
    for (const [layer, sel, radius] of [['seat', seatLayer, SEAT_RADIUS], ['leadership', leadLayer, LEAD_RADIUS]]) {
      sel.selectAll('circle')
        .data(pins.filter((p) => p.layer === layer), (p) => p.id)
        .join((enter) => enter.append('circle').call((c) => c.append('title')))
        .attr('class', layer === 'seat' ? 'pin pin--seat' : 'pin pin--lead')
        .attr('r', radius / k)
        .attr('transform', (p) => `translate(${projection(p.coord)})`)
        .on('click', (event, p) => onSelect(p.assocQid))
        .select('title').text((p) => p.label);
    }
  }

  function layout() {
    width = container.clientWidth || DEFAULT_SIZE[0];
    height = container.clientHeight || DEFAULT_SIZE[1];
    const { left = 0, bottom = 0 } = getInsets();
    projection.fitExtent([[left + 8, 8], [width - 8, height - bottom - 8]], { type: 'Sphere' });
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    zoom.extent([[0, 0], [width, height]]).translateExtent([[0, 0], [width, height]]);
    sphere.datum({ type: 'Sphere' }).attr('d', path);
    countries.selectAll('path').attr('d', path);
    render(lastPins);
  }

  function focus(coord) {
    const [x, y] = projection(coord);
    const scale = Math.min(MAX_ZOOM, Math.max(k, FOCUS_ZOOM));
    const transform = d3.zoomIdentity.translate(width / 2 - x * scale, height / 2 - y * scale).scale(scale);
    svg.transition().duration(500).call(zoom.transform, transform);
  }

  layout();
  const ResizeObserverImpl = container.ownerDocument.defaultView?.ResizeObserver;
  if (ResizeObserverImpl) new ResizeObserverImpl(layout).observe(container);

  return { render, focus, projection };
}
