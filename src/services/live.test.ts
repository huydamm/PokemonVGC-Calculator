import { describe, it, expect } from 'vitest';
import { computeLive, spreadHitsOne, koShort, liveBasePower, calcTraits, type MyPokemon } from './live';
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
  boosts: {}, terastallized: false, revealedMoves: [], alliesFainted: 0, timesAttacked: 0, known: false, ...o,
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
  it('lists every move both ways, in set order, with real damage numbers', async () => {
    const r = await computeLive(snapshot, myPokemon, fakeSets, resolved);

    // All four of your moves (display names, request order), status moves included.
    const out = r.outgoing.filter((l) => l.attacker === 'Incineroar' && l.defender === 'Landorus');
    expect(out.map((l) => l.move)).toEqual(['Fake Out', 'Parting Shot', 'Flare Blitz', 'Knock Off']);
    expect(out.find((l) => l.move === 'Parting Shot')!.kind).toBe('status');
    const best = out.reduce((a, b) => (b.percent[1] > a.percent[1] ? b : a));
    expect(best.kind).toBe('damage');
    expect(best.ko).toBeTruthy();
    expect(best.estimated).toBe(true); // Landorus item/ability not revealed
    // Opponent built at the battle's level 100 (not the set's 50): a level-50
    // Landorus would be ~half HP/def and read well over 100%.
    expect(best.percent[1]).toBeLessThan(80);

    // The opponent's revealed move first, then its inferred set, four at most.
    const inc = r.incoming.filter((l) => l.attacker === 'Landorus' && l.defender === 'Incineroar');
    expect(inc.map((l) => l.move)).toEqual(['Sandsear Storm', 'Earth Power', 'Sludge Bomb', 'Substitute']);
    expect(inc.find((l) => l.move === 'Earth Power')!.percent[1]).toBeGreaterThan(0);
  });

  it('keeps moves that do nothing to a target, marked, instead of dropping them', async () => {
    const withFlyer = { ...snapshot, mine: [...snapshot.mine, mon({ species: 'Talonflame', known: true })] };
    const r = await computeLive(withFlyer, myPokemon, fakeSets, resolved);
    const ep = r.incoming.find((l) => l.defender === 'Talonflame' && l.move === 'Earth Power')!;
    expect(ep.kind).toBe('none');
    expect(ep.percent).toEqual([0, 0]);
  });

  it('uses your request item/ability ids and ignores an unused tera type', async () => {
    const fakeOut = { ...snapshot, theirs: [mon({ species: 'Landorus', revealedMoves: ['Fake Out'] })] };
    const run = async (item: string) => {
      const r = await computeLive(fakeOut, [{ ...myPokemon[0], item }], fakeSets, resolved);
      return {
        inc: r.incoming.find((l) => l.move === 'Fake Out')!,
        blitz: r.outgoing.find((l) => l.move === 'Flare Blitz')!,
      };
    };
    const id = await run('choiceband');
    // Tera Ghost is only in the request, not active: Fake Out still lands.
    expect(id.inc.kind).toBe('damage');
    // 'choiceband' boosts exactly like 'Choice Band'.
    expect(id.blitz.percent).toEqual((await run('Choice Band')).blitz.percent);
    expect(id.blitz.percent[1]).toBeGreaterThan((await run('')).blitz.percent[1]);
  });

  it('Last Respects and Rage Fist scale with the battle so far', () => {
    expect(liveBasePower('Last Respects', { alliesFainted: 2, timesAttacked: 0 })).toBe(150);
    expect(liveBasePower('ragefist', { alliesFainted: 0, timesAttacked: 9 })).toBe(350);
    expect(liveBasePower('Flare Blitz', { alliesFainted: 2, timesAttacked: 2 })).toBeUndefined();
  });

  it('finds your moves when the active forme differs from the request species', async () => {
    const tera = { ...snapshot, mine: [mon({ species: 'Ogerpon-Wellspring-Tera', known: true, terastallized: true, teraType: 'Water' })] };
    const me: MyPokemon[] = [
      {
        details: 'Ogerpon-Wellspring, F',
        stats: { atk: 276, def: 204, spa: 112, spd: 176, spe: 256 },
        maxHP: 301,
        moves: ['ivycudgel', 'hornleech', 'followme', 'spikyshield'],
        item: 'wellspringmask',
        ability: 'waterabsorb',
      },
    ];
    const r = await computeLive(tera, me, fakeSets, resolved);
    expect(r.outgoing.map((l) => l.move)).toEqual(['Ivy Cudgel', 'Horn Leech', 'Follow Me', 'Spiky Shield']);
  });

  it('short KO tags read from current HP', () => {
    expect(koShort(1, true)).toBe('OHKO');
    expect(koShort(2, true)).toBe('2HKO');
    expect(koShort(1, false)).toBe('KO');
    expect(koShort(3, false)).toBe('KO in 3');
    expect(koShort(0, true)).toBe('');
    expect(koShort(5, true)).toBe(''); // slower than 4 hits isn't worth a tag
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

  it('Champions battles calc with Champions move data (Psyshield Bash 90 BP)', async () => {
    const champions = { def: getFormat('gen9champions'), stats: { id: null }, sets: { id: null } } as ResolvedFormat;
    const bash = [{ ...myPokemon[0], moves: ['psyshieldbash'] }];
    const max = async (r: ResolvedFormat) =>
      (await computeLive(snapshot, bash, fakeSets, r)).outgoing.find((l) => l.move === 'Psyshield Bash')!.percent[1];
    expect(await max(champions)).toBeGreaterThan(await max(resolved));
  });

  it('a Mega calcs with its own ability and without its stone', async () => {
    expect(calcTraits('Charizard-Mega-Y', 'Blaze', 'Charizardite Y')).toEqual({ ability: 'Drought', item: undefined });
    expect(calcTraits('Incineroar', 'intimidate', 'safetygoggles')).toEqual({ ability: 'Intimidate', item: 'Safety Goggles' });

    // Opponent megas mid-battle: stone revealed, base-forme set inferred. Used to throw on every move (0%).
    const champions = { def: getFormat('gen9champions'), stats: { id: null }, sets: { id: null } } as ResolvedFormat;
    const zardSet = { ...landorusSet, species: 'Charizard', ability: 'Blaze', item: 'Charizardite Y', moves: ['Heat Wave'] } as SuggestedSet;
    const zard = { ...snapshot, theirs: [mon({ species: 'Charizard-Mega-Y', level: 50, item: 'Charizardite Y', ability: 'Blaze' })] };
    const meStone = [{ ...myPokemon[0], item: 'charizarditex' }];
    const r = await computeLive(zard, meStone, { getCommonSet: async () => zardSet }, champions);
    expect(r.incoming.find((l) => l.move === 'Heat Wave')!.kind).toBe('damage');
    expect(r.outgoing.find((l) => l.move === 'Flare Blitz')!.kind).toBe('damage');
  });
});
