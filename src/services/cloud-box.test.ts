import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { cloudBox, mergeLocal } from './cloud-box';
import { localBox, type BoxTeam } from './team-box';

type Row = { id: string; user_id: string; name: string; format_id: string; paste: string; updated_at: string };

/** Just the query chains cloudBox uses, over one in-memory table with the migration's cap trigger. */
function fakeClient(rows: Row[] = [], opts: { cap?: number; down?: boolean } = {}) {
  const err = (message: string) => ({ data: null, error: { message } });
  const ok = <T>(data: T) => ({ data, error: null });
  const client = {
    from: () => ({
      select: () => ({
        order: async () =>
          opts.down ? err('fetch failed') : ok([...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at))),
      }),
      upsert: (row: Row) => ({
        select: () => ({
          single: async () => {
            const i = rows.findIndex((r) => r.id === row.id);
            if (i < 0 && rows.length >= (opts.cap ?? 100)) return err('team box is full (100)');
            if (i >= 0) rows[i] = row;
            else rows.push(row);
            return ok(row);
          },
        }),
      }),
      delete: () => ({
        eq: async (_: string, id: string) => {
          rows.splice(0, rows.length, ...rows.filter((r) => r.id !== id));
          return ok(null);
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, rows };
}

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const PASTE = 'Incineroar @ Safety Goggles\nAbility: Intimidate\n- Fake Out';
const PASTE_2 = 'Garchomp\n- Earthquake';

describe('cloudBox', () => {
  it('saves with the owner id, updates in place, lists newest first, removes', async () => {
    const { client, rows } = fakeClient();
    const box = cloudBox(client, 'user-a');
    const a = await box.save({ name: 'A', formatId: 'gen9ou', paste: ` ${PASTE} ` });
    expect(rows[0]).toMatchObject({ user_id: 'user-a', name: 'A', format_id: 'gen9ou', paste: PASTE });
    await new Promise((r) => setTimeout(r, 2));
    await box.save({ name: '', formatId: 'gen9champions', paste: PASTE_2 });
    expect((await box.list()).map((t) => t.name)).toEqual(['Garchomp', 'A']);

    await box.save({ id: a.id, name: 'A2', formatId: 'gen9ou', paste: PASTE });
    expect(rows).toHaveLength(2);
    await box.remove(a.id);
    expect((await box.list()).map((t) => t.name)).toEqual(['Garchomp']);
  });

  it('turns database errors into readable ones and validates before writing', async () => {
    const { client } = fakeClient([], { cap: 0 });
    const box = cloudBox(client, 'u');
    await expect(box.save({ name: 'x', formatId: 'gen9ou', paste: PASTE })).rejects.toThrow(/box is full/);
    await expect(box.save({ name: 'x', formatId: 'gen9ou', paste: '  ' })).rejects.toThrow(/Paste a team/);
    await expect(cloudBox(fakeClient([], { down: true }).client, 'u').list()).rejects.toThrow(/connection/);
  });
});

describe('mergeLocal', () => {
  it('uploads guest teams not already synced, then empties the local box', async () => {
    const local = localBox(memStorage());
    const { client, rows } = fakeClient();
    const cloud = cloudBox(client, 'u');
    await cloud.save({ name: 'Already', formatId: 'gen9ou', paste: PASTE });
    local.save({ name: 'Dupe', formatId: 'gen9ou', paste: PASTE });
    local.save({ name: 'Same paste, other format', formatId: 'gen9champions', paste: PASTE });
    local.save({ name: 'New', formatId: 'gen9ou', paste: PASTE_2 });

    expect(await mergeLocal(local, cloud)).toBe(2);
    expect(rows.map((r) => r.name).sort()).toEqual(['Already', 'New', 'Same paste, other format']);
    expect(local.list()).toEqual([]);
    expect(await mergeLocal(local, cloud)).toBe(0);
  });

  it('keeps the guest teams it could not upload', async () => {
    const local = localBox(memStorage());
    local.save({ name: 'One', formatId: 'gen9ou', paste: PASTE });
    local.save({ name: 'Two', formatId: 'gen9ou', paste: PASTE_2 });
    const cloud = cloudBox(fakeClient([], { cap: 1 }).client, 'u');
    await expect(mergeLocal(local, cloud)).rejects.toThrow(/box is full/);
    expect(local.list().map((t: BoxTeam) => t.name)).toEqual(['Two']);
  });
});
