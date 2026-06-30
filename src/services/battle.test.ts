import { describe, it, expect } from 'vitest';
import { mapBattle, type SdBattle } from './battle';

// Trimmed from a real `room.battle` snapshot (extension/probe.js): a Gen 9
// doubles game, turn 2, sandstorm, your Incineroar/Excadrill vs their
// Landorus/Ogerpon-Wellspring (both -1 atk from Intimidate).
const mon = (o: Partial<Record<string, unknown>>) => ({
  speciesForme: 'X', level: 100, gender: 'M', fainted: false, hp: 100, maxhp: 100,
  status: '', boosts: {}, item: '', ability: '', teraType: '', terastallized: '',
  moveTrack: [], ...o,
});

const battle = {
  gen: 9, tier: '[Gen 9] VGC 2024', gameType: 'doubles', turn: 2,
  weather: 'sandstorm', pseudoWeather: [],
  mySide: {
    sideConditions: { tailwind: [] },
    active: [
      mon({ speciesForme: 'Incineroar', hp: 342, maxhp: 394, ability: 'Intimidate' }),
      mon({ speciesForme: 'Excadrill', gender: 'F', hp: 1, maxhp: 362, moveTrack: [['Rock Slide', 1]] }),
    ],
  },
  farSide: {
    sideConditions: {},
    active: [
      mon({ speciesForme: 'Landorus', hp: 76, maxhp: 100, boosts: { atk: -1 }, moveTrack: [['Sandsear Storm', 1]] }),
      mon({ speciesForme: 'Ogerpon-Wellspring', gender: 'F', hp: 64, maxhp: 100, boosts: { atk: -1 } }),
    ],
  },
} as unknown as SdBattle;

describe('mapBattle', () => {
  const snap = mapBattle(battle);

  it('reads field: doubles, sand, tailwind on your side', () => {
    expect(snap.field.gameType).toBe('Doubles');
    expect(snap.field.weather).toBe('Sand');
    expect(snap.field.mySide.tailwind).toBe(true);
    expect(snap.field.theirSide.tailwind).toBe(false);
  });

  it('your side has exact HP and is marked known', () => {
    const inc = snap.mine[0]!;
    expect(inc.species).toBe('Incineroar');
    expect(inc.known).toBe(true);
    expect(inc.hp).toBe(342);
    expect(inc.maxHP).toBe(394);
    expect(inc.hpPercent).toBe(87);
    expect(inc.ability).toBe('Intimidate');
  });

  it('opponent HP is percent-only, item/ability hidden, boosts + revealed moves kept', () => {
    const lando = snap.theirs[0]!;
    expect(lando.species).toBe('Landorus');
    expect(lando.known).toBe(false);
    expect(lando.hp).toBeUndefined(); // never exact for the opponent
    expect(lando.hpPercent).toBe(76);
    expect(lando.item).toBeUndefined();
    expect(lando.ability).toBeUndefined();
    expect(lando.boosts).toEqual({ atk: -1 });
    expect(lando.revealedMoves).toEqual(['Sandsear Storm']);
  });
});
