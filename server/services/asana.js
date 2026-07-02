// Dunne wrapper rond de Asana REST API (v1.0).
// Auth via Personal Access Token in .env (ASANA_ACCESS_TOKEN).
// Node 18+ heeft global fetch — geen extra dependency nodig.

const BASE = 'https://app.asana.com/api/1.0';

export function isConfigured() {
  return !!(process.env.ASANA_ACCESS_TOKEN && process.env.ASANA_PROJECT_ID);
}

export function getProjectId() {
  return process.env.ASANA_PROJECT_ID || null;
}

// null → val terug op naam/email die 'ramon' of 'dach' bevat.
// Anders: expliciete komma-gescheiden lijst van assignee-emails uit .env.
function assigneeAllowList() {
  const raw = process.env.ASANA_ASSIGNEE_EMAILS;
  if (!raw || !raw.trim()) return null;
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function asanaFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.ASANA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* niet-JSON body */ }
  if (!res.ok) {
    const msg = json?.errors?.map((e) => e.message).join('; ') || `Asana HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Alle níet-afgeronde taken in het geconfigureerde project (gepagineerd).
export async function fetchIncompleteTasks() {
  const pid = getProjectId();
  const fields = 'name,notes,completed,permalink_url,assignee.name,assignee.email,due_on,due_at,created_at,modified_at,custom_fields.name,custom_fields.type,custom_fields.display_value';
  let path = `/projects/${pid}/tasks?opt_fields=${encodeURIComponent(fields)}&completed_since=now&limit=100`;
  const out = [];
  let guard = 0;
  while (path && guard++ < 50) {
    const data = await asanaFetch(path);
    for (const t of data.data || []) {
      if (!t.completed) out.push(t);
    }
    const nextUri = data.next_page?.uri;
    path = nextUri ? nextUri.replace(BASE, '') : null;
  }
  return out;
}

// Optioneel deadline-venster: leeg = alle taken. Anders alleen taken met een deadline
// t/m vandaag + N dagen (achterstallige taken vallen daar automatisch binnen).
export function dueWithinDays() {
  const raw = process.env.ASANA_DUE_WITHIN_DAYS;
  if (!raw || !raw.trim()) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function passesDueFilter(task, maxDays) {
  if (maxDays == null) return true;
  const d = task.due_on || task.due_at;
  if (!d) return false; // met een venster-filter slaan we deadline-loze taken over
  const due = new Date(`${String(d).slice(0, 10)}T23:59:59`);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + maxDays);
  return due <= cutoff;
}

// Bepaalt of een taak van Ramon of Dach is (of matcht de expliciete .env-lijst).
export function isAllowedAssignee(task) {
  const a = task.assignee;
  if (!a) return false;
  const email = (a.email || '').toLowerCase();
  const name = (a.name || '').toLowerCase();
  const allow = assigneeAllowList();
  if (allow) return allow.includes(email);
  return /ramon|dach/.test(email) || /ramon|dach/.test(name);
}

// Vink een taak af in Asana.
export async function completeTask(gid) {
  return asanaFetch(`/tasks/${gid}`, {
    method: 'PUT',
    body: JSON.stringify({ data: { completed: true } }),
  });
}
