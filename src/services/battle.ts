/**
 * Showdown live-battle reader: translate the client-side `room.battle` object
 * (see extension/probe.js for its shape) into a UI-independent snapshot the calc
 * can consume. Pure and synchronous — no set inference here.
 *
 * The defining fact of a live battle is information asymmetry:
 *   - YOUR side reports exact HP and (once revealed) real item/ability.
 *   - the OPPONENT's HP is only ever a percent (maxhp === 100), and item /
 *     ability / unrevealed moves / tera are blank until shown.
 * So each mapped mon carries `known`: true for your side (use as-is), false for
 * the opponent (fill the gaps from usage stats via sets.ts, then overlay the
 * revealed facts this snapshot does expose — species, boosts, revealed moves).
 */
import type { StatsTable } from '@pkmn/data';
import type { Weather, Terrain, Status, SideConditions } from './conditions';

/** Minimal shape we read off the Showdown client battle object. */
interface SdPokemon {
  speciesForme: string;
  level: number;
  gender?: string;
  fainted: boolean;
  hp: number;
  maxhp: number;
  status: string;
  boosts: Partial<Record<string, number>>;
  item: string;
  ability: string;
  teraType: string;
  terastallized: string;
  moveTrack: [string, number][];
}
interface SdSide {
  active: (SdPokemon | null)[];
  pokemon?: { speciesForme?: string }[]; // full team (species known from team preview)
  sideConditions?: Record<string, unknown>;
}
export interface SdBattle {
  gen: number;
  tier: string;
  gameType: string;
  turn: number;
  weather: string;
  pseudoWeather: unknown[];
  mySide?: SdSide | null;
  nearSide?: SdSide | null;
  farSide?: SdSide | null;
}

export interface BattleMon {
  /** speciesForme, e.g. 'Ogerpon-Wellspring'. */
  species: string;
  level: number;
  gender?: string;
  fainted: boolean;
  /** Current HP as % of max (0-100) — the only HP figure known for the opponent. */
  hpPercent: number;
  /** Absolute current / max HP, present only when the client reports exact HP (your side). */
  hp?: number;
  maxHP?: number;
  status: Status;
  boosts: Partial<StatsTable>;
  /** Active Tera type, only if terastallized. */
  teraType?: string;
  terastallized: boolean;
  /** Publicly revealed moves (subset of the real set for the opponent). */
  revealedMoves: string[];
  /** Revealed item; undefined when not yet known. */
  item?: string;
  /** Revealed ability; undefined when not yet known. */
  ability?: string;
  /** true = full info (your side); false = opponent, fill gaps from usage stats. */
  known: boolean;
}

export interface BattleField {
  gameType: 'Singles' | 'Doubles';
  weather?: Weather;
  terrain?: Terrain;
  gravity: boolean;
  trickRoom: boolean;
  mySide: SideConditions;
  theirSide: SideConditions;
}

export interface BattleSnapshot {
  gen: number;
  /** Raw Showdown format string, e.g. '[Gen 9] VGC 2024 Reg G'. */
  tier: string;
  turn: number;
  /** Active slots (0 = left, 1 = right); null = empty / no mon out. */
  mine: (BattleMon | null)[];
  theirs: (BattleMon | null)[];
  /** Full team species (known from team preview), both active and benched. */
  myTeam: string[];
  theirTeam: string[];
  field: BattleField;
}

// Showdown weather ids -> the calc's Weather union. deltastream has no calc
// weather effect, so it maps to nothing.
const WEATHER: Record<string, Weather> = {
  sandstorm: 'Sand',
  sunnyday: 'Sun',
  desolateland: 'Sun',
  raindance: 'Rain',
  primordialsea: 'Rain',
  snow: 'Snow',
  snowscape: 'Snow',
  hail: 'Snow',
};
const TERRAIN: Record<string, Terrain> = {
  electricterrain: 'Electric',
  grassyterrain: 'Grassy',
  mistyterrain: 'Misty',
  psychicterrain: 'Psychic',
};
const STATUSES: Status[] = ['brn', 'psn', 'tox', 'par', 'slp', 'frz'];
const BOOST_KEYS: (keyof StatsTable)[] = ['atk', 'def', 'spa', 'spd', 'spe'];

/** pseudoWeather entries are `[id, ...]` tuples (or bare ids); normalise to ids. */
function pseudoIds(pw: unknown[]): string[] {
  return pw.map((e) => (Array.isArray(e) ? String(e[0]) : String(e)));
}

function mapBoosts(b: Partial<Record<string, number>>): Partial<StatsTable> {
  const out: Partial<StatsTable> = {};
  for (const k of BOOST_KEYS) if (b[k]) out[k] = b[k];
  return out;
}

function mapSide(s?: Record<string, unknown> | null): SideConditions {
  const keys = s ? Object.keys(s).map((k) => k.toLowerCase()) : [];
  const has = (k: string) => keys.includes(k);
  return {
    lightScreen: has('lightscreen'),
    reflect: has('reflect'),
    auroraVeil: has('auroraveil'),
    tailwind: has('tailwind'),
    // helping hand is a per-turn status and friend guard an ability — not side
    // conditions in the client; left false and set by the per-mon logic instead.
    helpingHand: false,
    friendGuard: false,
  };
}

function mapMon(p: SdPokemon | null, known: boolean): BattleMon | null {
  if (!p) return null;
  const status = (STATUSES as string[]).includes(p.status) ? (p.status as Status) : '';
  // moveTrack entries can carry a '*' marker (revealed via open team sheet).
  const revealedMoves = (p.moveTrack ?? []).map(([m]) => m.replace(/\*/g, '').trim()).filter(Boolean);
  const exact = known && p.maxhp !== 100; // opponent maxhp is always the 100-scale percent
  return {
    species: p.speciesForme,
    level: p.level,
    gender: p.gender || undefined,
    fainted: p.fainted,
    hpPercent: p.maxhp ? Math.round((p.hp / p.maxhp) * 100) : 0,
    hp: exact ? p.hp : undefined,
    maxHP: exact ? p.maxhp : undefined,
    status,
    boosts: mapBoosts(p.boosts ?? {}),
    teraType: p.terastallized ? p.terastallized : p.teraType || undefined,
    terastallized: !!p.terastallized,
    revealedMoves,
    item: p.item || undefined,
    ability: p.ability || undefined,
    known,
  };
}

/** Map a live Showdown client battle object into a calc-ready snapshot. */
export function mapBattle(b: SdBattle): BattleSnapshot {
  const ids = pseudoIds(b.pseudoWeather ?? []);
  // The viewer's own side has full info; everything else is opponent info.
  const mySide = b.mySide ?? null;
  const theirSide = mySide && b.farSide === mySide ? b.nearSide ?? null : b.farSide ?? null;
  const team = (s: SdSide | null) =>
    (s?.pokemon ?? []).map((p) => p.speciesForme).filter((x): x is string => !!x);
  return {
    gen: b.gen,
    tier: b.tier,
    turn: b.turn,
    mine: (mySide?.active ?? []).map((p) => mapMon(p, true)),
    theirs: (theirSide?.active ?? []).map((p) => mapMon(p, false)),
    myTeam: team(mySide),
    theirTeam: team(theirSide),
    field: {
      gameType: b.gameType === 'doubles' ? 'Doubles' : 'Singles',
      weather: WEATHER[b.weather] ?? undefined,
      terrain: ids.map((i) => TERRAIN[i]).find(Boolean),
      gravity: ids.includes('gravity'),
      trickRoom: ids.includes('trickroom'),
      mySide: mapSide(mySide?.sideConditions),
      theirSide: mapSide(theirSide?.sideConditions),
    },
  };
}
