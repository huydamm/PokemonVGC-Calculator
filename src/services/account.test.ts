import type { Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { displayName } from './account';

describe('account', () => {
  it('stays off (and never loads supabase-js) without the env vars', async () => {
    // Blank the vars (a local .env.local sets them): same as a build without accounts.
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.resetModules();
    const { accountsEnabled, sessionPending } = await import('./account');
    vi.unstubAllEnvs();
    expect(accountsEnabled).toBe(false);
    expect(sessionPending(undefined, '?code=abc')).toBe(false);
  });

  it('names the user from provider metadata, then email', () => {
    const s = (meta: object, email?: string) => ({ user: { user_metadata: meta, email } }) as unknown as Session;
    expect(displayName(s({ full_name: 'Ash Ketchum', user_name: 'ash' }))).toBe('Ash Ketchum');
    expect(displayName(s({ user_name: 'ash' }))).toBe('ash');
    expect(displayName(s({}, 'a@b.c'))).toBe('a@b.c');
  });
});
