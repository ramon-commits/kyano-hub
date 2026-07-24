// Frontend-diagnostics — vangt de oorzaak van het "app bevriest na 5-15 min"-probleem.
//
// Meet tegelijk de drie mogelijke oorzaken zodat de VOLGENDE freeze zichzelf verklaart:
//   1. Main-thread pinning  → PerformanceObserver('longtask') logt elke blokkade > 200ms.
//   2. Memory leak           → heap-sample elke 30s + waarschuwing boven 500MB.
//   3. Connection-uitputting → telt live EventSource-verbindingen (HTTP/1.1 = max 6 sockets
//                              per origin; een SSE-lek vreet die op → alle fetches hangen,
//                              inhoud blijft staan, knoppen "doen niks").
//
// Alles landt in de console én in window.__diag zodat je bij een freeze `__diag.report()`
// kunt draaien (werkt ook nog als de UI niet reageert — console leeft in een aparte thread).

import { queueStatus } from './api.js';

const MEM_INTERVAL_MS = 30_000;
const MEM_WARN_MB = 500;
const LONGTASK_WARN_MS = 200;

const state = {
  startedAt: Date.now(),
  memSamples: [], // { t, usedMB }
  longTasks: [], // { t, durationMs }
  liveEventSources: 0,
  totalEventSources: 0,
  errors: [], // { t, type, message }
};

function nowIso() {
  return new Date().toISOString().slice(11, 19);
}

function pushCapped(arr, item, cap) {
  arr.push(item);
  if (arr.length > cap) arr.shift();
}

// ── 1. Long-task observer: de directe meting van "de app bevriest" ────────────────
function startLongTaskObserver() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const durationMs = Math.round(entry.duration);
        if (durationMs < LONGTASK_WARN_MS) continue;
        pushCapped(state.longTasks, { t: nowIso(), durationMs }, 100);
        console.warn(`[DIAG] Long task ${durationMs}ms — main thread geblokkeerd (UI reageert niet tijdens deze periode)`);
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
  } catch { /* longtask niet ondersteund — geen probleem */ }
}

// ── 2. Memory sampler ─────────────────────────────────────────────────────────────
function startMemorySampler() {
  const sample = () => {
    if (!performance.memory) return;
    const usedMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
    pushCapped(state.memSamples, { t: nowIso(), usedMB }, 240); // ~2u historie
    const limitMB = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
    const uptimeMin = Math.round((Date.now() - state.startedAt) / 60000);
    const q = queueStatus();
    const queueStr = `queue ${q.inflight}/${q.max} (${q.waiting} wachtend)`;
    if (usedMB > MEM_WARN_MB) {
      console.warn(`[MEM] ${usedMB}MB gebruikt (${uptimeMin}min uptime, limiet ${limitMB}MB) — MOGELIJK MEMORY LEAK. Draai __diag.report() voor trend.`);
    } else {
      console.log(`[MEM] ${usedMB}MB (${uptimeMin}min uptime) · ${state.liveEventSources} SSE live · ${state.longTasks.length} long tasks totaal · ${queueStr}`);
    }
  };
  sample();
  return setInterval(sample, MEM_INTERVAL_MS);
}

// ── 3. EventSource-teller: detecteert connection-lek ────────────────────────────────
function instrumentEventSource() {
  if (typeof window.EventSource === 'undefined') return;
  const Native = window.EventSource;
  function TrackedEventSource(url, config) {
    const es = new Native(url, config);
    state.liveEventSources += 1;
    state.totalEventSources += 1;
    if (state.liveEventSources > 2) {
      console.warn(`[DIAG] ${state.liveEventSources} EventSource-verbindingen tegelijk open (${url}) — CONNECTION LEAK. HTTP/1.1 geeft maar 6 sockets per origin; hierna hangen alle fetches en lijkt de app bevroren.`);
    }
    const markClosed = () => {
      if (es.__diagClosed) return;
      es.__diagClosed = true;
      state.liveEventSources = Math.max(0, state.liveEventSources - 1);
    };
    const origClose = es.close.bind(es);
    es.close = () => { markClosed(); return origClose(); };
    return es;
  }
  TrackedEventSource.prototype = Native.prototype;
  TrackedEventSource.CONNECTING = Native.CONNECTING;
  TrackedEventSource.OPEN = Native.OPEN;
  TrackedEventSource.CLOSED = Native.CLOSED;
  window.EventSource = TrackedEventSource;
}

// ── Global error-vangers ────────────────────────────────────────────────────────────
function installErrorHandlers() {
  window.addEventListener('error', (e) => {
    pushCapped(state.errors, { t: nowIso(), type: 'error', message: e.message || String(e.error) }, 50);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const message = e.reason?.message || String(e.reason);
    pushCapped(state.errors, { t: nowIso(), type: 'unhandledrejection', message }, 50);
    console.warn('[DIAG] Onafgevangen promise-rejection:', message);
  });
}

export function initDiagnostics() {
  if (window.__diag) return; // idempotent (StrictMode dubbel-mount in dev)
  instrumentEventSource();
  installErrorHandlers();
  startLongTaskObserver();
  const memTimer = startMemorySampler();

  window.__diag = {
    state,
    report() {
      const mem = state.memSamples;
      const first = mem[0]?.usedMB ?? 0;
      const last = mem[mem.length - 1]?.usedMB ?? 0;
      const peak = mem.reduce((m, s) => Math.max(m, s.usedMB), 0);
      const uptimeMin = Math.round((Date.now() - state.startedAt) / 60000);
      const report = {
        uptimeMin,
        memory: { firstMB: first, lastMB: last, peakMB: peak, growthMB: last - first, samples: mem.length },
        longTasks: { count: state.longTasks.length, worstMs: state.longTasks.reduce((m, t) => Math.max(m, t.durationMs), 0), recent: state.longTasks.slice(-10) },
        eventSources: { liveNow: state.liveEventSources, everCreated: state.totalEventSources },
        queue: queueStatus(),
        errors: state.errors.slice(-10),
      };
      console.table(mem.slice(-20));
      console.log('[DIAG] Diagnose-rapport:', report);
      console.log(
        '[DIAG] Interpretatie:\n' +
        `  · heap ${first}→${last}MB (piek ${peak}MB) over ${uptimeMin}min → ${last - first > 200 ? 'MEMORY LEAK waarschijnlijk' : 'stabiel'}\n` +
        `  · ${state.longTasks.length} long tasks (ergste ${report.longTasks.worstMs}ms) → ${report.longTasks.worstMs > 1000 ? 'main thread loopt vast (render-loop?)' : 'ok'}\n` +
        `  · ${state.liveEventSources} SSE live → ${state.liveEventSources > 2 ? 'CONNECTION LEAK' : 'ok'}\n` +
        `  · queue ${report.queue.inflight}/${report.queue.max} (${report.queue.waiting} wachtend, laatste release ${report.queue.lastRelease}) → ${report.queue.inflight >= report.queue.max && report.queue.waiting > 0 ? 'QUEUE VOL — mogelijk deadlock' : 'ok'}`,
      );
      return report;
    },
    queueStatus,
    reset() { memTimer && clearInterval(memTimer); },
  };

  console.log('[DIAG] Diagnostics actief. Bij een freeze: open de console en draai  __diag.report()');
}
