// Request-throttle: nooit meer dan MAX_CONCURRENT fetches tegelijk. De browser staat
// per origin maar ~6 HTTP/1.1-verbindingen toe; als die vollopen (bijv. door trage/hangende
// server-calls) krijgt de SSE-stream geen slot meer en bevriest de UI. Door zelf op 5 te
// cappen houden we altijd ruimte voor de EventSource-verbinding.
const MAX_CONCURRENT = 5;
let activeRequests = 0;
const queue = [];
let lastRelease = Date.now();

// Één plek waar een slot vrijkomt. ALTIJD via finally aangeroepen (ook bij timeout/error),
// zodat een gefaalde request nooit een slot vasthoudt. Math.max voorkomt dat de teller
// negatief wordt als de watchdog al geforceerd heeft gereset terwijl de echte fetch later
// alsnog afrondt.
function release() {
  activeRequests = Math.max(0, activeRequests - 1);
  lastRelease = Date.now();
  processQueue();
}

function processQueue() {
  while (activeRequests < MAX_CONCURRENT && queue.length > 0) {
    const { url, opts, resolve, reject } = queue.shift();
    activeRequests++;
    fetch(url, opts)
      .then(resolve, reject)
      .finally(release);
  }
}

function throttledFetch(url, opts) {
  return new Promise((resolve, reject) => {
    queue.push({ url, opts, resolve, reject });
    processQueue();
  });
}

// Watchdog: als alle slots bezet zijn én er 60s lang geen enkel slot is vrijgekomen,
// zit de queue vast (bijv. door fetches die om een of andere reden noch aborten noch
// afronden). Dan forceren we een reset zodat wachtende requests weer door kunnen —
// self-healing, zodat één vastgelopen call de hele UI niet permanent bevriest.
setInterval(() => {
  if (activeRequests >= MAX_CONCURRENT && Date.now() - lastRelease > 60_000) {
    console.error(
      `[API] Queue-deadlock gedetecteerd (${activeRequests} inflight, ${queue.length} wachtend, ` +
      `${Math.round((Date.now() - lastRelease) / 1000)}s geen release) — force reset`,
    );
    activeRequests = 0;
    lastRelease = Date.now();
    processQueue();
  }
}, 30_000);

// Live status van de throttle-queue — uitgelezen door diagnostics.js.
export function queueStatus() {
  return {
    inflight: activeRequests,
    waiting: queue.length,
    max: MAX_CONCURRENT,
    lastRelease: new Date(lastRelease).toISOString(),
  };
}

// Fetch met harde timeout — voorkomt dat een hangende server de UI eeuwig in
// "Verzenden…" laat staan. Bij overschrijding krijgt de caller een nette fout.
// Loopt via de throttle zodat de SSE-verbinding nooit door request-storms verhongert.
async function fetchWithTimeout(url, options = {}, timeoutMs = 35000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await throttledFetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('Server reageert niet (timeout) — probeer opnieuw');
      err.status = 0;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function request(method, path, body, { nullOn404 = false } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetchWithTimeout(`/api${path}`, opts);

  // Een GET op een resource die niet (meer) bestaat: geef null terug i.p.v. gooien.
  // Zo ziet react-query géén error → geen retry-storm op verwijderde berichten. Die
  // storm slokt anders de (max 5) request-slots op en laat de SSE-stream verhongeren,
  // wat de UI doet bevriezen. De caller (component) toont een nette lege staat op null.
  if (res.status === 404 && nullOn404) {
    console.warn(`[API] 404 op ${path} — resource bestaat niet meer, return null`);
    return null;
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Verstuur multipart/form-data (bijv. bijlagen). GEEN Content-Type header zetten —
// de browser bepaalt zelf de multipart-boundary.
async function requestForm(method, path, formData) {
  // Uploads mogen langer duren → ruimere timeout (60s).
  const res = await fetchWithTimeout(`/api${path}`, { method, body: formData }, 60000);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Verstuur een raw (niet-JSON) body met eigen Content-Type — bijv. een tekstbestand.
// Loopt óók via de throttle + timeout zodat het geen browser-socket kan gijzelen.
async function requestRaw(method, path, body, contentType, timeoutMs = 60000) {
  const res = await fetchWithTimeout(
    `/api${path}`,
    { method, headers: { 'Content-Type': contentType }, body },
    timeoutMs,
  );
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path, undefined, { nullOn404: true }),
  post: (path, body) => request('POST', path, body),
  postForm: (path, formData) => requestForm('POST', path, formData),
  postRaw: (path, body, contentType) => requestRaw('POST', path, body, contentType),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  health: () => fetch('/api/health').then((r) => r.json()),
};
