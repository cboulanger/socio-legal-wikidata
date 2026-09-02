import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createWizard } from '../../../src/ui/edit-wizard/wizard.js';

function env() {
  const dom = new JSDOM('<!doctype html><div id="w"></div>', { url: 'https://app.example/' });
  return dom.window;
}
const cfg = { humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498', inScopeClassQid: 'Q955824', inScopeFieldQid: 'Q2734663' };

test('a change-president flow produces the expected ChangeSet and calls the write port', async () => {
  const win = env();
  const host = win.document.getElementById('w');
  let applied = null;
  const ports = {
    search: { searchEntities: async () => [], getEntity: async () => null, lookupByExternalId: async () => [] },
    write: { applyChangeSet: async (cs) => { applied = cs; return { via: 'direct', created: [], diffUrls: ['https://www.wikidata.org/wiki/Q100'] }; } },
  };
  const wizard = createWizard(host, {
    window: win, config: cfg, ports,
    seed: { mode: 'change-president', association: { qid: 'Q100', label: 'Body' } },
  });

  // fill the draft directly (the DOM steps are exercised in manual QA)
  wizard._setDraft((d) => {
    d.president.qid = 'Q200';
    d.president.universityQid = 'Q300';
    d.president.referenceUrl = 'https://uni/staff';
    d.termStart = '2026-01-01';
    d.previousPresidentStatementId = 'Q100$OLD';
  });

  const result = await wizard.submit();
  assert.equal(applied.summary, 'socio-legal directory: record new president');
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
