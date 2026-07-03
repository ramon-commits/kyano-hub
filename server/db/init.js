import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, '../../data');
const DB_PATH = resolve(DB_DIR, 'comm-hub.db');
const SCHEMA_PATH = resolve(__dirname, 'schema.sql');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// Rebuild FTS5 index als de tabel leeg is maar er wel messages bestaan
// (eerste boot na FTS-toevoeging, of na een crash)
try {
  const msgCount = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  const ftsCount = db.prepare('SELECT COUNT(*) AS n FROM messages_fts').get().n;
  if (msgCount > 0 && ftsCount === 0) {
    db.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')");
    console.log(`🔎 FTS5 index rebuilt voor ${msgCount} bestaande berichten`);
  }
} catch (e) {
  console.error('FTS rebuild check failed:', e.message);
}

// Guarded ALTER TABLE migraties — geen migrations-runner, dus per-kolom try/catch
// (SQLite ondersteunt geen "ADD COLUMN IF NOT EXISTS")
const SAFE_ALTERS = [
  // CRM velden voor contacten (Fase 4)
  "ALTER TABLE contacts ADD COLUMN contact_status TEXT",
  "ALTER TABLE contacts ADD COLUMN deal_value REAL",
  "ALTER TABLE contacts ADD COLUMN next_action TEXT",
  "ALTER TABLE contacts ADD COLUMN next_action_date TEXT",
  // Media in chat berichten (Unipile attachments) — JSON array
  "ALTER TABLE messages ADD COLUMN attachments_json TEXT",
  // Snooze tijdstip — nodig voor "wacht op antwoord" follow-up detectie
  "ALTER TABLE messages ADD COLUMN snoozed_at TEXT",
  // Slimme follow-up: hoe de geplande follow-up wordt opgesteld ('ai' | 'custom')
  // en (voor custom) de vooraf geschreven tekst / na cron-run de klaargezette draft.
  "ALTER TABLE messages ADD COLUMN follow_up_mode TEXT",
  "ALTER TABLE messages ADD COLUMN follow_up_custom_text TEXT",
  // Asana to-do's: uit de taak (titel + notities) gedistilleerd contact — zodat de
  // "Neem contact op"-kaart werkt, óók als de klant nog geen contact in de hub is.
  "ALTER TABLE messages ADD COLUMN asana_contact_email TEXT",
  "ALTER TABLE messages ADD COLUMN asana_contact_phone TEXT",
  // Asana custom fields (JSON: naam → waarde), de assignee, en het per-assignee
  // bepaalde afzender-kanaal (email/whatsapp) — voor de klantinfo + juiste account.
  "ALTER TABLE messages ADD COLUMN asana_custom_fields TEXT",
  "ALTER TABLE messages ADD COLUMN asana_assignee_email TEXT",
  "ALTER TABLE messages ADD COLUMN asana_email_channel TEXT",
  "ALTER TABLE messages ADD COLUMN asana_whatsapp_channel TEXT",
  // Placeholder-bericht: een leeg 'nieuw gesprek' dat via een Asana-taak is gestart
  // en nog geen echte historie heeft. Verdwijnt zodra er een echt bericht binnenkomt.
  "ALTER TABLE messages ADD COLUMN is_placeholder INTEGER DEFAULT 0",
  // Templates (bovenop quick_replies): onderwerp (email), categorie en gebruiksteller
  // zodat de meest gebruikte templates bovenaan komen.
  "ALTER TABLE quick_replies ADD COLUMN subject TEXT",
  "ALTER TABLE quick_replies ADD COLUMN category TEXT DEFAULT 'algemeen'",
  "ALTER TABLE quick_replies ADD COLUMN usage_count INTEGER DEFAULT 0",
  // Templates: rich-text body (HTML met smart links) en een voorkeur-afzenderkanaal.
  "ALTER TABLE quick_replies ADD COLUMN body_html TEXT",
  "ALTER TABLE quick_replies ADD COLUMN preferred_channel_id TEXT",
  // Stijlprofiel velden voor automatische stijl-analyse
  "ALTER TABLE style_profiles ADD COLUMN profile_text TEXT",
  "ALTER TABLE style_profiles ADD COLUMN email_count INTEGER DEFAULT 0",
  "ALTER TABLE style_profiles ADD COLUMN chat_count INTEGER DEFAULT 0",
];
for (const sql of SAFE_ALTERS) {
  try { db.exec(sql); } catch (e) {
    if (!/duplicate column/i.test(e.message)) {
      console.error('Migration failed:', sql, '—', e.message);
    }
  }
}

// Koppeltabel: verbindt een (echte of placeholder-) conversatie aan een Asana-taak.
// Bij het versturen van een reply in die conversatie wordt de taak automatisch afgevinkt.
db.exec(`
  CREATE TABLE IF NOT EXISTS message_asana_links (
    message_id TEXT NOT NULL,
    asana_task_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, asana_task_id)
  )
`);

// Bijlages die aan een template (quick_reply) hangen en automatisch meegestuurd worden.
db.exec(`
  CREATE TABLE IF NOT EXISTS template_attachments (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER,
    file_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (template_id) REFERENCES quick_replies(id) ON DELETE CASCADE
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_template_attachments_template ON template_attachments(template_id)');

// Migration: channels.type CHECK moet 'todo' toestaan (voor het to-do systeem).
// SQLite kan een CHECK niet via ALTER aanpassen — dus rebuild van de tabel als de
// oude constraint nog actief is. FK's tijdelijk uit; channels wordt door meerdere
// tabellen gerefereerd.
try {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='channels'").get();
  if (row && !/'todo'/.test(row.sql)) {
    db.pragma('foreign_keys = OFF');
    try {
      const rebuild = db.transaction(() => {
        db.exec(`
          CREATE TABLE channels_new (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('email','whatsapp','instagram','linkedin','todo')),
            label TEXT NOT NULL,
            account_email TEXT,
            is_active INTEGER DEFAULT 1,
            config_json TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );
          INSERT INTO channels_new (id, type, label, account_email, is_active, config_json, created_at)
            SELECT id, type, label, account_email, is_active, config_json, created_at FROM channels;
          DROP TABLE channels;
          ALTER TABLE channels_new RENAME TO channels;
        `);
      });
      rebuild();
      console.log("🔧 channels.type CHECK uitgebreid met 'todo'");
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
} catch (e) {
  console.error('channels todo-migration failed:', e.message);
}

// Seed quick replies (alleen als tabel leeg is)
try {
  const n = db.prepare('SELECT COUNT(*) AS n FROM quick_replies').get().n;
  if (n === 0) {
    const seeds = [
      { shortcut: '/bedankt',    title: 'Bedankt',    body: 'Bedankt voor je bericht! Ik kom er deze week op terug.' },
      { shortcut: '/later',      title: 'Komt later', body: 'Ik heb je bericht gezien, ik kom er zo snel mogelijk op terug.' },
      { shortcut: '/call',       title: 'Bellen',     body: 'Goed idee, laten we even bellen. Wanneer schikt het jou?' },
      { shortcut: '/offerte',    title: 'Offerte',    body: 'Bedankt voor je interesse! Ik stuur je zo snel mogelijk een offerte.' },
      { shortcut: '/verjaardag', title: 'Felicitatie',body: 'Van harte gefeliciteerd met je verjaardag!' },
    ];
    const stmt = db.prepare('INSERT INTO quick_replies (id, shortcut, title, body) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      for (const s of seeds) stmt.run(`qr-${s.shortcut.slice(1)}`, s.shortcut, s.title, s.body);
    });
    tx();
    console.log(`💬 Seeded ${seeds.length} quick reply templates`);
  }
} catch (e) {
  console.error('Quick replies seed failed:', e.message);
}

export default db;
export { DB_PATH };
