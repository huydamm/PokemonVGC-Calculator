/**
 * Isolated-world content script + panel. Receives board snapshots from the
 * MAIN-world script (inject.ts), renders the board immediately, then runs the
 * both-direction damage calc (live.ts) and fills in the numbers when ready.
 *
 * Calc + network live here (not in MAIN) so fetch to data.pkmn.cc uses the
 * extension's host_permissions and bypasses Showdown's page CSP.
 */
import { computeLive, type MyPokemon, type LiveResult } from '../src/services/live';
import type { BattleSnapshot } from '../src/services/battle';
import { setService } from '../src/services/sets';
import { resolveFormat, type FormatDef, type ResolvedFormat, EV_SYSTEM } from '../src/services/formats';

const TAG = 'vgc-calc';

// ---- panel shell -----------------------------------------------------------
const panel = document.createElement('div');
panel.id = 'vgc-calc-panel';
Object.assign(panel.style, {
  position: 'fixed', top: '8px', right: '8px', zIndex: '99999', width: '320px',
  maxHeight: '85vh', overflow: 'auto', background: '#1b1d22', color: '#e6e6e6',
  font: '12px/1.45 ui-monospace, Menlo, Consolas, monospace', border: '1px solid #3a3d44',
  borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
});
const header = document.createElement('div');
Object.assign(header.style, { padding: '8px 12px', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: '0', background: '#1b1d22', borderBottom: '1px solid #2a2d33' });
header.innerHTML = '<b>VGC Live Calc</b> <span style="opacity:.5;float:right">[hide]</span>';
const body = document.createElement('div');
Object.assign(body.style, { padding: '8px 12px' });
body.innerHTML = '<div style="opacity:.6">waiting for a battle…</div>';
panel.append(header, body);
header.onclick = () => {
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? 'block' : 'none';
  header.querySelector('span')!.textContent = hidden ? '[hide]' : '[show]';
};
const mount = () => { if (!document.body.contains(panel)) document.body.appendChild(panel); };
if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

// ---- format resolution (cached by tier) ------------------------------------
const formatCache = new Map<string, Promise<ResolvedFormat>>();
function resolveLiveFormat(snapshot: BattleSnapshot): Promise<ResolvedFormat> {
  const tier = snapshot.tier || 'gen9';
  let p = formatCache.get(tier);
  if (!p) {
    const base = tier.toLowerCase().replace(/[^a-z0-9]/g, ''); // '[Gen 9] Doubles OU' -> 'gen9doublesou'
    const candidates = [base, base.replace(/reg.$/, ''), 'gen9vgc2026', 'gen9vgc2025', 'gen9ou'].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
    const def: FormatDef = {
      id: base, label: tier, group: 'live', gameType: snapshot.field.gameType,
      level: snapshot.mine.find(Boolean)?.level ?? (snapshot.field.gameType === 'Doubles' ? 50 : 100),
      megasEnabled: false, teraEnabled: true, statSystem: EV_SYSTEM,
      statsCandidates: candidates, setsCandidates: candidates,
    };
    p = resolveFormat(def);
    formatCache.set(tier, p);
  }
  return p;
}

// ---- rendering -------------------------------------------------------------
const pctRange = (r: [number, number]) => `${r[0]}-${r[1]}%`;
const boosts = (b: Record<string, number>) =>
  Object.entries(b).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`).join(' ');

function monLine(m: BattleSnapshot['mine'][number]): string {
  if (!m) return '<div style="opacity:.4">— empty —</div>';
  const hp = m.known && m.hp != null ? `${m.hp}/${m.maxHP} (${m.hpPercent}%)` : `${m.hpPercent}%`;
  const tags = [
    m.status && m.status.toUpperCase(),
    Object.keys(m.boosts).length && boosts(m.boosts as Record<string, number>),
    m.terastallized && `Tera ${m.teraType}`, m.item, m.ability,
  ].filter(Boolean);
  return `<div style="margin:3px 0"><b>${m.species}</b> <span style="opacity:.7">${hp}</span>${
    tags.length ? `<div style="opacity:.75">${tags.join(' · ')}</div>` : ''
  }</div>`;
}

const calcLine = (l: LiveResult['incoming'][number]) =>
  `<div style="margin:2px 0">${l.estimated ? '<span style="opacity:.5">~</span>' : ''}<b>${l.attacker}</b> ${l.move} → ${l.defender}: <span style="color:#ffd479">${pctRange(l.percent)}</span> <span style="opacity:.7">(${l.ko})</span></div>`;

function render(snapshot: BattleSnapshot, result?: LiveResult): void {
  mount();
  const f = snapshot.field;
  const field = [
    f.weather, f.terrain && `${f.terrain} Terrain`, f.trickRoom && 'Trick Room', f.gravity && 'Gravity',
    f.mySide.tailwind && 'your TW', f.theirSide.tailwind && 'their TW',
  ].filter(Boolean).join(' · ') || 'no field effects';

  const calc = result
    ? `<div style="color:#ff9d7f;margin-top:10px">THREATS TO YOU</div>${
        result.incoming.length ? result.incoming.map(calcLine).join('') : '<div style="opacity:.5">—</div>'
      }<div style="color:#7fd1ff;margin-top:8px">YOUR DAMAGE</div>${
        result.outgoing.length ? result.outgoing.map(calcLine).join('') : '<div style="opacity:.5">—</div>'
      }`
    : '<div style="opacity:.5;margin-top:10px">calculating…</div>';

  body.innerHTML = `
    <div style="opacity:.5">turn ${snapshot.turn} · ${field}</div>
    <div style="color:#7fd1ff;margin-top:8px">YOUR SIDE</div>${snapshot.mine.map(monLine).join('')}
    <div style="color:#ff9d7f;margin-top:6px">OPPONENT</div>${snapshot.theirs.map(monLine).join('')}
    ${calc}`;
}

// ---- snapshot handling -----------------------------------------------------
let seq = 0;
async function onSnapshot(snapshot: BattleSnapshot, myPokemon: MyPokemon[]): Promise<void> {
  render(snapshot); // board first, instantly
  const mySeq = ++seq;
  try {
    const resolved = await resolveLiveFormat(snapshot);
    const result = await computeLive(snapshot, myPokemon, setService, resolved);
    if (mySeq === seq) render(snapshot, result); // ignore if a newer snapshot arrived
  } catch (e) {
    console.error('[vgc-calc] calc failed', e);
  }
}

window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || d.source !== TAG || !d.snapshot) return;
  void onSnapshot(d.snapshot as BattleSnapshot, (d.myPokemon ?? []) as MyPokemon[]);
});
