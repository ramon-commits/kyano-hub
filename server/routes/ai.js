import { Router } from 'express';
import db from '../db/init.js';

const router = Router();

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

function getApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

// Haal stijlprofiel op (als het bestaat). Eerst nieuw veld (profile_text) anders fallback op general_tone.
function getStyleProfile() {
  try {
    const row = db.prepare('SELECT * FROM style_profiles WHERE id = ?').get('ramon');
    if (!row) return 'Schrijf professioneel en vriendelijk. Gebruik komma\'s, nooit streepjes. Persoonlijke toon.';
    if (row.profile_text && row.profile_text.trim()) return row.profile_text;
    const parts = [];
    if (row.general_tone) parts.push(`Toon: ${row.general_tone}`);
    if (row.signature) parts.push(`Signature: ${row.signature}`);
    if (row.prefer_rules) parts.push(`Voorkeur: ${row.prefer_rules}`);
    if (row.avoid_rules) parts.push(`Vermijd: ${row.avoid_rules}`);
    return parts.length
      ? parts.join('\n')
      : 'Schrijf professioneel en vriendelijk. Gebruik komma\'s, nooit streepjes. Persoonlijke toon.';
  } catch {
    return 'Schrijf professioneel en vriendelijk. Gebruik komma\'s, nooit streepjes. Persoonlijke toon.';
  }
}

// Haal thread context op (laatste N berichten, chronologisch oudste eerst)
function getThreadContext(messageId, limit = 10) {
  const msg = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(messageId);
  if (!msg) return '';
  const threadKey = msg.thread_id || messageId;
  const msgs = db.prepare(`
    SELECT m.snippet, m.body_text, m.direction, m.subject, c.name AS contact_name
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    WHERE COALESCE(m.thread_id, m.id) = ?
    ORDER BY m.received_at DESC
    LIMIT ?
  `).all(threadKey, limit);

  return msgs.reverse().map((m) => {
    const who = m.direction === 'outbound' ? 'JIJ' : (m.contact_name || 'Hen');
    return `[${who}]: ${(m.body_text || m.snippet || '').slice(0, 500)}`;
  }).join('\n\n---\n\n');
}

// Claude API call helper
async function callClaude(prompt, maxTokens = 1024) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY niet geconfigureerd');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Claude API error');
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  return {
    text: (data.content?.[0]?.text || '').trim(),
    tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
  };
}

// ============ ROUTES ============

// POST /api/ai/improve-nl — Verbeter Nederlands
router.post('/improve-nl', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const style = getStyleProfile();
    const result = await callClaude(`Je bent een Nederlandse taalassistent. Verbeter de spelling, grammatica en leesbaarheid van de volgende tekst.
Behoud de oorspronkelijke toon, betekenis EN opmaak (alinea's, witregels, structuur).
Gebruik KOMMA'S, nooit streepjes. Behoud de oorspronkelijke regelafbrekingen en paragraafstructuur.

Schrijfstijl van de gebruiker:
${style}

Tekst om te verbeteren:
${text}

Geef ALLEEN de verbeterde tekst terug, geen uitleg. Behoud exact dezelfde regelindeling.`);

    res.json({ ok: true, result: result.text, tokens: result.tokens });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/translate — Vertaal
router.post('/translate', async (req, res) => {
  try {
    const { text, lang } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const langNames = { en: 'Engels', es: 'Spaans', it: 'Italiaans', fr: 'Frans', de: 'Duits', nl: 'Nederlands' };
    const langName = langNames[lang] || lang || 'Engels';
    const style = getStyleProfile();

    const result = await callClaude(`Vertaal de volgende tekst naar het ${langName}. Verbeter ook spelling en grammatica.
Behoud de toon, schrijfstijl EN opmaak (alinea's, witregels, structuur).
Gebruik KOMMA'S, nooit streepjes. Behoud de oorspronkelijke regelindeling en paragraafstructuur.

Schrijfstijl van de gebruiker:
${style}

Tekst om te vertalen:
${text}

Geef ALLEEN de vertaalde tekst terug, geen uitleg. Behoud exact dezelfde regelindeling.`);

    res.json({ ok: true, result: result.text, lang: langName, tokens: result.tokens });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/reply — Genereer antwoord op thread
router.post('/reply', async (req, res) => {
  try {
    const { message_id } = req.body || {};
    if (!message_id) return res.status(400).json({ error: 'message_id required' });

    const msg = db.prepare(`
      SELECT m.*, c.name AS contact_name, ch.type AS channel_type
      FROM messages m
      LEFT JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN channels ch ON ch.id = m.channel_id
      WHERE m.id = ?
    `).get(message_id);
    if (!msg) return res.status(404).json({ error: 'Not found' });

    const style = getStyleProfile();
    const threadContext = getThreadContext(message_id);
    const isChat = ['whatsapp', 'instagram', 'linkedin'].includes(msg.channel_type);

    const result = await callClaude(`Je bent een communicatie-assistent. Schrijf een antwoord op de onderstaande conversatie.
Schrijf in DEZELFDE TAAL als het laatste bericht in de thread. Detecteer de taal automatisch.
Schrijf in de stijl van de gebruiker. Gebruik KOMMA'S, nooit streepjes.
${isChat ? 'Dit is een chat (WhatsApp/LinkedIn) — houd het kort en informeel, max 2-3 zinnen.' : 'Dit is een email — schrijf professioneel maar persoonlijk, meerdere zinnen op aparte regels.'}

Schrijfstijl van de gebruiker:
${style}

Conversatie:
${threadContext || `[Hen]: ${msg.body_text || msg.snippet || ''}`}

Schrijf ALLEEN het antwoord. ${isChat ? 'Kort en informeel.' : 'Geen onderwerpregel, begin direct met de inhoud tenzij dat past bij de stijl.'}`);

    res.json({ ok: true, result: result.text, channel_type: msg.channel_type, tokens: result.tokens });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/variants — Genereer 3 strategische antwoord-varianten
router.post('/variants', async (req, res) => {
  try {
    const { message_id } = req.body || {};
    if (!message_id) return res.status(400).json({ error: 'message_id required' });

    const msg = db.prepare(`
      SELECT m.*, c.name AS contact_name, ch.type AS channel_type
      FROM messages m
      LEFT JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN channels ch ON ch.id = m.channel_id
      WHERE m.id = ?
    `).get(message_id);
    if (!msg) return res.status(404).json({ error: 'Not found' });

    const style = getStyleProfile();
    const threadContext = getThreadContext(message_id);
    const isChat = ['whatsapp', 'instagram', 'linkedin'].includes(msg.channel_type);

    const result = await callClaude(`Je bent een communicatie-strateeg. Genereer 3 verschillende antwoord-varianten voor de onderstaande conversatie.

Elke variant heeft een ANDERE strategie — niet alleen een andere toon, maar een ander DOEL:
- Variant 1: Directe bevestiging / accepteer wat gevraagd wordt
- Variant 2: Vraag om meer informatie / stel voor om te bellen
- Variant 3: Stel een alternatief voor / onderhandel

Per variant geef je:
LABEL: [2-3 woorden die het doel beschrijven]
TEKST: [het antwoord]

Schrijf in DEZELFDE TAAL als de conversatie. ${isChat ? 'Chat-stijl: kort en informeel.' : 'Email-stijl: professioneel maar persoonlijk.'}
Gebruik KOMMA'S, nooit streepjes.

Schrijfstijl: ${style}

Conversatie:
${threadContext || `[Hen]: ${msg.body_text || msg.snippet || ''}`}

Geef EXACT dit JSON format terug, NIETS anders:
[
  {"label": "...", "text": "..."},
  {"label": "...", "text": "..."},
  {"label": "...", "text": "..."}
]`, 1500);

    // Parse JSON uit de response
    let variants;
    try {
      const cleaned = result.text.replace(/```json\n?|```/g, '').trim();
      // Pak de eerste JSON array uit de response (robuuster dan strict parsen)
      const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
      variants = JSON.parse(match ? match[0] : cleaned);
    } catch {
      variants = [{ label: 'Antwoord', text: result.text }];
    }

    res.json({ ok: true, variants, channel_type: msg.channel_type, tokens: result.tokens });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/follow-up — genereer een follow-up bericht voor een conversatie
// Zonder ANTHROPIC_API_KEY: simpele template. Met key: Claude.
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

  const apiKey = getApiKey();
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

  const style = getStyleProfile();

  const prompt = `Je bent Ramon Brugman's communicatie-assistent. Schrijf een korte, vriendelijke follow-up bericht.

CONTEXT
- Contact: ${msg.contact_name || 'Onbekend'}
- Kanaal: ${msg.channel_type} (${isEmail ? 'formeler, langer toegestaan' : 'kort en informeel'})
- Taal: detecteer uit de thread (waarschijnlijk Nederlands of Engels)

EERDERE BERICHTEN (chronologisch, oudste eerst)
${threadContext}

RAMON'S SCHRIJFSTIJL
${style}

INSTRUCTIES
- Kort: WhatsApp max 3 zinnen, email max 5
- Herinner vriendelijk aan het vorige bericht zonder pushy te zijn
- Schrijf in dezelfde taal als de thread
- GEEN subject line
- ALLEEN het bericht zelf — geen uitleg of meta-tekst
- Gebruik KOMMA'S, nooit streepjes
${isEmail ? '- Voeg een gepaste afsluiting toe (Groet, Ramon).' : '- Houd het casual; geen handtekening nodig.'}`;

  try {
    const out = await callClaude(prompt, 500);
    if (!out.text) return res.status(502).json({ error: 'Lege response van Claude' });
    res.json({
      ok: true,
      follow_up: out.text,
      is_ai: true,
      channel_type: msg.channel_type,
      model: MODEL,
      tokens_used: out.tokens,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'AI call mislukt' });
  }
});

// POST /api/ai/analyze-style — analyseer Ramon's laatste verzonden berichten en bouw een stijlprofiel
router.post('/analyze-style', async (req, res) => {
  try {
    const sent = db.prepare(`
      SELECT m.body_text, m.snippet, ch.type AS channel_type
      FROM messages m
      LEFT JOIN channels ch ON ch.id = m.channel_id
      WHERE m.direction = 'outbound' AND (m.body_text IS NOT NULL OR m.snippet IS NOT NULL)
      ORDER BY m.received_at DESC
      LIMIT 100
    `).all();

    if (sent.length < 10) {
      return res.json({ ok: false, error: 'Minimaal 10 verzonden berichten nodig', count: sent.length });
    }

    const emails = sent.filter((m) => m.channel_type === 'email').map((m) => m.body_text || m.snippet).filter(Boolean).slice(0, 50);
    const chats = sent.filter((m) => ['whatsapp', 'linkedin', 'instagram'].includes(m.channel_type)).map((m) => m.body_text || m.snippet).filter(Boolean).slice(0, 50);

    const sampleText = [
      emails.length ? `EMAIL BERICHTEN (${emails.length}):\n${emails.join('\n---\n')}` : '',
      chats.length ? `CHAT BERICHTEN (${chats.length}):\n${chats.join('\n---\n')}` : '',
    ].filter(Boolean).join('\n\n========\n\n');

    const result = await callClaude(`Analyseer de schrijfstijl van deze persoon op basis van hun verzonden berichten.

${sampleText}

Geef een stijlprofiel in het volgende format:

TOON: [beschrijf de algehele toon - formeel/informeel, warm/zakelijk, etc.]
TAAL: [welke talen worden gebruikt en wanneer]
AANHEF: [hoe begint deze persoon berichten - per kanaal als het verschilt]
AFSLUITING: [hoe eindigt deze persoon berichten - per kanaal]
TYPISCHE ZINNEN: [veelgebruikte uitdrukkingen of formuleringen]
STRUCTUUR: [hoe worden berichten opgebouwd - kort/lang, opsommingen, etc.]
KANAALVERSCHILLEN: [verschil in stijl tussen email en chat]
AI INSTRUCTIES: [concrete instructies voor een AI die in deze stijl moet schrijven]

Wees specifiek en geef voorbeelden.`, 2000);

    db.prepare(`
      INSERT INTO style_profiles (id, profile_text, email_count, chat_count, updated_at)
      VALUES ('ramon', ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        profile_text = excluded.profile_text,
        email_count = excluded.email_count,
        chat_count = excluded.chat_count,
        updated_at = datetime('now')
    `).run(result.text, emails.length, chats.length);

    res.json({
      ok: true,
      profile: result.text,
      emails_analyzed: emails.length,
      chats_analyzed: chats.length,
      tokens: result.tokens,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ai/style-profile — haal huidig profiel op
router.get('/style-profile', (_req, res) => {
  try {
    const profile = db.prepare('SELECT * FROM style_profiles WHERE id = ?').get('ramon');
    res.json({ ok: true, profile: profile || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Behoud oude not-implemented stubs voor compat
const notImplemented = (label) => (_req, res) => {
  res.status(501).json({ error: `${label} komt later`, code: 'NOT_IMPLEMENTED' });
};
router.post('/analyze-thread', notImplemented('AI thread analyse'));
router.post('/generate-reply', notImplemented('AI reply generatie'));
router.post('/ask', notImplemented('AI vraag'));

export default router;
