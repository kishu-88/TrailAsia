import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useTravellerAuth } from '../context/TravellerAuthContext.jsx';

/** Gate for the traveller-facing routes. Staff sessions do not satisfy it. */
export default function TravellerRoute() {
  const { isAuthenticated, isLoading } = useTravellerAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page-centre">
        <p className="muted">Checking your session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/trip/sign-in" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
