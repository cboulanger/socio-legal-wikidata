/**
 * @typedef {import('../core/changeset.js').ChangeSet} ChangeSet
 * @typedef {import('../core/changeset.js').Value} Value
 */

/** Convert a changeset Value to a Wikibase REST "value" object. */
function restValue(v, resolveRef) {
  if (v.kind === 'item') return { type: 'value', content: v.qid || resolveRef(v.ref) };
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

  return {
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
      const resolveRef = (r) => refMap[r] || (() => { throw new Error(`unresolved ref ${r}`); })();
      const created = [];
      const diffUrls = [];

      for (const op of cs.ops) {
        if (op.type === 'create-item') {
          const item = { labels: op.labels, descriptions: op.descriptions, statements: {} };
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
        } else if (op.type === 'add-statement') {
          const qid = op.target.qid || resolveRef(op.target.ref);
          const res = await fetch(`${rest}/entities/items/${qid}/statements`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ statement: restStatement(op, resolveRef), comment: cs.summary }),
          });
          if (!res.ok) throw new Error(`add-statement failed: ${res.status} ${await res.text()}`);
          const j = await res.json();
          diffUrls.push(`https://www.wikidata.org/wiki/${qid}#${op.property}`);
          if (j.id) { /* statement id available for callers that need it */ }
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
}
