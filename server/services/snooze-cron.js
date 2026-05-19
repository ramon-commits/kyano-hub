import cron from 'node-cron';
import db from '../db/init.js';

// "wacht op antwoord" indicator: bericht heeft op moment van snoozen geen reactie ontvangen.
// We checken bij het wekken of er na snoozed_at een inbound bericht in de thread is gekomen.
// Zo niet → bericht komt terug met priority='high' en done_note 'Geen reactie ontvangen — follow-up nodig'.

const FOLLOWUP_NOTE = 'Geen reactie ontvangen — follow-up nodig';

const findWakeable = db.prepare(`
  SELECT m.id, m.thread_id, m.snoozed_at
  FROM messages m
  WHERE m.status = 'snoozed'
    AND m.snoozed_until IS NOT NULL
    AND datetime(m.snoozed_until) <= datetime('now')
`);

const countRepliesSince = db.prepare(`
  SELECT COUNT(*) AS n
  FROM messages m2
  WHERE COALESCE(m2.thread_id, m2.id) = COALESCE(?, ?)
    AND m2.direction = 'inbound'
    AND (? IS NULL OR datetime(m2.received_at) > datetime(?))
`);

const markFollowup = db.prepare(`
  UPDATE messages
  SET status = 'open',
      snoozed_until = NULL,
      priority = 'high',
      done_note = ?,
      updated_at = datetime('now')
  WHERE id = ?
`);

const justWake = db.prepare(`
  UPDATE messages
  SET status = 'open', snoozed_until = NULL, updated_at = datetime('now')
  WHERE id = ?
`);

function runOnce() {
  const woken = findWakeable.all();
  if (!woken.length) return;

  let followups = 0;
  let normalWake = 0;
  for (const msg of woken) {
    const threadKey = msg.thread_id || msg.id;
    const { n } = countRepliesSince.get(threadKey, msg.id, msg.snoozed_at, msg.snoozed_at);
    if (n === 0) {
      markFollowup.run(FOLLOWUP_NOTE, msg.id);
      followups += 1;
    } else {
      justWake.run(msg.id);
      normalWake += 1;
    }
  }
  if (followups + normalWake > 0) {
    console.log(`⏰ Snooze cron: ${normalWake} woken, ${followups} marked for follow-up`);
  }
}

export function startSnoozeCron() {
  cron.schedule('* * * * *', runOnce);
  console.log('⏰ Snooze cron gestart (elke minuut, met follow-up detectie)');
}
