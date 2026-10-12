import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { setAccessToken, setSessionExpiredHandler } from '../services/apiClient.js';
import * as travellerAuth from '../services/travellerAuth.service.js';

const TravellerAuthContext = createContext(null);

/**
 * The traveller's session.
 *
 * A second provider rather than a mode inside AuthContext. The two sessions can
 * exist at the same time in one browser — a consultant checking what their
 * traveller sees — and a shared provider would have to decide which one `user`
 * meant on every screen. Keeping them separate means a component that reads
 * `useTravellerAuth` can never be handed a staff account by mistake.
 */
export function TravellerAuthProvider({ children }) {
  const [traveller, setTraveller] = useState(null);
  const [status, setStatus] = useState('loading');
  const refreshTimer = useRef(null);

  const clearSession = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    setAccessToken(null, 'traveller');
    setTraveller(null);
    setStatus('unauthenticated');
  }, []);

  const scheduleRefresh = useCallback(
    (expiresInSeconds) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (!expiresInSeconds) return;
      const leadTime = Math.max((expiresInSeconds - 60) * 1000, 15000);
      refreshTimer.current = setTimeout(async () => {
        try {
          const data = await travellerAuth.restoreSession();
          setTraveller(data.traveller);
          scheduleRefresh(data.expiresIn);
        } catch {
          clearSession();
        }
      }, leadTime);
    },
    [clearSession]
  );

  const applySession = useCallback(
    (data) => {
      setTraveller(data.traveller);
      setStatus('authenticated');
      scheduleRefresh(data.expiresIn);
    },
    [scheduleRefresh]
  );

  useEffect(() => {
    let cancelled = false;

    setSessionExpiredHandler(() => {
      if (!cancelled) clearSession();
    }, 'traveller');

    (async () => {
      try {
        const data = await travellerAuth.restoreSession();
        if (!cancelled) applySession(data);
      } catch {
        if (!cancelled) clearSession();
      }
    })();

    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [applySession, clearSession]);

  const login = useCallback(
    async (email, password) => {
      const data = await travellerAuth.login(email, password);
      applySession(data);
      return data.traveller;
    },
    [applySession]
  );

  const activate = useCallback(
    async (token, password) => {
      const data = await travellerAuth.activate(token, password);
      applySession(data);
      return data.traveller;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await travellerAuth.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      traveller,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      login,
      activate,
      logout,
    }),
    [traveller, status, login, activate, logout]
  );

  return (
    <TravellerAuthContext.Provider value={value}>{children}</TravellerAuthContext.Provider>
  );
}

export function useTravellerAuth() {
  const context = useContext(TravellerAuthContext);
  if (!context) {
    throw new Error('useTravellerAuth must be used inside a <TravellerAuthProvider>.');
  }
  return context;
}
