/**
 * Team-paste parsing: Showdown export text -> structured roster cards.
 * Drives the headline "paste your team" flow. Never throws on bad input.
 */
import { Teams, type PokemonSet } from '@pkmn/sets';
import type { Data } from '@pkmn/sets';
import { gen, isMegaSpecies } from './data';
import { spriteUrl } from './sprites';
import type { PokemonOptions } from './calc';
import type { FormatDef } from './formats';
import legalSpecies from './legal-species.json';

// Exact-to-Showdown legal species pool per format (by species id), precomputed
// from @pkmn/sim rules — see scripts/gen-legal.ts. A format absent here (or an
// unknown id) means "no restriction": show the whole dex.
const LEGAL: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(legalSpecies as Record<string, string[]>).map(([f, ids]) => [f, new Set(ids)]),
);

export interface RosterMon {
  /** Stable key for React / drag-and-drop. */
  id: string;
  set: PokemonSet;
  /** Nickname if given, else the species. */
  displayName: string;
  /** Resolved species name as stored in the dex (may include forme). */
  speciesName: string;
  baseSpecies: string;
  forme?: string;
  types: string[];
  spriteUrl: string;
  teraType?: string;
}

export interface ParseResult {
  roster: RosterMon[];
  errors: string[];
}

/** Map a parsed Showdown set to calc Pokémon options (plain strings). */
export function setToPokemonOptions(set: PokemonSet): PokemonOptions {
  return {
    level: set.level || undefined,
    ability: set.ability || undefined,
    item: itemForCalc(set),
    nature: set.nature || undefined,
    teraType: set.teraType || undefined,
    moves: set.moves?.filter(Boolean),
    evs: set.evs,
    ivs: set.ivs,
  };
}

/**
 * Item to feed the calc engine. Mega/Primal formes are already resolved by
 * species (the forme toggle), so their required Mega Stone / Orb must NOT reach
 * the engine: the adaptable build has no mega-item data, and a held stone sends
 * it down its stone-based auto-mega path, which throws
 * ("Cannot read properties of undefined (reading 'megaStone')") on every calc.
 * The stone stays on the display set; it has no damage effect anyway.
 */
function itemForCalc(set: PokemonSet): string | undefined {
  // Only items the Generation knows. That drops every stone (not admitted) even
  // on a base forme (Champions usage ranks Garchompite first for Garchomp) and
  // dex-lagging Champions items like Leek; any unknown item throws as a defender.
  return set.item && gen.items.get(set.item) ? set.item : undefined;
}

const EMPTY_STATS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** Build a full PokemonSet from loose fields (e.g. a suggested opponent set). */
export function makeSet(
  fields: Omit<Partial<PokemonSet>, 'evs' | 'ivs'> & {
    species: string;
    evs?: Partial<import('@pkmn/data').StatsTable>;
    ivs?: Partial<import('@pkmn/data').StatsTable>;
  },
): PokemonSet {
  return {
    name: '',
    item: '',
    ability: '',
    nature: 'Serious',
    gender: '',
    moves: [],
    level: 50,
    ...fields,
    evs: { ...EMPTY_STATS, ...(fields.evs ?? {}) },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...(fields.ivs ?? {}) },
  };
}

/** Build a roster card from a set (used for opponent picks). Null on unknown species. */
export function rosterMonFromSet(set: PokemonSet, idPrefix = 'pick'): RosterMon | null {
  const r = toRosterMon(set, 0, idPrefix);
  return 'error' in r ? null : r;
}

function toRosterMon(set: PokemonSet, index: number, idPrefix = 't'): RosterMon | { error: string } {
  const species = gen.species.get(set.species);
  if (!species) {
    return { error: `Unknown Pokémon: "${set.species || set.name || '(blank)'}"` };
  }
  const forme = species.baseSpecies !== species.name ? species.forme : undefined;
  return {
    id: `${idPrefix}-${index}-${species.id}`,
    set: { ...set, species: species.name },
    displayName: set.name || species.name,
    speciesName: species.name,
    baseSpecies: species.baseSpecies,
    forme,
    types: [...species.types],
    spriteUrl: spriteUrl(species.baseSpecies, forme),
    teraType: set.teraType,
  };
}

export interface SpeciesEntry {
  id: string;
  name: string;
  baseSpecies: string;
  forme?: string;
  num: number;
  types: string[];
}

/** Base (non-Mega/Primal) species, built once, for the opponent search picker.
 * Megas are reached via the forme toggle, not the species search. */
let speciesIndex: SpeciesEntry[] | null = null;
function index(): SpeciesEntry[] {
  if (speciesIndex) return speciesIndex;
  const out: SpeciesEntry[] = [];
  for (const sp of gen.species) {
    if (isMegaSpecies(sp)) continue;
    out.push({ id: sp.id, name: sp.name, baseSpecies: sp.baseSpecies, forme: sp.forme, num: sp.num, types: [...sp.types] });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  speciesIndex = out;
  return out;
}

/**
 * Case-insensitive substring search over species names, dex order on ties,
 * restricted to the format's legal pool when one is known (unknown/absent
 * format => whole dex).
 */
export function searchSpecies(query: string, limit = 40, formatId?: string): SpeciesEntry[] {
  const q = query.trim().toLowerCase();
  const legal = formatId ? LEGAL[formatId] : undefined;
  const all = legal ? index().filter((e) => legal.has(e.id)) : index();
  if (!q) return all.slice(0, limit);
  const starts: SpeciesEntry[] = [];
  const contains: SpeciesEntry[] = [];
  for (const e of all) {
    const n = e.name.toLowerCase();
    if (n.startsWith(q)) starts.push(e);
    else if (n.includes(q)) contains.push(e);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** All nature names, built once, for the manual spread editor. */
let natureList: string[] | null = null;
export function natures(): string[] {
  if (natureList) return natureList;
  natureList = [...gen.natures].map((n) => n.name).sort();
  return natureList;
}

export interface FormeOption {
  name: string;
  label: string;
  isMega: boolean;
}

/** True if a species name resolves to a Mega/Primal forme in the data. */
export function isMegaForme(speciesName: string): boolean {
  const sp = gen.species.get(speciesName);
  return !!sp && isMegaSpecies(sp);
}

/**
 * Base forme + the Mega/Primal formes that evolve from it. Pairs by
 * `changesFrom` (Floette-Mega comes from Floette-Eternal; Raichu-Alola has no
 * Mega), falling back to the base species (Z Megas omit changesFrom). Megas the
 * data layer doesn't admit are simply absent (the UI then can't offer them).
 */
export function formeOptions(speciesName: string): FormeOption[] {
  const sp = gen.species.get(speciesName);
  if (!sp) return [];
  const megaFrom = (s: typeof sp): string => s.changesFrom ?? s.baseSpecies;
  const base = (isMegaSpecies(sp) && gen.species.get(megaFrom(sp))) || sp;
  const out: FormeOption[] = [{ name: base.name, label: 'Base', isMega: false }];
  for (const cand of gen.species) {
    if (isMegaSpecies(cand) && megaFrom(cand) === base.name) {
      out.push({ name: cand.name, label: (cand.forme || 'Mega').replace(/-/g, ' '), isMega: true });
    }
  }
  return out;
}

/**
 * Switch a set's forme, forcing the Mega's ability (Megas overwrite ability)
 * and its required Mega Stone / Orb item. Rayquaza-Mega has no stone
 * (`requiredItem` is undefined); its item is left untouched.
 */
export function applyForme(set: PokemonSet, speciesName: string): PokemonSet {
  const sp = gen.species.get(speciesName);
  if (!sp) return set;
  const abilities = Object.values(sp.abilities) as string[];
  const isMega = isMegaSpecies(sp);
  const ability = isMega ? abilities[0] : abilities.includes(set.ability) ? set.ability : abilities[0];
  // To a Mega: force its stone. Reverting to base: drop the now-illegal stone
  // (caller fills a sensible replacement); keep any non-stone item.
  const old = gen.species.get(set.species);
  const oldStone = old && isMegaSpecies(old) ? old.requiredItem : undefined;
  const item = isMega && sp.requiredItem ? sp.requiredItem : set.item === oldStone ? '' : set.item;
  return { ...set, species: sp.name, ability, item };
}

const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/**
 * Fit a pasted set to the format. Showdown omits `Level:` at the format's own level
 * (OU exports have no "Level: 100"), so a missing level is the format's. In Champions,
 * Showdown's `EVs:` line holds Stat Points (0-32, /66) and IVs don't count, while we
 * store 1 SP as 8 EVs at max IVs (see formats.ts).
 */
export function fitSetToFormat(set: PokemonSet, format: FormatDef): PokemonSet {
  const out = { ...set, level: set.level || format.level };
  const sys = format.statSystem;
  if (sys.unit !== 'SP') return out;
  const vals = Object.values(set.evs ?? {});
  // ponytail: a paste within SP limits reads as SP; a real EV spread that small (e.g. only "4 HP") is misread
  const isSP = vals.every((v) => v <= sys.perStatMax) && vals.reduce((a, b) => a + b, 0) <= sys.totalMax;
  const evs = isSP
    ? (Object.fromEntries(Object.entries(set.evs ?? {}).map(([k, v]) => [k, Math.min(252, v * sys.evPerUnit)])) as PokemonSet['evs'])
    : set.evs;
  return { ...out, evs, ivs: MAX_IVS };
}

/** Parse a Showdown team export into roster cards + per-mon errors, fitted to the format when given. */
export function parseTeam(text: string, format?: FormatDef): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { roster: [], errors: [] };

  let team;
  try {
    team = Teams.importTeam(trimmed, gen as unknown as Data);
  } catch (e) {
    return { roster: [], errors: [`Could not parse team: ${(e as Error).message}`] };
  }
  if (!team || team.team.length === 0) {
    return { roster: [], errors: ['No Pokémon found. Paste a Showdown team export.'] };
  }

  const roster: RosterMon[] = [];
  const errors: string[] = [];
  team.team.forEach((set, i) => {
    const r = toRosterMon(format ? fitSetToFormat(set as PokemonSet, format) : (set as PokemonSet), i);
    if ('error' in r) errors.push(r.error);
    else roster.push(r);
  });
  return { roster, errors };
}
