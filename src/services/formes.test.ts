import { describe, it, expect } from 'vitest';
import { formeOptions, applyForme, isMegaForme, makeSet } from './team';
import { createPokemon } from './calc';

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

  it('switching back to base resets an invalid (Mega-only) ability', () => {
    const mega = makeSet({ species: 'Charizard-Mega-Y', ability: 'Drought' });
    const base = applyForme(mega, 'Charizard');
    expect(base.species).toBe('Charizard');
    expect(base.ability).not.toBe('Drought');
  });

  it('isMegaForme distinguishes formes', () => {
    expect(isMegaForme('Charizard-Mega-Y')).toBe(true);
    expect(isMegaForme('Charizard')).toBe(false);
  });
});
