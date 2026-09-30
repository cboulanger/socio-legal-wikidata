import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createWizard } from '../../../src/ui/edit-wizard/wizard.js';

function env() {
  const dom = new JSDOM('<!doctype html><div id="w"></div>', { url: 'https://app.example/' });
  return dom.window;
}
const cfg = { humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498', inScopeClassQid: 'Q955824', inScopeFieldQid: 'Q847034', officeTypes: [{ qid: 'Q1255921', label: 'President' }] };

test('a manage-leadership flow produces the expected ChangeSet and calls the write port', async () => {
  const win = env();
  const host = win.document.getElementById('w');
  let applied = null;
  const ports = {
    search: {
      searchEntities: async () => [], lookupByExternalId: async () => [],
      getEntity: async () => ({ claims: {} }),
      getLeadershipHistory: async () => ({ history: [], current: { statementId: 'Q100$OLD', personQid: 'Q9', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null } }),
    },
    write: { applyChangeSet: async (cs) => { applied = cs; return { via: 'direct', created: [], diffUrls: ['https://www.wikidata.org/wiki/Q100'] }; } },
  };
  const wizard = createWizard(host, {
    window: win, config: cfg,
    ports,
    seed: { mode: 'manage-leadership', association: { qid: 'Q100', label: 'Body' } },
  });
  await new Promise((r) => setTimeout(r, 0)); // let loadLeadershipOriginal's promise resolve

  wizard._setDraft((d) => {
    d.association.referenceUrl = 'https://uni.example/board';
    d.officers[0].person.qid = 'Q200';
    d.officers[0].begin = '2026-01-01';
  });

  const result = await wizard.submit();
  assert.match(applied.summary, /update leadership/);
  assert.ok(applied.ops.some((o) => o.type === 'add-statement' && o.property === 'P488'));
  assert.ok(applied.ops.some((o) => o.type === 'end-statement'));
  assert.deepEqual(result.diffUrls, ['https://www.wikidata.org/wiki/Q100']);
  assert.match(host.innerHTML, /Success/);
});

test('draft is persisted to localStorage and restored', () => {
  const win = env();
  const host = win.document.getElementById('w');
  const ports = { search: {}, write: { applyChangeSet: async () => ({}) } };
  const w1 = createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  w1._setDraft((d) => { d.association.website = 'https://x'; });
  const w2 = createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  assert.equal(w2.getDraft().association.website, 'https://x');
});

test('submit refuses when the current step is invalid', async () => {
  const win = env();
  const host = win.document.getElementById('w');
  const ports = { search: {}, write: { applyChangeSet: async () => { throw new Error('should not write'); } } };
  const wizard = createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await assert.rejects(() => wizard.submit(), /change at least one field|reference URL is required/);
});
