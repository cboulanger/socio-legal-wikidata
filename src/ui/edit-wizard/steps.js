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
