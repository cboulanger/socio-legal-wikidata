# Edit Mode & Wikidata Write Path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the opt-in edit mode to the read-only app: OAuth-connect a Wikimedia account (silent for returning editors, `?edit` for first-timers), a six-step search-first wizard that composes a minimal set of Wikidata changes, and a write path that either edits Wikidata directly or hands the batch to QuickStatements.

**Architecture:** Same layered ES modules. New pure `core/` modules (`dedupe`, `email-guard`, `changeset`, `quickstatements`), new `adapters/` (`oauth-pkce`, `wikibase-api`, `quickstatements-handoff`), a `ui/mode.js` gate, an `entity-typeahead` component, and `ui/edit-wizard/*`. `src/app.js` gains an edit-mode branch that dynamically `import()`s the wizard so read-only visitors never download it.

**Tech Stack:** OAuth 2.0 Authorization Code + PKCE (public client, no secret), Wikibase REST API + Action API, QuickStatements v1 text, `node:test` + `jsdom`.

**Prerequisite:** [`2026-09-02-read-only-directory-app.md`](2026-09-02-read-only-directory-app.md) is fully implemented and its tests pass. Also needs, from the operations runbook, a registered OAuth consumer **client ID** and the CORS-spike decision that sets `writeMode`.

Specs: [`../spec/2026-09-01-socio-legal-associations-directory-design.md`](../spec/2026-09-01-socio-legal-associations-directory-design.md) §2.5, §2.6; [`../spec/2026-09-02-ui-design.md`](../spec/2026-09-02-ui-design.md) §1.6, §1.7, §2.3.

---

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `callback.html` | OAuth redirect target: hands `?code` to `oauth-callback.js`, then returns to `/#/` |
| `src/core/email-guard.js` | `looksPersonal(email)` |
| `src/core/dedupe.js` | `normalizeLabel`, `similarity`, `rankCandidates`, `isLikelyDuplicate` |
| `src/core/draft.js` | `DirectoryDraft` typedef + `emptyDraft`, `validateDraftForChangeset` |
| `src/core/changeset.js` | `buildChangeSet(draft, cfg)` → `{summary, ops}` |
| `src/core/quickstatements.js` | `serialize(changeSet)` → QS v1 text |
| `src/adapters/oauth-pkce.js` | `pkceChallenge`, `buildAuthorizeUrl`, `exchangeCode`, `refresh`, `createAuth` |
| `src/adapters/oauth-callback.js` | `handleCallback({location, storage, fetch, config})` |
| `src/adapters/wikibase-api.js` | `createWikibaseApi` — `searchEntities`, `getEntity`, `lookupByExternalId`, `applyChangeSet` (direct) |
| `src/adapters/quickstatements-handoff.js` | `createQuickStatementsWriter` — `applyChangeSet` opens QS |
| `src/ui/mode.js` | `detectMode({location, auth, config})` → `Promise<'read'\|'edit'>` |
| `src/ui/components/entity-typeahead.js` | search-first pick/create widget |
| `src/ui/edit-wizard/steps.js` | per-step field specs + `validateStep` |
| `src/ui/edit-wizard/wizard.js` | `createWizard` — step flow, draft persistence, `toChangeSet`, submit |
| `src/ui/edit-panel.js` | edit-mode chrome: "Edit mode" badge, Add button, connect prompt, result panel |

**Modify:**

| Path | Change |
| --- | --- |
| `config.json` | OAuth + edit-mode + write-path keys |
| `src/ports/index.js` | add `AuthPort`, `SearchPort`, `WritePort` typedefs |
| `src/app.js` | edit-mode branch: build auth + write adapters, dynamic-import the wizard, wire Edit/Add, render result panel, "leave edit mode" |
| `README.md` | edit-mode section |

---

## Task 1: Config keys + port typedefs

**Files:**
- Modify: `config.json`
- Modify: `src/ports/index.js`

- [ ] **Step 1: Add keys to `config.json`** (merge into the existing object)

```json
{
  "oauth": {
    "authorizeUrl": "https://meta.wikimedia.org/w/rest.php/oauth2/authorize",
    "tokenUrl": "https://meta.wikimedia.org/w/rest.php/oauth2/access_token",
    "clientId": "REPLACE_WITH_REGISTERED_CONSUMER_CLIENT_ID",
    "redirectUri": "https://REPLACE_WITH_DEPLOY_HOST/callback.html",
    "scopes": "basic editpage createpage"
  },
  "editTrigger": "either",
  "editParam": "edit",
  "tokenPersistence": "persistent",
  "writeMode": "direct",
  "wikibaseRestBase": "https://www.wikidata.org/w/rest.php/wikibase/v1",
  "wikidataActionApi": "https://www.wikidata.org/w/api.php",
  "quickstatementsUrl": "https://quickstatements.toolforge.org/#/v1=",
  "humanQid": "Q5",
  "researcherQid": "Q1650915",
  "academicJournalQid": "Q737498"
}
```

- [ ] **Step 2: Append typedefs to `src/ports/index.js`**

```js
/**
 * @typedef {Object} AuthPort
 * @property {() => boolean} hasSession        // a refresh token is stored
 * @property {() => Promise<boolean>} restore  // silently mint an access token; false if not possible
 * @property {() => Promise<void>} connect     // begin the interactive OAuth redirect
 * @property {() => Promise<string>} getToken  // a valid access token, refreshing if needed
 * @property {() => Promise<void>} disconnect  // drop tokens (and revoke if persistent)
 *
 * @typedef {Object} EntityCandidate
 * @property {string} qid
 * @property {string} label
 * @property {string} description
 *
 * @typedef {Object} SearchPort
 * @property {(text: string, type: 'item') => Promise<EntityCandidate[]>} searchEntities
 * @property {(qid: string) => Promise<any>} getEntity
 * @property {(property: string, value: string) => Promise<EntityCandidate[]>} lookupByExternalId
 *
 * @typedef {Object} WriteResult
 * @property {'direct'|'quickstatements'} via
 * @property {{ref: string, qid: string}[]} created  // ref -> new QID (direct only)
 * @property {string[]} diffUrls
 * @property {string} [handoffUrl]                     // quickstatements only
 *
 * @typedef {Object} WritePort
 * @property {(changeSet: import('../core/changeset.js').ChangeSet, token: string|null) => Promise<WriteResult>} applyChangeSet
 */
```

- [ ] **Step 3: Commit**

```bash
git add config.json src/ports/index.js
git commit -m "feat(edit): config keys and auth/search/write port typedefs"
```

---

## Task 2: `core/email-guard.js`

**Files:**
- Create: `src/core/email-guard.js`
- Test: `dev/tests/core/email-guard.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksPersonal } from '../../../src/core/email-guard.js';

test('free-mail domains are flagged', () => {
  assert.equal(looksPersonal('someone@gmail.com'), true);
  assert.equal(looksPersonal('a.b@googlemail.com'), true);
  assert.equal(looksPersonal('x@outlook.com'), true);
});

test('name-shaped local part on any domain is flagged', () => {
  assert.equal(looksPersonal('jane.doe@university.edu'), true);
  assert.equal(looksPersonal('j.smith@some-lab.org'), true);
});

test('role/office addresses are not flagged', () => {
  assert.equal(looksPersonal('info@rechtssoziologie.info'), false);
  assert.equal(looksPersonal('admin@slsa.ac.uk'), false);
  assert.equal(looksPersonal('lsa@lawandsociety.org'), false);
});

test('non-strings are not flagged', () => {
  assert.equal(looksPersonal(''), false);
  assert.equal(looksPersonal(null), false);
});
```

- [ ] **Step 2: Run test — expect FAIL** (`cd dev && node --test tests/core/email-guard.test.js`)

- [ ] **Step 3: Write `src/core/email-guard.js`**

```js
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.co.uk', 'gmx.de', 'gmx.net', 'web.de', 'icloud.com',
  'me.com', 'proton.me', 'protonmail.com', 'mail.ru', 'yandex.ru', 'qq.com',
]);
const ROLE_WORDS = new Set([
  'info', 'admin', 'office', 'contact', 'secretariat', 'secretary', 'board',
  'exec', 'team', 'mail', 'email', 'kontakt', 'buero', 'bureau', 'general',
  'president', 'chair', 'communications', 'comms', 'membership', 'hello',
]);

/**
 * Heuristic: does this address look like an individual's private mailbox?
 * @param {unknown} email
 * @returns {boolean}
 */
export function looksPersonal(email) {
  if (typeof email !== 'string' || !email.includes('@')) return false;
  const [local, domain] = email.toLowerCase().split('@');
  if (FREE_MAIL.has(domain)) return true;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.some((p) => ROLE_WORDS.has(p))) return false;
  // firstname.lastname or f.lastname patterns
  if (parts.length >= 2 && parts.every((p) => /^[a-z]+$/.test(p)) && parts.some((p) => p.length >= 3)) {
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run test — expect PASS** (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/email-guard.js dev/tests/core/email-guard.test.js
git commit -m "feat(core): personal e-mail heuristic guard"
```

---

## Task 3: `core/dedupe.js`

**Files:**
- Create: `src/core/dedupe.js`
- Test: `dev/tests/core/dedupe.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLabel, similarity, rankCandidates, isLikelyDuplicate } from '../../../src/core/dedupe.js';

test('normalizeLabel folds case, diacritics, punctuation, whitespace', () => {
  assert.equal(normalizeLabel('  Société  Française de  Droit '), 'societe francaise de droit');
  assert.equal(normalizeLabel('Law & Society Assoc.'), 'law society assoc');
});

test('similarity is 1 for equal normalized strings and lower for different', () => {
  assert.equal(similarity('Law and Society', 'law and society'), 1);
  assert.ok(similarity('Law and Society Association', 'Law & Society Assoc') > 0.6);
  assert.ok(similarity('Law and Society', 'Philosophy of Law') < 0.5);
});

test('rankCandidates sorts by descending similarity to the query', () => {
  const cands = [
    { qid: 'Q1', label: 'Asian Law Institute', description: '' },
    { qid: 'Q2', label: 'Asian Law and Society Association', description: '' },
  ];
  const ranked = rankCandidates('Asian Law and Society Association', cands);
  assert.deepEqual(ranked.map((c) => c.qid), ['Q2', 'Q1']);
  assert.ok(ranked[0].score >= ranked[1].score);
});

test('isLikelyDuplicate true when a candidate scores above the threshold', () => {
  const cands = [{ qid: 'Q2', label: 'Law & Society Assoc', description: '' }];
  assert.equal(isLikelyDuplicate('Law and Society Association', cands, 0.6), true);
  assert.equal(isLikelyDuplicate('Sociology of Law Section', cands, 0.6), false);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/core/dedupe.js`**

```js
/** @param {string} s */
export function normalizeLabel(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Dice coefficient over character bigrams of the normalized strings. */
export function similarity(a, b) {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ma = bigrams(na);
  const mb = bigrams(nb);
  let overlap = 0;
  for (const [g, count] of ma) if (mb.has(g)) overlap += Math.min(count, mb.get(g));
  return (2 * overlap) / (na.length - 1 + (nb.length - 1));
}

/**
 * @param {string} query
 * @param {import('../ports/index.js').EntityCandidate[]} candidates
 * @returns {(import('../ports/index.js').EntityCandidate & {score: number})[]}
 */
export function rankCandidates(query, candidates) {
  return candidates
    .map((c) => ({ ...c, score: similarity(query, c.label) }))
    .sort((x, y) => y.score - x.score);
}

/** @param {string} query @param {import('../ports/index.js').EntityCandidate[]} candidates @param {number} threshold */
export function isLikelyDuplicate(query, candidates, threshold = 0.6) {
  return rankCandidates(query, candidates).some((c) => c.score >= threshold);
}
```

- [ ] **Step 4: Run test — expect PASS** (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/dedupe.js dev/tests/core/dedupe.test.js
git commit -m "feat(core): label normalisation and fuzzy duplicate detection"
```

---

## Task 4: `core/draft.js` — the wizard's data object

**Files:**
- Create: `src/core/draft.js`
- Test: `dev/tests/core/draft.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, validateDraftForChangeset } from '../../../src/core/draft.js';

test('emptyDraft has a mode and nested association/president/journal', () => {
  const d = emptyDraft('create-association');
  assert.equal(d.mode, 'create-association');
  assert.equal(d.association.qid, null);
  assert.equal(d.journal, null);
});

test('validateDraftForChangeset: create-association requires label, class, field, reference', () => {
  const d = emptyDraft('create-association');
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.label is required'));
  assert.ok(errs.includes('association.referenceUrl is required'));
});

test('validateDraftForChangeset: change-president requires association.qid, president identity, termStart', () => {
  const d = emptyDraft('change-president');
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.qid is required'));
  assert.ok(errs.includes('president identity is required'));
  assert.ok(errs.includes('termStart is required'));
});

test('a personal e-mail without emailConfirmedShared is an error', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q1';
  d.association.email = 'jane.doe@uni.edu';
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.some((e) => /personal/i.test(e)));
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/core/draft.js`**

```js
import { looksPersonal } from './email-guard.js';

/**
 * @typedef {Object} DraftAssociation
 * @property {string|null} qid
 * @property {string} label
 * @property {string} description
 * @property {string|null} classQid
 * @property {string|null} fieldQid
 * @property {string|null} countryQid
 * @property {string|null} operatingAreaQid
 * @property {string|null} seatQid
 * @property {string|null} parentQid
 * @property {string|null} website
 * @property {string|null} email
 * @property {boolean} emailConfirmedShared
 * @property {string|null} inception     // 'YYYY'
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DraftPerson
 * @property {string|null} qid
 * @property {string} label
 * @property {string} description
 * @property {string|null} homepage
 * @property {string|null} orcid
 * @property {string|null} universityQid
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DraftJournal
 * @property {string|null} qid
 * @property {string} label
 * @property {string|null} url
 * @property {string|null} issn
 * @property {string|null} referenceUrl
 *
 * @typedef {Object} DirectoryDraft
 * @property {'create-association'|'change-president'|'update-field'} mode
 * @property {DraftAssociation} association
 * @property {DraftPerson} president
 * @property {DraftJournal|null} journal
 * @property {string|null} previousPresidentStatementId
 * @property {string|null} termStart    // ISO date
 */

/** @param {DirectoryDraft['mode']} mode @returns {DirectoryDraft} */
export function emptyDraft(mode) {
  return {
    mode,
    association: {
      qid: null, label: '', description: '', classQid: null, fieldQid: null,
      countryQid: null, operatingAreaQid: null, seatQid: null, parentQid: null,
      website: null, email: null, emailConfirmedShared: false, inception: null, referenceUrl: null,
    },
    president: {
      qid: null, label: '', description: '', homepage: null, orcid: null,
      universityQid: null, referenceUrl: null,
    },
    journal: null,
    previousPresidentStatementId: null,
    termStart: null,
  };
}

/** @param {DirectoryDraft} d @returns {string[]} */
export function validateDraftForChangeset(d) {
  const e = [];
  const a = d.association;
  const p = d.president;

  if (a.email && looksPersonal(a.email) && !a.emailConfirmedShared) {
    e.push('association.email looks personal; confirm it is a shared role address');
  }

  if (d.mode === 'create-association') {
    if (!a.label) e.push('association.label is required');
    if (!a.classQid) e.push('association.classQid is required');
    if (!a.fieldQid) e.push('association.fieldQid is required');
    if (!a.referenceUrl) e.push('association.referenceUrl is required');
    if (!p.qid && !p.label) e.push('president identity is required');
    if (!p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
    if (!p.qid && !p.referenceUrl) e.push('president.referenceUrl is required for a new person');
  }

  if (d.mode === 'change-president') {
    if (!a.qid) e.push('association.qid is required');
    if (!p.qid && !p.label) e.push('president identity is required');
    if (!d.termStart) e.push('termStart is required');
    if (!p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
  }

  if (d.mode === 'update-field') {
    if (!a.qid) e.push('association.qid is required');
    if (!a.email && !a.website) e.push('nothing to update');
  }

  if (d.journal && !d.journal.qid && !d.journal.label) e.push('journal.label is required to create a journal');
  return e;
}
```

- [ ] **Step 4: Run test — expect PASS** (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/draft.js dev/tests/core/draft.test.js
git commit -m "feat(core): wizard draft type and pre-changeset validation"
```

---

## Task 5: `core/changeset.js` — draft → declarative operations

**Files:**
- Create: `src/core/changeset.js`
- Test: `dev/tests/core/changeset.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../../../src/core/draft.js';
import { buildChangeSet } from '../../../src/core/changeset.js';

const cfg = { humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498' };

test('change-president with an existing person: one add + one end statement', () => {
  const d = emptyDraft('change-president');
  d.association.qid = 'Q100';
  d.president.qid = 'Q200';
  d.president.universityQid = 'Q300';
  d.president.referenceUrl = 'https://uni.example/staff/x';
  d.termStart = '2026-01-01';
  d.previousPresidentStatementId = 'Q100$abc-123';

  const cs = buildChangeSet(d, cfg);
  const add = cs.ops.find((o) => o.type === 'add-statement' && o.property === 'P488');
  assert.deepEqual(add.target, { qid: 'Q100' });
  assert.deepEqual(add.value, { kind: 'item', qid: 'Q200' });
  assert.deepEqual(add.qualifiers, [{ property: 'P580', value: { kind: 'time', value: '2026-01-01', precision: 11 } }]);
  assert.ok(add.reference);
  const end = cs.ops.find((o) => o.type === 'end-statement');
  assert.deepEqual(end, { type: 'end-statement', statementId: 'Q100$abc-123', endDate: '2026-01-01' });
  assert.match(cs.summary, /new president/i);
});

test('change-president with a NEW person: create-item first, refs wired', () => {
  const d = emptyDraft('change-president');
  d.association.qid = 'Q100';
  d.president.label = 'Jane Roe';
  d.president.homepage = 'https://uni.example/roe';
  d.president.orcid = '0000-0002-1825-0097';
  d.president.universityQid = 'Q300';
  d.president.referenceUrl = 'https://uni.example/staff/roe';
  d.termStart = '2026-01-01';

  const cs = buildChangeSet(d, cfg);
  const create = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'person');
  assert.equal(create.labels.en, 'Jane Roe');
  assert.ok(create.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q5'));
  assert.ok(create.claims.some((c) => c.property === 'P106' && c.value.qid === 'Q1650915'));
  assert.ok(create.claims.some((c) => c.property === 'P108' && c.value.qid === 'Q300'));
  assert.ok(create.claims.some((c) => c.property === 'P856' && c.value.value === 'https://uni.example/roe'));
  assert.ok(create.claims.some((c) => c.property === 'P496' && c.value.value === '0000-0002-1825-0097'));
  const add = cs.ops.find((o) => o.type === 'add-statement' && o.property === 'P488');
  assert.deepEqual(add.value, { kind: 'item', ref: 'person' });
});

test('create-association with a new journal links journal P123 to the association ref', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, {
    label: 'European Society for Empirical Legal Studies',
    description: 'European society for empirical legal studies',
    classQid: 'Q955824', fieldQid: 'Q2734663', countryQid: 'Q55',
    website: 'https://esels.eu', email: 'contact@esels.eu',
    inception: '2021', referenceUrl: 'https://esels.eu/about',
  });
  d.president.qid = 'Q400';
  d.termStart = '2024-01-01';
  d.journal = { qid: null, label: 'European Journal of Empirical Legal Studies', url: 'https://esels.eu/ejels/', issn: null, referenceUrl: 'https://esels.eu/ejels/' };

  const cs = buildChangeSet(d, cfg);
  const assoc = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'assoc');
  assert.ok(assoc.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q955824'));
  assert.ok(assoc.claims.some((c) => c.property === 'P101' && c.value.qid === 'Q2734663'));
  assert.ok(assoc.claims.some((c) => c.property === 'P17' && c.value.qid === 'Q55'));
  assert.ok(assoc.claims.some((c) => c.property === 'P571' && c.value.precision === 9));
  const p488 = assoc.claims.find((c) => c.property === 'P488');
  assert.deepEqual(p488.value, { kind: 'item', qid: 'Q400' });
  const journal = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'journal');
  assert.ok(journal.claims.some((c) => c.property === 'P123' && c.value.ref === 'assoc'));
});

test('update-field emits one referenced add-statement per provided field', () => {
  const d = emptyDraft('update-field');
  d.association.qid = 'Q100';
  d.association.email = 'office@body.org';
  d.association.website = 'https://body.org';
  d.association.referenceUrl = 'https://body.org';
  const cs = buildChangeSet(d, cfg);
  const props = cs.ops.filter((o) => o.type === 'add-statement').map((o) => o.property).sort();
  assert.deepEqual(props, ['P856', 'P968']);
  assert.ok(cs.ops.every((o) => o.type !== 'add-statement' || o.replace === true));
});

test('buildChangeSet throws on an invalid draft', () => {
  assert.throws(() => buildChangeSet(emptyDraft('create-association'), cfg), /association\.label is required/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/core/changeset.js`**

```js
import { validateDraftForChangeset } from './draft.js';

/**
 * @typedef {{kind:'item', qid:string}|{kind:'item', ref:string}
 *   |{kind:'string', value:string}|{kind:'url', value:string}
 *   |{kind:'external-id', value:string}
 *   |{kind:'time', value:string, precision:number}} Value
 * @typedef {{property:string, value:Value}} Qualifier
 * @typedef {{P854:string}} Reference
 * @typedef {{property:string, value:Value, qualifiers?:Qualifier[], reference?:Reference}} Claim
 *
 * @typedef {{type:'create-item', ref:string, labels:Object<string,string>, descriptions:Object<string,string>, claims:Claim[]}
 *   |{type:'add-statement', target:{qid:string}|{ref:string}, property:string, value:Value, qualifiers?:Qualifier[], reference?:Reference, replace?:boolean}
 *   |{type:'end-statement', statementId:string, endDate:string}} Op
 *
 * @typedef {{summary:string, ops:Op[]}} ChangeSet
 */

const ref = (r) => ({ kind: 'item', ref: r });
const item = (qid) => ({ kind: 'item', qid });
const url = (value) => ({ kind: 'url', value });
const str = (value) => ({ kind: 'string', value });
const extId = (value) => ({ kind: 'external-id', value });
const year = (value) => ({ kind: 'time', value: `${value}-01-01`, precision: 9 });
const day = (value) => ({ kind: 'time', value, precision: 11 });

/**
 * @param {import('./draft.js').DirectoryDraft} draft
 * @param {{humanQid:string, researcherQid:string, academicJournalQid:string}} cfg
 * @returns {ChangeSet}
 */
export function buildChangeSet(draft, cfg) {
  const errors = validateDraftForChangeset(draft);
  if (errors.length) throw new Error(`invalid draft: ${errors.join('; ')}`);

  /** @type {Op[]} */
  const ops = [];
  const a = draft.association;
  const p = draft.president;
  const j = draft.journal;

  // --- person (create if new) ---
  let personValue = null;
  if (draft.mode !== 'update-field') {
    if (p.qid) {
      personValue = item(p.qid);
      if (p.universityQid) {
        ops.push({ type: 'add-statement', target: { qid: p.qid }, property: 'P108', value: item(p.universityQid), reference: p.referenceUrl ? { P854: p.referenceUrl } : undefined });
      }
    } else {
      /** @type {Claim[]} */
      const claims = [
        { property: 'P31', value: item(cfg.humanQid) },
        { property: 'P106', value: item(cfg.researcherQid) },
        { property: 'P108', value: item(p.universityQid) },
      ];
      if (p.homepage) claims.push({ property: 'P856', value: url(p.homepage) });
      if (p.orcid) claims.push({ property: 'P496', value: extId(p.orcid) });
      for (const c of claims) if (p.referenceUrl) c.reference = { P854: p.referenceUrl };
      ops.push({ type: 'create-item', ref: 'person', labels: { en: p.label }, descriptions: p.description ? { en: p.description } : {}, claims });
      personValue = ref('person');
    }
  }

  // --- journal (create if new) ---
  if (j) {
    if (!j.qid) {
      /** @type {Claim[]} */
      const claims = [
        { property: 'P31', value: item(cfg.academicJournalQid) },
        { property: 'P123', value: a.qid ? item(a.qid) : ref('assoc') },
      ];
      if (j.url) claims.push({ property: 'P856', value: url(j.url) });
      if (j.issn) claims.push({ property: 'P236', value: extId(j.issn) });
      for (const c of claims) if (j.referenceUrl) c.reference = { P854: j.referenceUrl };
      ops.push({ type: 'create-item', ref: 'journal', labels: { en: j.label }, descriptions: {}, claims });
    } else {
      ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P123', value: a.qid ? item(a.qid) : ref('assoc'), reference: j.referenceUrl ? { P854: j.referenceUrl } : undefined });
      if (j.url) ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P856', value: url(j.url) });
      if (j.issn) ops.push({ type: 'add-statement', target: { qid: j.qid }, property: 'P236', value: extId(j.issn) });
    }
  }

  const assocRefUrl = a.referenceUrl ? { P854: a.referenceUrl } : undefined;

  if (draft.mode === 'create-association') {
    /** @type {Claim[]} */
    const claims = [
      { property: 'P31', value: item(a.classQid) },
      { property: 'P101', value: item(a.fieldQid) },
    ];
    if (a.countryQid) claims.push({ property: 'P17', value: item(a.countryQid) });
    if (a.operatingAreaQid) claims.push({ property: 'P2541', value: item(a.operatingAreaQid) });
    if (a.seatQid) claims.push({ property: 'P159', value: item(a.seatQid) });
    if (a.parentQid) claims.push({ property: 'P361', value: item(a.parentQid) });
    if (a.website) claims.push({ property: 'P856', value: url(a.website) });
    if (a.email) claims.push({ property: 'P968', value: str(a.email) });
    if (a.inception) claims.push({ property: 'P571', value: year(a.inception) });
    if (personValue) {
      claims.push({
        property: 'P488',
        value: personValue,
        qualifiers: draft.termStart ? [{ property: 'P580', value: day(draft.termStart) }] : undefined,
      });
    }
    for (const c of claims) if (assocRefUrl) c.reference = assocRefUrl;
    ops.push({ type: 'create-item', ref: 'assoc', labels: { en: a.label }, descriptions: a.description ? { en: a.description } : {}, claims });
    return { summary: `socio-legal directory: create association${j ? ' and journal' : ''} and link president`, ops };
  }

  if (draft.mode === 'change-president') {
    ops.push({
      type: 'add-statement',
      target: { qid: a.qid },
      property: 'P488',
      value: personValue,
      qualifiers: [{ property: 'P580', value: day(draft.termStart) }],
      reference: assocRefUrl,
    });
    if (draft.previousPresidentStatementId) {
      ops.push({ type: 'end-statement', statementId: draft.previousPresidentStatementId, endDate: draft.termStart });
    }
    return { summary: 'socio-legal directory: record new president', ops };
  }

  // update-field
  const changed = [];
  if (a.website) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P856', value: url(a.website), reference: assocRefUrl, replace: true }); changed.push('website'); }
  if (a.email) { ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P968', value: str(a.email), reference: assocRefUrl, replace: true }); changed.push('e-mail'); }
  return { summary: `socio-legal directory: update ${changed.join(' and ')}`, ops };
}
```

- [ ] **Step 4: Run test — expect PASS** (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/changeset.js dev/tests/core/changeset.test.js
git commit -m "feat(core): build declarative change-sets from a wizard draft"
```

---

## Task 6: `core/quickstatements.js`

**Files:**
- Create: `src/core/quickstatements.js`
- Test: `dev/tests/core/quickstatements.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize } from '../../../src/core/quickstatements.js';

test('add-statement with qualifier and reference on an existing item', () => {
  const cs = { summary: 's', ops: [
    { type: 'add-statement', target: { qid: 'Q100' }, property: 'P488', value: { kind: 'item', qid: 'Q200' },
      qualifiers: [{ property: 'P580', value: { kind: 'time', value: '2026-01-01', precision: 11 } }],
      reference: { P854: 'https://ref.example' } },
  ]};
  assert.equal(serialize(cs).trim(), 'Q100\tP488\tQ200\tP580\t+2026-01-01T00:00:00Z/11\tS854\t"https://ref.example"');
});

test('end-statement is expressed as a qualifier add keyed by the statement subject/prop', () => {
  const cs = { summary: 's', ops: [
    { type: 'end-statement', statementId: 'Q100$GUID', endDate: '2026-01-01' },
  ]};
  assert.match(serialize(cs), /# end statement Q100\$GUID with P582 \+2026-01-01T00:00:00Z\/11 \(apply in the QuickStatements UI\)/);
});

test('single create-item emits CREATE + LAST lines', () => {
  const cs = { summary: 's', ops: [
    { type: 'create-item', ref: 'person', labels: { en: 'Jane Roe' }, descriptions: { en: 'researcher' },
      claims: [
        { property: 'P31', value: { kind: 'item', qid: 'Q5' } },
        { property: 'P856', value: { kind: 'url', value: 'https://u/roe' } },
      ] },
  ]};
  assert.equal(serialize(cs).trim().split('\n').join('|'),
    'CREATE|LAST\tLen\t"Jane Roe"|LAST\tDen\t"researcher"|LAST\tP31\tQ5|LAST\tP856\t"https://u/roe"');
});

test('a ref to a previously created item resolves to LAST only if it is the immediately preceding CREATE', () => {
  const cs = { summary: 's', ops: [
    { type: 'create-item', ref: 'person', labels: { en: 'P' }, descriptions: {}, claims: [] },
    { type: 'create-item', ref: 'assoc', labels: { en: 'A' }, descriptions: {},
      claims: [{ property: 'P488', value: { kind: 'item', ref: 'person' } }] },
  ]};
  const out = serialize(cs);
  assert.match(out, /# MANUAL: after import, add P488 -> \(new item "person"\) on new item "assoc"/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/core/quickstatements.js`**

```js
/**
 * Serialise a ChangeSet to QuickStatements v1 (tab-separated). QS v1 cannot
 * forward-reference an item created earlier in the same batch except the
 * single most recent CREATE (via LAST); cross-links between two brand-new
 * items are emitted as `# MANUAL:` comments for a second pass.
 * @param {import('./changeset.js').ChangeSet} cs
 * @returns {string}
 */
export function serialize(cs) {
  const lines = [];
  let lastCreatedRef = null;

  const qsValue = (v) => {
    switch (v.kind) {
      case 'item': return v.qid || null;              // ref handled by caller
      case 'string': case 'url': case 'external-id': return `"${v.value}"`;
      case 'time': return `+${v.value}T00:00:00Z/${v.precision}`;
      default: return null;
    }
  };

  const tail = (claim) => {
    let s = '';
    for (const q of claim.qualifiers || []) s += `\t${q.property}\t${qsValue(q.value)}`;
    if (claim.reference && claim.reference.P854) s += `\tS854\t"${claim.reference.P854}"`;
    return s;
  };

  for (const op of cs.ops) {
    if (op.type === 'create-item') {
      lines.push('CREATE');
      for (const [lang, text] of Object.entries(op.labels)) lines.push(`LAST\tL${lang}\t"${text}"`);
      for (const [lang, text] of Object.entries(op.descriptions)) lines.push(`LAST\tD${lang}\t"${text}"`);
      for (const c of op.claims) {
        if (c.value.kind === 'item' && c.value.ref) {
          lines.push(`# MANUAL: after import, add ${c.property} -> (new item "${c.value.ref}") on new item "${op.ref}"`);
          continue;
        }
        lines.push(`LAST\t${c.property}\t${qsValue(c.value)}${tail(c)}`);
      }
      lastCreatedRef = op.ref;
    } else if (op.type === 'add-statement') {
      const subject = op.target.qid || (op.target.ref === lastCreatedRef ? 'LAST' : null);
      const object = op.value.kind === 'item' && op.value.ref
        ? (op.value.ref === lastCreatedRef ? 'LAST' : null)
        : qsValue(op.value);
      if (!subject || object === null) {
        lines.push(`# MANUAL: after import, add ${op.property} -> ${op.value.qid || `(new "${op.value.ref}")`} on ${op.target.qid || `(new "${op.target.ref}")`}`);
        continue;
      }
      lines.push(`${subject}\t${op.property}\t${object}${tail(op)}`);
    } else if (op.type === 'end-statement') {
      lines.push(`# end statement ${op.statementId} with P582 +${op.endDate}T00:00:00Z/11 (apply in the QuickStatements UI)`);
    }
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Run test — expect PASS** (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/quickstatements.js dev/tests/core/quickstatements.test.js
git commit -m "feat(core): QuickStatements v1 serialiser with manual-link fallback"
```

---

## Task 7: `adapters/oauth-pkce.js`

**Files:**
- Create: `src/adapters/oauth-pkce.js`
- Test: `dev/tests/adapters/oauth-pkce.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { pkceChallenge, buildAuthorizeUrl, createAuth } from '../../../src/adapters/oauth-pkce.js';

const config = {
  oauth: {
    authorizeUrl: 'https://meta.example/authorize',
    tokenUrl: 'https://meta.example/token',
    clientId: 'abc123',
    redirectUri: 'https://app.example/callback.html',
    scopes: 'basic editpage',
  },
  tokenPersistence: 'persistent',
};

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('pkceChallenge returns a verifier and its S256 challenge', async () => {
  const { verifier, challenge, method } = await pkceChallenge(webcrypto);
  assert.equal(method, 'S256');
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.match(challenge, /^[A-Za-z0-9\-_]+$/); // base64url, no padding
});

test('buildAuthorizeUrl carries client_id, redirect_uri, PKCE, state', () => {
  const u = new URL(buildAuthorizeUrl(config, { challenge: 'CH', state: 'ST' }));
  assert.equal(u.origin + u.pathname, 'https://meta.example/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('client_id'), 'abc123');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://app.example/callback.html');
  assert.equal(u.searchParams.get('code_challenge'), 'CH');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('state'), 'ST');
});

test('createAuth.restore mints an access token from a stored refresh token', async () => {
  const storage = memStorage();
  storage.setItem('slw:oauth:refresh', 'REFRESH1');
  const fetch = async (url, init) => {
    assert.equal(url, 'https://meta.example/token');
    assert.match(init.body.toString(), /grant_type=refresh_token/);
    assert.match(init.body.toString(), /refresh_token=REFRESH1/);
    return { ok: true, json: async () => ({ access_token: 'ACCESS1', refresh_token: 'REFRESH2', expires_in: 3600 }) };
  };
  const auth = createAuth({ fetch, storage, location: { href: '' }, crypto: webcrypto, config, now: () => 0 });
  assert.equal(auth.hasSession(), true);
  assert.equal(await auth.restore(), true);
  assert.equal(await auth.getToken(), 'ACCESS1');
  assert.equal(storage.getItem('slw:oauth:refresh'), 'REFRESH2');
});

test('createAuth.getToken refreshes when the access token has expired', async () => {
  const storage = memStorage();
  storage.setItem('slw:oauth:refresh', 'R1');
  let calls = 0;
  const fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ access_token: `A${calls}`, refresh_token: `R${calls + 1}`, expires_in: 1 }) };
  };
  let t = 0;
  const auth = createAuth({ fetch, storage, location: { href: '' }, crypto: webcrypto, config, now: () => t });
  await auth.restore();
  assert.equal(await auth.getToken(), 'A1');
  t = 5000; // 5s later, token (1s ttl) is stale
  assert.equal(await auth.getToken(), 'A2');
  assert.equal(calls, 2);
});

test('createAuth.connect stores verifier+state and points location at the authorize URL', async () => {
  const storage = memStorage();
  const location = { href: 'https://app.example/?edit' };
  const auth = createAuth({ fetch: async () => ({}), storage, location, crypto: webcrypto, config, now: () => 0 });
  await auth.connect();
  assert.ok(storage.getItem('slw:oauth:verifier'));
  assert.ok(storage.getItem('slw:oauth:state'));
  assert.match(location.href, /^https:\/\/meta\.example\/authorize\?/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/adapters/oauth-pkce.js`**

```js
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** @param {Crypto} crypto @returns {Promise<{verifier:string, challenge:string, method:'S256'}>} */
export async function pkceChallenge(crypto) {
  const raw = crypto.getRandomValues(new Uint8Array(64));
  const verifier = b64url(raw).slice(0, 96);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest), method: 'S256' };
}

/** @param {any} config @param {{challenge:string, state:string}} p */
export function buildAuthorizeUrl(config, { challenge, state }) {
  const u = new URL(config.oauth.authorizeUrl);
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.oauth.clientId,
    redirect_uri: config.oauth.redirectUri,
    scope: config.oauth.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return u.toString();
}

const K = {
  refresh: 'slw:oauth:refresh',
  verifier: 'slw:oauth:verifier',
  state: 'slw:oauth:state',
};

/**
 * @param {{fetch: typeof fetch, storage: Storage, location: Location, crypto: Crypto, config: any, now?: () => number}} deps
 * @returns {import('../ports/index.js').AuthPort}
 */
export function createAuth({ fetch, storage, location, crypto, config, now = () => Date.now() }) {
  let accessToken = null;
  let expiresAt = 0;
  const persistent = config.tokenPersistence !== 'session';
  const store = persistent ? storage : sessionSafe(storage);

  async function tokenRequest(body) {
    const res = await fetch(config.oauth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (!res.ok) throw new Error(`token endpoint ${res.status}`);
    const j = await res.json();
    accessToken = j.access_token;
    expiresAt = now() + (j.expires_in ? j.expires_in * 1000 : 3600_000);
    if (j.refresh_token) store.setItem(K.refresh, j.refresh_token);
    return accessToken;
  }

  return {
    hasSession: () => !!store.getItem(K.refresh),

    async restore() {
      const rt = store.getItem(K.refresh);
      if (!rt) return false;
      try {
        await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt, client_id: config.oauth.clientId });
        return true;
      } catch {
        return false;
      }
    },

    async connect() {
      const { verifier, challenge } = await pkceChallenge(crypto);
      const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
      store.setItem(K.verifier, verifier);
      store.setItem(K.state, state);
      location.href = buildAuthorizeUrl(config, { challenge, state });
    },

    async getToken() {
      if (accessToken && now() < expiresAt - 30_000) return accessToken;
      const ok = await this.restore();
      if (!ok) throw new Error('not authenticated');
      return accessToken;
    },

    async disconnect() {
      accessToken = null;
      expiresAt = 0;
      store.removeItem(K.refresh);
      store.removeItem(K.verifier);
      store.removeItem(K.state);
    },
  };
}

/** Fallback wrapper so `"session"` persistence uses sessionStorage semantics via the same API. */
function sessionSafe(storage) {
  return storage; // in the browser, app.js passes window.sessionStorage here; tests pass a mem store
}
```

- [ ] **Step 4: Run test — expect PASS** (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/adapters/oauth-pkce.js dev/tests/adapters/oauth-pkce.test.js
git commit -m "feat(adapters): OAuth2 PKCE public-client auth with silent refresh"
```

---

## Task 8: `adapters/oauth-callback.js` + `callback.html`

**Files:**
- Create: `src/adapters/oauth-callback.js`
- Create: `callback.html`
- Test: `dev/tests/adapters/oauth-callback.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCallback } from '../../../src/adapters/oauth-callback.js';

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const config = { oauth: { tokenUrl: 'https://meta.example/token', clientId: 'abc', redirectUri: 'https://app.example/callback.html' } };

test('exchanges the code, stores the refresh token, returns the post-login target', async () => {
  const storage = memStorage({ 'slw:oauth:verifier': 'VER', 'slw:oauth:state': 'STATE' });
  const location = { search: '?code=CODE&state=STATE', origin: 'https://app.example' };
  const fetch = async (url, init) => {
    assert.equal(url, 'https://meta.example/token');
    assert.match(init.body.toString(), /grant_type=authorization_code/);
    assert.match(init.body.toString(), /code=CODE/);
    assert.match(init.body.toString(), /code_verifier=VER/);
    return { ok: true, json: async () => ({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }) };
  };
  const target = await handleCallback({ location, storage, fetch, config });
  assert.equal(storage.getItem('slw:oauth:refresh'), 'R');
  assert.equal(storage.getItem('slw:oauth:verifier'), null);
  assert.equal(target, 'https://app.example/#/');
});

test('rejects on a state mismatch', async () => {
  const storage = memStorage({ 'slw:oauth:verifier': 'VER', 'slw:oauth:state': 'STATE' });
  const location = { search: '?code=CODE&state=OTHER', origin: 'https://app.example' };
  await assert.rejects(() => handleCallback({ location, storage, fetch: async () => ({}), config }), /state mismatch/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/adapters/oauth-callback.js`**

```js
/**
 * Complete the OAuth redirect: exchange ?code for tokens, persist the refresh
 * token, and return the URL to send the browser back to.
 * @param {{location: Location, storage: Storage, fetch: typeof fetch, config: any}} deps
 * @returns {Promise<string>}
 */
export async function handleCallback({ location, storage, fetch, config }) {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const expectedState = storage.getItem('slw:oauth:state');
  const verifier = storage.getItem('slw:oauth:verifier');
  if (!code) throw new Error('missing authorization code');
  if (!state || state !== expectedState) throw new Error('state mismatch');
  if (!verifier) throw new Error('missing PKCE verifier');

  const res = await fetch(config.oauth.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.oauth.clientId,
      redirect_uri: config.oauth.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  const j = await res.json();
  if (j.refresh_token) storage.setItem('slw:oauth:refresh', j.refresh_token);
  storage.removeItem('slw:oauth:verifier');
  storage.removeItem('slw:oauth:state');
  return `${location.origin}/#/`;
}
```

- [ ] **Step 4: Create `callback.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing in…</title></head>
<body>
  <p id="msg">Completing sign-in…</p>
  <script type="module">
    import { handleCallback } from './src/adapters/oauth-callback.js';
    const config = await (await fetch('config.json')).json();
    try {
      const target = await handleCallback({ location, storage: localStorage, fetch, config });
      location.replace(target);
    } catch (e) {
      document.getElementById('msg').textContent = 'Sign-in failed: ' + e.message + '. You can close this tab.';
    }
  </script>
</body>
</html>
```

- [ ] **Step 5: Run test — expect PASS** (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/adapters/oauth-callback.js callback.html dev/tests/adapters/oauth-callback.test.js
git commit -m "feat(adapters): OAuth redirect callback handler and page"
```

---

## Task 9: `adapters/wikibase-api.js` — search + direct write

**Files:**
- Create: `src/adapters/wikibase-api.js`
- Test: `dev/tests/adapters/wikibase-api.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWikibaseApi } from '../../../src/adapters/wikibase-api.js';

const config = {
  wikidataActionApi: 'https://www.wikidata.org/w/api.php',
  wikibaseRestBase: 'https://www.wikidata.org/w/rest.php/wikibase/v1',
};

test('searchEntities calls wbsearchentities with origin=* and maps results', async () => {
  const fetch = async (url) => {
    assert.match(url, /action=wbsearchentities/);
    assert.match(url, /search=asian\+law/);
    assert.match(url, /origin=%2A|origin=\*/);
    return { ok: true, json: async () => ({ search: [
      { id: 'Q1', label: 'Asian Law and Society Association', description: 'regional body' },
    ] }) };
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const out = await api.searchEntities('asian law', 'item');
  assert.deepEqual(out, [{ qid: 'Q1', label: 'Asian Law and Society Association', description: 'regional body' }]);
});

test('lookupByExternalId queries haswbstatement and returns candidates', async () => {
  const fetch = async (url) => {
    assert.match(url, /haswbstatement%3AP496%3D0000-0002-1825-0097|haswbstatement:P496=0000-0002-1825-0097/);
    return { ok: true, json: async () => ({ query: { search: [{ title: 'Q42' }] } }) };
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const out = await api.lookupByExternalId('P496', '0000-0002-1825-0097');
  assert.deepEqual(out.map((c) => c.qid), ['Q42']);
});

test('applyChangeSet: create-item then add-statement, refs resolved, bearer + summary sent', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/entities/items')) {
      assert.equal(init.headers.Authorization, 'Bearer T');
      const body = JSON.parse(init.body);
      assert.equal(body.item.labels.en, 'Jane Roe');
      assert.match(body.comment, /new president/);
      return { ok: true, json: async () => ({ id: 'Q999' }) };
    }
    // PATCH statements on Q100
    assert.match(url, /\/entities\/items\/Q100\/statements$/);
    const body = JSON.parse(init.body);
    assert.equal(body.statement.property.id, 'P488');
    assert.equal(body.statement.value.content, 'Q999'); // ref 'person' resolved
    return { ok: true, json: async () => ({ id: 'Q100$NEW' }) };
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const cs = { summary: 'socio-legal directory: record new president', ops: [
    { type: 'create-item', ref: 'person', labels: { en: 'Jane Roe' }, descriptions: {}, claims: [
      { property: 'P31', value: { kind: 'item', qid: 'Q5' } },
    ] },
    { type: 'add-statement', target: { qid: 'Q100' }, property: 'P488', value: { kind: 'item', ref: 'person' },
      qualifiers: [{ property: 'P580', value: { kind: 'time', value: '2026-01-01', precision: 11 } }] },
  ]};
  const res = await api.applyChangeSet(cs, 'T');
  assert.equal(res.via, 'direct');
  assert.deepEqual(res.created, [{ ref: 'person', qid: 'Q999' }]);
  assert.ok(res.diffUrls.some((u) => u.includes('Q999')));
  assert.equal(calls.length, 2);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/adapters/wikibase-api.js`**

```js
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
      const url = `${action}?action=wbsearchentities&format=json&origin=*&type=${type}&language=en&uselang=en&limit=10&search=${encodeURIComponent(text)}`;
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
```

- [ ] **Step 4: Run test — expect PASS** (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/adapters/wikibase-api.js dev/tests/adapters/wikibase-api.test.js
git commit -m "feat(adapters): Wikibase search + direct REST write path"
```

---

## Task 10: `adapters/quickstatements-handoff.js`

**Files:**
- Create: `src/adapters/quickstatements-handoff.js`
- Test: `dev/tests/adapters/quickstatements-handoff.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuickStatementsWriter, encodePayload } from '../../../src/adapters/quickstatements-handoff.js';

const config = { quickstatementsUrl: 'https://quickstatements.toolforge.org/#/v1=' };

test('encodePayload URL-encodes with TAB as %09 and newline as %7C', () => {
  assert.equal(encodePayload('Q1\tP31\tQ5\nQ1\tP17\tQ183'), 'Q1%09P31%09Q5%7CQ1%09P17%09Q183');
});

test('applyChangeSet opens the QS URL and returns a quickstatements result', async () => {
  let opened = null;
  const win = { open: (u) => { opened = u; return {}; } };
  const writer = createQuickStatementsWriter({ window: win, config });
  const cs = { summary: 's', ops: [
    { type: 'add-statement', target: { qid: 'Q1' }, property: 'P17', value: { kind: 'item', qid: 'Q183' } },
  ]};
  const res = await writer.applyChangeSet(cs);
  assert.equal(res.via, 'quickstatements');
  assert.equal(opened, res.handoffUrl);
  assert.ok(res.handoffUrl.startsWith('https://quickstatements.toolforge.org/#/v1='));
  assert.ok(res.handoffUrl.includes('Q1%09P17%09Q183'));
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/adapters/quickstatements-handoff.js`**

```js
import { serialize } from '../core/quickstatements.js';

/** QS "#/v1=" expects TAB -> %09 and line break -> %7C (pipe). */
export function encodePayload(text) {
  return text
    .replace(/\n+$/,'')
    .split('\n')
    .map((line) => line.split('\t').map(encodeURIComponent).join('%09'))
    .join('%7C');
}

/**
 * @param {{window: Window, config: any}} deps
 * @returns {import('../ports/index.js').WritePort}
 */
export function createQuickStatementsWriter({ window, config }) {
  return {
    async applyChangeSet(cs) {
      const qsText = serialize(cs);
      const handoffUrl = config.quickstatementsUrl + encodePayload(qsText);
      window.open(handoffUrl, '_blank', 'noopener');
      return { via: 'quickstatements', created: [], diffUrls: [], handoffUrl };
    },
  };
}
```

- [ ] **Step 4: Run test — expect PASS** (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/quickstatements-handoff.js dev/tests/adapters/quickstatements-handoff.test.js
git commit -m "feat(adapters): QuickStatements hand-off write path"
```

---

## Task 11: `ui/mode.js` — read vs edit gate

**Files:**
- Create: `src/ui/mode.js`
- Test: `dev/tests/ui/mode.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMode } from '../../../src/ui/mode.js';

const authWithSession = { hasSession: () => true, restore: async () => true };
const authNoSession = { hasSession: () => false, restore: async () => false };

test('trigger "param": edit only when the edit param is present', async () => {
  const cfg = { editTrigger: 'param', editParam: 'edit' };
  assert.equal(await detectMode({ location: { search: '?edit' }, auth: authNoSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '' }, auth: authWithSession, config: cfg }), 'read');
});

test('trigger "session": edit only when a stored session restores', async () => {
  const cfg = { editTrigger: 'session', editParam: 'edit' };
  assert.equal(await detectMode({ location: { search: '' }, auth: authWithSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '?edit' }, auth: authNoSession, config: cfg }), 'read');
});

test('trigger "either": session wins, otherwise param', async () => {
  const cfg = { editTrigger: 'either', editParam: 'edit' };
  assert.equal(await detectMode({ location: { search: '' }, auth: authWithSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '?edit' }, auth: authNoSession, config: cfg }), 'edit');
  assert.equal(await detectMode({ location: { search: '' }, auth: authNoSession, config: cfg }), 'read');
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/ui/mode.js`**

```js
/**
 * @param {{location: {search: string}, auth: import('../ports/index.js').AuthPort, config: any}} deps
 * @returns {Promise<'read'|'edit'>}
 */
export async function detectMode({ location, auth, config }) {
  const hasParam = new URLSearchParams(location.search).has(config.editParam || 'edit');
  const trigger = config.editTrigger || 'either';

  if ((trigger === 'session' || trigger === 'either') && auth.hasSession()) {
    if (await auth.restore()) return 'edit';
  }
  if ((trigger === 'param' || trigger === 'either') && hasParam) {
    return 'edit';
  }
  return 'read';
}
```

- [ ] **Step 4: Run test — expect PASS** (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/mode.js dev/tests/ui/mode.test.js
git commit -m "feat(ui): read/edit mode detection gate"
```

---

## Task 12: `ui/components/entity-typeahead.js`

**Files:**
- Create: `src/ui/components/entity-typeahead.js`
- Test: `dev/tests/ui/entity-typeahead.test.js`

- [ ] **Step 1: Write the failing test (jsdom)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createTypeahead } from '../../../src/ui/components/entity-typeahead.js';

function host() {
  const dom = new JSDOM('<!doctype html><div id="h"></div>');
  return dom.window.document.getElementById('h');
}
const search = async (text) => text.toLowerCase().includes('asian')
  ? [{ qid: 'Q2', label: 'Asian Law and Society Association', description: 'regional body' }]
  : [];

test('shows candidates after typing and picks one', async () => {
  const el = host();
  let picked = null;
  const ta = createTypeahead(el, { label: 'Association', searchEntities: search, onPick: (v) => { picked = v; }, allowCreate: true });
  await ta._typeForTest('asian law');
  assert.match(el.innerHTML, /Asian Law and Society Association/);
  el.querySelector('[data-pick="Q2"]').click();
  assert.deepEqual(picked, { qid: 'Q2', label: 'Asian Law and Society Association', description: 'regional body' });
});

test('the create form is hidden until "None of these" is clicked', async () => {
  const el = host();
  let createdName = null;
  const ta = createTypeahead(el, { label: 'Association', searchEntities: search, onPick: () => {}, onCreate: (name) => { createdName = name; }, allowCreate: true });
  await ta._typeForTest('brand new body');
  assert.doesNotMatch(el.innerHTML, /data-role="create-form"/);
  el.querySelector('[data-role="none-of-these"]').click();
  assert.match(el.innerHTML, /data-role="create-form"/);
  el.querySelector('[data-role="create-name"]').value = 'Brand New Body';
  el.querySelector('[data-role="create-confirm"]').click();
  assert.equal(createdName, 'Brand New Body');
});

test('allowCreate=false never shows the create affordance (e.g. universities)', async () => {
  const el = host();
  const ta = createTypeahead(el, { label: 'University', searchEntities: search, onPick: () => {}, allowCreate: false });
  await ta._typeForTest('unknown place');
  assert.doesNotMatch(el.innerHTML, /none-of-these/);
  assert.match(el.innerHTML, /not on Wikidata/);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/ui/components/entity-typeahead.js`**

```js
import { html, mount } from '../../render.js';
import { rankCandidates } from '../../core/dedupe.js';

/**
 * Search-first entity picker. Renders into `el`.
 * @param {HTMLElement} el
 * @param {{
 *   label: string,
 *   searchEntities: (text: string, type?: string) => Promise<import('../../ports/index.js').EntityCandidate[]>,
 *   onPick: (candidate: import('../../ports/index.js').EntityCandidate) => void,
 *   onCreate?: (name: string) => void,
 *   allowCreate?: boolean,
 * }} opts
 */
export function createTypeahead(el, opts) {
  const state = { query: '', candidates: [], showCreate: false, chosen: null };

  function render() {
    const ranked = rankCandidates(state.query, state.candidates).slice(0, 8);
    mount(el, html`
      <div class="typeahead" data-label="${opts.label}">
        <label>${opts.label}
          <input type="text" data-role="query" value="${state.query}" autocomplete="off">
        </label>
        ${state.chosen
          ? html`<p class="typeahead__chosen">Selected: ${state.chosen.label}
              <button type="button" data-role="clear">change</button></p>`
          : html`
            <ul class="typeahead__list">
              ${ranked.map((c) => html`<li>
                <button type="button" data-pick="${c.qid}">
                  <strong>${c.label}</strong> <span>${c.description}</span>
                </button></li>`)}
            </ul>
            ${state.query && ranked.length === 0 && !opts.allowCreate
              ? html`<p class="typeahead__none">Not on Wikidata — it must be added there first.</p>` : ''}
            ${state.query && opts.allowCreate && !state.showCreate
              ? html`<button type="button" data-role="none-of-these">None of these — create new</button>` : ''}
            ${state.showCreate
              ? html`<div data-role="create-form" class="typeahead__create">
                  <input type="text" data-role="create-name" value="${state.query}">
                  <button type="button" data-role="create-confirm">Create “${state.query}”</button>
                </div>` : ''}`}
      </div>`);
  }

  async function doSearch(text) {
    state.query = text;
    state.showCreate = false;
    state.candidates = text.trim().length >= 2 ? await opts.searchEntities(text, 'item') : [];
    render();
  }

  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-role="query"]')) doSearch(e.target.value);
  });
  el.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      state.chosen = state.candidates.find((c) => c.qid === pick.dataset.pick) || null;
      render();
      if (state.chosen) opts.onPick(state.chosen);
      return;
    }
    if (e.target.closest('[data-role="clear"]')) { state.chosen = null; render(); return; }
    if (e.target.closest('[data-role="none-of-these"]')) { state.showCreate = true; render(); return; }
    if (e.target.closest('[data-role="create-confirm"]')) {
      const name = el.querySelector('[data-role="create-name"]').value.trim();
      if (name && opts.onCreate) opts.onCreate(name);
    }
  });

  render();
  return {
    getState: () => ({ ...state }),
    /** test helper: simulate typing */
    async _typeForTest(text) { await doSearch(text); },
  };
}
```

- [ ] **Step 4: Run test — expect PASS** (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/entity-typeahead.js dev/tests/ui/entity-typeahead.test.js
git commit -m "feat(ui): search-first entity typeahead with gated create"
```

---

## Task 13: `ui/edit-wizard/steps.js` — step specs and validators

**Files:**
- Create: `src/ui/edit-wizard/steps.js`
- Test: `dev/tests/ui/wizard-steps.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../../../src/core/draft.js';
import { STEP_ORDER, validateStep } from '../../../src/ui/edit-wizard/steps.js';

test('STEP_ORDER for create-association has the six steps', () => {
  assert.deepEqual(STEP_ORDER['create-association'],
    ['identify', 'details', 'seat', 'people', 'journal', 'review']);
});

test('STEP_ORDER for update-field is a short path', () => {
  assert.deepEqual(STEP_ORDER['update-field'], ['identify', 'details', 'review']);
});

test('identify step requires an association identity', () => {
  const d = emptyDraft('create-association');
  assert.ok(validateStep('identify', d).includes('choose or name the association'));
  d.association.label = 'X';
  assert.equal(validateStep('identify', d).length, 0);
});

test('details step enforces reference and the personal-e-mail confirmation', () => {
  const d = emptyDraft('create-association');
  d.association.label = 'X';
  d.association.classQid = 'Q955824';
  d.association.fieldQid = 'Q2734663';
  assert.ok(validateStep('details', d).includes('a reference URL is required'));
  d.association.referenceUrl = 'https://x';
  d.association.email = 'jane.doe@uni.edu';
  assert.ok(validateStep('details', d).some((m) => /shared role address/.test(m)));
  d.association.emailConfirmedShared = true;
  assert.equal(validateStep('details', d).length, 0);
});

test('people step requires a president and, for a new person, a university + reference', () => {
  const d = emptyDraft('create-association');
  assert.ok(validateStep('people', d).includes('choose or name the president'));
  d.president.label = 'Jane';
  assert.ok(validateStep('people', d).includes('pick the president’s university'));
  d.president.universityQid = 'Q1';
  assert.ok(validateStep('people', d).includes('a reference URL for the new person is required'));
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/ui/edit-wizard/steps.js`**

```js
import { looksPersonal } from '../../core/email-guard.js';

/** @type {Object<import('../../core/draft.js').DirectoryDraft['mode'], string[]>} */
export const STEP_ORDER = {
  'create-association': ['identify', 'details', 'seat', 'people', 'journal', 'review'],
  'change-president': ['identify', 'people', 'review'],
  'update-field': ['identify', 'details', 'review'],
};

/**
 * @param {string} step
 * @param {import('../../core/draft.js').DirectoryDraft} d
 * @returns {string[]} error messages ([] means the step is valid)
 */
export function validateStep(step, d) {
  const a = d.association;
  const p = d.president;
  const e = [];

  if (step === 'identify') {
    if (!a.qid && !a.label) e.push('choose or name the association');
  }

  if (step === 'details') {
    if (d.mode === 'create-association') {
      if (!a.classQid) e.push('pick the association type');
      if (!a.fieldQid) e.push('the field of work is required');
    }
    if (d.mode !== 'change-president' && !a.referenceUrl) e.push('a reference URL is required');
    if (a.email && looksPersonal(a.email) && !a.emailConfirmedShared) {
      e.push('this e-mail looks personal — confirm it is a shared role address, or replace it');
    }
    if (d.mode === 'update-field' && !a.email && !a.website) e.push('change at least one field');
  }

  if (step === 'seat') {
    if (!a.seatQid && !a.countryQid) e.push('set a fixed seat or a country');
  }

  if (step === 'people') {
    if (!p.qid && !p.label) e.push('choose or name the president');
    if (!p.qid) {
      if (!p.universityQid) e.push('pick the president’s university');
      if (!p.referenceUrl) e.push('a reference URL for the new person is required');
    }
    if (d.mode === 'change-president' && !d.termStart) e.push('set the term start date');
  }

  if (step === 'journal') {
    if (d.journal && !d.journal.qid && !d.journal.label) e.push('name the journal or remove it');
    if (d.journal && !d.journal.qid && !d.journal.referenceUrl) e.push('a reference URL for the new journal is required');
  }

  return e;
}
```

- [ ] **Step 4: Run test — expect PASS** (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/edit-wizard/steps.js dev/tests/ui/wizard-steps.test.js
git commit -m "feat(ui): wizard step order and per-step validation"
```

---

## Task 14: `ui/edit-wizard/wizard.js` — orchestrator

**Files:**
- Create: `src/ui/edit-wizard/wizard.js`
- Test: `dev/tests/ui/wizard.test.js`

- [ ] **Step 1: Write the failing test (jsdom)**

```js
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
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Write `src/ui/edit-wizard/wizard.js`**

```js
import { html, mount } from '../../render.js';
import { emptyDraft } from '../../core/draft.js';
import { buildChangeSet } from '../../core/changeset.js';
import { STEP_ORDER, validateStep } from './steps.js';

const DRAFT_KEY = 'slw:wizard:draft';

/**
 * @param {HTMLElement} host
 * @param {{
 *   window: Window,
 *   config: any,
 *   ports: { search: import('../../ports/index.js').SearchPort, write: import('../../ports/index.js').WritePort },
 *   seed: { mode: import('../../core/draft.js').DirectoryDraft['mode'], association?: any },
 *   onClose?: () => void,
 * }} opts
 */
export function createWizard(host, opts) {
  const { window: win, config, ports } = opts;
  const steps = STEP_ORDER[opts.seed.mode];
  let index = 0;

  let draft = restore() || seedDraft();
  function seedDraft() {
    const d = emptyDraft(opts.seed.mode);
    d.association.classQid ||= config.inScopeClassQid || null;
    d.association.fieldQid ||= config.inScopeFieldQid || null;
    if (opts.seed.association) Object.assign(d.association, opts.seed.association);
    return d;
  }
  function restore() {
    try {
      const raw = win.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved.mode !== opts.seed.mode) return null;
      if (opts.seed.association?.qid && saved.association?.qid !== opts.seed.association.qid) return null;
      return saved;
    } catch { return null; }
  }
  function persist() {
    try { win.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }
  function clearPersisted() {
    try { win.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  function currentStep() { return steps[index]; }

  function render(extra = '') {
    const errs = validateStep(currentStep(), draft);
    mount(host, html`
      <section class="wizard" aria-label="Edit ${opts.seed.mode}">
        <header class="wizard__head">
          <strong>${title(opts.seed.mode)}</strong>
          <button type="button" data-role="close" aria-label="Close">×</button>
        </header>
        <ol class="wizard__steps">
          ${steps.map((s, i) => html`<li aria-current="${i === index}">${i + 1} ${s}</li>`)}
        </ol>
        <div class="wizard__body" data-step="${currentStep()}">
          <p class="wizard__hint">Fill the fields for “${currentStep()}”. (Field widgets are wired in app.js / manual QA.)</p>
          ${errs.length ? html`<ul class="wizard__errors">${errs.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
        </div>
        <footer class="wizard__foot">
          ${index > 0 ? html`<button type="button" data-role="back">Back</button>` : ''}
          ${index < steps.length - 1
            ? html`<button type="button" data-role="next" ${errs.length ? 'disabled' : ''}>Next</button>`
            : html`<button type="button" data-role="submit" ${errs.length ? 'disabled' : ''}>Confirm</button>`}
        </footer>
        ${extra}
      </section>`);
  }

  host.addEventListener('click', async (e) => {
    if (e.target.closest('[data-role="back"]')) { index = Math.max(0, index - 1); render(); }
    else if (e.target.closest('[data-role="next"]')) {
      if (validateStep(currentStep(), draft).length === 0) { index = Math.min(steps.length - 1, index + 1); render(); }
    }
    else if (e.target.closest('[data-role="submit"]')) {
      try { await submitInternal(); } catch (err) { render(html`<p class="wizard__fail">${err.message}</p>
        <button type="button" data-role="retry">Retry</button>`); }
    }
    else if (e.target.closest('[data-role="close"]')) { opts.onClose?.(); }
  });

  async function submitInternal() {
    for (const s of steps.slice(0, -1)) {
      const errs = validateStep(s, draft);
      if (errs.length) throw new Error(errs[0]);
    }
    const changeSet = buildChangeSet(draft, config);
    const result = await ports.write.applyChangeSet(changeSet, null);
    clearPersisted();
    render(html`
      <div class="wizard__done">
        <h3>Success</h3>
        <ul>${(result.diffUrls || []).map((u) => html`<li><a href="${u}" target="_blank" rel="noopener">${u}</a></li>`)}</ul>
        ${result.handoffUrl ? html`<p><a href="${result.handoffUrl}" target="_blank" rel="noopener">Finish in QuickStatements</a></p>` : ''}
        <button type="button" data-role="close">Done</button>
      </div>`);
    return result;
  }

  render();

  return {
    getDraft: () => draft,
    _setDraft(mutator) { mutator(draft); persist(); render(); },
    async submit() { return submitInternal(); },
    destroy() { host.innerHTML = ''; },
  };
}

function title(mode) {
  return { 'create-association': 'Add association', 'change-president': 'Record new president', 'update-field': 'Update details' }[mode];
}
```

- [ ] **Step 4: Run test — expect PASS** (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ui/edit-wizard/wizard.js dev/tests/ui/wizard.test.js
git commit -m "feat(ui): edit wizard orchestrator with draft persistence and submit"
```

---

## Task 15: `ui/edit-panel.js` + wire edit mode into `src/app.js`

**Files:**
- Create: `src/ui/edit-panel.js`
- Modify: `src/app.js`
- Test: `dev/tests/app-edit.test.js`

- [ ] **Step 1: Write the failing integration test (jsdom + fakes)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { emptyAssociation } from '../../src/core/model.js';
import { createApp } from '../../src/app.js';

function win(url) {
  return new JSDOM(`<!doctype html><div id="app">
    <div id="map"></div><aside id="panel-host"></aside>
    <label class="map-toggle"><input type="checkbox" data-role="leadership-toggle"></label>
  </div>`, { url }).window;
}
const associations = [{ ...emptyAssociation('Q1'), label: 'Body', countryCode: 'DE', countryLabel: 'Germany',
  president: { qid: 'Q9', label: 'Old Pres', url: null } }];

test('in read mode there is no Edit button and no "Edit mode" badge', async () => {
  const w = win('https://app.example/');
  await createApp({
    window: w,
    config: { cacheTtlMs: 1, tileUrl: 't', tileAttribution: 'a', editTrigger: 'either', editParam: 'edit' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'read',
    buildEditRuntime: () => { throw new Error('must not build edit runtime in read mode'); },
  });
  const host = w.document.getElementById('panel-host');
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  assert.doesNotMatch(host.innerHTML, /data-action="edit"/);
  assert.doesNotMatch(w.document.body.innerHTML, /Edit mode/);
});

test('in edit mode the badge and Edit button show; clicking Edit mounts the wizard', async () => {
  const w = win('https://app.example/?edit');
  let wizardMounted = false;
  await createApp({
    window: w,
    config: { cacheTtlMs: 1, tileUrl: 't', tileAttribution: 'a', editTrigger: 'either', editParam: 'edit' },
    centroids: { DE: [10.4, 51.1] },
    loadDirectory: async () => ({ associations, stale: false, asOf: null }),
    createMapView: () => ({ render() {}, focus() {} }),
    detectMode: async () => 'edit',
    buildEditRuntime: async () => ({
      auth: { disconnect: async () => {} },
      openWizard: (host, seed) => { wizardMounted = true; host.innerHTML = '<section class="wizard"></section>'; },
    }),
  });
  assert.match(w.document.body.innerHTML, /Edit mode/);
  const host = w.document.getElementById('panel-host');
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  assert.match(host.innerHTML, /data-action="edit"/);
  host.querySelector('[data-action="edit"]').click();
  assert.equal(wizardMounted, true);
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create `src/ui/edit-panel.js`**

```js
import { html, mount } from '../render.js';

/**
 * Renders the edit-mode chrome into a dedicated overlay element.
 * @param {HTMLElement} el
 * @param {{ connected: boolean, onConnect: () => void, onLeave: () => void, onAdd: () => void }} opts
 */
export function renderEditChrome(el, opts) {
  mount(el, html`
    <div class="editbar">
      <span class="editbar__badge">Edit mode</span>
      ${opts.connected
        ? html`<button type="button" data-role="add">Add association</button>
               <button type="button" data-role="leave">Leave edit mode</button>`
        : html`<button type="button" data-role="connect">Connect a Wikimedia account</button>`}
    </div>`);
  el.onclick = (e) => {
    if (e.target.closest('[data-role="connect"]')) opts.onConnect();
    else if (e.target.closest('[data-role="leave"]')) opts.onLeave();
    else if (e.target.closest('[data-role="add"]')) opts.onAdd();
  };
}
```

- [ ] **Step 4: Modify `src/app.js`** — add the edit branch. Apply these three changes:

**4a. Extend the `createApp` signature and imports.** At the top of `src/app.js`, after the existing imports add:
```js
import { renderEditChrome } from './ui/edit-panel.js';
```
Change the `createApp` JSDoc/params to accept two more injectables:
```js
/**
 * @param {{
 *   window: Window, config: any, centroids: Object<string, [number,number]>,
 *   loadDirectory: Function, createMapView: Function,
 *   detectMode: () => Promise<'read'|'edit'> | 'read'|'edit',
 *   buildEditRuntime?: () => Promise<{ auth: {disconnect: () => Promise<void>}, openWizard: (host: HTMLElement, seed: any) => void }>,
 * }} deps
 */
```

**4b. Resolve the mode and (only in edit mode) the edit runtime.** Replace the line
```js
    mode: detectMode(),
```
with a two-phase init: near the top of `createApp` body, before `const store = ...`, insert:
```js
  const mode = await (typeof detectMode === 'function' ? detectMode() : detectMode);
  let editRuntime = null;
  if (mode === 'edit' && deps.buildEditRuntime) {
    editRuntime = await deps.buildEditRuntime();
  }
```
and set `mode` in the initial store state:
```js
  const store = createStore({
    mode,
    // ...unchanged...
  });
```

**4c. Render the edit chrome and wire the Edit button.** After the `store.subscribe(...)` block, add:
```js
  if (mode === 'edit') {
    const bar = doc.createElement('div');
    bar.id = 'edit-chrome';
    doc.getElementById('app').appendChild(bar);
    const drawer = doc.createElement('div');
    drawer.id = 'wizard-host';
    doc.getElementById('app').appendChild(drawer);

    const paint = () => renderEditChrome(bar, {
      connected: true,
      onConnect: () => {},
      onLeave: async () => { await editRuntime.auth.disconnect(); win.location.search = ''; },
      onAdd: () => editRuntime.openWizard(drawer, { mode: 'create-association' }),
    });
    paint();

    panelHost.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="edit"]');
      if (!btn) return;
      const a = store.getState().associations.find((x) => x.qid === btn.dataset.qid);
      editRuntime.openWizard(drawer, {
        mode: 'change-president',
        association: { qid: a.qid, label: a.label },
      });
    });
  }
```

**4d. Update the browser entry point** at the bottom of `src/app.js` to build the real edit runtime lazily:
```js
if (typeof window !== 'undefined' && window.document?.getElementById('app')) {
  const config = await (await fetch('config.json')).json();
  const centroids = await (await fetch(config.centroidsUrl)).json();
  const { detectMode } = await import('./ui/mode.js');
  const { createAuth } = await import('./adapters/oauth-pkce.js');
  const auth = createAuth({
    fetch: window.fetch.bind(window),
    storage: config.tokenPersistence === 'session' ? window.sessionStorage : window.localStorage,
    location: window.location, crypto: window.crypto, config,
  });
  await createApp({
    window, config, centroids,
    loadDirectory: (extra) => import('./adapters/browser-cache.js').then((m) => m.loadDirectory(extra)),
    createMapView: (el, o) => import('./ui/map-view.js').then((m) => m.createMapView(el, o)),
    detectMode: () => detectMode({ location: window.location, auth, config }),
    buildEditRuntime: async () => {
      const [{ createWikibaseApi }, { createQuickStatementsWriter }, { createWizard }] = await Promise.all([
        import('./adapters/wikibase-api.js'),
        import('./adapters/quickstatements-handoff.js'),
        import('./ui/edit-wizard/wizard.js'),
      ]);
      const api = createWikibaseApi({ fetch: window.fetch.bind(window), config, getToken: () => auth.getToken() });
      const write = config.writeMode === 'quickstatements'
        ? createQuickStatementsWriter({ window, config })
        : api;
      return {
        auth,
        openWizard: (host, seed) => createWizard(host, { window, config, ports: { search: api, write }, seed, onClose: () => { host.innerHTML = ''; } }),
      };
    },
  });
}
```

> Note: `createMapView` is now async in the entry point. Update `createApp` so the map view is awaited:
> replace `const mapView = createMapView(mapHost, {...});` with `const mapView = await createMapView(mapHost, {...});`
> and keep the test fakes returning a plain object (an awaited non-promise is fine).

- [ ] **Step 5: Run the edit integration test — expect PASS** (2 tests)

Run: `cd dev && node --test tests/app-edit.test.js`

- [ ] **Step 6: Re-run the Plan 1 app test to confirm no regression**

Run: `cd dev && node --test tests/app.test.js`
Expected: PASS (the read-mode fakes still satisfy the new async `createMapView`/`detectMode`).

- [ ] **Step 7: Commit**

```bash
git add src/ui/edit-panel.js src/app.js dev/tests/app-edit.test.js
git commit -m "feat: wire opt-in edit mode, dynamic wizard import, Edit/Add controls"
```

---

## Task 16: Full suite, styles, manual QA, README

**Files:**
- Modify: `styles/app.css`, `README.md`

- [ ] **Step 1: Add edit-mode styles to `styles/app.css`**

```css
#edit-chrome { position: absolute; z-index: 2; top: var(--space-2); right: var(--space-2); }
.editbar { display: flex; gap: var(--space-2); align-items: center; background: var(--bg);
  border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-2); }
.editbar__badge { background: var(--banner-bg); color: var(--banner-text);
  padding: 2px var(--space-2); border-radius: 999px; font-size: 0.8rem; }
#wizard-host:empty { display: none; }
#wizard-host { position: absolute; z-index: 3; top: 0; right: 0; bottom: 0; width: min(420px, 96vw);
  background: var(--bg); border-left: 1px solid var(--border); overflow-y: auto; padding: var(--space-3); }
.wizard__steps { list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0; font-size: 0.8rem; color: var(--text-muted); }
.wizard__steps li[aria-current="true"] { color: var(--accent); font-weight: 600; }
.wizard__errors { color: #b45309; font-size: 0.85rem; }
.typeahead__list { list-style: none; padding: 0; }
```

- [ ] **Step 2: Run the entire suite**

Run: `cd dev && npm test`
Expected: every test passes, exit 0.

- [ ] **Step 3: Manual QA (serve locally; requires a real registered `clientId` + `redirectUri` = `http://localhost:8000/callback.html` on a dev OAuth consumer)**

- [ ] `http://localhost:8000/` with no `?edit` and no stored token → read-only, no badge, no Edit button.
- [ ] `http://localhost:8000/?edit` → "Edit mode" badge; "Connect a Wikimedia account" shows.
- [ ] Connect → redirect to Wikimedia → back to `/#/`; badge now shows "Add association" + "Leave edit mode".
- [ ] Reload `http://localhost:8000/` (no `?edit`) → still edit mode (silent restore via stored refresh token).
- [ ] Open a card → "Edit" button present → click → wizard drawer opens with the six/short step header.
- [ ] "Leave edit mode" → token forgotten; page returns to read-only.
- [ ] Set `config.json` `writeMode` to `"quickstatements"`, redo a wizard submit → a QuickStatements tab opens with the batch; the success panel links to it.

- [ ] **Step 4: Append an edit-mode section to `README.md`**

```markdown
## Edit mode

The site is read-only by default. Editing is enabled either:

- **silently** — a returning editor whose OAuth refresh token is still in this
  browser (config `editTrigger: session` or `either`); or
- **via `?edit`** — append `?edit` to the URL, then connect a Wikimedia account
  once (config `editTrigger: param` or `either`).

Config keys: `oauth.clientId`, `oauth.redirectUri` (must equal the deployed
`…/callback.html`), `editTrigger`, `tokenPersistence` (`persistent` |
`session`), `writeMode` (`direct` | `quickstatements`).

Register the OAuth consumer per `docs/plans/2026-09-02-operations-and-data-runbook.md`.
```

- [ ] **Step 5: Commit and tag**

```bash
git add styles/app.css README.md
git commit -m "docs+style: edit-mode QA notes and wizard/edit-bar styling"
git tag edit-mode-v1
```

---

## Self-Review notes (already reconciled in this plan)

- **Spec coverage.** UI spec §1.6 two triggers + silent restore → Tasks 7, 11, 15. §1.7 six-step wizard, search-first, validation, success/failure, draft recovery → Tasks 12, 13, 14. §2.3 mode gate + token persistence + "rejected: cookie detection" → Task 11 (`detectMode`), Task 7 (`tokenPersistence`); the rejected approach is not implemented (correct). Data spec §2.5 edit operations table → Task 5 (`buildChangeSet` covers link / create person / create association / set seat / link parent / change president / link journal / update field). §2.5 REST vs Action + bearer + summary → Task 9. §2.5 QuickStatements fallback → Tasks 6, 10, 15 (`writeMode`). §1.6 personal-e-mail guard → Tasks 2, 4, 13. §2.6 dedup search-first + ORCID lookup → Tasks 3, 9 (`lookupByExternalId`), 12.
- **Type consistency.** `DirectoryDraft` defined in Task 4, consumed unchanged in Tasks 5, 13, 14. `ChangeSet`/`Op`/`Value` defined in Task 5, consumed in Tasks 6, 9, 14. `AuthPort` (Task 1) implemented in Task 7, consumed in Tasks 11, 15. `SearchPort`/`WritePort` (Task 1) implemented in Tasks 9/10, consumed in Tasks 12, 14, 15. `WriteResult.diffUrls`/`.handoffUrl`/`.created` consistent across Tasks 9, 10, 14. Method name `applyChangeSet` used identically everywhere.
- **Cross-plan seam.** `createApp` gained `detectMode` (async) and `buildEditRuntime` injectables; the Plan 1 read-mode test still passes because it injects `detectMode: () => 'read'` and never provides `buildEditRuntime`. `renderAssociationCard`/`renderPanel` already took an `editMode` flag in Plan 1.
- **Known limitation, documented in code + tests:** QuickStatements v1 cannot forward-reference two brand-new items; `serialize` emits `# MANUAL:` lines for that case (Task 6). The direct path has no such limitation.
- **Operations runbook owns:** OAuth consumer registration (prod + `localhost` dev consumer), the CORS spike that picks `writeMode`, WikiProject QID confirmation, and the initial QuickStatements import.
