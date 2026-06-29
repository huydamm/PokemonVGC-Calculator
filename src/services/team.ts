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

function toRosterMon(set: PokemonSet, index: number): RosterMon | { error: string } {
  const species = gen.species.get(set.species);
  if (!species) {
    return { error: `Unknown Pokémon: "${set.species || set.name || '(blank)'}"` };
  }
  const forme = species.baseSpecies !== species.name ? species.forme : undefined;
  return {
    id: `${index}-${species.id}`,
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
