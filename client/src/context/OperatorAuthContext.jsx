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
import * as operatorAuth from '../services/operatorAuth.service.js';

const OperatorAuthContext = createContext(null);

/**
 * The operator's session — a third provider alongside the staff and
 * traveller ones, for the same reason the traveller one is its own: a
 * shared provider would have to decide which kind of session `user` meant,
 * and a component reading `useOperatorAuth` should never be handed anything
 * but an operator.
 */
export function OperatorAuthProvider({ children }) {
  const [operator, setOperator] = useState(null);
  const [status, setStatus] = useState('loading');
  const refreshTimer = useRef(null);

  const clearSession = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    setAccessToken(null, 'operator');
    setOperator(null);
    setStatus('unauthenticated');
  }, []);

  const scheduleRefresh = useCallback(
    (expiresInSeconds) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (!expiresInSeconds) return;
      const leadTime = Math.max((expiresInSeconds - 60) * 1000, 15000);
      refreshTimer.current = setTimeout(async () => {
        try {
          const data = await operatorAuth.restoreSession();
          setOperator(data.operator);
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
      setOperator(data.operator);
      setStatus('authenticated');
      scheduleRefresh(data.expiresIn);
    },
    [scheduleRefresh]
  );

  useEffect(() => {
    let cancelled = false;

    setSessionExpiredHandler(() => {
      if (!cancelled) clearSession();
    }, 'operator');

    (async () => {
      try {
        const data = await operatorAuth.restoreSession();
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
      const data = await operatorAuth.login(email, password);
      applySession(data);
      return data.operator;
    },
    [applySession]
  );

  const activate = useCallback(
    async (token, password) => {
      const data = await operatorAuth.activate(token, password);
      applySession(data);
      return data.operator;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await operatorAuth.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      operator,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      login,
      activate,
      logout,
    }),
    [operator, status, login, activate, logout]
  );

  return (
    <OperatorAuthContext.Provider value={value}>{children}</OperatorAuthContext.Provider>
  );
}

export function useOperatorAuth() {
  const context = useContext(OperatorAuthContext);
  if (!context) {
    throw new Error('useOperatorAuth must be used inside an <OperatorAuthProvider>.');
  }
  return context;
}
