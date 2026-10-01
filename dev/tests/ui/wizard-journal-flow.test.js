import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createWizard } from '../../../src/ui/edit-wizard/wizard.js';

const cfg = {
  humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498', inScopeFieldQid: 'Q847034',
  labelLanguages: 'en,de,fr,es', journalEditorRoles: [{ qid: 'Q589298', label: 'Editor-in-chief' }, { qid: 'Q75792065', label: 'Associate editor' }],
};
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function setup(searchOverrides = {}) {
  const win = new JSDOM('<!doctype html><div id="w"></div>', { url: 'https://app.example/' }).window;
  const host = win.document.getElementById('w');
  const applied = [];
  const ports = {
    search: {
      searchEntities: async () => [],
      getEntity: async () => ({ labels: {}, descriptions: {}, claims: {} }),
      getJournalDetails: async () => ({
        qid: 'Q1', labels: { en: 'Example Journal' }, descriptions: {}, website: null, websiteAsOf: null,
        issn: null, founded: null, closed: null, openAlexId: null, publisherQid: null, publisherLabel: null,
        classQids: ['Q737498'], fieldQids: ['Q847034'],
      }),
      getJournalEditorHistory: async () => ({ history: [] }),
      ...searchOverrides,
    },
    write: { applyChangeSet: async (cs) => { applied.push(cs); return { via: 'direct', created: [{ ref: 'journal', qid: 'Q999' }], diffUrls: ['https://www.wikidata.org/wiki/Q999'] }; } },
  };
  const type = (el, value) => { el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const click = (sel) => host.querySelector(sel).click();
  return { win, host, ports, applied, type, click };
}

test('Add journal: identify -> details -> review creates a new journal item', async () => {
  const { win, host, ports, applied, type, click } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'create-journal' } });
  await settle();

  type(host.querySelector('[data-role="ta-identify"] input[data-role="query"]'), 'Example Journal');
  await settle();
  click('[data-role="none-of-these"]');
  host.querySelector('[data-role="create-name"]').value = 'Example Journal';
  click('[data-role="create-confirm"]');
  assert.match(host.innerHTML, /New journal: <strong>Example Journal/);
  click('[data-role="next"]');

  // details: the typed name seeds the English title row
  assert.equal(host.querySelector('input[name="journal-label-en"]').value, 'Example Journal');
  type(host.querySelector('input[name="journal-founded"]'), '2020');
  type(host.querySelector('input[name="journal-referenceUrl"]'), 'https://example.org/about');
  click('[data-role="next"]');
  assert.match(host.innerHTML, /title \(en\): “Example Journal” \(new\)/);
  click('[data-role="submit"]');
  await settle();

  const create = applied[0].ops.find((o) => o.type === 'create-item' && o.ref === 'journal');
  assert.deepEqual(create.labels, { en: 'Example Journal' });
  assert.ok(create.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q737498'));
  assert.ok(create.claims.some((c) => c.property === 'P921' && c.value.qid === 'Q847034'));
  assert.ok(create.claims.some((c) => c.property === 'P571'));
  assert.match(host.innerHTML, /Success/);
});

test('Add journal: picking an existing match switches to Edit journal for it', async () => {
  const { win, host, ports, type, click } = setup({
    searchEntities: async () => [{ qid: 'Q1', label: 'Example Journal', description: 'academic journal' }],
  });
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'create-journal' } });
  await settle();
  type(host.querySelector('[data-role="ta-identify"] input[data-role="query"]'), 'Example Journal');
  await settle();
  click('[data-pick="Q1"]');
  await settle();
  assert.match(host.innerHTML, /Edit journal/);
  assert.deepEqual([...host.querySelectorAll('.wizard__steps li')].map((li) => li.textContent.trim()), ['1 details', '2 review']);
  assert.equal(host.querySelector('input[name="journal-label-en"]').value, 'Example Journal');
});

test('Link journal: a publisher preset from an association card is shown and kept through create', async () => {
  const { win, host, ports, applied, type, click } = setup();
  createWizard(host, {
    window: win, config: cfg, ports,
    seed: { mode: 'create-journal', journal: { publisherQid: 'Q2', publisherLabel: 'Some Society' } },
  });
  await settle();
  type(host.querySelector('[data-role="ta-identify"] input[data-role="query"]'), 'Society Journal');
  await settle();
  click('[data-role="none-of-these"]');
  host.querySelector('[data-role="create-name"]').value = 'Society Journal';
  click('[data-role="create-confirm"]');
  click('[data-role="next"]');
  assert.match(host.innerHTML, /Published by: <strong>Some Society/);
  type(host.querySelector('input[name="journal-referenceUrl"]'), 'https://example.org/about');
  click('[data-role="next"]');
  click('[data-role="submit"]');
  await settle();
  const create = applied[0].ops.find((o) => o.type === 'create-item' && o.ref === 'journal');
  assert.ok(create.claims.some((c) => c.property === 'P123' && c.value.qid === 'Q2'));
});

test('regression: starting to replace "Published by" and pressing Escape keeps the original publisher, not an empty field', async () => {
  const { win, host, ports, type, click } = setup({
    getJournalDetails: async () => ({
      qid: 'Q1', labels: { en: 'Example Journal' }, descriptions: {}, website: null, websiteAsOf: null,
      issn: null, founded: null, closed: null, openAlexId: null, publisherQid: 'Q2', publisherLabel: 'Some Society',
      classQids: ['Q737498'], fieldQids: ['Q847034'],
    }),
  });
  const wizard = createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-journal', journal: { qid: 'Q1' } } });
  await settle();
  assert.match(host.innerHTML, /Published by: <strong>Some Society<\/strong>/);

  host.querySelector('[data-role="ta-publisher"] [data-role="change"]').click();
  assert.match(host.innerHTML, /data-role="query"/); // search box now open
  type(host.querySelector('[data-role="ta-publisher"] input[data-role="query"]'), 'Other Society');
  await settle();
  host.querySelector('[data-role="ta-publisher"] input[data-role="query"]')
    .dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // Escape restored the chosen display; the original publisher was never cleared from the draft
  assert.match(host.innerHTML, /Published by: <strong>Some Society<\/strong>/);
  assert.equal(wizard.getDraft().journalEntity.publisherQid, 'Q2');

  // "remove" asks for confirmation before actually discarding it
  win.confirm = () => false;
  host.querySelector('[data-role="ta-publisher"] [data-role="change"]').click();
  host.querySelector('[data-role="ta-publisher"] [data-role="remove"]').click();
  assert.equal(wizard.getDraft().journalEntity.publisherQid, 'Q2'); // declined: still there

  win.confirm = () => true;
  host.querySelector('[data-role="ta-publisher"] [data-role="remove"]').click();
  assert.equal(wizard.getDraft().journalEntity.publisherQid, null); // confirmed: now cleared
});

test('typing an OpenAlex id turns the hint into a real, clickable link, live (no full re-render)', async () => {
  const { win, host, ports, type, click } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'create-journal' } });
  await settle();
  type(host.querySelector('[data-role="ta-identify"] input[data-role="query"]'), 'Example Journal');
  await settle();
  click('[data-role="none-of-these"]');
  host.querySelector('[data-role="create-name"]').value = 'Example Journal';
  click('[data-role="create-confirm"]');
  click('[data-role="next"]');

  const hint = host.querySelector('[data-role="openalex-hint"]');
  assert.doesNotMatch(hint.innerHTML, /<a /);
  type(host.querySelector('input[name="journal-openalex"]'), 'S58239531');
  assert.match(hint.innerHTML, /<a href="https:\/\/openalex\.org\/S58239531"/);
  assert.match(hint.textContent, /https:\/\/openalex\.org\/S58239531/);
});

test('Edit journal: loads the item, shows the scope notice when not yet in scope, and writes only changed fields', async () => {
  const { win, host, ports, applied, type, click } = setup({
    getJournalDetails: async () => ({
      qid: 'Q1', labels: { en: 'Old Title' }, descriptions: {}, website: null, websiteAsOf: null,
      issn: null, founded: null, closed: null, openAlexId: null, publisherQid: null, publisherLabel: null,
      classQids: [], fieldQids: [],
    }),
  });
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-journal', journal: { qid: 'Q1', label: 'Old Title' } } });
  await settle();
  assert.ok(host.querySelector('input[name="journalAddToDirectory"]'), 'the not-in-scope notice is shown');
  type(host.querySelector('input[name="journal-issn"]'), '1234-5678');
  type(host.querySelector('input[name="journal-referenceUrl"]'), 'https://example.org/about');
  click('[data-role="next"]');
  click('[data-role="submit"]');
  await settle();
  const issn = applied[0].ops.find((o) => o.property === 'P236');
  assert.equal(issn.value.value, '1234-5678');
  assert.match(host.innerHTML, /Success/);
});

test('Manage editors: loads existing history, seeds one blank row, and writes a referenced P98', async () => {
  const { win, host, ports, applied, type, click } = setup({
    getJournalEditorHistory: async () => ({ history: [{ statementId: 'Q1$A', personQid: 'Q9', personLabel: 'Old Editor', roleQid: 'Q589298', roleLabel: 'Editor-in-chief', begin: '2010-01-01', end: null }] }),
  });
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'manage-journal-editors', journal: { qid: 'Q1', label: 'Example Journal' } } });
  await settle();
  assert.match(host.innerHTML, /Old Editor/);
  assert.ok(host.querySelector('[data-role="ta-editor-0"]'), 'a blank row is seeded');

  type(host.querySelector('[data-role="ta-editor-0"] input[data-role="query"]'), 'Jane');
  await settle();
  // no candidates from the default empty search stub; create a new person instead
  click('[data-role="none-of-these"]');
  host.querySelector('[data-role="create-name"]').value = 'Jane Roe';
  click('[data-role="create-confirm"]');
  type(host.querySelector('input[data-field="editor-orcid"][data-index="0"]'), '0000-0002-1825-0097');
  type(host.querySelector('input[data-field="editor-begin"][data-index="0"]'), '2024-01-01');
  type(host.querySelector('input[data-field="journal-referenceUrl"]'), 'https://example.org/masthead');
  click('[data-role="next"]');
  click('[data-role="submit"]');
  await settle();

  const op = applied[0].ops.find((o) => o.property === 'P98');
  assert.deepEqual(op.target, { qid: 'Q1' });
  assert.deepEqual(op.reference, { P854: 'https://example.org/masthead' });
  assert.match(host.innerHTML, /Success/);
});
