import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useOperatorAuth } from '../context/OperatorAuthContext.jsx';

/** Gate for the operator-facing routes. Staff and traveller sessions do not satisfy it. */
export default function OperatorRoute() {
  const { isAuthenticated, isLoading } = useOperatorAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page-centre">
        <p className="muted">Checking your session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/operator/sign-in" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
