import { describe, it, expect } from 'vitest';
import { createChampionsSets } from './champions-sets';

// Trimmed capture of championsbattledata.com's live shape (top 2 rows/category).
const GARCHOMP_ROWS = [
  { category: 'move', rank: 1, name: 'Dragon Claw', percentage: '89.1%', percentage_value: 89.1 },
  { category: 'move', rank: 2, name: 'Rock Slide', percentage: '84.3%', percentage_value: 84.3 },
  { category: 'held_item', rank: 1, name: 'Life Orb', percentage: '57.4%', percentage_value: 57.4 },
  { category: 'held_item', rank: 2, name: 'Sitrus Berry', percentage: '10.5%', percentage_value: 10.5 },
  { category: 'teammate', rank: 1, name: 'Whimsicott' },
  { category: 'stat_alignment', rank: 1, name: 'Jolly', percentage: '66.2%', percentage_value: 66.2, stat_up: 'Speed', stat_down: 'Sp. Atk' },
  { category: 'stat_alignment', rank: 2, name: 'Adamant', percentage: '31.3%', percentage_value: 31.3 },
  { category: 'stat_points', rank: 1, percentage: '47.3%', percentage_value: 47.3, hp_points: 2, attack_points: 32, defense_points: 0, sp_atk_points: 0, sp_def_points: 0, speed_points: 32 },
  { category: 'stat_points', rank: 2, percentage: '5.9%', percentage_value: 5.9, hp_points: 0, attack_points: 30, defense_points: 4, sp_atk_points: 0, sp_def_points: 0, speed_points: 32 },
  { category: 'ability', rank: 1, name: 'Rough Skin', percentage: '97.6%', percentage_value: 97.6 },
  { category: 'ability', rank: 2, name: 'Sand Veil', percentage: '2.4%', percentage_value: 2.4 },
];

function fakeFetch(routes: Record<string, unknown>, missing = new Set<string>()) {
  return async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const absent = [...missing].some((m) => url.includes(m));
    return { ok: !!key && !absent, json: async () => (key ? routes[key] : {}) };
  };
}

const INDEX = { pokemon: [{ name: 'Garchomp', battleName: 'Garchomp' }, { name: 'Urshifu Rapid Strike', battleName: 'Urshifu Rapid Strike' }] };

describe('champions-sets (CBD)', () => {
  it('maps rows to a suggested set: top move/item/ability/nature and SP->EV spread', async () => {
    const svc = createChampionsSets(fakeFetch({ '/api/index': INDEX, '/api/battle/Doubles/Garchomp': { rows: GARCHOMP_ROWS } }));
    const s = await svc.get('Garchomp', 50);
    expect(s).not.toBeNull();
    expect(s!.source).toBe('usage');
    expect(s!.item).toBe('Life Orb');
    expect(s!.ability).toBe('Rough Skin');
    expect(s!.nature).toBe('Jolly');
    expect(s!.moves).toEqual(['Dragon Claw', 'Rock Slide']);
    expect(s!.teraTypes).toEqual([]); // Champions has no Tera
    // Stat Points (0-32) convert to EVs at x8: 32 SP -> 252-cap territory (256).
    expect(s!.evs).toEqual({ hp: 16, atk: 256, def: 0, spa: 0, spd: 0, spe: 256 });
    expect(s!.spreads).toHaveLength(2);
  });

  it('resolves formes by normalized battleName', async () => {
    const svc = createChampionsSets(
      fakeFetch({ '/api/index': INDEX, '/api/battle/Doubles/Urshifu%20Rapid%20Strike': { rows: GARCHOMP_ROWS } }),
    );
    // app species id "Urshifu-Rapid-Strike" normalizes to the CBD battleName
    const s = await svc.get('Urshifu-Rapid-Strike', 50);
    expect(s).not.toBeNull();
    expect(s!.item).toBe('Life Orb');
  });

  it('returns null when CBD has no entry (falls through to base chain)', async () => {
    const svc = createChampionsSets(fakeFetch({ '/api/index': INDEX }));
    expect(await svc.get('Pikachu', 50)).toBeNull();
  });

  it('returns null (never throws) when the index is unavailable', async () => {
    const svc = createChampionsSets(fakeFetch({}, new Set(['/api/index'])));
    expect(await svc.get('Garchomp', 50)).toBeNull();
  });
});
