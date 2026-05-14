import { Router } from 'express';
import db from '../db/init.js';

const router = Router();

const notImplemented = (label) => (_req, res) => {
  res.status(501).json({ error: `${label} komt in stap 11 (Claude AI integratie)`, code: 'NOT_IMPLEMENTED' });
};

router.post('/analyze-thread', notImplemented('AI thread analyse'));
router.post('/generate-reply', notImplemented('AI reply generatie'));
router.post('/ask', notImplemented('AI vraag'));

// POST /api/ai/follow-up — genereer een follow-up bericht voor een conversatie
// Zonder ANTHROPIC_API_KEY: simpele template. Met key: Claude Sonnet 4.6.
router.post('/follow-up', async (req, res) => {
  const { message_id } = req.body || {};
  if (!message_id) return res.status(400).json({ error: 'message_id required' });

  const msg = db.prepare(`
    SELECT m.id, m.thread_id, m.contact_id, m.snippet, m.body_text, m.direction, m.subject,
           c.name AS contact_name,
           ch.type AS channel_type, ch.label AS channel_label
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(message_id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  // Hele thread (laatste 10 berichten, chronologisch)
  const threadKey = msg.thread_id || msg.id;
  const threadWhereSql = msg.thread_id ? 'm.thread_id = ?' : 'm.id = ?';
  const threadMsgs = db.prepare(`
    SELECT m.snippet, m.body_text, m.direction, m.received_at, m.subject,
           c.name AS contact_name
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    WHERE ${threadWhereSql}
    ORDER BY m.received_at DESC
    LIMIT 10
  `).all(threadKey);

  const ordered = threadMsgs.reverse();
  const threadContext = ordered.map((tm) => {
    const who = tm.direction === 'outbound' ? 'JIJ' : (tm.contact_name || msg.contact_name || 'Hen');
    const text = (tm.body_text || tm.snippet || '').slice(0, 400);
    return `[${who}]: ${text}`;
  }).join('\n\n');

  const isEmail = msg.channel_type === 'email';
  const contactFirst = (msg.contact_name || '').split(' ')[0] || (isEmail ? 'Hi' : 'Hey');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const followUp = isEmail
      ? `Hi ${contactFirst},\n\nIk wilde even opvolgen op mijn vorige bericht. Heb je al de kans gehad om ernaar te kijken?\n\nGroet,\nRamon`
      : `Hey ${contactFirst}, even een follow-up op mijn vorige bericht. Heb je al kunnen kijken?`;
    return res.json({
      ok: true,
      follow_up: followUp,
      is_ai: false,
      channel_type: msg.channel_type,
    });
  }

  // Style profile (best-effort)
  let style = null;
  try { style = db.prepare("SELECT * FROM style_profiles WHERE id = 'ramon'").get(); } catch { /* tabel kan ontbreken */ }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const prompt = `Je bent Ramon Brugman's communicatie-assistent. Schrijf een korte, vriendelijke follow-up bericht.

CONTEXT
- Contact: ${msg.contact_name || 'Onbekend'}
- Kanaal: ${msg.channel_type} (${isEmail ? 'formeler, langer toegestaan' : 'kort en informeel'})
- Taal: detecteer uit de thread (waarschijnlijk Nederlands of Engels)

EERDERE BERICHTEN (chronologisch, oudste eerst)
${threadContext}

${style?.general_tone ? `RAMON'S TOON: ${style.general_tone}` : `RAMON'S TOON: warm, persoonlijk, niet zakelijk-stijf`}
${style?.signature ? `SIGNATURE (alleen email): ${style.signature}` : ''}

INSTRUCTIES
- Kort: WhatsApp max 3 zinnen, email max 5
- Herinner vriendelijk aan het vorige bericht zonder pushy te zijn
- Schrijf in dezelfde taal als de thread
- GEEN subject line
- ALLEEN het bericht zelf — geen uitleg of meta-tekst
${isEmail ? '- Voeg een gepaste afsluiting toe (Groet, Ramon).' : '- Houd het casual; geen handtekening nodig.'}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data?.error?.message || `Anthropic API ${response.status}` });
    }
    const followUp = (data.content?.[0]?.text || '').trim();
    if (!followUp) return res.status(502).json({ error: 'Lege response van Claude' });

    res.json({
      ok: true,
      follow_up: followUp,
      is_ai: true,
      channel_type: msg.channel_type,
      model,
      tokens_used: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'AI call mislukt' });
  }
});

export default router;
