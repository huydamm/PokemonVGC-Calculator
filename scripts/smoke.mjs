/**
 * Headless browser smoke test: loads the dev server, drives the core flow
 * through the tabs (paste a team, assign a slot, search an opponent, open the
 * heatmap and Field tabs), and fails on any console error, page exception or
 * missing result. Uses Chrome via the DevTools Protocol
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

const SAMPLE_TEAM = `Incineroar @ Safety Goggles
Ability: Intimidate
Level: 50
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Knock Off
- Flare Blitz
- Parting Shot

Garchomp @ Life Orb
Ability: Rough Skin
Level: 50
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Rock Slide
- Protect`;

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
  // WIDTH=400 checks the phone layout (smoke fails on horizontal overflow).
  if (process.env.SHOT || process.env.WIDTH) {
    const width = Number(process.env.WIDTH) || 1200;
    await cdp(
      browserWs,
      'Emulation.setDeviceMetricsOverride',
      { width, height: 1500, deviceScaleFactor: 1, mobile: width < 600 },
      sessionId,
    );
  }
  await cdp(browserWs, 'Page.navigate', { url: URL }, sessionId);
  await sleep(3500);

  // Drive the core flow via injected DOM interactions.
  const run = (expr) => cdp(browserWs, 'Runtime.evaluate', { expression: expr, awaitPromise: true }, sessionId);

  // 0) optionally switch format (e.g. FORMAT=gen9champions)
  if (process.env.FORMAT) {
    await run(
      `{const s=document.querySelector('select[aria-label="Format"]'); if(s){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set; set.call(s,'${process.env.FORMAT}'); s.dispatchEvent(new Event('change',{bubbles:true}));}}`,
    );
    await sleep(300);
  }
  const clickTab = (label) =>
    run(`[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.trim().toLowerCase().startsWith('${label}'))?.click()`);
  const count = async (sel) => (await run(`document.querySelectorAll('${sel}').length`)).result.value;
  // Poll instead of fixed sleeps: network-backed steps (usage stats) vary a lot.
  const waitFor = async (expr, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if ((await run(`!!(${expr})`)).result.value) return true;
      await sleep(250);
    }
    return false;
  };

  // 1) Team tab: paste a 2-mon Showdown export
  await clickTab('team');
  await sleep(300);
  await run(
    `{const t=document.querySelector('#paste'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(t, ${JSON.stringify(SAMPLE_TEAM)}); t.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  await waitFor(`document.querySelector('.card-assign button')`);
  // 2) assign the first card as attacker via its ⚔ button (switches to the Calc tab)
  await run(`document.querySelector('.card-assign button')?.click()`);
  await sleep(500);
  await clickTab('calc');
  await sleep(300);
  // 3) search an opponent in the (still empty) defender slot
  await run(`{const i=document.querySelector('.picker input'); if(i){const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'Garchomp'); i.dispatchEvent(new Event('input',{bubbles:true}));}}`);
  await waitFor(`[...document.querySelectorAll('.picker-row')].some(r=>r.textContent.includes('Garchomp'))`);
  await run(`[...document.querySelectorAll('.picker-row')].find(r=>r.textContent.includes('Garchomp'))?.click()`);
  // The common-set fetch can be slow (gen9ou usage stats are large).
  await waitFor(`document.querySelectorAll('.moves tbody tr').length > 0`, 30000);

  const rows = await count('.moves tbody tr');
  if (rows === 0) {
    const diag = await run(
      `JSON.stringify({query: document.querySelector('.picker input')?.value, pickerRows: [...document.querySelectorAll('.picker-row')].slice(0,3).map(r=>r.textContent), skeleton: !!document.querySelector('.slot-skeleton'), slots: [...document.querySelectorAll('.slot')].map(s=>s.textContent.slice(0,120))})`,
    );
    console.log('diagnostics:', diag.result.value);
  }
  const layout = (
    await run(
      `JSON.stringify({h1: document.querySelector('h1')?.textContent, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth})`,
    )
  ).result.value;
  // Feature a non-default move so we can check it survives a tab round trip.
  await run(`document.querySelector('.moves tbody tr:nth-child(3)')?.click()`);
  await sleep(300);
  const text = async (sel) => (await run(`document.querySelector('${sel}')?.textContent ?? null`)).result.value;
  const featuredBefore = await text('.featured-move');
  // 4) Heatmap sub-tab renders its 25 cells after the skeleton frame
  await clickTab('heatmap');
  await waitFor(`document.querySelectorAll('.heatmap-table td').length === 25`, 10000);
  const heatCells = await count('.heatmap-table td');
  const overflowHeat = (await run(`document.documentElement.scrollWidth > document.documentElement.clientWidth`)).result.value;
  // 5) Field tab shows the conditions panel; coming back keeps the Calc panel's state
  await clickTab('field');
  await sleep(400);
  const fieldButtons = await count('#main-panel-field .seg-btns button');
  await clickTab('calc');
  await sleep(500);
  const featuredAfter = await text('.featured-move');
  const heatStillOpen = await count('#main-panel-calc .heatmap-table td');
  // 6) ArrowRight on the active main tab moves focus to the next tab (not into a panel)
  await run(
    `{const t=document.querySelector('#main-tab-calc'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));}`,
  );
  await sleep(150); // let React re-render, so a panel stealing focus on mount would be caught
  const keyFocus = (await run(`document.activeElement?.id ?? null`)).result.value;
  await clickTab('calc');
  await sleep(300);

  const summary = {
    result: {
      value: JSON.stringify({ rows, heatCells, fieldButtons, featuredBefore, featuredAfter, keyFocus, ...JSON.parse(layout) }),
    },
  };
  if (rows === 0) errors.push('assertion: no move rows rendered');
  if (heatCells !== 25) errors.push(`assertion: heatmap has ${heatCells} cells, expected 25`);
  if (fieldButtons === 0) errors.push('assertion: Field tab has no weather/terrain buttons');
  if (JSON.parse(layout).overflowX || overflowHeat) errors.push('assertion: page scrolls horizontally');
  if (!featuredBefore || featuredBefore !== featuredAfter)
    errors.push(`assertion: featured move changed across a tab switch (${featuredBefore} -> ${featuredAfter})`);
  if (heatStillOpen !== 25) errors.push('assertion: Heatmap sub-tab did not survive a Field round trip');
  if (keyFocus !== 'main-tab-team') errors.push(`assertion: ArrowRight focused ${keyFocus}, expected main-tab-team`);

  if (process.env.SHOT) {
    await sleep(300);
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
