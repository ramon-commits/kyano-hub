# Logboek — Kyano Communication Hub

Logboek van alle bouwsessies. Per stap: wat is gebouwd, wat getest, welke bugs gefixt.

---

## Stap 1 — Project setup + SQLite + Express + Vite skeleton

**Datum:** 2026-05-12
**Status:** ✅ Voltooid

### Gebouwd

**Root**
- `package.json` met `concurrently` voor `npm run dev` (server + client tegelijk)
- `.env` met echte credentials (Google OAuth, Anthropic, encryption key)
- `.env.example` als template
- `.gitignore` (node_modules, .env, data/*.db, dist/)
- `README.md` met setup-instructies

**Server (`/server`, Node 25 + ESM, Express op :3001)**
- `package.json` met dependencies: `express`, `better-sqlite3`, `googleapis`, `cors`, `dotenv`, `node-cron`, `uuid`, `dompurify`, `jsdom`
- `db/schema.sql` — 18 tabellen + FTS5 virtual table + triggers + indexen
  - Kernschema: `channels`, `contacts`, `messages`, `oauth_tokens`, `events`
  - AI-laag: `interaction_logs`, `style_profiles`, `message_corrections`, `ai_replies`
  - Projecten: `projects`, `message_projects`, `contact_projects`
  - Samenvattingen: `contact_summaries`, `project_summaries`
  - Sync: `sync_state`, `nudge_settings`
  - FTS5 voor zoeken in logboek
- `db/init.js` — better-sqlite3 setup met WAL mode + foreign keys aan
- `db/seed.js` — 6 channels (4 Gmail + 2 WhatsApp), 6 demo contacten (Nederlandse namen + bedrijven), 12 demo berichten (7 open, 3 snoozed, 2 done) met realistische snippets in NL/DU
- `index.js` — Express boot: CORS, JSON body 10mb, mount all `/api/*` routes, `/auth` callback router, serve `/client/dist` als die bestaat, health check
- Routes:
  - `messages.js` — filter (status, channel_type, contact, priority, search), JOINs met contacts + channels, snooze/done/reopen/priority, bulk snooze/done, soft delete (archived), interaction log
  - `contacts.js` — list (search/sort/filter), CRUD, birthdays met days_until berekening, nudges met days_since_last, merge, import
  - `channels.js` — lijst met open_count + last_sync + is_connected
  - `stats.js` — open_count, snoozed_count, done_today, urgent_count, birthdays_week, nudges_count
  - `auth.js` — Gmail OAuth start, status, disconnect; callback router op `/auth/gmail/callback` met success-page redirect naar 5173
  - `calendar.js` — placeholder events lijst (returns []) en create (501)
  - `sync.js` — placeholder per kanaal en `/all`, schrijft naar `sync_state`
  - `ai.js` — alle endpoints 501 (komt in stap 11)
- Services:
  - `gmail-oauth.js` — OAuth2 client + token management (auto-refresh via `tokens` event)
  - `gmail-sync.js`, `unipile.js`, `calendar.js`, `claude-ai.js` — placeholders voor latere stappen
  - `contact-matcher.js` — match op email → phone → domain hint → nieuw contact; `mergeContacts` migreert messages/logs/projects
  - `snooze-cron.js` — `node-cron` elke minuut, `datetime(snoozed_until) <= datetime('now')`
- Middleware: `error-handler.js` centralized error JSON

**Client (`/client`, React 18 + Vite 5 + Tailwind 4 + react-query 5)**
- `package.json` met `@tailwindcss/vite` plugin (Tailwind v4 CSS-first approach)
- `vite.config.js` — proxy `/api` en `/auth` naar :3001
- `index.html` — Inter font via rsms.me
- `src/main.jsx` — React root + `QueryClientProvider`
- `src/index.css` — Tailwind v4 `@import` + `@theme` met alle Endless Minds design tokens
- `src/App.jsx` — sidebar layout, view switcher (placeholder views), HealthBadge die `/api/health` polled
- `src/components/layout/Sidebar.jsx` — logo + 11 nav items met badges uit `useStats`, kanaal-overzicht met status dots, user info
- `src/components/views/PlaceholderView.jsx` — "Komt in stap N" placeholder
- `src/lib/api.js` — fetch wrapper (GET/POST/PATCH/DELETE)
- `src/hooks/`: `useMessages`, `useContacts`, `useChannels`, `useStats`, `useHealth`

### Getest

- ✅ `npm install` slaagt voor root, server, client (geen vulns die actie vereisen)
- ✅ `npm run build` (client) produceert `dist/` (188 kB JS gzipped 59 kB)
- ✅ Server start: `🚀 Kyano Comm Hub draait op http://localhost:3001`
- ✅ Vite dev server start op :5173
- ✅ `/api/health` → `{status: ok, channels: 6, messages: 12, contacts: 6}`
- ✅ `/api/messages?status=open` → 7 berichten met JOIN data (contact_name, channel_label)
- ✅ `/api/messages?status=snoozed` → 3 berichten
- ✅ `/api/stats` → correcte counts (open=7, snoozed=3, urgent=3, done_today=1)
- ✅ `/api/contacts/birthdays?within_days=365` → 6 contacten met days_until + next_birthday
- ✅ `/api/auth/status` → 4 email accounts, allemaal `is_connected: false`
- ✅ `/api/auth/gmail/connect/gmail-1` → returnt Google OAuth URL
- ✅ Snooze flow: PATCH m1 met `snoozed_until` in verleden → cron op volgende minuut zet status terug naar 'open'
- ✅ Done flow: PATCH m11 reopen → done met note+category → interaction_log row aangemaakt
- ✅ Bulk endpoints: validation (400 zonder ids), graceful error response
- ✅ Search: `?search=FitAid` matched 4 berichten via LIKE op snippet/subject/contact naam
- ✅ AI placeholder endpoints geven 501 met code `NOT_IMPLEMENTED`
- ✅ Sync placeholder schrijft `last_sync_at` naar sync_state
- ✅ Vite proxy: `localhost:5173/api/health` → 200 OK via server :3001
- ✅ Client UI: sidebar rendert met badges uit `useStats`, kanaal-dots tonen status, HealthBadge toont "Connected ✅"

### Bugs gevonden & gefixt

1. **WhatsApp channels in seed misten `account_email`** → SQL named param error bij insert. Fix: expliciet `account_email: null` toegevoegd voor wa-1 en wa-2.
2. **Snooze cron textcompare faalde** door format-mismatch tussen SQLite's `datetime('now')` (`YYYY-MM-DD HH:MM:SS`) en stored ISO format met `T`/`Z`. Lexicografisch is `'T' > ' '` waardoor `snoozed_until > now` ten onrechte true gaf. Fix: wrap `datetime(snoozed_until) <= datetime('now')` zodat SQLite beide naar dezelfde representatie parsed.

### Niet gedaan (bewust)

- **sqlcipher**: niet beschikbaar standaard in better-sqlite3. Spec staat "anders better-sqlite3 standaard" toe. Encryption komt later via app-level encryptie (`ENCRYPTION_KEY` staat klaar in `.env`).
- **Gmail/WhatsApp daadwerkelijke sync**: placeholders, komt in stap 3 (Gmail) en stap 9 (Unipile).
- **AI endpoints**: 501. Komt in stap 11.
- **Calendar create**: 501. Komt in stap 8.

### Volgende stap

Stap 2: Inbox-UI met message-lijst, message detail panel, quick actions (snooze/done/reopen) gebonden aan de `useMessages` hooks die al bestaan.

---

## Stap 2 — Volledige UI (inbox, conversation, snooze/done, contacts, logboek, etc.)

**Datum:** 2026-05-12
**Status:** ✅ Voltooid

### Gebouwd

**Foundation**
- `lib/utils.js` — `cn`, `debounce`, `timeAgo`, `formatDate`/`formatTime`/`formatDateTime`, `parseDateSafe` (SQLite datetime -> JS Date), `getDaysUntilBirthday`, `getDaysSinceContact`, `groupByDate` (vandaag/gisteren/deze_week/eerder), `tomorrowAt9` / `daysFromNowAt9` / `nextMondayAt9`, date input helpers
- `lib/constants.js` — `CHANNEL_COLORS`, `PRIORITY_COLORS`, `STATUS_COLORS`, `SNOOZE_OPTIONS`, `DONE_CATEGORIES`, `NAV_ITEMS` (met keyboard shortcut keys)
- `shared/Avatar.jsx` — 5 sizes, dynamic background color
- `shared/Badge.jsx`, `shared/ChannelBadge.jsx`, `shared/PriorityBadge.jsx`, `shared/EmptyState.jsx`, `shared/LoadingSpinner.jsx`, `shared/Toast.jsx` (container met dismiss + auto-timeout)
- `hooks/useToast.jsx` — Context-based toast met `success/error/info/warning` helpers, max 3 stacked, 3s auto-dismiss
- `hooks/useKeyboard.js` — Generic keymap handler, skipt inputs (behalve Escape)

**Modals**
- `Modal.jsx` — Generic modal wrapper met backdrop blur, Escape-to-close, body scroll lock, fade-in animatie
- `SnoozeModal.jsx` — 5 quick options (morgen 9u, overmorgen, +3d, volgende week, +30d) + "Tot ze reageren" (waiting) + custom datetime picker
- `DoneModal.jsx` — 6 categorie chips + optional note textarea + autofocus
- `ScheduleModal.jsx` — Titel (auto-prefill met contact naam), datum, tijd, duur (15/30/45/60min), calendar dropdown
- `ConfirmModal.jsx` — Generic confirm/cancel met primary/danger variants

**Inbox + Conversation**
- `InboxView.jsx` — Header met 4 metric cards (Open/Snoozed/Vandaag/Urgent), filter chips (Alle/Email/WhatsApp) + debounced search, message list met empty state
- `MessageRow.jsx` — Avatar + naam + ChannelBadge + PriorityBadge + subject + snippet + timeAgo, quick action knoppen verschijnen on hover, optionele wake-up/done info
- `MessageFilters.jsx` — Channel filter pills + zoekbalk met debounce + extra slot
- `ConversationView.jsx` — Header met back-knop + contact info + subject, switch tussen EmailThread en ChatThread, ReplyComposer + ThreadStatusBar onderaan
- `EmailThread.jsx` — Inklapbare email items, DOMPurify sanitization van body_html, fallback naar body_text/snippet als plain text
- `ChatThread.jsx` — Inbound bubbels links/grijs, auto-scroll naar onderaan, datum-divider
- `ReplyComposer.jsx` — Textarea + Verstuur/Kopieer/AI knoppen, "Van" account dropdown voor email, CC/BCC toggle
- `ThreadStatusBar.jsx` — Snooze/Afgehandeld/Plan/Urgent toggle/Archiveer knoppen

**Snoozed + Logboek**
- `SnoozedView.jsx` — Toont snoozed + waiting (gesorteerd op snoozed_until oplopend), per rij wake-up datum + reopen actie
- `LogboekView.jsx` — Filters + zoek + categorie chips, gegroepeerd op Vandaag/Gisteren/Deze week/Eerder, done info badge per rij

**Contacten**
- `ContactenView.jsx` — Grid met zoek (debounced 300ms) + sorteer (naam/laatst gesproken/meeste berichten) + filter (open/14d stil), 3-koloms grid van kaarten
- `ContactDetail.jsx` — Slide-in panel rechts (420px), avatar header + edit knop, action buttons (Afspraak/Mail/WA), info cards (laatste contact, verjaardag), contact info rows, conversatie historie scrollable
- `ContactEditModal.jsx` — Form voor naam/bedrijf/email/telefoon/verjaardag/tags/notities met optimistic update via `useUpdateContact`

**Verjaardagen, Nudges, Calendar, Projects, Settings**
- `VerjaardagenView.jsx` — Lijst gesorteerd op days_until, dynamic labels (VANDAAG! / Morgen / Over Xd), quick actions per rij
- `NudgesView.jsx` — Threshold toggle (iedereen/7d/14d/21d), severity colors per dagentelling, quick actions
- `CalendarView.jsx` — Week-grid (8-18u, 7 dagen), highlighted today column, info banner "stap 8"
- `ProjectenView.jsx` — Kanban placeholder (Active/Paused/Done columns)
- `InstellingenView.jsx` — Tabs (Kanalen/Stijl/Account), Account info display
- `ChannelsSettings.jsx` — Per kanaal status badge, Verbinden knop opent OAuth flow in nieuw venster, Sync nu mutation, Ontkoppel via DELETE

**App & layout**
- `App.jsx` — View routing op `view` state + dispatch naar 11 views, modal state management (snooze/done/schedule), keyboard shortcuts (1-9 view switch, Escape sluit overlay), ConversationView vervangt main area, ContactDetail slide-in vanaf rechts
- `Sidebar.jsx` — Update: gebruikt `NAV_ITEMS` constant, shortcut hints in title, channel-dots tonen connected state
- `main.jsx` — `QueryClientProvider` + `ToastProvider` wrappers, staleTime 30s, refetchOnWindowFocus true

**Server fixes**
- `PATCH /api/messages/:id/waiting` — Nieuwe route voor "Tot ze reageren" status
- `/api/contacts/nudges?min_days=N` — Override per-contact threshold zodat demo data zichtbaar is met threshold 0
- `/api/messages` search — Verbreed naar `done_note` en `body_text` zodat Logboek-zoek op afhandel-notities werkt

### Getest

- ✅ `npm run build` → 120 modules transformed, 283 kB JS (gzip 86 kB), geen errors
- ✅ Snooze flow: PATCH /api/messages/m2/snooze → snoozed_until → verschijnt in snoozed list → reopen → status=open
- ✅ Done flow: PATCH /api/messages/m11/done met note+category → search "telefonisch" matched
- ✅ Waiting flow: PATCH /api/messages/m7/waiting → status=waiting, reopen → status=open
- ✅ Nudges threshold: `?min_days=0` → 6 contacten, `?min_days=14` → 0 (correct met demo data)
- ✅ Contact edit: PATCH /api/contacts/c1 met company+tags → persistent na re-fetch
- ✅ Vite proxy: GET via :5173 (later 5174) → API call lukt
- ✅ Alle imports resolve (build is canonical check)

### Bugs gevonden & gefixt

1. **Stap 1 server bleef hangen na `kill`** met `node --watch` → moest expliciet PIDs killen. Geen code-fix nodig, alleen process hygiene voor toekomstige sessies.
2. **Logboek search miste done_note** → /api/messages LIKE query verbreed van (snippet, subject, contact.name) naar ook (done_note, body_text). Hiermee werkt zoeken op afhandel-notities én body tekst.
3. **Nudges count was 0 met demo data** (alle contacten hebben recent activiteit) → server endpoint `?min_days=N` override toegevoegd, frontend defaultet naar 0 zodat de view in de demo iets toont; threshold toggle (0/7/14/21) maakt het echte gedrag testbaar.
4. **Snooze modal "Tot ze reageren"** had geen server endpoint → `PATCH /api/messages/:id/waiting` toegevoegd, hook `useWaitingMessage` toegevoegd.

### Niet gedaan (bewust)

- **j/k navigatie in lijsten** — vereist gedeelde "active row" state per view; complex en niet kritiek voor stap 2. Keyboard 1-9 + Escape wel geïmplementeerd.
- **`/` focus zoekbalk** — vereist refs per view; later.
- **Bulk select-mode in inbox** — geen UI nodig zolang er ~7 berichten zijn; API bulk endpoints werken al sinds stap 1.
- **AI varianten / verzenden / Calendar create** — placeholder toasts; komt in stap 3/8/11.

### Volgende stap

Stap 3: Echte Gmail synchronisatie. Token gebruiken (al verbonden via OAuth), Gmail API History + Messages list ophalen, sanitizen, opslaan in `messages` table met contact_matcher.
