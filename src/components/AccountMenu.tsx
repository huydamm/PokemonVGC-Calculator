import type { Session } from '@supabase/supabase-js';
import { displayName, type Provider } from '../services/account';

/** Header sign-in (guest) or account menu (signed in). A native <details> so it needs no popup logic. */
export function AccountMenu({
  session,
  onSignIn,
  onSignOut,
  onExport,
  onDelete,
}: {
  session: Session | null;
  onSignIn: (p: Provider) => void;
  onSignOut: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  if (!session) {
    return (
      <details className="account">
        <summary className="box-btn">Sign in</summary>
        <div className="account-pop">
          <p>Optional. Syncs your team box across devices.</p>
          <button type="button" className="box-btn" onClick={() => onSignIn('discord')}>
            Discord
          </button>
          <button type="button" className="box-btn" onClick={() => onSignIn('google')}>
            Google
          </button>
          <a href="/privacy.html">What we store</a>
        </div>
      </details>
    );
  }
  const name = displayName(session);
  return (
    <details className="account">
      <summary className="box-btn" aria-label={`Account: ${name}`}>
        {name.slice(0, 18)}
      </summary>
      <div className="account-pop">
        <p>Your box is synced.</p>
        <button type="button" className="box-btn" onClick={onExport}>
          Export teams
        </button>
        <button type="button" className="box-btn" onClick={onSignOut}>
          Sign out
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            if (confirm('Delete your account and every synced team? This cannot be undone.')) onDelete();
          }}
        >
          Delete account
        </button>
      </div>
    </details>
  );
}
