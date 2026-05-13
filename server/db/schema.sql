-- Runtime configuratie key/value (Unipile credentials, etc.)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Sender rules voor block / newsletter / info classificatie
CREATE TABLE IF NOT EXISTS sender_rules (
  id TEXT PRIMARY KEY,
  email_pattern TEXT NOT NULL,
  rule TEXT NOT NULL CHECK(rule IN ('allow','block','newsletter','info')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sender_rules_pattern ON sender_rules(email_pattern);

-- Kanalen (email accounts, WhatsApp lijnen, etc.)
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('email','whatsapp','instagram','linkedin')),
  label TEXT NOT NULL,
  account_email TEXT,
  is_active INTEGER DEFAULT 1,
  config_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Contacten (klant-bibliotheek)
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  birthday TEXT,
  avatar_initials TEXT,
  avatar_color TEXT,
  notes TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Berichten als taken
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  contact_id TEXT REFERENCES contacts(id),
  direction TEXT DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound')),
  subject TEXT,
  snippet TEXT,
  body_html TEXT,
  body_text TEXT,
  deep_link TEXT,
  thread_id TEXT,
  in_reply_to TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','snoozed','done','waiting','archived')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  snoozed_until TEXT,
  done_at TEXT,
  done_note TEXT,
  done_category TEXT CHECK(done_category IN ('replied','called','offer_sent','forwarded','not_relevant','other')),
  received_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- OAuth tokens per kanaal (encrypted)
CREATE TABLE IF NOT EXISTS oauth_tokens (
  channel_id TEXT PRIMARY KEY REFERENCES channels(id),
  access_token TEXT,
  refresh_token TEXT,
  expiry_date TEXT,
  email TEXT
);

-- Geplande afspraken
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  google_event_id TEXT,
  title TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id),
  calendar_email TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_minutes INTEGER,
  location TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Nudge configuratie per contact
CREATE TABLE IF NOT EXISTS nudge_settings (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(id),
  remind_after_days INTEGER DEFAULT 14,
  is_active INTEGER DEFAULT 1,
  last_nudge_at TEXT
);

-- Sync state per kanaal
CREATE TABLE IF NOT EXISTS sync_state (
  channel_id TEXT PRIMARY KEY REFERENCES channels(id),
  last_sync_at TEXT,
  last_history_id TEXT,
  cursor TEXT
);

-- Interactie logs (trainingsdata voor AI)
CREATE TABLE IF NOT EXISTS interaction_logs (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  contact_id TEXT REFERENCES contacts(id),
  action TEXT NOT NULL CHECK(action IN ('opened','snoozed','done','replied','archived','scheduled')),
  channel_type TEXT,
  time_to_action_seconds INTEGER,
  note TEXT,
  thread_summary TEXT,
  detected_intent TEXT,
  players_json TEXT,
  language_in TEXT,
  language_out TEXT,
  tone_used TEXT,
  variant_chosen TEXT,
  outcome TEXT CHECK(outcome IN ('sent','edited_sent','copied','rejected','snoozed')),
  style_learnings_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Style Profile (communicatie-DNA)
CREATE TABLE IF NOT EXISTS style_profiles (
  id TEXT PRIMARY KEY DEFAULT 'ramon',
  general_tone TEXT,
  signature TEXT,
  avoid_rules TEXT,
  prefer_rules TEXT,
  per_channel_json TEXT,
  per_contact_json TEXT,
  learned_preferences_json TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Bericht correcties (feedback loop)
CREATE TABLE IF NOT EXISTS message_corrections (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  original_text TEXT,
  corrected_text TEXT,
  diff_summary TEXT,
  became_rule INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- AI-gegenereerde replies (audit trail)
CREATE TABLE IF NOT EXISTS ai_replies (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  thread_analysis_json TEXT,
  variants_json TEXT,
  chosen_variant INTEGER,
  was_edited INTEGER DEFAULT 0,
  model_used TEXT DEFAULT 'claude-sonnet-4',
  tokens_used INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Projecten
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','done','archived')),
  color TEXT DEFAULT '#3b82f6',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Koppeltabel berichten -> projecten
CREATE TABLE IF NOT EXISTS message_projects (
  message_id TEXT REFERENCES messages(id),
  project_id TEXT REFERENCES projects(id),
  PRIMARY KEY (message_id, project_id)
);

-- Koppeltabel contacten -> projecten
CREATE TABLE IF NOT EXISTS contact_projects (
  contact_id TEXT REFERENCES contacts(id),
  project_id TEXT REFERENCES projects(id),
  role TEXT,
  PRIMARY KEY (contact_id, project_id)
);

-- Contact samenvattingen
CREATE TABLE IF NOT EXISTS contact_summaries (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(id),
  summary_text TEXT,
  key_facts_json TEXT,
  open_items_json TEXT,
  relationship_status TEXT CHECK(relationship_status IN ('warm','actief','afkoelend','slapend','nieuw')),
  last_summary_update TEXT,
  interaction_count INTEGER DEFAULT 0
);

-- Project samenvattingen
CREATE TABLE IF NOT EXISTS project_summaries (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  summary_text TEXT,
  milestones_json TEXT,
  open_items_json TEXT,
  last_summary_update TEXT
);

-- Pinned threads (vastgezette gesprekken bovenaan inbox)
CREATE TABLE IF NOT EXISTS pinned_threads (
  thread_id TEXT PRIMARY KEY,
  channel_id TEXT,
  contact_id TEXT REFERENCES contacts(id),
  pinned_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pinned_pinned_at ON pinned_threads(pinned_at DESC);

-- Quick reply templates (/-shortcuts in composer)
CREATE TABLE IF NOT EXISTS quick_replies (
  id TEXT PRIMARY KEY,
  shortcut TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel_type TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON quick_replies(shortcut);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  snippet, subject, done_note,
  content='messages',
  content_rowid='rowid'
);

-- FTS triggers (sync messages -> messages_fts)
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, snippet, subject, done_note) VALUES (new.rowid, new.snippet, new.subject, new.done_note);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, snippet, subject, done_note) VALUES ('delete', old.rowid, old.snippet, old.subject, old.done_note);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, snippet, subject, done_note) VALUES ('delete', old.rowid, old.snippet, old.subject, old.done_note);
  INSERT INTO messages_fts(rowid, snippet, subject, done_note) VALUES (new.rowid, new.snippet, new.subject, new.done_note);
END;

-- Indexen
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_per_channel
  ON messages(channel_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_snoozed ON messages(snoozed_until) WHERE status = 'snoozed';
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_contact ON interaction_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_action ON interaction_logs(action);
CREATE INDEX IF NOT EXISTS idx_message_projects ON message_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_contact_projects ON contact_projects(project_id);
