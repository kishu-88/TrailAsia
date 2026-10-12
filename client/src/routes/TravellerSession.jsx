import { Outlet } from 'react-router-dom';

import { TravellerAuthProvider } from '../context/TravellerAuthContext.jsx';

/**
 * Mounts the traveller session only for the routes that need it.
 *
 * Putting the provider in main.jsx next to the staff one would work, but it
 * would also fire a traveller refresh request on every staff page load — one
 * more request, and a 401 in the console, for a session nobody on that screen
 * is using. Scoped here, the traveller session is established the first time
 * somebody actually opens the traveller app.
 */
export default function TravellerSession() {
  return (
    <TravellerAuthProvider>
      <Outlet />
    </TravellerAuthProvider>
  );
}
