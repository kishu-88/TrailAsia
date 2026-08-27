import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { setAccessToken, setSessionExpiredHandler } from '../services/apiClient.js';
import * as authService from '../services/auth.service.js';

const AuthContext = createContext(null);

/**
 * Holds the signed-in user for the whole app.
 *
 * `status` is what screens should branch on:
 *   'loading'         — still deciding whether there is a session; render nothing yet
 *   'authenticated'   — `user` is populated
 *   'unauthenticated' — nobody is signed in
 *
 * The distinction matters: without it, a page refresh briefly looks like a
 * logged-out user and bounces people to the login screen mid-session.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const refreshTimer = useRef(null);

  const clearSession = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  /**
   * Renew the access token shortly before it expires, so a consultant working
   * through a long booking is never interrupted by a failed request.
   */
  const scheduleRefresh = useCallback(
    (expiresInSeconds) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (!expiresInSeconds) return;
      const leadTime = Math.max((expiresInSeconds - 60) * 1000, 15000);
      refreshTimer.current = setTimeout(async () => {
        try {
          const data = await authService.restoreSession();
          setUser(data.user);
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
      setUser(data.user);
      setStatus('authenticated');
      scheduleRefresh(data.expiresIn);
    },
    [scheduleRefresh]
  );

  // On boot, try the refresh cookie. Failure just means nobody is signed in.
  useEffect(() => {
    let cancelled = false;

    setSessionExpiredHandler(() => {
      if (!cancelled) clearSession();
    });

    (async () => {
      try {
        const data = await authService.restoreSession();
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
      const data = await authService.login(email, password);
      applySession(data);
      return data.user;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      login,
      logout,
    }),
    [user, status, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
