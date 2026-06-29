/**
 * Team-paste parsing: Showdown export text -> structured roster cards.
 * Drives the headline "paste your team" flow. Never throws on bad input.
 */
import { Teams, type PokemonSet } from '@pkmn/sets';
import type { Data } from '@pkmn/sets';
import { gen } from './data';
import { spriteUrl } from './sprites';
import type { PokemonOptions } from './calc';

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
    item: set.item || undefined,
    nature: set.nature || undefined,
    teraType: set.teraType || undefined,
    moves: set.moves?.filter(Boolean),
    evs: set.evs,
    ivs: set.ivs,
  };
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
    out.push({ name: sp.name, baseSpecies: sp.baseSpecies, forme: sp.forme, num: sp.num, types: [...sp.types] });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  speciesIndex = out;
  return out;
}

/** Case-insensitive substring search over species names, dex order on ties. */
export function searchSpecies(query: string, limit = 40): SpeciesEntry[] {
  const q = query.trim().toLowerCase();
  const all = index();
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
