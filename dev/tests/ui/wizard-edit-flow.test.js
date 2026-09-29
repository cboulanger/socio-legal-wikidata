import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createWizard } from '../../../src/ui/edit-wizard/wizard.js';

const cfg = {
  humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498',
  inScopeClassQid: 'Q955824', inScopeFieldQid: 'Q2734663', labelLanguages: 'en,de,fr,es',
};
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function setup(searchOverrides = {}) {
  const win = new JSDOM('<!doctype html><div id="w"></div>', { url: 'https://app.example/' }).window;
  const host = win.document.getElementById('w');
  const applied = [];
  const ports = {
    search: {
      searchEntities: async () => [],
      searchCountries: async (t) => (/bra/i.test(t) ? [{ qid: 'Q155', label: 'Brazil', description: 'country' }] : []),
      getOfficialLanguageCodes: async (q) => (q === 'Q155' ? ['pt'] : []),
      getEntity: async () => ({
        labels: { pt: { language: 'pt', value: 'Rede de Pesquisa Empírica em Direito' } },
        descriptions: {},
        claims: { P17: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q155' } } } }] },
      }),
      ...searchOverrides,
    },
    write: { applyChangeSet: async (cs) => { applied.push(cs); return { via: 'direct', created: [{ ref: 'assoc', qid: 'Q999' }], diffUrls: ['https://www.wikidata.org/wiki/Q999'] }; } },
  };
  const type = (el, value) => { el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const click = (sel) => host.querySelector(sel).click();
  return { win, host, ports, applied, type, click };
}

test('Edit details loads the item and shows the national language and English side by side', async () => {
  const { win, host, ports } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1', label: 'REED' } } });
  await settle();
  const rows = [...host.querySelectorAll('fieldset.lang')].map((f) => f.dataset.lang);
  assert.deepEqual(rows, ['pt', 'en']);                                  // national first, then English
  assert.equal(host.querySelector('input[name="label-pt"]').value, 'Rede de Pesquisa Empírica em Direito');
  assert.equal(host.querySelector('input[name="label-en"]').value, '');
  assert.match(host.innerHTML, /Portuguese/);                            // language shown by name
});

test('Edit details: adding an English name is written as a single set-terms op, and nothing else', async () => {
  const { win, host, ports, applied, type, click } = setup();
  const wizard = createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1', label: 'REED' } } });
  await settle();
  assert.ok(host.querySelector('[data-role="next"]').disabled);          // nothing changed yet
  type(host.querySelector('input[name="label-en"]'), 'Brazilian Network for Empirical Legal Research');
  assert.equal(host.querySelector('[data-role="next"]').disabled, false); // a term-only change needs no reference
  click('[data-role="next"]');
  assert.match(host.innerHTML, /name \(en\): “Brazilian Network for Empirical Legal Research” \(new\)/);
  click('[data-role="submit"]');
  await settle();
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0].ops, [{
    type: 'set-terms', target: { qid: 'Q1' },
    labels: { en: 'Brazilian Network for Empirical Legal Research' }, descriptions: {},
  }]);
  assert.match(host.innerHTML, /Success/);
  assert.equal(wizard.getDraft().association.labels.pt, 'Rede de Pesquisa Empírica em Direito');
});

test('Edit details: a new website needs a reference URL before it can be saved', async () => {
  const { win, host, ports, type } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  type(host.querySelector('input[name="website"]'), 'https://reed.example');
  assert.ok(host.querySelector('[data-role="next"]').disabled);
  assert.match(host.innerHTML, /a reference URL is required/);
  type(host.querySelector('input[name="referenceUrl"]'), 'https://reed.example/sobre');
  assert.equal(host.querySelector('[data-role="next"]').disabled, false);
});

test('an extra language can be added from the picker or by typing a code; bad codes are rejected', async () => {
  const { win, host, ports, type, click } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  host.querySelector('[data-role="lang-select"]').value = 'de';
  click('[data-role="add-lang-go"]');
  assert.ok(host.querySelector('fieldset.lang[data-lang="de"]'));
  type(host.querySelector('input[name="lang-code"]'), 'Not A Code');
  click('[data-role="add-lang-go"]');
  assert.match(host.innerHTML, /not a valid language code/);
  type(host.querySelector('input[name="lang-code"]'), 'pt-br');
  click('[data-role="add-lang-go"]');
  assert.ok(host.querySelector('fieldset.lang[data-lang="pt-br"]'));
});

test('other official languages are offered as one-click chips', async () => {
  const { win, host, ports, click } = setup({ getOfficialLanguageCodes: async () => ['de', 'fr', 'it'] });
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  assert.ok(host.querySelector('fieldset.lang[data-lang="de"]'));        // first official language is a row already
  assert.ok(host.querySelector('button[data-role="add-lang"][data-lang="fr"]'));
  click('button[data-role="add-lang"][data-lang="fr"]');
  assert.ok(host.querySelector('fieldset.lang[data-lang="fr"]'));
  assert.equal(host.querySelector('button[data-role="add-lang"][data-lang="fr"]'), null);
});

test('warns when no name is in a language the directory displays', async () => {
  const { win, host, ports } = setup();   // the item only has a Portuguese name
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  assert.match(host.innerHTML, /appear as its Wikidata ID/);
});

test('a load failure is shown with a retry, and nothing can be submitted', async () => {
  const { win, host, ports } = setup({ getEntity: async () => { throw new Error('offline'); } });
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  assert.match(host.innerHTML, /Could not load the item from Wikidata: offline/);
  assert.ok(host.querySelector('[data-role="retry-load"]'));
  assert.ok(host.querySelector('[data-role="next"]').disabled);
});

test('a write failure is shown on the review step with the draft kept', async () => {
  const { win, host, ports, type, click } = setup();
  ports.write.applyChangeSet = async () => { throw new Error('set-terms failed: 400 same label and description'); };
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  type(host.querySelector('input[name="label-en"]'), 'Network');
  click('[data-role="next"]');
  click('[data-role="submit"]');
  await settle();
  assert.match(host.innerHTML, /same label and description/);
  assert.ok(host.querySelector('[data-role="submit"]'));  // can try again
});

test('Add association: identify -> place -> details puts the typed name in the national language', async () => {
  const { win, host, ports, applied, type, click } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'create-association' } });
  await settle();

  // identify: search finds nothing, so "create new" is offered
  type(host.querySelector('[data-role="ta-identify"] input[data-role="query"]'), 'Rede de Pesquisa Empírica em Direito');
  await settle();
  click('[data-role="none-of-these"]');
  host.querySelector('[data-role="create-name"]').value = 'Rede de Pesquisa Empírica em Direito';
  click('[data-role="create-confirm"]');
  assert.match(host.innerHTML, /New association: <strong>Rede de Pesquisa/);
  click('[data-role="next"]');

  // place: country
  assert.ok(host.querySelector('[data-role="next"]').disabled);
  type(host.querySelector('[data-role="ta-country"] input[data-role="query"]'), 'bra');
  await settle();
  click('[data-pick="Q155"]');
  await settle();
  assert.match(host.innerHTML, /Country: <strong>Brazil/);
  click('[data-role="next"]');

  // details: Portuguese row first, pre-filled with the typed name; English second and empty
  const rows = [...host.querySelectorAll('fieldset.lang')].map((f) => f.dataset.lang);
  assert.deepEqual(rows, ['pt', 'en']);
  assert.equal(host.querySelector('input[name="label-pt"]').value, 'Rede de Pesquisa Empírica em Direito');
  type(host.querySelector('input[name="label-en"]'), 'Brazilian Network for Empirical Legal Research');
  type(host.querySelector('input[name="referenceUrl"]'), 'https://reed.example/sobre');
  click('[data-role="next"]');
  click('[data-role="submit"]');
  await settle();

  const create = applied[0].ops.find((o) => o.type === 'create-item' && o.ref === 'assoc');
  assert.deepEqual(create.labels, {
    pt: 'Rede de Pesquisa Empírica em Direito',
    en: 'Brazilian Network for Empirical Legal Research',
  });
  assert.ok(create.claims.some((c) => c.property === 'P17' && c.value.qid === 'Q155'));
  assert.ok(create.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q955824'));
  assert.equal(applied[0].ops.some((o) => o.ref === 'person'), false);   // no president required
  assert.match(host.innerHTML, /Success/);
});

test('Add association: picking an existing match switches to Edit details for it', async () => {
  const { win, host, ports, type, click } = setup({
    searchEntities: async () => [{ qid: 'Q42', label: 'Rede de Pesquisa Empírica em Direito', description: 'association' }],
  });
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'create-association' } });
  await settle();
  type(host.querySelector('[data-role="ta-identify"] input[data-role="query"]'), 'Rede de Pesquisa');
  await settle();
  assert.ok(host.querySelector('[data-role="none-of-these"]'));            // offered even though a match exists
  click('[data-pick="Q42"]');
  await settle();
  assert.match(host.innerHTML, /Edit details/);
  assert.deepEqual([...host.querySelectorAll('.wizard__steps li')].map((li) => li.textContent.trim()), ['1 details', '2 review']);
  assert.ok(host.querySelector('input[name="label-pt"]'));
});

test('reopening the wizard on the same host does not leave the old wizard handling clicks', async () => {
  const { win, host, ports, type, click } = setup();
  const seed = { mode: 'update-field', association: { qid: 'Q1' } };
  createWizard(host, { window: win, config: cfg, ports, seed });
  await settle();
  createWizard(host, { window: win, config: cfg, ports, seed });
  await settle();
  type(host.querySelector('input[name="label-en"]'), 'Network');
  click('[data-role="next"]');
  assert.equal(host.querySelectorAll('.wizard__steps li[aria-current="true"]').length, 1);
  assert.match(host.querySelector('.wizard__steps li[aria-current="true"]').textContent, /2 review/);
});
