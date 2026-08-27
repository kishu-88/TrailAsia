import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';

/** Shell for every signed-in screen: top bar, sign-out, and the routed content. */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__brand">TrailAsia</span>
        <div className="top-bar__right">
          <span className="top-bar__user">{user.fullName}</span>
          <button
            type="button"
            className="button button--ghost"
            onClick={handleLogout}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
