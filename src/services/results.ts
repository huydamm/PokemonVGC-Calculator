/** Per-move damage results for the Calc view, computed once and shared by the move menu, HP bar, Moves table and Heatmap. */
import type { PokemonSet } from '@pkmn/sets';
import { createPokemon, createMove, runCalc, buildField, withCrit, type DamageResult } from './calc';
import { setToPokemonOptions } from './team';
import type { Conditions, Mods } from './conditions';
import type { GameType } from './formats';

export interface MoveResult {
  name: string;
  /** The move's type as created for the calc (menu tint); undefined when the move is unknown. */
  type?: string;
  /** Physical / Special / Status: tells an immune hit ("0%") from a status move. */
  category?: string;
  /** null when the engine can't produce a result (status move edge cases, immunities). */
  r: DamageResult | null;
}

export interface MoveResultInput {
  attacker: PokemonSet;
  defender: PokemonSet;
  attackerMods: Mods;
  defenderMods: Mods;
  conditions: Conditions;
  gameType: GameType;
  formatId: string;
  teraEnabled: boolean;
}

export function computeMoveResults(i: MoveResultInput): MoveResult[] {
  const atk = createPokemon(i.attacker.species, {
    ...setToPokemonOptions(i.attacker),
    teraType: i.teraEnabled && i.attackerMods.tera ? i.attacker.teraType : undefined,
    boosts: i.attackerMods.boosts,
    status: i.attackerMods.status || undefined,
  });
  const def = createPokemon(i.defender.species, {
    ...setToPokemonOptions(i.defender),
    teraType: i.teraEnabled && i.defenderMods.tera ? i.defender.teraType : undefined,
    boosts: i.defenderMods.boosts,
    status: i.defenderMods.status || undefined,
  });
  const field = buildField(i.gameType, i.conditions);
  return (i.attacker.moves ?? []).filter(Boolean).map((name) => {
    let type: string | undefined;
    let category: string | undefined;
    try {
      const move = withCrit(createMove(name, i.formatId), i.conditions.crit);
      type = move.type;
      category = move.category;
      return { name, type, category, r: runCalc(atk, def, move, field, i.formatId) };
    } catch {
      // Includes immunities: the engine throws on a 0-damage result.
      return { name, type, category, r: null };
    }
  });
}

/** A move picked by the user, remembered only for the attacker it was picked on. */
export interface MovePick {
  attackerKey: string;
  move: string;
}

/** The move to show: the user's pick for this attacker if it still exists, else the strongest move. */
export function resolveFeatured(rows: MoveResult[], pick: MovePick | undefined, attackerKey: string | undefined): string | undefined {
  return pick && pick.attackerKey === attackerKey && rows.some((r) => r.name === pick.move) ? pick.move : bestMove(rows);
}

/** KO summary text: prefer the engine's, else the tail of the description. */
export function koText(r: DamageResult): string {
  if (r.ko.text) return r.ko.text;
  const tail = r.desc.split('--')[1]?.trim();
  return tail || (r.range[1] === 0 ? 'no damage' : '');
}

/** The move with the highest max damage (first move when nothing does damage). */
export function bestMove(rows: MoveResult[]): string | undefined {
  let best = 0;
  let idx = 0;
  rows.forEach((row, i) => {
    const top = row.r?.range[1] ?? 0;
    if (top > best) {
      best = top;
      idx = i;
    }
  });
  return rows[idx]?.name;
}
