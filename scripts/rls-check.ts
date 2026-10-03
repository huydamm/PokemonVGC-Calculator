/**
 * Proves row-level security on a real Supabase project: user B can't see, change or delete user
 * A's teams, and the anon role sees nothing. Creates two throwaway users and deletes them after.
 *
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/rls-check.ts
 *
 * The service-role key is only for creating/deleting the test users. Keep it in your shell, never
 * in a file in this repo. Needs the Email provider enabled (Supabase's default).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !anonKey || !serviceKey) throw new Error('Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const fails: string[] = [];
const check = (ok: boolean, what: string) => (ok ? console.log('ok  ', what) : fails.push(what));

async function user(tag: string) {
  const email = `rls-${tag}-${Date.now()}@example.com`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, client };
}

const a = await user('a');
const b = await user('b');
try {
  const { data: row, error } = await a.client
    .from('teams')
    .insert({ user_id: a.id, name: 'A', format_id: 'gen9ou', paste: 'Garchomp\n- Earthquake' })
    .select()
    .single();
  if (error) throw error;
  check((await a.client.from('teams').select('id')).data?.length === 1, 'A reads own team');
  check((await b.client.from('teams').select('id')).data?.length === 0, 'B reads 0 of A\'s teams');
  check((await createClient(url, anonKey, opts).from('teams').select('id')).data?.length === 0, 'anon reads 0 teams');

  await b.client.from('teams').update({ name: 'hacked' }).eq('id', row.id);
  await b.client.from('teams').delete().eq('id', row.id);
  const after = (await a.client.from('teams').select('name').eq('id', row.id)).data;
  check(after?.[0]?.name === 'A', "B can't update or delete A's team");

  const forged = await b.client.from('teams').insert({ user_id: a.id, name: 'x', format_id: 'gen9ou', paste: 'x' });
  check(!!forged.error, "B can't insert a team owned by A");

  const anonDelete = await createClient(url, anonKey, opts).rpc('delete_account');
  check(!!anonDelete.error, 'anon cannot call delete_account');
  check(!(await b.client.rpc('delete_account')).error, 'B deletes own account');
  check((await a.client.from('teams').select('id')).data?.length === 1, "B's deletion leaves A's team");
} finally {
  await admin.auth.admin.deleteUser(a.id);
  await admin.auth.admin.deleteUser(b.id).catch(() => {});
}

if (fails.length) {
  console.error('FAIL:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('RLS check passed.');
