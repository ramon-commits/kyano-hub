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
