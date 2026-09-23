/**
 * Isolated-world content script + panel. Receives board snapshots from the
 * MAIN-world script (inject.ts), renders the board immediately, then runs the
 * both-direction damage calc (live.ts) and fills in the numbers when ready.
 *
 * Calc + network live here (not in MAIN) so fetches to data.pkmn.cc and
 * championsbattledata.com use the
 * extension's host_permissions and bypasses Showdown's page CSP.
 *
 * The panel sits in a shadow root styled with the web app's pixel tokens
 * (theme.ts + panel.css), so Showdown's CSS can't reach in and ours can't leak
 * out. Page strings are rendered as text only (panel.ts).
 */
import { computeLive, battleLevel, type MyPokemon, type LiveResult } from '../src/services/live';
import type { BattleSnapshot } from '../src/services/battle';
import { setService } from '../src/services/sets';
import { resolveFormat, liveFormatDef, type ResolvedFormat } from '../src/services/formats';
import { nextTabIndex } from '../src/services/tabs';
import { installFonts, themeSheet } from './theme';
import { el, renderBoard, type View } from './panel';
import panelCss from './panel.css';

const TAG = 'vgc-calc';

// ---- panel shell -----------------------------------------------------------
const host = document.createElement('div');
host.id = 'vgc-calc-root';
const shadow = host.attachShadow({ mode: 'open' });
shadow.adoptedStyleSheets = [themeSheet(panelCss)];
installFonts();

const toggle = el('button', 'vgc-btn vgc-toggle');
toggle.type = 'button';
toggle.setAttribute('aria-controls', 'vgc-body');
const headChips = el('span', 'vgc-head-chips');
// Board is re-rendered every snapshot; the tabs around it persist.
const board = el('div', 'vgc-board', el('p', 'vgc-quiet', 'Waiting for a battle…'));
board.id = 'vgc-board';
board.setAttribute('role', 'tabpanel');
const VIEWS: { id: View; label: string }[] = [
  { id: 'out', label: 'Your moves' },
  { id: 'in', label: 'Their moves' },
];
const tabs = VIEWS.map(({ id, label }) => {
  const tab = el('button', 'vgc-btn vgc-tab', label);
  tab.type = 'button';
  tab.id = `vgc-tab-${id}`;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', 'vgc-board');
  return tab;
});
const tablist = el('div', 'vgc-tabs', ...tabs);
tablist.setAttribute('role', 'tablist');
tablist.setAttribute('aria-label', 'Damage direction');
tablist.hidden = true; // until the first battle arrives
const link = (href: string, text: string): HTMLAnchorElement => {
  const a = el('a', '', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
};
// Credits the data sources (championsbattledata.com requires it) and disclaims affiliation.
const credits = el('p', 'vgc-credits',
  'Battle data by ', link('https://championsbattledata.com/', 'Pokémon Champions Battle Data'),
  ', usage stats by ', link('https://www.smogon.com/stats/', 'Smogon'), ' via ', link('https://data.pkmn.cc/', 'pkmn'),
  ', calc by ', link('https://github.com/smogon/damage-calc', '@smogon/calc'),
  '. Unofficial fan project, not affiliated with Nintendo or The Pokémon Company.');
const body = el('div', 'vgc-body', tablist, board, credits);
body.id = 'vgc-body';
shadow.append(el('div', 'vgc-panel', el('header', 'vgc-head', el('span', 'vgc-title', 'VGC Live Calc'), headChips, toggle), body));

function setOpen(open: boolean): void {
  body.hidden = !open;
  toggle.textContent = open ? '−' : '+';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Hide calc panel' : 'Show calc panel');
}
setOpen(true);
toggle.addEventListener('click', () => setOpen(body.hidden));

const mount = () => { if (!document.body.contains(host)) document.body.appendChild(host); };
if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

// ---- format resolution (cached by tier) ------------------------------------
const formatCache = new Map<string, Promise<ResolvedFormat>>();
function resolveLiveFormat(snapshot: BattleSnapshot): Promise<ResolvedFormat> {
  const tier = snapshot.tier || 'gen9';
  let p = formatCache.get(tier);
  if (!p) {
    p = resolveFormat(liveFormatDef(tier, snapshot.field.gameType, battleLevel(snapshot)));
    formatCache.set(tier, p);
  }
  return p;
}

/** Short format name for the header chip ("Pokémon Champions", "Doubles OU"). */
function formatLabel(s: BattleSnapshot): string {
  try {
    return liveFormatDef(s.tier || 'gen9', s.field.gameType, battleLevel(s)).label.replace(/^\[Gen \d+\]\s*/, '');
  } catch {
    return s.tier;
  }
}

// ---- rendering + snapshot handling -----------------------------------------
let seq = 0;
let latestResult: LiveResult | null = null;
let battleRoom = '';
let shownResult = '';
let wasBusy = false;
let view: View = 'out';
let lastRender: [BattleSnapshot, LiveResult | null, boolean] | null = null;

function render(snapshot: BattleSnapshot, result: LiveResult | null, busy: boolean): void {
  mount();
  lastRender = [snapshot, result, busy];
  tablist.hidden = false;
  // Rows animate in only when the numbers changed, not on every HP/boost tick.
  const key = result ? JSON.stringify(result) : '';
  const animate = !busy && key !== shownResult;
  if (!busy) shownResult = key;
  // A calc spanning several snapshots stays dimmed instead of restarting the delayed dim each time.
  const dim = busy && wasBusy;
  wasBusy = busy;
  renderBoard(board, headChips, snapshot, result, formatLabel(snapshot), { busy, animate, dim }, view);
}

function setView(next: View): void {
  view = next;
  VIEWS.forEach(({ id }, i) => {
    tabs[i].setAttribute('aria-selected', String(id === next));
    tabs[i].tabIndex = id === next ? 0 : -1;
  });
  board.setAttribute('aria-labelledby', `vgc-tab-${next}`);
  if (lastRender) render(...lastRender);
}
tabs.forEach((tab, i) => tab.addEventListener('click', () => setView(VIEWS[i].id)));
tablist.addEventListener('keydown', (e) => {
  const next = nextTabIndex(e.key, VIEWS.findIndex((v) => v.id === view), VIEWS.length);
  if (next == null) return;
  e.preventDefault();
  setView(VIEWS[next].id);
  tabs[next].focus();
});
setView('out');

async function onSnapshot(snapshot: BattleSnapshot, myPokemon: MyPokemon[], roomId: string): Promise<void> {
  const room = roomId || snapshot.tier;
  if (room !== battleRoom) {
    battleRoom = room;
    latestResult = null; // a new battle shows a skeleton, never the last battle's numbers
  }
  // Taken before the await, so a calc from an older snapshot or room can't land after this one.
  const mySeq = ++seq;
  render(snapshot, latestResult, true); // board first, instantly; last numbers stay dimmed until the new ones land
  try {
    const resolved = await resolveLiveFormat(snapshot);
    const result = await computeLive(snapshot, myPokemon, setService, resolved);
    if (mySeq === seq) {
      latestResult = result;
      render(snapshot, result, false); // ignore if a newer snapshot arrived
    }
  } catch (e) {
    console.error('[vgc-calc] calc failed', e);
    latestResult = null;
    if (mySeq === seq) render(snapshot, null, false);
  }
}

window.addEventListener('message', (ev) => {
  if (ev.source !== window) return; // only inject.ts in this frame, never Showdown's ad iframes
  const d = ev.data;
  if (!d || d.source !== TAG || !d.snapshot) return;
  void onSnapshot(d.snapshot as BattleSnapshot, (d.myPokemon ?? []) as MyPokemon[], String(d.roomId ?? ''));
});
