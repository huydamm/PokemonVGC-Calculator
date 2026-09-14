/**
 * Extension preview: loads the real unpacked extension into headless Chrome
 * (CDP `Extensions.loadUnpacked` over --remote-debugging-pipe, since Chrome 137+
 * ignores --load-extension), opens play.pokemonshowdown.com, posts sample battle
 * boards the way inject.ts does, and checks the overlay renders damage numbers
 * in the pixel theme without moving Showdown's layout. Also checks the options page.
 *
 * Usage: npm run build:ext && npm run smoke:ext   (SHOTS=<dir> saves screenshots; needs network)
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EXTENSION = fileURLToPath(new URL('../extension', import.meta.url));
const SHOWDOWN = 'https://play.pokemonshowdown.com/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const chrome = spawn(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${join(tmpdir(), 'vgc-ext-smoke')}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);
chrome.on('error', (e) => {
  console.error(`Could not start Chrome at "${CHROME}" (set CHROME to your Chrome binary): ${e.message}`);
  process.exit(1);
});
// A crashed Chrome fails every pending call instead of hanging the script.
chrome.on('exit', () => {
  for (const done of pending.values()) done({ error: { message: 'Chrome exited' } });
  pending.clear();
});

// DevTools protocol over the pipe: NUL-terminated JSON, commands on fd 3, replies and events on fd 4.
const pending = new Map();
const listeners = new Set();
let nextId = 1;
let buffered = '';
chrome.stdio[4].setEncoding('utf8');
chrome.stdio[4].on('data', (chunk) => {
  buffered += chunk;
  for (let end = buffered.indexOf('\0'); end >= 0; end = buffered.indexOf('\0')) {
    const msg = JSON.parse(buffered.slice(0, end));
    buffered = buffered.slice(end + 1);
    const done = pending.get(msg.id);
    if (done) {
      pending.delete(msg.id);
      done(msg);
    } else for (const listen of listeners) listen(msg);
  }
});
function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}

/** Open a tab on `url`; returns helpers bound to its session. */
async function openPage(url, watch) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => cdp(method, params, sessionId);
  if (watch) listeners.add((m) => m.sessionId === sessionId && watch(m));
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url });
  const run = async (expression) =>
    (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  const shot = async (name, clip) => {
    if (!process.env.SHOTS) return;
    const s = await call('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
    mkdirSync(process.env.SHOTS, { recursive: true });
    writeFileSync(join(process.env.SHOTS, `ext-${name}.png`), Buffer.from(s.data, 'base64'));
  };
  return { call, run, shot };
}

async function waitFor(run, expression, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await run(expression)) return true;
    await sleep(250);
  }
  return false;
}

// ---- sample boards (shapes from src/services/battle.ts) ----
const side = (o = {}) => ({ lightScreen: false, reflect: false, auroraVeil: false, tailwind: false, helpingHand: false, friendGuard: false, ...o });
const mon = (o) => ({ level: 50, fainted: false, hpPercent: 100, status: '', boosts: {}, terastallized: false, revealedMoves: [], known: false, ...o });
const BOARDS = [
  {
    name: 'doubles',
    roomId: 'battle-gen9doublesou-1',
    yourMoves: 8, // Incineroar 4 + Rillaboom 4, status moves included
    snapshot: {
      gen: 9, tier: '[Gen 9] Doubles OU', turn: 3,
      field: { gameType: 'Doubles', weather: 'Rain', gravity: false, trickRoom: false, mySide: side({ tailwind: true }), theirSide: side({ reflect: true }) },
      mine: [
        mon({ species: 'Incineroar', level: 100, known: true, hp: 343, maxHP: 394, hpPercent: 87, boosts: { atk: -1 }, item: 'Safety Goggles', ability: 'Intimidate' }),
        mon({ species: 'Rillaboom', level: 100, known: true, hp: 341, maxHP: 341, hpPercent: 100 }),
      ],
      theirs: [
        mon({ species: 'Landorus-Therian', level: 100, hpPercent: 76, status: 'brn', revealedMoves: ['Rock Slide'] }),
        mon({ species: 'Amoonguss', level: 100, hpPercent: 100, item: 'Rocky Helmet' }),
      ],
      myTeam: ['Incineroar', 'Rillaboom'], theirTeam: ['Landorus-Therian', 'Amoonguss'],
    },
    myPokemon: [
      { details: 'Incineroar, M', stats: { atk: 266, def: 216, spa: 176, spd: 306, spe: 156 }, maxHP: 394, moves: ['fakeout', 'knockoff', 'flareblitz', 'partingshot'], item: 'safetygoggles', ability: 'intimidate', teraType: 'Ghost' },
      { details: 'Rillaboom, M', stats: { atk: 383, def: 216, spa: 156, spd: 176, spe: 268 }, maxHP: 341, moves: ['fakeout', 'grassyglide', 'woodhammer', 'uturn'], item: 'assaultvest', ability: 'grassysurge', teraType: 'Fire' },
    ],
  },
  {
    name: 'champions',
    roomId: 'battle-gen9championsvgc2026regmc-2',
    yourMoves: 8,
    snapshot: {
      gen: 9, tier: '[Gen 9 Champions] VGC 2026 Reg M-C', turn: 1,
      field: { gameType: 'Doubles', gravity: false, trickRoom: false, mySide: side(), theirSide: side() },
      mine: [
        mon({ species: 'Incineroar', known: true, hp: 202, maxHP: 202, hpPercent: 100 }),
        mon({ species: 'Garchomp', known: true, hp: 183, maxHP: 183, hpPercent: 100 }),
      ],
      theirs: [mon({ species: 'Sneasler', hpPercent: 100 }), mon({ species: 'Kingambit', hpPercent: 58, boosts: { atk: 1 } })],
      myTeam: ['Incineroar', 'Garchomp'], theirTeam: ['Sneasler', 'Kingambit'],
    },
    myPokemon: [
      { details: 'Incineroar, L50, M', stats: { atk: 136, def: 110, spa: 90, spd: 128, spe: 80 }, maxHP: 202, moves: ['fakeout', 'knockoff', 'flareblitz', 'partingshot'], item: 'sitrusberry', ability: 'intimidate' },
      { details: 'Garchomp, L50, M', stats: { atk: 182, def: 115, spa: 90, spd: 106, spe: 169 }, maxHP: 183, moves: ['earthquake', 'dragonclaw', 'rockslide', 'protect'], item: 'lifeorb', ability: 'roughskin' },
    ],
  },
];

// ---- page-side checks ----
const ROOT = `document.querySelector('#vgc-calc-root')?.shadowRoot`;
const FONTS = `(async () => {
  await Promise.all(['16px "VGC VT323"', '10px "VGC Press Start 2P"', '14px "VGC Pixelify Sans"'].map((f) => document.fonts.load(f)));
  return [...document.fonts].filter((f) => f.family.replace(/["']/g, '').startsWith('VGC ') && f.status === 'loaded').length;
})()`;
// Computed colours in the blue/purple band (hue 190-300, saturated, not near black or white).
const BLUE_SCAN = (nodes) => `(() => {
  const hsl = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (a === 0) return null;
    const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
    if (!d) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = ((max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60 + 360) % 360;
    return { h, s, l };
  };
  const out = [];
  for (const e of ${nodes}) {
    const cs = getComputedStyle(e);
    for (const p of ['color', 'backgroundColor', 'borderLeftColor', 'borderTopColor']) {
      const v = hsl(cs[p]);
      if (v && v.h >= 190 && v.h <= 300 && v.s > 0.3 && v.l > 0.12 && v.l < 0.92) out.push(e.className + ' ' + p + ' ' + cs[p]);
    }
  }
  return out.slice(0, 5);
})()`;
const READY = (turn) =>
  `(() => { const r = ${ROOT}; return !!r && r.querySelectorAll('.vgc-cell .vgc-pct').length > 0 && !r.querySelector('.vgc-grid[aria-busy]') && [...r.querySelectorAll('.vgc-head .vgc-chip')].some((c) => c.textContent === 'Turn ${turn}'); })()`;
const CHECK = `(async () => {
  const root = ${ROOT};
  const pct = root.querySelector('.vgc-pct');
  const box = root.querySelector('.vgc-panel').getBoundingClientRect();
  return JSON.stringify({
    rows: root.querySelectorAll('.vgc-move-row').length,
    pcts: [...root.querySelectorAll('.vgc-pct')].map((e) => e.textContent),
    head: [...root.querySelectorAll('.vgc-head .vgc-chip')].map((e) => e.textContent),
    size: [Math.round(box.width), Math.round(box.height)],
    fonts: await ${FONTS},
    pctFont: pct && getComputedStyle(pct).fontFamily,
    blue: ${BLUE_SCAN(`[root.host, ...root.querySelectorAll('*')]`)},
  });
})()`;
// A new battle must show a skeleton, never the last battle's numbers under the busy grid.
const STALE = `!!${ROOT}.querySelector('.vgc-grid[aria-busy] .vgc-pct')`;
const TAB = (i) =>
  `(() => { const t = ${ROOT}.querySelectorAll('.vgc-tab')[${i}]; t.click(); return t.getAttribute('aria-selected') + ' ' + ${ROOT}.querySelectorAll('.vgc-move-row').length; })()`;
// Visible page blocks with the extension's panel and document font sheet in place vs taken out
// (Showdown's zero-size ad iframes come and go on their own, so they're ignored).
const LAYOUT = `(() => {
  const host = document.querySelector('#vgc-calc-root');
  const measure = () => JSON.stringify([...document.body.children].filter((e) => e !== host).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName, e.id, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }).filter(([, , , , w, h]) => w > 0 && h > 0));
  const shown = measure();
  const sheets = [...document.adoptedStyleSheets];
  host.style.display = 'none';
  document.adoptedStyleSheets = [];
  const hidden = measure();
  document.adoptedStyleSheets = sheets;
  host.style.removeProperty('display');
  return shown === hidden ? '' : 'with extension ' + shown + ' / without ' + hidden;
})()`;
const TOGGLE = `(() => { const r = ${ROOT}; const b = r.querySelector('.vgc-toggle'); b.click(); return JSON.stringify([b.getAttribute('aria-expanded'), r.querySelector('.vgc-body').hidden]); })()`;
const RUNNING = `${ROOT}.getAnimations().filter((a) => a.playState === 'running').length`;
const OPTIONS = `(async () => JSON.stringify({
  fonts: await ${FONTS},
  bg: getComputedStyle(document.body).backgroundColor,
  title: getComputedStyle(document.querySelector('h1')).fontFamily,
  blue: ${BLUE_SCAN(`document.querySelectorAll('body *')`)},
}))()`;

async function main() {
  const { id } = await cdp('Extensions.loadUnpacked', { path: EXTENSION });
  const origin = `chrome-extension://${id}`;
  const page = await openPage(SHOWDOWN, (m) => {
    // Only the extension's own errors: Showdown logs its own noise when nobody is logged in.
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (text.includes('[vgc-calc]')) errors.push('console.error: ' + text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const e = m.params.exceptionDetails;
      if (`${e.url ?? ''} ${e.stackTrace?.callFrames?.[0]?.url ?? ''}`.includes(origin)) {
        errors.push('exception: ' + (e.exception?.description ?? e.text));
      }
    }
  });
  if (!(await waitFor(page.run, `!!${ROOT}`, 80))) throw new Error('overlay never mounted (is extension/dist built? npm run build:ext)');
  await sleep(1500);

  const post = (b) =>
    page.run(
      `window.postMessage({ source: 'vgc-calc', roomId: ${JSON.stringify(b.roomId)}, snapshot: ${JSON.stringify(b.snapshot)}, myPokemon: ${JSON.stringify(b.myPokemon)} }, '*')`,
    );
  const panel = { x: 860, y: 0, width: 420, height: 640 };

  for (const [i, b] of BOARDS.entries()) {
    await post(b);
    await sleep(150);
    if (i === 0) await page.shot('calculating', panel);
    else if (await page.run(STALE)) errors.push(`assertion: the ${b.name} board still showed the last battle's numbers`);
    if (!(await waitFor(page.run, READY(b.snapshot.turn)))) {
      errors.push(`assertion: ${b.name} board never showed damage rows`);
      continue;
    }
    await sleep(500); // let px-in finish before the screenshot
    const c = JSON.parse(await page.run(CHECK));
    console.log(`${b.name}:`, JSON.stringify({ rows: c.rows, size: c.size, head: c.head, pcts: c.pcts.slice(0, 4), fonts: c.fonts }));
    if (c.rows !== b.yourMoves) errors.push(`assertion: ${b.name} shows ${c.rows} of your ${b.yourMoves} moves`);
    // Compact: no wider than 420px and under 60% of a 900px-tall window.
    if (c.size[0] > 420 || c.size[1] > 540) errors.push(`assertion: ${b.name} panel is ${c.size.join('x')}, too big`);
    if (c.pcts.some((p) => !/^\d+(\.\d+)?-\d+(\.\d+)?%$/.test(p))) errors.push(`assertion: ${b.name} has a malformed % (${c.pcts.join(', ')})`);
    if (c.fonts < 3) errors.push(`assertion: only ${c.fonts}/3 pixel fonts loaded from the extension`);
    if (!String(c.pctFont).includes('VGC VT323')) errors.push(`assertion: damage numbers not in VT323 (${c.pctFont})`);
    if (c.blue.length) errors.push(`assertion: blue/purple colours in the panel: ${c.blue.join(' | ')}`);
    await page.shot(b.name, panel);

    // Both opponents here have usage data, so each shows its full four moves.
    const [selected, theirRows] = (await page.run(TAB(1))).split(' ');
    if (selected !== 'true' || Number(theirRows) !== 8) errors.push(`assertion: ${b.name} "Their moves" tab shows ${theirRows} of 8 moves (selected ${selected})`);
    await sleep(400);
    await page.shot(`${b.name}-theirs`, panel);
    await page.run(TAB(0));
  }

  const moved = await page.run(LAYOUT);
  if (moved) errors.push(`assertion: Showdown layout changes with the panel: ${moved}`);

  const closed = JSON.parse(await page.run(TOGGLE));
  if (closed[0] !== 'false' || closed[1] !== true) errors.push(`assertion: collapse did not hide the body (${closed})`);
  await page.shot('collapsed', panel);
  const opened = JSON.parse(await page.run(TOGGLE));
  if (opened[0] !== 'true' || opened[1] !== false) errors.push(`assertion: expand did not show the body (${opened})`);

  // Reduced motion: a new battle (skeleton) and its fresh result must start no animations.
  await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const quiet = { ...BOARDS[1], roomId: 'battle-gen9championsvgc2026regmc-3', snapshot: { ...BOARDS[1].snapshot, turn: 2 } };
  await post(quiet);
  await sleep(150);
  const during = await page.run(RUNNING);
  await waitFor(page.run, READY(2));
  const after = await page.run(RUNNING);
  if (during || after) errors.push(`assertion: animations under prefers-reduced-motion (${during} while calculating, ${after} after)`);

  const options = await openPage(`${origin}/options.html`);
  await sleep(1500);
  const o = JSON.parse(await options.run(OPTIONS));
  console.log('options:', JSON.stringify({ fonts: o.fonts, bg: o.bg, title: o.title }));
  if (o.fonts < 3) errors.push(`assertion: options page loaded ${o.fonts}/3 pixel fonts`);
  if (o.bg !== 'rgb(22, 19, 15)') errors.push(`assertion: options page background is ${o.bg}, not the theme's`);
  if (!String(o.title).includes('VGC Press Start 2P')) errors.push(`assertion: options title not in Press Start 2P (${o.title})`);
  if (o.blue.length) errors.push(`assertion: blue/purple colours on the options page: ${o.blue.join(' | ')}`);
  await options.shot('options', { x: 0, y: 0, width: 620, height: 320 });
}

main()
  .catch((e) => errors.push('harness: ' + (e.stack ?? e)))
  .finally(() => {
    chrome.kill();
    if (errors.length) {
      console.log('FAILURES:\n  - ' + errors.join('\n  - '));
      process.exitCode = 1;
    } else console.log('Extension overlay OK ✅');
  });
