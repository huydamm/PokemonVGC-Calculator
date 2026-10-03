import { describe, expect, it } from 'vitest';
import { BOX_KEY, MAX_PASTE, MAX_TEAMS, defaultTeamName, exportText, localBox, sharesSpecies, type BoxTeam } from './team-box';

function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
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

const PASTE = `Incineroar @ Safety Goggles
Ability: Intimidate
- Fake Out

Flutter Mane @ Booster Energy
Ability: Protosynthesis
- Moonblast

Garchomp
- Earthquake`;

describe('localBox', () => {
  it('saves, lists newest first, updates in place, removes', async () => {
    const box = localBox(memStorage());
    const a = box.save({ name: 'A', formatId: 'gen9ou', paste: PASTE });
    await new Promise((r) => setTimeout(r, 2));
    const b = box.save({ name: 'B', formatId: 'gen9champions', paste: PASTE });
    expect(box.list().map((t) => t.name)).toEqual(['B', 'A']);

    await new Promise((r) => setTimeout(r, 2));
    const a2 = box.save({ id: a.id, name: 'A2', formatId: 'gen9ou', paste: PASTE });
    expect(a2.id).toBe(a.id);
    expect(box.list().map((t) => t.name)).toEqual(['A2', 'B']);

    box.remove(b.id);
    expect(box.list().map((t) => t.id)).toEqual([a.id]);
  });

  it('defaults a blank name from the species', () => {
    const box = localBox(memStorage());
    expect(box.save({ name: '  ', formatId: 'gen9ou', paste: PASTE }).name).toBe('Incineroar + Flutter Mane');
  });

  it('reads corrupt or malformed storage as an empty box, keeping valid entries', () => {
    expect(localBox(memStorage({ [BOX_KEY]: '{not json' })).list()).toEqual([]);
    const good: BoxTeam = { id: '1', name: 'ok', formatId: 'gen9ou', paste: PASTE, updatedAt: '2026-01-01' };
    const box = localBox(memStorage({ [BOX_KEY]: JSON.stringify([good, { id: 2 }, null, 'x']) }));
    expect(box.list()).toEqual([good]);
  });

  it('caps paste size and team count', () => {
    const box = localBox(memStorage());
    expect(() => box.save({ name: 'x', formatId: 'gen9ou', paste: 'a'.repeat(MAX_PASTE + 1) })).toThrow(/too long/);
    expect(() => box.save({ name: 'x', formatId: 'gen9ou', paste: '   ' })).toThrow(/Paste a team/);
    const full = Array.from({ length: MAX_TEAMS }, (_, i) => ({
      id: String(i), name: 'n', formatId: 'gen9ou', paste: 'p', updatedAt: '2026-01-01',
    }));
    const fullBox = localBox(memStorage({ [BOX_KEY]: JSON.stringify(full) }));
    expect(() => fullBox.save({ name: 'x', formatId: 'gen9ou', paste: PASTE })).toThrow(/full/);
    // Updating an existing team is still allowed at the cap.
    expect(fullBox.save({ id: '5', name: 'x', formatId: 'gen9ou', paste: PASTE }).name).toBe('x');
  });

  it('degrades when storage is blocked: empty list, readable error on save', () => {
    const blocked = memStorage();
    blocked.getItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    blocked.setItem = blocked.getItem;
    const box = localBox(blocked);
    expect(box.list()).toEqual([]);
    expect(() => box.save({ name: 'x', formatId: 'gen9ou', paste: PASTE })).toThrow(/blocking site storage/);
  });

  it('truncates long names to MAX_NAME (60 chars)', () => {
    const box = localBox(memStorage());
    const longName = 'a'.repeat(100);
    const saved = box.save({ name: longName, formatId: 'gen9ou', paste: PASTE });
    expect(saved.name.length).toBe(60);
    expect(saved.name).toBe('a'.repeat(60));
    const loaded = box.list()[0];
    expect(loaded.name).toBe('a'.repeat(60));
  });

  it('preserves ID when updating among multiple teams', () => {
    const box = localBox(memStorage());
    box.save({ name: 'First', formatId: 'gen9ou', paste: PASTE });
    const t2 = box.save({ name: 'Second', formatId: 'gen9ou', paste: PASTE });
    box.save({ name: 'Third', formatId: 'gen9ou', paste: PASTE });
    const updated = box.save({ id: t2.id, name: 'Second Updated', formatId: 'gen9ou', paste: PASTE });
    expect(updated.id).toBe(t2.id);
    const list = box.list();
    const found = list.find((t) => t.id === t2.id);
    expect(found?.name).toBe('Second Updated');
    expect(found?.id).toBe(t2.id);
  });

  it('maintains sort order after update (updated team moves to top)', async () => {
    const box = localBox(memStorage());
    const t1 = box.save({ name: 'Oldest', formatId: 'gen9ou', paste: PASTE });
    const olderId = t1.id;
    const oldTime = t1.updatedAt;

    await new Promise((r) => setTimeout(r, 2));

    box.save({ name: 'Newest', formatId: 'gen9ou', paste: PASTE });
    expect(box.list().map((t) => t.name)).toEqual(['Newest', 'Oldest']);

    await new Promise((r) => setTimeout(r, 2));
    const updated = box.save({ id: olderId, name: 'Now Newest', formatId: 'gen9ou', paste: PASTE });

    expect(updated.updatedAt > oldTime).toBe(true);
    expect(box.list().map((t) => t.name)).toEqual(['Now Newest', 'Newest']);
  });
});

describe('sharesSpecies', () => {
  it('matches an edit of the same team, not a different or empty one', () => {
    expect(sharesSpecies(PASTE, 'Garchomp @ Life Orb\n- Earthquake')).toBe(true);
    expect(sharesSpecies(PASTE, 'Amoonguss\n- Spore')).toBe(false);
    expect(sharesSpecies(PASTE, '')).toBe(false);
  });
});

describe('defaultTeamName', () => {
  it('falls back for unparseable text', () => {
    expect(defaultTeamName('')).toBe('Untitled team');
  });
});

describe('exportText', () => {
  it('writes a Showdown teambuilder backup', () => {
    const t = (name: string, formatId: string, paste: string): BoxTeam => ({ id: name, name, formatId, paste, updatedAt: '' });
    expect(exportText([t('A', 'gen9ou', 'Garchomp'), t('B', 'gen9champions', 'Incineroar')])).toBe(
      '=== [gen9ou] A ===\n\nGarchomp\n\n=== [gen9champions] B ===\n\nIncineroar\n',
    );
  });
});
