import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const PERM_KEY = 'kyano:notifPermission';

function notifyDesktop({ title, body, icon, url, tag }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon, tag });
    n.onclick = () => {
      window.focus();
      if (url) window.location.href = url;
      n.close();
    };
  } catch { /* no-op */ }
}

// Throttle invalidate: voorkomt re-render storm wanneer SSE event-bursts binnenkomen.
// Notifications zelf blijven wel per bericht (max 3) komen.
const INVALIDATE_THROTTLE_MS = 10_000;

export function useNotifications({ enabled = true } = {}) {
  const qc = useQueryClient();
  const sseRef = useRef(null);
  const lastInvalidateRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    // Ask permission once
    if (typeof Notification !== 'undefined' && Notification.permission === 'default' && !localStorage.getItem(PERM_KEY)) {
      Notification.requestPermission().then((p) => {
        localStorage.setItem(PERM_KEY, p);
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof EventSource === 'undefined') return;

    const es = new EventSource('/api/events/stream');
    sseRef.current = es;

    es.addEventListener('new-messages', (e) => {
      try {
        const payload = JSON.parse(e.data);
        // Throttle: max 1 invalidate per 10s om re-render storm te voorkomen
        const now = Date.now();
        if (now - lastInvalidateRef.current > INVALIDATE_THROTTLE_MS) {
          lastInvalidateRef.current = now;
          qc.invalidateQueries({ queryKey: ['messages'] });
          qc.invalidateQueries({ queryKey: ['stats'] });
          qc.invalidateQueries({ queryKey: ['daily-summary'] });
        }
        // Notification per recent inbox bericht (max 3 om spam te voorkomen)
        for (const m of (payload.messages || []).slice(0, 3)) {
          notifyDesktop({
            title: m.contact_name || m.channel_label || 'Nieuw bericht',
            body: (m.subject ? `${m.subject}\n` : '') + (m.snippet || '').slice(0, 100),
            icon: '/icon.svg',
            tag: m.id,
          });
        }
      } catch { /* skip malformed */ }
    });

    es.onerror = () => {
      // Auto-reconnect by browser handles this
    };

    return () => { es.close(); };
  }, [enabled, qc]);
}
