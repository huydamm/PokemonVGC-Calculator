import { describe, it, expect } from 'vitest';
import { DEFAULT_CONDITIONS, DEFAULT_MODS, activeConditionSummary } from './conditions';

describe('activeConditionSummary', () => {
  it('is empty for defaults', () => {
    expect(activeConditionSummary(DEFAULT_CONDITIONS, DEFAULT_MODS, DEFAULT_MODS)).toEqual([]);
  });

  it('labels every active field effect and modifier with its side', () => {
    const conditions = {
      ...DEFAULT_CONDITIONS,
      weather: 'Sun' as const,
      terrain: 'Electric' as const,
      crit: true,
      swordOfRuin: true,
      defenderSide: { ...DEFAULT_CONDITIONS.defenderSide, reflect: true },
    };
    const attacker = { ...DEFAULT_MODS, boosts: { atk: 1, spe: -2 } };
    const defender = { ...DEFAULT_MODS, status: 'brn' as const, tera: true };
    expect(activeConditionSummary(conditions, attacker, defender)).toEqual([
      'Sun',
      'Electric Terrain',
      'Critical hit',
      'Sword of Ruin',
      'Reflect (defender)',
      'Atk +1 (attacker)',
      'Spe -2 (attacker)',
      'Burned (defender)',
    ]);
  });

  it('lists the one-target spread toggle only in Doubles', () => {
    const c = { ...DEFAULT_CONDITIONS, singleTarget: true };
    expect(activeConditionSummary(c, DEFAULT_MODS, DEFAULT_MODS)).toEqual(['Spread hits 1 target']);
    expect(activeConditionSummary(c, DEFAULT_MODS, DEFAULT_MODS, false)).toEqual([]);
  });
});
