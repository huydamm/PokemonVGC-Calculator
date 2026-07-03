/**
 * Team-paste parsing: Showdown export text -> structured roster cards.
 * Drives the headline "paste your team" flow. Never throws on bad input.
 */
import { Teams, type PokemonSet } from '@pkmn/sets';
import type { Data } from '@pkmn/sets';
import { gen } from './data';
import { spriteUrl } from './sprites';
import type { PokemonOptions } from './calc';
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
  if (!set.item) return undefined;
  const sp = gen.species.get(set.species);
  if (sp && (sp.isMega || sp.isPrimal) && sp.requiredItem === set.item) return undefined;
  return set.item;
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
    if (sp.isMega || sp.isPrimal || sp.forme === 'Mega' || sp.forme === 'Mega-X' || sp.forme === 'Mega-Y' || sp.forme === 'Primal') {
      continue;
    }
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
  return !!sp && !!(sp.isMega || sp.isPrimal);
}

/**
 * Base forme + any Mega/Primal formes of a species present in the data.
 * Champions adds Megas that never shipped on cartridge; ones the data layer
 * doesn't know are simply absent here (the UI then can't offer them).
 */
export function formeOptions(speciesName: string): FormeOption[] {
  const sp = gen.species.get(speciesName);
  if (!sp) return [];
  const base = gen.species.get(sp.baseSpecies) ?? sp;
  const out: FormeOption[] = [{ name: base.name, label: 'Base', isMega: false }];
  for (const cand of gen.species) {
    if (cand.baseSpecies === base.name && (cand.isMega || cand.isPrimal)) {
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
  const isMega = sp.isMega || sp.isPrimal;
  const ability = isMega ? abilities[0] : abilities.includes(set.ability) ? set.ability : abilities[0];
  // To a Mega: force its stone. Reverting to base: drop the now-illegal stone
  // (caller fills a sensible replacement); keep any non-stone item.
  const old = gen.species.get(set.species);
  const oldStone = old && (old.isMega || old.isPrimal) ? old.requiredItem : undefined;
  const item = isMega && sp.requiredItem ? sp.requiredItem : set.item === oldStone ? '' : set.item;
  return { ...set, species: sp.name, ability, item };
}

/** Parse a Showdown team export into roster cards + per-mon errors. */
export function parseTeam(text: string): ParseResult {
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
    const r = toRosterMon(set as PokemonSet, i);
    if ('error' in r) errors.push(r.error);
    else roster.push(r);
  });
  return { roster, errors };
}
