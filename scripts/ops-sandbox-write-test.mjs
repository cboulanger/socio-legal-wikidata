#!/usr/bin/env node
// One-off ops diagnostic for runbook Task A1 Step 4 (docs/plans/2026-09-02-operations-and-data-runbook.md).
//
// Confirms two Wikibase REST API payload details that src/adapters/wikibase-api.js
// assumed without a live test, using a bot-password session on the public Wikidata
// Sandbox item (Q4115189):
//   1. Does a POST-statement request's top-level `comment` field name work as the
//      edit summary (vs. `bot`/`summary`/a query-string param)?
//   2. Does PATCH .../statements/{id} with a JSON-Patch "add" at /qualifiers/-
//      succeed against a statement that currently has NO qualifiers at all
//      (RFC 6902 append-to-absent-array semantics)?
//
// Every edit this script makes is reverted (deleted) before it exits, success or not.
//
// Credentials: reads WIKIDATA_BOT_USERNAME / WIKIDATA_BOT_PASSWORD from a local
// .env file (not committed — see .gitignore). Never logs the password.
//
// Usage: node scripts/ops-sandbox-write-test.mjs

import { readFileSync, existsSync } from 'node:fs';

const SANDBOX_QID = 'Q4115189';
const TEST_PROPERTY = 'P373'; // Commons category, string datatype — low-stakes
const API = 'https://www.wikidata.org/w/api.php';
const REST = 'https://www.wikidata.org/w/rest.php/wikibase/v1';
const UA = 'socio-legal-wikidata-ops-spike/1.0 (https://github.com/cboulanger/socio-legal-wikidata)';

function loadEnv(path = '.env') {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function extractCookies(res, jar) {
  // Node's fetch exposes multiple Set-Cookie headers via getSetCookie() (Node 18.14+/20+).
  const raw =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
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
  const res = await fetch(url, {
    method: 'GET',
    headers: { Cookie: cookieHeader(jar), 'User-Agent': UA },
  });
  extractCookies(res, jar);
  return res.json();
}

async function actionApiPost(jar, params) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(jar),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: new URLSearchParams({ format: 'json', ...params }),
  });
  extractCookies(res, jar);
  return res.json();
}

async function login(username, password) {
  const jar = new Map();
  const tokenResp = await actionApi(jar, { action: 'query', meta: 'tokens', type: 'login' });
  const logintoken = tokenResp.query.tokens.logintoken;
  const loginResp = await actionApiPost(jar, {
    action: 'login',
    lgname: username,
    lgpassword: password,
    lgtoken: logintoken,
  });
  if (loginResp.login?.result !== 'Success') {
    throw new Error(
      `Login failed: ${loginResp.login?.result ?? JSON.stringify(loginResp)} — check WIKIDATA_BOT_USERNAME is the full "User@BotName" form.`
    );
  }
  return jar;
}

async function restRequest(jar, method, path, body, extraHeaders = {}) {
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: {
      Cookie: cookieHeader(jar),
      'Content-Type': 'application/json',
      'User-Agent': UA,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
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

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const username = env.WIKIDATA_BOT_USERNAME;
  const password = env.WIKIDATA_BOT_PASSWORD;
  if (!username || !password) {
    console.error(
      'Missing WIKIDATA_BOT_USERNAME / WIKIDATA_BOT_PASSWORD.\n' +
        'Create a .env file (gitignored) with:\n' +
        '  WIKIDATA_BOT_USERNAME=YourWikidataUsername@your-bot-name\n' +
        '  WIKIDATA_BOT_PASSWORD=the-32-character-bot-password\n' +
        'Get one at https://www.wikidata.org/wiki/Special:BotPasswords (grants needed: ' +
        '"High-volume editing", "Edit existing pages", "Create, edit, and move pages").'
    );
    process.exit(1);
  }

  console.log(`Logging in as ${username.replace(/@.*/, '@***')} ...`);
  const jar = await login(username, password);
  console.log('Login OK.\n');

  const createdStatementIds = [];

  try {
    // --- Test 1: does the top-level "comment" field name work as edit summary? ---
    console.log(`Test 1: POST statement with a top-level "comment" field ...`);
    const addResp = await restRequest(jar, 'POST', `/entities/items/${SANDBOX_QID}/statements`, {
      statement: {
        property: { id: TEST_PROPERTY },
        value: { type: 'value', content: 'ops-spike-please-revert' },
      },
      comment: 'ops spike (Task A1 Step 4) — reverting immediately',
    });
    console.log(`  -> HTTP ${addResp.status}`);
    if (addResp.status === 200 || addResp.status === 201) {
      const id = addResp.body.id;
      createdStatementIds.push(id);
      console.log(`  -> statement created: ${id}`);
      console.log(`  RESULT: "comment" is the correct field name. ✅`);
    } else {
      console.log(`  RESULT: "comment" alone did NOT work as expected. Response body:`);
      console.log('  ', JSON.stringify(addResp.body));
    }

    // --- Test 2: PATCH add-qualifier on a statement with NO qualifiers at all ---
    if (createdStatementIds[0]) {
      console.log(`\nTest 2: PATCH /qualifiers/- on a statement with no qualifiers ...`);
      const patchResp = await restRequest(
        jar,
        'PATCH',
        `/entities/items/${SANDBOX_QID}/statements/${createdStatementIds[0]}`,
        [
          {
            op: 'add',
            path: '/qualifiers/-',
            value: { property: { id: 'P1545' }, value: { type: 'somevalue' } },
          },
        ],
        { 'Content-Type': 'application/json-patch+json' }
      );
      console.log(`  -> HTTP ${patchResp.status}`);
      if (patchResp.status === 200) {
        console.log(`  RESULT: append-to-absent-array via "/qualifiers/-" succeeds. ✅`);
      } else {
        console.log(`  RESULT: it did NOT succeed as assumed. Response body:`);
        console.log('  ', JSON.stringify(patchResp.body));
        console.log(
          '  -> likely fix needed in src/adapters/wikibase-api.js: initialize /qualifiers ' +
            'as an empty object/array first (e.g. "add" at "/qualifiers" with {} before ' +
            'appending), or use "replace" instead of "add" at "-".'
        );
      }
    } else {
      console.log('\nTest 2 skipped (Test 1 did not produce a statement to patch).');
    }
  } finally {
    // --- Always revert ---
    console.log('\nReverting...');
    for (const id of createdStatementIds) {
      const delResp = await restRequest(jar, 'DELETE', `/entities/items/${SANDBOX_QID}/statements/${id}`, {
        comment: 'ops spike cleanup — reverting test edit',
      });
      console.log(`  DELETE ${id} -> HTTP ${delResp.status}`);
    }
    console.log('Done.');
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
