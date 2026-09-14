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
 * out. Page and LLM strings are rendered as text only (panel.ts).
 */
import { computeLive, runHypothetical, battleLevel, type MyPokemon, type LiveResult, type HypoRequest } from '../src/services/live';
import type { BattleSnapshot } from '../src/services/battle';
import { setService } from '../src/services/sets';
import { resolveFormat, liveFormatDef, type ResolvedFormat } from '../src/services/formats';
import { installFonts, themeSheet } from './theme';
import { el, renderBoard } from './panel';
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
// Board is re-rendered every snapshot; the ask area below it persists.
const board = el('div', 'vgc-board', el('p', 'vgc-muted', 'Waiting for a battle…'));
const micBtn = el('button', 'vgc-btn vgc-mic', 'Mic');
micBtn.type = 'button';
micBtn.title = 'Ask by voice (click to start, click again to stop)';
micBtn.setAttribute('aria-label', 'Ask by voice');
micBtn.setAttribute('aria-pressed', 'false');
const qInput = el('input', 'vgc-input');
qInput.placeholder = 'Ask… or tap Mic';
qInput.setAttribute('aria-label', 'Ask the battle assistant');
const aDiv = el('div', 'vgc-answer');
aDiv.setAttribute('aria-live', 'polite');
const body = el('div', 'vgc-body', board, el('div', 'vgc-ask', el('div', 'vgc-ask-row', micBtn, qInput), aDiv));
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
let latestSnapshot: BattleSnapshot | null = null;
let latestResult: LiveResult | null = null;
let latestMyPokemon: MyPokemon[] = [];
let battleRoom = '';
let shownResult = '';
let wasBusy = false;

function render(snapshot: BattleSnapshot, result: LiveResult | null, busy: boolean): void {
  mount();
  // Rows animate in only when the numbers changed, not on every HP/boost tick.
  const key = result ? JSON.stringify(result) : '';
  const animate = !busy && key !== shownResult;
  if (!busy) shownResult = key;
  // A calc spanning several snapshots stays dimmed instead of restarting the delayed dim each time.
  const dim = busy && wasBusy;
  wasBusy = busy;
  renderBoard(board, headChips, snapshot, result, formatLabel(snapshot), { busy, animate, dim });
}

async function onSnapshot(snapshot: BattleSnapshot, myPokemon: MyPokemon[], roomId: string): Promise<void> {
  const room = roomId || snapshot.tier;
  if (room !== battleRoom) {
    battleRoom = room;
    latestResult = null; // a new battle shows a skeleton, never the last battle's numbers
  }
  latestSnapshot = snapshot;
  latestMyPokemon = myPokemon;
  render(snapshot, latestResult, true); // board first, instantly; last numbers stay dimmed until the new ones land
  const mySeq = ++seq;
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

// ---- ask the agent ---------------------------------------------------------
/** Your full team (all 6, exact) from the |request| data, known even on the bench. */
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
for the ACTIVE matchup: read those numbers, never invent them. For any OTHER matchup (a bench mon, a
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
      attacker_side: { type: 'string', enum: ['mine', 'theirs'], description: 'whose Pokemon is the attacker: "mine" uses your exact set, "theirs" the inferred opponent set' },
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
  return 'Stopped after several tool calls. Try a more specific question.';
}

/** Run a question and (for voice) speak the answer back. */
function submit(question: string, speak: boolean): void {
  question = question.trim();
  if (!question) return;
  aDiv.textContent = 'Thinking…';
  aDiv.classList.add('busy');
  askAgent(question).then((answer) => {
    aDiv.textContent = answer;
    aDiv.classList.remove('busy');
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

function setListening(on: boolean): void {
  listening = on;
  micBtn.setAttribute('aria-pressed', String(on));
  micBtn.textContent = on ? 'Stop' : 'Mic';
}

micBtn.addEventListener('click', () => {
  if (!SR) { aDiv.textContent = 'Voice input is not supported in this browser.'; return; }
  if (listening) { recog?.stop(); return; }
  recog = new SR();
  recog.lang = 'en-US';
  recog.interimResults = true;
  recog.continuous = false;
  setListening(true);
  speechSynthesis.cancel(); // don't transcribe our own TTS
  recog.onresult = (e: any) => {
    const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
    qInput.value = transcript;
    if (e.results[e.results.length - 1].isFinal) submit(transcript, true); // voice: speak the answer
  };
  recog.onerror = (e: any) => { aDiv.textContent = `Voice error: ${e.error}`; };
  recog.onend = () => setListening(false);
  recog.start();
});
