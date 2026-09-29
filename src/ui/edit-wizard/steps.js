import { looksPersonal } from '../../core/email-guard.js';
import { cleanTerms, changedStatements, hasTermChanges, hasScopeChanges, validateTerms } from '../../core/draft.js';

/** @type {Object<import('../../core/draft.js').DirectoryDraft['mode'], string[]>} */
export const STEP_ORDER = {
  // place comes before details: the country decides which national language is suggested
  'create-association': ['identify', 'place', 'details', 'review'],
  'change-president': ['identify', 'people', 'review'],
  'update-field': ['details', 'review'],
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
    if (!a.qid && !a.identifyName && Object.keys(cleanTerms(a.labels)).length === 0) e.push('choose or name the association');
  }

  if (step === 'place') {
    if (!a.seatQid && !a.countryQid) e.push('set a fixed seat or a country');
  }

  if (step === 'details') {
    const changed = changedStatements(a);
    const statementChanged = !!(changed.website || changed.email || hasScopeChanges(a));
    if (d.mode === 'create-association') {
      if (!a.classQid) e.push('pick the association type');
      if (!a.fieldQid) e.push('the field of work is required');
      if (Object.keys(cleanTerms(a.labels)).length === 0) e.push('give the association a name in at least one language');
      if (!a.referenceUrl) e.push('a reference URL is required');
    }
    if (d.mode === 'update-field') {
      if (!hasTermChanges(a) && !statementChanged) e.push('change at least one field');
      if (statementChanged && !a.referenceUrl) e.push('a reference URL is required');
    }
    if (a.email && looksPersonal(a.email) && !a.emailConfirmedShared && (d.mode === 'create-association' || changed.email)) {
      e.push('this e-mail looks personal — confirm it is a shared role address, or replace it');
    }
    e.push(...validateTerms(a));
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
