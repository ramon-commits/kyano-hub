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
    const t = { id, type: opts.type || 'info', title: opts.title, message: opts.message || opts, duration: opts.duration ?? 3000 };
    setToasts((cur) => [...cur.slice(-(MAX - 1)), t]);
    if (t.duration > 0) {
      setTimeout(() => dismiss(id), t.duration);
    }
    return id;
  }, [dismiss]);

  const api = {
    show,
    success: (msg, title) => show({ type: 'success', message: msg, title }),
    error: (msg, title) => show({ type: 'error', message: msg, title }),
    info: (msg, title) => show({ type: 'info', message: msg, title }),
    warning: (msg, title) => show({ type: 'warning', message: msg, title }),
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
