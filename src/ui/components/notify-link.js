const BASE = 'https://www.wikidata.org/w/index.php';

/** @param {string} qid */
export function watchlistUrl(qid) {
  return `${BASE}?title=${qid}&action=watch`;
}

/** @param {string} qid */
export function historyFeedUrl(qid) {
  return `${BASE}?title=${qid}&action=history&feed=atom`;
}

/** @param {string} qid */
export function relatedChangesFeedUrl(qid) {
  return `${BASE}?title=Special:RecentChangesLinked&target=${qid}&feed=atom`;
}
