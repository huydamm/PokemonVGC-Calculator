/**
 * Optional sign-in (Supabase Auth, Discord or Google OAuth with PKCE). Accounts only sync the
 * team box; everything else works signed out. supabase-js is imported lazily, so guests never
 * download it: the client loads on a "Sign in" click, or on page load when a session (or an
 * OAuth redirect) is waiting. Without the two VITE_SUPABASE_* env vars accounts are off.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type Provider = 'discord' | 'google';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const AUTH_KEY = 'vgccalc.auth';

export const accountsEnabled = !!(URL_ && KEY);

let client: Promise<SupabaseClient> | null = null;
export function getClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY!, { auth: { flowType: 'pkce', storageKey: AUTH_KEY } }),
  );
  return client;
}

/** True when page load should start the client: a saved session, or the OAuth redirect's `?code=`. */
export function sessionPending(storage?: Storage, search = globalThis.location?.search ?? ''): boolean {
  if (!accountsEnabled) return false;
  if (/[?&](code|error)=/.test(search)) return true;
  try {
    return !!(storage ?? globalThis.localStorage).getItem(AUTH_KEY);
  } catch {
    return false;
  }
}

/** Calls `cb` with the session now and on every sign-in / sign-out. Returns an unsubscribe. */
export async function onSession(cb: (s: Session | null) => void): Promise<() => void> {
  const c = await getClient();
  const { data } = c.auth.onAuthStateChange((_event, s) => {
    // The first event follows supabase-js swapping the OAuth code for a session; drop it from the URL.
    if (/[?&](code|error)=/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.hash);
    cb(s);
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(provider: Provider) {
  const c = await getClient();
  const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
  if (error) throw new Error("Couldn't start sign-in. Try again.");
}

export async function signOut() {
  await (await getClient()).auth.signOut();
}

/** Deletes the account and, by cascade, every synced team (`delete_account` RPC). */
export async function deleteAccount() {
  const c = await getClient();
  const { error } = await c.rpc('delete_account');
  if (error) throw new Error("Couldn't delete your account. Try again.");
  await c.auth.signOut({ scope: 'local' });
}

/** What the account menu shows: the provider's display name, else the email. */
export function displayName(s: Session): string {
  const m = s.user.user_metadata ?? {};
  return String(m.full_name || m.name || m.user_name || s.user.email || 'Signed in');
}
