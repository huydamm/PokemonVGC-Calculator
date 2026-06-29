/**
 * Headless browser smoke test: loads the dev server, drives the core flow
 * (load sample team, assign a slot, search an opponent), and fails if any
 * console error or page exception occurs. Uses Chrome via the DevTools Protocol
 * over Node's built-in WebSocket — no test framework / browser deps.
 *
 * Usage: node scripts/smoke.mjs [url]
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const CHROME =
  process.env.CHROME ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=9333',
  '--user-data-dir=' + process.env.TEMP + '/vgc-smoke',
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9333/json/version');
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

let nextId = 1;
function cdp(ws, method, params = {}, sessionId) {
  return new Promise((resolve) => {
    const id = nextId++;
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) {
        ws.removeEventListener('message', onMsg);
        resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const errors = [];

async function main() {
  const wsUrl = await getWsUrl();
  const browserWs = new WebSocket(wsUrl);
  await new Promise((r) => (browserWs.onopen = r));

  const { targetId } = await cdp(browserWs, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp(browserWs, 'Target.attachToTarget', { targetId, flatten: true });

  browserWs.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const e = m.params.exceptionDetails;
      errors.push('exception: ' + (e.exception?.description ?? e.text));
    }
  });

  await cdp(browserWs, 'Runtime.enable', {}, sessionId);
  await cdp(browserWs, 'Page.enable', {}, sessionId);
  if (process.env.DARK) {
    await cdp(browserWs, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
  }
  if (process.env.SHOT) {
    await cdp(
      browserWs,
      'Emulation.setDeviceMetricsOverride',
      { width: 1200, height: 1500, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
  }
  await cdp(browserWs, 'Page.navigate', { url: URL }, sessionId);
  await sleep(3500);

  // Drive the core flow via injected DOM interactions.
  const run = (expr) => cdp(browserWs, 'Runtime.evaluate', { expression: expr, awaitPromise: true }, sessionId);

  // 1) load sample team
  await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('load sample team'))?.click()`);
  await sleep(800);
  // 2) assign first roster card to attacker via the ⚔ button
  await run(`document.querySelector('.card-assign button')?.click()`);
  await sleep(500);
  // 3) search an opponent in the (still empty) defender slot
  await run(`{const i=document.querySelector('.picker input'); if(i){const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'Garchomp'); i.dispatchEvent(new Event('input',{bubbles:true}));}}`);
  await sleep(900);
  await run(`document.querySelector('.picker-row')?.click()`);
  await sleep(2500); // wait for set fetch + calc

  const summary = await run(
    `JSON.stringify({rows: document.querySelectorAll('.moves tbody tr').length, h1: document.querySelector('h1')?.textContent})`,
  );

  if (process.env.SHOT) {
    const shot = await cdp(browserWs, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    mkdirSync(dirname(process.env.SHOT), { recursive: true });
    writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
    console.log('screenshot saved:', process.env.SHOT);
  }

  console.log('page summary:', summary.result.value);
  if (errors.length) {
    console.log('\nCONSOLE ERRORS / EXCEPTIONS:');
    for (const e of [...new Set(errors)]) console.log('  - ' + e);
  } else {
    console.log('\nNo console errors or exceptions. ✅');
  }
  chrome.kill();
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  chrome.kill();
  process.exit(2);
});
