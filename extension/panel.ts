/**
 * DOM builders for the overlay panel (no chrome APIs, no network). Every string
 * from the battle goes in as a text node, so page data can never inject markup.
 */
import type { BattleMon, BattleSnapshot } from '../src/services/battle';
import type { LiveResult, MatchupLine } from '../src/services/live';
import type { SideConditions } from '../src/services/conditions';

type Child = Node | string | null | undefined | false;

/**
 * How the damage rows are shown: `busy` while a new calc runs (rows may be the previous
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

function monCard(m: BattleMon | null): HTMLElement {
  if (!m) return el('div', 'vgc-mon empty', 'Empty slot');
  const species = el('span', 'vgc-species', m.species);
  species.title = m.species;
  const hp = el(
    'span',
    'vgc-hp',
    m.known && m.hp != null ? el('span', 'vgc-hp-abs', `${m.hp}/${m.maxHP} `) : null,
    m.fainted ? 'FNT' : `${m.hpPercent}%`,
  );
  const chips = [
    m.status && chip(STATUS[m.status] ?? m.status.toUpperCase(), 'bad'),
    ...Object.entries(m.boosts)
      .filter(([, v]) => v)
      .map(([k, v]) => chip(`${v! > 0 ? '+' : ''}${v} ${STAT[k] ?? k}`, v! > 0 ? 'good' : 'neg')),
    m.terastallized && chip(`Tera ${m.teraType}`, 'tera'),
    m.item && chip(m.item),
    m.ability && chip(m.ability),
  ].filter(Boolean) as HTMLElement[];
  return el(
    'div',
    m.fainted ? 'vgc-mon fainted' : 'vgc-mon',
    el('div', 'vgc-mon-top', species, hp),
    chips.length > 0 && el('div', 'vgc-chips', ...chips),
  );
}

function damageRow(l: MatchupLine, i: number): HTMLElement {
  const row = el(
    'div',
    'vgc-dmg',
    el(
      'div',
      'vgc-dmg-top',
      el('span', 'vgc-move', l.move),
      l.estimated && chip('EST', 'est', "Opponent's item or ability isn't revealed yet: set guessed from usage stats"),
    ),
    el('div', 'vgc-who', `${l.attacker} → ${l.defender}`),
    el(
      'div',
      'vgc-dmg-num',
      el('span', 'vgc-pct', `${l.percent[0]}-${l.percent[1]}%`),
      l.ko && el('span', /guaranteed/i.test(l.ko) ? 'vgc-ko good' : 'vgc-ko', l.ko),
    ),
  );
  row.style.setProperty('--i', String(Math.min(i, 8)));
  return row;
}

/** Damage rows; while `busy` they are the previous board's (dimmed) or a skeleton on first load. */
function damageList(rows: MatchupLine[] | undefined, { busy, animate, dim }: RowState): HTMLElement {
  const list = el('div', animate ? 'vgc-dmgs fresh' : dim ? 'vgc-dmgs dim' : 'vgc-dmgs');
  if (busy) list.setAttribute('aria-busy', 'true');
  if (rows?.length) list.append(...rows.map(damageRow));
  else if (rows) list.append(el('p', 'vgc-none', 'No damaging moves known yet.'));
  else if (busy)
    list.append(
      el('span', 'sr-only', 'Calculating'),
      ...[0, 1].map(() => el('div', 'vgc-skel-row', el('span', 'skel w-70'), el('span', 'skel w-40'))),
    );
  else list.append(el('p', 'vgc-none', "Couldn't calculate this board."));
  return list;
}

function sideColumn(
  title: string,
  damageTitle: string,
  cls: string,
  mons: (BattleMon | null)[],
  rows: MatchupLine[] | undefined,
  state: RowState,
): HTMLElement {
  return el(
    'section',
    `vgc-col ${cls}`,
    el('h2', 'vgc-h', title),
    ...mons.map(monCard),
    el('h2', 'vgc-h gap', damageTitle),
    damageList(rows, state),
  );
}

function fieldChips(s: BattleSnapshot): HTMLElement[] {
  const f = s.field;
  const on = [f.weather, f.terrain && `${f.terrain} Terrain`, f.trickRoom && 'Trick Room', f.gravity && 'Gravity'].filter(
    Boolean,
  ) as string[];
  for (const [who, conditions] of [['Your', f.mySide], ['Their', f.theirSide]] as const) {
    for (const [key, label] of SIDE_EFFECTS) if (conditions[key]) on.push(`${who} ${label}`);
  }
  return on.length ? on.map((t) => chip(t, 'on')) : [chip('No field effects')];
}

/** Rebuild the board for a snapshot. While `state.busy`, `result` may still be the previous board's. */
export function renderBoard(
  board: HTMLElement,
  headChips: HTMLElement,
  s: BattleSnapshot,
  result: LiveResult | null,
  formatLabel: string,
  state: RowState,
): void {
  headChips.replaceChildren(chip(formatLabel, '', s.tier), chip(`Turn ${s.turn}`));
  board.replaceChildren(
    el('div', 'vgc-field', el('span', 'vgc-label', 'Field'), ...fieldChips(s)),
    el(
      'div',
      'vgc-cols',
      sideColumn('Your side', 'Your damage', 'mine', s.mine, result?.outgoing, state),
      sideColumn('Opponent', 'Threats to you', 'theirs', s.theirs, result?.incoming, state),
    ),
  );
}
