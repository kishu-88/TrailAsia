import { Outlet } from 'react-router-dom';

import { OperatorAuthProvider } from '../context/OperatorAuthContext.jsx';

/**
 * Mounts the operator session only for the routes that need it — same
 * reasoning as `TravellerSession`.
 */
export default function OperatorSession() {
  return (
    <OperatorAuthProvider>
      <Outlet />
    </OperatorAuthProvider>
  );
}
