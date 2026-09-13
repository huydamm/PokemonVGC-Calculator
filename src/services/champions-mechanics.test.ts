import { describe, it, expect } from 'vitest';
import { createPokemon, createMove, runCalc, makeField, type DamageResult, type Move } from './calc';
import { isModeledAbility } from './data';
import { applyChampionsMechanics } from './champions-mechanics';

const CH = 'gen9champions';
const max = (r: () => DamageResult): number => {
  try {
    return r().range[1];
  } catch {
    return 0; // the engine throws on a 0-damage result; UI callers catch it the same way
  }
};
const doubles = () => makeField('Doubles');
const target = () => createPokemon('Garchomp', { ability: 'Rough Skin', evs: { hp: 252 } });

describe('Champions move data', () => {
  it('uses Champions base power and type only in Champions', () => {
    expect(createMove('Psyshield Bash', CH).bp).toBe(90);
    expect(createMove('Psyshield Bash').bp).toBe(70);
    expect(createMove('Snap Trap', CH).type).toBe('Steel');
  });

  it('calculates moves Champions re-enables', () => {
    const move = createMove('Meteor Assault', CH);
    expect(move.bp).toBe(170);
    const atk = createPokemon("Sirfetch'd", { ability: 'Steadfast', evs: { atk: 252 } });
    expect(runCalc(atk, target(), move, doubles(), CH).range[1]).toBeGreaterThan(0);
  });

  it('slicing flags feed Sharpness (Dragon Claw from Absol-Mega-Z)', () => {
    const atk = () => createPokemon('Absol-Mega-Z', { ability: 'Sharpness', evs: { atk: 252 } });
    const ch = runCalc(atk(), target(), createMove('Dragon Claw', CH), doubles(), CH).range[1];
    const ou = runCalc(atk(), target(), createMove('Dragon Claw'), doubles()).range[1];
    expect(ch).toBeGreaterThan(ou);
  });

  it('a removed secondary stops the Sheer Force boost (Freeze-Dry)', () => {
    const atk = () => createPokemon('Glaceon', { ability: 'Sheer Force', evs: { spa: 252 } });
    const ch = runCalc(atk(), target(), createMove('Freeze-Dry', CH), doubles(), CH).range[1];
    const ou = runCalc(atk(), target(), createMove('Freeze-Dry'), doubles()).range[1];
    expect(ch).toBeLessThan(ou);
  });
});

describe('Champions ability stand-ins', () => {
  it('Fire Mane = Flash Fire (on) for Fire moves, no Fire immunity on defense', () => {
    const mane = () => createPokemon('Pyroar', { ability: 'Fire Mane', evs: { spa: 252 } });
    const ff = createPokemon('Pyroar', { ability: 'Flash Fire', abilityOn: true, evs: { spa: 252 } });
    const fire = () => createMove('Flamethrower');
    expect(runCalc(mane(), target(), fire(), doubles(), CH).range).toEqual(runCalc(ff, target(), fire(), doubles()).range);
    const plain = createPokemon('Pyroar', { ability: 'Unnerve', evs: { spa: 252 } });
    expect(runCalc(mane(), target(), createMove('Hyper Voice'), doubles(), CH).range).toEqual(
      runCalc(plain, target(), createMove('Hyper Voice'), doubles()).range,
    );
    expect(max(() => runCalc(plain, mane(), fire(), doubles(), CH))).toBeGreaterThan(0);
  });

  it('Dragonize turns Normal moves into boosted Dragon moves', () => {
    const atk = () => createPokemon('Lucario', { ability: 'Dragonize', evs: { spa: 252 } });
    const dragonite = () => createPokemon('Dragonite', { ability: 'Inner Focus' });
    const ch = runCalc(atk(), dragonite(), createMove('Hyper Voice'), doubles(), CH).range[1];
    const ou = runCalc(atk(), dragonite(), createMove('Hyper Voice'), doubles()).range[1];
    expect(ch).toBeGreaterThan(ou * 2); // super effective (2x) and 1.2x
    const fairy = createPokemon('Clefable', { ability: 'Magic Guard' });
    expect(max(() => runCalc(atk(), fairy, createMove('Hyper Voice'), doubles(), CH))).toBe(0);
  });

  it('Mega Sol attacks as if in Sun, except under primal weather', () => {
    const atk = () => createPokemon('Meganium', { ability: 'Mega Sol', evs: { spa: 252 } });
    const plain = () => createPokemon('Meganium', { ability: 'Overgrow', evs: { spa: 252 } });
    const fire = () => createMove('Weather Ball');
    expect(runCalc(atk(), target(), createMove('Flamethrower'), makeField('Doubles', { weather: 'Rain' }), CH).range).toEqual(
      runCalc(plain(), target(), createMove('Flamethrower'), makeField('Doubles', { weather: 'Sun' })).range,
    );
    expect(max(() => runCalc(atk(), target(), fire(), makeField('Doubles', { weather: 'Heavy Rain' }), CH))).toBe(
      max(() => runCalc(plain(), target(), fire(), makeField('Doubles', { weather: 'Heavy Rain' }))),
    );
  });

  it('Aura Guard halves contact hits (Fire included), not non-contact or Mold Breaker', () => {
    const guard = () => createPokemon('Lucario-Mega-Z', { ability: 'Aura Guard' });
    const as = (ability: string) => createPokemon('Lucario-Mega-Z', { ability });
    const atk = () => createPokemon('Garchomp', { ability: 'Rough Skin', evs: { atk: 252 } });
    const cc = () => createMove('Close Combat');
    expect(runCalc(atk(), guard(), cc(), doubles(), CH).range).toEqual(runCalc(atk(), as('Fluffy'), cc(), doubles()).range);
    const fb = () => createMove('Flare Blitz');
    expect(runCalc(atk(), guard(), fb(), doubles(), CH).range).toEqual(runCalc(atk(), as('Heatproof'), fb(), doubles()).range);
    const eq = () => createMove('Earthquake');
    expect(runCalc(atk(), guard(), eq(), doubles(), CH).range).toEqual(runCalc(atk(), as('Inner Focus'), eq(), doubles()).range);
    const breaker = createPokemon('Garchomp', { ability: 'Mold Breaker', evs: { atk: 252 } });
    expect(runCalc(breaker, guard(), cc(), doubles(), CH).range).toEqual(runCalc(breaker, as('Inner Focus'), cc(), doubles()).range);
  });

  it('Eelevate makes the holder immune to Ground moves', () => {
    const eel = () => createPokemon('Eelektross', { ability: 'Eelevate' });
    const atk = () => createPokemon('Garchomp', { ability: 'Rough Skin', evs: { atk: 252 } });
    expect(max(() => runCalc(atk(), eel(), createMove('Earthquake'), doubles(), CH))).toBe(0);
    expect(max(() => runCalc(atk(), eel(), createMove('Earthquake'), doubles()))).toBeGreaterThan(0);
  });

  it('shows real ability names and restores every input after the calc', () => {
    const atk = createPokemon('Pyroar', { ability: 'Fire Mane', evs: { spa: 252 } });
    const move = createMove('Hyper Voice');
    const field = doubles();
    const r = runCalc(atk, target(), createMove('Flamethrower'), field, CH);
    expect(r.desc).toContain('Fire Mane');
    expect(r.desc).not.toContain('Flash Fire');
    expect(atk.ability).toBe('Fire Mane');
    expect(atk.abilityOn).toBe(false);

    const dragon = createPokemon('Lucario', { ability: 'Dragonize' });
    runCalc(dragon, target(), move, field, CH);
    expect([move.type, move.bp, move.overrides]).toEqual(['Normal', 90, undefined]);
    const sol = createPokemon('Meganium', { ability: 'Mega Sol' });
    runCalc(sol, target(), createMove('Flamethrower'), field, CH);
    expect(field.weather).toBeUndefined();
  });

  it('isModeledAbility knows which abilities Champions emulates', () => {
    expect(isModeledAbility('Aura Guard', CH)).toBe(true);
    expect(isModeledAbility('Aura Guard')).toBe(false);
    expect(isModeledAbility('Piercing Drill', CH)).toBe(false);
  });
});

describe('Champions stand-in edge cases', () => {
  const garchomp = () => createPokemon('Garchomp', { ability: 'Rough Skin', evs: { atk: 252 } });

  it('Aura Guard is a real 0.5x on contact hits', () => {
    const cc = () => createMove('Close Combat');
    const ch = runCalc(garchomp(), createPokemon('Lucario-Mega-Z', { ability: 'Aura Guard' }), cc(), doubles(), CH).range[1];
    const full = runCalc(garchomp(), createPokemon('Lucario-Mega-Z', { ability: 'Inner Focus' }), cc(), doubles()).range[1];
    expect(Math.abs(ch - Math.floor(full / 2))).toBeLessThanOrEqual(1);
  });

  it('Mega Sol leaves weather alone for moves Sun does not affect (keeps Sand SpD on Rock)', () => {
    const sol = () => createPokemon('Meganium', { ability: 'Mega Sol', evs: { spa: 252 } });
    const plain = () => createPokemon('Meganium', { ability: 'Overgrow', evs: { spa: 252 } });
    const ttar = () => createPokemon('Tyranitar', { ability: 'Sand Stream' });
    const sand = () => makeField('Doubles', { weather: 'Sand' });
    expect(runCalc(sol(), ttar(), createMove('Energy Ball'), sand(), CH).range).toEqual(
      runCalc(plain(), ttar(), createMove('Energy Ball'), sand()).range,
    );
  });

  it('Mega Sol still applies Sun into a Rock-type in Sand, keeping its Sp. Def boost', () => {
    const sol = () => createPokemon('Meganium', { ability: 'Mega Sol', evs: { spa: 252 } });
    const plain = () => createPokemon('Meganium', { ability: 'Overgrow', evs: { spa: 252 } });
    const ttar = () => createPokemon('Tyranitar', { ability: 'Sand Stream', evs: { hp: 252, spd: 252 } });
    for (const name of ['Solar Beam', 'Flamethrower']) {
      const ch = runCalc(sol(), ttar(), createMove(name), makeField('Doubles', { weather: 'Sand' }), CH).range[1];
      // Sun damage with Sand's 1.5x Sp. Def applied on top
      const expected = runCalc(plain(), ttar(), createMove(name), makeField('Doubles', { weather: 'Sun' })).range[1] / 1.5;
      expect(Math.abs(ch - expected), name).toBeLessThanOrEqual(2);
    }
  });

  it('Fire Mane boosts Weather Ball once Sun makes it Fire', () => {
    const mane = createPokemon('Pyroar', { ability: 'Fire Mane', evs: { spa: 252 } });
    const ff = createPokemon('Pyroar', { ability: 'Flash Fire', abilityOn: true, evs: { spa: 252 } });
    const sun = () => makeField('Doubles', { weather: 'Sun' });
    expect(runCalc(mane, target(), createMove('Weather Ball'), sun(), CH).range).toEqual(
      runCalc(ff, target(), createMove('Weather Ball'), sun()).range,
    );
  });

  it('an attacking Eelevate mon is airborne (no Electric Terrain boost)', () => {
    const eel = createPokemon('Eelektross', { ability: 'Eelevate', evs: { spa: 252 } });
    const lev = createPokemon('Eelektross', { ability: 'Levitate', evs: { spa: 252 } });
    const terrain = () => makeField('Doubles', { terrain: 'Electric' });
    const inc = () => createPokemon('Incineroar', { ability: 'Intimidate' }); // not Ground: Thunderbolt must land
    expect(runCalc(eel, inc(), createMove('Thunderbolt'), terrain(), CH).range).toEqual(
      runCalc(lev, inc(), createMove('Thunderbolt'), terrain()).range,
    );
  });

  it('a throw part-way through the swaps restores everything', () => {
    const sol = createPokemon('Meganium', { ability: 'Mega Sol' });
    const guard = createPokemon('Lucario-Mega-Z', { ability: 'Aura Guard' });
    const field = doubles();
    const badMove = {
      type: 'Fire',
      name: 'Broken',
      category: 'Special',
      get flags(): never {
        throw new Error('boom');
      },
    } as unknown as Move;
    expect(() => applyChampionsMechanics(sol, guard, badMove, field)).toThrow('boom');
    expect(field.weather).toBeUndefined();
    expect(guard.ability).toBe('Aura Guard');
  });
});
