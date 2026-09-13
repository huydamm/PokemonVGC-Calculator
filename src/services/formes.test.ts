import { describe, it, expect } from 'vitest';
import { formeOptions, applyForme, isMegaForme, makeSet, setToPokemonOptions, searchSpecies } from './team';
import { createPokemon, createMove, runCalc, makeField } from './calc';
import { megaStones, abilitiesFor, legalItems, isModeledAbility } from './data';

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

  it('reverting a Mega to base drops the now-illegal stone', () => {
    const mega = applyForme(makeSet({ species: 'Charizard', item: 'Life Orb' }), 'Charizard-Mega-Y');
    expect(mega.item).toBe('Charizardite Y');
    expect(applyForme(mega, 'Charizard').item).toBe(''); // caller fills the common item
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

  it('a Mega Stone held by a base forme never reaches the calc either', () => {
    // CBD usage ranks the stone first for base Garchomp; as a defender this threw.
    const base = makeSet({ species: 'Garchomp', item: 'Garchompite' });
    expect(setToPokemonOptions(base).item).toBeUndefined();
    expect(setToPokemonOptions(makeSet({ species: 'Garchomp', item: 'Life Orb' })).item).toBe('Life Orb');
    const inc = createPokemon('Incineroar', { ability: 'Intimidate' });
    const def = createPokemon('Garchomp', setToPokemonOptions(base));
    expect(() => runCalc(inc, def, createMove('Flare Blitz'), makeField('Doubles'))).not.toThrow();
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

// Reg M-C: Z Megas are forme "Mega-Z" and the dex leaves isMega unset.
describe('Z Mega formes (Reg M-C)', () => {
  it('offers both the Mega and the Z Mega', () => {
    const names = formeOptions('Absol').map((o) => o.name);
    expect(names).toContain('Absol-Mega');
    expect(names).toContain('Absol-Mega-Z');
    expect(isMegaForme('Absol-Mega-Z')).toBe(true);
  });

  it('switching to a Z Mega forces its stone, which never reaches the calc', () => {
    const z = applyForme(makeSet({ species: 'Absol', item: 'Life Orb' }), 'Absol-Mega-Z');
    expect(z.item).toBe('Absolite Z');
    expect(setToPokemonOptions(z).item).toBeUndefined();
    expect(applyForme(z, 'Absol').item).toBe('');
    const def = createPokemon(z.species, setToPokemonOptions(z));
    const atk = createPokemon('Incineroar', { ability: 'Blaze' });
    expect(() => runCalc(atk, def, createMove('Flare Blitz'), makeField('Doubles'))).not.toThrow();
  });

  it('megaStones includes the new M-C stones', () => {
    const stones = megaStones();
    for (const s of ['Absolite Z', 'Garchompite Z', 'Lucarionite Z', 'Golisopite', 'Baxcalibrite']) {
      expect(stones).toContain(s);
    }
  });

  it('species search never lists a Z Mega as a base species', () => {
    expect(searchSpecies('absol').map((e) => e.name)).not.toContain('Absol-Mega-Z');
  });
});

describe('Champions formes and items', () => {
  it('pairs a Mega with the forme it evolves from', () => {
    expect(formeOptions('Floette-Eternal').map((o) => o.name)).toEqual(['Floette-Eternal', 'Floette-Mega']);
    expect(formeOptions('Floette-Mega')[0].name).toBe('Floette-Eternal');
    expect(formeOptions('Raichu-Alola').map((o) => o.name)).toEqual(['Raichu-Alola']); // no Kanto Megas
    expect(formeOptions('Raichu').map((o) => o.name)).toContain('Raichu-Mega-X');
    expect(formeOptions('Meowstic').map((o) => o.name)).toContain('Meowstic-M-Mega'); // forme "M-Mega"
    expect(formeOptions('Meowstic-F').map((o) => o.name)).toEqual(['Meowstic-F', 'Meowstic-F-Mega']);
  });

  it('every Champions-legal item is safe on a calc defender (stones, Leek)', () => {
    const atk = createPokemon('Incineroar', { ability: 'Intimidate' });
    const move = createMove('Flare Blitz');
    for (const item of legalItems('gen9champions')!) {
      const def = createPokemon('Garchomp', setToPokemonOptions(makeSet({ species: 'Garchomp', item })));
      expect(() => runCalc(atk, def, move, makeField('Doubles')), item).not.toThrow();
    }
  });

  it('flags abilities the calc does not know', () => {
    expect(isModeledAbility('Aura Guard')).toBe(false);
    expect(isModeledAbility('Levitate')).toBe(true);
    expect(isModeledAbility(undefined)).toBe(true);
  });
});

// champions-dex-patch.json: @pkmn/dex still carries Z-A abilities for these.
describe('Champions dex patch (Reg M-C abilities)', () => {
  it('new Megas carry their Champions abilities', () => {
    expect(abilitiesFor('Absol-Mega-Z')).toEqual(['Sharpness']);
    expect(abilitiesFor('Golisopod-Mega')).toEqual(['Tough Claws']);
    expect(abilitiesFor('Baxcalibur-Mega')).toEqual(['Thermal Exchange']);
    expect(applyForme(makeSet({ species: 'Garchomp' }), 'Garchomp-Mega-Z').ability).toBe('Levitate');
  });

  it('patched abilities reach the calc: Levitate blocks Ground; Aura Guard does not crash', () => {
    const chomp = applyForme(makeSet({ species: 'Garchomp' }), 'Garchomp-Mega-Z');
    const atk = createPokemon('Garchomp', { ability: 'Rough Skin' });
    const eq = createMove('Earthquake');
    expect(runCalc(atk, createPokemon('Garchomp'), eq, makeField('Doubles')).range[1]).toBeGreaterThan(0);
    let max = 0;
    try {
      max = runCalc(atk, createPokemon(chomp.species, setToPokemonOptions(chomp)), eq, makeField('Doubles')).range[1];
    } catch {
      /* the engine throws on a 0-damage result; every UI caller catches it the same way */
    }
    expect(max).toBe(0);

    const lucario = applyForme(makeSet({ species: 'Lucario' }), 'Lucario-Mega-Z');
    expect(lucario.ability).toBe('Aura Guard');
    const def = createPokemon(lucario.species, setToPokemonOptions(lucario));
    expect(() => runCalc(atk, def, createMove('Close Combat'), makeField('Doubles'))).not.toThrow();
  });
});
