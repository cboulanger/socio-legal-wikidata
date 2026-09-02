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

test('shows a "Notify me of changes" link and NO Edit button in read-only mode', () => {
  const out = renderAssociationCard(a, { editMode: false }).value;
  assert.match(out, /Notify me of changes/);
  assert.doesNotMatch(out, /data-action="edit"/);
});

test('shows an Edit button when editMode is true', () => {
  const out = renderAssociationCard(a, { editMode: true }).value;
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
