/**
 * Isolated-world content script + panel. Receives board snapshots from the
 * MAIN-world script (inject.ts), renders the board immediately, then runs the
 * both-direction damage calc (live.ts) and fills in the numbers when ready.
 *
 * Calc + network live here (not in MAIN) so fetch to data.pkmn.cc uses the
 * extension's host_permissions and bypasses Showdown's page CSP.
 *
 * The panel sits in a shadow root styled with the web app's pixel tokens
 * (theme.ts + panel.css), so Showdown's CSS can't reach in and ours can't leak
 * out. Page strings are rendered as text only (panel.ts).
 *
 * Paid access comes from the background (ExtensionPay), checked once per battle:
 * a trial shows a days-left line, a lapsed trial shows a buy prompt and runs no calc.
 */
import { computeLive, battleLevel, type MyPokemon, type LiveResult } from '../src/services/live';
import type { BattleSnapshot } from '../src/services/battle';
import { setService } from '../src/services/sets';
import { resolveFormat, liveFormatDef, type ResolvedFormat } from '../src/services/formats';
import { nextTabIndex } from '../src/services/tabs';
import { access, type Access, type License } from '../src/services/license';
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
const plan = el('div', 'vgc-plan');
plan.hidden = true;
const body = el('div', 'vgc-body', plan, tablist, board);
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

// ---- paid access -------------------------------------------------------------
let gate: Promise<Access | null> | null = null;

/**
 * Send to the background. After an extension update the old content script is orphaned and
 * `chrome.runtime` throws, so this reports failure instead of throwing.
 */
function send<T>(message: { type: string }): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (resp?: T) => resolve(chrome.runtime.lastError ? null : resp ?? null));
    } catch {
      resolve(null);
    }
  });
}

/** The user's access, or null when the background can't be reached (retried on the next snapshot). */
const checkAccess = async (): Promise<Access | null> => {
  const l = await send<License>({ type: 'vgc-license' });
  return l && access(l, Date.now());
};

const buyButton = (label: string): HTMLButtonElement => {
  const b = el('button', 'vgc-btn vgc-buy', label);
  b.type = 'button';
  b.addEventListener('click', () => void send({ type: 'vgc-pay' }));
  return b;
};

function showPlan(a: Access | null): void {
  plan.hidden = a?.kind !== 'trial';
  if (a?.kind === 'trial') plan.replaceChildren(el('span', '', `Free trial: ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left`), buyButton('Buy'));
}

/** A message in place of the board (locked prompt, unreachable background); no calc runs under it. */
function showGate(content: HTMLElement): void {
  mount();
  tablist.hidden = true;
  headChips.replaceChildren();
  latestResult = null;
  board.replaceChildren(content);
}

function lockedPrompt(): HTMLElement {
  const note = el('p', 'vgc-quiet');
  note.setAttribute('aria-live', 'polite');
  const recheck = el('button', 'vgc-btn vgc-buy', 'I paid');
  recheck.type = 'button';
  recheck.addEventListener('click', async () => {
    recheck.disabled = true;
    note.textContent = 'Checking…';
    gate = checkAccess();
    const a = await gate;
    note.textContent = a?.kind === 'locked' ? 'No payment found yet. It can take a minute after checkout.' : '';
    recheck.disabled = false;
    if (lastSnapshot) void onSnapshot(...lastSnapshot);
  });
  return el('div', 'vgc-locked',
    el('p', '', 'Your free trial has ended.'),
    el('p', 'vgc-quiet', 'Unlock VGC Live Calc to keep live damage numbers in every battle.'),
    el('div', 'vgc-row', buyButton('Unlock'), recheck),
    note);
}

let lastSnapshot: [BattleSnapshot, MyPokemon[], string] | null = null;

async function onSnapshot(snapshot: BattleSnapshot, myPokemon: MyPokemon[], roomId: string): Promise<void> {
  lastSnapshot = [snapshot, myPokemon, roomId];
  const room = roomId || snapshot.tier;
  if (room !== battleRoom) {
    battleRoom = room;
    latestResult = null; // a new battle shows a skeleton, never the last battle's numbers
    gate = checkAccess(); // once per battle, so a purchase or an expired trial shows up by the next one
  }
  // Taken before the await, so a calc from an older snapshot or room can't land after this one.
  const mySeq = ++seq;
  const a = await (gate ??= checkAccess());
  if (mySeq !== seq) return; // a newer snapshot took over while the license check ran
  showPlan(a);
  if (!a) {
    gate = null; // not cached: the next snapshot asks again
    showGate(el('p', 'vgc-quiet', 'VGC Live Calc was updated or restarted. Reload this page to keep calculating.'));
    return;
  }
  if (a.kind === 'locked') {
    if (!board.querySelector('.vgc-locked')) showGate(lockedPrompt()); // built once, so its buttons keep focus
    return;
  }
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
