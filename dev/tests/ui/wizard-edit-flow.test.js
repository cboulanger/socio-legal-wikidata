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

test('typing never replaces the input being typed in (focus, caret and value survive)', async () => {
  const { win, host, ports } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  for (const name of ['label-en', 'description-pt', 'website', 'email', 'referenceUrl']) {
    const el = host.querySelector(`input[name="${name}"]`);
    el.focus();
    el.value = 'abc';
    el.setSelectionRange(3, 3);
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.equal(host.querySelector(`input[name="${name}"]`), el, `${name} was re-created`);
    assert.equal(win.document.activeElement, el);
    assert.equal(el.selectionStart, 3);
    assert.equal(el.value, 'abc');
  }
});

test('typing still updates errors and the Next button without a full re-render', async () => {
  const { win, host, ports, type } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  const next = host.querySelector('[data-role="next"]');
  const website = host.querySelector('input[name="website"]');
  assert.ok(next.disabled);
  assert.match(host.querySelector('[data-role="errors"]').textContent, /change at least one field/);

  type(website, 'https://reed.example');
  assert.match(host.querySelector('[data-role="errors"]').textContent, /a reference URL is required/);
  assert.ok(next.disabled);
  assert.match(host.querySelector('[data-role="ref-label"]').textContent, /(required)/);

  type(host.querySelector('input[name="referenceUrl"]'), 'https://reed.example/sobre');
  assert.equal(host.querySelector('[data-role="errors"]').textContent.trim(), '');
  assert.equal(next.disabled, false);
  assert.equal(host.querySelector('[data-role="next"]'), next);          // same button node, just enabled
  assert.equal(host.querySelector('input[name="website"]'), website);
});

test('the shared-address checkbox appears and disappears as the e-mail changes, without replacing the e-mail input', async () => {
  const { win, host, ports, type } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  const email = host.querySelector('input[name="email"]');
  assert.equal(host.querySelector('input[name="emailConfirmedShared"]'), null);

  type(email, 'jane.doe@uni.edu');
  const box = host.querySelector('input[name="emailConfirmedShared"]');
  assert.ok(box, 'a personal-looking address asks for confirmation');
  assert.equal(host.querySelector('input[name="email"]'), email);
  assert.match(host.querySelector('[data-role="errors"]').textContent, /shared role address/);

  box.checked = true;
  box.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.doesNotMatch(host.querySelector('[data-role="errors"]').textContent, /shared role address/);

  type(email, 'office@reed.example');                                    // a role address: no confirmation needed
  assert.equal(host.querySelector('input[name="emailConfirmedShared"]'), null);

  type(email, 'john.smith@uni.edu');                                     // personal again: confirmation was reset
  assert.equal(host.querySelector('input[name="emailConfirmedShared"]').checked, false);
});

test('the directory-visibility warning follows the names as they are typed', async () => {
  const { win, host, ports, type } = setup();
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  const warn = () => host.querySelector('[data-role="visibility-warn"]').textContent;
  assert.match(warn(), /appear as its Wikidata ID/);                     // only a Portuguese name so far
  type(host.querySelector('input[name="label-en"]'), 'Brazilian Network');
  assert.doesNotMatch(warn(), /appear as its Wikidata ID/);              // English is a directory language
});

const itemEntity = (claims = {}) => ({
  labels: { en: { language: 'en', value: 'Some Society' } }, descriptions: {},
  claims: { P17: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q155' } } } }], ...claims },
});
const statementIds = (prop, ...qids) => ({ [prop]: qids.map((q) => ({ rank: 'normal', mainsnak: { datavalue: { value: { id: q } } } })) });

test('an existing item that is not in the directory offers to add it (ticked when the user searched for it)', async () => {
  const { win, host, ports, applied, type, click } = setup({
    searchEntities: async () => [{ qid: 'Q42', label: 'Some Society', description: 'society' }],
    getEntity: async () => itemEntity(statementIds('P31', 'Q43229')),         // an organization, no field of work
  });
  createWizard(host, { window: win, config: { ...cfg, inScopeClassQids: ['Q955824', 'Q48204'] }, ports, seed: { mode: 'create-association' }, isInDirectory: () => false });
  await settle();
  type(host.querySelector('[data-role="ta-identify"] input[data-role="query"]'), 'Some Society');
  await settle();
  assert.match(host.innerHTML, /not in directory yet/);
  click('[data-pick="Q42"]');
  await settle();

  const box = host.querySelector('input[name="addToDirectory"]');
  assert.ok(box, 'the notice is shown');
  assert.equal(box.checked, true);
  assert.match(host.querySelector('[data-role="errors"]').textContent, /a reference URL is required/);

  type(host.querySelector('input[name="referenceUrl"]'), 'https://society.example/about');
  click('[data-role="next"]');
  assert.match(host.innerHTML, /add to directory: instance of Q955824/);
  assert.match(host.innerHTML, /add to directory: field of work Q2734663/);
  click('[data-role="submit"]');
  await settle();
  assert.deepEqual(applied[0].ops.map((o) => [o.property, o.value.qid]), [['P31', 'Q955824'], ['P101', 'Q2734663']]);
  assert.equal(applied[0].ops[0].reference.P854, 'https://society.example/about');
});

test('the notice can be unticked, and it is not shown for an item that is already in scope', async () => {
  const notInScope = setup({ getEntity: async () => itemEntity(statementIds('P31', 'Q43229')) });
  createWizard(notInScope.host, { window: notInScope.win, config: cfg, ports: notInScope.ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  const box = notInScope.host.querySelector('input[name="addToDirectory"]');
  assert.ok(box);
  assert.equal(box.checked, false);                                        // opened from the card, not from a search: opt-in
  box.checked = true;
  box.dispatchEvent(new notInScope.win.Event('input', { bubbles: true }));
  assert.match(notInScope.host.querySelector('[data-role="errors"]').textContent, /a reference URL is required/);
  box.checked = false;
  box.dispatchEvent(new notInScope.win.Event('input', { bubbles: true }));
  assert.doesNotMatch(notInScope.host.querySelector('[data-role="errors"]').textContent, /a reference URL is required/);

  const inScope = setup({ getEntity: async () => itemEntity({ ...statementIds('P31', 'Q955824'), ...statementIds('P101', 'Q2734663') }) });
  createWizard(inScope.host, { window: inScope.win, config: cfg, ports: inScope.ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  assert.equal(inScope.host.querySelector('input[name="addToDirectory"]'), null);
});

test('only the missing statement is offered: an item with the type but not the field', async () => {
  const { win, host, ports, type, click, applied } = setup({
    getEntity: async () => itemEntity(statementIds('P31', 'Q955824')),
  });
  createWizard(host, { window: win, config: cfg, ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  const box = host.querySelector('input[name="addToDirectory"]');
  box.checked = true;
  box.dispatchEvent(new win.Event('input', { bubbles: true }));
  type(host.querySelector('input[name="referenceUrl"]'), 'https://x.example');
  click('[data-role="next"]');
  click('[data-role="submit"]');
  await settle();
  assert.deepEqual(applied[0].ops.map((o) => o.property), ['P101']);
});

const timeQ = (y) => [{ datavalue: { value: { time: `+${y}-00-00T00:00:00Z`, precision: 9 } } }];
const namedEntity = (extra = {}) => ({
  labels: { pt: { language: 'pt', value: 'Rede Antiga' } }, descriptions: {},
  claims: { P17: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q155' } } } }] }, ...extra,
});
const openEdit = async (over = {}) => {
  const env = setup({ getEntity: async () => namedEntity(over.entity || {}), ...over.search });
  createWizard(env.host, { window: env.win, config: cfg, ports: env.ports, seed: { mode: 'update-field', association: { qid: 'Q1' } } });
  await settle();
  return env;
};

test('renaming an existing name offers to record the old one as a former name, then writes both', async () => {
  const { win, host, applied, type, click } = await openEdit();
  assert.equal(host.querySelector('[data-role="rename-hint"]'), null);          // nothing renamed yet
  type(host.querySelector('input[name="label-pt"]'), 'Rede Nova');
  const hint = host.querySelector('[data-role="rename-hint"]');
  assert.ok(hint);
  assert.match(hint.textContent, /Record “Rede Antiga” \(pt\) as a former name/);

  click('[data-role="rename-hint"]');                                            // one click adds a prefilled row
  assert.equal(host.querySelector('input[name="former-text-0"]').value, 'Rede Antiga');
  assert.equal(host.querySelector('input[name="former-lang-0"]').value, 'pt');
  assert.equal(host.querySelector('input[name="former-alias-0"]').checked, true);
  assert.equal(host.querySelector('[data-role="rename-hint"]'), null);           // recorded, so the hint is gone

  assert.ok(host.querySelector('[data-role="next"]').disabled);                  // a former name needs a reference URL
  type(host.querySelector('input[name="former-start-0"]'), '1995');
  type(host.querySelector('input[name="former-end-0"]'), '2010');
  type(host.querySelector('input[name="referenceUrl"]'), 'https://reed.example/historia');
  assert.equal(host.querySelector('[data-role="next"]').disabled, false);
  click('[data-role="next"]');
  assert.match(host.innerHTML, /former name \(pt\): “Rede Antiga” \(1995–2010\), also an alias/);
  click('[data-role="submit"]');
  await settle();

  const ops = applied[0].ops;
  assert.deepEqual(ops[0].labels, { pt: 'Rede Nova' });
  assert.deepEqual(ops[0].aliases, { pt: ['Rede Antiga'] });
  const stmt = ops.find((o) => o.property === 'P1448');
  assert.deepEqual([stmt.value.text, stmt.value.language], ['Rede Antiga', 'pt']);
  assert.deepEqual(stmt.qualifiers.map((q) => [q.property, q.value.value]), [['P580', '1995-01-01'], ['P582', '2010-01-01']]);
  assert.match(host.innerHTML, /Success/);
});

test('former names already on the item are listed, and an identical new row is not written twice', async () => {
  const { host, applied, type, click } = await openEdit({ entity: { claims: {
    P17: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q155' } } } }],
    P1448: [{ rank: 'normal', mainsnak: { datavalue: { value: { text: 'Rede Velha', language: 'pt' } } }, qualifiers: { P580: timeQ('1990'), P582: timeQ('1999') } }],
  } } });
  assert.match(host.querySelector('.former__existing').textContent, /Rede Velha \(pt\) · 1990–1999/);
  click('[data-role="add-former"]');
  type(host.querySelector('input[name="former-text-0"]'), 'Rede Velha');
  type(host.querySelector('input[name="former-start-0"]'), '1990');
  type(host.querySelector('input[name="former-end-0"]'), '1999');
  assert.match(host.querySelector('[data-role="errors"]').textContent, /change at least one field/);   // it is already there
  type(host.querySelector('input[name="former-text-0"]'), 'Rede Ainda Mais Velha');
  type(host.querySelector('input[name="referenceUrl"]'), 'https://x.example');
  click('[data-role="next"]');
  click('[data-role="submit"]');
  await settle();
  assert.deepEqual(applied[0].ops.filter((o) => o.property === 'P1448').map((o) => o.value.text), ['Rede Ainda Mais Velha']);
});

test('adding a former name row uses the national language, can be removed, and reports bad years', async () => {
  const { host, type, click } = await openEdit();
  click('[data-role="add-former"]');
  assert.equal(host.querySelector('input[name="former-lang-0"]').value, 'pt');   // national language first
  type(host.querySelector('input[name="former-text-0"]'), 'Antiga');
  type(host.querySelector('input[name="former-end-0"]'), '20x0');
  assert.match(host.querySelector('[data-role="errors"]').textContent, /“20x0” is not a year/);
  click('[data-role="remove-former"]');
  assert.equal(host.querySelector('input[name="former-text-0"]'), null);
  assert.match(host.querySelector('[data-role="errors"]').textContent, /change at least one field/);
});

test('typing in a former-name field keeps the input (focus, caret) and the hint follows the name', async () => {
  const { win, host, type, click } = await openEdit();
  click('[data-role="add-former"]');
  const el = host.querySelector('input[name="former-text-0"]');
  el.focus();
  el.value = 'Abc';
  el.setSelectionRange(3, 3);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(host.querySelector('input[name="former-text-0"]'), el);
  assert.equal(win.document.activeElement, el);
  assert.equal(el.selectionStart, 3);
  type(host.querySelector('input[name="label-pt"]'), 'Rede Nova');
  assert.ok(host.querySelector('[data-role="rename-hint"]'));
  type(host.querySelector('input[name="label-pt"]'), 'Rede Antiga');            // changed back: no rename any more
  assert.equal(host.querySelector('[data-role="rename-hint"]'), null);
});
