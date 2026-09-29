import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssociation } from '../../../src/core/model.js';
import { renderAssociationCard } from '../../../src/ui/association-card.js';

const a = {
  ...emptyAssociation('Q1'),
  label: 'German Association for Law & Society',
  countryCode: 'DE',
  countryLabel: 'Germany',
  seatLabel: 'Berlin',
  website: 'https://rechtssoziologie.info',
  email: 'info@rechtssoziologie.info',
  president: { qid: 'Q5', label: 'Eva Kocher', url: 'https://example.org/kocher' },
  leadUniLabel: 'Europa-Universität Viadrina',
  journal: null,
};

test('renders the label, seat, website, email, president and university', () => {
  const out = renderAssociationCard(a, { editMode: false }).value;
  assert.match(out, /German Association for Law &amp; Society/);
  assert.match(out, /Berlin/);
  assert.match(out, /rechtssoziologie\.info/);
  assert.match(out, /Eva Kocher/);
  assert.match(out, /Europa-Universität Viadrina/);
});

test('shows neither the "watch" link nor an Edit button in read-only mode', () => {
  const out = renderAssociationCard(a, { editMode: false, lastEdit }).value;
  assert.doesNotMatch(out, />watch</);
  assert.doesNotMatch(out, /data-action="edit"/);
});

test('shows a "watch" link after "history" in the footer and an Edit button when editMode is true', () => {
  const out = renderAssociationCard(a, { editMode: true, lastEdit }).value;
  assert.match(out, />history<\/a>\s*·\s*<a class="card__notify"[^>]*>watch<\/a>/);
  assert.doesNotMatch(out, /Notify me of changes/);
  assert.match(out, /data-action="edit"/);
});

test('renders a journal line when present, "—" when absent', () => {
  assert.match(renderAssociationCard(a, {}).value, /journal:\s*—/);
  const withJournal = { ...a, journal: { qid: 'Q9', label: 'ZfRS', url: 'https://z', issn: null } };
  assert.match(renderAssociationCard(withJournal, {}).value, /ZfRS/);
});

test('a javascript: URL in website is neutralised to #', () => {
  const bad = { ...a, website: 'javascript:alert(1)' };
  const out = renderAssociationCard(bad, {}).value;
  assert.doesNotMatch(out, /javascript:alert/);
});

const lastEdit = { revid: 2550864341, user: 'Panyasan', anon: false, userHidden: false, timestamp: '2026-09-29T12:50:46Z', comment: 'update names (de)' };

test('shows who last edited the item, linked to the user page, the revision and the history', () => {
  const out = renderAssociationCard(a, { lastEdit }).value;
  assert.match(out, /Last edited by/);
  assert.match(out, /<a href="https:\/\/www\.wikidata\.org\/wiki\/User:Panyasan"[^>]*>Panyasan<\/a>/);
  assert.match(out, /href="https:\/\/www\.wikidata\.org\/w\/index\.php\?title=Q1&amp;oldid=2550864341"[^>]*title="update names \(de\)">2026-09-29<\/a>/);
  assert.match(out, /action=history"[^>]*>history<\/a>/);
});

test('shows no last-edit line until a revision is known, and never leaks a hidden username', () => {
  assert.doesNotMatch(renderAssociationCard(a, {}).value, /Last edited/);
  const hidden = renderAssociationCard(a, { lastEdit: { ...lastEdit, userHidden: true, user: '' } }).value;
  assert.match(hidden, /\(username hidden\)/);
  assert.doesNotMatch(hidden, /User:/);
});

test('an editor name is escaped', () => {
  const out = renderAssociationCard(a, { lastEdit: { ...lastEdit, user: '<img src=x onerror=alert(1)>' } }).value;
  assert.doesNotMatch(out, /<img/);
});
