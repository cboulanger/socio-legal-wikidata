# Read-Only Directory App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public, strictly read-only web application: a zoomable world map of socio-legal association seats with a searchable side panel and detail cards, reading live from Wikidata with an offline snapshot fallback, as hand-written static files with no build step.

**Architecture:** Layered ES modules with an inward dependency rule — pure `core/` logic (no DOM/network), `ports/` interfaces, `adapters/` (SPARQL, cache), framework-free `ui/` (map, panel, card) wired by a `src/app.js` composition root. A tiny observable store drives per-region re-render. A GitHub Action refreshes `data/snapshot.json`.

**Tech Stack:** Native ES modules (no bundler), Leaflet 1.9.4 (vendored, SRI-pinned), Wikidata Query Service (SPARQL over HTTPS), `node:test` + `jsdom` for tests (dev-only), Python `http.server` for local serving.

Specs: [`../spec/2026-09-01-socio-legal-associations-directory-design.md`](../spec/2026-09-01-socio-legal-associations-directory-design.md) ("data spec"), [`../spec/2026-09-02-ui-design.md`](../spec/2026-09-02-ui-design.md) ("UI spec").

---

## File Structure

**Remove (Python stubs, not part of this project):** `main.py`, `pyproject.toml`, `.python-version`

**Create:**

| Path | Responsibility |
| --- | --- |
| `.gitignore` | ignore `node_modules`, editor cruft |
| `README.md` | run locally, make common changes, deploy |
| `index.html` | app shell: map container, panel container, `<template>`s, module script tag |
| `config.json` | runtime config (QIDs, languages, endpoints, tile URL, feature flags) |
| `styles/tokens.css` | design tokens (colour/spacing/type), light + dark |
| `styles/app.css` | layout + component styles, consumes only tokens |
| `src/app.js` | composition root: load config, detect mode (read-only here), build adapters, load directory, wire router + regions |
| `src/store.js` | `createStore` — minimal observable state |
| `src/render.js` | `html` tagged template + `escapeHtml` + `mount` |
| `src/core/model.js` | JSDoc typedefs, `emptyAssociation`, `hasFixedLocation`, `deriveScope` |
| `src/core/parse-wkt.js` | `parsePoint("Point(lon lat)") → [lon,lat]` |
| `src/core/resolve-location.js` | `resolveSeatPin`, `resolveLeadershipPin` (map-pin precedence) |
| `src/core/filter.js` | `filterAssociations(list, {countryCode, text})`, `partitionByLocation` |
| `src/ports/index.js` | JSDoc typedefs for `WikidataReadPort`, `CachePort` |
| `src/adapters/sparql-client.js` | `buildDirectoryQuery`, `mapBindings`, `queryDirectory` — the only file with SPARQL |
| `src/adapters/browser-cache.js` | `createCache`, `loadDirectory` (cache → live → snapshot) |
| `src/ui/components/notify-link.js` | `watchlistUrl`, `historyFeedUrl`, `relatedChangesFeedUrl` |
| `src/ui/association-card.js` | `renderAssociationCard(assoc, opts)` → HTML string |
| `src/ui/directory-panel.js` | `renderPanel(state)` → HTML string |
| `src/ui/map-view.js` | `toMapPins` (pure) + `createMapView` (Leaflet glue) |
| `data/snapshot.json` | committed offline fallback dataset (seed small; CI refreshes) |
| `data/centroids.json` | ISO alpha-2 → `[lon,lat]` country centroids |
| `scripts/build-centroids.mjs` | derive `data/centroids.json` from a Natural Earth GeoJSON |
| `scripts/refresh-snapshot.mjs` | run the directory query, write `data/snapshot.json` |
| `.github/workflows/snapshot.yml` | schedule `refresh-snapshot.mjs`, commit changes |
| `vendor/leaflet.js`, `vendor/leaflet.css` | pinned Leaflet 1.9.4, referenced with SRI |
| `dev/package.json` | dev-only: `jsdom`, `test` script (`node --test`) |
| `dev/serve.md` | one-liner to serve the site locally |
| `dev/tests/**/*.test.js` | tests mirroring `src/` |

**Dependency rule:** `ui/ → core/`, `ui/ → ports/`, `adapters/ → core/`, `adapters/ → ports/`. `core/` imports only `core/`. `app.js` imports everything and wires it.

---

## Task 1: Project scaffold and dev tooling

**Files:**
- Delete: `main.py`, `pyproject.toml`, `.python-version`
- Create: `.gitignore`, `README.md`, `dev/package.json`, `dev/serve.md`, `config.json`

- [ ] **Step 1: Remove Python stubs**

Run:
```bash
git rm -f main.py pyproject.toml .python-version 2>/dev/null || rm -f main.py pyproject.toml .python-version
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
*.log
dev/node_modules/
```

- [ ] **Step 3: Create `dev/package.json`**

```json
{
  "name": "socio-legal-wikidata-dev",
  "private": true,
  "type": "module",
  "description": "Dev-only tooling for the directory app. NOT required to build or deploy.",
  "scripts": {
    "test": "node --test tests/"
  },
  "devDependencies": {
    "jsdom": "^24.1.0"
  }
}
```

- [ ] **Step 4: Create `dev/serve.md`**

```markdown
# Run the site locally

From the repository root:

    python3 -m http.server 8000

Then open http://localhost:8000/ . ES modules and cross-origin calls to
Wikidata work fine from `http://localhost`.

# Run the tests

    cd dev && npm install && npm test
```

- [ ] **Step 5: Create `config.json`**

```json
{
  "sparqlEndpoint": "https://query.wikidata.org/sparql",
  "inScopeClassQid": "Q955824",
  "inScopeFieldQid": "Q2734663",
  "labelLanguages": "en,de,fr,es",
  "snapshotUrl": "data/snapshot.json",
  "centroidsUrl": "data/centroids.json",
  "cacheTtlMs": 86400000,
  "tileUrl": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  "tileAttribution": "© OpenStreetMap contributors",
  "leadershipLayerDefault": false
}
```

- [ ] **Step 6: Create `README.md`**

```markdown
# Directory of Socio-Legal Associations

A public, read-only world map of socio-legal scholarly associations, reading
live from Wikidata. Hand-written static files — **no build step**.

- Design specs: [`docs/spec/`](docs/spec/)
- Implementation plans: [`docs/plans/`](docs/plans/)

## Run locally

    python3 -m http.server 8000    # then open http://localhost:8000/

## Tests

    cd dev && npm install && npm test

## Deploy

Copy every file except `dev/`, `docs/`, `scripts/`, `.github/` to a web
server that serves over HTTPS. No server-side code required.

## Change common things without touching code

Edit `config.json`: in-scope Wikidata QIDs, label languages, map tile
source, cache lifetime.
```

- [ ] **Step 7: Install dev deps and verify the runner works**

Run:
```bash
cd dev && npm install && node --test tests/ 2>&1 | tail -5
```
Expected: exits 0. With no test files yet it reports `tests 0` / `pass 0` (Node prints "no test files found" as a notice but exit code is 0). If it exits non-zero because the `tests/` dir is missing, create it: `mkdir -p dev/tests`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold static app, remove python stubs, add dev test runner"
```

---

## Task 2: `core/model.js` — types and helpers

**Files:**
- Create: `src/core/model.js`
- Test: `dev/tests/core/model.test.js`

- [ ] **Step 1: Write the failing test**

`dev/tests/core/model.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation, hasFixedLocation, deriveScope } from '../../../src/core/model.js';

test('emptyAssociation has all keys nulled and qid set', () => {
  const a = emptyAssociation('Q1');
  assert.equal(a.qid, 'Q1');
  assert.equal(a.label, '');
  assert.equal(a.seatCoord, null);
  assert.equal(a.president, null);
  assert.equal(a.journal, null);
});

test('hasFixedLocation true when seatCoord is a pair', () => {
  assert.equal(hasFixedLocation({ ...emptyAssociation('Q1'), seatCoord: [12.5, 41.9] }), true);
});

test('hasFixedLocation true when countryCode set, false when neither', () => {
  assert.equal(hasFixedLocation({ ...emptyAssociation('Q1'), countryCode: 'DE' }), true);
  assert.equal(hasFixedLocation(emptyAssociation('Q1')), false);
});

test('deriveScope: parent -> section, operating area -> regional, country -> national, else international', () => {
  const base = emptyAssociation('Q1');
  assert.equal(deriveScope({ ...base, parentQid: 'Q9' }), 'section');
  assert.equal(deriveScope({ ...base, operatingAreaQid: 'Q30' }), 'regional');
  assert.equal(deriveScope({ ...base, countryCode: 'DE' }), 'national');
  assert.equal(deriveScope(base), 'international');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/core/model.test.js`
Expected: FAIL — `Cannot find module '.../src/core/model.js'`.

- [ ] **Step 3: Write `src/core/model.js`**

```js
/**
 * @typedef {[number, number]} LonLat  // [longitude, latitude]
 *
 * @typedef {Object} PersonRef
 * @property {string} qid
 * @property {string} label
 * @property {string|null} url
 *
 * @typedef {Object} JournalRef
 * @property {string} qid
 * @property {string} label
 * @property {string|null} url
 * @property {string|null} issn
 *
 * @typedef {Object} Association
 * @property {string} qid
 * @property {string} label
 * @property {string} description
 * @property {string|null} countryCode      // ISO 3166-1 alpha-2, uppercase
 * @property {string|null} countryLabel
 * @property {string|null} operatingAreaQid // P2541
 * @property {string|null} seatQid          // P159
 * @property {string|null} seatLabel
 * @property {LonLat|null} seatCoord
 * @property {string|null} parentQid        // P361
 * @property {string|null} parentLabel
 * @property {string|null} website          // P856
 * @property {string|null} email            // P968
 * @property {string|null} inception        // year as string
 * @property {PersonRef|null} president
 * @property {string|null} leadUniQid
 * @property {string|null} leadUniLabel
 * @property {LonLat|null} leadCoord
 * @property {JournalRef|null} journal
 *
 * @typedef {Object} Directory
 * @property {Association[]} associations
 * @property {boolean} stale
 * @property {string|null} asOf
 */

/** @param {string} [qid] @returns {Association} */
export function emptyAssociation(qid = '') {
  return {
    qid,
    label: '',
    description: '',
    countryCode: null,
    countryLabel: null,
    operatingAreaQid: null,
    seatQid: null,
    seatLabel: null,
    seatCoord: null,
    parentQid: null,
    parentLabel: null,
    website: null,
    email: null,
    inception: null,
    president: null,
    leadUniQid: null,
    leadUniLabel: null,
    leadCoord: null,
    journal: null,
  };
}

/** @param {Association} a @returns {boolean} */
export function hasFixedLocation(a) {
  return Array.isArray(a.seatCoord) || typeof a.countryCode === 'string';
}

/**
 * Coarse display facet. Not stored in Wikidata as one property; derived here.
 * @param {Association} a
 * @returns {'section'|'regional'|'national'|'international'}
 */
export function deriveScope(a) {
  if (a.parentQid) return 'section';
  if (a.operatingAreaQid) return 'regional';
  if (a.countryCode) return 'national';
  return 'international';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/core/model.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/model.js dev/tests/core/model.test.js
git commit -m "feat(core): association model types and helpers"
```

---

## Task 3: `core/parse-wkt.js` — coordinate parsing

**Files:**
- Create: `src/core/parse-wkt.js`
- Test: `dev/tests/core/parse-wkt.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoint } from '../../../src/core/parse-wkt.js';

test('parsePoint reads "Point(lon lat)" into [lon, lat] numbers', () => {
  assert.deepEqual(parsePoint('Point(12.4964 41.9028)'), [12.4964, 41.9028]);
});

test('parsePoint tolerates leading/trailing whitespace and negative values', () => {
  assert.deepEqual(parsePoint('  Point(-73.9857 40.7484)  '), [-73.9857, 40.7484]);
});

test('parsePoint returns null for anything unparseable', () => {
  assert.equal(parsePoint(''), null);
  assert.equal(parsePoint(undefined), null);
  assert.equal(parsePoint('POLYGON((0 0,1 1,1 0,0 0))'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/core/parse-wkt.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/parse-wkt.js`**

```js
/**
 * Parse a WKT point as returned by the Wikidata Query Service.
 * @param {unknown} wkt e.g. "Point(12.4964 41.9028)"
 * @returns {[number, number]|null} [longitude, latitude] or null
 */
export function parsePoint(wkt) {
  if (typeof wkt !== 'string') return null;
  const m = wkt.trim().match(/^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/core/parse-wkt.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/parse-wkt.js dev/tests/core/parse-wkt.test.js
git commit -m "feat(core): WKT point parser"
```

---

## Task 4: `core/resolve-location.js` — map-pin precedence

Implements data spec §2.4: seat `P159→P625` → country centroid → "no fixed location"; leadership layer from president's university coordinate.

**Files:**
- Create: `src/core/resolve-location.js`
- Test: `dev/tests/core/resolve-location.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { resolveSeatPin, resolveLeadershipPin } from '../../../src/core/resolve-location.js';

const centroids = { DE: [10.45, 51.16], FR: [2.35, 46.6] };

test('resolveSeatPin prefers an explicit seat coordinate', () => {
  const a = { ...emptyAssociation('Q1'), seatCoord: [13.4, 52.5], countryCode: 'DE' };
  assert.deepEqual(resolveSeatPin(a, centroids), { coord: [13.4, 52.5], kind: 'seat' });
});

test('resolveSeatPin falls back to the country centroid', () => {
  const a = { ...emptyAssociation('Q1'), countryCode: 'DE' };
  assert.deepEqual(resolveSeatPin(a, centroids), { coord: [10.45, 51.16], kind: 'country' });
});

test('resolveSeatPin returns null when neither seat nor known country', () => {
  assert.equal(resolveSeatPin(emptyAssociation('Q1'), centroids), null);
  assert.equal(resolveSeatPin({ ...emptyAssociation('Q1'), countryCode: 'ZZ' }, centroids), null);
});

test('resolveLeadershipPin uses the president university coordinate or null', () => {
  const a = { ...emptyAssociation('Q1'), leadCoord: [114.1, 22.3], leadUniLabel: 'HKU' };
  assert.deepEqual(resolveLeadershipPin(a), { coord: [114.1, 22.3], label: 'HKU' });
  assert.equal(resolveLeadershipPin(emptyAssociation('Q1')), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/core/resolve-location.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/resolve-location.js`**

```js
/**
 * @typedef {import('./model.js').Association} Association
 * @typedef {import('./model.js').LonLat} LonLat
 * @typedef {Object<string, LonLat>} CentroidTable  // ISO alpha-2 -> [lon,lat]
 */

/**
 * Primary map pin for an association. Precedence (data spec §2.4):
 *   1. seat coordinate (P159 -> P625)
 *   2. country centroid (P17 -> table)
 *   3. null  -> caller lists it under "no fixed location"
 * @param {Association} a
 * @param {CentroidTable} centroids
 * @returns {{coord: LonLat, kind: 'seat'|'country'}|null}
 */
export function resolveSeatPin(a, centroids) {
  if (Array.isArray(a.seatCoord)) return { coord: a.seatCoord, kind: 'seat' };
  const cc = a.countryCode;
  if (cc && centroids[cc]) return { coord: centroids[cc], kind: 'country' };
  return null;
}

/**
 * Secondary "current leadership" marker: the president's university coordinate.
 * @param {Association} a
 * @returns {{coord: LonLat, label: string}|null}
 */
export function resolveLeadershipPin(a) {
  if (!Array.isArray(a.leadCoord)) return null;
  return { coord: a.leadCoord, label: a.leadUniLabel || a.president?.label || '' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/core/resolve-location.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/resolve-location.js dev/tests/core/resolve-location.test.js
git commit -m "feat(core): map-pin resolution precedence"
```

---

## Task 5: `core/filter.js` — search and country filtering

**Files:**
- Create: `src/core/filter.js`
- Test: `dev/tests/core/filter.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { filterAssociations, partitionByLocation } from '../../../src/core/filter.js';

const centroids = { DE: [10.45, 51.16] };
const de = { ...emptyAssociation('Q1'), label: 'German Association for Law and Society', countryCode: 'DE' };
const asia = { ...emptyAssociation('Q2'), label: 'Asian Law and Society Association', seatCoord: [139.7, 35.7] };
const roaming = { ...emptyAssociation('Q3'), label: 'Commission on Legal Pluralism' };

test('filterAssociations by countryCode', () => {
  assert.deepEqual(filterAssociations([de, asia, roaming], { countryCode: 'DE' }).map(a => a.qid), ['Q1']);
});

test('filterAssociations by case-insensitive substring on label', () => {
  assert.deepEqual(filterAssociations([de, asia, roaming], { text: 'law and society' }).map(a => a.qid), ['Q1', 'Q2']);
});

test('filterAssociations with empty criteria returns all', () => {
  assert.equal(filterAssociations([de, asia, roaming], {}).length, 3);
});

test('partitionByLocation splits mapped vs no-fixed-location', () => {
  const { mapped, unlocated } = partitionByLocation([de, asia, roaming], centroids);
  assert.deepEqual(mapped.map(a => a.qid), ['Q1', 'Q2']);
  assert.deepEqual(unlocated.map(a => a.qid), ['Q3']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/core/filter.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/filter.js`**

```js
import { resolveSeatPin } from './resolve-location.js';

/**
 * @typedef {import('./model.js').Association} Association
 * @param {Association[]} list
 * @param {{countryCode?: string, text?: string}} criteria
 * @returns {Association[]}
 */
export function filterAssociations(list, { countryCode, text } = {}) {
  const needle = (text || '').trim().toLowerCase();
  return list.filter((a) => {
    if (countryCode && a.countryCode !== countryCode) return false;
    if (needle && !a.label.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/**
 * @param {Association[]} list
 * @param {Object<string, [number,number]>} centroids
 * @returns {{mapped: Association[], unlocated: Association[]}}
 */
export function partitionByLocation(list, centroids) {
  const mapped = [];
  const unlocated = [];
  for (const a of list) {
    (resolveSeatPin(a, centroids) ? mapped : unlocated).push(a);
  }
  return { mapped, unlocated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/core/filter.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/filter.js dev/tests/core/filter.test.js
git commit -m "feat(core): association filtering and location partitioning"
```

---

## Task 6: `ports/index.js` — interface typedefs

**Files:**
- Create: `src/ports/index.js`
- Test: none (typedefs only; consumed by later tasks)

- [ ] **Step 1: Write `src/ports/index.js`**

```js
/**
 * @typedef {import('../core/model.js').Directory} Directory
 * @typedef {import('../core/model.js').Association} Association
 *
 * @typedef {Object} WikidataReadPort
 * @property {() => Promise<Association[]>} queryDirectory
 *   Fetch every in-scope association from the live query service.
 *
 * @typedef {Object} CachePort
 * @property {(key: string, maxAgeMs: number) => (any|null)} get
 * @property {(key: string, value: any) => void} set
 */
export {};
```

- [ ] **Step 2: Commit**

```bash
git add src/ports/index.js
git commit -m "feat(ports): read + cache interface typedefs"
```

---

## Task 7: `adapters/sparql-client.js` — query build + binding map

**Files:**
- Create: `src/adapters/sparql-client.js`
- Test: `dev/tests/adapters/sparql-client.test.js`
- Test fixture: `dev/tests/fixtures/sparql-directory.json`

- [ ] **Step 1: Create the fixture `dev/tests/fixtures/sparql-directory.json`**

A trimmed real-shape WDQS JSON response (two associations; one with a seat + journal + president, one country-only).
```json
{
  "head": { "vars": ["assoc","assocLabel","assocDescription","website","email","inception","country","countryLabel","countryCode","operating","seat","seatLabel","seatCoord","parent","parentLabel","president","presidentLabel","presidentUrl","leadUni","leadUniLabel","leadCoord","journal","journalLabel","journalUrl","issn"] },
  "results": { "bindings": [
    {
      "assoc": { "type": "uri", "value": "http://www.wikidata.org/entity/Q2145564" },
      "assocLabel": { "type": "literal", "value": "Research Committee on the Sociology of Law" },
      "assocDescription": { "type": "literal", "value": "international scholarly association" },
      "website": { "type": "literal", "value": "https://rcsl.hypotheses.org" },
      "email": { "type": "literal", "value": "m.kortabarria@iisj.es" },
      "inception": { "type": "literal", "value": "1962" },
      "seat": { "type": "uri", "value": "http://www.wikidata.org/entity/Q1015907" },
      "seatLabel": { "type": "literal", "value": "Oñati" },
      "seatCoord": { "type": "literal", "value": "Point(2.4102 43.0356)" },
      "president": { "type": "uri", "value": "http://www.wikidata.org/entity/Q125" },
      "presidentLabel": { "type": "literal", "value": "Pierre Guibentif" },
      "presidentUrl": { "type": "literal", "value": "https://example.org/guibentif" },
      "leadUni": { "type": "uri", "value": "http://www.wikidata.org/entity/Q608593" },
      "leadUniLabel": { "type": "literal", "value": "ISCTE" },
      "leadCoord": { "type": "literal", "value": "Point(-9.1533 38.7486)" },
      "journal": { "type": "uri", "value": "http://www.wikidata.org/entity/Q7100448" },
      "journalLabel": { "type": "literal", "value": "Oñati Socio-Legal Series" },
      "journalUrl": { "type": "literal", "value": "https://opo.iisj.net/index.php/osls" },
      "issn": { "type": "literal", "value": "2079-5971" }
    },
    {
      "assoc": { "type": "uri", "value": "http://www.wikidata.org/entity/Q112" },
      "assocLabel": { "type": "literal", "value": "German Association for Law and Society" },
      "assocDescription": { "type": "literal", "value": "German learned society" },
      "website": { "type": "literal", "value": "https://rechtssoziologie.info" },
      "country": { "type": "uri", "value": "http://www.wikidata.org/entity/Q183" },
      "countryLabel": { "type": "literal", "value": "Germany" },
      "countryCode": { "type": "literal", "value": "DE" }
    }
  ]}
}
```

- [ ] **Step 2: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildDirectoryQuery, mapBindings, queryDirectory } from '../../../src/adapters/sparql-client.js';

const cfg = { inScopeClassQid: 'Q955824', inScopeFieldQid: 'Q2734663', labelLanguages: 'en,de' };

test('buildDirectoryQuery injects config and keeps the key triples', () => {
  const q = buildDirectoryQuery(cfg);
  assert.match(q, /wd:Q955824/);
  assert.match(q, /wdt:P101 wd:Q2734663/);
  assert.match(q, /wdt:P159 \?seat/);
  assert.match(q, /wdt:P123 \?assoc/);
  assert.match(q, /bd:serviceParam wikibase:language "en,de"/);
});

test('mapBindings reduces rows to one Association per qid with nested refs', async () => {
  const json = JSON.parse(await readFile(new URL('../fixtures/sparql-directory.json', import.meta.url)));
  const list = mapBindings(json);
  assert.equal(list.length, 2);
  const rcsl = list.find(a => a.qid === 'Q2145564');
  assert.equal(rcsl.label, 'Research Committee on the Sociology of Law');
  assert.equal(rcsl.seatQid, 'Q1015907');
  assert.deepEqual(rcsl.seatCoord, [2.4102, 43.0356]);
  assert.equal(rcsl.president.qid, 'Q125');
  assert.equal(rcsl.president.url, 'https://example.org/guibentif');
  assert.deepEqual(rcsl.leadCoord, [-9.1533, 38.7486]);
  assert.equal(rcsl.journal.issn, '2079-5971');
  const vrug = list.find(a => a.qid === 'Q112');
  assert.equal(vrug.countryCode, 'DE');
  assert.equal(vrug.seatCoord, null);
  assert.equal(vrug.president, null);
  assert.equal(vrug.journal, null);
});

test('queryDirectory posts urlencoded query and returns mapped list', async () => {
  const json = JSON.parse(await readFile(new URL('../fixtures/sparql-directory.json', import.meta.url)));
  let seen = {};
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => json };
  };
  const list = await queryDirectory({ fetch: fakeFetch, endpoint: 'https://wdqs.example/sparql', cfg });
  assert.equal(list.length, 2);
  assert.match(seen.url, /^https:\/\/wdqs\.example\/sparql\?query=/);
  assert.equal(seen.init.headers.Accept, 'application/sparql-results+json');
});

test('queryDirectory throws on non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(
    () => queryDirectory({ fetch: fakeFetch, endpoint: 'https://x/sparql', cfg }),
    /SPARQL query failed: 503/,
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd dev && node --test tests/adapters/sparql-client.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/adapters/sparql-client.js`**

```js
import { emptyAssociation } from '../core/model.js';
import { parsePoint } from '../core/parse-wkt.js';

/**
 * @typedef {import('../core/model.js').Association} Association
 */

const QUERY_TEMPLATE = `SELECT ?assoc ?assocLabel ?assocDescription ?website ?email ?inception
       ?country ?countryLabel ?countryCode ?operating
       ?seat ?seatLabel ?seatCoord ?parent ?parentLabel
       ?president ?presidentLabel ?presidentUrl
       ?leadUni ?leadUniLabel ?leadCoord
       ?journal ?journalLabel ?journalUrl ?issn
WHERE {
  ?assoc wdt:P31/wdt:P279* wd:%CLASS% .
  ?assoc wdt:P101 wd:%FIELD% .
  OPTIONAL { ?assoc wdt:P856 ?website. }
  OPTIONAL { ?assoc wdt:P968 ?email. }
  OPTIONAL { ?assoc wdt:P571 ?inceptionDate. BIND(STR(YEAR(?inceptionDate)) AS ?inception) }
  OPTIONAL { ?assoc wdt:P17 ?country. OPTIONAL { ?country wdt:P297 ?countryCode. } }
  OPTIONAL { ?assoc wdt:P2541 ?operating. }
  OPTIONAL { ?assoc wdt:P361 ?parent. }
  OPTIONAL {
    ?assoc wdt:P159 ?seat.
    OPTIONAL { ?seat wdt:P625 ?seatCoord. }
    OPTIONAL { ?seat wdt:P159/wdt:P625 ?seatCoord. }
  }
  OPTIONAL {
    ?assoc p:P488 ?chair. ?chair ps:P488 ?president.
    FILTER NOT EXISTS { ?chair pq:P582 ?chairEnd. }
    OPTIONAL { ?president wdt:P856 ?presidentUrl. }
    OPTIONAL { ?president wdt:P108 ?leadUniA. }
    OPTIONAL { ?president wdt:P1416 ?leadUniB. }
    BIND(COALESCE(?leadUniA, ?leadUniB) AS ?leadUni)
    OPTIONAL { ?leadUni wdt:P625 ?leadCoord. }
    OPTIONAL { ?leadUni wdt:P159/wdt:P625 ?leadCoord. }
  }
  OPTIONAL {
    ?journal wdt:P123 ?assoc .
    ?journal wdt:P31/wdt:P279* wd:Q737498 .
    OPTIONAL { ?journal wdt:P856 ?journalUrl. }
    OPTIONAL { ?journal wdt:P236 ?issn. }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "%LANGS%". }
}`;

/** @param {{inScopeClassQid: string, inScopeFieldQid: string, labelLanguages: string}} cfg */
export function buildDirectoryQuery(cfg) {
  return QUERY_TEMPLATE
    .replace('%CLASS%', cfg.inScopeClassQid)
    .replace('%FIELD%', cfg.inScopeFieldQid)
    .replace('%LANGS%', cfg.labelLanguages);
}

const val = (b) => (b ? b.value : undefined);
const qid = (b) => (b ? b.value.replace('http://www.wikidata.org/entity/', '') : null);

/** @param {any} sparqlJson @returns {Association[]} */
export function mapBindings(sparqlJson) {
  /** @type {Map<string, Association>} */
  const byQid = new Map();
  for (const row of sparqlJson.results.bindings) {
    const id = qid(row.assoc);
    if (!id) continue;
    let a = byQid.get(id);
    if (!a) {
      a = emptyAssociation(id);
      byQid.set(id, a);
    }
    a.label ||= val(row.assocLabel) || id;
    a.description ||= val(row.assocDescription) || '';
    a.website ??= val(row.website) ?? null;
    a.email ??= val(row.email) ?? null;
    a.inception ??= val(row.inception) ?? null;
    a.countryCode ??= (val(row.countryCode) || '').toUpperCase() || null;
    a.countryLabel ??= val(row.countryLabel) ?? null;
    a.operatingAreaQid ??= qid(row.operating);
    a.seatQid ??= qid(row.seat);
    a.seatLabel ??= val(row.seatLabel) ?? null;
    a.seatCoord ??= parsePoint(val(row.seatCoord));
    a.parentQid ??= qid(row.parent);
    a.parentLabel ??= val(row.parentLabel) ?? null;
    a.leadUniQid ??= qid(row.leadUni);
    a.leadUniLabel ??= val(row.leadUniLabel) ?? null;
    a.leadCoord ??= parsePoint(val(row.leadCoord));
    if (!a.president && row.president) {
      a.president = { qid: qid(row.president), label: val(row.presidentLabel) || '', url: val(row.presidentUrl) ?? null };
    }
    if (!a.journal && row.journal) {
      a.journal = {
        qid: qid(row.journal),
        label: val(row.journalLabel) || '',
        url: val(row.journalUrl) ?? null,
        issn: val(row.issn) ?? null,
      };
    }
  }
  return [...byQid.values()].sort((x, y) => x.label.localeCompare(y.label));
}

/**
 * @param {{fetch: typeof fetch, endpoint: string, cfg: any}} deps
 * @returns {Promise<Association[]>}
 */
export async function queryDirectory({ fetch, endpoint, cfg }) {
  const url = `${endpoint}?query=${encodeURIComponent(buildDirectoryQuery(cfg))}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`SPARQL query failed: ${res.status}`);
  return mapBindings(await res.json());
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd dev && node --test tests/adapters/sparql-client.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/sparql-client.js dev/tests/adapters/sparql-client.test.js dev/tests/fixtures/sparql-directory.json
git commit -m "feat(adapters): SPARQL directory query builder and binding mapper"
```

---

## Task 8: `adapters/browser-cache.js` — cache + snapshot fallback

**Files:**
- Create: `src/adapters/browser-cache.js`
- Test: `dev/tests/adapters/browser-cache.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache, loadDirectory } from '../../../src/adapters/browser-cache.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('createCache stores and returns a value within maxAge, null when stale', () => {
  let now = 1000;
  const cache = createCache({ storage: memStorage(), now: () => now });
  cache.set('k', { a: 1 });
  assert.deepEqual(cache.get('k', 500), { a: 1 });
  now = 2000;
  assert.equal(cache.get('k', 500), null);
});

test('loadDirectory: fresh cache short-circuits the network', async () => {
  const storage = memStorage();
  const cache = createCache({ storage, now: () => 0 });
  cache.set('directory', [{ qid: 'Q1' }]);
  const out = await loadDirectory({
    cache, ttlMs: 1000, now: () => 0,
    queryDirectory: async () => { throw new Error('should not be called'); },
    fetch: async () => { throw new Error('should not be called'); },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.equal(out.stale, false);
  assert.deepEqual(out.associations, [{ qid: 'Q1' }]);
});

test('loadDirectory: live query used and cached when cache is cold', async () => {
  const storage = memStorage();
  const cache = createCache({ storage, now: () => 0 });
  const out = await loadDirectory({
    cache, ttlMs: 1000, now: () => 0,
    queryDirectory: async () => [{ qid: 'Q2' }],
    fetch: async () => { throw new Error('no'); },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.equal(out.stale, false);
  assert.deepEqual(out.associations, [{ qid: 'Q2' }]);
  assert.deepEqual(cache.get('directory', 1000), [{ qid: 'Q2' }]);
});

test('loadDirectory: falls back to the bundled snapshot on live failure', async () => {
  const cache = createCache({ storage: memStorage(), now: () => 0 });
  const out = await loadDirectory({
    cache, ttlMs: 1000, now: () => 1_700_000_000_000,
    queryDirectory: async () => { throw new Error('offline'); },
    fetch: async (u) => {
      assert.equal(u, 'data/snapshot.json');
      return { ok: true, json: async () => ({ generatedAt: '2026-09-01', associations: [{ qid: 'Q3' }] }) };
    },
    snapshotUrl: 'data/snapshot.json',
  });
  assert.equal(out.stale, true);
  assert.equal(out.asOf, '2026-09-01');
  assert.deepEqual(out.associations, [{ qid: 'Q3' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/adapters/browser-cache.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/adapters/browser-cache.js`**

```js
/**
 * @typedef {import('../core/model.js').Directory} Directory
 */

/**
 * @param {{storage: Storage, now?: () => number}} deps
 * @returns {import('../ports/index.js').CachePort}
 */
export function createCache({ storage, now = () => Date.now() }) {
  return {
    get(key, maxAgeMs) {
      const raw = storage.getItem(`slw:${key}`);
      if (!raw) return null;
      try {
        const { t, v } = JSON.parse(raw);
        if (now() - t > maxAgeMs) return null;
        return v;
      } catch {
        return null;
      }
    },
    set(key, value) {
      storage.setItem(`slw:${key}`, JSON.stringify({ t: now(), v: value }));
    },
  };
}

/**
 * Cache -> live query -> bundled snapshot.
 * @param {{
 *   cache: import('../ports/index.js').CachePort,
 *   queryDirectory: () => Promise<any[]>,
 *   fetch: typeof fetch,
 *   snapshotUrl: string,
 *   ttlMs: number,
 *   now?: () => number,
 * }} deps
 * @returns {Promise<Directory>}
 */
export async function loadDirectory({ cache, queryDirectory, fetch, snapshotUrl, ttlMs, now = () => Date.now() }) {
  const cached = cache.get('directory', ttlMs);
  if (cached) return { associations: cached, stale: false, asOf: null };

  try {
    const associations = await queryDirectory();
    cache.set('directory', associations);
    return { associations, stale: false, asOf: null };
  } catch {
    const res = await fetch(snapshotUrl);
    if (!res.ok) throw new Error(`snapshot fetch failed: ${res.status}`);
    const snap = await res.json();
    return { associations: snap.associations || [], stale: true, asOf: snap.generatedAt || null };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/adapters/browser-cache.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/browser-cache.js dev/tests/adapters/browser-cache.test.js
git commit -m "feat(adapters): localStorage cache with snapshot fallback"
```

---

## Task 9: `store.js` — minimal observable

**Files:**
- Create: `src/store.js`
- Test: `dev/tests/store.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/store.js';

test('createStore notifies subscribers on setState and merges shallowly', () => {
  const store = createStore({ a: 1, b: 2 });
  const seen = [];
  const off = store.subscribe((s) => seen.push({ ...s }));
  store.setState({ b: 3 });
  assert.deepEqual(store.getState(), { a: 1, b: 3 });
  assert.deepEqual(seen, [{ a: 1, b: 3 }]);
  off();
  store.setState({ a: 9 });
  assert.equal(seen.length, 1);
});

test('setState accepts an updater function', () => {
  const store = createStore({ n: 0 });
  store.setState((s) => ({ n: s.n + 1 }));
  assert.equal(store.getState().n, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/store.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/store.js`**

```js
/**
 * Minimal observable store. Shallow-merge updates; synchronous notification.
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = initial;
  const subscribers = new Set();
  return {
    getState: () => state,
    /** @param {Partial<T> | ((s: T) => Partial<T>)} patch */
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const fn of subscribers) fn(state);
    },
    /** @param {(s: T) => void} fn @returns {() => void} */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/store.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/store.js dev/tests/store.test.js
git commit -m "feat: minimal observable store"
```

---

## Task 10: `render.js` — HTML templating helper

**Files:**
- Create: `src/render.js`
- Test: `dev/tests/render.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, escapeHtml } from '../../src/render.js';

test('escapeHtml neutralises angle brackets, quotes, ampersands', () => {
  assert.equal(escapeHtml(`<a href="x">&`), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('html interpolates and escapes string values', () => {
  const out = html`<p>${'<script>'}</p>`;
  assert.equal(out, '<p>&lt;script&gt;</p>');
});

test('html joins arrays without separators and does not double-escape trusted fragments', () => {
  const rows = ['a', 'b'].map((c) => html`<li>${c}</li>`);
  assert.equal(html`<ul>${rows}</ul>`, '<ul><li>a</li><li>b</li></ul>');
});

test('html renders null/undefined as empty string', () => {
  assert.equal(html`x${null}y${undefined}z`, 'xyz');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/render.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/render.js`**

```js
/** Marker for already-escaped, trusted HTML produced by `html`. */
class Trusted {
  /** @param {string} s */
  constructor(s) {
    this.value = s;
  }
}

/** @param {unknown} s @returns {string} */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @param {unknown} v @returns {string} */
function part(v) {
  if (v == null || v === false) return '';
  if (v instanceof Trusted) return v.value;
  if (Array.isArray(v)) return v.map(part).join('');
  return escapeHtml(v);
}

/**
 * Tagged template that escapes interpolations. Nest with `html` to compose
 * trusted fragments.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {Trusted}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Trusted(out);
}

/**
 * Replace the contents of `parent` with the rendered fragment.
 * @param {Element} parent
 * @param {Trusted|string} rendered
 */
export function mount(parent, rendered) {
  parent.innerHTML = rendered instanceof Trusted ? rendered.value : String(rendered);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/render.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render.js dev/tests/render.test.js
git commit -m "feat: html templating helper with escaping"
```

---

## Task 11: `ui/components/notify-link.js` — subscribe URLs

**Files:**
- Create: `src/ui/components/notify-link.js`
- Test: `dev/tests/ui/notify-link.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchlistUrl, historyFeedUrl, relatedChangesFeedUrl } from '../../../src/ui/components/notify-link.js';

test('watchlistUrl points at the item with action=watch', () => {
  assert.equal(
    watchlistUrl('Q42'),
    'https://www.wikidata.org/w/index.php?title=Q42&action=watch',
  );
});

test('historyFeedUrl is an atom feed of the item history', () => {
  assert.equal(
    historyFeedUrl('Q42'),
    'https://www.wikidata.org/w/index.php?title=Q42&action=history&feed=atom',
  );
});

test('relatedChangesFeedUrl is an atom feed of related changes', () => {
  assert.equal(
    relatedChangesFeedUrl('Q42'),
    'https://www.wikidata.org/w/index.php?title=Special:RecentChangesLinked&target=Q42&feed=atom',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/ui/notify-link.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/components/notify-link.js`**

```js
const BASE = 'https://www.wikidata.org/w/index.php';

/** @param {string} qid */
export function watchlistUrl(qid) {
  return `${BASE}?title=${qid}&action=watch`;
}

/** @param {string} qid */
export function historyFeedUrl(qid) {
  return `${BASE}?title=${qid}&action=history&feed=atom`;
}

/** @param {string} qid */
export function relatedChangesFeedUrl(qid) {
  return `${BASE}?title=Special:RecentChangesLinked&target=${qid}&feed=atom`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/ui/notify-link.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/notify-link.js dev/tests/ui/notify-link.test.js
git commit -m "feat(ui): notify-me subscribe URL helpers"
```

---

## Task 12: `ui/association-card.js` — detail card

**Files:**
- Create: `src/ui/association-card.js`
- Test: `dev/tests/ui/association-card.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { renderAssociationCard } from '../../../src/ui/association-card.js';

const a = {
  ...emptyAssociation('Q1'),
  label: 'German Association for Law & Society',
  countryCode: 'DE',
  countryLabel: 'Germany',
  seatLabel: 'Berlin',
  website: 'https://rechtssoziologie.info',
  email: 'info@rechtssoziologie.info',
  president: { qid: 'Q5', label: 'Eva Kocher', url: 'https://example.org/kocher' },
  leadUniLabel: 'Europa-Universität Viadrina',
  journal: null,
};

test('renders the label, seat, website, email, president and university', () => {
  const out = renderAssociationCard(a, { editMode: false }).value;
  assert.match(out, /German Association for Law &amp; Society/);
  assert.match(out, /Berlin/);
  assert.match(out, /rechtssoziologie\.info/);
  assert.match(out, /Eva Kocher/);
  assert.match(out, /Europa-Universität Viadrina/);
});

test('shows a "Notify me of changes" link and NO Edit button in read-only mode', () => {
  const out = renderAssociationCard(a, { editMode: false }).value;
  assert.match(out, /Notify me of changes/);
  assert.doesNotMatch(out, /data-action="edit"/);
});

test('shows an Edit button when editMode is true', () => {
  const out = renderAssociationCard(a, { editMode: true }).value;
  assert.match(out, /data-action="edit"/);
});

test('renders a journal line when present, "—" when absent', () => {
  assert.match(renderAssociationCard(a, {}).value, /journal:\s*—/);
  const withJournal = { ...a, journal: { qid: 'Q9', label: 'ZfRS', url: 'https://z', issn: null } };
  assert.match(renderAssociationCard(withJournal, {}).value, /ZfRS/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/ui/association-card.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/association-card.js`**

```js
import { html } from '../render.js';
import { deriveScope } from '../core/model.js';
import { historyFeedUrl, watchlistUrl } from './components/notify-link.js';

/**
 * @param {import('../core/model.js').Association} a
 * @param {{editMode?: boolean}} opts
 * @returns {import('../render.js').Trusted}
 */
export function renderAssociationCard(a, { editMode = false } = {}) {
  const scope = deriveScope(a);
  const place = a.seatLabel || a.countryLabel || 'no fixed location';
  return html`
    <article class="card" data-qid="${a.qid}">
      <h2 class="card__title">${a.label}</h2>
      <p class="card__meta">${scope}${a.countryLabel ? html` · ${a.countryLabel}` : ''}</p>
      ${a.parentLabel ? html`<p class="card__row">part of ${a.parentLabel}</p>` : ''}
      <p class="card__row">seat: ${place}</p>
      ${a.website ? html`<p class="card__row"><a href="${a.website}" rel="noopener" target="_blank">website</a></p>` : ''}
      ${a.email ? html`<p class="card__row"><a href="mailto:${a.email}">${a.email}</a></p>` : ''}
      ${a.president
        ? html`<p class="card__row">president:
            ${a.president.url
              ? html`<a href="${a.president.url}" rel="noopener" target="_blank">${a.president.label}</a>`
              : a.president.label}
            ${a.leadUniLabel ? html`<span class="card__sub">${a.leadUniLabel}</span>` : ''}</p>`
        : ''}
      <p class="card__row">journal:
        ${a.journal
          ? html`<a href="${a.journal.url || '#'}" rel="noopener" target="_blank">${a.journal.label}</a>`
          : '—'}</p>
      <p class="card__actions">
        <a class="card__notify" href="${watchlistUrl(a.qid)}" rel="noopener" target="_blank"
           data-feed="${historyFeedUrl(a.qid)}">Notify me of changes</a>
        ${editMode ? html`<button type="button" data-action="edit" data-qid="${a.qid}">Edit</button>` : ''}
      </p>
    </article>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/ui/association-card.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/association-card.js dev/tests/ui/association-card.test.js
git commit -m "feat(ui): association detail card (read-only, edit button gated)"
```

---

## Task 13: `ui/directory-panel.js` — side panel

**Files:**
- Create: `src/ui/directory-panel.js`
- Test: `dev/tests/ui/directory-panel.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { renderPanel } from '../../../src/ui/directory-panel.js';

const centroids = { DE: [10.45, 51.16] };
const list = [
  { ...emptyAssociation('Q1'), label: 'German Association', countryCode: 'DE', countryLabel: 'Germany' },
  { ...emptyAssociation('Q2'), label: 'Asian Law and Society Association', seatCoord: [139.7, 35.7] },
  { ...emptyAssociation('Q3'), label: 'Commission on Legal Pluralism' },
];

test('renders one row per association plus a search box', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: null, centroids, stale: false }).value;
  assert.match(out, /type="search"/);
  assert.match(out, /data-qid="Q1"/);
  assert.match(out, /data-qid="Q2"/);
});

test('groups items with no fixed location under a heading', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: null, centroids, stale: false }).value;
  assert.match(out, /No fixed location/);
  assert.match(out, /Commission on Legal Pluralism/);
});

test('applies the country filter', () => {
  const out = renderPanel({ associations: list, filter: { countryCode: 'DE' }, selection: null, centroids, stale: false }).value;
  assert.match(out, /data-qid="Q1"/);
  assert.doesNotMatch(out, /data-qid="Q2"/);
});

test('shows the stale banner when stale', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: null, centroids, stale: true, asOf: '2026-09-01' }).value;
  assert.match(out, /saved copy from 2026-09-01/);
});

test('renders the selected association card inline', () => {
  const out = renderPanel({ associations: list, filter: {}, selection: 'Q1', centroids, stale: false }).value;
  assert.match(out, /class="card"/);
  assert.match(out, /German Association/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/ui/directory-panel.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/directory-panel.js`**

```js
import { html } from '../render.js';
import { deriveScope } from '../core/model.js';
import { filterAssociations, partitionByLocation } from '../core/filter.js';
import { renderAssociationCard } from './association-card.js';

/**
 * @param {{
 *   associations: import('../core/model.js').Association[],
 *   filter: {countryCode?: string, text?: string},
 *   selection: string|null,
 *   centroids: Object<string, [number,number]>,
 *   stale: boolean,
 *   asOf?: string|null,
 *   editMode?: boolean,
 * }} state
 * @returns {import('../render.js').Trusted}
 */
export function renderPanel(state) {
  const { associations, filter, selection, centroids, stale, asOf, editMode = false } = state;
  const filtered = filterAssociations(associations, filter);
  const { mapped, unlocated } = partitionByLocation(filtered, centroids);
  const selected = selection ? associations.find((a) => a.qid === selection) : null;

  const row = (a) => html`
    <li>
      <button type="button" class="row" data-qid="${a.qid}" aria-current="${a.qid === selection}">
        <span class="row__label">${a.label}</span>
        <span class="row__meta">${deriveScope(a)}${a.countryLabel ? html` · ${a.countryLabel}` : ''}</span>
      </button>
    </li>`;

  return html`
    <div class="panel">
      ${stale ? html`<p class="panel__banner">Showing a saved copy from ${asOf || 'an earlier date'}.</p>` : ''}
      <label class="panel__search">
        <span class="visually-hidden">Search associations</span>
        <input type="search" placeholder="Search…" value="${filter.text || ''}" data-role="search">
      </label>
      ${filter.countryCode
        ? html`<p class="panel__filter">filter: ${filter.countryCode}
            <button type="button" data-role="clear-filter" aria-label="Clear country filter">×</button></p>`
        : ''}
      ${selected ? renderAssociationCard(selected, { editMode }) : ''}
      <ul class="panel__list">${mapped.map(row)}</ul>
      ${unlocated.length
        ? html`<h3 class="panel__group">No fixed location</h3><ul class="panel__list">${unlocated.map(row)}</ul>`
        : ''}
    </div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/ui/directory-panel.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/directory-panel.js dev/tests/ui/directory-panel.test.js
git commit -m "feat(ui): directory side panel with search, filter, no-location group"
```

---

## Task 14: `ui/map-view.js` — pin transform + Leaflet glue

**Files:**
- Create: `src/ui/map-view.js`
- Test: `dev/tests/ui/map-view.test.js`

- [ ] **Step 1: Write the failing test (pure transform only)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { toMapPins } from '../../../src/ui/map-view.js';

const centroids = { DE: [10.45, 51.16] };
const list = [
  { ...emptyAssociation('Q1'), label: 'Seat body', seatCoord: [13.4, 52.5] },
  { ...emptyAssociation('Q2'), label: 'Country body', countryCode: 'DE' },
  { ...emptyAssociation('Q3'), label: 'Roaming body' },
  { ...emptyAssociation('Q4'), label: 'Has president abroad', seatCoord: [139.7, 35.7], leadCoord: [114.1, 22.3], leadUniLabel: 'HKU' },
];

test('toMapPins produces one seat pin per located association', () => {
  const pins = toMapPins(list, { centroids, showLeadership: false });
  assert.deepEqual(pins.map((p) => p.id), ['Q1:seat', 'Q2:seat', 'Q4:seat']);
  assert.equal(pins[0].layer, 'seat');
  assert.deepEqual(pins[0].coord, [13.4, 52.5]);
});

test('toMapPins adds leadership pins only when showLeadership is true', () => {
  const off = toMapPins(list, { centroids, showLeadership: false });
  assert.equal(off.some((p) => p.layer === 'leadership'), false);
  const on = toMapPins(list, { centroids, showLeadership: true });
  const lead = on.find((p) => p.id === 'Q4:leadership');
  assert.ok(lead);
  assert.deepEqual(lead.coord, [114.1, 22.3]);
  assert.equal(lead.label, 'HKU');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/ui/map-view.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/map-view.js`**

```js
import { resolveSeatPin, resolveLeadershipPin } from '../core/resolve-location.js';

/**
 * @param {import('../core/model.js').Association[]} associations
 * @param {{centroids: Object<string, [number,number]>, showLeadership: boolean}} opts
 * @returns {import('../core/model.js').MapPin[]}
 */
export function toMapPins(associations, { centroids, showLeadership }) {
  /** @type {import('../core/model.js').MapPin[]} */
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

  let seatLayer = L.layerGroup().addTo(map);
  let leadLayer = L.layerGroup().addTo(map);

  function render(pins) {
    seatLayer.clearLayers();
    leadLayer.clearLayers();
    for (const p of pins) {
      const marker = L.circleMarker([p.coord[1], p.coord[0]], {
        radius: p.layer === 'seat' ? 7 : 5,
        className: p.layer === 'seat' ? 'pin pin--seat' : 'pin pin--lead',
      }).bindTooltip(p.label);
      marker.on('click', () => onSelect(p.assocQid));
      (p.layer === 'seat' ? seatLayer : leadLayer).addLayer(marker);
    }
  }

  function focus(coord) {
    map.setView([coord[1], coord[0]], Math.max(map.getZoom(), 5));
  }

  return { render, focus, leaflet: map };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/ui/map-view.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/map-view.js dev/tests/ui/map-view.test.js
git commit -m "feat(ui): map pin transform and Leaflet view wrapper"
```

---

## Task 15: Vendor Leaflet 1.9.4

**Files:**
- Create: `vendor/leaflet.js`, `vendor/leaflet.css`

- [ ] **Step 1: Download the pinned files**

Run:
```bash
mkdir -p vendor
curl -fsSL https://unpkg.com/leaflet@1.9.4/dist/leaflet.js -o vendor/leaflet.js
curl -fsSL https://unpkg.com/leaflet@1.9.4/dist/leaflet.css -o vendor/leaflet.css
curl -fsSL https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png -o vendor/marker-icon.png
curl -fsSL https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png -o vendor/marker-shadow.png
```

- [ ] **Step 2: Compute the SRI hashes (used in `index.html`, Task 16)**

Run:
```bash
for f in vendor/leaflet.js vendor/leaflet.css; do
  printf '%s  sha384-' "$f"
  openssl dgst -sha384 -binary "$f" | openssl base64 -A
  echo
done
```
Record both hashes; you will paste them into `index.html`.

- [ ] **Step 3: Verify the download is the real library**

Run: `grep -c "Leaflet 1.9.4" vendor/leaflet.js`
Expected: `1` or more.

- [ ] **Step 4: Commit**

```bash
git add vendor/
git commit -m "chore(vendor): pin Leaflet 1.9.4"
```

---

## Task 16: `index.html` + styles

**Files:**
- Create: `index.html`, `styles/tokens.css`, `styles/app.css`

- [ ] **Step 1: Create `styles/tokens.css`**

```css
:root {
  --bg: #ffffff;
  --surface: #f8fafc;
  --text: #0f172a;
  --text-muted: #64748b;
  --border: #cbd5e1;
  --accent: #2563eb;
  --accent-contrast: #ffffff;
  --pin-seat: #2563eb;
  --pin-lead: #94a3b8;
  --banner-bg: #fef3c7;
  --banner-text: #92400e;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --radius: 6px;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --text: #e2e8f0;
    --text-muted: #94a3b8;
    --border: #334155;
    --accent: #60a5fa;
    --accent-contrast: #0b1220;
    --pin-lead: #64748b;
    --banner-bg: #422006;
    --banner-text: #fde68a;
  }
}
```

- [ ] **Step 2: Create `styles/app.css`**

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font-family: var(--font); color: var(--text); background: var(--bg); }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}

#app { position: fixed; inset: 0; }
#map { position: absolute; inset: 0; z-index: 0; }

#panel-host {
  position: absolute; z-index: 1; top: 0; left: 0; bottom: 0;
  width: min(360px, 92vw); background: var(--bg);
  border-right: 1px solid var(--border); overflow-y: auto; padding: var(--space-3);
}
#panel-host[hidden] { display: none; }

.panel__banner {
  background: var(--banner-bg); color: var(--banner-text);
  padding: var(--space-2); border-radius: var(--radius); font-size: 0.85rem; margin: 0 0 var(--space-3);
}
.panel__search input { width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius); }
.panel__filter { font-size: 0.85rem; color: var(--text-muted); }
.panel__list { list-style: none; margin: var(--space-3) 0; padding: 0; }
.row {
  display: block; width: 100%; text-align: left; background: none; border: 0;
  padding: var(--space-2); border-radius: var(--radius); cursor: pointer; color: inherit;
}
.row:hover, .row[aria-current="true"] { background: var(--surface); }
.row__label { display: block; }
.row__meta { display: block; font-size: 0.8rem; color: var(--text-muted); }
.panel__group { font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-top: var(--space-4); }

.card { border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-3); margin-bottom: var(--space-3); }
.card__title { font-size: 1rem; margin: 0 0 var(--space-1); }
.card__meta { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 var(--space-2); }
.card__row { margin: var(--space-1) 0; font-size: 0.9rem; }
.card__sub { display: block; font-size: 0.8rem; color: var(--text-muted); }
.card__actions { margin-top: var(--space-3); display: flex; gap: var(--space-2); align-items: center; }

.map-toggle {
  position: absolute; z-index: 1; left: calc(min(360px, 92vw) + var(--space-3)); bottom: var(--space-3);
  background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
  padding: var(--space-2); font-size: 0.85rem;
}
.pin--seat { fill: var(--pin-seat); stroke: #fff; }
.pin--lead { fill: var(--pin-lead); stroke: #fff; }

@media (max-width: 640px) {
  #panel-host {
    top: auto; right: 0; width: 100%; height: 45vh;
    border-right: 0; border-top: 1px solid var(--border);
  }
  .map-toggle { left: var(--space-3); bottom: calc(45vh + var(--space-3)); }
}
```

- [ ] **Step 3: Create `index.html`** (paste the SRI hashes from Task 15 Step 2)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Directory of Socio-Legal Associations</title>
  <link rel="stylesheet" href="vendor/leaflet.css"
        integrity="sha384-PASTE_LEAFLET_CSS_HASH" crossorigin="anonymous">
  <link rel="stylesheet" href="styles/tokens.css">
  <link rel="stylesheet" href="styles/app.css">
</head>
<body>
  <div id="app">
    <div id="map" role="region" aria-label="Map of association seats"></div>
    <aside id="panel-host" aria-label="Association directory"></aside>
    <label class="map-toggle">
      <input type="checkbox" data-role="leadership-toggle"> show current leadership
    </label>
  </div>
  <script src="vendor/leaflet.js"
          integrity="sha384-PASTE_LEAFLET_JS_HASH" crossorigin="anonymous"></script>
  <script type="module" src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Manual verification (deferred until Task 18 wires `app.js`)**

No check yet; committed as static assets.

- [ ] **Step 5: Commit**

```bash
git add index.html styles/
git commit -m "feat: app shell HTML and design tokens"
```

---

## Task 17: `data/centroids.json` + `scripts/build-centroids.mjs`

**Files:**
- Create: `scripts/build-centroids.mjs`
- Create: `data/centroids.json`
- Test: `dev/tests/scripts/centroid.test.js`

- [ ] **Step 1: Write the failing test for the centroid function**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringCentroid, featureCentroids } from '../../../scripts/build-centroids.mjs';

test('ringCentroid returns the average of a simple square ring', () => {
  const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  assert.deepEqual(ringCentroid(ring), [1, 1]);
});

test('featureCentroids keys by ISO_A2 and rounds to 4 dp', () => {
  const fc = {
    features: [{
      properties: { ISO_A2: 'de' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    }],
  };
  assert.deepEqual(featureCentroids(fc), { DE: [0.5, 0.5] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/scripts/centroid.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `scripts/build-centroids.mjs`**

```js
#!/usr/bin/env node
// Derive data/centroids.json (ISO alpha-2 -> [lon,lat]) from a Natural Earth
// countries GeoJSON. Usage:
//   node scripts/build-centroids.mjs path/to/ne_110m_admin_0_countries.geojson
import { readFile, writeFile } from 'node:fs/promises';

/** @param {number[][]} ring @returns {[number,number]} */
export function ringCentroid(ring) {
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
    ? ring.slice(0, -1)
    : ring;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of pts) {
    x += lon;
    y += lat;
  }
  return [x / pts.length, y / pts.length];
}

/** @param {any} geojson @returns {Object<string,[number,number]>} */
export function featureCentroids(geojson) {
  /** @type {Object<string,[number,number]>} */
  const out = {};
  for (const f of geojson.features) {
    const iso = (f.properties.ISO_A2 || f.properties.iso_a2 || '').toUpperCase();
    if (!iso || iso === '-99') continue;
    const g = f.geometry;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]]
      : g.type === 'MultiPolygon' ? g.coordinates.map((poly) => poly[0])
      : [];
    if (!rings.length) continue;
    // largest ring by vertex count is a good-enough proxy for the mainland
    const biggest = rings.sort((a, b) => b.length - a.length)[0];
    const [lon, lat] = ringCentroid(biggest);
    out[iso] = [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4];
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node scripts/build-centroids.mjs <countries.geojson>');
    process.exit(1);
  }
  const geojson = JSON.parse(await readFile(src, 'utf8'));
  const centroids = featureCentroids(geojson);
  await writeFile('data/centroids.json', JSON.stringify(centroids, null, 0) + '\n');
  console.log(`wrote data/centroids.json (${Object.keys(centroids).length} countries)`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/scripts/centroid.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Generate the real `data/centroids.json`**

Run:
```bash
mkdir -p data
curl -fsSL "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson" -o /tmp/ne_countries.geojson
node scripts/build-centroids.mjs /tmp/ne_countries.geojson
head -c 200 data/centroids.json
```
Expected: a JSON object like `{"FJ":[...],"TZ":[...],"DE":[10.38,51.11],...}` with ~170 entries.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-centroids.mjs data/centroids.json dev/tests/scripts/centroid.test.js
git commit -m "feat(data): country centroid table from Natural Earth"
```

---

## Task 18: `src/app.js` — composition root and wiring

**Files:**
- Create: `src/app.js`
- Test: `dev/tests/app.test.js`

- [ ] **Step 1: Write the failing integration test (jsdom + injected fakes)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyAssociation } from '../../src/core/model.js';
import { createApp } from '../../src/app.js';

function domFixture() {
  const dom = new JSDOM(`<!doctype html><div id="app">
    <div id="map"></div><aside id="panel-host"></aside>
    <label class="map-toggle"><input type="checkbox" data-role="leadership-toggle"></label>
  </div>`, { url: 'https://example.org/' });
  return dom.window;
}

const associations = [
  { ...emptyAssociation('Q1'), label: 'German Association', countryCode: 'DE', countryLabel: 'Germany' },
  { ...emptyAssociation('Q2'), label: 'Roaming body' },
];

test('createApp renders the panel rows and shows a card on row click', async () => {
  const win = domFixture();
  const fakeMap = { render() {}, focus() {} };
  await createApp({
    window: win,
    config: { cacheTtlMs: 1, centroidsUrl: 'x', snapshotUrl: 'y', tileUrl: 't', tileAttribution: 'a' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => fakeMap,
    detectMode: () => 'read',
  });

  const host = win.document.getElementById('panel-host');
  assert.match(host.innerHTML, /data-qid="Q1"/);
  assert.match(host.innerHTML, /No fixed location/);

  host.querySelector('button.row[data-qid="Q1"]').click();
  assert.match(host.innerHTML, /class="card"/);
  assert.match(host.innerHTML, /German Association/);
  assert.doesNotMatch(host.innerHTML, /data-action="edit"/); // read-only
});

test('typing in search filters the rows', async () => {
  const win = domFixture();
  await createApp({
    window: win,
    config: { cacheTtlMs: 1, centroidsUrl: 'x', snapshotUrl: 'y', tileUrl: 't', tileAttribution: 'a' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: () => 'read',
  });
  const host = win.document.getElementById('panel-host');
  const input = host.querySelector('input[data-role="search"]');
  input.value = 'roaming';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.doesNotMatch(host.innerHTML, /data-qid="Q1"/);
  assert.match(host.innerHTML, /data-qid="Q2"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/app.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/app.js`**

```js
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
  const loadDirectory = deps.loadDirectory || ((extra) => loadDirectoryImpl(extra));

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

  const mapView = createMapView(mapHost, {
    tileUrl: config.tileUrl,
    tileAttribution: config.tileAttribution,
    onSelect: (qid) => select(qid),
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
    mapView.render(toMapPins(applyFilter(s), { centroids, showLeadership: s.showLeadership }));
  }

  function applyFilter(s) {
    // map shows the country/text-filtered set too, for consistency with the panel
    const { filterAssociations } = requireFilter();
    return filterAssociations(s.associations, s.filter);
  }
  // lazy import kept local to avoid a cycle in the header
  let _filter;
  function requireFilter() {
    return _filter || (_filter = { filterAssociations: (list, f) => list.filter((a) => {
      const needle = (f.text || '').trim().toLowerCase();
      if (f.countryCode && a.countryCode !== f.countryCode) return false;
      if (needle && !a.label.toLowerCase().includes(needle)) return false;
      return true;
    }) });
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
    fetch: win.fetch.bind(win),
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
  await createApp({
    window,
    config,
    centroids,
    loadDirectory: loadDirectoryImpl,
    createMapView: createMapViewImpl,
    detectMode: () => 'read',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/app.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Run the whole suite**

Run: `cd dev && npm test`
Expected: all tests pass, exit 0.

- [ ] **Step 6: Manual smoke test in a browser**

Run: `python3 -m http.server 8000` (from repo root), open `http://localhost:8000/`.
Expected: the map loads with OSM tiles; the panel lists associations from live Wikidata (or, if offline, the snapshot with a stale banner — see Task 19); clicking a row shows a card and pans the map; the "show current leadership" checkbox adds/removes lighter pins; there is **no sign-in or edit button anywhere**. Stop the server with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add src/app.js dev/tests/app.test.js
git commit -m "feat: read-only composition root wiring map, panel, store, router"
```

---

## Task 19: `data/snapshot.json` + `scripts/refresh-snapshot.mjs` + CI

**Files:**
- Create: `scripts/refresh-snapshot.mjs`
- Create: `data/snapshot.json` (generated)
- Create: `.github/workflows/snapshot.yml`
- Test: `dev/tests/scripts/refresh-snapshot.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../../scripts/refresh-snapshot.mjs';

test('buildSnapshot wraps associations with a generatedAt date', () => {
  const snap = buildSnapshot([{ qid: 'Q1' }], () => new Date('2026-09-02T00:00:00Z'));
  assert.equal(snap.generatedAt, '2026-09-02');
  assert.deepEqual(snap.associations, [{ qid: 'Q1' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dev && node --test tests/scripts/refresh-snapshot.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `scripts/refresh-snapshot.mjs`**

```js
#!/usr/bin/env node
// Refresh data/snapshot.json from the live query service.
// Usage: node scripts/refresh-snapshot.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { queryDirectory } from '../src/adapters/sparql-client.js';

/** @param {any[]} associations @param {() => Date} [now] */
export function buildSnapshot(associations, now = () => new Date()) {
  return { generatedAt: now().toISOString().slice(0, 10), associations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = JSON.parse(await readFile('config.json', 'utf8'));
  const associations = await queryDirectory({ fetch, endpoint: cfg.sparqlEndpoint, cfg });
  const snap = buildSnapshot(associations);
  await writeFile('data/snapshot.json', JSON.stringify(snap, null, 2) + '\n');
  console.log(`wrote data/snapshot.json (${associations.length} associations, ${snap.generatedAt})`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dev && node --test tests/scripts/refresh-snapshot.test.js`
Expected: PASS — 1 test.

- [ ] **Step 5: Generate the initial snapshot**

Run: `node scripts/refresh-snapshot.mjs`
Expected: `wrote data/snapshot.json (N associations, <today>)`. If the live query returns 0 rows (import not done yet — see the operations runbook), write a minimal valid file instead:
```bash
printf '{\n  "generatedAt": "2026-09-02",\n  "associations": []\n}\n' > data/snapshot.json
```

- [ ] **Step 6: Create `.github/workflows/snapshot.yml`**

```yaml
name: Refresh directory snapshot
on:
  schedule:
    - cron: "17 4 * * *"
  workflow_dispatch:
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: node scripts/refresh-snapshot.mjs
      - name: Commit if changed
        run: |
          if ! git diff --quiet -- data/snapshot.json; then
            git config user.name "snapshot-bot"
            git config user.email "snapshot-bot@users.noreply.github.com"
            git add data/snapshot.json
            git commit -m "chore(data): refresh snapshot"
            git push
          fi
```

- [ ] **Step 7: Commit**

```bash
git add scripts/refresh-snapshot.mjs data/snapshot.json .github/workflows/snapshot.yml dev/tests/scripts/refresh-snapshot.test.js
git commit -m "feat(data): snapshot refresh script and scheduled workflow"
```

---

## Task 20: Full-suite green + README deploy section + tag

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the complete test suite**

Run: `cd dev && npm test`
Expected: every test passes, exit code 0. If any fail, fix before continuing.

- [ ] **Step 2: Manual QA checklist (serve locally, `http://localhost:8000/`)**

- [ ] Map + tiles load; panel lists associations.
- [ ] No sign-in or edit affordance anywhere in the DOM (`document.body.innerHTML` search for "edit" / "sign in" returns nothing user-facing).
- [ ] Row click → card shows; map pans.
- [ ] Search box filters rows.
- [ ] `#/country/DE` in the URL filters to Germany; the `×` clears it.
- [ ] Leadership toggle adds/removes lighter pins.
- [ ] Simulate offline (DevTools → Network → Offline, reload): the snapshot loads with a "saved copy from …" banner.

- [ ] **Step 3: Append a deploy section to `README.md`**

```markdown
## Deploy (detail)

1. `cd dev && npm test` — all green.
2. `node scripts/refresh-snapshot.mjs` — refresh `data/snapshot.json`, commit it.
3. Upload to an HTTPS host, root or subfolder, these paths only:
   `index.html`, `config.json`, `styles/`, `src/`, `vendor/`, `data/`.
   Do **not** upload `dev/`, `docs/`, `scripts/`, `.github/`.
4. Open the deployed URL and run the manual QA checklist in
   `docs/plans/2026-09-02-read-only-directory-app.md` Task 20.
```

- [ ] **Step 4: Commit and tag**

```bash
git add README.md
git commit -m "docs: deploy runbook for the read-only app"
git tag read-only-app-v1
```

---

## Task 21: Country polygon layer + click-to-filter

UI spec §1.3: "Click a country and it highlights; the side panel narrows to that country's associations." This adds a faint, clickable countries layer over the basemap that drives the `#/country/<ISO>` route.

**Files:**
- Create: `data/countries.geojson` (committed — the same Natural Earth file used for centroids)
- Modify: `src/ui/map-view.js` — add an optional countries layer
- Modify: `src/app.js` — pass the GeoJSON in; the layer's click sets the hash
- Test: `dev/tests/ui/map-view.test.js` (extend)

- [ ] **Step 1: Commit the GeoJSON**

```bash
cp /tmp/ne_countries.geojson data/countries.geojson   # from Task 17 Step 5
ls -la data/countries.geojson                          # expect ~700 KB–4 MB; acceptable, gzips well
```

- [ ] **Step 2: Extend the map-view test** — append to `dev/tests/ui/map-view.test.js`:

```js
import { isoOfFeature } from '../../../src/ui/map-view.js';

test('isoOfFeature reads ISO_A2 case-insensitively and rejects the -99 sentinel', () => {
  assert.equal(isoOfFeature({ properties: { ISO_A2: 'de' } }), 'DE');
  assert.equal(isoOfFeature({ properties: { iso_a2: 'FR' } }), 'FR');
  assert.equal(isoOfFeature({ properties: { ISO_A2: '-99' } }), null);
});
```

- [ ] **Step 3: Run — expect FAIL** (`isoOfFeature` not exported yet).

- [ ] **Step 4: Edit `src/ui/map-view.js`** — add the export and extend `createMapView`:

```js
/** @param {any} feature @returns {string|null} ISO 3166-1 alpha-2, uppercase */
export function isoOfFeature(feature) {
  const raw = feature?.properties?.ISO_A2 || feature?.properties?.iso_a2 || '';
  const iso = String(raw).toUpperCase();
  return iso && iso !== '-99' ? iso : null;
}
```

In `createMapView`, add a `countriesGeojson` option and, when present, a GeoJSON layer under the pins:

```js
export function createMapView(container, { tileUrl, tileAttribution, onSelect, onSelectCountry, countriesGeojson }) {
  /* global L */
  const map = L.map(container, { worldCopyJump: true }).setView([20, 10], 2);
  L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 12 }).addTo(map);

  if (countriesGeojson) {
    L.geoJSON(countriesGeojson, {
      style: { color: '#94a3b8', weight: 1, fillOpacity: 0.02 },
      onEachFeature: (feature, layer) => {
        const iso = isoOfFeature(feature);
        if (!iso) return;
        layer.on('click', () => onSelectCountry && onSelectCountry(iso));
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.12 }));
        layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.02 }));
      },
    }).addTo(map);
  }

  const seatLayer = L.layerGroup().addTo(map);
  const leadLayer = L.layerGroup().addTo(map);
  // ...rest of the function unchanged (render / focus / return)...
}
```

- [ ] **Step 5: Edit `src/app.js`** — load and pass the GeoJSON, and wire the country click to the route:

In the browser entry point, alongside `centroids`:

```js
  const countriesGeojson = await (await fetch('data/countries.geojson')).json();
```

Pass it through `createApp` deps (add `countriesGeojson` to the destructure) and into `createMapView`:

```js
  const mapView = await createMapView(mapHost, {
    tileUrl: config.tileUrl,
    tileAttribution: config.tileAttribution,
    countriesGeojson: deps.countriesGeojson,
    onSelect: (qid) => select(qid),
    onSelectCountry: (iso) => { win.location.hash = `#/country/${iso}`; },
  });
```

The existing `hashchange` + `applyRoute` (Task 18) already turn `#/country/DE` into `filter.countryCode`. In the jsdom tests, `countriesGeojson` is simply omitted (the layer is skipped).

- [ ] **Step 6: Run — expect PASS** (`cd dev && node --test tests/ui/map-view.test.js` → 3 tests).

- [ ] **Step 7: Manual QA** — serve locally; click a country polygon → panel filters to that country, URL shows `#/country/<ISO>`, the `×` clears it.

- [ ] **Step 8: Commit**

```bash
git add data/countries.geojson src/ui/map-view.js src/app.js dev/tests/ui/map-view.test.js
git commit -m "feat(ui): clickable country layer driving the country filter"
```

---

## Self-Review notes (already reconciled in this plan)

- **Spec coverage.** Data spec §2.4 read path → Tasks 4, 7, 14, 17. Snapshot/resilience §2.4/§2.9 → Tasks 8, 19. UI spec §1.3 map + country click → Tasks 14, 21. §1.3–1.5 panel/card → Tasks 12–14, 18. §1.9 states (loading/stale/empty) → Tasks 8, 13, 18. §1.10 mobile bottom sheet → Task 16 CSS media query. §1.11 tokens/dark mode → Task 16. §2.1 no build → whole plan (native ESM, `node --test`). §2.3 read-only default, mode seam → Task 18 (`detectMode` always `'read'`; edit wiring is Plan 2). §2.6 config-not-code → Task 1 `config.json`. Leaflet §2.6 → Task 15. "Jump to country/association" from the search box (UI spec §1.3) is provided by the `#/country/<ISO>` and `#/assoc/<QID>` routes (Task 18); an autocomplete "jump" widget is a later refinement, not in scope here.
- **Deferred to Plan 2 (edit mode):** `core/dedupe.js`, `core/changeset.js`, `core/quickstatements.js`, `adapters/oauth-pkce.js`, `adapters/wikibase-api.js`, `adapters/quickstatements-handoff.js`, `ui/edit-wizard/*`, `ui/components/entity-typeahead.js`, `callback.html`, the Edit button behaviour, and the `?edit` / silent-restore mode detection. The `detectMode` injection point and the `editMode` flag through `renderPanel`/`renderAssociationCard` are already in place.
- **Deferred to the operations runbook:** OAuth consumer registration, the CORS spike, the QuickStatements initial import, WikiProject QID confirmation, and enabling the optional change-notification e-mail.
- **Type consistency.** `Association` shape defined once in Task 2 and consumed unchanged in Tasks 4, 5, 7, 12, 13, 14, 18. `MapPin` defined in Task 2, produced in Task 14. `CachePort` defined in Task 6, implemented in Task 8. `resolveSeatPin` / `resolveLeadershipPin` names consistent across Tasks 4, 5, 14.
