import { emptyAssociation } from '../core/model.js';
import { parsePoint } from '../core/parse-wkt.js';

/**
 * @typedef {import('../core/model.js').Association} Association
 */

// Performance notes (found live, 2026-09-02, after the first real data import made
// this query slow enough to hit WDQS's 60s timeout):
//  - `wdt:P31/wdt:P279* wd:X` (transitive subclass-of traversal) is expensive and,
//    combined with the rest of this query, timed out outright. The in-scope class is
//    matched directly via VALUES instead — also fixes a real scope bug: the data
//    uses two sibling classes (learned society / voluntary association), neither a
//    subclass of the other, so a single-class P279* match was silently missing half
//    the directory.
//  - The leadership pin's coordinate lookup used to go through a
//    BIND(COALESCE(?leadUniA, ?leadUniB) AS ?leadUni) before looking up ?leadUni's
//    coordinates — that combination alone made the query time out (leadUni via
//    direct triples + a subsequent property-path lookup on a BIND-derived variable is
//    a known slow pattern in Blazegraph/WDQS). Rewritten as a single property-path
//    alternation directly to the coordinate, which is fast.
//  - The journal class check keeps its P31/P279* traversal — isolated, it is fast
//    (few candidate journals per association) and narrowing it further isn't needed.
const QUERY_TEMPLATE = `SELECT ?assoc ?assocLabel ?assocDescription ?website ?email ?inception
       ?country ?countryLabel ?countryCode ?operating
       ?seat ?seatLabel ?seatCoord ?parent ?parentLabel
       ?president ?presidentLabel ?presidentUrl
       ?leadUni ?leadUniLabel ?leadCoord
       ?journal ?journalLabel ?journalUrl ?issn
WHERE {
  VALUES ?class { %CLASSES% }
  ?assoc wdt:P31 ?class .
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
    OPTIONAL {
      ?president (wdt:P108|wdt:P1416) ?leadUni .
      { ?leadUni wdt:P625 ?leadCoord . } UNION { ?leadUni wdt:P159/wdt:P625 ?leadCoord . }
    }
  }
  OPTIONAL {
    ?journal wdt:P123 ?assoc .
    ?journal wdt:P31/wdt:P279* wd:Q737498 .
    OPTIONAL { ?journal wdt:P856 ?journalUrl. }
    OPTIONAL { ?journal wdt:P236 ?issn. }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "%LANGS%". }
}`;

/**
 * @param {{inScopeClassQid: string, inScopeClassQids?: string[], inScopeFieldQid: string, labelLanguages: string}} cfg
 *   `inScopeClassQids`, when present, lists every P31 value the live query should
 *   match directly (no subclass traversal) — falls back to `[inScopeClassQid]` for
 *   configs/tests that only set the singular key (which `ui/edit-wizard/wizard.js`
 *   still uses alone, as the single default P31 for a newly-created association).
 */
export function buildDirectoryQuery(cfg) {
  const classes = cfg.inScopeClassQids?.length ? cfg.inScopeClassQids : [cfg.inScopeClassQid];
  return QUERY_TEMPLATE
    .replace('%CLASSES%', classes.map((q) => `wd:${q}`).join(' '))
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
    // P968 (email) is a "url" datatype property on Wikidata — wdt:P968 returns the
    // full "mailto:..." URI, not a bare address; strip it back to a bare address for
    // internal use and display (association-card.js builds its own mailto: href).
    a.email ??= val(row.email)?.replace(/^mailto:/, '') ?? null;
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
