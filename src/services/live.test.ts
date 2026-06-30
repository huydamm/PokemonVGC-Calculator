import { describe, it, expect } from 'vitest';
import { computeLive, runHypothetical, type MyPokemon } from './live';
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
});
