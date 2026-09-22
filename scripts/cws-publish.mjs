/**
 * Uploads a packed extension zip to its Chrome Web Store item and submits it for review,
 * over the Web Store API v2 with a Google Cloud service account. No dependencies: the
 * service-account JWT is signed with node:crypto.
 *
 * Usage (CI): node scripts/cws-publish.mjs release/vgc-live-calc-X.Y.Z.zip
 * Env: CWS_SERVICE_ACCOUNT_JSON (the key file's contents), CWS_PUBLISHER_ID, CWS_ITEM_ID.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { CWS_SERVICE_ACCOUNT_JSON, CWS_PUBLISHER_ID, CWS_ITEM_ID } = process.env;
const zip = process.argv[2];
if (!zip || !CWS_SERVICE_ACCOUNT_JSON || !CWS_PUBLISHER_ID || !CWS_ITEM_ID) {
  console.error('usage: CWS_SERVICE_ACCOUNT_JSON=... CWS_PUBLISHER_ID=... CWS_ITEM_ID=... node scripts/cws-publish.mjs <zip>');
  process.exit(1);
}

const API = 'https://chromewebstore.googleapis.com';
const ITEM = `publishers/${CWS_PUBLISHER_ID}/items/${CWS_ITEM_ID}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** Service-account JWT exchanged for a one-hour access token (Google's OAuth 2.0 JWT bearer flow). */
async function accessToken() {
  let key;
  try {
    key = JSON.parse(CWS_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('CWS_SERVICE_ACCOUNT_JSON is not valid JSON'); // never echo the parse error: it quotes the key
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claims)}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')}`;
  const res = await call('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  return res.access_token;
}

/** fetch that throws with the response body (never the request, which carries the token) on HTTP errors. */
async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url.split('?')[0]}: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const token = await accessToken();
const auth = { Authorization: `Bearer ${token}` };

const upload = await call(`${API}/upload/v2/${ITEM}:upload`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/zip' },
  body: readFileSync(zip),
});
console.log(`uploaded ${zip}: v${upload.crxVersion}, ${upload.uploadState}`);

let state = upload.uploadState;
for (let i = 0; state === 'IN_PROGRESS' && i < 30; i++) {
  await sleep(10_000);
  state = (await call(`${API}/v2/${ITEM}:fetchStatus`, { headers: auth })).lastAsyncUploadState;
  console.log(`upload state: ${state}`);
}
if (state !== 'SUCCEEDED') throw new Error(`upload did not succeed (${state})`);

const published = await call(`${API}/v2/${ITEM}:publish`, { method: 'POST', headers: auth });
console.log('submitted for review:', JSON.stringify(published));
