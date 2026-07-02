import db from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { isConfigured, fetchIncompleteTasks, isAllowedAssignee, completeTask, dueWithinDays, passesDueFilter } from './asana.js';

const CHANNEL_ID = 'asana-1';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

function normalizePhone(phone) {
  return phone.replace(/[\s\-()]/g, '').replace(/^00/, '+').replace(/^0(?=\d)/, '+31');
}

// Bouwt een { veldnaam: waarde } dictionary uit Asana custom_fields (display_value = de
// door Asana geformatteerde weergave, werkt voor tekst/nummer/enum/datum).
function customFieldsDict(task) {
  const out = {};
  for (const cf of (task.custom_fields || [])) {
    const value = cf.display_value;
    if (cf.name && value !== null && value !== undefined && value !== '') out[cf.name] = value;
  }
  return out;
}

// Map de Asana-assignee naar het juiste Comm Hub-afzenderkanaal.
// (channel-id's geverifieerd tegen de channels-tabel — niet geraden.)
//   Ramon → gmail-1 (ramon@lifeaidbevco.eu) / wa-2 (WhatsApp FitAid Business)
//   Dach  → gmail-3 (dach@lifeaidbevco.eu)  / wa-3 (WhatsApp DACH)
function resolveChannel(assigneeEmail, kind) {
  const email = (assigneeEmail || '').toLowerCase();
  if (kind === 'email') {
    if (email.includes('dach')) return 'gmail-3';
    if (email.includes('ramon')) return 'gmail-1';
    return 'gmail-1';
  }
  if (kind === 'whatsapp') {
    if (email.includes('dach')) return 'wa-3';
    if (email.includes('ramon')) return 'wa-2';
    return 'wa-2';
  }
  return null;
}

// Distilleer contactgegevens uit een taak: emailadres + telefoon. Zoekt in titel,
// notities én het "Contact"-custom field (daar staat bij FitAid "Tel: … Email: …").
// Universeel — géén keyword-detectie op de titel. De acties bepalen de knoppen puur
// op wat hier gevonden wordt.
function extractContact(task) {
  const cf = task.custom_fields ? customFieldsDict(task) : {};
  const contactField = cf['Contact'] || cf['Contact Email'] || cf['Email'] || '';
  const hay = `${task.name || ''}\n${task.notes || ''}\n${contactField}`;
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
       asana_custom_fields, asana_assignee_email, asana_email_channel, asana_whatsapp_channel,
       status, priority, received_at, created_at, updated_at)
    VALUES (?, ?, '${CHANNEL_ID}', ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'medium',
       datetime('now'), datetime('now'), datetime('now'))
  `);

  // Backfill/actueel houden: vult velden bij op bestaande rijen die ze nog missen
  // (INSERT OR IGNORE raakt bestaande rijen niet). COALESCE = nooit overschrijven.
  const updateContact = db.prepare(`
    UPDATE messages
    SET asana_contact_email = COALESCE(asana_contact_email, ?),
        asana_contact_phone = COALESCE(asana_contact_phone, ?),
        contact_id = COALESCE(contact_id, ?),
        asana_custom_fields = COALESCE(asana_custom_fields, ?),
        asana_assignee_email = COALESCE(asana_assignee_email, ?),
        asana_email_channel = COALESCE(asana_email_channel, ?),
        asana_whatsapp_channel = COALESCE(asana_whatsapp_channel, ?)
    WHERE channel_id = '${CHANNEL_ID}' AND external_id = ?
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const t of mine) {
      const { email, phone, contactId } = extractContact(t);
      const assignee = t.assignee?.email || null;
      const fieldsJson = JSON.stringify(customFieldsDict(t));
      const emailChannel = resolveChannel(assignee, 'email');
      const waChannel = resolveChannel(assignee, 'whatsapp');
      const notes = (t.notes || '').trim() || null;
      const snippet = (notes ? notes.replace(/\s+/g, ' ') : t.name).slice(0, 180);
      const r = insert.run(uuid(), t.gid, contactId, t.name || '(taak zonder titel)', snippet, notes, t.permalink_url || null, email, phone, fieldsJson, assignee, emailChannel, waChannel);
      if (r.changes) inserted++;
      else updateContact.run(email, phone, contactId, fieldsJson, assignee, emailChannel, waChannel, t.gid);
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

// Vinkt de aan een conversatie gekoppelde Asana-taak af (via message_asana_links) zodra
// er in die conversatie een bericht wordt verstuurd. Zet de asana-1 to-do op 'done' en
// ruimt een eventueel placeholder-bericht op. Fire-and-forget richting Asana.
export function completeLinkedAsanaForMessage(messageId) {
  if (!messageId) return 0;
  const links = db.prepare('SELECT asana_task_id FROM message_asana_links WHERE message_id = ?').all(messageId);
  if (!links.length) return 0;
  const closeTodo = db.prepare(`
    UPDATE messages SET status='done', done_at=datetime('now'), done_category='replied',
      done_note='Beantwoord — Asana taak afgevinkt', updated_at=datetime('now')
    WHERE channel_id='${CHANNEL_ID}' AND external_id=? AND status IN ('open','snoozed','waiting')
  `);
  for (const { asana_task_id } of links) {
    closeTodo.run(asana_task_id);
    if (isConfigured()) {
      completeTask(asana_task_id).catch((e) => console.error(`[ASANA] link-complete ${asana_task_id} faalde: ${e.message}`));
    }
  }
  // Placeholder-bericht (het 'nieuwe gesprek') is nu overbodig → op done.
  db.prepare(`UPDATE messages SET status='done', done_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND is_placeholder=1`).run(messageId);
  return links.length;
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
