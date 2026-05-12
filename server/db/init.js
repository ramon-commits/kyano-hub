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

export default db;
export { DB_PATH };
