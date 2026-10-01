import { leadershipClaimsFromEntity, editorClaimsFromEntity, journalOriginalFromEntity } from '../core/draft.js';

/**
 * @typedef {import('../core/changeset.js').ChangeSet} ChangeSet
 * @typedef {import('../core/changeset.js').Value} Value
 */

/** Convert a changeset Value to a Wikibase REST "value" object. */
function restValue(v, resolveRef) {
  if (v.kind === 'item') return { type: 'value', content: v.qid || resolveRef(v.ref) };
  if (v.kind === 'monolingual') return { type: 'value', content: { text: v.text, language: v.language } };
  if (v.kind === 'time') return { type: 'value', content: { time: `+${v.value}T00:00:00Z`, precision: v.precision, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } };
  // string, url, external-id
  return { type: 'value', content: v.value };
}

function restStatement(op, resolveRef) {
  const statement = {
    property: { id: op.property },
    value: restValue(op.value, resolveRef),
  };
  if (op.qualifiers?.length) {
    statement.qualifiers = op.qualifiers.map((q) => ({ property: { id: q.property }, value: restValue(q.value, resolveRef) }));
  }
  if (op.reference?.P854) {
    statement.references = [{ parts: [{ property: { id: 'P854' }, value: { type: 'value', content: op.reference.P854 } }] }];
  }
  return statement;
}

/**
 * @param {{fetch: typeof fetch, config: any, getToken: () => Promise<string>}} deps
 */
export function createWikibaseApi({ fetch, config, getToken }) {
  const action = config.wikidataActionApi;
  const rest = config.wikibaseRestBase;

  async function getJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  // Several methods call sibling methods via `this` (e.g. getJournalDetails -> this.getEntity).
  // That only works while the method is invoked as `api.method(...)`; callers elsewhere (e.g.
  // app.js exposes `getJournalDetails: api.getJournalDetails` on a different object, then calls
  // it as `editRuntime.getJournalDetails(qid)`) invoke it detached, rebinding `this` to whatever
  // object the method now hangs off. Binding every method to `api` here up front makes `this`
  // stable no matter how a caller later holds or re-attaches the reference.
  const api = {
    async searchEntities(text, type = 'item') {
      const search = encodeURIComponent(text).replace(/%20/g, '+');
      const url = `${action}?action=wbsearchentities&format=json&origin=*&type=${type}&language=en&uselang=en&limit=10&search=${search}`;
      const j = await getJson(url);
      return (j.search || []).map((s) => ({ qid: s.id, label: s.label || s.id, description: s.description || '' }));
    },

    async getEntity(qid) {
      const url = `${action}?action=wbgetentities&format=json&origin=*&ids=${qid}`;
      const j = await getJson(url);
      return j.entities?.[qid] || null;
    },

    /**
     * Like searchEntities, but for picking a person: each match is annotated with birth year
     * (P569), occupation (P106) and field of work (P101), where present, so a list of
     * same-named people can be told apart. Never throws: a lookup failure just falls back to
     * the plain search results.
     * @param {string} text
     * @returns {Promise<(EntityCandidate & {birthYear: string|null, occupationLabels: string[], fieldLabels: string[]})[]>}
     */
    async searchPersons(text) {
      const base = await this.searchEntities(text, 'item');
      if (!base.length) return base;
      try {
        const qids = base.map((c) => c.qid);
        const claimsJson = await getJson(`${action}?action=wbgetentities&format=json&origin=*&props=claims&ids=${qids.join('%7C')}`);
        const values = (entity, prop) => (entity?.claims?.[prop] || [])
          .filter((c) => c.rank !== 'deprecated')
          .map((c) => c.mainsnak?.datavalue?.value);
        const birthYearOf = (entity) => {
          const v = values(entity, 'P569')[0];
          const m = v?.precision >= 9 && typeof v.time === 'string' ? v.time.match(/^[+-](\d+)-/) : null;
          return m ? String(Number(m[1])) : null;
        };
        const idsOf = (entity, prop) => values(entity, prop).map((v) => v?.id).filter(Boolean).slice(0, 2);

        const perQid = new Map(qids.map((qid) => {
          const entity = claimsJson.entities?.[qid];
          return [qid, { birthYear: birthYearOf(entity), occupationQids: idsOf(entity, 'P106'), fieldQids: idsOf(entity, 'P101') }];
        }));

        const labelQids = [...new Set([...perQid.values()].flatMap((p) => [...p.occupationQids, ...p.fieldQids]))];
        let labelOf = (id) => id;
        if (labelQids.length) {
          const labelsJson = await getJson(`${action}?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${labelQids.join('%7C')}`);
          labelOf = (id) => labelsJson.entities?.[id]?.labels?.en?.value || id;
        }

        return base.map((c) => {
          const p = perQid.get(c.qid);
          return { ...c, birthYear: p.birthYear, occupationLabels: p.occupationQids.map(labelOf), fieldLabels: p.fieldQids.map(labelOf) };
        });
      } catch {
        return base;
      }
    },

    /**
     * Search for countries (instance of Q6256). Any failure or an empty result yields [].
     * @param {string} text
     */
    async searchCountries(text) {
      const srsearch = encodeURIComponent(`${text} haswbstatement:P31=Q6256`);
      const found = await getJson(`${action}?action=query&format=json&origin=*&list=search&srlimit=10&srsearch=${srsearch}`);
      const ids = (found.query?.search || []).map((r) => r.title).filter((id) => /^Q\d+$/.test(id));
      if (!ids.length) return [];
      const j = await getJson(`${action}?action=wbgetentities&format=json&origin=*&props=labels%7Cdescriptions&languages=en&ids=${ids.join('%7C')}`);
      return ids.map((id) => ({
        qid: id,
        label: j.entities?.[id]?.labels?.en?.value || id,
        description: j.entities?.[id]?.descriptions?.en?.value || '',
      }));
    },

    /**
     * Wikimedia language codes of a country's official languages (P37 -> P424).
     * Never throws: a failure just means "no national-language suggestion".
     * @param {string} countryQid
     * @returns {Promise<string[]>}
     */
    async getOfficialLanguageCodes(countryQid) {
      try {
        const claimIds = (entity, prop) => (entity?.claims?.[prop] || [])
          .filter((c) => c.rank !== 'deprecated')
          .map((c) => c.mainsnak?.datavalue?.value?.id)
          .filter(Boolean);
        const country = await this.getEntity(countryQid);
        const langQids = claimIds(country, 'P37');
        if (!langQids.length) return [];
        const j = await getJson(`${action}?action=wbgetentities&format=json&origin=*&props=claims&ids=${langQids.join('%7C')}`);
        const codes = [];
        for (const id of langQids) {
          for (const c of j.entities?.[id]?.claims?.P424 || []) {
            const code = c.mainsnak?.datavalue?.value;
            if (typeof code === 'string' && !codes.includes(code)) codes.push(code);
          }
        }
        return codes;
      } catch {
        return [];
      }
    },

    /**
     * Every P488 (chairperson) statement on `qid`, labelled and sorted newest-begin-first.
     * @param {string} qid
     * @returns {Promise<{history: import('../core/draft.js').LeadershipHistoryRow[], current: import('../core/draft.js').LeadershipHistoryRow|null}>}
     */
    async getLeadershipHistory(qid) {
      const entity = await this.getEntity(qid);
      const claims = leadershipClaimsFromEntity(entity);
      if (!claims.length) return { history: [], current: null };
      const ids = [...new Set(claims.flatMap((c) => [c.personQid, c.officeQid].filter(Boolean)))];
      const j = await getJson(`${action}?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${ids.join('%7C')}`);
      const labelOf = (id) => j.entities?.[id]?.labels?.en?.value || id;
      const history = claims
        .map((c) => ({
          statementId: c.statementId, personQid: c.personQid, personLabel: labelOf(c.personQid),
          officeQid: c.officeQid, officeLabel: c.officeQid ? labelOf(c.officeQid) : 'chairperson',
          begin: c.begin, end: c.end,
        }))
        .sort((x, y) => (y.begin || '').localeCompare(x.begin || ''));
      const open = history.filter((r) => !r.end);
      const current = open.length ? open.reduce((best, r) => ((r.begin || '') > (best.begin || '') ? r : best)) : null;
      return { history, current };
    },

    /**
     * Every P98 (editor) statement on `qid`, labelled and sorted newest-begin-first. No
     * "current" computation (unlike getLeadershipHistory): a journal can have several
     * concurrent editors in different roles, so there is no single "current" row.
     * @param {string} qid
     * @returns {Promise<{history: import('../core/draft.js').EditorHistoryRow[]}>}
     */
    async getJournalEditorHistory(qid) {
      const entity = await this.getEntity(qid);
      const claims = editorClaimsFromEntity(entity);
      if (!claims.length) return { history: [] };
      const ids = [...new Set(claims.flatMap((c) => [c.personQid, c.roleQid].filter(Boolean)))];
      const j = await getJson(`${action}?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${ids.join('%7C')}`);
      const labelOf = (id) => j.entities?.[id]?.labels?.en?.value || id;
      const history = claims
        .map((c) => ({
          statementId: c.statementId, personQid: c.personQid, personLabel: labelOf(c.personQid),
          roleQid: c.roleQid, roleLabel: c.roleQid ? labelOf(c.roleQid) : 'editor',
          begin: c.begin, end: c.end,
        }))
        .sort((x, y) => (y.begin || '').localeCompare(x.begin || ''));
      return { history };
    },

    /**
     * A journal's rich fields (title, description, website, ISSN, founded/closed, OpenAlex
     * id, publisher), as loaded from Wikidata. Serves two call sites: the `update-journal`
     * wizard step and the read-only journal card.
     * @param {string} qid
     * @returns {Promise<null|{qid: string, labels: Object<string,string>, descriptions: Object<string,string>, website: string|null, websiteAsOf: string|null, issn: string|null, founded: string|null, closed: string|null, openAlexId: string|null, publisherQid: string|null, publisherLabel: string|null, classQids: string[], fieldQids: string[]}>}
     */
    async getJournalDetails(qid) {
      const entity = await this.getEntity(qid);
      if (!entity) return null;
      const o = journalOriginalFromEntity(entity);
      let publisherLabel = null;
      if (o.publisherQid) {
        try {
          const labels = (await this.getEntity(o.publisherQid))?.labels || {};
          publisherLabel = (labels.en || Object.values(labels)[0])?.value || o.publisherQid;
        } catch { publisherLabel = o.publisherQid; }
      }
      return { qid, ...o, publisherLabel };
    },

    async lookupByExternalId(property, value) {
      const q = `haswbstatement:${property}=${value}`;
      const url = `${action}?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(q)}&srlimit=10`;
      const j = await getJson(url);
      return (j.query?.search || []).map((r) => ({ qid: r.title, label: r.title, description: '' }));
    },

    /**
     * @param {ChangeSet} cs
     * @returns {Promise<import('../ports/index.js').WriteResult>}
     */
    async applyChangeSet(cs) {
      const token = await getToken();
      const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      /** @type {Object<string,string>} */
      const refMap = {};
      const resolveRef = (r) => {
        if (!refMap[r]) throw new Error(`unresolved ref ${r}`);
        return refMap[r];
      };
      const created = [];
      const diffUrls = [];

      for (const op of cs.ops) {
        if (op.type === 'create-item') {
          const item = { labels: op.labels, descriptions: op.descriptions, statements: {} };
          if (op.aliases && Object.keys(op.aliases).length) item.aliases = op.aliases;
          for (const c of op.claims) {
            (item.statements[c.property] ||= []).push(restStatement(c, resolveRef));
          }
          const res = await fetch(`${rest}/entities/items`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ item, comment: cs.summary }),
          });
          if (!res.ok) throw new Error(`create-item failed: ${res.status} ${await res.text()}`);
          const j = await res.json();
          refMap[op.ref] = j.id;
          created.push({ ref: op.ref, qid: j.id });
          diffUrls.push(`https://www.wikidata.org/wiki/${j.id}`);
        } else if (op.type === 'set-terms') {
          // one JSON Patch = one Wikidata revision for every changed name/description
          const patch = [
            ...Object.entries(op.labels || {}).map(([lang, value]) => ({ op: 'add', path: `/labels/${lang}`, value })),
            ...Object.entries(op.descriptions || {}).map(([lang, value]) => ({ op: 'add', path: `/descriptions/${lang}`, value })),
            // the full alias list for the language (the caller merged in the existing ones)
            ...Object.entries(op.aliases || {}).map(([lang, value]) => ({ op: 'add', path: `/aliases/${lang}`, value })),
          ];
          const res = await fetch(`${rest}/entities/items/${op.target.qid}`, {
            method: 'PATCH', headers: authHeaders,
            body: JSON.stringify({ patch, comment: cs.summary }),
          });
          if (!res.ok) throw new Error(`set-terms failed: ${res.status} ${await res.text()}`);
          diffUrls.push(`https://www.wikidata.org/wiki/${op.target.qid}`);
        } else if (op.type === 'add-statement') {
          const qid = op.target.qid || resolveRef(op.target.ref);
          let existingId = null;
          if (op.replace) {
            const cur = await fetch(`${rest}/entities/items/${qid}/statements?property=${op.property}`, { headers: { Accept: 'application/json' } });
            if (!cur.ok) throw new Error(`reading ${op.property} on ${qid} failed: ${cur.status}`);
            const existing = (await cur.json())[op.property] || [];
            if (existing.length > 1) {
              throw new Error(`${qid} has ${existing.length} values for ${op.property}; edit that property on Wikidata directly`);
            }
            existingId = existing[0]?.id || null;
          }
          const res = existingId
            ? await fetch(`${rest}/statements/${encodeURIComponent(existingId)}`, {
              method: 'PUT', headers: authHeaders,
              body: JSON.stringify({ statement: restStatement(op, resolveRef), comment: cs.summary }),
            })
            : await fetch(`${rest}/entities/items/${qid}/statements`, {
              method: 'POST', headers: authHeaders,
              body: JSON.stringify({ statement: restStatement(op, resolveRef), comment: cs.summary }),
            });
          if (!res.ok) throw new Error(`add-statement failed: ${res.status} ${await res.text()}`);
          await res.json();
          diffUrls.push(`https://www.wikidata.org/wiki/${qid}#${op.property}`);
        } else if (op.type === 'end-statement') {
          const res = await fetch(`${rest}/statements/${encodeURIComponent(op.statementId)}`, {
            method: 'PATCH', headers: authHeaders,
            body: JSON.stringify({
              patch: [{ op: 'add', path: '/qualifiers/-', value: { property: { id: 'P582' }, value: { type: 'value', content: { time: `+${op.endDate}T00:00:00Z`, precision: 11, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' } } } }],
              comment: cs.summary,
            }),
          });
          if (!res.ok) throw new Error(`end-statement failed: ${res.status} ${await res.text()}`);
        }
      }
      return { via: 'direct', created, diffUrls };
    },
  };

  for (const key of Object.keys(api)) {
    if (typeof api[key] === 'function') api[key] = api[key].bind(api);
  }
  return api;
}
