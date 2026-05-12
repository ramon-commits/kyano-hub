import db from '../db/init.js';
import { v4 as uuid } from 'uuid';

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, '').replace(/^00/, '+').replace(/^0(?=\d)/, '+31');
}

function initialsFor(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#dc2626'];
function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export function matchContact({ email, name, phone }) {
  if (email) {
    const byEmail = db.prepare('SELECT * FROM contacts WHERE lower(email) = lower(?)').get(email);
    if (byEmail) return byEmail;
  }

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const byPhone = db.prepare('SELECT * FROM contacts WHERE phone = ?').get(normalizedPhone);
    if (byPhone) return byPhone;
  }

  // Domain-based company hint (no auto-match)
  let company = null;
  if (email && email.includes('@')) {
    const domain = email.split('@')[1];
    if (domain && !['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com'].includes(domain)) {
      const domainName = domain.split('.')[0];
      company = domainName.charAt(0).toUpperCase() + domainName.slice(1);
    }
  }

  // Create new contact
  const id = uuid();
  const finalName = name || email || normalizedPhone || 'Onbekend';
  db.prepare(`
    INSERT INTO contacts (id, name, company, email, phone, avatar_initials, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, finalName, company, email || null, normalizedPhone, initialsFor(finalName), randomColor());

  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
}

export function mergeContacts(keepId, mergeId) {
  if (keepId === mergeId) throw new Error('Cannot merge a contact with itself');

  const keep = db.prepare('SELECT * FROM contacts WHERE id = ?').get(keepId);
  const merge = db.prepare('SELECT * FROM contacts WHERE id = ?').get(mergeId);
  if (!keep || !merge) throw new Error('Contact not found');

  const tx = db.transaction(() => {
    db.prepare('UPDATE messages SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId);
    db.prepare('UPDATE interaction_logs SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId);
    db.prepare('UPDATE contact_projects SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId);
    db.prepare('UPDATE nudge_settings SET contact_id = ? WHERE contact_id = ?').run(keepId, mergeId);

    // Combine fields where keep is null
    db.prepare(`
      UPDATE contacts SET
        company = COALESCE(company, ?),
        email = COALESCE(email, ?),
        phone = COALESCE(phone, ?),
        birthday = COALESCE(birthday, ?),
        notes = COALESCE(notes, ?),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(merge.company, merge.email, merge.phone, merge.birthday, merge.notes, keepId);

    db.prepare('DELETE FROM contacts WHERE id = ?').run(mergeId);
  });

  tx();
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(keepId);
}

export { normalizePhone, initialsFor };
