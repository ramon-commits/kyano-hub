import cron from 'node-cron';
import db from '../db/init.js';
import { syncChannel } from './gmail-sync.js';
import { syncAllUnipile } from './unipile-sync.js';
import { isConfigured as unipileConfigured } from './unipile.js';
import { syncAsana } from './asana-sync.js';
import { isConfigured as asanaConfigured } from './asana.js';
import { broadcast } from './notification-bridge.js';

const POLL_STATE = new Map(); // channel_id -> { has_error, error_message, last_run_at }

export function getPollerState(channelId) {
  return POLL_STATE.get(channelId) || { has_error: false, error_message: null, last_run_at: null };
}

export function getAllPollerState() {
  const obj = {};
  for (const [k, v] of POLL_STATE.entries()) obj[k] = v;
  return obj;
}

let isRunning = false;

async function pollAll() {
  if (isRunning) {
    console.log('📧 Poll skipped — previous run still in progress');
    return;
  }
  isRunning = true;
  try {
    // Gmail accounts
    const gmailChannels = db.prepare(`
      SELECT c.* FROM channels c
      INNER JOIN oauth_tokens t ON t.channel_id = c.id
      WHERE c.type = 'email' AND c.is_active = 1
    `).all();

    let totalNew = 0;
    let okCount = 0;
    let errCount = 0;

    for (const channel of gmailChannels) {
      try {
        const result = await syncChannel(channel.id);
        POLL_STATE.set(channel.id, { has_error: false, error_message: null, last_run_at: new Date().toISOString() });
        if (result.inserted > 0) totalNew += result.inserted;
        okCount++;
      } catch (e) {
        errCount++;
        const isAuth = /401|invalid_grant|unauthorized|invalid_request/i.test(e?.message || '');
        const errMsg = isAuth ? 'Herconnectie nodig (token verlopen)' : e.message;
        POLL_STATE.set(channel.id, { has_error: true, error_message: errMsg, last_run_at: new Date().toISOString() });
        console.error(`❌ Gmail poll error for ${channel.id}: ${errMsg}`);
      }
    }

    // Unipile (WA + LinkedIn + Instagram)
    let unipileNew = 0;
    let unipileCount = 0;
    if (unipileConfigured()) {
      try {
        const r = await syncAllUnipile();
        unipileNew = r.total_new || 0;
        unipileCount = r.accounts_synced || 0;
        // Per Unipile-channel: poller state
        for (const result of r.results || []) {
          const channelId = result.channel_id;
          if (channelId) {
            if (result.ok) {
              POLL_STATE.set(channelId, { has_error: false, error_message: null, last_run_at: new Date().toISOString() });
            } else {
              POLL_STATE.set(channelId, { has_error: true, error_message: result.error || result.reason, last_run_at: new Date().toISOString() });
            }
          }
        }
      } catch (e) {
        console.error('❌ Unipile poll error:', e.message);
      }
    }

    // Asana (FitAid taken → to-do inbox)
    let asanaNew = 0;
    if (asanaConfigured()) {
      try {
        const r = await syncAsana();
        asanaNew = r.inserted || 0;
        POLL_STATE.set('asana-1', { has_error: false, error_message: null, last_run_at: new Date().toISOString() });
        if (r.closed) console.log(`📋 Asana: ${r.closed} taak/taken afgesloten (afgerond in Asana)`);
      } catch (e) {
        POLL_STATE.set('asana-1', { has_error: true, error_message: e.message, last_run_at: new Date().toISOString() });
        console.error('❌ Asana poll error:', e.message);
      }
    }

    const sumNew = totalNew + unipileNew + asanaNew;
    if (sumNew > 0) {
      // Stuur SSE event met de N nieuwste open inbound berichten
      const recent = db.prepare(`
        SELECT m.id, m.subject, m.snippet, m.channel_id, m.received_at,
          c.name AS contact_name, c.avatar_initials AS contact_initials, c.avatar_color AS contact_color,
          ch.type AS channel_type, ch.label AS channel_label
        FROM messages m
        LEFT JOIN contacts c ON c.id = m.contact_id
        LEFT JOIN channels ch ON ch.id = m.channel_id
        WHERE m.direction = 'inbound' AND m.status = 'open'
        ORDER BY m.received_at DESC
        LIMIT ?
      `).all(Math.min(sumNew, 10));
      broadcast('new-messages', { count: sumNew, messages: recent });
    }
    console.log(`📧 Polled ${gmailChannels.length} email + ${unipileCount} messaging accounts + Asana: ${sumNew} new (${okCount} ok, ${errCount} errors)`);
  } finally {
    isRunning = false;
  }
}

export function startPoller() {
  cron.schedule('*/2 * * * *', () => { pollAll().catch((e) => console.error('Poller crash:', e)); });
  console.log('📧 Unified poller gestart (Gmail + Unipile, elke 2 minuten)');
  setTimeout(() => { pollAll().catch((e) => console.error('Initial poll crash:', e)); }, 5000);
}

// Backwards-compat alias
export const startGmailPoller = startPoller;
