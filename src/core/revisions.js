const WIKI = 'https://www.wikidata.org';

/**
 * @typedef {Object} LastEdit
 * @property {number} revid
 * @property {string} user          // '' when the username is hidden
 * @property {boolean} anon         // an IP editor
 * @property {boolean} userHidden
 * @property {string} timestamp     // ISO 8601, UTC
 * @property {string} comment
 */

/** Link to one specific revision of an item. */
export const revisionUrl = (qid, revid) => `${WIKI}/w/index.php?title=${encodeURIComponent(qid)}&oldid=${revid}`;

/** Link to an item's edit history. */
export const historyUrl = (qid) => `${WIKI}/w/index.php?title=${encodeURIComponent(qid)}&action=history`;

/** Link to the editor's user page (or, for an IP editor, their contributions). */
export function userUrl(edit) {
  const name = encodeURIComponent(edit.user.replace(/ /g, '_'));
  return edit.anon ? `${WIKI}/wiki/Special:Contributions/${name}` : `${WIKI}/wiki/User:${name}`;
}

/** @param {any} rev one entry of an Action API `revisions` array @returns {LastEdit|null} */
function toLastEdit(rev) {
  if (!rev || !Number.isInteger(rev.revid) || !rev.timestamp) return null;
  return {
    revid: rev.revid,
    user: typeof rev.user === 'string' ? rev.user : '',
    anon: !!rev.anon,
    userHidden: !!rev.userhidden,
    timestamp: rev.timestamp,
    comment: rev.commenthidden ? '' : rev.comment || '',
  };
}

/**
 * The latest revision of the first page in an Action API `prop=revisions` response (formatversion=2).
 * @param {any} json
 * @returns {LastEdit|null}
 */
export function parseLastRevision(json) {
  return toLastEdit(json?.query?.pages?.[0]?.revisions?.[0]);
}

/**
 * The latest revision of every page in a multi-title response, keyed by title (the QID).
 * Pages without a usable revision (missing, deleted) are left out.
 * @param {any} json
 * @returns {Object<string, LastEdit>}
 */
export function parseLastRevisions(json) {
  const out = {};
  for (const page of json?.query?.pages || []) {
    const edit = toLastEdit(page?.revisions?.[0]);
    if (page?.title && edit) out[page.title] = edit;
  }
  return out;
}
