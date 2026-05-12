import { google } from 'googleapis';
import db from '../db/init.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function makeClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function getAuthUrl(channelId) {
  const client = makeClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: channelId,
  });
}

export async function handleCallback(code, channelId) {
  const client = makeClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Get user email
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();

  db.prepare(`
    INSERT INTO oauth_tokens (channel_id, access_token, refresh_token, expiry_date, email)
    VALUES (@channel_id, @access_token, @refresh_token, @expiry_date, @email)
    ON CONFLICT(channel_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
      expiry_date = excluded.expiry_date,
      email = excluded.email
  `).run({
    channel_id: channelId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    email: userInfo.email,
  });

  return { email: userInfo.email, channelId };
}

export function getClient(channelId) {
  const row = db.prepare('SELECT * FROM oauth_tokens WHERE channel_id = ?').get(channelId);
  if (!row) return null;

  const client = makeClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date ? new Date(row.expiry_date).getTime() : null,
  });

  client.on('tokens', (tokens) => {
    const expiryIso = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
    if (tokens.refresh_token) {
      db.prepare(`UPDATE oauth_tokens SET access_token = ?, refresh_token = ?, expiry_date = ? WHERE channel_id = ?`)
        .run(tokens.access_token, tokens.refresh_token, expiryIso, channelId);
    } else if (tokens.access_token) {
      db.prepare(`UPDATE oauth_tokens SET access_token = ?, expiry_date = ? WHERE channel_id = ?`)
        .run(tokens.access_token, expiryIso, channelId);
    }
  });

  return client;
}

export function isConnected(channelId) {
  const row = db.prepare('SELECT 1 FROM oauth_tokens WHERE channel_id = ?').get(channelId);
  return !!row;
}

export function disconnect(channelId) {
  db.prepare('DELETE FROM oauth_tokens WHERE channel_id = ?').run(channelId);
}
