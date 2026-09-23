import { describe, it, expect } from 'vitest';
import { parseTeam, setToPokemonOptions, searchSpecies } from './team';
import { createPokemon } from './calc';
import { legalItems } from './data';
import { getFormat } from './formats';

describe('searchSpecies format legality filter', () => {
  const has = (list: { name: string }[], name: string) => list.some((e) => e.name === name);

  it('OU excludes Ubers/AG but keeps standard mons', () => {
    const ou = searchSpecies('', 2000, 'gen9ou');
    expect(has(ou, 'Koraidon')).toBe(false); // Uber
    expect(has(ou, 'Miraidon')).toBe(false); // AG
    expect(has(ou, 'Landorus-Therian')).toBe(true);
  });

  it('Doubles OU excludes Ubers like Singles', () => {
    const dou = searchSpecies('', 2000, 'gen9doublesou');
    expect(has(dou, 'Miraidon')).toBe(false); // AG
    expect(has(dou, 'Landorus-Therian')).toBe(true);
  });

  it('Champions has its own roster: no Legendaries, includes Past-dex mons', () => {
    const champ = searchSpecies('', 3000, 'gen9champions');
    expect(has(champ, 'Koraidon')).toBe(false); // no legendaries in Champions
    expect(has(champ, 'Beedrill')).toBe(true); // Past in SV, real in Champions
    expect(has(champ, 'Incineroar')).toBe(true);
  });

  it('Champions roster tracks Reg M-C (Showdown champions mod)', () => {
    const champ = searchSpecies('', 3000, 'gen9champions');
    // Meowstic-F has no formats-data entry: it inherits Meowstic's legality.
    for (const name of ['Baxcalibur', 'Golisopod', 'Salamence', 'Kingambit', 'Ninetales-Alola', 'Rotom-Wash', 'Basculegion-F', 'Meowstic-F']) {
      expect(has(champ, name), name).toBe(true);
    }
    expect(has(champ, 'Mewtwo')).toBe(false);
    expect(has(champ, 'Aegislash-Blade')).toBe(false); // battle-only forme
    expect(has(champ, 'Absol-Mega-Z')).toBe(false); // Megas come from the forme toggle
  });

  it('Champions limits the item pool; other formats are unrestricted', () => {
    const champ = legalItems('gen9champions');
    expect(champ).not.toBeNull();
    expect(champ).toContain('Leftovers');
    expect(champ).toContain('Mawilite'); // canonical stone name
    for (const item of ['Absolite Z', 'Baxcalibrite', 'Rocky Helmet', 'Air Balloon']) expect(champ).toContain(item); // Reg M-C
    expect(champ).not.toContain('Booster Energy'); // no Paradox mons in Champions
    expect(legalItems('gen9ou')).toBeNull(); // whole item dex
  });

  it('no format id => whole dex (no restriction)', () => {
    const all = searchSpecies('Koraidon', 5);
    expect(has(all, 'Koraidon')).toBe(true);
  });
});

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

describe('parseTeam fits pastes to the format', () => {
  const stats = (text: string, id: string) => {
    const set = parseTeam(text, getFormat(id)).roster[0].set;
    return createPokemon(set.species, setToPokemonOptions(set)).stats;
  };

  it('a paste without Level: is at the format level', () => {
    expect(parseTeam('Garchomp\n- Earthquake', getFormat('gen9ou')).roster[0].set.level).toBe(100);
    expect(parseTeam('Garchomp\nLevel: 50\n- Earthquake', getFormat('gen9ou')).roster[0].set.level).toBe(50);
  });

  it('Champions EVs are Stat Points, matching Showdown (stat = base + SP + 20)', () => {
    const sp = 'Garchomp\nEVs: 32 HP / 32 Atk / 2 Spe\nIVs: 0 Atk\nJolly Nature\n- Earthquake';
    expect(stats(sp, 'gen9champions')).toMatchObject({ hp: 215, atk: 182, spe: 136 });
    // A classic EV spread is left as EVs.
    const ev = 'Garchomp\nEVs: 252 HP / 252 Atk / 4 Spe\nJolly Nature\n- Earthquake';
    expect(stats(ev, 'gen9champions')).toMatchObject({ hp: 215, atk: 182 });
  });
});
