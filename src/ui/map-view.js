import { resolveSeatPin, resolveLeadershipPin } from '../core/resolve-location.js';
import { escapeHtml } from '../render.js';

/**
 * @typedef {Object} MapPin
 * @property {string} id
 * @property {'seat'|'leadership'} layer
 * @property {[number,number]} coord
 * @property {string} label
 * @property {string} assocQid
 */

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

/**
 * Thin Leaflet wrapper. Requires the global `L` from the vendored script.
 * Not unit-tested (needs real layout); covered by manual QA.
 * @param {HTMLElement} container
 * @param {{tileUrl: string, tileAttribution: string, onSelect: (assocQid: string) => void}} opts
 */
export function createMapView(container, { tileUrl, tileAttribution, onSelect }) {
  /* global L */
  const map = L.map(container, { worldCopyJump: true }).setView([20, 10], 2);
  L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 12 }).addTo(map);

  const seatLayer = L.layerGroup().addTo(map);
  const leadLayer = L.layerGroup().addTo(map);

  function render(pins) {
    seatLayer.clearLayers();
    leadLayer.clearLayers();
    for (const p of pins) {
      const marker = L.circleMarker([p.coord[1], p.coord[0]], {
        radius: p.layer === 'seat' ? 7 : 5,
        className: p.layer === 'seat' ? 'pin pin--seat' : 'pin pin--lead',
      }).bindTooltip(escapeHtml(p.label));
      marker.on('click', () => onSelect(p.assocQid));
      (p.layer === 'seat' ? seatLayer : leadLayer).addLayer(marker);
    }
  }

  function focus(coord) {
    map.setView([coord[1], coord[0]], Math.max(map.getZoom(), 5));
  }

  return { render, focus, leaflet: map };
}
