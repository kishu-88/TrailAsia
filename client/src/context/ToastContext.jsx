import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 0;

/**
 * Brief confirmations for actions that succeed.
 *
 * A save that changes nothing visible on screen — verifying a document, reordering
 * a segment — otherwise leaves the user wondering whether the click registered.
 * Errors mostly belong inline next to the thing that failed; this is for the
 * cases where there is nowhere sensible to put one.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'success', duration = 4000) => {
      nextId += 1;
      const id = nextId;
      setToasts((current) => [...current, { id, message, tone }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'danger', 6000),
      info: (message) => push(message, 'info'),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a <ToastProvider>.');
  return context;
}
