// Server-Sent Events broadcaster for new-message notifications
// Frontend subscribes to /api/events/stream

const clients = new Set();
const KEEPALIVE_MS = 25 * 1000;

export function addClient(res) {
  clients.add(res);
  // keepalive ping
  const ping = setInterval(() => {
    try { res.write(':ping\n\n'); } catch { /* connection dead */ }
  }, KEEPALIVE_MS);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* skip dead connections */ }
  }
}

export function clientCount() {
  return clients.size;
}

// Auto-cleanup: every 30 min, close stale connections
setInterval(() => {
  for (const res of clients) {
    try {
      const isStale = res.writableEnded || res.destroyed;
      if (isStale) clients.delete(res);
    } catch { clients.delete(res); }
  }
}, 30 * 60 * 1000);
