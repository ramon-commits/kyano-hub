import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const PERM_KEY = 'kyano:notifPermission';
// Notificaties automatisch sluiten na 8s zodat ze niet oneindig in het geheugen/OS blijven staan.
const NOTIF_AUTOCLOSE_MS = 8000;

function notifyDesktop({ title, body, icon, url, tag }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon, tag });
    n.onclick = () => {
      window.focus();
      if (url) window.location.href = url;
      n.close();
    };
    // Sluit de notificatie zelf weer — Notification-objecten blijven anders hangen en stapelen op.
    setTimeout(() => { try { n.close(); } catch { /* al gesloten */ } }, NOTIF_AUTOCLOSE_MS);
  } catch { /* no-op */ }
}

// SSE-reconnect regels: minstens RECONNECT_FLOOR_MS tussen pogingen (voorkomt reconnect-storms
// die de browser-connectiepool leegtrekken en Chrome laten bevriezen). Faalt de stream
// MAX_FAILURES keer binnen FAILURE_WINDOW_MS → stoppen en een offline-banner tonen i.p.v.
// eindeloos blijven proberen.
const RECONNECT_FLOOR_MS = 10000;
const MAX_FAILURES = 3;
const FAILURE_WINDOW_MS = 60000;

export function useNotifications({ enabled = true } = {}) {
  const qc = useQueryClient();
  const sseRef = useRef(null);
  const [offline, setOffline] = useState(false);

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
    if (!enabled) return undefined;
    if (typeof EventSource === 'undefined') return undefined;

    let es = null;
    let reconnectTimer = null;
    let stopped = false;
    let lastReconnectAt = 0;
    let failureTimes = []; // timestamps van recente fouten — voor 3-strikes-detectie
    setOffline(false);

    // Reconnect met een harde ondergrens: nooit vaker dan 1× per RECONNECT_FLOOR_MS.
    function scheduleReconnect() {
      if (stopped || reconnectTimer) return;

      // 3-strikes: te vaak gefaald binnen het venster → opgeven en banner tonen.
      const now = Date.now();
      failureTimes = failureTimes.filter((t) => now - t < FAILURE_WINDOW_MS);
      failureTimes.push(now);
      if (failureTimes.length >= MAX_FAILURES) {
        stopped = true;
        setOffline(true);
        return;
      }

      const delay = Math.max(RECONNECT_FLOOR_MS - (now - lastReconnectAt), 1000);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        lastReconnectAt = Date.now();
        connect();
      }, delay);
    }

    function handleNewMessages(e) {
      try {
        const payload = JSON.parse(e.data);
        // TIJDELIJK UITGESCHAKELD — invalidate veroorzaakte re-render loop.
        // Gebruik de "Nieuwe check" knop in de inbox voor handmatige refresh.
        for (const m of (payload.messages || []).slice(0, 3)) {
          notifyDesktop({
            title: m.contact_name || m.channel_label || 'Nieuw bericht',
            body: (m.subject ? `${m.subject}\n` : '') + (m.snippet || '').slice(0, 100),
            icon: '/icon.svg',
            tag: m.id,
          });
        }
      } catch { /* skip malformed */ }
    }

    function connect() {
      if (stopped) return;
      // Sluit een eventuele vorige verbinding voordat we een nieuwe openen — voorkomt dat
      // dode/half-open sockets zich opstapelen tot de browser (HTTP/1.1: 6 per origin) op is.
      if (es) { try { es.close(); } catch { /* al dicht */ } }

      es = new EventSource('/api/events/stream');
      sseRef.current = es;

      es.addEventListener('new-messages', handleNewMessages);

      es.onopen = () => { failureTimes = []; }; // gelukte verbinding → strikes resetten

      es.onerror = () => {
        // Sluit de kapotte verbinding EXPLICIET en reconnect via de throttle. De ingebouwde
        // auto-reconnect van EventSource kan bij bepaalde proxy's oude sockets laten hangen.
        try { es.close(); } catch { /* al dicht */ }
        scheduleReconnect();
      };
    }

    // Verbinding pauzeren wanneer de tab verborgen is — een verborgen tab hoeft geen
    // socket open te houden en dit voorkomt reconnect-storms na slaapstand/wake.
    function onVisibility() {
      if (document.hidden) {
        stopped = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (es) { try { es.close(); } catch { /* al dicht */ } es = null; }
      } else if (stopped) {
        // Tab weer zichtbaar → verse start: strikes wissen, banner weg, opnieuw verbinden.
        stopped = false;
        failureTimes = [];
        setOffline(false);
        lastReconnectAt = Date.now();
        connect();
      }
    }

    connect();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) { try { es.close(); } catch { /* al dicht */ } }
      sseRef.current = null;
    };
  }, [enabled, qc]);

  return { offline };
}
