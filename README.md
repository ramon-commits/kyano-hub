# Kyano Communication Hub

Lokaal communicatie-dashboard voor Ramon Brugman (Endless Minds / Kyano Horaizon).

Eén dashboard voor 4 email accounts, 2 WhatsApp lijnen, en 4 Google Calendars. Berichten lezen, beantwoorden, snoozen, afhandelen — alles vanuit één plek.

## Stack

- **Backend**: Express.js + SQLite (better-sqlite3) op `:3001`
- **Frontend**: React + Vite + Tailwind v4 op `:5173`
- **Auth**: Google OAuth 2.0 (Gmail + Calendar API)
- **AI**: Anthropic Claude API

## Setup

```bash
# Installeer alles (root, server, client)
npm run install:all

# Start dev (server + client met hot reload)
npm run dev
```

Open http://localhost:5173 in je browser.

## Endpoints (server :3001)

- `GET /api/health` — health check
- `GET /api/messages` — berichten met filters
- `GET /api/contacts` — contacten
- `GET /api/channels` — kanalen
- `GET /api/stats` — dashboard statistieken
- `GET /api/auth/status` — OAuth status per kanaal
- ...

## Project structuur

```
kyano-hub/
├── server/    Express + SQLite backend
├── client/    React + Vite frontend
└── data/      SQLite database (lokaal)
```

## Stappenplan

- ✅ Stap 1: Project setup + SQLite + Express + Vite skeleton
- ⏳ Stap 2: Inbox UI met message lijst
- ⏳ Stap 3: Gmail sync (real emails)
- ...

Zie `LOGBOEK.md` voor details per stap.
