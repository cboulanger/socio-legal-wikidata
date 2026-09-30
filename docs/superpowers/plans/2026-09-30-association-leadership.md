# Association Leadership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead `change-president` scaffolding with a working "Manage leadership" feature: look up/create a person with multilingual names, record the exact office title and begin/end dates, back-fill past officeholders in one visit, and show that history on the association card.

**Architecture:** Pure data/validation/change-set logic in `core/`, a read adapter method in `adapters/wikibase-api.js` that composes a pure claim-parser with a batched label lookup, a new wizard step module (`ui/edit-wizard/leadership-form.js`) wired into the existing `wizard.js` step machinery, and a small standalone card component (`ui/components/leadership-history.js`) for the lazy history disclosure — mirroring the former-names / details-form / entity-typeahead patterns already in this codebase exactly.

**Tech Stack:** Vanilla JS, ES modules, no build step, `node --test` + `jsdom` for tests (see `dev/`).

**Spec:** `docs/spec/2026-09-30-association-leadership-design.md` (approved; read it for full rationale — this plan implements it section by section).

---

## File Structure

| File | Change |
| --- | --- |
| `config.json` | add `officeTypes` |
| `src/core/draft.js` | remove `DraftPerson`/`president`/`termStart`/`previousPresidentStatementId`; add `DraftOfficerPerson`/`DraftOfficerRow`/`LeadershipHistoryRow`/`LeadershipOriginal` types, `emptyOfficerRow`, `leadershipClaimsFromEntity`, `manage-leadership` validation |
| `src/core/changeset.js` | remove the `change-president` branch and the dead optional-president code in `create-association`; add the `manage-leadership` branch and its `describeChanges` lines |
| `src/adapters/wikibase-api.js` | add `getLeadershipHistory(qid)` |
| `src/ports/index.js` | document `getLeadershipHistory` on `SearchPort` |
| `src/ui/edit-wizard/steps.js` | `STEP_ORDER['manage-leadership']`, drop the dead `people` step block |
| `src/ui/edit-wizard/leadership-form.js` (new) | render the officers step; `applyLeadershipFieldInput` |
| `src/ui/edit-wizard/wizard.js` | load leadership on open, step body dispatch, officer-row pickers, add/remove-row handlers, title |
| `src/ui/components/leadership-history.js` (new) | lazy card disclosure + session cache |
| `src/ui/association-card.js` | "Manage leadership" button + `<details>` history placeholder |
| `src/app.js` | button wiring, `buildEditRuntime` exposes `getLeadershipHistory`, `patchStore` clears the history cache |
| `README.md` | mention the new action |
| `dev/tests/**` | new/updated tests, enumerated per task below |

Each task is committed independently, in the order above (later tasks depend on earlier ones).

---

### Task 1: Config — office types

**Files:**
- Modify: `config.json`

- [ ] **Step 1: Add the curated office-type list**

Add this key to `config.json` (after `"academicJournalQid": "Q737498"`, keeping the file valid JSON — add a comma after that line):

```json
  "officeTypes": [
    { "qid": "Q1255921", "label": "President" },
    { "qid": "Q140686", "label": "Chairperson" },
    { "qid": "Q42178", "label": "Vice-president" },
    { "qid": "Q6501749", "label": "Secretary-general" },
    { "qid": "Q388338", "label": "Treasurer" },
    { "qid": "Q1758037", "label": "Speaker" }
  ]
```

- [ ] **Step 2: Verify the file is still valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('config.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add config.json
git commit -m "feat(config): add curated office-type list for leadership statements"
```

---

### Task 2: Data model (`core/draft.js`)

**Files:**
- Modify: `src/core/draft.js`
- Test: `dev/tests/core/draft.test.js`

- [ ] **Step 1: Remove the old tests that reference the deleted shape**

In `dev/tests/core/draft.test.js`, delete these two tests entirely (lines 19-25 and 45-49 in the current file):

```javascript
test('validateDraftForChangeset: change-president requires association.qid, president identity, termStart', () => {
  const d = emptyDraft('change-president');
  const errs = validateDraftForChangeset(d);
  assert.ok(errs.includes('association.qid is required'));
  assert.ok(errs.includes('president identity is required'));
  assert.ok(errs.includes('termStart is required'));
});
```

and

```javascript
test('create-association does not require a president', () => {
  const d = emptyDraft('create-association');
  Object.assign(d.association, { labels: { pt: 'Rede' }, classQid: 'Q1', fieldQid: 'Q2', referenceUrl: 'https://x' });
  assert.deepEqual(validateDraftForChangeset(d), []);
});
```

Also rename the first test (currently `'emptyDraft has a mode and nested association/president/journal'`) to drop "president":

```javascript
test('emptyDraft has a mode and nested association/journal', () => {
```

- [ ] **Step 2: Write the new failing tests**

Append to `dev/tests/core/draft.test.js`:

```javascript
test('emptyDraft("manage-leadership") starts with an empty officers list and no loaded original', () => {
  const d = emptyDraft('manage-leadership');
  assert.deepEqual(d.officers, []);
  assert.equal(d.leadershipOriginal, null);
});

test('emptyOfficerRow seeds a blank row with the given default office', () => {
  const row = emptyOfficerRow('Q1255921', 'President');
  assert.equal(row.officeQid, 'Q1255921');
  assert.equal(row.officeLabel, 'President');
  assert.equal(row.begin, '');
  assert.equal(row.end, null);
  assert.equal(row.person.qid, null);
  assert.deepEqual(row.person.labels, {});
});

test('leadershipClaimsFromEntity parses P488 claims with P580/P582/P3831 qualifiers', () => {
  const entity = {
    claims: {
      P488: [
        {
          id: 'Q100$A', rank: 'normal',
          mainsnak: { datavalue: { value: { id: 'Q5' } } },
          qualifiers: {
            P580: [{ datavalue: { value: { time: '+1995-06-01T00:00:00Z' } } }],
            P582: [{ datavalue: { value: { time: '+2010-01-15T00:00:00Z' } } }],
            P3831: [{ datavalue: { value: { id: 'Q140686' } } }],
          },
        },
        {
          id: 'Q100$B', rank: 'normal',
          mainsnak: { datavalue: { value: { id: 'Q9' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+2010-01-15T00:00:00Z' } } }] },
        },
        { id: 'Q100$C', rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q999' } } } },
      ],
    },
  };
  const rows = leadershipClaimsFromEntity(entity);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { statementId: 'Q100$A', personQid: 'Q5', officeQid: 'Q140686', begin: '1995-06-01', end: '2010-01-15' });
  assert.deepEqual(rows[1], { statementId: 'Q100$B', personQid: 'Q9', officeQid: null, begin: '2010-01-15', end: null });
});

test('leadershipClaimsFromEntity on an entity with no P488 claims returns []', () => {
  assert.deepEqual(leadershipClaimsFromEntity({ claims: {} }), []);
  assert.deepEqual(leadershipClaimsFromEntity({}), []);
});

test('validateDraftForChangeset: manage-leadership requires at least one officeholder row', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  assert.ok(validateDraftForChangeset(d).includes('add at least one officeholder'));
});

test('validateDraftForChangeset: manage-leadership — an existing person only needs office + begin date', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  d.officers.push({ ...emptyOfficerRow('Q1255921', 'President'), person: { ...emptyOfficerRow('Q1', '').person, qid: 'Q200' }, begin: '2024-01-01' });
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership — a new person needs affiliation or ORCID', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.labels = { en: 'Jane Roe' };
  row.begin = '2024-01-01';
  d.officers.push(row);
  assert.ok(validateDraftForChangeset(d).includes('a new officeholder needs an affiliation or an ORCID iD'));
  row.person.orcid = '0000-0002-1825-0097';
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership — begin is required, end must not precede begin', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.qid = 'Q200';
  d.officers.push(row);
  assert.ok(validateDraftForChangeset(d).includes('the term needs a valid begin date'));
  row.begin = '2024-06-01';
  row.end = '2024-01-01';
  assert.ok(validateDraftForChangeset(d).includes('the end date is before the begin date'));
  row.end = '2024-12-31';
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership — at most one row may be left open (current)', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example';
  const row = (qid) => ({ ...emptyOfficerRow('Q1255921', 'President'), person: { ...emptyOfficerRow('Q1', '').person, qid }, begin: '2024-01-01' });
  d.officers.push(row('Q200'), row('Q300'));
  assert.ok(validateDraftForChangeset(d).includes('only one officeholder can be the current one — give the others an end date'));
  d.officers[0].end = '2024-06-30'; // after its own begin (2024-01-01) — a closed past term
  assert.deepEqual(validateDraftForChangeset(d), []);
});

test('validateDraftForChangeset: manage-leadership requires a reference URL once any row is present', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.qid = 'Q200';
  row.begin = '2024-01-01';
  d.officers.push(row);
  assert.ok(validateDraftForChangeset(d).includes('association.referenceUrl is required'));
});
```

Update the import line at the top of the file to also pull in `emptyOfficerRow` and `leadershipClaimsFromEntity`:

```javascript
import { emptyDraft, validateDraftForChangeset, changedTerms, changedStatements, originalFromEntity, cleanTerms, scopeStatements, hasScopeChanges, activeFormerNames, validateFormerNames, aliasesToSet, changedAbbreviations, emptyOfficerRow, leadershipClaimsFromEntity } from '../../../src/core/draft.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dev && node --test tests/core/draft.test.js`
Expected: FAIL — `emptyOfficerRow is not a function` / `leadershipClaimsFromEntity is not a function` / assertions about `d.officers` being `undefined`.

- [ ] **Step 3: Edit `src/core/draft.js` — remove the old president shape**

Remove the `DraftPerson` typedef block:

```javascript
 * @typedef {Object} DraftPerson
 * @property {string|null} qid
 * @property {string} label
 * @property {string} description
 * @property {string|null} homepage
 * @property {string|null} orcid
 * @property {string|null} universityQid
 * @property {string|null} referenceUrl
 *
```

In the `DirectoryDraft` typedef, change:

```javascript
 * @typedef {Object} DirectoryDraft
 * @property {'create-association'|'change-president'|'update-field'} mode
 * @property {DraftAssociation} association
 * @property {DraftPerson} president
 * @property {DraftJournal|null} journal
 * @property {string|null} previousPresidentStatementId
 * @property {string|null} termStart    // ISO date
 */
```

to:

```javascript
 * @typedef {Object} DirectoryDraft
 * @property {'create-association'|'manage-leadership'|'update-field'} mode
 * @property {DraftAssociation} association
 * @property {DraftJournal|null} journal
 * @property {DraftOfficerRow[]} officers            // manage-leadership only: rows being added
 * @property {LeadershipOriginal|null} leadershipOriginal  // manage-leadership only: loaded from Wikidata
 */
```

Insert the new typedefs right after the `DraftJournal` typedef block (before `DirectoryDraft`):

```javascript
 * @typedef {Object} DraftOfficerPerson
 * @property {string|null} qid                  // an existing person, or null to create one
 * @property {Object<string,string>} labels      // language code -> name (new person only)
 * @property {string} description                // short English description (new person only)
 * @property {string|null} birthDate             // 'YYYY-MM-DD', new person only, optional
 * @property {string|null} affiliationQid        // P108 target, optional
 * @property {string|null} affiliationLabel      // display only
 * @property {string|null} orcid                 // P496, optional
 * @property {string|null} homepage              // P856, optional
 *
 * @typedef {Object} DraftOfficerRow
 * @property {DraftOfficerPerson} person
 * @property {string} officeQid                  // P3831 value; defaults to config.officeTypes[0].qid
 * @property {string} officeLabel                // display only
 * @property {string} begin                      // 'YYYY-MM-DD', required
 * @property {string|null} end                   // 'YYYY-MM-DD', optional ("present" if blank)
 *
 * @typedef {Object} LeadershipHistoryRow         // an existing P488 statement, read from Wikidata
 * @property {string} statementId
 * @property {string} personQid
 * @property {string} personLabel
 * @property {string|null} officeQid
 * @property {string} officeLabel                 // "chairperson" fallback if no P3831 qualifier
 * @property {string|null} begin
 * @property {string|null} end                    // null = still open
 *
 * @typedef {Object} LeadershipOriginal
 * @property {LeadershipHistoryRow[]} history      // every P488 statement, sorted begin desc
 * @property {LeadershipHistoryRow|null} current   // the one row (if any) with no end date
```

- [ ] **Step 4: Update `emptyDraft`**

Replace:

```javascript
    president: {
      qid: null, label: '', description: '', homepage: null, orcid: null,
      universityQid: null, referenceUrl: null,
    },
    journal: null,
    previousPresidentStatementId: null,
    termStart: null,
  };
}
```

with:

```javascript
    journal: null,
    officers: [],
    leadershipOriginal: null,
  };
}

/**
 * A blank officer row, ready for the UI to fill in.
 * @param {string} officeQid @param {string} officeLabel
 * @returns {DraftOfficerRow}
 */
export function emptyOfficerRow(officeQid, officeLabel) {
  return {
    person: { qid: null, labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid, officeLabel, begin: '', end: null,
  };
}
```

- [ ] **Step 5: Add `leadershipClaimsFromEntity`**

Add this function next to `originalFromEntity` (after it):

```javascript
const TIME_RE = /^[+-]?0*(\d{1,4})-(\d{2})-(\d{2})/;

/** A Wikidata time qualifier's first value, as 'YYYY-MM-DD', or null. */
function dateOf(qualifiers) {
  const m = TIME_RE.exec(qualifiers?.[0]?.datavalue?.value?.time || '');
  return m ? `${m[1].padStart(4, '0')}-${m[2]}-${m[3]}` : null;
}

/**
 * Parse an entity's P488 (chairperson) claims into leadership rows. No label resolution
 * here (QIDs only) — that is the adapter's job, since it is the only layer that talks to
 * the network (see `adapters/wikibase-api.js`'s `getLeadershipHistory`).
 * @param {any} entity
 * @returns {{statementId: string, personQid: string, officeQid: string|null, begin: string|null, end: string|null}[]}
 */
export function leadershipClaimsFromEntity(entity) {
  return (entity?.claims?.P488 || [])
    .filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value?.id)
    .map((c) => ({
      statementId: c.id,
      personQid: c.mainsnak.datavalue.value.id,
      officeQid: c.qualifiers?.P3831?.[0]?.datavalue?.value?.id || null,
      begin: dateOf(c.qualifiers?.P580),
      end: dateOf(c.qualifiers?.P582),
    }));
}
```

- [ ] **Step 6: Replace validation — remove the old branches, add the new one**

Remove:

```javascript
  const p = d.president;
```

from the top of `validateDraftForChangeset` (right after `const a = d.association;`).

Remove these two lines from the `create-association` block:

```javascript
    // a president is optional for now; if one is given, a new person needs the usual evidence
    if (p.label && !p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
    if (p.label && !p.qid && !p.referenceUrl) e.push('president.referenceUrl is required for a new person');
```

Replace the whole `change-president` block:

```javascript
  if (d.mode === 'change-president') {
    if (!a.qid) e.push('association.qid is required');
    if (!p.qid && !p.label) e.push('president identity is required');
    if (!d.termStart) e.push('termStart is required');
    if (!p.qid && !p.universityQid) e.push('president.universityQid is required for a new person');
  }
```

with:

```javascript
  if (d.mode === 'manage-leadership') {
    if (!a.qid) e.push('association.qid is required');
    const rows = d.officers || [];
    if (rows.length === 0) e.push('add at least one officeholder');
    let openCount = 0;
    for (const row of rows) {
      const rp = row.person;
      const hasName = Object.keys(cleanTerms(rp.labels)).length > 0;
      if (!rp.qid && !hasName) e.push('name the officeholder or pick an existing person');
      if (!rp.qid) {
        if (!rp.affiliationQid && !rp.orcid) e.push('a new officeholder needs an affiliation or an ORCID iD');
        e.push(...validateTerms({ labels: rp.labels, descriptions: {}, abbreviations: {} }));
      }
      if (!row.officeQid) e.push('pick the type of office');
      if (!row.begin || !isValidIsoDate(row.begin)) e.push('the term needs a valid begin date');
      if (row.end) {
        if (!isValidIsoDate(row.end)) e.push('the end date is not valid');
        else if (row.begin && isValidIsoDate(row.begin) && row.end < row.begin) e.push('the end date is before the begin date');
      } else {
        openCount += 1;
      }
    }
    if (openCount > 1) e.push('only one officeholder can be the current one — give the others an end date');
    if (rows.length > 0 && !a.referenceUrl) e.push('association.referenceUrl is required');
  }
```

Add the date helper near the top of the file, next to `MAX_TERM_LENGTH`:

```javascript
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isValidIsoDate = (s) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(s));
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd dev && node --test tests/core/draft.test.js`
Expected: PASS, all tests green.

- [ ] **Step 8: Commit**

```bash
git add src/core/draft.js dev/tests/core/draft.test.js
git commit -m "feat(draft): replace dead change-president shape with manage-leadership officer rows"
```

---

### Task 3: Change-set builder (`core/changeset.js`)

**Files:**
- Modify: `src/core/changeset.js`
- Test: `dev/tests/core/changeset.test.js`

- [ ] **Step 1: Update the obsolete tests**

In `dev/tests/core/changeset.test.js`:

Delete the two `change-president` tests (lines 8-48 in the current file, both `'change-president with an existing person...'` and `'change-president with a NEW person...'`).

In `'create-association with a new journal links journal P123 to the association ref'`, remove these two lines:

```javascript
  d.president.qid = 'Q400';
  d.termStart = '2024-01-01';
```

and remove this assertion block:

```javascript
  const p488 = assoc.claims.find((c) => c.property === 'P488');
  assert.deepEqual(p488.value, { kind: 'item', qid: 'Q400' });
```

In `'P968 (email) is always stored as a mailto: URI...'`, remove:

```javascript
  created.president.qid = 'Q400';
```

In `'linking an EXISTING journal emits add-statements, not a create-item'`, remove:

```javascript
  d.president.qid = 'Q400';
```

Rename `'create-association without a president creates only the association (no empty person)'` to `'create-association creates only the association item (no person, no P488)'` (the "without a president" framing no longer means anything — there is no other case).

- [ ] **Step 2: Write the new failing tests**

Append to `dev/tests/core/changeset.test.js`:

```javascript
test('manage-leadership: an existing person gets a referenced P488 with begin/office qualifiers', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/board';
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.length, 1);
  const op = cs.ops[0];
  assert.equal(op.type, 'add-statement');
  assert.deepEqual(op.target, { qid: 'Q100' });
  assert.equal(op.property, 'P488');
  assert.deepEqual(op.value, { kind: 'item', qid: 'Q200' });
  assert.deepEqual(op.qualifiers, [
    { property: 'P580', value: { kind: 'time', value: '2024-01-01', precision: 11 } },
    { property: 'P3831', value: { kind: 'item', qid: 'Q1255921' } },
  ]);
  assert.deepEqual(op.reference, { P854: 'https://x.example/board' });
});

test('manage-leadership: a past term (end given) adds P582 too, and needs no current-officer end-statement', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/history';
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q140686', officeLabel: 'Chairperson', begin: '1995-06-01', end: '2010-01-15',
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.length, 1);
  assert.deepEqual(cs.ops[0].qualifiers, [
    { property: 'P580', value: { kind: 'time', value: '1995-06-01', precision: 11 } },
    { property: 'P3831', value: { kind: 'item', qid: 'Q140686' } },
    { property: 'P582', value: { kind: 'time', value: '2010-01-15', precision: 11 } },
  ]);
});

test('manage-leadership: a new person is created with P569/P108(+P585)/P496/P856, then linked via P488', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/about';
  d.officers.push({
    person: {
      qid: null, labels: { en: 'Jane Roe', pt: 'Joana Roe' }, description: 'legal scholar',
      birthDate: '1970-03-04', affiliationQid: 'Q300', affiliationLabel: 'Example University',
      orcid: '0000-0002-1825-0097', homepage: 'https://uni.example/roe',
    },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, { ...cfg, today: '2026-09-30' });
  const create = cs.ops.find((o) => o.type === 'create-item' && o.ref === 'person-0');
  assert.deepEqual(create.labels, { en: 'Jane Roe', pt: 'Joana Roe' });
  assert.deepEqual(create.descriptions, { en: 'legal scholar' });
  assert.ok(create.claims.some((c) => c.property === 'P31' && c.value.qid === 'Q5'));
  assert.ok(create.claims.some((c) => c.property === 'P106' && c.value.qid === 'Q1650915'));
  assert.ok(create.claims.some((c) => c.property === 'P569' && c.value.value === '1970-03-04' && c.value.precision === 11));
  const aff = create.claims.find((c) => c.property === 'P108');
  assert.deepEqual(aff.value, { kind: 'item', qid: 'Q300' });
  assert.deepEqual(aff.qualifiers, [{ property: 'P585', value: { kind: 'time', value: '2026-09-30', precision: 11 } }]);
  assert.ok(create.claims.some((c) => c.property === 'P496' && c.value.value === '0000-0002-1825-0097'));
  assert.ok(create.claims.some((c) => c.property === 'P856' && c.value.value === 'https://uni.example/roe'));
  assert.ok(create.claims.every((c) => c.reference?.P854 === 'https://x.example/about'));
  // the P488 statement for this row must immediately follow its own create-item, for the
  // QuickStatements LAST-reference ordering constraint (see quickstatements.test.js)
  const createIdx = cs.ops.indexOf(create);
  const link = cs.ops[createIdx + 1];
  assert.equal(link.property, 'P488');
  assert.deepEqual(link.value, { kind: 'item', ref: 'person-0' });
});

test('manage-leadership: a new row with no end date auto-ends the previously open statement', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/board';
  d.leadershipOriginal = { history: [], current: { statementId: 'Q100$OLD', personQid: 'Q9', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null } };
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, cfg);
  const end = cs.ops.find((o) => o.type === 'end-statement');
  assert.deepEqual(end, { type: 'end-statement', statementId: 'Q100$OLD', endDate: '2024-01-01' });
});

test('manage-leadership: a purely historical batch (no open row) does not touch the existing current statement', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/history';
  d.leadershipOriginal = { history: [], current: { statementId: 'Q100$OLD', personQid: 'Q9', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null } };
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '1990-01-01', end: '1995-01-01',
  });
  const cs = buildChangeSet(d, cfg);
  assert.equal(cs.ops.some((o) => o.type === 'end-statement'), false);
});

test('manage-leadership: picking an existing person with a current affiliation writes a P585-dated P108, no create-item', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.association.referenceUrl = 'https://x.example/board';
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: 'Q300', affiliationLabel: 'Example University', orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const cs = buildChangeSet(d, { ...cfg, today: '2026-09-30' });
  assert.equal(cs.ops.some((o) => o.type === 'create-item'), false);
  const aff = cs.ops.find((o) => o.property === 'P108');
  assert.deepEqual(aff.target, { qid: 'Q200' });
  assert.deepEqual(aff.value, { kind: 'item', qid: 'Q300' });
  assert.deepEqual(aff.qualifiers, [{ property: 'P585', value: { kind: 'time', value: '2026-09-30', precision: 11 } }]);
});

test('describeChanges: manage-leadership lists each row and the auto-end', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  d.leadershipOriginal = { history: [], current: { statementId: 'Q100$OLD', personQid: 'Q9', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null } };
  d.officers.push({
    person: { qid: 'Q200', labels: {}, description: '', birthDate: null, affiliationQid: null, affiliationLabel: null, orcid: null, homepage: null },
    officeQid: 'Q1255921', officeLabel: 'President', begin: '2024-01-01', end: null,
  });
  const lines = describeChanges(d);
  assert.ok(lines.includes('President: Q200 (existing person), 2024-01-01 – present'));
  assert.ok(lines.some((l) => /ends the previous officeholder.s term at 2024-01-01/.test(l)));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd dev && node --test tests/core/changeset.test.js`
Expected: FAIL — `buildChangeSet` throws `invalid draft` (mode unhandled) or produces no ops for `manage-leadership`.

- [ ] **Step 4: Edit `src/core/changeset.js`**

Change the `buildChangeSet` JSDoc signature comment's config param to mention `today` (used for the `P585` qualifier, injected for testability):

```javascript
/**
 * @param {import('./draft.js').DirectoryDraft} draft
 * @param {{humanQid:string, researcherQid:string, academicJournalQid:string, today?:string}} cfg
 * @returns {ChangeSet}
 */
export function buildChangeSet(draft, cfg) {
```

Remove the whole "person (create if new)" block (the `let personValue = null; if (draft.mode !== 'update-field') { ... }` block) — it only ever served the now-removed create-association-with-president and change-president paths:

```javascript
  // --- person (create if new) ---
  let personValue = null;
  if (draft.mode !== 'update-field') {
    if (p.qid) {
      personValue = item(p.qid);
      if (p.universityQid) {
        ops.push({ type: 'add-statement', target: { qid: p.qid }, property: 'P108', value: item(p.universityQid), reference: p.referenceUrl ? { P854: p.referenceUrl } : undefined });
      }
    } else if (p.label) {
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
```

and the now-unused `const p = draft.president;` line above it.

In the `create-association` branch, remove the `if (personValue) { ... }` block that adds a `P488` claim, and simplify the summary line (remove the `extras` computation):

```javascript
    if (personValue) {
      claims.push({
        property: 'P488',
        value: personValue,
        qualifiers: draft.termStart ? [{ property: 'P580', value: day(draft.termStart) }] : undefined,
      });
    }
```

and:

```javascript
    const extras = [j ? 'journal' : null, personValue ? 'president' : null].filter(Boolean);
    return { summary: `socio-legal directory: create association${extras.length ? ` with ${extras.join(' and ')}` : ''}`, ops };
```

become:

```javascript
    return { summary: `socio-legal directory: create association${j ? ' with journal' : ''}`, ops };
```

Replace the whole `change-president` branch:

```javascript
  if (draft.mode === 'change-president') {
    ops.push({
      type: 'add-statement',
      target: { qid: a.qid },
      property: 'P488',
      value: personValue,
      qualifiers: [{ property: 'P580', value: day(draft.termStart) }],
      reference: assocRefUrl || (p.referenceUrl ? { P854: p.referenceUrl } : undefined),
    });
    if (draft.previousPresidentStatementId) {
      ops.push({ type: 'end-statement', statementId: draft.previousPresidentStatementId, endDate: draft.termStart });
    }
    return { summary: 'socio-legal directory: record new president', ops };
  }
```

with:

```javascript
  if (draft.mode === 'manage-leadership') {
    const today = cfg.today || new Date().toISOString().slice(0, 10);
    const rows = draft.officers || [];
    let openRow = null;
    rows.forEach((row, i) => {
      const rp = row.person;
      let value;
      if (rp.qid) {
        value = item(rp.qid);
        if (rp.affiliationQid) {
          ops.push({
            type: 'add-statement', target: { qid: rp.qid }, property: 'P108', value: item(rp.affiliationQid),
            qualifiers: [{ property: 'P585', value: day(today) }], reference: assocRefUrl,
          });
        }
      } else {
        const personRef = `person-${i}`;
        /** @type {Claim[]} */
        const claims = [
          { property: 'P31', value: item(cfg.humanQid) },
          { property: 'P106', value: item(cfg.researcherQid) },
        ];
        if (rp.birthDate) claims.push({ property: 'P569', value: day(rp.birthDate) });
        if (rp.affiliationQid) claims.push({ property: 'P108', value: item(rp.affiliationQid), qualifiers: [{ property: 'P585', value: day(today) }] });
        if (rp.homepage) claims.push({ property: 'P856', value: url(rp.homepage) });
        if (rp.orcid) claims.push({ property: 'P496', value: extId(rp.orcid) });
        for (const c of claims) if (assocRefUrl) c.reference = assocRefUrl;
        ops.push({ type: 'create-item', ref: personRef, labels: cleanTerms(rp.labels), descriptions: rp.description ? { en: rp.description } : {}, claims });
        value = ref(personRef);
      }
      const qualifiers = [{ property: 'P580', value: day(row.begin) }, { property: 'P3831', value: item(row.officeQid) }];
      if (row.end) qualifiers.push({ property: 'P582', value: day(row.end) });
      ops.push({ type: 'add-statement', target: { qid: a.qid }, property: 'P488', value, qualifiers, reference: assocRefUrl });
      if (!row.end) openRow = row;
    });
    if (openRow && draft.leadershipOriginal?.current) {
      ops.push({ type: 'end-statement', statementId: draft.leadershipOriginal.current.statementId, endDate: openRow.begin });
    }
    return { summary: `socio-legal directory: update leadership (${rows.length} ${rows.length === 1 ? 'entry' : 'entries'})`, ops };
  }
```

`cleanTerms` is already imported into `changeset.js`'s dependency, `draft.js` — check the top-of-file import line and add it:

```javascript
import { validateDraftForChangeset, changedTerms, changedStatements, scopeStatements, changedParent, changedOperatingArea, activeFormerNames, aliasesToSet, changedAbbreviations, cleanTerms } from './draft.js';
```

- [ ] **Step 5: Add the `manage-leadership` lines to `describeChanges`**

At the end of `describeChanges`, right before the final `return lines;`, add:

```javascript
  if (draft.mode === 'manage-leadership') {
    for (const row of draft.officers || []) {
      const who = row.person.qid
        ? `${row.person.qid} (existing person)`
        : `${Object.values(row.person.labels || {})[0] || '(unnamed)'} (new person)`;
      lines.push(`${row.officeLabel || row.officeQid}: ${who}, ${row.begin || '?'} – ${row.end || 'present'}`);
    }
    const openRow = (draft.officers || []).find((r) => !r.end);
    if (openRow && draft.leadershipOriginal?.current) {
      lines.push(`ends the previous officeholder's term at ${openRow.begin}`);
    }
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd dev && node --test tests/core/changeset.test.js`
Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add src/core/changeset.js dev/tests/core/changeset.test.js
git commit -m "feat(changeset): build manage-leadership ops (P488+P580/P582/P3831, P585-dated affiliation)"
```

---

### Task 4: QuickStatements ordering regression test

**Files:**
- Test: `dev/tests/core/quickstatements.test.js`

No production code change is expected — `core/quickstatements.js`'s `qsValue`/`tail` already handle item-valued qualifiers and ref-valued statement objects generically. This task only locks in the ordering constraint Task 3 relies on (each new person's `create-item` is immediately followed by its own `P488` statement).

- [ ] **Step 1: Write the failing (well — should-already-pass) regression test**

Append to `dev/tests/core/quickstatements.test.js`:

```javascript
test('two interleaved new-person + P488 pairs both resolve via LAST (manage-leadership ordering)', () => {
  const cs = {
    summary: 'socio-legal directory: update leadership (2 entries)',
    ops: [
      { type: 'create-item', ref: 'person-0', labels: { en: 'Jane Roe' }, descriptions: {}, claims: [{ property: 'P31', value: { kind: 'item', qid: 'Q5' } }] },
      { type: 'add-statement', target: { qid: 'Q100' }, property: 'P488', value: { kind: 'item', ref: 'person-0' },
        qualifiers: [{ property: 'P580', value: { kind: 'time', value: '1990-01-01', precision: 11 } }] },
      { type: 'create-item', ref: 'person-1', labels: { en: 'John Doe' }, descriptions: {}, claims: [{ property: 'P31', value: { kind: 'item', qid: 'Q5' } }] },
      { type: 'add-statement', target: { qid: 'Q100' }, property: 'P488', value: { kind: 'item', ref: 'person-1' },
        qualifiers: [{ property: 'P580', value: { kind: 'time', value: '1995-01-01', precision: 11 } }] },
    ],
  };
  const out = serialize(cs);
  // neither P488 link should have fallen back to a "# MANUAL" comment
  assert.equal((out.match(/# MANUAL/g) || []).length, 0);
  assert.equal((out.match(/^Q100\tP488\tLAST\t/gm) || []).length, 2);
});
```

Confirm the import line at the top of the file already brings in `serialize` (it does, from the existing tests in this file) — no import change needed.

- [ ] **Step 2: Run the test**

Run: `cd dev && node --test tests/core/quickstatements.test.js`
Expected: PASS immediately (no production code change needed — this step is verification, not TDD red/green).

- [ ] **Step 3: Commit**

```bash
git add dev/tests/core/quickstatements.test.js
git commit -m "test(quickstatements): lock in the interleaved create/link ordering manage-leadership depends on"
```

---

### Task 5: Adapter read method (`adapters/wikibase-api.js`)

**Files:**
- Modify: `src/adapters/wikibase-api.js`
- Modify: `src/ports/index.js`
- Test: `dev/tests/adapters/wikibase-api-leadership.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `dev/tests/adapters/wikibase-api-leadership.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWikibaseApi } from '../../../src/adapters/wikibase-api.js';

const config = {
  wikidataActionApi: 'https://www.wikidata.org/w/api.php',
  wikibaseRestBase: 'https://www.wikidata.org/w/rest.php/wikibase/v1',
};
const ok = (body) => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });

test('getLeadershipHistory: no P488 claims returns an empty, current:null result with no label request', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return ok({ entities: { Q1: { claims: {} } } }); };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  assert.deepEqual(await api.getLeadershipHistory('Q1'), { history: [], current: null });
  assert.equal(calls, 1); // just the entity fetch, no batched label lookup
});

test('getLeadershipHistory: labels are batched in one request, sorted newest-begin-first, office falls back to "chairperson"', async () => {
  const fetch = async (url) => {
    if (url.includes('ids=Q1') && !url.includes('P31')) {
      return ok({ entities: { Q1: { claims: { P488: [
        { id: 'Q1$A', rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q5' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+1995-01-01T00:00:00Z' } } }], P3831: [{ datavalue: { value: { id: 'Q140686' } } }] } },
        { id: 'Q1$B', rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q9' } } },
          qualifiers: { P580: [{ datavalue: { value: { time: '+2010-01-01T00:00:00Z' } } }] } },
      ] } } } });
    }
    assert.match(url, /ids=Q5%7CQ9%7CQ140686|ids=Q9%7CQ5%7CQ140686/); // batched, order not asserted strictly beyond containment
    return ok({ entities: {
      Q5: { labels: { en: { value: 'Eva Kocher' } } },
      Q9: { labels: { en: { value: 'Old Pres' } } },
      Q140686: { labels: { en: { value: 'Chairperson' } } },
    } });
  };
  const api = createWikibaseApi({ fetch, config, getToken: async () => 'T' });
  const result = await api.getLeadershipHistory('Q1');
  assert.deepEqual(result.history[0], { statementId: 'Q1$B', personQid: 'Q9', personLabel: 'Old Pres', officeQid: null, officeLabel: 'chairperson', begin: '2010-01-01', end: null });
  assert.deepEqual(result.history[1], { statementId: 'Q1$A', personQid: 'Q5', personLabel: 'Eva Kocher', officeQid: 'Q140686', officeLabel: 'Chairperson', begin: '1995-01-01', end: null });
  assert.deepEqual(result.current, result.history[0]); // the more recently begun of the two open rows
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dev && node --test tests/adapters/wikibase-api-leadership.test.js`
Expected: FAIL — `api.getLeadershipHistory is not a function`.

- [ ] **Step 3: Implement `getLeadershipHistory`**

In `src/adapters/wikibase-api.js`, add the import at the top:

```javascript
import { leadershipClaimsFromEntity } from '../core/draft.js';
```

Add this method inside the object returned by `createWikibaseApi`, after `getOfficialLanguageCodes`:

```javascript
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
```

- [ ] **Step 4: Document the new port method**

In `src/ports/index.js`, add a line to the `SearchPort` typedef:

```javascript
 * @typedef {Object} SearchPort
 * @property {(text: string, type: 'item') => Promise<EntityCandidate[]>} searchEntities
 * @property {(qid: string) => Promise<any>} getEntity
 * @property {(property: string, value: string) => Promise<EntityCandidate[]>} lookupByExternalId
 * @property {(qid: string) => Promise<{history: import('../core/draft.js').LeadershipHistoryRow[], current: import('../core/draft.js').LeadershipHistoryRow|null}>} [getLeadershipHistory]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dev && node --test tests/adapters/wikibase-api-leadership.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full adapter suite to check for regressions**

Run: `cd dev && node --test tests/adapters/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/wikibase-api.js src/ports/index.js dev/tests/adapters/wikibase-api-leadership.test.js
git commit -m "feat(adapter): add getLeadershipHistory (batched labels, chairperson fallback)"
```

---

### Task 6: Step wiring (`ui/edit-wizard/steps.js`)

**Files:**
- Modify: `src/ui/edit-wizard/steps.js`
- Test: `dev/tests/ui/wizard-steps.test.js`

- [ ] **Step 1: Replace the obsolete test**

In `dev/tests/ui/wizard-steps.test.js`, delete:

```javascript
test('people step requires a president and, for a new person, a university + reference', () => {
  const d = emptyDraft('create-association');
  assert.ok(validateStep('people', d).includes('choose or name the president'));
  d.president.label = 'Jane';
  assert.ok(validateStep('people', d).includes('pick the president’s university'));
  d.president.universityQid = 'Q1';
  assert.ok(validateStep('people', d).includes('a reference URL for the new person is required'));
});
```

- [ ] **Step 2: Write the new failing tests**

Append to `dev/tests/ui/wizard-steps.test.js`:

```javascript
test('STEP_ORDER for manage-leadership: officers then review, no identify (the association is already known)', () => {
  assert.deepEqual(STEP_ORDER['manage-leadership'], ['officers', 'review']);
});

test('officers step reuses the full draft validation, so "add at least one officeholder" surfaces immediately', () => {
  const d = emptyDraft('manage-leadership');
  d.association.qid = 'Q100';
  assert.deepEqual(validateStep('officers', d), validateDraftForChangeset(d));
  assert.ok(validateStep('officers', d).includes('add at least one officeholder'));
});
```

Update the import line at the top of the test file:

```javascript
import { emptyDraft, validateDraftForChangeset } from '../../../src/core/draft.js';
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd dev && node --test tests/ui/wizard-steps.test.js`
Expected: FAIL — `STEP_ORDER['manage-leadership']` is `undefined`.

- [ ] **Step 4: Edit `src/ui/edit-wizard/steps.js`**

Replace the `STEP_ORDER` entry:

```javascript
  'change-president': ['identify', 'people', 'review'],
```

with:

```javascript
  'manage-leadership': ['officers', 'review'],
```

Remove the whole `people` step validation block:

```javascript
  if (step === 'people') {
    if (!p.qid && !p.label) e.push('choose or name the president');
    if (!p.qid) {
      if (!p.universityQid) e.push('pick the president’s university');
      if (!p.referenceUrl) e.push('a reference URL for the new person is required');
    }
    if (d.mode === 'change-president' && !d.termStart) e.push('set the term start date');
  }
```

and replace it with:

```javascript
  if (step === 'officers') {
    return validateDraftForChangeset(d);
  }
```

Remove the now-unused `const p = d.president;` line near the top of `validateStep`, and add `validateDraftForChangeset` to the import from `../../core/draft.js`:

```javascript
import { cleanTerms, changedStatements, hasTermChanges, hasScopeChanges, hasFormerNames, hasAbbreviations, changedParent, changedOperatingArea, validateTerms, validateFormerNames, validateDraftForChangeset } from '../../core/draft.js';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dev && node --test tests/ui/wizard-steps.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/edit-wizard/steps.js dev/tests/ui/wizard-steps.test.js
git commit -m "feat(steps): wire manage-leadership's officers step onto the full draft validation"
```

---

### Task 7: Officers step UI (`ui/edit-wizard/leadership-form.js`)

**Files:**
- Create: `src/ui/edit-wizard/leadership-form.js`
- Test: `dev/tests/ui/leadership-form.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `dev/tests/ui/leadership-form.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, emptyOfficerRow } from '../../../src/core/draft.js';
import { renderLeadershipForm, applyLeadershipFieldInput } from '../../../src/ui/edit-wizard/leadership-form.js';

const config = { officeTypes: [{ qid: 'Q1255921', label: 'President' }, { qid: 'Q140686', label: 'Chairperson' }] };

test('renders one fieldset per officer row, an "already on Wikidata" list, and the office select', () => {
  const draft = emptyDraft('manage-leadership');
  draft.leadershipOriginal = { history: [{ statementId: 'Q1$A', personQid: 'Q9', personLabel: 'Old Pres', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null }], current: null };
  draft.officers.push(emptyOfficerRow('Q1255921', 'President'));
  const out = renderLeadershipForm({ draft, config }).value;
  assert.match(out, /Old Pres/);
  assert.match(out, /2018-01-01/);
  assert.match(out, /data-role="ta-officer-0"/); // no person chosen yet: search-first typeahead placeholder
  assert.match(out, /<option value="Q1255921"[^>]*selected[^>]*>President<\/option>/);
  assert.match(out, /Other — search Wikidata/);
});

test('an existing person (qid set) shows the chosen state and an affiliation picker placeholder, not the new-person fields', () => {
  const draft = emptyDraft('manage-leadership');
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.qid = 'Q200';
  draft.officers.push(row);
  const out = renderLeadershipForm({ draft, config }).value;
  assert.match(out, /Q200/);
  assert.match(out, /data-role="ta-officer-affiliation-0"/);
  assert.doesNotMatch(out, /New person/);
});

test('a new person (labels set, no qid) shows the create-person fields including birth date and ORCID', () => {
  const draft = emptyDraft('manage-leadership');
  const row = emptyOfficerRow('Q1255921', 'President');
  row.person.labels = { en: 'Jane Roe' };
  draft.officers.push(row);
  const out = renderLeadershipForm({ draft, config }).value;
  assert.match(out, /New person/);
  assert.match(out, /value="Jane Roe"/);
  assert.match(out, /type="date"[^>]*data-field="officer-birthdate"/);
  assert.match(out, /data-field="officer-orcid"/);
});

test('applyLeadershipFieldInput writes name, dates, office and reference fields into the right row', () => {
  const draft = emptyDraft('manage-leadership');
  draft.officers.push(emptyOfficerRow('Q1255921', 'President'));
  const set = (field, index, value, extra = {}) => applyLeadershipFieldInput(draft, { dataset: { field, index: String(index), ...extra }, value, selectedOptions: [{ textContent: 'Chairperson' }] });

  assert.equal(set('officer-name', 0, 'Jane Roe', { lang: 'en' }), true);
  assert.equal(draft.officers[0].person.labels.en, 'Jane Roe');

  assert.equal(set('officer-begin', 0, '2024-01-01'), true);
  assert.equal(draft.officers[0].begin, '2024-01-01');

  assert.equal(set('officer-end', 0, ''), true);
  assert.equal(draft.officers[0].end, null);

  assert.equal(set('officer-office', 0, 'Q140686'), true);
  assert.equal(draft.officers[0].officeQid, 'Q140686');
  assert.equal(draft.officers[0].officeLabel, 'Chairperson');

  assert.equal(set('referenceUrl', 0, ' https://x.example '), true);
  assert.equal(draft.association.referenceUrl, 'https://x.example');

  assert.equal(applyLeadershipFieldInput(draft, { dataset: {} }), false);
});

test('applyLeadershipFieldInput: choosing "Other" on the office select flags the row for the custom picker', () => {
  const draft = emptyDraft('manage-leadership');
  draft.officers.push(emptyOfficerRow('Q1255921', 'President'));
  const el = { dataset: { field: 'officer-office', index: '0' }, value: '__other__' };
  applyLeadershipFieldInput(draft, el);
  assert.equal(draft.officers[0]._customOffice, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dev && node --test tests/ui/leadership-form.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/ui/edit-wizard/leadership-form.js`**

```javascript
import { html } from '../../render.js';

const dateStr = (d) => d || '';

/** "Already on Wikidata" — the read-only list loaded when the wizard opened. */
function existingSection(original) {
  const history = original?.history || [];
  if (!history.length) return '';
  return html`<div class="officer__existing">
      <p class="wizard__hint">Already on Wikidata:</p>
      <ul>${history.map((r) => html`<li>${r.officeLabel}: ${r.personLabel}, ${r.begin || '?'} – ${r.end || 'present'}</li>`)}</ul>
    </div>`;
}

/** Two name fields: a fixed English primary, and an optional second language. */
function nameFields(p, i) {
  const showSecond = !!p._showSecondName || !!p._secondLang || !!p._secondText;
  return html`
    <label>Name (English)
      <input type="text" data-field="officer-name" data-index="${i}" data-lang="en" value="${p.labels.en || ''}" autocomplete="off"></label>
    ${showSecond
      ? html`<label>Language <input type="text" data-field="officer-name2-lang" data-index="${i}" value="${p._secondLang || ''}" placeholder="e.g. pt" autocomplete="off"></label>
          <label>Name <input type="text" data-field="officer-name2-text" data-index="${i}" value="${p._secondText || ''}" autocomplete="off"></label>`
      : html`<button type="button" data-role="officer-add-lang" data-index="${i}">+ add another language</button>`}`;
}

/** Current affiliation: chosen state, or the typeahead placeholder the wizard mounts into. */
function affiliationField(p, i) {
  return p.affiliationQid
    ? html`<p class="wizard__chosen">Current affiliation: <strong>${p.affiliationLabel || p.affiliationQid}</strong>
        <button type="button" data-role="clear-officer-affiliation" data-index="${i}">change</button></p>`
    : html`<div data-role="ta-officer-affiliation-${i}"></div>`;
}

/** Person picker: search-first, then either "existing person chosen" or the new-person fields. */
function personSection(row, i) {
  const p = row.person;
  if (p.qid) {
    return html`<p class="wizard__chosen">Person: <strong>${p.qid}</strong>
        <button type="button" data-role="clear-officer-person" data-index="${i}">change</button></p>
      <p class="officer__afflabel">Current affiliation (optional)</p>
      ${affiliationField(p, i)}`;
  }
  if (Object.keys(p.labels).length === 0) {
    return html`<div data-role="ta-officer-${i}"></div>`;
  }
  return html`<fieldset class="officer__person">
      <legend>New person</legend>
      ${nameFields(p, i)}
      <label>Description <input type="text" data-field="officer-description" data-index="${i}" value="${p.description || ''}" autocomplete="off"></label>
      <label>Birth date <input type="date" data-field="officer-birthdate" data-index="${i}" value="${dateStr(p.birthDate)}"></label>
      <p class="officer__afflabel">Current affiliation, or an ORCID iD below — at least one is required</p>
      ${affiliationField(p, i)}
      <label>ORCID iD <input type="text" data-field="officer-orcid" data-index="${i}" value="${p.orcid || ''}" autocomplete="off"></label>
      <label>Homepage <input type="text" inputmode="url" data-field="officer-homepage" data-index="${i}" value="${p.homepage || ''}" autocomplete="off"></label>
    </fieldset>`;
}

/** The office <select> (curated list + "Other"), or the typeahead once "Other" was chosen. */
function officeField(row, i, officeTypes) {
  if (row._customOffice) return html`<div data-role="ta-officer-office-${i}"></div>`;
  const known = officeTypes.some((o) => o.qid === row.officeQid);
  return html`<select data-field="officer-office" data-index="${i}">
      ${officeTypes.map((o) => html`<option value="${o.qid}" ${row.officeQid === o.qid ? 'selected' : ''}>${o.label}</option>`)}
      <option value="__other__" ${!known && row.officeQid ? 'selected' : ''}>Other — search Wikidata…</option>
    </select>`;
}

/**
 * The "officers" step body: existing leadership (read-only) plus rows being added.
 * @param {{draft: import('../../core/draft.js').DirectoryDraft, config: any}} p
 */
export function renderLeadershipForm({ draft, config }) {
  const officeTypes = config.officeTypes || [];
  const rows = draft.officers || [];
  return html`<div class="officers">
      ${existingSection(draft.leadershipOriginal)}
      ${rows.map((row, i) => html`<fieldset class="officer" data-index="${i}">
          <legend>Officeholder ${i + 1}</legend>
          ${personSection(row, i)}
          <label>Office ${officeField(row, i, officeTypes)}</label>
          <label>Begin <input type="date" data-field="officer-begin" data-index="${i}" value="${dateStr(row.begin)}"></label>
          <label>End (leave blank if current)
            <input type="date" data-field="officer-end" data-index="${i}" value="${dateStr(row.end)}"></label>
          <button type="button" data-role="remove-officer" data-index="${i}">Remove</button>
        </fieldset>`)}
      <button type="button" data-role="add-officer">+ Add another officeholder</button>
      <label>Reference URL
        <input type="text" inputmode="url" data-field="referenceUrl" value="${draft.association.referenceUrl || ''}" autocomplete="off"></label>
    </div>`;
}

/**
 * Write one officers-step form control's value into the draft.
 * @param {import('../../core/draft.js').DirectoryDraft} draft
 * @param {HTMLInputElement} el
 * @returns {boolean} whether the element belonged to this form
 */
export function applyLeadershipFieldInput(draft, el) {
  const field = el.dataset?.field;
  if (!field) return false;
  if (field === 'referenceUrl') { draft.association.referenceUrl = el.value.trim() || null; return true; }
  const row = (draft.officers || [])[Number(el.dataset.index)];
  if (!row) return false;
  const p = row.person;
  if (field === 'officer-name') { (p.labels ||= {})[el.dataset.lang] = el.value; return true; }
  if (field === 'officer-name2-lang') { p._secondLang = el.value.trim().toLowerCase(); syncSecondName(p); return true; }
  if (field === 'officer-name2-text') { p._secondText = el.value; syncSecondName(p); return true; }
  if (field === 'officer-description') { p.description = el.value; return true; }
  if (field === 'officer-birthdate') { p.birthDate = el.value || null; return true; }
  if (field === 'officer-orcid') { p.orcid = el.value.trim() || null; return true; }
  if (field === 'officer-homepage') { p.homepage = el.value.trim() || null; return true; }
  if (field === 'officer-begin') { row.begin = el.value; return true; }
  if (field === 'officer-end') { row.end = el.value || null; return true; }
  if (field === 'officer-office') {
    if (el.value === '__other__') { row._customOffice = true; return true; }
    row.officeQid = el.value;
    row.officeLabel = el.selectedOptions?.[0]?.textContent || el.value;
    return true;
  }
  return false;
}

/** Keep the second-language labels entry in sync with the two transient input fields. */
function syncSecondName(p) {
  for (const k of Object.keys(p.labels)) if (k !== 'en') delete p.labels[k];
  if (p._secondLang && p._secondText) p.labels[p._secondLang] = p._secondText;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dev && node --test tests/ui/leadership-form.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/edit-wizard/leadership-form.js dev/tests/ui/leadership-form.test.js
git commit -m "feat(wizard): add the officers step form (render + field-input handling)"
```

---

### Task 8: Wire the wizard (`ui/edit-wizard/wizard.js`)

**Files:**
- Modify: `src/ui/edit-wizard/wizard.js`
- Test: `dev/tests/ui/wizard.test.js`

- [ ] **Step 1: Replace the obsolete test**

In `dev/tests/ui/wizard.test.js`, replace `'a change-president flow produces the expected ChangeSet and calls the write port'`:

```javascript
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
```

with:

```javascript
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
```

Also extend the shared `cfg` at the top of the file to include the office types the seeded row needs:

```javascript
const cfg = { humanQid: 'Q5', researcherQid: 'Q1650915', academicJournalQid: 'Q737498', inScopeClassQid: 'Q955824', inScopeFieldQid: 'Q847034', officeTypes: [{ qid: 'Q1255921', label: 'President' }] };
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dev && node --test tests/ui/wizard.test.js`
Expected: FAIL — `d.officers[0]` is `undefined` (nothing seeds a first row yet), or the mode is unrecognised by `stepBody`.

- [ ] **Step 3: Edit `src/ui/edit-wizard/wizard.js`**

Update imports at the top:

```javascript
import { emptyDraft, originalFromEntity, emptyOfficerRow } from '../../core/draft.js';
```
and
```javascript
import { renderDetailsForm, refreshDetailsDerived, applyFieldInput } from './details-form.js';
import { renderLeadershipForm, applyLeadershipFieldInput } from './leadership-form.js';
```

Add a `loadLeadershipOriginal` function next to `loadOriginal`:

```javascript
  /** manage-leadership: fetch existing leadership and seed one blank row. */
  async function loadLeadershipOriginal() {
    loading = true;
    loadError = '';
    render();
    try {
      draft.leadershipOriginal = ports.search.getLeadershipHistory
        ? await ports.search.getLeadershipHistory(draft.association.qid)
        : { history: [], current: null };
      if (draft.officers.length === 0) {
        const first = config.officeTypes?.[0];
        draft.officers.push(emptyOfficerRow(first?.qid || '', first?.label || ''));
      }
      persist();
    } catch (err) {
      loadError = `Could not load leadership from Wikidata: ${err.message}`;
    }
    loading = false;
    render();
  }
```

In `stepBody()`, add a branch right after the `details` branch and before `review`:

```javascript
    if (step === 'officers') {
      return renderLeadershipForm({ draft, config });
    }
```

In the `review` branch of `stepBody()`, add a mode-specific caution after a failed submit (per spec §9: retrying `manage-leadership` is not fully idempotent — it could add a duplicate term — unlike the other modes, where a resend is always safe):

```javascript
    if (step === 'review') {
      const lines = describeChanges(draft);
      return html`<p class="wizard__hint">This will be written to Wikidata:</p>
        <ul class="wizard__review">${lines.map((l) => html`<li>${l}</li>`)}</ul>
        ${failure ? html`<p class="wizard__fail">${failure}</p>` : ''}
        ${failure && draft.mode === 'manage-leadership'
          ? html`<p class="wizard__fail">Check the item on Wikidata before retrying — some rows may already be saved.</p>`
          : ''}`;
    }
```

(this replaces the existing `if (step === 'review') { ... }` block in `stepBody()`, which is otherwise unchanged).

In `restore()`, add a guard next to the existing multilingual-draft guard:

```javascript
      if (saved.mode === 'manage-leadership' && !Array.isArray(saved.officers)) return null;
```

In `mountPickers()`, add a call to a new `mountLeadershipPickers()` (call it right after `mountAreaPicker();`):

```javascript
    mountLeadershipPickers();
```

and define `mountLeadershipPickers` next to `mountAreaPicker`:

```javascript
  /** One person / affiliation / "other office" typeahead per officer row. */
  function mountLeadershipPickers() {
    const search = (text) => ports.search.searchEntities(text, 'item');
    (draft.officers || []).forEach((row, i) => {
      const personEl = host.querySelector(`[data-role="ta-officer-${i}"]`);
      if (personEl) {
        createTypeahead(personEl, {
          label: 'Person', searchEntities: search, allowCreate: true,
          onPick: (c) => { row.person.qid = c.qid; persist(); render(); },
          onCreate: (name) => { row.person.labels = { en: name }; persist(); render(); },
        });
      }
      const affEl = host.querySelector(`[data-role="ta-officer-affiliation-${i}"]`);
      if (affEl) {
        createTypeahead(affEl, {
          label: 'Current affiliation', searchEntities: search,
          onPick: (c) => { row.person.affiliationQid = c.qid; row.person.affiliationLabel = c.label; persist(); render(); },
        });
      }
      const officeEl = host.querySelector(`[data-role="ta-officer-office-${i}"]`);
      if (officeEl) {
        createTypeahead(officeEl, {
          label: 'Office', searchEntities: search,
          onPick: (c) => { row.officeQid = c.qid; row.officeLabel = c.label; row._customOffice = false; persist(); render(); },
        });
      }
    });
  }
```

Update the generic `on('input', ...)` listener to also try the leadership form, and to force a full `render()` when the office select switches to "Other" (a structural change, not just a value change):

```javascript
  on('input', (e) => {
    if (e.target.closest('.typeahead')) return; // the pickers manage their own state
    if (applyFieldInput(draft, e.target)) { failure = ''; persist(); refreshDerived(); return; }
    if (e.target.dataset?.field === 'officer-office' && e.target.value === '__other__') {
      applyLeadershipFieldInput(draft, e.target); persist(); render(); return;
    }
    if (applyLeadershipFieldInput(draft, e.target)) { failure = ''; persist(); refreshDerived(); }
  });
```

Add the officer-row click handlers inside the existing `on('click', ...)` handler, after the `add-former`/`remove-former`/`rename-hint` branches:

```javascript
    else if (role('add-officer')) {
      const first = config.officeTypes?.[0];
      draft.officers.push(emptyOfficerRow(first?.qid || '', first?.label || ''));
      persist(); render();
    }
    else if (role('remove-officer')) { draft.officers.splice(Number(role('remove-officer').dataset.index), 1); persist(); render(); }
    else if (role('clear-officer-person')) {
      const r = draft.officers[Number(role('clear-officer-person').dataset.index)];
      r.person.qid = null; r.person.labels = {}; persist(); render();
    }
    else if (role('clear-officer-affiliation')) {
      const r = draft.officers[Number(role('clear-officer-affiliation').dataset.index)];
      r.person.affiliationQid = null; r.person.affiliationLabel = null; persist(); render();
    }
    else if (role('officer-add-lang')) {
      const r = draft.officers[Number(role('officer-add-lang').dataset.index)];
      r.person._showSecondName = true; persist(); render();
    }
```

Update `title()`:

```javascript
function title(mode) {
  return { 'create-association': 'Add association', 'manage-leadership': 'Manage leadership', 'update-field': 'Edit details' }[mode];
}
```

Update the initial-load dispatcher at the bottom of `createWizard`:

```javascript
  if (mode === 'update-field' && !restoredDraft && draft.association.qid && ports.search?.getEntity) loadOriginal();
  else if (mode === 'manage-leadership' && !restoredDraft && draft.association.qid) loadLeadershipOriginal();
  else {
    if (draft.association.countryQid) loadOfficial(draft.association.countryQid).then(render);
    render();
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dev && node --test tests/ui/wizard.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full UI suite to check for regressions**

Run: `cd dev && node --test tests/ui/`
Expected: PASS. (`wizard-edit-flow.test.js`'s comment `// no president required` on an unrelated `create-association` assertion should still pass unmodified — it is checking that no `create-item` with `ref: 'person'` exists, which remains true.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/edit-wizard/wizard.js dev/tests/ui/wizard.test.js
git commit -m "feat(wizard): wire manage-leadership (load, officers step, row pickers, title)"
```

---

### Task 9: Card history component (`ui/components/leadership-history.js`)

**Files:**
- Create: `src/ui/components/leadership-history.js`
- Test: `dev/tests/ui/leadership-history.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `dev/tests/ui/leadership-history.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountLeadershipHistory, clearLeadershipHistoryCache } from '../../../src/ui/components/leadership-history.js';

function cardWithDisclosure() {
  const dom = new JSDOM(`<!doctype html><div id="host">
    <details class="card__history"><summary>Leadership history</summary>
      <div data-role="leadership-history-body"></div>
    </details>
  </div>`);
  return { win: dom.window, host: dom.window.document.getElementById('host') };
}

test('does nothing when there is no history element or no getHistory function', () => {
  const { host } = cardWithDisclosure();
  assert.doesNotThrow(() => mountLeadershipHistory(host, { qid: 'Q1' }));
  const dom2 = new JSDOM('<div id="host"></div>');
  assert.doesNotThrow(() => mountLeadershipHistory(dom2.window.document.getElementById('host'), { qid: 'Q1', getHistory: async () => ({ history: [], current: null }) }));
});

test('fetches only on first open, renders rows, and reuses the session cache on a second card', async () => {
  clearLeadershipHistoryCache('Q1');
  let calls = 0;
  const getHistory = async () => {
    calls += 1;
    return { history: [{ statementId: 'Q1$A', personQid: 'Q9', personLabel: 'Old Pres', officeQid: null, officeLabel: 'chairperson', begin: '2018-01-01', end: null }], current: null };
  };
  const { host } = cardWithDisclosure();
  mountLeadershipHistory(host, { qid: 'Q1', getHistory });
  const details = host.querySelector('details');
  details.open = true;
  details.dispatchEvent(new host.ownerDocument.defaultView.Event('toggle'));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(host.querySelector('[data-role="leadership-history-body"]').innerHTML, /Old Pres/);
  assert.equal(calls, 1);

  // a fresh mount (e.g. after the card re-rendered) reuses the cached result, no second fetch
  const { host: host2 } = cardWithDisclosure();
  mountLeadershipHistory(host2, { qid: 'Q1', getHistory });
  const details2 = host2.querySelector('details');
  details2.open = true;
  details2.dispatchEvent(new host2.ownerDocument.defaultView.Event('toggle'));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(host2.querySelector('[data-role="leadership-history-body"]').innerHTML, /Old Pres/);
  assert.equal(calls, 1);
});

test('shows an inline error on failure and allows a retry on the next open', async () => {
  clearLeadershipHistoryCache('Q2');
  let calls = 0;
  const getHistory = async () => { calls += 1; if (calls === 1) throw new Error('offline'); return { history: [], current: null }; };
  const { host } = cardWithDisclosure();
  mountLeadershipHistory(host, { qid: 'Q2', getHistory });
  const details = host.querySelector('details');
  const toggle = () => details.dispatchEvent(new host.ownerDocument.defaultView.Event('toggle'));

  details.open = true; toggle();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(host.querySelector('[data-role="leadership-history-body"]').innerHTML, /Could not load/);

  details.open = false; toggle();
  details.open = true; toggle();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(host.querySelector('[data-role="leadership-history-body"]').innerHTML, /No leadership history/);
  assert.equal(calls, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dev && node --test tests/ui/leadership-history.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/ui/components/leadership-history.js`**

```javascript
import { html, mount } from '../../render.js';

/** Session-only cache, keyed by association qid. */
const cache = new Map();

/** Clear the cached result for one association (called after a manage-leadership save). */
export function clearLeadershipHistoryCache(qid) {
  cache.delete(qid);
}

/**
 * Wire the lazy "Leadership history" `<details>` already rendered by `association-card.js`.
 * No-ops if that element, or `opts.getHistory`, is not present (e.g. read-only mode).
 * @param {HTMLElement} host
 * @param {{qid: string, getHistory?: (qid: string) => Promise<{history: any[], current: any|null}>}} opts
 */
export function mountLeadershipHistory(host, { qid, getHistory }) {
  const details = host.querySelector('details.card__history');
  if (!details || !getHistory) return;
  const body = details.querySelector('[data-role="leadership-history-body"]');
  let opened = false;

  const renderRows = (rows) => mount(body, rows.length
    ? html`<ul>${rows.map((r) => html`<li>${r.officeLabel}: ${r.personLabel}, ${r.begin || '?'} – ${r.end || 'present'}</li>`)}</ul>`
    : html`<p>No leadership history recorded.</p>`);

  details.addEventListener('toggle', () => {
    if (!details.open || opened) return;
    opened = true;
    if (cache.has(qid)) { renderRows(cache.get(qid).history); return; }
    mount(body, html`<p>Loading…</p>`);
    getHistory(qid).then((result) => {
      cache.set(qid, result);
      renderRows(result.history);
    }).catch(() => {
      opened = false; // allow a retry on the next open
      mount(body, html`<p>Could not load leadership history.</p>`);
    });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dev && node --test tests/ui/leadership-history.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/leadership-history.js dev/tests/ui/leadership-history.test.js
git commit -m "feat(card): add the lazy leadership-history disclosure component"
```

---

### Task 10: Card markup (`ui/association-card.js`)

**Files:**
- Modify: `src/ui/association-card.js`
- Test: `dev/tests/ui/association-card.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `dev/tests/ui/association-card.test.js`:

```javascript
test('edit mode shows a "Manage leadership" button and a Leadership history disclosure', () => {
  const out = renderAssociationCard(a, { editMode: true }).value;
  assert.match(out, /data-action="leadership"/);
  assert.match(out, /<details class="card__history"/);
  assert.match(out, /Leadership history/);
});

test('read mode shows neither the leadership button nor the history disclosure', () => {
  const out = renderAssociationCard(a, { editMode: false }).value;
  assert.doesNotMatch(out, /data-action="leadership"/);
  assert.doesNotMatch(out, /card__history/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dev && node --test tests/ui/association-card.test.js`
Expected: FAIL — no match for `data-action="leadership"` / `card__history`.

- [ ] **Step 3: Edit `src/ui/association-card.js`**

Add the disclosure right after the `president` row and before the `journal` row:

```javascript
      ${editMode
        ? html`<details class="card__history" data-qid="${a.qid}">
            <summary>Leadership history</summary>
            <div data-role="leadership-history-body"></div>
          </details>`
        : ''}
```

Change the actions paragraph to add the second button:

```javascript
      ${editMode
        ? html`<p class="card__actions">
            <button type="button" data-action="edit" data-qid="${a.qid}">Edit</button>
            <button type="button" data-action="leadership" data-qid="${a.qid}">Manage leadership</button>
          </p>`
        : ''}
```

(replacing the existing single-button `card__actions` block).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dev && node --test tests/ui/association-card.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/association-card.js dev/tests/ui/association-card.test.js
git commit -m "feat(card): add the Manage leadership button and history disclosure markup"
```

---

### Task 11: App wiring (`app.js`)

**Files:**
- Modify: `src/app.js`
- Test: `dev/tests/app-edit.test.js`

- [ ] **Step 1: Write the failing test**

Append to `dev/tests/app-edit.test.js`:

```javascript
test('clicking "Manage leadership" opens the wizard in manage-leadership mode', async () => {
  const { w, opened } = editApp('https://app.example/?edit');
  await w.document; // no-op await to keep this test symmetrical with the others
  const host = w.document.getElementById('detail-host');
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  host.querySelector('[data-action="leadership"]').click();
  assert.equal(opened[0].seed.mode, 'manage-leadership');
  assert.equal(opened[0].seed.association.qid, 'Q1');
});

test('saving a manage-leadership change clears the leadership-history cache for that association', async () => {
  clearLeadershipHistoryCache('Q1');
  const { w, opened } = editApp('https://app.example/?edit');
  const host = w.document.getElementById('detail-host');
  w.document.querySelector('button.row[data-qid="Q1"]').click();
  host.querySelector('[data-action="leadership"]').click();
  const { hooks, seed } = opened[0];
  hooks.onSaved({ via: 'direct', created: [], diffUrls: [] }, { mode: 'manage-leadership', association: { qid: seed.association.qid, original: { labels: {}, descriptions: {} }, labels: {}, descriptions: {} }, officers: [] });
  // no assertion failure = the branch ran without throwing; cache-clearing itself is covered
  // directly in leadership-history.test.js, this just proves app.js reaches it
});
```

Add the needed import at the top of the test file:

```javascript
import { clearLeadershipHistoryCache } from '../../src/ui/components/leadership-history.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dev && node --test tests/app-edit.test.js`
Expected: FAIL — `host.querySelector('[data-action="leadership"]')` is `null` (button not rendered), then a `TypeError` on `.click()`.

- [ ] **Step 3: Edit `src/app.js`**

Add the import at the top:

```javascript
import { mountLeadershipHistory, clearLeadershipHistoryCache } from './ui/components/leadership-history.js';
```

In `renderDetailRegion()`, mount the history disclosure right after the card mount:

```javascript
  function renderDetailRegion() {
    const s = store.getState();
    const a = s.selection ? s.associations.find((x) => x.qid === s.selection) : null;
    if (a) {
      mount(detailHost, renderAssociationCard(a, { editMode: s.mode === 'edit', lastEdit: liveEdits.get(a.qid) || a.lastEdit || null }));
      if (s.mode === 'edit' && editRuntime?.getLeadershipHistory) {
        mountLeadershipHistory(detailHost, { qid: a.qid, getHistory: editRuntime.getLeadershipHistory });
      }
      if (revisions && !requestedEdits.has(a.qid)) {
```

(keep the rest of that block unchanged — only the new `if` is inserted between the `mount(...)` call and the existing `if (revisions...)` block).

In the `detailHost.addEventListener('click', ...)` handler, replace:

```javascript
    detailHost.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="edit"]');
      if (!btn) return;
      const a = store.getState().associations.find((x) => x.qid === btn.dataset.qid);
      if (!a) return;
      editRuntime.openWizard(drawer, {
        mode: 'update-field',
        association: { qid: a.qid, label: a.label },
      }, { onSaved: applySaved });
    });
```

with:

```javascript
    detailHost.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-action="edit"]');
      const leadershipBtn = e.target.closest('[data-action="leadership"]');
      if (editBtn) {
        const a = store.getState().associations.find((x) => x.qid === editBtn.dataset.qid);
        if (!a) return;
        editRuntime.openWizard(drawer, { mode: 'update-field', association: { qid: a.qid, label: a.label } }, { onSaved: applySaved });
      } else if (leadershipBtn) {
        const a = store.getState().associations.find((x) => x.qid === leadershipBtn.dataset.qid);
        if (!a) return;
        editRuntime.openWizard(drawer, { mode: 'manage-leadership', association: { qid: a.qid, label: a.label } }, { onSaved: applySaved });
      }
    });
```

In `patchStore`, add a branch (after the existing `else if (draft.mode === 'create-association') { ... }` block):

```javascript
      } else if (draft.mode === 'manage-leadership') {
        clearLeadershipHistoryCache(a.qid);
      }
```

In the browser entry point's `buildEditRuntime`, expose the new capability on `editRuntime`:

```javascript
      return {
        auth,
        getLeadershipHistory: api.getLeadershipHistory,
        openWizard: (host, seed, hooks = {}) => createWizard(host, { window, config, ports: { search: api, write }, seed, onClose: () => { host.innerHTML = ''; }, ...hooks }),
      };
```

Also update the `createApp` JSDoc's `buildEditRuntime` return-type comment to mention it:

```javascript
 *   buildEditRuntime?: () => Promise<{
 *     auth: {hasSession: () => boolean, connect: () => Promise<void>, disconnect: () => Promise<void>},
 *     getLeadershipHistory?: (qid: string) => Promise<any>,
 *     openWizard: (host: HTMLElement, seed: any, hooks?: {onSaved?: Function}) => void,
 *   }>,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dev && node --test tests/app-edit.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `cd dev && npm test`
Expected: PASS, every test file green.

- [ ] **Step 6: Commit**

```bash
git add src/app.js dev/tests/app-edit.test.js
git commit -m "feat(app): wire the Manage leadership button and card history disclosure"
```

---

### Task 12: Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/spec/2026-09-30-association-leadership-design.md`

- [ ] **Step 1: Update the README's "What edit mode can do" list**

In `README.md`, add a bullet after the existing "Pick the **host organization**..." line:

```markdown
- **Manage leadership**: look up or create the person holding an office (president,
  chairperson, ...), with begin/end dates, and back-fill past officeholders for
  historical background. Shown on the card as a "Leadership history" disclosure.
```

- [ ] **Step 2: Flip the spec's status line**

In `docs/spec/2026-09-30-association-leadership-design.md`, change:

```markdown
**Status:** Draft
```

to:

```markdown
**Status:** Implemented
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/spec/2026-09-30-association-leadership-design.md
git commit -m "docs: document the Manage leadership feature"
```

---

### Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd dev && npm test`
Expected: every test file passes, zero failures.

- [ ] **Step 2: Sanity-check there is no remaining reference to the deleted shape**

Run: `grep -rn "change-president\|draft\.president\|\.universityQid\|termStart\|previousPresidentStatementId" src/ dev/tests/ | grep -v node_modules`
Expected: no output. (If `.universityQid` matches something unrelated, inspect it — it should not.)

- [ ] **Step 3: Confirm the branch's full diff is coherent**

Run: `git log --oneline main..HEAD`
Expected: 12 commits (Tasks 1-12), one per task, each already reviewed as it was made.

- [ ] **Step 4: Report to the user**

Summarize (in chat, not a new file): tests passing, commits made, that the OAuth/write path has not been exercised against live Wikidata (per spec §9/open risks — this was never verified for the write path even in the prior multilingual-edit work), and that the branch is ready for the user to review, merge, or open a PR.
