import { describe, it, expect } from 'vitest';
import { parseTeam, setToPokemonOptions } from './team';
import { createPokemon } from './calc';

const TEAM = `
Incineroar @ Safety Goggles
Ability: Intimidate
Level: 50
Tera Type: Grass
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Knock Off
- Parting Shot
- Will-O-Wisp

Charizard-Mega-Y @ Charizardite Y
Ability: Drought
Level: 50
Tera Type: Fire
EVs: 4 HP / 252 SpA / 252 Spe
Modest Nature
- Heat Wave
- Air Slash
- Solar Beam
- Protect

Iron Valiant @ Booster Energy
Ability: Quark Drive
Level: 50
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Thunderbolt
- Protect
- Encore

Amoonguss @ Sitrus Berry
Ability: Regenerator
Level: 50
Tera Type: Water
EVs: 252 HP / 156 Def / 100 SpD
Calm Nature
- Spore
- Rage Powder
- Pollen Puff
- Protect
`;

describe('team paste parsing', () => {
  it('parses a realistic 4-mon export including a Mega', () => {
    const { roster, errors } = parseTeam(TEAM);
    expect(errors).toEqual([]);
    expect(roster.map((r) => r.speciesName)).toEqual([
      'Incineroar',
      'Charizard-Mega-Y',
      'Iron Valiant',
      'Amoonguss',
    ]);

    const zard = roster[1];
    expect(zard.forme).toBe('Mega-Y');
    expect(zard.baseSpecies).toBe('Charizard');
    expect(zard.spriteUrl).toContain('charizard-megay');
    expect(zard.set.item).toBe('Charizardite Y');
    expect(zard.types).toContain('Fire');
  });

  it('a parsed set round-trips into a calc Pokémon with its spread', () => {
    const { roster } = parseTeam(TEAM);
    const inc = roster[0];
    const mon = createPokemon(inc.set.species, setToPokemonOptions(inc.set));
    expect(mon.ability).toBe('Intimidate');
    expect(mon.nature).toBe('Careful');
    expect(mon.level).toBe(50);
    expect(mon.evs.spd).toBe(252);
  });

  it('collects errors for unknown species without throwing, keeps valid ones', () => {
    const { roster, errors } = parseTeam('Notamon @ Leftovers\n\nPikachu @ Light Ball\nAbility: Static\n- Thunderbolt');
    expect(roster.map((r) => r.speciesName)).toEqual(['Pikachu']);
    expect(errors.join(' ')).toMatch(/Notamon/i);
  });

  it('returns empty (no throw) for blank input', () => {
    expect(parseTeam('   ')).toEqual({ roster: [], errors: [] });
  });
});
