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
  details.open = true; // jsdom (like a real browser) fires a native 'toggle' event from this setter
  await new Promise((r) => setTimeout(r, 0));
  assert.match(host.querySelector('[data-role="leadership-history-body"]').innerHTML, /Old Pres/);
  assert.equal(calls, 1);

  // a fresh mount (e.g. after the card re-rendered) reuses the cached result, no second fetch
  const { host: host2 } = cardWithDisclosure();
  mountLeadershipHistory(host2, { qid: 'Q1', getHistory });
  const details2 = host2.querySelector('details');
  details2.open = true;
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

  details.open = true;
  await new Promise((r) => setTimeout(r, 0));
  assert.match(host.querySelector('[data-role="leadership-history-body"]').innerHTML, /Could not load/);

  details.open = false;
  await new Promise((r) => setTimeout(r, 0));
  details.open = true;
  await new Promise((r) => setTimeout(r, 0));
  assert.match(host.querySelector('[data-role="leadership-history-body"]').innerHTML, /No leadership history/);
  assert.equal(calls, 2);
});
