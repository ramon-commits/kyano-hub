// Fetch met harde timeout — voorkomt dat een hangende server de UI eeuwig in
// "Verzenden…" laat staan. Bij overschrijding krijgt de caller een nette fout.
async function fetchWithTimeout(url, options = {}, timeoutMs = 35000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetchWithTimeout(`/api${path}`, opts);
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

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  postForm: (path, formData) => requestForm('POST', path, formData),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  health: () => fetch('/api/health').then((r) => r.json()),
};
