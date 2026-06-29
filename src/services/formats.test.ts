import { describe, it, expect } from 'vitest';
import { resolveFormat, getFormat } from './formats';

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
    const r = await resolveFormat(getFormat('gen9champions'), mockFetch(new Set(['gen9vgc2026', 'gen9vgc2025'])));
    expect(r.stats.id).toBe('gen9vgc2026');
    expect(r.stats.note).toMatch(/unavailable/);
    expect(r.sets.id).toBe('gen9vgc2025');
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
