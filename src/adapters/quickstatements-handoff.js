import { serialize } from '../core/quickstatements.js';

/** QS "#/v1=" expects TAB -> %09 and line break -> %7C (pipe). */
export function encodePayload(text) {
  return text
    .replace(/\n+$/, '')
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
