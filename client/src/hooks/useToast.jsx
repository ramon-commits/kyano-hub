import { createContext, useCallback, useContext, useRef, useState } from 'react';
import ToastContainer from '../components/shared/Toast.jsx';

const ToastContext = createContext(null);

const MAX = 3;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((opts) => {
    const id = ++counter.current;
    // If an action is provided, default duration to 5s (so users have time to click Undo)
    const defaultDuration = opts.action ? 5000 : 3000;
    const t = {
      id,
      type: opts.type || 'info',
      title: opts.title,
      message: opts.message || opts,
      duration: opts.duration ?? defaultDuration,
      action: opts.action || null,
    };
    setToasts((cur) => [...cur.slice(-(MAX - 1)), t]);
    if (t.duration > 0) {
      setTimeout(() => dismiss(id), t.duration);
    }
    return id;
  }, [dismiss]);

  // Helper that accepts either (msg, title) for backwards compat or (msg, title, { action, duration })
  const make = (type) => (msg, title, opts) => show({ type, message: msg, title, ...(opts || {}) });

  const api = {
    show,
    success: make('success'),
    error: make('error'),
    info: make('info'),
    warning: make('warning'),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
