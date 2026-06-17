import cron from 'node-cron';
import db from '../db/init.js';

// "wacht op antwoord" indicator: bericht heeft op moment van snoozen geen reactie ontvangen.
// We checken bij het wekken of er na snoozed_at een inbound bericht in de thread is gekomen.
// Zo niet → bericht komt terug met priority='high'.
//
// Twee soorten wekbare berichten:
//   1. status='snoozed'  → klassieke snooze; geen reactie → done_note FOLLOWUP_NOTE.
//   2. status='waiting' met follow_up_mode → slimme follow-up; geen reactie → stel de
//      follow-up klaar (AI genereert, of custom tekst) en markeer FOLLOWUP_READY_NOTE.
// In beide gevallen: wél een reactie → gewoon openen.

const FOLLOWUP_NOTE = 'Geen reactie ontvangen — follow-up nodig';
const FOLLOWUP_READY_NOTE = 'Follow-up klaar — verstuur';

const findWakeable = db.prepare(`
  SELECT m.id, m.thread_id, m.snoozed_at, m.follow_up_mode, m.follow_up_custom_text
  FROM messages m
  WHERE m.status IN ('snoozed', 'waiting')
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

// Slimme follow-up klaargezet: draft staat in follow_up_custom_text, badge in done_note.
const markFollowupReady = db.prepare(`
  UPDATE messages
  SET status = 'open',
      snoozed_until = NULL,
      priority = 'high',
      done_note = ?,
      follow_up_custom_text = ?,
      updated_at = datetime('now')
  WHERE id = ?
`);

const justWake = db.prepare(`
  UPDATE messages
  SET status = 'open',
      snoozed_until = NULL,
      follow_up_mode = NULL,
      follow_up_custom_text = NULL,
      updated_at = datetime('now')
  WHERE id = ?
`);

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

function getStyleProfile() {
  try {
    const row = db.prepare('SELECT * FROM style_profiles WHERE id = ?').get('ramon');
    if (row?.profile_text?.trim()) return row.profile_text;
  } catch { /* ignore */ }
  return 'Schrijf professioneel en vriendelijk. Gebruik komma\'s, nooit streepjes. Persoonlijke toon.';
}

// Genereer een follow-up draft op basis van de thread. Zonder API-key → simpele template.
async function generateFollowUpDraft(messageId) {
  const msg = db.prepare(`
    SELECT m.id, m.thread_id, c.name AS contact_name, ch.type AS channel_type
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(messageId);
  if (!msg) return null;

  const isEmail = msg.channel_type === 'email';
  const contactFirst = (msg.contact_name || '').split(' ')[0] || (isEmail ? 'Hi' : 'Hey');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return isEmail
      ? `Hi ${contactFirst},\n\nIk wilde even opvolgen op mijn vorige bericht. Heb je al de kans gehad om ernaar te kijken?\n\nGroet,\nRamon`
      : `Hey ${contactFirst}, even een follow-up op mijn vorige bericht. Heb je al kunnen kijken?`;
  }

  const threadKey = msg.thread_id || msg.id;
  const threadMsgs = db.prepare(`
    SELECT m.snippet, m.body_text, m.direction, m.received_at, c.name AS contact_name
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    WHERE COALESCE(m.thread_id, m.id) = ?
    ORDER BY m.received_at DESC
    LIMIT 10
  `).all(threadKey);
  const threadContext = threadMsgs.reverse().map((tm) => {
    const who = tm.direction === 'outbound' ? 'JIJ' : (tm.contact_name || msg.contact_name || 'Hen');
    return `[${who}]: ${(tm.body_text || tm.snippet || '').slice(0, 400)}`;
  }).join('\n\n');

  const prompt = `Je bent Ramon Brugman's communicatie-assistent. Schrijf een korte, vriendelijke follow-up bericht.

CONTEXT
- Contact: ${msg.contact_name || 'Onbekend'}
- Kanaal: ${msg.channel_type} (${isEmail ? 'formeler, langer toegestaan' : 'kort en informeel'})
- Taal: detecteer uit de thread (waarschijnlijk Nederlands of Engels)

EERDERE BERICHTEN (chronologisch, oudste eerst)
${threadContext}

RAMON'S SCHRIJFSTIJL
${getStyleProfile()}

INSTRUCTIES
- Kort: WhatsApp max 3 zinnen, email max 5
- Herinner vriendelijk aan het vorige bericht zonder pushy te zijn
- Schrijf in dezelfde taal als de thread
- GEEN subject line
- ALLEEN het bericht zelf — geen uitleg of meta-tekst
- Gebruik KOMMA'S, nooit streepjes
${isEmail ? '- Voeg een gepaste afsluiting toe (Groet, Ramon).' : '- Houd het casual; geen handtekening nodig.'}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  if (data.error || !res.ok) throw new Error(data.error?.message || `Claude API ${res.status}`);
  return (data.content?.[0]?.text || '').trim() || null;
}

async function runOnce() {
  const woken = findWakeable.all();
  if (!woken.length) return;

  let followups = 0;
  let normalWake = 0;
  let ready = 0;
  for (const msg of woken) {
    const threadKey = msg.thread_id || msg.id;
    const { n } = countRepliesSince.get(threadKey, msg.id, msg.snoozed_at, msg.snoozed_at);
    if (n > 0) {
      // Er kwam een reactie → gewoon openen, follow-up-config opruimen.
      justWake.run(msg.id);
      normalWake += 1;
    } else if (msg.follow_up_mode) {
      // Slimme follow-up: stel de draft klaar.
      let draft = msg.follow_up_custom_text || '';
      if (msg.follow_up_mode === 'ai') {
        try {
          draft = (await generateFollowUpDraft(msg.id)) || draft;
        } catch (e) {
          console.log('Follow-up AI generatie faalde:', e.message);
        }
      }
      markFollowupReady.run(FOLLOWUP_READY_NOTE, draft || null, msg.id);
      ready += 1;
    } else {
      // Klassieke snooze zonder reactie.
      markFollowup.run(FOLLOWUP_NOTE, msg.id);
      followups += 1;
    }
  }
  if (followups + normalWake + ready > 0) {
    console.log(`⏰ Snooze cron: ${normalWake} woken, ${followups} follow-up nodig, ${ready} follow-up klaargezet`);
  }
}

export function startSnoozeCron() {
  cron.schedule('* * * * *', () => {
    runOnce().catch((e) => console.error('Snooze cron error:', e.message));
  });
  console.log('⏰ Snooze cron gestart (elke minuut, met follow-up detectie)');
}
