import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import { initDiagnostics } from './lib/diagnostics.js';
import './index.css';

// Diagnostics: meet main-thread blokkades, heap-groei en SSE-verbindingen.
// Bij een freeze → open console en draai  __diag.report()
initDiagnostics();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false, // DISABLE — veroorzaakt flicker bij tab-switch
      retry: 2,
      placeholderData: (prev) => prev, // keep previous data — geen flicker tijdens refetch
    },
  },
});

// Register PWA service worker (production only — dev server doesn't serve sw.js consistently)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* niet kritiek */ });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
