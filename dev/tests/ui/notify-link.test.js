import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchlistUrl, historyFeedUrl, relatedChangesFeedUrl } from '../../../src/ui/components/notify-link.js';

test('watchlistUrl points at the item with action=watch', () => {
  assert.equal(watchlistUrl('Q42'), 'https://www.wikidata.org/w/index.php?title=Q42&action=watch');
});

test('historyFeedUrl is an atom feed of the item history', () => {
  assert.equal(historyFeedUrl('Q42'), 'https://www.wikidata.org/w/index.php?title=Q42&action=history&feed=atom');
});

test('relatedChangesFeedUrl is an atom feed of related changes', () => {
  assert.equal(relatedChangesFeedUrl('Q42'), 'https://www.wikidata.org/w/index.php?title=Special:RecentChangesLinked&target=Q42&feed=atom');
});
