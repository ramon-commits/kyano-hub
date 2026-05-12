import db from './init.js';

// Vanaf stap 3: alleen channels seeden. Contacten en berichten komen uit echte
// Gmail sync. De channels zijn de 4 email accounts + 2 WhatsApp placeholders.
const channels = [
  { id: 'gmail-1', type: 'email', label: 'ramon@lifeaidbevco.eu', account_email: 'ramon@lifeaidbevco.eu' },
  { id: 'gmail-2', type: 'email', label: 'ramon@endlessminds.nl', account_email: 'ramon@endlessminds.nl' },
  { id: 'gmail-3', type: 'email', label: 'dach@lifeaidbevco.eu', account_email: 'dach@lifeaidbevco.eu' },
  { id: 'gmail-4', type: 'email', label: 'brugman.ramon@gmail.com', account_email: 'brugman.ramon@gmail.com' },
  { id: 'wa-1', type: 'whatsapp', label: 'WhatsApp Privé', account_email: null },
  { id: 'wa-2', type: 'whatsapp', label: 'WhatsApp FitAid Business', account_email: null },
];

export function seed() {
  const existingChannels = db.prepare('SELECT COUNT(*) AS n FROM channels').get().n;
  if (existingChannels > 0) {
    return;
  }

  const insertChannel = db.prepare(`
    INSERT INTO channels (id, type, label, account_email, is_active)
    VALUES (@id, @type, @label, @account_email, 1)
  `);
  const insertSyncState = db.prepare(`INSERT OR IGNORE INTO sync_state (channel_id) VALUES (?)`);

  const tx = db.transaction(() => {
    for (const c of channels) {
      insertChannel.run(c);
      insertSyncState.run(c.id);
    }
  });

  tx();
  console.log(`✅ Seeded: ${channels.length} channels (geen demo data — sync brengt echte berichten binnen)`);
}

// Eenmalige cleanup: verwijdert demo seed-berichten en orphaned contacten
// uit oudere installaties die nog stap-1 demo data hebben.
// Veilig om bij elke startup uit te voeren — touched alleen rijen die matchen.
export function cleanupDemoData() {
  // 1. Demo berichten verwijderen.
  //    Match op: NULL external_id (toekomstig demo patroon) of stap-1 demo IDs.
  const delMsgs = db.prepare(`
    DELETE FROM messages
    WHERE external_id IS NULL
       OR external_id LIKE 'gmail-abc%'
       OR external_id LIKE 'wa-msg-%'
  `).run();

  // 2. Orphaned contacten (geen berichten meer)
  const delContacts = db.prepare(`
    DELETE FROM contacts
    WHERE id NOT IN (SELECT DISTINCT contact_id FROM messages WHERE contact_id IS NOT NULL)
  `).run();

  // 3. Reset stap-1 demo sync_state cursor values (raken niet meer aan bestaande historyIds)
  if (delMsgs.changes > 0 || delContacts.changes > 0) {
    console.log(`🧹 Cleaned ${delMsgs.changes} demo message(s), ${delContacts.changes} orphaned contact(s)`);
  }

  return { messages: delMsgs.changes, contacts: delContacts.changes };
}
