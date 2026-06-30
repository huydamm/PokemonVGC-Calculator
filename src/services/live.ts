/**
 * Live-battle calc: turn a mapped board snapshot into damage numbers, both
 * directions. The opponent's hidden set is inferred from usage stats (sets.ts)
 * and whatever the board has *revealed* (item, ability, boosts, moves, tera) is
 * overlaid on top — so every turn the estimate tightens as the battle leaks
 * info. Your own side is built from exact stats forwarded in `battle.myPokemon`.
 *
 * Pure given an injected SetService (so it's unit-testable without network).
 */
import type { StatsTable } from '@pkmn/data';
import { createPokemon, createMove, runCalc, buildField, Pokemon } from './calc';
import type { SetService } from './sets';
import type { ResolvedFormat } from './formats';
import type { Conditions, SideConditions } from './conditions';
import type { BattleMon, BattleSnapshot } from './battle';

/** One entry from `battle.myPokemon` (the |request| side data). */
export interface MyPokemon {
  details: string; // "Tyranitar, M"
  stats: Omit<StatsTable, 'hp'>; // exact final stats, no HP
  moves: string[]; // move ids, e.g. 'rockslide'
  item?: string;
  ability?: string;
  teraType?: string;
}

export interface MatchupLine {
  attacker: string;
  defender: string;
  move: string;
  percent: [number, number];
  ko: string;
  /** true while the opponent's set is still partly inferred (show a "~"). */
  estimated: boolean;
}

export interface LiveResult {
  /** Opponent attacking you — "what can kill me". */
  incoming: MatchupLine[];
  /** You attacking the opponent — "what KOs them". */
  outgoing: MatchupLine[];
}

const toID = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const speciesOf = (details: string): string => details.split(',')[0].trim();

/** Merge revealed moves with the inferred set's moves (revealed first), max 4. */
function mergeMoves(revealed: string[], inferred: string[]): string[] {
  const out: string[] = [];
  for (const m of [...revealed, ...inferred]) {
    if (m && !out.some((x) => toID(x) === toID(m))) out.push(m);
    if (out.length >= 4) break;
  }
  return out;
}

/** Set current HP from a percent (the only HP figure known for the opponent). */
function setHPPercent(p: Pokemon, pct: number): void {
  p.originalCurHP = Math.max(1, Math.round((p.maxHP() * pct) / 100));
}

/** Build the opponent's calc Pokemon: inferred set with revealed facts overlaid. */
async function buildOpponent(
  mon: BattleMon,
  sets: SetService,
  resolved: ResolvedFormat,
): Promise<{ pokemon: Pokemon; moves: string[]; fullyRevealed: boolean }> {
  const set = await sets.getCommonSet(mon.species, resolved);
  const moves = mergeMoves(mon.revealedMoves, set.moves);
  const pokemon = createPokemon(mon.species, {
    level: mon.level, // the live battle's level, not the inferred set's (often 50)
    ability: mon.ability ?? set.ability, // revealed ability wins
    item: mon.item ?? set.item, // revealed item wins
    nature: set.nature,
    evs: set.evs,
    teraType: mon.terastallized ? mon.teraType : undefined, // only if actually tera'd
    moves,
    boosts: mon.boosts,
    status: mon.status,
  });
  setHPPercent(pokemon, mon.hpPercent);
  return { pokemon, moves, fullyRevealed: !!mon.item && !!mon.ability };
}

/** Build your calc Pokemon from exact request stats (overwrites computed stats). */
function buildMine(mon: BattleMon, me: MyPokemon | undefined): { pokemon: Pokemon; moves: string[] } {
  const moves = me?.moves?.length ? me.moves : mon.revealedMoves;
  const pokemon = createPokemon(mon.species, {
    level: mon.level,
    ability: me?.ability ?? mon.ability,
    item: me?.item ?? mon.item,
    teraType: mon.terastallized ? mon.teraType : me?.teraType,
    moves,
    boosts: mon.boosts,
    status: mon.status,
  });
  if (me?.stats) {
    // Exact final stats from the |request| — overwrite the EV-computed ones.
    const maxHP = mon.maxHP ?? pokemon.maxHP();
    pokemon.rawStats = { hp: maxHP, ...me.stats };
    pokemon.stats = { hp: maxHP, ...me.stats };
  }
  setHPPercent(pokemon, mon.hpPercent);
  return { pokemon, moves };
}

/** Conditions for one direction (attacker/defender side screens etc.). */
function conditionsFor(f: BattleSnapshot['field'], attackerMine: boolean): Conditions {
  const mine: SideConditions = f.mySide;
  const theirs: SideConditions = f.theirSide;
  return {
    weather: f.weather,
    terrain: f.terrain,
    gravity: f.gravity,
    beadsOfRuin: false,
    swordOfRuin: false,
    tabletsOfRuin: false,
    vesselOfRuin: false,
    crit: false,
    attackerSide: attackerMine ? mine : theirs,
    defenderSide: attackerMine ? theirs : mine,
  };
}

/** Best (highest max-roll) move from `moves` for attacker vs defender. */
function bestMove(
  attacker: Pokemon,
  defender: Pokemon,
  moves: string[],
  field: ReturnType<typeof buildField>,
): { move: string; percent: [number, number]; ko: string } | null {
  let best: { move: string; percent: [number, number]; ko: string } | null = null;
  for (const name of moves) {
    try {
      const mv = createMove(name);
      const r = runCalc(attacker, defender, mv, field);
      if (r.percent[1] <= 0) continue; // skip status / no-damage moves
      if (!best || r.percent[1] > best.percent[1]) {
        best = { move: mv.name, percent: r.percent, ko: r.ko.text };
      }
    } catch {
      /* skip status / unhandled moves */
    }
  }
  return best;
}

/** Compute both-direction matchups for the current board. */
export async function computeLive(
  snapshot: BattleSnapshot,
  myPokemon: MyPokemon[],
  sets: SetService,
  resolved: ResolvedFormat,
): Promise<LiveResult> {
  const live = (mon: BattleMon | null): mon is BattleMon => !!mon && !mon.fainted;
  const gt = snapshot.field.gameType;

  const mine = snapshot.mine.filter(live).map((mon) => ({
    mon,
    ...buildMine(
      mon,
      myPokemon.find((p) => toID(speciesOf(p.details)) === toID(mon.species)),
    ),
  }));
  const theirs = await Promise.all(
    snapshot.theirs.filter(live).map(async (mon) => ({ mon, ...(await buildOpponent(mon, sets, resolved)) })),
  );

  const incomingField = buildField(gt, conditionsFor(snapshot.field, false));
  const outgoingField = buildField(gt, conditionsFor(snapshot.field, true));
  const incoming: MatchupLine[] = [];
  const outgoing: MatchupLine[] = [];

  // KO chance is computed from the defender's CURRENT HP, so on a chipped target
  // relabel "OHKO/2HKO" (which imply from full) as a plain "KO".
  const koLabel = (text: string, fullHP: boolean): string =>
    fullHP ? text : text.replace(/\bOHKO\b/g, 'KO').replace(/\b(\d)HKO\b/g, 'KO in $1');

  for (const t of theirs) {
    for (const m of mine) {
      const inc = bestMove(t.pokemon, m.pokemon, t.moves, incomingField);
      if (inc)
        incoming.push({
          attacker: t.mon.species, defender: m.mon.species, move: inc.move, percent: inc.percent,
          ko: koLabel(inc.ko, m.mon.hpPercent >= 100), estimated: !t.fullyRevealed,
        });
    }
  }
  for (const m of mine) {
    for (const t of theirs) {
      const out = bestMove(m.pokemon, t.pokemon, m.moves, outgoingField);
      if (out)
        outgoing.push({
          attacker: m.mon.species, defender: t.mon.species, move: out.move, percent: out.percent,
          ko: koLabel(out.ko, t.mon.hpPercent >= 100), estimated: !t.fullyRevealed,
        });
    }
  }
  return { incoming, outgoing };
}
