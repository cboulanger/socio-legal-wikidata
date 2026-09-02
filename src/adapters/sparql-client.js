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
