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
}
