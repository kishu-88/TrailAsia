import { NavLink } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { can } from '../../utils/permissions.js';

/**
 * Module navigation.
 *
 * Items the current role cannot use are hidden rather than shown disabled —
 * a consultant has no reason to know the staff admin screen exists. The server
 * enforces this regardless; hiding is only so the interface matches the job.
 *
 * Modules that are not built yet are listed and marked, so the shape of the
 * finished product is visible without pretending they work.
 */
const MODULES = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/bookings', label: 'Bookings' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/travellers', label: 'Travellers' },
  { to: '/operators', label: 'Operators' },
  // No permission key: every staff role reads the payment screens. Only finance
  // and admin can write to the ledger, and the server is what enforces that.
  { to: '/payments', label: 'Payments' },
  // Also unrestricted. A consultant sees the agency-wide pipeline and their
  // own conversion rate; the comparison against colleagues is filtered out
  // server-side rather than by hiding the link.
  { to: '/reports', label: 'Reports' },
  { to: '/destinations', label: 'Destinations' },
  // No permission key: every staff role can read the safety desk. An alert
  // that is invisible to whoever is at the desk is the failure it exists to
  // prevent — the server still decides who may act on one.
  { to: '/safety', label: 'Safety' },
  { to: '/staff', label: 'Staff', permission: 'manageStaff' },
  { to: '/email-log', label: 'Email log', permission: 'viewEmailLogs' },
];

const PLANNED = ['Fair-price guide', 'After-hours chatbot'];

export default function Sidebar({ onNavigate }) {
  const { user } = useAuth();

  const visible = MODULES.filter(
    (item) => !item.permission || can[item.permission](user)
  );

  return (
    <nav className="sidebar" aria-label="Modules">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">TA</span>
        <span className="sidebar__brand-name">TrailAsia</span>
      </div>

      <ul className="sidebar__list">
        {visible.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar__planned">
        <p className="sidebar__planned-title">Coming later</p>
        <ul>
          {PLANNED.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
