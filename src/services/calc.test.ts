import { describe, it, expect } from 'vitest';
import { createPokemon, createMove, runCalc, vgcField } from './calc';
import { gen } from './data';

const garchomp = () => createPokemon('Garchomp', { evs: { hp: 4 } });

// Expected ranges/descriptions hardcoded from the real Showdown calc engine
// (the bundled @smogon/calc, which powers calc.pokemonshowdown.com).
describe('engine: known damage calcs', () => {
  it('Choice Specs Charizard Flamethrower in Sun through Light Screen', () => {
    const r = runCalc(
      createPokemon('Charizard', { evs: { spa: 252 }, nature: 'Modest', item: 'Choice Specs' }),
      garchomp(),
      createMove('Flamethrower'),
      vgcField({ weather: 'Sun', defenderSide: { isLightScreen: true } }),
    );
    // Doubles: Light Screen reduces special damage to 2/3 (not 1/2 as in Singles).
    expect(r.range).toEqual([64, 75]);
    expect(r.desc).toContain('64-75 (34.7 - 40.7%)');
    expect(r.desc).toContain('guaranteed 3HKO');
  });

  it('spread move (Heat Wave) takes the 0.75x doubles reduction', () => {
    const single = runCalc(
      createPokemon('Charizard', { evs: { spa: 252 }, nature: 'Modest' }),
      garchomp(),
      createMove('Flamethrower'),
      vgcField({ weather: 'Sun' }),
    );
    const spread = runCalc(
      createPokemon('Charizard', { evs: { spa: 252 }, nature: 'Modest' }),
      garchomp(),
      createMove('Heat Wave'),
      vgcField({ weather: 'Sun' }),
    );
    // Heat Wave (95 BP spread) should land below Flamethrower (90 BP single) here
    // because the spread move eats the 0.75x doubles multiplier.
    expect(spread.range[1]).toBeLessThan(single.range[1]);
  });
});

describe('multi-hit moves', () => {
  it('combines per-hit rolls into a valid range and % (Dragon Darts, 2 hits)', () => {
    const r = runCalc(
      createPokemon('Dragapult', { evs: { spa: 252 }, nature: 'Timid' }),
      garchomp(),
      createMove('Dragon Darts'),
      vgcField(),
    );
    expect(r.range[0]).toBeGreaterThan(0);
    expect(r.range[1]).toBeGreaterThanOrEqual(r.range[0]);
    expect(Number.isFinite(r.percent[0])).toBe(true);
    expect(Number.isFinite(r.percent[1])).toBe(true);
    expect(r.desc).toContain('2 hits');
  });
});

describe('terastallization', () => {
  it('passing teraType flags the Pokémon as Tera and boosts matching-type STAB', () => {
    const target = () => createPokemon('Garchomp', { evs: { hp: 252 } });
    const opts = { evs: { spa: 252 }, nature: 'Modest' as const };
    const noTera = runCalc(createPokemon('Gardevoir', opts), target(), createMove('Dazzling Gleam'), vgcField());
    const tera = runCalc(
      createPokemon('Gardevoir', { ...opts, teraType: 'Fairy' }),
      target(),
      createMove('Dazzling Gleam'),
      vgcField(),
    );
    expect(tera.desc).toContain('Tera Fairy');
    expect(noTera.desc).not.toContain('Tera');
    expect(tera.range[1]).toBeGreaterThan(noTera.range[1]); // Tera STAB 1.5x -> 2x
  });
});

describe('mega forme resolution', () => {
  it('a present Mega applies post-Mega stats and forces its ability', () => {
    const zard = createPokemon('Charizard-Mega-Y', { evs: { spa: 252 }, nature: 'Modest' });
    expect(zard.ability).toBe('Drought'); // Mega ability overwrites base (Blaze)
    expect(zard.species.baseStats.spa).toBe(159); // post-Mega base SpA

    const r = runCalc(zard, garchomp(), createMove('Flamethrower'), vgcField({ weather: 'Sun' }));
    expect(r.range).toEqual([84, 99]);
    expect(r.desc).toContain('Charizard-Mega-Y');
  });

  it('classic Megas omitted from Champions are still in the data layer (e.g. Salamence-Mega)', () => {
    expect(gen.species.get('Salamence-Mega')).toBeTruthy();
  });

  it('a brand-new Champions Mega that IS in live data calcs without throwing', () => {
    // @pkmn/dex tracks Showdown, which has implemented most Champions Megas
    // (flagged isNonstandard:'Future'). Pyroar-Mega has a novel ability.
    const py = createPokemon('Pyroar-Mega', { evs: { spa: 252 }, nature: 'Modest' });
    expect(py.ability).toBe('Fire Mane');
    expect(py.species.baseStats.spa).toBe(129);
    expect(() => runCalc(py, garchomp(), createMove('Flamethrower'), vgcField({ weather: 'Sun' }))).not.toThrow();
  });

  it('a Mega genuinely absent from the data degrades to base forme without throwing', () => {
    // Tatsugiri-Mega / Annihilape-Mega are not yet in @pkmn/dex. The UI hides
    // them; resolution must degrade to the base forme rather than crash.
    expect(gen.species.get('Tatsugiri-Mega')).toBeUndefined();
    const base = gen.species.get('Tatsugiri-Mega') ?? gen.species.get('Tatsugiri');
    expect(base?.name).toBe('Tatsugiri');
    expect(() => createPokemon(base!.name)).not.toThrow();
  });
});
