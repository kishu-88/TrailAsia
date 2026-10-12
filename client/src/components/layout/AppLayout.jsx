import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import NotificationBell from './NotificationBell.jsx';
import Sidebar from './Sidebar.jsx';
import Button from '../common/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../utils/format.js';

/** Shell for every signed-in screen: sidebar, top bar, routed content. */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className={`app-shell${navOpen ? ' app-shell--nav-open' : ''}`}>
      <Sidebar onNavigate={() => setNavOpen(false)} />

      {/* Tapping the dimmed content closes the drawer on small screens. */}
      {navOpen && (
        <button
          type="button"
          className="app-shell__scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="app-shell__main">
        <header className="top-bar">
          <button
            type="button"
            className="top-bar__menu"
            onClick={() => setNavOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
          >
            ☰
          </button>

          <div className="top-bar__right">
            <NotificationBell />
            <div className="top-bar__identity">
              <span className="top-bar__user">{user.fullName}</span>
              <span className="top-bar__role">{ROLE_LABELS[user.role] || user.role}</span>
            </div>
            <Button size="small" onClick={handleLogout} loading={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </header>

        {/* Keying on pathname resets scroll and local state between screens. */}
        <main className="app-main" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
