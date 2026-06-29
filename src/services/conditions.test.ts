import { describe, it, expect } from 'vitest';
import { createPokemon, createMove, runCalc, buildField, withCrit } from './calc';
import { DEFAULT_CONDITIONS, type Conditions } from './conditions';

const cond = (patch: Partial<Conditions>): Conditions => ({ ...DEFAULT_CONDITIONS, ...patch });
const atk = () => createPokemon('Garchomp', { evs: { atk: 252 }, nature: 'Adamant' });
const def = () => createPokemon('Garchomp', { evs: { hp: 4 } });
const max = (c: Conditions, opts?: { burn?: boolean; boost?: number }) => {
  const a = createPokemon('Garchomp', {
    evs: { atk: 252 },
    nature: 'Adamant',
    status: opts?.burn ? 'brn' : undefined,
    boosts: opts?.boost ? { atk: opts.boost } : undefined,
  });
  return runCalc(a, def(), withCrit(createMove('Earthquake'), c.crit), buildField('Doubles', c)).range[1];
};

describe('battle conditions drive the Field / Pokémon', () => {
  const base = runCalc(atk(), def(), createMove('Earthquake'), buildField('Doubles', DEFAULT_CONDITIONS)).range[1];

  it('Reflect reduces physical damage', () => {
    const withReflect = max(cond({ defenderSide: { ...DEFAULT_CONDITIONS.defenderSide, reflect: true } }));
    expect(withReflect).toBeLessThan(base);
  });

  it('burn halves physical damage', () => {
    expect(max(DEFAULT_CONDITIONS, { burn: true })).toBeLessThan(base);
  });

  it('Helping Hand boosts attacker damage', () => {
    const hh = max(cond({ attackerSide: { ...DEFAULT_CONDITIONS.attackerSide, helpingHand: true } }));
    expect(hh).toBeGreaterThan(base);
  });

  it('+2 Atk stage increases damage', () => {
    expect(max(DEFAULT_CONDITIONS, { boost: 2 })).toBeGreaterThan(base);
  });

  it('critical hit increases damage', () => {
    expect(max(cond({ crit: true }))).toBeGreaterThan(base);
  });

  it('Sword of Ruin (−Def) increases damage taken', () => {
    expect(max(cond({ swordOfRuin: true }))).toBeGreaterThan(base);
  });
});
