import db from '../db/init.js';

export function getConfig(key) {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function setConfig(key, value) {
  db.prepare(`
    INSERT INTO app_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

export function deleteConfig(key) {
  db.prepare('DELETE FROM app_config WHERE key = ?').run(key);
}

// Helper voor Unipile credentials (DB > env)
export function getUnipileCreds() {
  const apiKey = getConfig('unipile_api_key') || process.env.UNIPILE_API_KEY || null;
  const dsn = getConfig('unipile_dsn') || process.env.UNIPILE_DSN || null;
  return { apiKey, dsn };
}
