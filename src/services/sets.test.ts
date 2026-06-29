import { describe, it, expect } from 'vitest';
import { createSetService } from './sets';
import { getFormat, type ResolvedFormat } from './formats';

const resolved = (statsId: string | null, note?: string): ResolvedFormat => ({
  def: getFormat('gen9vgc2026'),
  stats: { id: statsId, note },
  sets: { id: statsId },
});

const INCIN_USAGE = {
  abilities: { Intimidate: 0.9972, Blaze: 0.0028 },
  items: { 'Safety Goggles': 0.3218, 'Assault Vest': 0.2982 },
  teraTypes: { Bug: 0.3734, Ghost: 0.1966 },
  moves: { 'Fake Out': 0.9957, 'Knock Off': 0.9409, 'Flare Blitz': 0.72, 'Parting Shot': 0.65, 'U-turn': 0.1 },
  spreads: { 'Careful:252/4/0/0/252/0': 0.05, 'Impish:252/0/252/0/4/0': 0.04 },
};

function jsonFetch(routes: Record<string, unknown>) {
  return async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    return { json: async () => (key ? routes[key] : {}) };
  };
}

describe('opponent set fallback chain', () => {
  it('tier 1: builds the common set from usage stats with % alternatives', async () => {
    const svc = createSetService(jsonFetch({ '/stats/gen9vgc2026.json': { pokemon: { Incineroar: INCIN_USAGE } } }));
    const s = await svc.getCommonSet('Incineroar', resolved('gen9vgc2026'));
    expect(s.source).toBe('usage');
    expect(s.ability).toBe('Intimidate');
    expect(s.item).toBe('Safety Goggles');
    expect(s.teraType).toBe('Bug');
    expect(s.nature).toBe('Careful');
    expect(s.evs).toMatchObject({ hp: 252, spd: 252, atk: 4 });
    expect(s.moves).toEqual(['Fake Out', 'Knock Off', 'Flare Blitz', 'Parting Shot']);
    expect(s.items[0]).toEqual({ name: 'Safety Goggles', pct: 32.2 });
    expect(s.moveOptions.length).toBe(5); // all options exposed for the dropdown
  });

  it('propagates the fallback note when the format fell back to another reg', async () => {
    const svc = createSetService(jsonFetch({ '/stats/gen9vgc2026.json': { pokemon: { Incineroar: INCIN_USAGE } } }));
    const s = await svc.getCommonSet('Incineroar', resolved('gen9vgc2026', 'champions unavailable — using gen9vgc2026'));
    expect(s.note).toMatch(/champions unavailable/);
  });

  it('tier 3: falls back to a Smogon curated set when usage is empty', async () => {
    const svc = createSetService(
      jsonFetch({
        '/stats/gen9vgc2026.json': { pokemon: {} },
        '/sets/gen9.json': {
          Incineroar: {
            vgc2026: {
              Standard: {
                ability: 'Intimidate',
                item: 'Sitrus Berry',
                nature: 'Careful',
                evs: { hp: 252, spd: 252 },
                teratypes: ['Grass'],
                moves: ['Fake Out', 'Knock Off', 'Parting Shot', 'Flare Blitz'],
              },
            },
          },
        },
        '/analyses/gen9.json': { Incineroar: { vgc2026: { sets: { Standard: {} } } } },
      }),
    );
    const s = await svc.getCommonSet('Incineroar', resolved('gen9vgc2026'));
    expect(s.source).toBe('curated');
    expect(s.item).toBe('Sitrus Berry');
    expect(s.moves).toContain('Knock Off');
  });

  it('tier 4: degrades to base stats / neutral spread when nothing exists', async () => {
    const svc = createSetService(jsonFetch({})); // every fetch returns {}
    const s = await svc.getCommonSet('Incineroar', resolved('gen9vgc2026'));
    expect(s.source).toBe('base');
    expect(s.ability).toBe('Blaze'); // species' slot-0 ability (Intimidate is hidden)
    expect(s.note).toMatch(/base stats/);
  });

  it('never throws when fetch rejects', async () => {
    const svc = createSetService(async () => {
      throw new Error('offline');
    });
    const s = await svc.getCommonSet('Garchomp', resolved('gen9vgc2026'));
    expect(s.source).toBe('base');
    expect(s.species).toBe('Garchomp');
  });
});
