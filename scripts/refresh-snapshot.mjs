#!/usr/bin/env node
// Refresh data/snapshot.json from the live query service.
// Usage: node scripts/refresh-snapshot.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { queryDirectory } from '../src/adapters/sparql-client.js';

/** @param {any[]} associations @param {() => Date} [now] */
export function buildSnapshot(associations, now = () => new Date()) {
  return { generatedAt: now().toISOString().slice(0, 10), associations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = JSON.parse(await readFile('config.json', 'utf8'));
  const associations = await queryDirectory({ fetch, endpoint: cfg.sparqlEndpoint, cfg });
  const snap = buildSnapshot(associations);
  await writeFile('data/snapshot.json', JSON.stringify(snap, null, 2) + '\n');
  console.log(`wrote data/snapshot.json (${associations.length} associations, ${snap.generatedAt})`);
}
