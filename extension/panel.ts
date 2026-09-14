/**
 * DOM builders for the overlay panel (no chrome APIs, no network). Every string
 * from the battle goes in as a text node, so page data can never inject markup.
 *
 * The board is one compact grid per direction: the attacking side's moves down
 * the side, the defending side's live Pokémon across the top, damage % per cell.
 */
import type { BattleMon, BattleSnapshot } from '../src/services/battle';
import type { LiveResult, MatchupLine } from '../src/services/live';
import type { SideConditions } from '../src/services/conditions';

type Child = Node | string | null | undefined | false;

/** Which grid is showing: your moves into them, or their moves into you. */
export type View = 'out' | 'in';

/**
 * How the damage cells are shown: `busy` while a new calc runs (cells may be the previous
 * board's), `animate` when the numbers changed, `dim` to dim at once rather than after a delay.
 */
export interface RowState {
  busy: boolean;
  animate: boolean;
  dim: boolean;
}

/** Create an element with a class and children; strings become text nodes. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const c of children) if (c) node.append(c);
  return node;
}

function chip(text: string, cls = '', title?: string): HTMLElement {
  const c = el('span', cls ? `vgc-chip ${cls}` : 'vgc-chip', text);
  if (title) c.title = title;
  return c;
}

const STATUS: Record<string, string> = { brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' };
const STAT: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
const SIDE_EFFECTS: [keyof SideConditions, string][] = [
  ['tailwind', 'Tailwind'],
  ['reflect', 'Reflect'],
  ['lightScreen', 'Light Screen'],
  ['auroraVeil', 'Aurora Veil'],
];
const GUESSED = "Opponent's item or ability isn't revealed yet: set guessed from usage stats";

const live = (side: (BattleMon | null)[]): BattleMon[] => side.filter((m): m is BattleMon => !!m && !m.fainted);
const pct = (v: number): string => String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

/** Name, HP and the damage-relevant chips (status, boosts, Tera); item and ability sit in the tooltip. */
function monLabel(m: BattleMon, guessed: boolean): HTMLElement {
  const name = el('span', 'vgc-name', m.species);
  name.title = [m.species, m.item, m.ability].filter(Boolean).join(' · ');
  return el(
    'span',
    'vgc-mon',
    name,
    el('span', 'vgc-hp', `${m.hpPercent}%`),
    m.status && chip(STATUS[m.status] ?? m.status.toUpperCase(), 'bad'),
    ...Object.entries(m.boosts)
      .filter(([, v]) => v)
      .map(([k, v]) => chip(`${v! > 0 ? '+' : ''}${v} ${STAT[k] ?? k}`, v! > 0 ? 'good' : 'neg')),
    m.terastallized && chip(`Tera ${m.teraType}`, 'tera'),
    guessed && chip('EST', 'est', GUESSED),
  );
}

function cell(line: MatchupLine | undefined, busy: boolean): HTMLElement {
  const td = el('td', 'vgc-cell');
  if (!line) td.append(el('span', 'vgc-quiet', busy ? '…' : '-'));
  else if (line.kind === 'status') td.append(el('span', 'vgc-quiet', 'status'));
  else if (line.kind === 'none') {
    td.append(el('span', 'vgc-quiet', '0%'));
    td.title = 'No effect';
  } else {
    td.title = `${line.percent[0]}-${line.percent[1]}%${line.ko ? `: ${line.ko}` : ''}`;
    td.append(
      el('span', 'vgc-pct', `${pct(line.percent[0])}-${pct(line.percent[1])}%`),
      line.koShort && el('span', line.koChance === 1 ? 'vgc-ko good' : 'vgc-ko', line.koShort),
    );
  }
  return td;
}

function wideRow(cols: number, cls: string, ...children: Child[]): HTMLElement {
  const td = el('td', cls, ...children);
  td.colSpan = cols;
  return el('tr', '', td);
}

function grid(view: View, attackers: BattleMon[], defenders: BattleMon[], lines: MatchupLine[] | undefined, state: RowState): HTMLElement {
  const table = el('table', `vgc-grid ${view}${state.animate ? ' fresh' : state.dim ? ' dim' : ''}`);
  if (state.busy) table.setAttribute('aria-busy', 'true');
  const guessed = (species: string) => !!lines?.some((l) => (view === 'out' ? l.defender : l.attacker) === species && l.estimated);
  const cols = defenders.length + 1;

  const head = el('tr', '', el('th', 'vgc-corner', el('span', 'sr-only', 'Move')));
  for (const d of defenders) {
    const th = el('th', 'vgc-def', monLabel(d, view === 'out' && guessed(d.species)));
    th.scope = 'col';
    head.append(th);
  }

  const body = el('tbody');
  let row = 0;
  for (const a of attackers) {
    const group = el('th', 'vgc-atk', monLabel(a, view === 'in' && guessed(a.species)));
    group.colSpan = cols;
    group.scope = 'colgroup';
    body.append(el('tr', 'vgc-atk-row', group));

    const own = lines?.filter((l) => l.attacker === a.species) ?? [];
    const moves = [...new Set(own.map((l) => l.move))];
    if (!moves.length && state.busy) {
      body.append(wideRow(cols, 'vgc-skel-cell', el('span', 'skel w-70')), wideRow(cols, 'vgc-skel-cell', el('span', 'skel w-40')));
    } else if (!moves.length) {
      body.append(wideRow(cols, 'vgc-quiet', lines ? 'No known moves yet.' : "Couldn't calculate this board."));
    }
    for (const move of moves) {
      const name = el('th', 'vgc-move', move);
      name.scope = 'row';
      name.title = move;
      const tr = el('tr', 'vgc-move-row', name, ...defenders.map((d) => cell(own.find((l) => l.move === move && l.defender === d.species), state.busy)));
      tr.style.setProperty('--i', String(Math.min(row++, 10)));
      body.append(tr);
    }
  }
  table.append(el('thead', '', head), body);
  return table;
}

function fieldEffects(s: BattleSnapshot): string[] {
  const f = s.field;
  const on = [f.weather, f.terrain && `${f.terrain} Terrain`, f.trickRoom && 'Trick Room', f.gravity && 'Gravity'].filter(
    Boolean,
  ) as string[];
  for (const [who, conditions] of [['Your', f.mySide], ['Their', f.theirSide]] as const) {
    for (const [key, label] of SIDE_EFFECTS) if (conditions[key]) on.push(`${who} ${label}`);
  }
  return on;
}

/** Rebuild the board for a snapshot. While `state.busy`, `result` may still be the previous board's. */
export function renderBoard(
  board: HTMLElement,
  headChips: HTMLElement,
  s: BattleSnapshot,
  result: LiveResult | null,
  formatLabel: string,
  state: RowState,
  view: View,
): void {
  headChips.replaceChildren(chip(formatLabel, '', s.tier), chip(`Turn ${s.turn}`));
  const [attackers, defenders, lines] =
    view === 'out' ? [live(s.mine), live(s.theirs), result?.outgoing] : [live(s.theirs), live(s.mine), result?.incoming];
  const effects = fieldEffects(s);
  const nodes: Node[] = [];
  if (effects.length) nodes.push(el('div', 'vgc-field', ...effects.map((t) => chip(t, 'on'))));
  nodes.push(
    attackers.length && defenders.length
      ? grid(view, attackers, defenders, lines, state)
      : el('p', 'vgc-quiet', 'Waiting for Pokémon on the field.'),
  );
  board.replaceChildren(...nodes);
}
