#!/usr/bin/env node
// Refresh data/snapshot.json from the live query service.
// Usage: node scripts/refresh-snapshot.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { queryDirectory } from '../src/adapters/sparql-client.js';
import { fetchLastEdits } from '../src/adapters/wikidata-revisions.js';

/** @param {any[]} associations @param {() => Date} [now] */
export function buildSnapshot(associations, now = () => new Date()) {
  return { generatedAt: now().toISOString().slice(0, 10), associations };
}

/**
 * Attach each association's latest Wikidata revision (who edited it last, and when), so the card
 * can show it without a live lookup when the app falls back to the snapshot. Items without a
 * revision in `edits` keep whatever the previous snapshot knew about them.
 * @param {any[]} associations
 * @param {Object<string, any>} edits        latest revision per QID
 * @param {any[]} [previous]                 associations of the previous snapshot
 */
export function attachLastEdits(associations, edits, previous = []) {
  const before = new Map(previous.map((a) => [a.qid, a.lastEdit]));
  return associations.map((a) => {
    const lastEdit = edits[a.qid] || before.get(a.qid);
    return lastEdit ? { ...a, lastEdit } : a;
  });
}

// Wikimedia's query service 403s any request without a descriptive User-Agent (its
// documented https://meta.wikimedia.org/wiki/User-Agent_policy) — confirmed live:
// Node's default fetch UA gets a 403, the same request with this header gets 200.
// A real browser sends its own UA and is unaffected; this wrapper is only used here,
// server-side (this script and the scheduled snapshot.yml workflow both run in Node),
// never on the app's live in-browser query path.
const SNAPSHOT_BOT_UA = 'socio-legal-wikidata-snapshot-bot/1.0 (https://github.com/cboulanger/socio-legal-wikidata)';
const fetchWithUa = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, 'User-Agent': SNAPSHOT_BOT_UA } });

// pathToFileURL, not `file://` + path: the latter never matches on Windows (backslashes, drive letter)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = JSON.parse(await readFile('config.json', 'utf8'));
  const found = await queryDirectory({ fetch: fetchWithUa, endpoint: cfg.sparqlEndpoint, cfg });
  const previous = await readFile('data/snapshot.json', 'utf8').then(JSON.parse, () => null);
  let edits = {};
  try {
    edits = await fetchLastEdits({ fetch: fetchWithUa, api: cfg.wikidataActionApi, qids: found.map((a) => a.qid) });
  } catch (err) {
    // last-edit info is a nice-to-have: keep the previous values rather than failing the whole refresh
    console.warn(`could not fetch last edits (${err.message}); keeping the previous ones`);
  }
  const associations = attachLastEdits(found, edits, previous?.associations);
  // Only rewrite when the data changed, so the timestamp alone never causes a commit.
  if (previous && JSON.stringify(previous.associations) === JSON.stringify(associations)) {
    console.log(`data/snapshot.json unchanged (${associations.length} associations)`);
  } else {
    const snap = buildSnapshot(associations);
    await writeFile('data/snapshot.json', JSON.stringify(snap, null, 2) + '\n');
    console.log(`wrote data/snapshot.json (${associations.length} associations, ${snap.generatedAt})`);
  }
}
