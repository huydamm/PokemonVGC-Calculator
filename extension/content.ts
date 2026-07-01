/**
 * Isolated-world content script + panel. Receives board snapshots from the
 * MAIN-world script (inject.ts), renders the board immediately, then runs the
 * both-direction damage calc (live.ts) and fills in the numbers when ready.
 *
 * Calc + network live here (not in MAIN) so fetch to data.pkmn.cc uses the
 * extension's host_permissions and bypasses Showdown's page CSP.
 */
import { computeLive, runHypothetical, type MyPokemon, type LiveResult, type HypoRequest } from '../src/services/live';
import type { BattleSnapshot } from '../src/services/battle';
import { setService } from '../src/services/sets';
import { resolveFormat, type FormatDef, type ResolvedFormat, EV_SYSTEM } from '../src/services/formats';

const TAG = 'vgc-calc';

// ---- panel shell -----------------------------------------------------------
const panel = document.createElement('div');
panel.id = 'vgc-calc-panel';
Object.assign(panel.style, {
  position: 'fixed', top: '8px', right: '8px', zIndex: '99999', width: '560px',
  maxHeight: '85vh', overflow: 'auto', background: '#1b1d22', color: '#e6e6e6',
  font: '12px/1.45 ui-monospace, Menlo, Consolas, monospace', border: '1px solid #3a3d44',
  borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
});
const header = document.createElement('div');
Object.assign(header.style, { padding: '8px 12px', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: '0', background: '#1b1d22', borderBottom: '1px solid #2a2d33' });
header.innerHTML = '<b>VGC Live Calc</b> <span style="opacity:.5;float:right">[hide]</span>';
const body = document.createElement('div');
Object.assign(body.style, { padding: '8px 12px' });
// Board is re-rendered every snapshot; the ask area below it persists.
const boardDiv = document.createElement('div');
boardDiv.innerHTML = '<div style="opacity:.6">waiting for a battle…</div>';
const askDiv = document.createElement('div');
Object.assign(askDiv.style, { marginTop: '10px', borderTop: '1px solid #2a2d33', paddingTop: '8px' });
askDiv.innerHTML = `
  <div style="display:flex;gap:6px">
    <button id="vgc-mic" title="hold-to-talk (click to start/stop)" style="flex:0 0 auto;padding:6px 8px;background:#12141a;color:#e6e6e6;border:1px solid #3a3d44;border-radius:6px;cursor:pointer;font:inherit">🎤</button>
    <input id="vgc-q" placeholder="ask… or tap the mic" style="flex:1;min-width:0;box-sizing:border-box;padding:6px;background:#12141a;color:#e6e6e6;border:1px solid #3a3d44;border-radius:6px;font:inherit" />
  </div>
  <div id="vgc-a" style="margin-top:6px;color:#cfe;white-space:pre-wrap"></div>`;
body.append(boardDiv, askDiv);
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

  const lines = (rows: LiveResult['incoming']) =>
    rows.length ? rows.map(calcLine).join('') : '<div style="opacity:.5">—</div>';

  // Two columns: your stuff on the left, the opponent on the right.
  const mine = `
    <div style="color:#7fd1ff">YOUR SIDE</div>${snapshot.mine.map(monLine).join('')}
    ${result ? `<div style="color:#7fd1ff;margin-top:8px">YOUR DAMAGE</div>${lines(result.outgoing)}` : ''}`;
  const theirs = `
    <div style="color:#ff9d7f">OPPONENT</div>${snapshot.theirs.map(monLine).join('')}
    ${result ? `<div style="color:#ff9d7f;margin-top:8px">THREATS TO YOU</div>${lines(result.incoming)}` : ''}`;

  boardDiv.innerHTML = `
    <div style="opacity:.5">turn ${snapshot.turn} · ${field}</div>
    <div style="display:flex;gap:14px;margin-top:8px">
      <div style="flex:1;min-width:0">${mine}</div>
      <div style="flex:1;min-width:0;border-left:1px solid #2a2d33;padding-left:14px">${theirs}</div>
    </div>
    ${result ? '' : '<div style="opacity:.5;margin-top:10px">calculating…</div>'}`;
}

// ---- snapshot handling -----------------------------------------------------
let seq = 0;
let latestSnapshot: BattleSnapshot | null = null;
let latestResult: LiveResult | null = null;
let latestMyPokemon: MyPokemon[] = [];

async function onSnapshot(snapshot: BattleSnapshot, myPokemon: MyPokemon[]): Promise<void> {
  latestSnapshot = snapshot;
  latestMyPokemon = myPokemon;
  render(snapshot); // board first, instantly
  const mySeq = ++seq;
  try {
    const resolved = await resolveLiveFormat(snapshot);
    const result = await computeLive(snapshot, myPokemon, setService, resolved);
    if (mySeq === seq) {
      latestResult = result;
      render(snapshot, result); // ignore if a newer snapshot arrived
    }
  } catch (e) {
    console.error('[vgc-calc] calc failed', e);
  }
}

window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || d.source !== TAG || !d.snapshot) return;
  void onSnapshot(d.snapshot as BattleSnapshot, (d.myPokemon ?? []) as MyPokemon[]);
});

// ---- ask the agent ---------------------------------------------------------
/** Your full team (all 6, exact) from the |request| data — known even on the bench. */
function formatMyTeam(team: MyPokemon[]): string[] {
  return team.map((p) => {
    const species = p.details.split(',')[0].trim();
    const st = p.stats ? `atk ${p.stats.atk}/def ${p.stats.def}/spa ${p.stats.spa}/spd ${p.stats.spd}/spe ${p.stats.spe}` : '';
    const bits = [st, p.item, p.ability, p.teraType && `Tera ${p.teraType}`, p.moves?.length && `moves: ${p.moves.join('/')}`]
      .filter(Boolean)
      .join('; ');
    return `- ${species}${bits ? ` (${bits})` : ''}`;
  });
}

/** Compact text of the board + exact calc table for the LLM context. */
function formatContext(s: BattleSnapshot, r: LiveResult | null, myTeam: MyPokemon[]): string {
  const f = s.field;
  const field = [f.weather, f.terrain && `${f.terrain} terrain`, f.trickRoom && 'Trick Room', f.gravity && 'Gravity',
    f.mySide.tailwind && 'your Tailwind', f.theirSide.tailwind && 'their Tailwind'].filter(Boolean).join(', ') || 'none';
  const mon = (m: BattleSnapshot['mine'][number]) => {
    if (!m) return null;
    const hp = m.known && m.hp != null ? `${m.hpPercent}% (${m.hp}/${m.maxHP})` : `${m.hpPercent}%`;
    const extra = [m.status && m.status, Object.keys(m.boosts).length && JSON.stringify(m.boosts),
      m.terastallized && `Tera ${m.teraType}`, m.item, m.ability,
      m.revealedMoves.length && `moves: ${m.revealedMoves.join('/')}`].filter(Boolean).join(', ');
    return `- ${m.species} ${hp}${extra ? `; ${extra}` : ''}`;
  };
  const line = (l: LiveResult['incoming'][number]) =>
    `- ${l.estimated ? '[est] ' : ''}${l.attacker} ${l.move} -> ${l.defender}: ${l.percent[0]}-${l.percent[1]}% (${l.ko})`;
  return [
    `Turn ${s.turn}, ${f.gameType}, format ${s.tier}. Field: ${field}.`,
    'Your active:', ...s.mine.map(mon).filter(Boolean),
    'Opponent active:', ...s.theirs.map(mon).filter(Boolean),
    myTeam.length ? 'Your full team (exact, includes bench):' : '',
    ...formatMyTeam(myTeam),
    s.theirTeam.length ? `Opponent team (from preview): ${s.theirTeam.join(', ')}.` : '',
    r ? 'Damage table for the active matchup (exact):' : '',
    ...(r ? ['Threats to you:', ...r.incoming.map(line), 'Your damage:', ...r.outgoing.map(line)] : []),
  ].filter(Boolean).join('\n');
}

const MODEL = 'claude-haiku-4-5';
const SYSTEM = `You are a Pokemon VGC/Showdown live-battle assistant, speaking to the player mid-game.
You are given the current battle state and a PRECOMPUTED damage table from the real Showdown engine
for the ACTIVE matchup — read those numbers, never invent them. For any OTHER matchup (a bench mon, a
Tera, a stat boost, a hypothetical switch-in), call the run_calc tool to get an exact number; do not
estimate it yourself. Numbers marked [est] use an inferred opponent set (item/ability not yet revealed).
Answer in 1-2 short spoken sentences like a teammate calling a play: name the move, the roll, the KO.`;

const RUN_CALC_TOOL = {
  name: 'run_calc',
  description:
    'Run an exact Showdown damage calc for ANY single matchup not already in the active damage table: bench Pokemon, a different move, an applied Tera type, or stat boosts. Returns the damage % range and KO chance.',
  input_schema: {
    type: 'object',
    properties: {
      attacker: { type: 'string', description: 'attacking Pokemon species, e.g. "Garchomp"' },
      defender: { type: 'string', description: 'defending Pokemon species' },
      move: { type: 'string', description: 'move name, e.g. "Earth Power"' },
      attacker_side: { type: 'string', enum: ['mine', 'theirs'], description: 'whose Pokemon is the attacker — "mine" uses your exact set, "theirs" the inferred opponent set' },
      tera_attacker: { type: 'string', description: 'optional Tera type to terastallize the attacker' },
      attacker_boosts: { type: 'object', description: 'optional stat stages on the attacker, e.g. {"atk":2}' },
      defender_boosts: { type: 'object', description: 'optional stat stages on the defender, e.g. {"def":1}' },
    },
    required: ['attacker', 'defender', 'move', 'attacker_side'],
  },
};

type ToolInput = {
  attacker: string; defender: string; move: string; attacker_side: 'mine' | 'theirs';
  tera_attacker?: string; attacker_boosts?: Record<string, number>; defender_boosts?: Record<string, number>;
};
const toHypo = (i: ToolInput): HypoRequest => ({
  attacker: i.attacker, defender: i.defender, move: i.move, attackerSide: i.attacker_side,
  teraAttacker: i.tera_attacker, attackerBoosts: i.attacker_boosts, defenderBoosts: i.defender_boosts,
});

const callLLM = (body: unknown): Promise<{ message?: any; error?: string }> =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'vgc-llm', body }, (resp) =>
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : resp),
    ),
  );

async function askAgent(question: string): Promise<string> {
  if (!latestSnapshot) return 'No battle loaded yet.';
  const resolved = await resolveLiveFormat(latestSnapshot);
  const context = formatContext(latestSnapshot, latestResult, latestMyPokemon);
  const messages: any[] = [{ role: 'user', content: `${context}\n\nPlayer asks: ${question}` }];

  for (let round = 0; round < 4; round++) {
    const resp = await callLLM({ model: MODEL, max_tokens: 500, system: SYSTEM, tools: [RUN_CALC_TOOL], messages });
    if (resp.error) return `Error: ${resp.error}`;
    const msg = resp.message;
    messages.push({ role: 'assistant', content: msg.content });

    if (msg.stop_reason === 'tool_use') {
      const results = [];
      for (const block of msg.content) {
        if (block.type !== 'tool_use') continue;
        const out = await runHypothetical(toHypo(block.input as ToolInput), latestSnapshot, latestMyPokemon, setService, resolved);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    return msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').trim() || '(no answer)';
  }
  return 'Stopped after several tool calls — try a more specific question.';
}

const qInput = askDiv.querySelector('#vgc-q') as HTMLInputElement;
const aDiv = askDiv.querySelector('#vgc-a') as HTMLDivElement;
const micBtn = askDiv.querySelector('#vgc-mic') as HTMLButtonElement;

/** Run a question and (for voice) speak the answer back. */
function submit(question: string, speak: boolean): void {
  question = question.trim();
  if (!question) return;
  aDiv.textContent = 'thinking…';
  askAgent(question).then((answer) => {
    aDiv.textContent = answer;
    if (speak) speakOut(answer);
  });
}

function speakOut(text: string): void {
  try {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* no TTS available */
  }
}

qInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submit(qInput.value, false); // typed: show, don't speak
});

// ---- voice (Web Speech, native to Chrome) ----------------------------------
const SR = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;
let recog: any = null;
let listening = false;

micBtn.addEventListener('click', () => {
  if (!SR) { aDiv.textContent = 'Voice input is not supported in this browser.'; return; }
  if (listening) { recog?.stop(); return; }
  recog = new SR();
  recog.lang = 'en-US';
  recog.interimResults = true;
  recog.continuous = false;
  listening = true;
  micBtn.textContent = '🔴';
  speechSynthesis.cancel(); // don't transcribe our own TTS
  recog.onresult = (e: any) => {
    const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
    qInput.value = transcript;
    if (e.results[e.results.length - 1].isFinal) submit(transcript, true); // voice: speak the answer
  };
  recog.onerror = (e: any) => { aDiv.textContent = `Voice error: ${e.error}`; };
  recog.onend = () => { listening = false; micBtn.textContent = '🎤'; };
  recog.start();
});
