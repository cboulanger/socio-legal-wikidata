import { looksPersonal } from '../../core/email-guard.js';
import { cleanTerms, changedStatements, hasTermChanges, hasScopeChanges, hasFormerNames, hasAbbreviations, changedParent, changedOperatingArea, validateTerms, validateFormerNames, validateDraftForChangeset, yearOrderError, wikipediaReferenceError } from '../../core/draft.js';

/** @type {Object<import('../../core/draft.js').DirectoryDraft['mode'], string[]>} */
export const STEP_ORDER = {
  // place comes before details: the country decides which national language is suggested
  'create-association': ['identify', 'place', 'details', 'review'],
  'manage-leadership': ['officers', 'review'],
  'update-field': ['details', 'review'],
  'create-journal': ['identify', 'details', 'review'],
  'update-journal': ['details', 'review'],
  'manage-journal-editors': ['editors', 'review'],
};

/**
 * @param {string} step
 * @param {import('../../core/draft.js').DirectoryDraft} d
 * @returns {string[]} error messages ([] means the step is valid)
 */
export function validateStep(step, d) {
  const a = d.association;
  const e = [];

  if (step === 'identify') {
    if (d.mode === 'create-journal') {
      const j = d.journalEntity;
      if (!j?.qid && !j?.identifyName && Object.keys(cleanTerms(j?.labels || {})).length === 0) e.push('choose or name the journal');
      return e;
    }
    if (!a.qid && !a.identifyName && Object.keys(cleanTerms(a.labels)).length === 0) e.push('choose or name the association');
  }

  if (step === 'place') {
    if (!a.seatQid && !a.countryQid) e.push('set a fixed seat or a country');
  }

  if (step === 'details') {
    if (d.mode === 'create-journal' || d.mode === 'update-journal') {
      return validateDraftForChangeset(d);
    }
    const changed = changedStatements(a);
    const statementChanged = !!(changed.website || changed.email || changed.inception || changed.closed || hasScopeChanges(a) || hasFormerNames(a) || hasAbbreviations(a) || !!changedParent(a) || !!changedOperatingArea(a));
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
    const assocYearErr = yearOrderError('association', a.inception, a.closed);
    if (assocYearErr) e.push(assocYearErr);
    const assocRefErr = wikipediaReferenceError('association.referenceUrl', a.referenceUrl);
    if (assocRefErr) e.push(assocRefErr);
    e.push(...validateTerms(a), ...validateFormerNames(a));
  }

  if (step === 'officers' || step === 'editors') {
    return validateDraftForChangeset(d);
  }

  return e;
}
