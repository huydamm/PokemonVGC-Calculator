/**
 * Team box: saved teams kept in the browser (localStorage), so a returning player picks a
 * team instead of re-pasting it. A team is its Showdown paste text, which `parseTeam` reads.
 * Reads never throw (blocked or corrupt storage is an empty box); writes throw a readable
 * Error the UI shows as a notice.
 */
import { parseTeam } from './team';

export interface BoxTeam {
  id: string;
  name: string;
  formatId: string;
  /** Showdown export text. */
  paste: string;
  /** ISO timestamp. */
  updatedAt: string;
}

export const BOX_KEY = 'vgccalc.box.v1';
export const MAX_TEAMS = 100;
export const MAX_PASTE = 10_000;
export const MAX_NAME = 60;

const valid = (t: unknown): t is BoxTeam => {
  const b = t as BoxTeam;
  return (
    !!b &&
    typeof b.id === 'string' &&
    typeof b.name === 'string' &&
    typeof b.formatId === 'string' &&
    typeof b.paste === 'string' &&
    b.paste.length <= MAX_PASTE &&
    typeof b.updatedAt === 'string'
  );
};

// ponytail: sync localStorage only; phase 2 (cloud sync) wraps these three calls if it happens
export function localBox(storage?: Storage) {
  // Resolved per call: touching `localStorage` itself throws when site data is blocked.
  const store = () => storage ?? globalThis.localStorage;

  function list(): BoxTeam[] {
    try {
      const arr: unknown = JSON.parse(store().getItem(BOX_KEY) ?? '[]');
      return Array.isArray(arr) ? arr.filter(valid).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
    } catch {
      return [];
    }
  }

  function write(teams: BoxTeam[]) {
    try {
      store().setItem(BOX_KEY, JSON.stringify(teams));
    } catch {
      throw new Error("Couldn't save: this browser is blocking site storage (private window?).");
    }
  }

  /** Insert, or replace the team with the same id. Newest first. */
  function save(t: { id?: string; name: string; formatId: string; paste: string }): BoxTeam {
    const paste = t.paste.trim();
    if (!paste) throw new Error('Paste a team before saving.');
    if (paste.length > MAX_PASTE) throw new Error('That team is too long to save (10 KB max).');
    const teams = list();
    const others = teams.filter((x) => x.id !== t.id);
    if (others.length === teams.length && teams.length >= MAX_TEAMS) {
      throw new Error(`Your box is full (${MAX_TEAMS} teams). Delete one first.`);
    }
    const next: BoxTeam = {
      id: t.id ?? crypto.randomUUID(),
      name: (t.name.trim() || defaultTeamName(paste)).slice(0, MAX_NAME),
      formatId: t.formatId,
      paste,
      updatedAt: new Date().toISOString(),
    };
    write([next, ...others]);
    return next;
  }

  function remove(id: string) {
    write(list().filter((x) => x.id !== id));
  }

  return { list, save, remove };
}

/** True if two pastes share a species: a paste edit that shares none is a different team. */
export function sharesSpecies(a: string, b: string): boolean {
  const seen = new Set(parseTeam(a).roster.map((m) => m.baseSpecies));
  return parseTeam(b).roster.some((m) => seen.has(m.baseSpecies));
}

/** "Incineroar + Flutter Mane" from the first two species, or a generic name. */
export function defaultTeamName(paste: string): string {
  const species = parseTeam(paste).roster.slice(0, 2).map((m) => m.speciesName);
  return species.length ? species.join(' + ') : 'Untitled team';
}
