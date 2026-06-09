import cron from 'node-cron';
import db from '../db/init.js';

// Tiered retention. body_html is verreweg de grootste kolom (zware HTML-mails) — die
// ruimen we agressief op zodra een bericht is afgehandeld (done/archived) en 14 dagen oud.
// De leesbare body_text + snippet blijven langer staan voor zoeken/forward/download;
// open/snoozed berichten houden hun body_html altijd (die heb je nog actief nodig).
const purgeHtml = db.prepare(`
  UPDATE messages SET body_html = NULL, updated_at = datetime('now')
  WHERE received_at < datetime('now', '-14 days')
    AND body_html IS NOT NULL
    AND status IN ('done', 'archived')
`);
const purgeText = db.prepare(`
  UPDATE messages SET body_text = NULL, updated_at = datetime('now')
  WHERE received_at < datetime('now', '-90 days')
    AND body_text IS NOT NULL
`);
const purgeLogs = db.prepare(`DELETE FROM interaction_logs WHERE created_at < datetime('now', '-90 days')`);
const purgeSummaries = db.prepare(`DELETE FROM thread_summaries WHERE created_at < datetime('now', '-7 days')`);

export function purgeNow() {
  const html = purgeHtml.run().changes;
  const text = purgeText.run().changes;
  const logs = purgeLogs.run().changes;
  const summaries = purgeSummaries.run().changes;
  if (html + text + logs + summaries > 0) {
    console.log(`🧹 Purge: ${html} html, ${text} text, ${logs} logs, ${summaries} summaries`);
  }
  return { html, text, logs, summaries };
}

export function startPurgeCron() {
  // Elke nacht om 3:00
  cron.schedule('0 3 * * *', () => {
    try {
      purgeNow();
      // Wekelijkse VACUUM (zondag) geeft de vrijgekomen ruimte terug aan het OS.
      // VACUUM is synchroon en blokkeert kort; 03:00 op zondag is daarvoor prima.
      if (new Date().getDay() === 0) {
        db.exec('VACUUM');
        db.pragma('wal_checkpoint(TRUNCATE)');
        console.log('🧹 Weekly VACUUM done');
      }
    } catch (e) {
      console.error('Purge error:', e.message);
    }
  });
  console.log('🧹 Purge cron gestart (03:00 dagelijks · body_html 14d, body_text 90d, logs 90d, summaries 7d)');
}
