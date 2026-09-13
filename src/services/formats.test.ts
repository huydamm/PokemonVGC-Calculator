import { describe, it, expect } from 'vitest';
import { resolveFormat, getFormat, liveFormatDef } from './formats';

/** Mock fetch where only the ids in `present` return ok. */
function mockFetch(present: Set<string>) {
  return async (url: string) => ({ ok: [...present].some((id) => url.includes(`/${id}.json`)) });
}

describe('format source resolution', () => {
  it('uses the primary source when present (no note)', async () => {
    const r = await resolveFormat(getFormat('gen9ou'), mockFetch(new Set(['gen9ou'])));
    expect(r.stats).toEqual({ id: 'gen9ou' });
    expect(r.sets).toEqual({ id: 'gen9ou' });
  });

  it('falls back down the chain and reports which tier was used', async () => {
    // Champions stats unpublished -> should land on gen9vgc2026 with a note.
    const r = await resolveFormat(getFormat('gen9champions'), mockFetch(new Set(['gen9vgc2026'])));
    expect(r.stats.id).toBe('gen9vgc2026');
    expect(r.stats.note).toMatch(/unavailable/);
    expect(r.sets.id).toBe('gen9vgc2026');
  });

  it('Champions prefers its own data.pkmn.cc stats over SV VGC', async () => {
    const r = await resolveFormat(getFormat('gen9champions'), mockFetch(new Set(['gen9championsvgc2026', 'gen9vgc2026'])));
    expect(r.stats).toEqual({ id: 'gen9championsvgc2026' });
  });

  it('never throws when nothing is available; signals base-stats fallback', async () => {
    const r = await resolveFormat(getFormat('gen9champions'), mockFetch(new Set()));
    expect(r.stats.id).toBeNull();
    expect(r.stats.note).toMatch(/base stats/);
  });

  it('tolerates a fetch that rejects', async () => {
    const throwing = async () => {
      throw new Error('network down');
    };
    const r = await resolveFormat(getFormat('gen9ou'), throwing);
    expect(r.stats.id).toBeNull();
  });
});

describe('liveFormatDef (extension tier strings)', () => {
  it('maps every Champions tier to the Champions format', () => {
    for (const tier of [
      '[Gen 9 Champions] VGC 2026 Reg M-C',
      '[Gen 9 Champions] VGC 2026 Reg M-C (Bo3)',
      '[Gen 9 Champions] BSS Reg M-C',
    ]) {
      const def = liveFormatDef(tier, 'Doubles', 50);
      expect(def.id).toBe('gen9champions');
      expect(def.megasEnabled).toBe(true);
    }
    expect(liveFormatDef('[Gen 9 Champions] BSS Reg M-C', 'Singles', 50).gameType).toBe('Singles');
  });

  it('other tiers probe their own id, then strip a reg suffix', () => {
    expect(liveFormatDef('[Gen 9] Doubles OU', 'Doubles', 100).statsCandidates[0]).toBe('gen9doublesou');
    const vgc = liveFormatDef('[Gen 9] VGC 2026 Reg I', 'Doubles', 50).statsCandidates;
    expect(vgc.slice(0, 2)).toEqual(['gen9vgc2026regi', 'gen9vgc2026']);
    expect(new Set(vgc).size).toBe(vgc.length);
  });
});
