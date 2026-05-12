import cron from 'node-cron';
import db from '../db/init.js';

export function startSnoozeCron() {
  const stmt = db.prepare(`
    UPDATE messages
    SET status = 'open', snoozed_until = NULL, updated_at = datetime('now')
    WHERE status = 'snoozed'
      AND snoozed_until IS NOT NULL
      AND datetime(snoozed_until) <= datetime('now')
  `);

  cron.schedule('* * * * *', () => {
    const result = stmt.run();
    if (result.changes > 0) {
      console.log(`⏰ Woke up ${result.changes} snoozed message(s)`);
    }
  });

  console.log('⏰ Snooze cron gestart (elke minuut)');
}
