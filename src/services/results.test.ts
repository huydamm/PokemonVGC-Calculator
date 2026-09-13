import { describe, it, expect } from 'vitest';
import { computeMoveResults, koText, bestMove, resolveFeatured, type MoveResult } from './results';
import { makeSet } from './team';
import { DEFAULT_CONDITIONS, DEFAULT_MODS } from './conditions';
import type { DamageResult } from './calc';

const incineroar = makeSet({
  species: 'Incineroar',
  ability: 'Intimidate',
  level: 50,
  evs: { hp: 252, atk: 4, spd: 252 },
  moves: ['Fake Out', 'Knock Off', 'Flare Blitz', 'Parting Shot'],
});
const garchomp = makeSet({ species: 'Garchomp', ability: 'Rough Skin', level: 50 });

describe('computeMoveResults', () => {
  const rows = computeMoveResults({
    attacker: incineroar,
    defender: garchomp,
    attackerMods: DEFAULT_MODS,
    defenderMods: DEFAULT_MODS,
    conditions: DEFAULT_CONDITIONS,
    gameType: 'Doubles',
    formatId: 'gen9ou',
    teraEnabled: false,
  });

  it('returns one row per move with its type', () => {
    expect(rows.map((r) => r.name)).toEqual(['Fake Out', 'Knock Off', 'Flare Blitz', 'Parting Shot']);
    expect(rows.find((r) => r.name === 'Knock Off')?.type).toBe('Dark');
    expect(rows.find((r) => r.name === 'Flare Blitz')?.r?.range[1]).toBeGreaterThan(0);
  });

  it('a status move does no damage', () => {
    expect(rows.find((r) => r.name === 'Parting Shot')?.r?.range[1] ?? 0).toBe(0);
  });

  it('bestMove picks the highest max roll', () => {
    const top = Math.max(...rows.map((r) => r.r?.range[1] ?? 0));
    expect(rows.find((r) => r.name === bestMove(rows))?.r?.range[1]).toBe(top);
    expect(bestMove([])).toBeUndefined();
  });
});

describe('immune targets', () => {
  it('keeps the category so a 0-damage hit is not mistaken for a status move', () => {
    const [eq] = computeMoveResults({
      attacker: makeSet({ species: 'Garchomp', ability: 'Rough Skin', level: 50, moves: ['Earthquake'] }),
      defender: makeSet({ species: 'Corviknight', ability: 'Pressure', level: 50 }),
      attackerMods: DEFAULT_MODS,
      defenderMods: DEFAULT_MODS,
      conditions: DEFAULT_CONDITIONS,
      gameType: 'Doubles',
      formatId: 'gen9ou',
      teraEnabled: false,
    });
    expect(eq.category).toBe('Physical');
    expect(eq.r?.range[1] ?? 0).toBe(0);
  });
});

describe('resolveFeatured', () => {
  const rows = [
    { name: 'Fake Out', r: { range: [7, 9] } },
    { name: 'Knock Off', r: { range: [25, 30] } },
  ] as unknown as MoveResult[];

  it("uses the pick only for the attacker it was made on, else the strongest move", () => {
    expect(resolveFeatured(rows, undefined, 'inc')).toBe('Knock Off');
    expect(resolveFeatured(rows, { attackerKey: 'inc', move: 'Fake Out' }, 'inc')).toBe('Fake Out');
    expect(resolveFeatured(rows, { attackerKey: 'chomp', move: 'Fake Out' }, 'inc')).toBe('Knock Off');
    expect(resolveFeatured(rows, { attackerKey: 'inc', move: 'Protect' }, 'inc')).toBe('Knock Off');
  });
});

describe('koText', () => {
  const result = (text: string, desc: string, max = 10) =>
    ({ ko: { n: 0, chance: undefined, text }, desc, range: [1, max] }) as unknown as DamageResult;

  it("prefers the engine's KO text, else the description tail", () => {
    expect(koText(result('guaranteed 2HKO', 'x -- ignored'))).toBe('guaranteed 2HKO');
    expect(koText(result('', 'Lvl 50 ... -- possible 3HKO'))).toBe('possible 3HKO');
    expect(koText(result('', 'no tail', 0))).toBe('no damage');
  });
});
