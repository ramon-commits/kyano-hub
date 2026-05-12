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

---

## Stap 3 — Gmail Live: OAuth + encryptie + sync + lezen + versturen

**Datum:** 2026-05-12
**Status:** ✅ Code af, klaar voor user OAuth + live test

### Boardroom-fixes (eerst)

**FIX 1 — AES-256-GCM encryptie van OAuth tokens**
- Nieuwe `services/encryption.js` met `encrypt(text) → JSON({encrypted,iv,tag})` en `decrypt(payload)` op `aes-256-gcm`
- 32-byte key gelezen uit `process.env.ENCRYPTION_KEY` (32 hex bytes); auto-generated en in .env weggeschreven als ontbrekend
- `gmail-oauth.handleCallback`: access + refresh tokens worden encrypted opgeslagen
- `gmail-oauth.getClient`: decrypt voor gebruik; auto-refresh listener encrypt nieuwe tokens
- Backwards-compatible: oude plaintext tokens (van vóór encryptie) worden alsnog gelezen via fallback

**FIX 2 — DOMPurify hardening in EmailThread**
- `DOMPurify.addHook('afterSanitizeAttributes')` forceert `target="_blank" rel="noopener noreferrer"` op alle `<a>` tags
- `FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form']`
- `FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']`
- Defensive: post-render `useEffect` re-applyt target/rel
- `.email-body` CSS: max-width images, blockquotes, link color, table containment

**FIX 3 — Nette OAuth callback error pagina's**
- `renderPage()` helper rendert Endless Minds-styled HTML cards
- Specifieke meldingen: `access_denied`, `invalid_request`, `invalid_grant` (Code verlopen), `already.*connected`, generieke fallback
- "Probeer opnieuw" knop → `/api/auth/gmail/connect/:channelId` + "Naar dashboard" link
- Auto-redirect na 5 seconden naar `localhost:5173`
- Connect-route doet 302 redirect ipv JSON (behalve voor `Accept: application/json`)

### Server: Gmail integratie

**`services/gmail-sync.js`** — kern van de stap
- Initial sync (eerste keer, geen historyId): `messages.list` (max 100) + `messages.get full` per bericht
- Incremental sync: `history.list` sinds opgeslagen `historyId`, filter op `messagesAdded`, `labelAdded`, `labelRemoved`
- Fallback bij 404/expired history → terug naar initial sync
- Body extractie: recursieve `findPart(parts, mimeType)` voor text/html + text/plain, base64url decode, 500KB cap met "afgekapt" marker
- Header parsing: `From/To/Subject/Message-ID/In-Reply-To`, RFC 2822 address parser
- Direction: vergelijk `from.email` met `channel.account_email` → `outbound` krijgt status `archived`
- Contact matching: voor inbound de afzender; voor outbound de eerste ontvanger; via `contact-matcher.matchContact`
- Deep-links: `https://mail.google.com/mail/u/{idx}/#inbox/{messageId}`, idx uit `channels.config_json.gmail_account_index` of `DEFAULT_INDEX`
- Dedup via nieuwe unique index `idx_messages_external_per_channel (channel_id, external_id) WHERE external_id IS NOT NULL`
- Bestaande berichten: update body/snippet/subject/thread (geen overschrijven van status/priority)
- **Auto-wake**: bij nieuw inbound bericht — alle snoozed/waiting berichten van dezelfde `contact_id` → status `open`, snoozed_until null, log "⚡ Woke N snoozed/waiting message(s)…"
- `syncAll()` itereert sequentieel over connected channels, 401/invalid_grant detectie

**`services/gmail-send.js`** — sendReply / sendNew / createDraft
- RFC 2822 builder: `Date/From/To/Cc/Bcc/Subject/MIME-Version/In-Reply-To/References` headers
- Subject met `Re:` prefix bij replies (idempotent)
- multipart/alternative met text/plain + text/html parts
- UTF-8 subject via RFC 2047 encoded-word voor non-ASCII (Sehr geehrte etc)
- base64url encode → `users.messages.send` met optionele `threadId` voor threading
- `getAccountFrom(client)` haalt `userinfo.get()` voor echte From naam+email

**`services/gmail-poller.js`** — node-cron `*/2 * * * *`
- Sequentieel per connected channel (rate-limit safe)
- `isRunning` lock voorkomt overlap als sync >2 min duurt
- POLL_STATE map per channel: `has_error / error_message / last_run_at`
- 401/invalid_grant → markeert "Herconnectie nodig"
- Initial trigger na 5s (zodat eerste run direct start na boot)

**`services/purge-cron.js`** — `0 3 * * *`
- `body_html = NULL, body_text = NULL WHERE datetime(received_at) < datetime('now', '-90 days')`
- Metadata (subject/snippet/contact/datum) blijft
- Log changes count

### Server: routes uitgebreid

- `GET /api/messages/:id/thread` — alle berichten met dezelfde `thread_id` lokaal uit DB (geen Gmail API call)
- `POST /api/messages/:id/reply` — via `gmail-send.sendReply` + INSERT outbound + interaction_log "replied" + return `from email`
- `POST /api/messages/compose` — `gmail-send.sendNew` + contact match + INSERT outbound
- `POST /api/sync/:channelId` — echte sync via `syncChannel`, 400 voor "not connected", 401 voor expired, 500 anders; alle met `needs_reconnect` flag
- `POST /api/sync/all` — echt + return per-channel results (route-volgorde fix: `/all` vóór `/:channelId` om collision te voorkomen)
- `GET /api/sync/status` — verrijkt met poller state (`has_error`, `error_message`, `poller_last_run_at`)
- `GET /api/auth/status` — verrijkt: `last_sync_at`, `has_history`, `message_count`, `open_count`, `has_error`, `error_message`
- `GET /api/auth/gmail/connect/:channelId` — 302 REDIRECT naar Google (Accept: application/json → blijft JSON)
- `GET /api/channels` — `has_error`, `error_message`, `poller_last_run_at` per kanaal

### Server: bootstrap

- `server/env.js` — laadt `.env` uit project-root (één niveau boven `/server`), geïmporteerd vóór alle andere modules zodat `process.env.ENCRYPTION_KEY` beschikbaar is wanneer `encryption.js` evalueert
- `index.js`: `startGmailPoller()` + `startPurgeCron()` toegevoegd

### Frontend updates

- `hooks/useMessages.js`: `useThread(messageId)`, `useReplyMessage()`, `useSyncAll()`, `useSyncChannel()`
- `ConversationView.jsx`: fetcht `/messages/:id/thread`, geeft alle berichten door aan `EmailThread`, eigen `handleSend` met loading + 401 detectie + toast
- `EmailThread.jsx`: rendert array van berichten, nieuwste expanded, outbound met blauwe rand + "verzonden" badge; DOMPurify hardened
- `ReplyComposer.jsx`: echte send via `useReplyMessage`, spinner tijdens verzending, ⌘/Ctrl+Enter shortcut, "Van" toont kanaal-account, CC/BCC velden meegestuurd
- `ChannelsSettings.jsx`: `connect()` opent OAuth in popup (server doet 302), polled na 3s, `doSync` toast met inserted count, "Herconnectie nodig" badge + amber knop bij `has_error`, ConfirmModal voor ontkoppelen
- `Sidebar.jsx`: kanaal-dots tonen realtime status (groen=verbonden/ok, amber=error, rood=niet verbonden), title attribute met error_message
- `InboxView.jsx`: "🔄 Nieuwe check" knop rechtsboven, spinning icon tijdens sync, toast met aantal nieuwe berichten + error count

### Schema migration

Toegevoegd aan `schema.sql`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_per_channel
  ON messages(channel_id, external_id)
  WHERE external_id IS NOT NULL;
```

### Getest

- ✅ `npm run build` → 121 modules, 289 kB JS (gzip 88 kB), geen errors
- ✅ Encryption round-trip: `encrypt(token) → JSON → decrypt → match`
- ✅ Plaintext fallback: legacy unencrypted tokens worden alsnog gelezen
- ✅ Server startup: encryption key auto-gegenereerd bij ontbreken, daarna stabiel
- ✅ `/auth/gmail/callback` zonder code → nette "Onvolledige callback" pagina
- ✅ `/auth/gmail/callback?error=access_denied` → "Geen toegang gegeven"
- ✅ `/auth/gmail/callback?code=fake` → "Code verlopen" (invalid_grant)
- ✅ `/api/auth/gmail/connect/gmail-1` → 302 naar Google consent URL
- ✅ `/api/sync/gmail-1` (not connected) → 400 + needs_reconnect:true
- ✅ `/api/sync/all` (geen connected accounts) → 200 met `accounts_synced:0`
- ✅ `/api/sync/wa-1` → placeholder met "stap 9" message
- ✅ `/api/messages/m1/thread` → bevat alle berichten met dezelfde thread_id
- ✅ `/api/messages/m1/reply` zonder body → 400, met body maar geen OAuth → 500 met juiste error
- ✅ Gmail poller log: "📧 Poll skipped — no connected email channels" wanneer geen tokens
- ✅ Snooze cron en purge cron starten op boot

### Bugs gevonden & gefixt

1. **dotenv las `.env` uit cwd (`/server`) ipv project-root** — encryption.js triggerde "ENCRYPTION_KEY ontbrak" zelfs als de key in .env stond. Fix: `server/env.js` met expliciete `path: resolve(__dirname, '../.env')` als eerste import in `index.js`.
2. **Route order in `sync.js`** — `/:channelId` matchte `/all` voordat de specifieke `/all` route was geregistreerd. Fix: `/all` vóór `/:channelId` plaatsen.
3. **Multipart route flow voor sync**: niet-email kanalen kwamen vroeger via dezelfde route. Fix: type-check binnen `/:channelId` met placeholder respons voor `wa-*`.

### Niet getest (live OAuth nodig)

De checklist items die echte Google consent vereisen kunnen niet programmatisch worden gevalideerd:
- Klik "Verbinden" → consent screen → callback flow
- Initiële sync 100 berichten
- Poller iteratie met nieuwe inkomende mail
- Auto-wake snoozed bericht door real inbound reply
- Echte reply via Gmail API → komt aan bij ontvanger in juiste thread

Deze flows zijn klaar voor Ramon om handmatig te testen via Instellingen → Kanalen → Verbinden.

### Veiligheid

- Tokens encrypted at rest met AES-256-GCM (auth tag voorkomt tampering)
- DOMPurify met afterSanitizeAttributes hook + FORBID_TAGS/ATTR (geen XSS via email body)
- OAuth redirect URI hard-coded op `localhost:3001`
- Refresh tokens worden niet gelogd; access tokens niet in logs

### Volgende stap

Stap 4: Productie hardening — token rotation alerts, OAuth scope minimalisatie audit, structured logging, error tracking. Of stap 5: AI-assisted replies (Claude integratie).

---

## Stap 4 t/m 10 — v1.0 COMPLEET

**Datum:** 2026-05-13
**Status:** ✅ Code af, build groen, live API endpoints geverifieerd

### Stap 4 — Contacts polish + merge UI
- `ContactEditModal`: "Geavanceerd: samenvoegen" disclosure met zoek + select + POST /contacts/merge
- Merge UI invalideert messages + contacts queries → UI refresht

### Stap 5 — Snooze grouping + change-date
- `SnoozedView` groepeert op Vandaag / Morgen / Deze week / Later / Wacht op reactie
- `onSnooze` prop op MessageRow in snoozed view → "verander datum" heropent SnoozeModal

### Stap 6 — FTS5 + CSV export
- `db/init.js`: FTS5 rebuild guard — rebuild als messages_fts leeg is maar messages-tabel niet (eerste boot na trigger-toevoeging)
- `/api/messages?status=done&search=` gebruikt FTS5 MATCH met geescapede prefix-query (`"woord"*`)
- Niet-done queries blijven LIKE (sneller voor kleine open inbox)
- `server/routes/export.js`: `GET /api/export/logboek?from=&to=&contact_id=&channel_type=&format=csv|json` — UTF-8 BOM voor Excel
- LogboekView heeft "📥 Exporteer CSV" knop (download via `<a download>`)

### Stap 7 — Daily summary + nudge mute + felicitatie
- `GET /api/stats/daily-summary`: open_count, urgent_count, snoozed_waking_today, done_yesterday, birthdays_today, birthdays_week, nudges_top3
- `PATCH /api/contacts/:id/nudge-settings`: remind_after_days + is_active upsert
- `DailySummaryCard` component: gradient banner met greeting + chips per categorie, dismissable per dag via localStorage `kyano:dailySummaryDismissed`
- `useUpdateNudgeSettings()` hook
- NudgesView krijgt "🔇 Mute" knop per contact (zet `is_active=false`)
- Live test: daily-summary returned correcte counts (open=1053, nudges_top3=3, etc.)

### Stap 8 — Google Calendar
- `services/calendar.js` herschreven: `gmailFor` hergebruikt OAuth clients van Gmail, `listEvents(channelId, timeMin, timeMax)`, `listAllEvents` over alle connected accounts, `createEvent` met attendees + sendUpdates
- `routes/calendar.js`: GET /events, GET /today, POST /events (met duration_minutes fallback)
- `useCalendarEvents(from, to)` + `useCalendarToday` + `useCreateEvent` hooks, 5min staleTime
- `CalendarView`: day-list per week (eenvoudiger dan grid, nog steeds week-overzicht), kleuren per kanaal (blauw/groen/oranje/paars), prev/today/next navigatie, "+ Nieuw event" knop
- `ScheduleModal`: nu echt — POST naar /api/calendar/events, Calendar account dropdown filtert connected accounts, attendee_email + location + description velden
- `TodayWidget` component in InboxView: compacte lijst van vandaag's events met klik-naar-Google-Calendar links

### Stap 9 — Unipile (WhatsApp + LinkedIn + Instagram LIVE)
- `db/schema.sql`: nieuwe tabellen `app_config` (key/value voor runtime config) en `sender_rules`
- `db/seed.js`: nieuwe channels `li-1` (LinkedIn) en `ig-1` (Instagram) — idempotent INSERT OR IGNORE
- `services/app-config.js`: get/set/getUnipileCreds (DB > env fallback)
- `services/unipile.js`: REST client met fetch, X-API-KEY auth, methodes `listAccounts/listChats/getChatMessages/sendMessage/startNewChat/getAccountMe/isConfigured/deepLinkFor/unipileTypeToChannel`
- `services/unipile-sync.js`: `autoMapAccounts` koppelt Unipile account → lokaal channel (eerste WA → wa-1, etc.), `persistUnipileMessage` met direction detectie + auto-wake + thread_id=chat_id, `syncUnipileAccount` + `syncAllUnipile`
- `services/poller.js` (hernoemd van gmail-poller.js): unified poller voor Gmail + Unipile, locking via `isRunning`, per-channel POLL_STATE, broadcast SSE event na elke run met N nieuwe berichten
- Reply route `/api/messages/:id/reply` ondersteunt nu non-email channels via `unipile.sendMessage(thread_id, text)`, met deep-link fallback bij failures
- `/api/sync/unipile` route + `/api/sync/:channelId` herkent Unipile channels (gebruikt unipile_account_id uit config_json)
- `routes/settings.js`: `/api/settings/unipile` GET (status) + POST (validate by calling listAccounts, save in app_config) + DELETE
- `routes/settings.js`: `/api/settings/sender-rules` GET/POST/DELETE — POST archiveert direct alle open messages van die sender
- `ChatThread` toont echte chat bubbels met date-dividers, outbound blauw rechts, inbound grijs links
- `UnipileSettings` component (in Instellingen → Kanalen): instructies-panel met API Key + DSN inputs als niet geconfigureerd, anders "✅ Verbonden" met sync info + Loskoppel knop
- Live geverifieerd: `POST /api/sync/unipile` → **57 nieuwe WhatsApp berichten gesynced** vanuit echte Unipile account, plus LinkedIn account gevonden

### Stap 10 — PWA + SSE + Welcome + Sender Rules + Keyboard
- `client/public/manifest.json` + `icon.svg/192.svg/512.svg` (gradient K op donker, SVG = lossless op alle sizes)
- `client/public/sw.js`: cache-first voor assets, network-first voor HTML, NEVER voor /api en /auth (auth-protected). Geregistreerd in main.jsx alleen in PROD mode (dev = HMR conflict)
- `services/notification-bridge.js`: SSE client set met keepalive ping (25s), broadcast helper, stale-connection cleanup elke 30 min
- `routes/events.js`: `GET /api/events/stream` (SSE), `GET /api/events/status` (subscribers count)
- Poller broadcastet `new-messages` event met de 10 nieuwste open inbound berichten
- `useNotifications` hook: vraagt Notification permission éénmaal (gecached in localStorage), EventSource subscribe + Desktop Notification API met click-to-focus
- `WelcomeScreen` component: getoond als geen accounts verbonden EN view='inbox'. 4-stappen guided onboarding met "Verbind je eerste account" knop → setView('instellingen')
- `sender_rules` tabel + `findSenderRule()` in gmail-sync.js: block → message wordt niet opgeslagen (skip), newsletter/info → forceer status='archived', allow/no-rule → normaal
- `🚫` block knop op MessageRow hover, vraagt "alleen dit adres of hele domein" via confirm, POST sender-rules + archiveert bestaande messages
- `package.json`: `dev:client` heeft nu `-- --open` flag → browser opent automatisch

### Globale fixes
- `gmail-send.getAccountFrom`: gecached per channelId met 5-min TTL (voorkomt extra userinfo call per send)
- Calendar hooks: 5min staleTime
- Welcome screen logic: alleen tonen als view='inbox' EN geen accounts (zodat Settings reachable blijft)
- SSE: keepalive ping voorkomt connection drop tijdens slaapstand; bij drop herstart browser EventSource automatisch
- Sender rule block: ondersteunt zowel exact email (`user@x.com`) als domein-pattern (`@x.com`) match

### Getest

- ✅ `npm run build` → 127 modules transformed, 311 kB JS (gzip 93 kB), geen errors
- ✅ Server boot: alle nieuwe routes geladen (poller, settings, events, export)
- ✅ Channels endpoint toont 8 kanalen (4 email + wa-1 + wa-2 + li-1 + ig-1)
- ✅ `/api/settings/unipile` toont configured=true (uit .env)
- ✅ `/api/settings/sender-rules` POST + GET + DELETE flow werkt
- ✅ `/api/stats/daily-summary` returnt correcte counts (open=1053, urgent=0, birthdays=0, nudges_top3=3, done_yesterday=0)
- ✅ `/api/calendar/today` werkt (events=0 voor de test gebruiker)
- ✅ `/api/export/logboek` returnt CSV met UTF-8 BOM
- ✅ `/api/events/stream` SSE: `event: connected` direct ontvangen
- ✅ **Live Unipile sync: 57 nieuwe WhatsApp messages gesynced + LinkedIn account auto-mapped** naar lokale channels
- ✅ FTS5 search via `/api/messages?status=done&search=...` (escaped prefix query)

### Bugs gefixt tijdens build

1. **Seed had hard "skip if existing channels" guard** → nieuwe li-1/ig-1 werden niet toegevoegd aan bestaande DB. Fix: idempotent `INSERT OR IGNORE` per channel.
2. **Sync route `/:channelId` matchte `/all` en `/unipile`** — al gefixt in stap 3, maar opnieuw geverifieerd na toevoeging van `/unipile` route.
3. **Reply naar non-email kanaal had hard 400** → vervangen door echte Unipile send met deep-link fallback.

### Niet getest (vereist live interactie)

- Manual click "Verbinden" voor extra Gmail accounts (al 4 verbonden)
- PWA install via Chrome menu
- Desktop notification bij echte nieuwe email (vereist browser open + permission granted)
- Welcome screen (alle accounts al verbonden)

### Volgende stap

Stap 11: AI assistant (Claude integration). Style profiel, thread analyse, reply varianten, ask interface.
