import { useAuth } from '../context/AuthContext.jsx';

const ROLE_LABELS = {
  consultant: 'Travel consultant',
  coordinator: 'Tour coordinator',
  finance: 'Finance and administration',
  admin: 'Administrator',
};

/**
 * Placeholder landing screen. It exists to prove the session works end to end;
 * the real pipeline dashboard arrives with the reporting module.
 */
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="stack">
      <div>
        <h1 className="heading">Welcome back, {user.firstName}</h1>
        <p className="muted">{ROLE_LABELS[user.role] || user.role}</p>
      </div>

      <div className="card">
        <h2 className="card__title">Signed in</h2>
        <dl className="detail-list">
          <div className="detail-list__row">
            <dt>Name</dt>
            <dd>{user.fullName}</dd>
          </div>
          <div className="detail-list__row">
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="detail-list__row">
            <dt>Role</dt>
            <dd>{ROLE_LABELS[user.role] || user.role}</dd>
          </div>
          <div className="detail-list__row">
            <dt>Last sign-in</dt>
            <dd>
              {user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString('en-AU', {
                    timeZone: 'Australia/Sydney',
                  })
                : 'First sign-in'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="card card--muted">
        <h2 className="card__title">Coming next</h2>
        <p className="muted">
          Bookings and itineraries, traveller records, ground-operator coordination, payments,
          reporting and the traveller safety module.
        </p>
      </div>
    </div>
  );
}
