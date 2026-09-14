import { describe, it, expect } from 'vitest';
import { computeLive, runHypothetical, spreadHitsOne, type MyPokemon } from './live';
import type { BattleSnapshot, BattleMon } from './battle';
import type { SetService, SuggestedSet } from './sets';
import type { ResolvedFormat } from './formats';
import { getFormat } from './formats';

// Fake set service: a fixed Landorus set, no network.
// level 50 here mimics VGC usage data leaking into a level-100 battle — the
// opponent must still be built at the battle's level (mon.level), not this.
const landorusSet = {
  species: 'Landorus', level: 50, ability: 'Sheer Force', item: 'Life Orb',
  nature: 'Timid', evs: { spa: 252, spe: 252, hp: 4 },
  moves: ['Earth Power', 'Sludge Bomb', 'Sandsear Storm', 'Substitute'],
  abilities: [], items: [], teraTypes: [], spreads: [], moveOptions: [], source: 'usage',
} as unknown as SuggestedSet;
const fakeSets: SetService = { getCommonSet: async () => landorusSet };
const resolved = { def: getFormat('gen9ou'), stats: { id: 'gen9ou' }, sets: { id: 'gen9ou' } } as ResolvedFormat;

const mon = (o: Partial<BattleMon>): BattleMon => ({
  species: 'X', level: 100, fainted: false, hpPercent: 100, status: '',
  boosts: {}, terastallized: false, revealedMoves: [], known: false, ...o,
});

const snapshot: BattleSnapshot = {
  gen: 9, tier: '[Gen 9] Doubles OU', turn: 2,
  field: {
    gameType: 'Doubles', gravity: false, trickRoom: false,
    mySide: { lightScreen: false, reflect: false, auroraVeil: false, tailwind: false, helpingHand: false, friendGuard: false },
    theirSide: { lightScreen: false, reflect: false, auroraVeil: false, tailwind: false, helpingHand: false, friendGuard: false },
  },
  mine: [mon({ species: 'Incineroar', known: true, hpPercent: 87, maxHP: 394 })],
  theirs: [mon({ species: 'Landorus', hpPercent: 76, boosts: { atk: -1 }, revealedMoves: ['Sandsear Storm'] })],
  myTeam: ['Incineroar', 'Tyranitar'],
  theirTeam: ['Landorus', 'Ogerpon-Wellspring'],
};

const myPokemon: MyPokemon[] = [
  {
    details: 'Incineroar, M',
    stats: { atk: 333, def: 240, spa: 176, spd: 219, spe: 156 },
    maxHP: 394,
    moves: ['fakeout', 'partingshot', 'flareblitz', 'knockoff'],
    item: 'safetygoggles', ability: 'intimidate', teraType: 'Ghost',
  },
];

describe('computeLive', () => {
  it('computes both directions with real damage numbers', async () => {
    const r = await computeLive(snapshot, myPokemon, fakeSets, resolved);

    const inc = r.incoming.find((l) => l.attacker === 'Landorus' && l.defender === 'Incineroar')!;
    expect(inc).toBeDefined();
    expect(inc.percent[1]).toBeGreaterThan(0);
    expect(inc.ko).toBeTruthy();
    expect(inc.estimated).toBe(true); // Landorus item/ability not revealed

    const out = r.outgoing.find((l) => l.attacker === 'Incineroar' && l.defender === 'Landorus')!;
    expect(out).toBeDefined();
    expect(out.percent[1]).toBeGreaterThan(0);
    // Opponent built at the battle's level 100 (not the set's 50): a level-50
    // Landorus would be ~half HP/def and read well over 100%.
    expect(out.percent[1]).toBeLessThan(80);
    // Incineroar's best vs a Landorus should be one of its real moves (display names).
    expect(['Fake Out', 'Parting Shot', 'Flare Blitz', 'Knock Off']).toContain(out.move);
  });

  it('runHypothetical calcs an arbitrary matchup (the run_calc tool)', async () => {
    const res = await runHypothetical(
      { attacker: 'Incineroar', defender: 'Landorus', move: 'Flare Blitz', attackerSide: 'mine' },
      snapshot, myPokemon, fakeSets, resolved,
    );
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.percent[1]).toBeGreaterThan(0);
    expect(res.percent[1]).toBeLessThan(80); // opponent at battle level 100
    expect(res.estimated).toBe(true); // defender is the inferred opponent
    expect(res.ko).toBeTruthy();
  });

  it('spread moves count their targets on the board', () => {
    expect(spreadHitsOne('allAdjacentFoes', { foes: 1, ally: true })).toBe(true);
    expect(spreadHitsOne('allAdjacentFoes', { foes: 2, ally: false })).toBe(false);
    expect(spreadHitsOne('allAdjacent', { foes: 1, ally: true })).toBe(false); // Earthquake still hits the partner
    expect(spreadHitsOne('allAdjacent', { foes: 1, ally: false })).toBe(true);
    expect(spreadHitsOne('normal', { foes: 1, ally: false })).toBe(false);
  });

  it('a spread move into a lone foe skips the 0.75x', async () => {
    const sandsear = { ...landorusSet, moves: ['Sandsear Storm'] } as SuggestedSet;
    const sets: SetService = { getCommonSet: async () => sandsear };
    const board = (mine: BattleMon[]): BattleSnapshot => ({ ...snapshot, mine });
    const incineroar = snapshot.mine[0]!;
    const maxInto = async (s: BattleSnapshot) =>
      (await computeLive(s, myPokemon, sets, resolved)).incoming.find((l) => l.defender === 'Incineroar')!.percent[1];
    const alone = await maxInto(board([incineroar]));
    const pair = await maxInto(board([incineroar, mon({ species: 'Tyranitar', known: true })]));
    expect(pair / alone).toBeCloseTo(0.75, 1);
  });

  it('run_calc counts spread targets on the board too', async () => {
    const req = { attacker: 'Landorus', defender: 'Incineroar', move: 'Rock Slide', attackerSide: 'theirs' } as const;
    const pair = { ...snapshot, mine: [snapshot.mine[0], mon({ species: 'Tyranitar', known: true })] };
    const one = await runHypothetical(req, snapshot, myPokemon, fakeSets, resolved);
    const two = await runHypothetical(req, pair, myPokemon, fakeSets, resolved);
    if ('error' in one || 'error' in two) throw new Error('calc failed');
    expect(two.percent[1] / one.percent[1]).toBeCloseTo(0.75, 1);
  });

  it('Champions battles calc with Champions move data (Psyshield Bash 90 BP)', async () => {
    const champions = { def: getFormat('gen9champions'), stats: { id: null }, sets: { id: null } } as ResolvedFormat;
    const req = { attacker: 'Incineroar', defender: 'Landorus', move: 'Psyshield Bash', attackerSide: 'mine' } as const;
    const ch = await runHypothetical(req, snapshot, myPokemon, fakeSets, champions);
    const ou = await runHypothetical(req, snapshot, myPokemon, fakeSets, resolved);
    if ('error' in ch || 'error' in ou) throw new Error('calc failed');
    expect(ch.percent[1]).toBeGreaterThan(ou.percent[1]);
  });
});
