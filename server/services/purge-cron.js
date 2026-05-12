import cron from 'node-cron';
import db from '../db/init.js';

const stmt = db.prepare(`
  UPDATE messages
  SET body_html = NULL, body_text = NULL, updated_at = datetime('now')
  WHERE datetime(received_at) < datetime('now', '-90 days')
    AND (body_html IS NOT NULL OR body_text IS NOT NULL)
`);

export function purgeNow() {
  const result = stmt.run();
  if (result.changes > 0) {
    console.log(`🧹 Purged bodies of ${result.changes} message(s) older than 90 days`);
  }
  return result.changes;
}

export function startPurgeCron() {
  // Elke nacht om 3:00
  cron.schedule('0 3 * * *', () => {
    try { purgeNow(); } catch (e) { console.error('Purge error:', e.message); }
  });
  console.log('🧹 Body-purge cron gestart (03:00 dagelijks, retention 90 dagen)');
}
