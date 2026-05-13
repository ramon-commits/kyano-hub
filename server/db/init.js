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
