#!/usr/bin/env node
// Refresh data/snapshot.json from the live query service.
// Usage: node scripts/refresh-snapshot.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { queryDirectory } from '../src/adapters/sparql-client.js';

/** @param {any[]} associations @param {() => Date} [now] */
export function buildSnapshot(associations, now = () => new Date()) {
  return { generatedAt: now().toISOString().slice(0, 10), associations };
}

// Wikimedia's query service 403s any request without a descriptive User-Agent (its
// documented https://meta.wikimedia.org/wiki/User-Agent_policy) — confirmed live:
// Node's default fetch UA gets a 403, the same request with this header gets 200.
// A real browser sends its own UA and is unaffected; this wrapper is only used here,
// server-side (this script and the scheduled snapshot.yml workflow both run in Node),
// never on the app's live in-browser query path.
const SNAPSHOT_BOT_UA = 'socio-legal-wikidata-snapshot-bot/1.0 (https://github.com/cboulanger/socio-legal-wikidata)';
const fetchWithUa = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, 'User-Agent': SNAPSHOT_BOT_UA } });

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = JSON.parse(await readFile('config.json', 'utf8'));
  const associations = await queryDirectory({ fetch: fetchWithUa, endpoint: cfg.sparqlEndpoint, cfg });
  const snap = buildSnapshot(associations);
  await writeFile('data/snapshot.json', JSON.stringify(snap, null, 2) + '\n');
  console.log(`wrote data/snapshot.json (${associations.length} associations, ${snap.generatedAt})`);
}
