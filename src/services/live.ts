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
import { gen, isMegaSpecies } from './data';
import type { SetService } from './sets';
import type { ResolvedFormat } from './formats';
import type { Conditions, SideConditions } from './conditions';
import type { BattleMon, BattleSnapshot } from './battle';

/** One entry from `battle.myPokemon` (the |request| side data). */
export interface MyPokemon {
  details: string; // "Tyranitar, M"
  stats: Omit<StatsTable, 'hp'>; // exact final stats, no HP
  maxHP?: number; // exact max HP, parsed from the request `condition` ("393/393")
  moves: string[]; // move ids, e.g. 'rockslide'
  item?: string;
  ability?: string;
  teraType?: string;
}

export interface MatchupLine {
  attacker: string;
  defender: string;
  move: string;
  /** min-max % of the defender's max HP; [0, 0] unless `kind` is 'damage'. */
  percent: [number, number];
  /** Engine KO text ("guaranteed 2HKO"), relabelled for a chipped target; '' when none. */
  ko: string;
  /** Short KO tag for tight layouts (see `koShort`); '' when none. */
  koShort: string;
  /** 1 = guaranteed KO, below 1 = a chance; undefined when there's no KO. */
  koChance?: number;
  /** 'damage', 'status' (a status move), or 'none' (no effect on this target, or no move data). */
  kind: 'damage' | 'status' | 'none';
  /** true while the opponent's set is still partly inferred. */
  estimated: boolean;
}

/** Every move of every active attacker against every active target, both directions. */
export interface LiveResult {
  /** Opponent attacking you: "what can kill me". */
  incoming: MatchupLine[];
  /** You attacking the opponent: "what KOs them". */
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

/**
 * Item and ability as the engine needs them. The request sends ids ('choiceband') and the
 * engine matches names ('Choice Band'). Items the dex lacks, every Mega Stone included,
 * are dropped: an unknown held item makes each calc throw (a row of 0%). A Mega has one
 * ability, and the one revealed or inferred before it evolved is the base forme's.
 */
export function calcTraits(species: string, ability?: string, item?: string): { ability?: string; item?: string } {
  const sp = gen.species.get(species);
  const mega = sp && isMegaSpecies(sp) ? sp.abilities[0] : undefined;
  return {
    ability: mega ?? (ability ? gen.abilities.get(ability)?.name ?? ability : undefined),
    item: item ? gen.items.get(item)?.name : undefined,
  };
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
    ...calcTraits(mon.species, mon.ability ?? set.ability, mon.item ?? set.item), // revealed wins
    nature: set.nature,
    evs: set.evs,
    teraType: mon.terastallized ? mon.teraType : undefined, // only if actually tera'd
    moves,
    alliesFainted: mon.alliesFainted,
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
    ...calcTraits(mon.species, me?.ability ?? mon.ability, me?.item ?? mon.item),
    // A teraType makes the engine treat the mon as terastallized, so only pass it once it is.
    teraType: mon.terastallized ? mon.teraType : undefined,
    moves,
    alliesFainted: mon.alliesFainted,
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
    singleTarget: false, // decided per move from the board in boardMove

    attackerSide: attackerMine ? mine : theirs,
    defenderSide: attackerMine ? theirs : mine,
  };
}

/** Live mons on the board around one attack: the defending side's count and whether the attacker has a partner. */
interface Board {
  foes: number;
  ally: boolean;
}

/**
 * Doubles: whether a spread move actually hits a single target on this board, so it
 * skips the 0.75x. Earthquake-style moves (`allAdjacent`) also hit the attacker's ally.
 */
export function spreadHitsOne(target: string, board: Board): boolean {
  if (target === 'allAdjacentFoes') return board.foes <= 1;
  if (target === 'allAdjacent') return board.foes + (board.ally ? 1 : 0) <= 1;
  return false;
}

/** Base power from battle state the engine doesn't track; undefined leaves the dex value. */
export function liveBasePower(name: string, mon: Pick<BattleMon, 'alliesFainted' | 'timesAttacked'>): number | undefined {
  const id = toID(name);
  if (id === 'lastrespects') return 50 + 50 * mon.alliesFainted;
  if (id === 'ragefist') return Math.min(350, 50 + 50 * mon.timesAttacked);
  return undefined;
}

/** The move as it lands on this board: a spread move into a single target skips the 0.75x. */
function boardMove(name: string, formatId: string, board: Board, attacker: BattleMon): ReturnType<typeof createMove> {
  const bp = liveBasePower(name, attacker);
  const move = createMove(name, formatId, false, bp);
  return spreadHitsOne(move.target, board) ? createMove(name, formatId, true, bp) : move;
}

// KO chance is computed from the defender's CURRENT HP, so on a chipped target
// "OHKO/2HKO" (which imply from full) read as a plain "KO".
const koLabel = (text: string, fullHP: boolean): string =>
  fullHP ? text : text.replace(/\bOHKO\b/g, 'KO').replace(/\b(\d)HKO\b/g, 'KO in $1');

/**
 * Short KO tag: OHKO / 2HKO from full HP, KO / "KO in 2" on a chipped target. '' for no KO
 * or one slower than 4 hits (the full text still has it), so tight layouts show only real threats.
 */
export function koShort(hits: number, fullHP: boolean): string {
  if (!hits || hits > 4) return '';
  if (hits === 1) return fullHP ? 'OHKO' : 'KO';
  return fullHP ? `${hits}HKO` : `KO in ${hits}`;
}

type MoveLine = Pick<MatchupLine, 'move' | 'percent' | 'ko' | 'koShort' | 'koChance' | 'kind'>;

/** Every move against one defender, in set order: damaging, status and no-effect moves alike. */
function moveLines(
  attackerMon: BattleMon,
  attacker: Pokemon,
  defender: Pokemon,
  moves: string[],
  field: ReturnType<typeof buildField>,
  formatId: string,
  board: Board,
  fullHP: boolean,
): MoveLine[] {
  return moves.map((name) => {
    const none: MoveLine = { move: gen.moves.get(name)?.name ?? name, percent: [0, 0], ko: '', koShort: '', kind: 'none' };
    if (!gen.moves.get(name)) return none;
    try {
      const mv = boardMove(name, formatId, board, attackerMon);
      if (mv.category === 'Status') return { ...none, kind: 'status' };
      const r = runCalc(attacker, defender, mv, field, formatId);
      if (r.range[1] <= 0) return none;
      return {
        move: mv.name,
        percent: r.percent,
        ko: koLabel(r.ko.text, fullHP),
        koShort: koShort(r.ko.n, fullHP),
        koChance: r.ko.n ? r.ko.chance : undefined,
        kind: 'damage',
      };
    } catch {
      return none; // the engine throws on immunities
    }
  });
}

/**
 * Your request entry for an active mon. The active forme can differ from the request's
 * species (Ogerpon-Wellspring-Tera vs Ogerpon-Wellspring), so fall back to a prefix match.
 */
function findMine(mon: BattleMon, myPokemon: MyPokemon[]): MyPokemon | undefined {
  const id = toID(mon.species);
  const ids = myPokemon.map((p) => toID(speciesOf(p.details)));
  const i = ids.indexOf(id);
  return myPokemon[i >= 0 ? i : ids.findIndex((p) => p && (id.startsWith(p) || p.startsWith(id)))];
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

  const mine = snapshot.mine.filter(live).map((mon) => ({ mon, ...buildMine(mon, findMine(mon, myPokemon)) }));
  const theirs = await Promise.all(
    snapshot.theirs.filter(live).map(async (mon) => ({ mon, ...(await buildOpponent(mon, sets, resolved)) })),
  );

  const incomingField = buildField(gt, conditionsFor(snapshot.field, false));
  const outgoingField = buildField(gt, conditionsFor(snapshot.field, true));
  const incoming: MatchupLine[] = [];
  const outgoing: MatchupLine[] = [];

  for (const t of theirs) {
    for (const m of mine) {
      const board = { foes: mine.length, ally: theirs.length > 1 };
      for (const l of moveLines(t.mon, t.pokemon, m.pokemon, t.moves, incomingField, resolved.def.id, board, m.mon.hpPercent >= 100)) {
        incoming.push({ attacker: t.mon.species, defender: m.mon.species, estimated: !t.fullyRevealed, ...l });
      }
    }
  }
  for (const m of mine) {
    for (const t of theirs) {
      const board = { foes: theirs.length, ally: mine.length > 1 };
      for (const l of moveLines(m.mon, m.pokemon, t.pokemon, m.moves, outgoingField, resolved.def.id, board, t.mon.hpPercent >= 100)) {
        outgoing.push({ attacker: m.mon.species, defender: t.mon.species, estimated: !t.fullyRevealed, ...l });
      }
    }
  }
  return { incoming, outgoing };
}

export const battleLevel = (s: BattleSnapshot): number =>
  s.mine.find(Boolean)?.level ?? s.theirs.find(Boolean)?.level ?? (s.field.gameType === 'Doubles' ? 50 : 100);
