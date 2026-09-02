#!/usr/bin/env node
// One-off fix: merge an accidentally-created duplicate item into the pre-existing one,
// found during runbook Task C2's import run (scripts/ops-import-associations.mjs).
//
// Usage: node scripts/ops-merge-duplicate.mjs <fromQid> <toQid>
//   Merges fromQid (the accidental duplicate, created by us) into toQid (the
//   pre-existing item), via the Action API's wbmergeitems.

import { readFileSync, existsSync } from 'node:fs';

const API = 'https://www.wikidata.org/w/api.php';
const UA = 'socio-legal-wikidata-ops-import/1.0 (https://github.com/cboulanger/socio-legal-wikidata)';

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
  const t = await actionApi(jar, { action: 'query', meta: 'tokens', type: 'login' });
  const lr = await actionApiPost(jar, { action: 'login', lgname: username, lgpassword: password, lgtoken: t.query.tokens.logintoken });
  if (lr.login?.result !== 'Success') throw new Error('login failed: ' + JSON.stringify(lr));
  return jar;
}

async function main() {
  const [fromid, toid] = process.argv.slice(2);
  if (!fromid || !toid) {
    console.error('Usage: node scripts/ops-merge-duplicate.mjs <fromQid> <toQid>');
    process.exit(1);
  }
  const env = { ...loadEnv(), ...process.env };
  const jar = await login(env.WIKIDATA_BOT_USERNAME, env.WIKIDATA_BOT_PASSWORD);
  const csrf = await actionApi(jar, { action: 'query', meta: 'tokens', type: 'csrf' });
  const token = csrf.query.tokens.csrftoken;
  const res = await actionApiPost(jar, {
    action: 'wbmergeitems',
    fromid,
    toid,
    token,
    summary: 'Merge accidental duplicate created by socio-legal-wikidata import script',
  });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
