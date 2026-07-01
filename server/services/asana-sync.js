import db from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { isConfigured, fetchIncompleteTasks, isAllowedAssignee, completeTask, dueWithinDays, passesDueFilter } from './asana.js';

const CHANNEL_ID = 'asana-1';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

function normalizePhone(phone) {
  return phone.replace(/[\s\-()]/g, '').replace(/^00/, '+').replace(/^0(?=\d)/, '+31');
}

// Distilleer contactgegevens uit een taak (titel + notities): emailadres + telefoon.
// Universeel — géén keyword-detectie op de titel meer. De "Neem contact op"-kaart bepaalt
// de knoppen puur op wat hier gevonden wordt.
function extractContact(task) {
  const hay = `${task.name || ''}\n${task.notes || ''}`;
  const email = (hay.match(EMAIL_RE) || [])[0] || null;
  const phoneRaw = (hay.match(PHONE_RE) || [])[0] || null;
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

  // Best-effort: koppel aan een BESTAAND contact (maakt er nooit een aan).
  let contactId = null;
  if (email) {
    const c = db.prepare('SELECT id FROM contacts WHERE lower(email) = lower(?)').get(email);
    if (c) contactId = c.id;
  }
  if (!contactId && phone) {
    const c = db.prepare('SELECT id FROM contacts WHERE phone = ?').get(phone);
    if (c) contactId = c.id;
  }
  return { email, phone, contactId };
}

// Haalt open Asana-taken op en zet ze als to-do berichten in de inbox (channel asana-1).
// Twee-richtingen: taken die in Asana verdwenen/afgerond zijn → in de hub op 'done'.
export async function syncAsana() {
  if (!isConfigured()) return { skipped: true, reason: 'not_configured', inserted: 0, closed: 0 };

  const tasks = await fetchIncompleteTasks();
  const incompleteGids = new Set(tasks.map((t) => t.gid));
  const maxDays = dueWithinDays();
  const mine = tasks.filter(isAllowedAssignee).filter((t) => passesDueFilter(t, maxDays));

  // De GID bewaren we in external_id → unieke index (channel_id, external_id) voorkomt duplicaten
  // bij herhaalde sync én voorkomt dat een gesnoozede/afgehandelde to-do weer opduikt.
  const insert = db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, external_id, channel_id, contact_id, direction, subject, snippet, body_text, deep_link,
       asana_contact_email, asana_contact_phone,
       status, priority, received_at, created_at, updated_at)
    VALUES (?, ?, '${CHANNEL_ID}', ?, 'inbound', ?, ?, ?, ?, ?, ?, 'open', 'medium',
       datetime('now'), datetime('now'), datetime('now'))
  `);

  // Backfill/actueel houden: vult contactvelden bij op bestaande rijen die ze nog missen
  // (INSERT OR IGNORE raakt bestaande rijen niet). COALESCE = nooit overschrijven.
  const updateContact = db.prepare(`
    UPDATE messages
    SET asana_contact_email = COALESCE(asana_contact_email, ?),
        asana_contact_phone = COALESCE(asana_contact_phone, ?),
        contact_id = COALESCE(contact_id, ?)
    WHERE channel_id = '${CHANNEL_ID}' AND external_id = ?
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const t of mine) {
      const { email, phone, contactId } = extractContact(t);
      const notes = (t.notes || '').trim() || null;
      const snippet = (notes ? notes.replace(/\s+/g, ' ') : t.name).slice(0, 180);
      const r = insert.run(uuid(), t.gid, contactId, t.name || '(taak zonder titel)', snippet, notes, t.permalink_url || null, email, phone);
      if (r.changes) inserted++;
      else updateContact.run(email, phone, contactId, t.gid);
    }
  });
  tx();

  // Taken die in Asana afgerond of verwijderd zijn → nog-open hub-regels afsluiten.
  const openRows = db.prepare(`
    SELECT id, external_id FROM messages
    WHERE channel_id = '${CHANNEL_ID}' AND external_id IS NOT NULL
      AND status IN ('open', 'snoozed', 'waiting')
  `).all();
  const closeStmt = db.prepare(`
    UPDATE messages SET status = 'done', done_at = datetime('now'),
      done_category = 'other', done_note = 'Afgerond in Asana', updated_at = datetime('now')
    WHERE id = ?
  `);
  let closed = 0;
  const closeTx = db.transaction(() => {
    for (const row of openRows) {
      if (!incompleteGids.has(row.external_id)) { closeStmt.run(row.id); closed++; }
    }
  });
  closeTx();

  return { inserted, closed, total_tasks: mine.length };
}

// Eenmalige (idempotente) lokale backfill: bestaande asana-1 rijen die vóór de
// contact-extractie zijn gesynct hebben nog geen email/telefoon. Vul ze bij uit de
// reeds opgeslagen titel + notities — zonder Asana-call, dus ook offline veilig.
export function backfillAsanaContacts() {
  const rows = db.prepare(`
    SELECT id, subject, body_text FROM messages
    WHERE channel_id = '${CHANNEL_ID}'
      AND asana_contact_email IS NULL AND asana_contact_phone IS NULL
  `).all();
  if (!rows.length) return { updated: 0 };
  const upd = db.prepare(`
    UPDATE messages
    SET asana_contact_email = ?, asana_contact_phone = ?, contact_id = COALESCE(contact_id, ?)
    WHERE id = ?
  `);
  let updated = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const { email, phone, contactId } = extractContact({ name: r.subject, notes: r.body_text });
      if (email || phone) { upd.run(email, phone, contactId, r.id); updated++; }
    }
  });
  tx();
  return { updated };
}

// Vinkt de bijbehorende Asana-taak/taken af wanneer een hub-to-do wordt afgehandeld.
// Fire-and-forget: faalt de Asana-call, dan blijft de hub-status 'done' staan en logt
// de fout — de volgende sync laat de taak niet terugkeren (hub-regel is al done).
export function completeAsanaTasksForMessages(ids) {
  if (!isConfigured() || !Array.isArray(ids) || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT external_id FROM messages
    WHERE channel_id = '${CHANNEL_ID}' AND external_id IS NOT NULL AND id IN (${placeholders})
  `).all(...ids);
  for (const row of rows) {
    completeTask(row.external_id).catch((e) => {
      console.error(`[ASANA] Taak ${row.external_id} afvinken faalde: ${e.message}`);
    });
  }
}
