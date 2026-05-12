import db from './init.js';

const channels = [
  { id: 'gmail-1', type: 'email', label: 'ramon@lifeaidbevco.eu', account_email: 'ramon@lifeaidbevco.eu' },
  { id: 'gmail-2', type: 'email', label: 'ramon@endlessminds.nl', account_email: 'ramon@endlessminds.nl' },
  { id: 'gmail-3', type: 'email', label: 'dach@lifeaidbevco.eu', account_email: 'dach@lifeaidbevco.eu' },
  { id: 'gmail-4', type: 'email', label: 'brugman.ramon@gmail.com', account_email: 'brugman.ramon@gmail.com' },
  { id: 'wa-1', type: 'whatsapp', label: 'WhatsApp Privé', account_email: null },
  { id: 'wa-2', type: 'whatsapp', label: 'WhatsApp FitAid Business', account_email: null },
];

const contacts = [
  { id: 'c1', name: 'Mike de Vries', company: 'TechFlow BV', email: 'mike@techflow.nl', phone: '+31612345678', birthday: '1988-07-14', avatar_initials: 'MV', avatar_color: '#6366f1' },
  { id: 'c2', name: 'Sophie Bakker', company: 'Bakker Legal', email: 'sophie@bakkerlegal.nl', phone: '+31687654321', birthday: '1990-09-15', avatar_initials: 'SB', avatar_color: '#ec4899' },
  { id: 'c3', name: 'Jan Pietersen', company: 'Digital Agency X', email: 'jan@dax.nl', phone: '+31698765432', birthday: '1985-05-20', avatar_initials: 'JP', avatar_color: '#f59e0b' },
  { id: 'c4', name: 'Lisa Jansen', company: 'Kyano Horaizon', email: 'lisa@kyano.io', phone: '+31611223344', birthday: '1995-03-22', avatar_initials: 'LJ', avatar_color: '#10b981' },
  { id: 'c5', name: 'Thomas van Dijk', company: 'Van Dijk Makelaars', email: 'thomas@vandijk.nl', phone: '+31655667788', birthday: '1982-12-01', avatar_initials: 'TD', avatar_color: '#3b82f6' },
  { id: 'c6', name: 'Emma Visser', company: 'Visser Consulting', email: 'emma@visserconsulting.nl', phone: '+31699887766', birthday: '1993-08-10', avatar_initials: 'EV', avatar_color: '#8b5cf6' },
];

// Helper voor relatieve timestamps
const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();
const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
const inHours = (h) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

const messages = [
  // === OPEN (7) ===
  {
    id: 'm1', external_id: 'gmail-abc001', channel_id: 'gmail-1', contact_id: 'c1',
    subject: 'Offerte FitAid Q3 leveringen',
    snippet: 'Hoi Ramon, kun je de offerte voor Q3 nog deze week sturen? We willen graag een vooruitblik geven aan ons team.',
    body_text: 'Hoi Ramon,\n\nKun je de offerte voor Q3 nog deze week sturen? We willen graag een vooruitblik geven aan ons team.\n\nGroet, Mike',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc001',
    thread_id: 'thread-001', status: 'open', priority: 'high',
    received_at: minutesAgo(25),
  },
  {
    id: 'm2', external_id: 'gmail-abc002', channel_id: 'gmail-2', contact_id: 'c4',
    subject: 'Update Kyano Horaizon roadmap',
    snippet: 'Hi Ramon, ik heb de roadmap voor Q3/Q4 bijgewerkt. Wil je even meekijken voor we hem delen met het team?',
    body_text: 'Hi Ramon,\n\nIk heb de roadmap voor Q3/Q4 bijgewerkt. Wil je even meekijken voor we hem delen met het team?\n\nLink: notion.so/kyano/roadmap-q3q4\n\nLisa',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc002',
    thread_id: 'thread-002', status: 'open', priority: 'high',
    received_at: hoursAgo(1),
  },
  {
    id: 'm3', external_id: 'wa-msg-001', channel_id: 'wa-2', contact_id: 'c3',
    subject: null,
    snippet: 'Hey Ramon, heb je 10 min vandaag? Wil even sparren over de Digital Agency X integratie.',
    body_text: 'Hey Ramon, heb je 10 min vandaag? Wil even sparren over de Digital Agency X integratie.',
    deep_link: 'https://wa.me/31698765432',
    thread_id: 'wa-thread-003', status: 'open', priority: 'medium',
    received_at: hoursAgo(2),
  },
  {
    id: 'm4', external_id: 'gmail-abc003', channel_id: 'gmail-1', contact_id: 'c5',
    subject: 'Re: Vraag over levering FitAid 24-pack',
    snippet: 'Bedankt voor de snelle reactie. Eén vraag: kunnen jullie ook leveren in week 28?',
    body_text: 'Bedankt voor de snelle reactie. Eén vraag: kunnen jullie ook leveren in week 28?\n\nMet vriendelijke groet,\nThomas van Dijk',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc003',
    thread_id: 'thread-004', status: 'open', priority: 'medium',
    received_at: hoursAgo(4),
  },
  {
    id: 'm5', external_id: 'gmail-abc004', channel_id: 'gmail-3', contact_id: null,
    subject: 'Nieuwe inquiry vanuit Duitsland - DACH region',
    snippet: 'Sehr geehrter Herr Brugman, wir interessieren uns für eine Großbestellung FitAid. Können Sie uns Konditionen senden?',
    body_text: 'Sehr geehrter Herr Brugman,\n\nwir interessieren uns für eine Großbestellung FitAid (5000+ Einheiten). Können Sie uns Konditionen senden?\n\nMit freundlichen Grüßen,\nKlaus Müller\nFitness Distribution GmbH',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc004',
    thread_id: 'thread-005', status: 'open', priority: 'high',
    received_at: hoursAgo(6),
  },
  {
    id: 'm6', external_id: 'gmail-abc005', channel_id: 'gmail-2', contact_id: 'c2',
    subject: 'Contract review - SaaS agreement',
    snippet: 'Ramon, ik heb het SaaS contract doorgenomen. Twee punten waar we even naar moeten kijken voor we tekenen.',
    body_text: 'Ramon,\n\nIk heb het SaaS contract doorgenomen. Twee punten waar we even naar moeten kijken voor we tekenen:\n\n1. Clausule 4.2 over data retention\n2. SLA in bijlage A\n\nKun je deze week bellen?\n\nSophie',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc005',
    thread_id: 'thread-006', status: 'open', priority: 'medium',
    received_at: hoursAgo(8),
  },
  {
    id: 'm7', external_id: 'wa-msg-002', channel_id: 'wa-1', contact_id: 'c6',
    subject: null,
    snippet: 'Hé Ramon! Lange tijd niet gesproken. Heb je zin om vrijdag te lunchen?',
    body_text: 'Hé Ramon! Lange tijd niet gesproken. Heb je zin om vrijdag te lunchen? Ik ben in Amsterdam.',
    deep_link: 'https://wa.me/31699887766',
    thread_id: 'wa-thread-007', status: 'open', priority: 'low',
    received_at: hoursAgo(12),
  },

  // === SNOOZED (3) ===
  {
    id: 'm8', external_id: 'gmail-abc006', channel_id: 'gmail-4', contact_id: null,
    subject: 'Belasting aangifte 2025 - documenten gevraagd',
    snippet: 'Beste Ramon, voor de aangifte hebben we nog wat documenten nodig. Zie bijlage voor de checklist.',
    body_text: 'Beste Ramon,\n\nVoor de aangifte hebben we nog wat documenten nodig. Zie bijlage voor de checklist.\n\nGroet,\nAccountant Pieters',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc006',
    thread_id: 'thread-008', status: 'snoozed', priority: 'low',
    snoozed_until: inHours(48),
    received_at: daysAgo(1),
  },
  {
    id: 'm9', external_id: 'gmail-abc007', channel_id: 'gmail-2', contact_id: 'c3',
    subject: 'Re: Partnership voorstel Kyano x DAX',
    snippet: 'Ik denk er nog over na. Stuur ik je voor het einde van de week een reactie.',
    body_text: 'Ik denk er nog over na. Stuur ik je voor het einde van de week een reactie.\n\nGroet,\nJan',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc007',
    thread_id: 'thread-009', status: 'snoozed', priority: 'medium',
    snoozed_until: inHours(72),
    received_at: daysAgo(2),
  },
  {
    id: 'm10', external_id: 'wa-msg-003', channel_id: 'wa-2', contact_id: 'c1',
    subject: null,
    snippet: 'Update over de FitAid sample shipment volgt deze week.',
    body_text: 'Update over de FitAid sample shipment volgt deze week. Ik hou je op de hoogte!',
    deep_link: 'https://wa.me/31612345678',
    thread_id: 'wa-thread-010', status: 'snoozed', priority: 'medium',
    snoozed_until: inHours(24),
    received_at: daysAgo(1),
  },

  // === DONE (2) ===
  {
    id: 'm11', external_id: 'gmail-abc008', channel_id: 'gmail-1', contact_id: 'c5',
    subject: 'Bevestiging order #4421',
    snippet: 'Bedankt voor je order. Levering staat ingepland voor maandag.',
    body_text: 'Bedankt voor je order. Levering staat ingepland voor maandag.',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc008',
    thread_id: 'thread-011', status: 'done', priority: 'low',
    done_at: hoursAgo(3), done_category: 'replied',
    done_note: 'Bevestigd via reply + telefonisch contact gehad.',
    received_at: daysAgo(2),
  },
  {
    id: 'm12', external_id: 'gmail-abc009', channel_id: 'gmail-2', contact_id: 'c6',
    subject: 'Workshop sessie afgerond',
    snippet: 'Super sessie vandaag! Notes komen morgen jouw kant op.',
    body_text: 'Super sessie vandaag! Notes komen morgen jouw kant op.',
    deep_link: 'https://mail.google.com/mail/u/0/#inbox/gmail-abc009',
    thread_id: 'thread-012', status: 'done', priority: 'low',
    done_at: hoursAgo(20), done_category: 'replied',
    done_note: 'Reactie gestuurd, follow-up niet nodig.',
    received_at: daysAgo(1),
  },
];

export function seed() {
  const existingChannels = db.prepare('SELECT COUNT(*) AS n FROM channels').get().n;
  if (existingChannels > 0) {
    console.log(`📦 Database al gevuld (${existingChannels} channels). Skipping seed.`);
    return;
  }

  const insertChannel = db.prepare(`
    INSERT INTO channels (id, type, label, account_email, is_active)
    VALUES (@id, @type, @label, @account_email, 1)
  `);

  const insertContact = db.prepare(`
    INSERT INTO contacts (id, name, company, email, phone, birthday, avatar_initials, avatar_color)
    VALUES (@id, @name, @company, @email, @phone, @birthday, @avatar_initials, @avatar_color)
  `);

  const insertMessage = db.prepare(`
    INSERT INTO messages (
      id, external_id, channel_id, contact_id, direction, subject, snippet, body_text,
      deep_link, thread_id, status, priority, snoozed_until, done_at, done_note, done_category, received_at
    ) VALUES (
      @id, @external_id, @channel_id, @contact_id, 'inbound', @subject, @snippet, @body_text,
      @deep_link, @thread_id, @status, @priority, @snoozed_until, @done_at, @done_note, @done_category, @received_at
    )
  `);

  const insertSyncState = db.prepare(`
    INSERT OR IGNORE INTO sync_state (channel_id) VALUES (?)
  `);

  const tx = db.transaction(() => {
    for (const c of channels) insertChannel.run(c);
    for (const p of contacts) insertContact.run(p);
    for (const m of messages) {
      insertMessage.run({
        snoozed_until: null, done_at: null, done_note: null, done_category: null,
        subject: null, body_text: null, contact_id: null,
        ...m,
      });
    }
    for (const c of channels) insertSyncState.run(c.id);
  });

  tx();
  console.log(`✅ Seeded: ${channels.length} channels, ${contacts.length} contacts, ${messages.length} messages.`);
}
