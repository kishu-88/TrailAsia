import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import Button from '../common/Button.jsx';
import { useOperatorAuth } from '../../context/OperatorAuthContext.jsx';
import OperatorNotificationBell from '../../pages/operator/OperatorNotificationBell.jsx';

/**
 * Shell for the operator portal: a top bar with identity, the bell and a
 * sign-out button, routed content underneath. No sidebar — a signed-in
 * operator has exactly one thing to do here, so there is nothing to navigate
 * between.
 */
export default function OperatorLayout() {
  const { operator, logout } = useOperatorAuth();
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
      <div className="app-shell__main" style={{ marginLeft: 0 }}>
        <header className="top-bar">
          <span className="top-bar__brand">TrailAsia — Operator portal</span>
          <div className="top-bar__right">
            <OperatorNotificationBell />
            <div className="top-bar__identity">
              <span className="top-bar__user">{operator?.name}</span>
            </div>
            <Button size="small" onClick={handleLogout} loading={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
