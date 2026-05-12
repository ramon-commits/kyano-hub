import cron from 'node-cron';
import db from '../db/init.js';
import { syncChannel } from './gmail-sync.js';

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
    const channels = db.prepare(`
      SELECT c.* FROM channels c
      INNER JOIN oauth_tokens t ON t.channel_id = c.id
      WHERE c.type = 'email' AND c.is_active = 1
    `).all();

    if (channels.length === 0) {
      console.log('📧 Poll skipped — no connected email channels');
      return;
    }

    let totalNew = 0;
    let okCount = 0;
    let errCount = 0;

    for (const channel of channels) {
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
        console.error(`❌ Poll error for ${channel.id}: ${errMsg}`);
      }
    }
    console.log(`📧 Polled ${channels.length} account(s): ${totalNew} new messages, ${okCount} ok, ${errCount} errors`);
  } finally {
    isRunning = false;
  }
}

export function startGmailPoller() {
  // Elke 2 minuten
  cron.schedule('*/2 * * * *', () => { pollAll().catch((e) => console.error('Poller crash:', e)); });
  console.log('📧 Gmail poller gestart (elke 2 minuten)');
  // Trigger één keer kort na boot zodat eerste sync direct begint (geen lege poll wachten)
  setTimeout(() => { pollAll().catch((e) => console.error('Initial poll crash:', e)); }, 5000);
}
