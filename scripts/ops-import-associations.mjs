#!/usr/bin/env node
// One-time importer for runbook Task C2 (docs/plans/2026-09-02-operations-and-data-runbook.md):
// loads data/socio-legal-associations.quickstatements.txt (QuickStatements v1 syntax,
// TAB-separated) and creates/updates the corresponding items on live Wikidata via the
// Wikibase REST API v1 — mirroring exactly the request shapes already implemented (and
// live-tested against the Wikidata Sandbox in Task A1 Step 4) in
// src/adapters/wikibase-api.js, just driven by a bot-password session instead of an
// OAuth token.
//
// Usage:
//   node scripts/ops-import-associations.mjs --dry-run   # parse + print, no writes
//   node scripts/ops-import-associations.mjs             # parse + write for real
//
// Credentials: WIKIDATA_BOT_USERNAME / WIKIDATA_BOT_PASSWORD from .env (gitignored).
// Output: data/qids.json (association label -> QID mapping) plus a full log to stdout.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const IMPORT_FILE = 'data/socio-legal-associations.quickstatements.txt';
const QIDS_OUT = 'data/qids.json';
const REST = 'https://www.wikidata.org/w/rest.php/wikibase/v1';
const API = 'https://www.wikidata.org/w/api.php';
const UA = 'socio-legal-wikidata-ops-import/1.0 (https://github.com/cboulanger/socio-legal-wikidata)';
const SUMMARY = 'Import via socio-legal-wikidata project (see https://github.com/cboulanger/socio-legal-wikidata)';
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 400; // polite pacing between write calls

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- .env loading (same as ops-sandbox-write-test.mjs) ----------
function loadEnv(path = '.env') {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

// ---------- cookie-jar HTTP helpers (same pattern as ops-sandbox-write-test.mjs) ----------
function extractCookies(res, jar) {
  const raw =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie')]
        : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function actionApi(jar, params) {
  const url = new URL(API);
  url.search = new URLSearchParams({ format: 'json', ...params }).toString();
  const res = await fetch(url, { headers: { Cookie: cookieHeader(jar), 'User-Agent': UA } });
  extractCookies(res, jar);
  return res.json();
}
async function actionApiPost(jar, params) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Cookie: cookieHeader(jar), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ format: 'json', ...params }),
  });
  extractCookies(res, jar);
  return res.json();
}
async function login(username, password) {
  const jar = new Map();
  const tokenResp = await actionApi(jar, { action: 'query', meta: 'tokens', type: 'login' });
  const logintoken = tokenResp.query.tokens.logintoken;
  const loginResp = await actionApiPost(jar, { action: 'login', lgname: username, lgpassword: password, lgtoken: logintoken });
  if (loginResp.login?.result !== 'Success') {
    throw new Error(`Login failed: ${loginResp.login?.result ?? JSON.stringify(loginResp)}`);
  }
  return jar;
}
async function restPost(jar, path, body) {
  const res = await fetch(`${REST}${path}`, {
    method: 'POST',
    headers: { Cookie: cookieHeader(jar), 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
  });
  extractCookies(res, jar);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}
async function searchEntities(text) {
  const url = `${API}?action=wbsearchentities&format=json&type=item&language=en&limit=5&search=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const j = await res.json();
  return j.search || [];
}

/** Normalize a raw MediaWiki datavalue "value" (Action API shape) into a plain string signature. */
function signatureOfDatavalue(dv) {
  if (dv == null) return null;
  if (typeof dv === 'string') return dv;
  if (dv.id) return dv.id; // wikibase-entityid
  if (dv.time) return `${dv.time}|${dv.precision}`; // time
  return JSON.stringify(dv);
}

/** Normalize a REST-shaped "value" object (what we're about to send) into the same signature space. */
function signatureOfRestValue(value) {
  if (value.type !== 'value') return null;
  const content = value.content;
  if (typeof content === 'string') return content; // item QID, or plain string/url
  if (content.time) return `${content.time}|${content.precision}`; // time
  return JSON.stringify(content);
}

/** Read-only: current claim value signatures for one item, as { [prop]: Set<string> }. */
async function getExistingClaimValues(qid) {
  const url = `${API}?action=wbgetentities&ids=${qid}&props=claims&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const j = await res.json();
  const claims = j.entities?.[qid]?.claims || {};
  const out = {};
  for (const [prop, statements] of Object.entries(claims)) {
    out[prop] = new Set(statements.map((s) => signatureOfDatavalue(s.mainsnak?.datavalue?.value)));
  }
  return out;
}

/** Does `value` (a REST "value" object) already exist among an item's current claims for `prop`? */
function valueAlreadyPresent(existing, prop, value) {
  const set = existing[prop];
  if (!set) return false;
  const sig = signatureOfRestValue(value);
  return sig !== null && set.has(sig);
}

// ---------- value builders (mirrors src/adapters/wikibase-api.js's restValue) ----------
function itemValue(qid) {
  return { type: 'value', content: qid };
}
function timeValue(isoDatePart, precision) {
  return {
    type: 'value',
    content: { time: `+${isoDatePart}T00:00:00Z`, precision, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' },
  };
}
function stringValue(s) {
  return { type: 'value', content: s };
}

// Properties whose Wikidata datatype is "url" but whose QuickStatements source value
// is a bare address that needs a URI scheme prefixed before the REST API will accept
// it (confirmed live: P968 rejects a bare email with "invalid-value" at content —
// SPARQL shows existing P968 values across Wikidata are always "mailto:..." URIs).
const MAILTO_PROPERTIES = new Set(['P968']);

/** Parse one QuickStatements v1 value cell into a REST "value" object. */
function parseValue(raw, prop) {
  if (/^\+\d{4}-\d{2}-\d{2}T00:00:00Z\/\d+$/.test(raw)) {
    const [, datePart, precision] = /^\+(\d{4}-\d{2}-\d{2})T00:00:00Z\/(\d+)$/.exec(raw);
    return timeValue(datePart, Number(precision));
  }
  if (/^Q\d+$/.test(raw)) return itemValue(raw);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    let value = raw.slice(1, -1);
    if (MAILTO_PROPERTIES.has(prop) && !value.startsWith('mailto:')) value = `mailto:${value}`;
    return stringValue(value);
  }
  throw new Error(`Unrecognised QuickStatements value: ${raw}`);
}

// ---------- QuickStatements v1 parser for this file's grammar (CREATE/LAST + existing-QID blocks) ----------
function parseBlocks(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const blocks = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }
    const [subject, prop, value] = line.split('\t');
    if (subject === 'CREATE') {
      if (current) blocks.push(current);
      current = { kind: 'create', labels: {}, descriptions: {}, statements: {} };
      continue;
    }
    if (!current) {
      current = { kind: 'existing', qid: subject, statements: {} };
    }
    if (prop === 'Len') current.labels.en = value.slice(1, -1);
    else if (prop === 'Den') current.descriptions.en = value.slice(1, -1);
    else {
      (current.statements[prop] ||= []).push(parseValue(value, prop));
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const username = env.WIKIDATA_BOT_USERNAME;
  const password = env.WIKIDATA_BOT_PASSWORD;
  if (!username || !password) {
    console.error('Missing WIKIDATA_BOT_USERNAME / WIKIDATA_BOT_PASSWORD in .env');
    process.exit(1);
  }

  const text = readFileSync(IMPORT_FILE, 'utf8');
  const blocks = parseBlocks(text);
  const createBlocks = blocks.filter((b) => b.kind === 'create');
  const existingBlocks = blocks.filter((b) => b.kind === 'existing');
  console.log(`Parsed ${blocks.length} blocks: ${createBlocks.length} new items, ${existingBlocks.length} existing-item updates.\n`);

  if (DRY_RUN) {
    for (const b of blocks) {
      if (b.kind === 'create') {
        console.log(`CREATE  "${b.labels.en}"  props: ${Object.keys(b.statements).join(', ')}`);
      } else {
        console.log(`UPDATE  ${b.qid}  props: ${Object.keys(b.statements).join(', ')}`);
      }
    }
    console.log('\nDry run only — no login, no writes.');
    return;
  }

  console.log(`Logging in as ${username.replace(/@.*/, '@***')} ...`);
  const jar = await login(username, password);
  console.log('Login OK.\n');

  const results = existsSync(QIDS_OUT) ? JSON.parse(readFileSync(QIDS_OUT, 'utf8')) : {};
  const failures = [];

  /** Add only the statements not already present on `qid`; returns nothing, records failures. */
  async function addMissingStatements(qid, statements, label) {
    const existing = await getExistingClaimValues(qid);
    for (const [prop, values] of Object.entries(statements)) {
      for (const value of values) {
        if (valueAlreadyPresent(existing, prop, value)) {
          console.log(`  (already has ${prop}=${JSON.stringify(value.content)} on ${qid}, skipping)`);
          continue;
        }
        try {
          const { status, body } = await restPost(jar, `/entities/items/${qid}/statements`, {
            statement: { property: { id: prop }, value },
            comment: SUMMARY,
          });
          if (status !== 201) throw new Error(`HTTP ${status}: ${JSON.stringify(body)}`);
          console.log(`UPDATED ${qid} +${prop}${label ? ` (${label})` : ''}`);
        } catch (err) {
          console.error(`FAILED to add ${prop} to ${qid}: ${err.message}`);
          failures.push({ qid, prop, error: err.message });
        }
        await sleep(DELAY_MS);
      }
    }
  }

  for (const b of createBlocks) {
    const label = b.labels.en;
    if (results[label]) {
      console.log(`SKIP "${label}" — already imported as ${results[label]} (from ${QIDS_OUT}).`);
      continue;
    }
    try {
      // Duplicate guard: if an item with this exact label already exists (created by
      // someone else, or missed by the Task C1 pre-flight), do NOT create a second one
      // — route the statements onto the existing item instead. (A prior run of this
      // script warned-but-created-anyway here and produced one real duplicate,
      // Q141260086, since merged into the pre-existing Q88087154 — this replaces that
      // unsafe behavior.)
      const matches = await searchEntities(label);
      const exact = matches.find((m) => m.label === label);
      if (exact) {
        console.warn(`  ! "${label}" already exists as ${exact.id} — adding statements there instead of creating a duplicate.`);
        await addMissingStatements(exact.id, b.statements, label);
        results[label] = exact.id;
        continue;
      }

      const item = { labels: b.labels, descriptions: b.descriptions, statements: {} };
      for (const [prop, values] of Object.entries(b.statements)) {
        item.statements[prop] = values.map((value) => ({ property: { id: prop }, value }));
      }
      const { status, body } = await restPost(jar, '/entities/items', { item, comment: SUMMARY });
      if (status !== 201) throw new Error(`HTTP ${status}: ${JSON.stringify(body)}`);
      results[label] = body.id;
      console.log(`CREATED "${label}" -> ${body.id}`);
    } catch (err) {
      console.error(`FAILED to create "${label}": ${err.message}`);
      failures.push({ label, error: err.message });
    }
    await sleep(DELAY_MS);
    writeFileSync(QIDS_OUT, JSON.stringify(results, null, 2) + '\n'); // persist after every item, not just at the end
  }

  for (const b of existingBlocks) {
    await addMissingStatements(b.qid, b.statements);
    results[b.qid] = b.qid;
  }

  writeFileSync(QIDS_OUT, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nWrote ${QIDS_OUT} (${Object.keys(results).length} entries).`);

  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.log(' ', JSON.stringify(f));
    process.exitCode = 1;
  } else {
    console.log('\nAll blocks succeeded.');
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
