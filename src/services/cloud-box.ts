/**
 * Signed-in team box: the same three calls as `localBox`, backed by the Supabase `teams` table
 * (supabase/migrations). Row-level security scopes every query to the signed-in user, so no
 * call filters by user id except the insert, which must name its owner.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareTeam, type BoxInput, type BoxTeam, type TeamBoxStore } from './team-box';

interface Row {
  id: string;
  name: string;
  format_id: string;
  paste: string;
  updated_at: string;
}

const COLS = 'id,name,format_id,paste,updated_at';
const toTeam = (r: Row): BoxTeam => ({ id: r.id, name: r.name, formatId: r.format_id, paste: r.paste, updatedAt: r.updated_at });

/** Postgres errors are for us; the box shows the player something readable. */
function fail(e: { message: string }): never {
  if (e.message.includes('team box is full')) throw new Error('Your box is full (100 teams). Delete one first.');
  throw new Error("Couldn't reach your synced box. Check your connection and try again.");
}

export function cloudBox(client: SupabaseClient, userId: string) {
  async function list(): Promise<BoxTeam[]> {
    const { data, error } = await client.from('teams').select(COLS).order('updated_at', { ascending: false });
    if (error) fail(error);
    return (data as Row[]).map(toTeam);
  }

  /** Insert, or replace the team with the same id (undo re-saves a deleted team by its old id). */
  async function save(t: BoxInput): Promise<BoxTeam> {
    const n = prepareTeam(t);
    const row = { id: n.id, user_id: userId, name: n.name, format_id: n.formatId, paste: n.paste, updated_at: n.updatedAt };
    const { data, error } = await client.from('teams').upsert(row).select(COLS).single();
    if (error) fail(error);
    return toTeam(data as Row);
  }

  async function remove(id: string): Promise<void> {
    const { error } = await client.from('teams').delete().eq('id', id);
    if (error) fail(error);
  }

  return { list, save, remove } satisfies TeamBoxStore;
}

/**
 * Moves guest teams into the cloud box on sign-in: skips ones already there (same paste and
 * format), uploads the rest as new teams, and drops each from the local box only once it's
 * uploaded, so a failure part way (full box, offline) loses nothing. Returns how many moved.
 */
export async function mergeLocal(local: TeamBoxStore, cloud: TeamBoxStore): Promise<number> {
  const mine = await local.list();
  if (!mine.length) return 0;
  const have = new Set((await cloud.list()).map((t) => `${t.formatId}\n${t.paste}`));
  let moved = 0;
  // Oldest first, so the newest guest team ends up on top of the cloud box.
  for (const t of [...mine].reverse()) {
    if (!have.has(`${t.formatId}\n${t.paste}`)) {
      await cloud.save({ name: t.name, formatId: t.formatId, paste: t.paste });
      moved++;
    }
    await local.remove(t.id);
  }
  return moved;
}
