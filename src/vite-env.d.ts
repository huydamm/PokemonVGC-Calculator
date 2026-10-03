/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL and public anon key; both unset = accounts off (see services/account.ts). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
