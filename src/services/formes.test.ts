import { describe, it, expect } from 'vitest';
import { formeOptions, applyForme, isMegaForme, makeSet, setToPokemonOptions } from './team';
import { createPokemon, createMove, runCalc, makeField } from './calc';
import { megaStones } from './data';

describe('mega forme resolution', () => {
  it('lists base + available megas for a dual-mega species', () => {
    const opts = formeOptions('Charizard');
    expect(opts.map((o) => o.name)).toEqual(['Charizard', 'Charizard-Mega-X', 'Charizard-Mega-Y']);
    expect(opts[0].label).toBe('Base');
    expect(opts.find((o) => o.name === 'Charizard-Mega-Y')?.label).toBe('Mega Y');
  });

  it('a Champions-only Mega present in live data is offered (Pyroar)', () => {
    expect(formeOptions('Pyroar').some((o) => o.name === 'Pyroar-Mega')).toBe(true);
  });

  it('a Mega genuinely absent from data is not offered (Tatsugiri); base still works', () => {
    expect(formeOptions('Tatsugiri').map((o) => o.name)).toEqual(['Tatsugiri']);
  });

  it('switching to a Mega forces the Mega ability (overwrites base)', () => {
    const base = makeSet({ species: 'Charizard', ability: 'Blaze', evs: { spa: 252 }, nature: 'Modest' });
    const mega = applyForme(base, 'Charizard-Mega-Y');
    expect(mega.species).toBe('Charizard-Mega-Y');
    expect(mega.ability).toBe('Drought');
    const mon = createPokemon(mega.species, { ability: mega.ability, evs: mega.evs, nature: mega.nature });
    expect(mon.ability).toBe('Drought');
    expect(mon.species.baseStats.spa).toBe(159);
  });

  it('switching to a Mega sets its required Mega Stone as the item', () => {
    const base = makeSet({ species: 'Charizard', item: 'Life Orb' });
    expect(applyForme(base, 'Charizard-Mega-X').item).toBe('Charizardite X');
    expect(applyForme(base, 'Charizard-Mega-Y').item).toBe('Charizardite Y');
    // Primal reversion is item-driven too (Blue/Red Orb).
    expect(applyForme(makeSet({ species: 'Kyogre' }), 'Kyogre-Primal').item).toBe('Blue Orb');
  });

  it('switching back to base resets an invalid (Mega-only) ability', () => {
    const mega = makeSet({ species: 'Charizard-Mega-Y', ability: 'Drought' });
    const base = applyForme(mega, 'Charizard');
    expect(base.species).toBe('Charizard');
    expect(base.ability).not.toBe('Drought');
  });

  it('a Mega forme does not feed its stone to the calc engine (would crash)', () => {
    const mega = applyForme(makeSet({ species: 'Venusaur', evs: { spa: 252 } }), 'Venusaur-Mega');
    expect(mega.item).toBe('Venusaurite'); // display set keeps the stone
    expect(setToPokemonOptions(mega).item).toBeUndefined(); // calc never sees it
    // A defender holding its stone used to throw on every move; must not now.
    const def = createPokemon(mega.species, setToPokemonOptions(mega));
    const atk = createPokemon('Incineroar', { ability: 'Blaze' });
    expect(() => runCalc(atk, def, createMove('Flamethrower'), makeField('Doubles'))).not.toThrow();
  });

  it('megaStones lists the required stones/orbs', () => {
    const stones = megaStones();
    expect(stones).toContain('Charizardite Y');
    expect(stones).toContain('Blue Orb'); // Primal
    expect(stones).not.toContain('Leftovers');
  });

  it('isMegaForme distinguishes formes', () => {
    expect(isMegaForme('Charizard-Mega-Y')).toBe(true);
    expect(isMegaForme('Charizard')).toBe(false);
  });
});
