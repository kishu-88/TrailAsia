import { Link } from 'react-router-dom';

import '../../styles/traveller.css';
import { formatDate, relativeDays } from '../../utils/format.js';

const TABS = [
  { key: 'trip', label: 'My trip', icon: '🗺' },
  { key: 'documents', label: 'Documents', icon: '📄' },
  { key: 'safety', label: 'Safety', icon: '🛟' },
  { key: 'help', label: 'Help', icon: '💬' },
];

/**
 * Shell for the traveller-facing screens.
 *
 * Constrained to a phone width even on a laptop. This is what a traveller opens
 * on a mountain, and laying it out across a wide desktop would make the demo
 * misleading about the thing being designed.
 *
 * Two modes, and the banner is the difference.
 *
 *   'traveller'     — the real thing, behind the traveller's own session.
 *   'staff-preview' — the same screens reached from the staff portal, so a
 *                     consultant can see exactly what their traveller sees.
 *                     Banner says so, loudly, because a staff member looking at
 *                     a traveller's screen must never be in any doubt about
 *                     whose session they are in.
 */
export default function TravellerLayout({
  mode = 'staff-preview',
  booking,
  traveller,
  activeTab,
  onTabChange,
  outstandingCount = 0,
  onSignOut,
  children,
}) {
  return (
    <div className="traveller-app">
      <div className="traveller-frame">
        {mode === 'staff-preview' && (
          <div className="preview-banner">
            <strong>Preview — signed in as staff</strong>
            This is what {traveller ? traveller.firstName : 'the traveller'} sees. You are
            looking at it through your own staff session.{' '}
            <Link to={`/bookings/${booking.id}`}>Back to the booking</Link>
          </div>
        )}

        <header className="traveller-header">
          <p className="traveller-header__eyebrow">
            {traveller ? traveller.fullName : 'Your trip'}
            {mode === 'traveller' && onSignOut && (
              <button type="button" className="traveller-header__signout" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </p>
          <h1 className="traveller-header__title">{booking.title}</h1>
          <p className="traveller-header__meta">{booking.reference}</p>

          {booking.departureDate && (
            <span className="traveller-header__countdown">
              Departs {formatDate(booking.departureDate)} · {relativeDays(booking.departureDate)}
            </span>
          )}
        </header>

        <main className="traveller-main">{children}</main>

        <nav className="t-tabs" aria-label="Sections">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`t-tab${activeTab === tab.key ? ' t-tab--active' : ''}`}
              onClick={() => onTabChange(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
            >
              <span className="t-tab__icon" aria-hidden="true">
                {tab.icon}
                {tab.key === 'documents' && outstandingCount > 0 && (
                  <span className="t-tab__badge">{outstandingCount}</span>
                )}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
