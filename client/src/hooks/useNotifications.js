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

export function useNotifications({ enabled = true } = {}) {
  const qc = useQueryClient();
  const sseRef = useRef(null);

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
        // TIJDELIJK UITGESCHAKELD — invalidate veroorzaakte re-render loop
        // Gebruik de "Nieuwe check" knop in de inbox voor handmatige refresh.
        console.log('[SSE] new-messages event ontvangen, skip invalidation (handmatig refreshen via Nieuwe check)', payload?.messages?.length || 0, 'nieuw');
        // Notification per recent inbox bericht (max 3 om spam te voorkomen) — blijft wel werken
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
