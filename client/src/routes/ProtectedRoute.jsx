import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

/**
 * Gate for signed-in routes.
 *
 * `roles` is accepted now but not yet enforced anywhere — role-based access
 * control lands with the next slice, and having the parameter here means the
 * route table will not need rewriting when it does.
 */
export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page-centre">
        <p className="muted">Checking your session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
