/**
 * Thin wrapper over the @smogon/calc *adaptable* engine.
 *
 * We import from `@smogon/calc/dist/adaptable` rather than the package root so
 * the bundler never pulls in @smogon/calc's own multi-megabyte SPECIES/MOVES
 * data tables — all data comes from the shared @pkmn/dex `gen` (see data.ts).
 *
 * The adaptable classes use @pkmn branded string types (ItemName, etc.). The UI
 * deals in plain strings, so the `createPokemon`/`createMove` factories accept
 * plain strings and apply the (single, contained) branding cast here.
 */
import { calculate, Pokemon, Move, Field, Side, Result } from '@smogon/calc/dist/adaptable';
import type { Generation, StatsTable, StatID } from '@pkmn/data';
import { gen } from './data';
import type { Conditions } from './conditions';
import {
  CHAMPIONS_FORMAT,
  applyChampionsMechanics,
  championsMoveOverrides,
  type ChampionsSwap,
} from './champions-mechanics';

export { Pokemon, Move, Field, Side, Result };

/** VGC is Level 50 doubles. */
export const VGC_LEVEL = 50;

/** Plain-string Pokémon options the UI can build without branded types. */
export interface PokemonOptions {
  level?: number;
  ability?: string;
  abilityOn?: boolean;
  item?: string;
  nature?: string;
  teraType?: string;
  moves?: string[];
  evs?: Partial<StatsTable>;
  ivs?: Partial<StatsTable>;
  boosts?: Partial<StatsTable>;
  status?: string;
  curHP?: number;
  boostedStat?: StatID | 'auto';
  alliesFainted?: number;
  gender?: string;
}

type PokemonCtorOpts = ConstructorParameters<typeof Pokemon>[2];

/** Build an adaptable Pokemon from plain strings against the shared gen. */
export function createPokemon(
  name: string,
  opts: PokemonOptions = {},
  generation: Generation = gen,
): Pokemon {
  return new Pokemon(generation as never, name, {
    level: VGC_LEVEL,
    ...opts,
  } as unknown as PokemonCtorOpts);
}

/** Build a move; in Champions it carries Champions' base power, type and flags. */
export function createMove(name: string, formatId?: string): Move {
  const overrides = formatId === CHAMPIONS_FORMAT ? championsMoveOverrides(name) : undefined;
  return new Move(gen as never, name, overrides ? { overrides: overrides as never } : undefined);
}

export type DamageResult = {
  /** Raw damage: a number, a 16-roll array, or per-hit arrays for multi-hit moves. */
  damage: number | number[] | number[][];
  /** combined min and max raw damage (correct across multi-hit moves). */
  range: [number, number];
  /** min and max as % of defender max HP. */
  percent: [number, number];
  /** Showdown-style description string. */
  desc: string;
  defenderMaxHP: number;
  /** KO summary: n-hit KO and its probability (1 = guaranteed). */
  ko: { n: number; chance: number | undefined; text: string };
};

/**
 * Run a single calc against the shared gen and normalise the result. In
 * Champions, Z-A abilities are swapped for engine stand-ins for this calc only
 * (champions-mechanics.ts) and the description shows the real names.
 */
export function runCalc(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field = new Field({ gameType: 'Doubles' }),
  formatId?: string,
): DamageResult {
  let champions: ChampionsSwap | null = null;
  try {
    champions = formatId === CHAMPIONS_FORMAT ? applyChampionsMechanics(attacker, defender, move, field) : null;
    const result: Result = calculate(gen as never, attacker, defender, move, field);
    const damage = result.damage as number | number[] | number[][];
    // result.range() returns the correct combined [min, max] for every damage
    // shape, including multi-hit moves whose damage is a number[][] (per hit).
    const range = result.range();
    const maxHP = defender.maxHP();
    const pct = (n: number): number => Math.round((n / maxHP) * 1000) / 10;
    let ko = { n: 0, chance: undefined as number | undefined, text: '' };
    try {
      const k = result.kochance();
      ko = { n: k.n, chance: k.chance, text: k.text };
    } catch {
      /* kochance can throw on exotic move/field combos; leave the default. */
    }
    let desc = result.desc();
    for (const [standIn, real] of champions?.swaps ?? []) desc = desc.split(standIn).join(real);
    return {
      damage,
      range,
      percent: [pct(range[0]), pct(range[1])],
      desc,
      defenderMaxHP: maxHP,
      ko,
    };
  } finally {
    champions?.undo();
  }
}

/** A doubles Field with VGC defaults (single source for the spread-move 0.75x). */
export function vgcField(opts: ConstructorParameters<typeof Field>[0] = {}): Field {
  return new Field({ gameType: 'Doubles', ...opts });
}

/** Build a Field for the given game type (Doubles applies the spread-move 0.75x). */
export function makeField(
  gameType: 'Singles' | 'Doubles',
  opts: ConstructorParameters<typeof Field>[0] = {},
): Field {
  return new Field({ gameType, ...opts });
}

/** Build a calc Field from the battle-conditions panel state. */
export function buildField(gameType: 'Singles' | 'Doubles', c: Conditions): Field {
  const side = (s: Conditions['attackerSide']) => ({
    isLightScreen: s.lightScreen,
    isReflect: s.reflect,
    isAuroraVeil: s.auroraVeil,
    isTailwind: s.tailwind,
    isHelpingHand: s.helpingHand,
    isFriendGuard: s.friendGuard,
  });
  return new Field({
    gameType,
    weather: c.weather,
    terrain: c.terrain,
    isGravity: c.gravity,
    isBeadsOfRuin: c.beadsOfRuin,
    isSwordOfRuin: c.swordOfRuin,
    isTabletsOfRuin: c.tabletsOfRuin,
    isVesselOfRuin: c.vesselOfRuin,
    attackerSide: side(c.attackerSide) as never,
    defenderSide: side(c.defenderSide) as never,
  });
}

/** Apply a crit toggle to a move (mutates and returns it). */
export function withCrit(move: Move, crit: boolean): Move {
  move.isCrit = crit;
  return move;
}
