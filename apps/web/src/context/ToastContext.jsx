import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastCtx = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', ms = 4200) => {
      const text = String(message || '').trim();
      if (!text) return;
      const id = ++toastId;
      setToasts((prev) => [...prev.slice(-4), { id, message: text, type }]);
      if (ms > 0) {
        setTimeout(() => dismiss(id), ms);
      }
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (msg, ms) => push(msg, 'success', ms),
      error: (msg, ms) => push(msg, 'error', ms),
      info: (msg, ms) => push(msg, 'info', ms),
      dismiss
    }),
    [push, dismiss]
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} role="status">
            <span>{t.message}</span>
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
