import crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../../.env');

const ALG = 'aes-256-gcm';
const IV_LEN = 12; // GCM standard

function ensureKey() {
  let key = process.env.ENCRYPTION_KEY;
  if (key && /^[0-9a-f]{64}$/i.test(key)) return Buffer.from(key, 'hex');

  // Generate + persist
  const newKey = crypto.randomBytes(32).toString('hex');
  const line = `\nENCRYPTION_KEY=${newKey}\n`;

  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, 'utf-8');
    if (/^ENCRYPTION_KEY=/m.test(content)) {
      // Replace placeholder / invalid value
      writeFileSync(ENV_PATH, content.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${newKey}`));
    } else {
      appendFileSync(ENV_PATH, line);
    }
  } else {
    writeFileSync(ENV_PATH, line);
  }
  process.env.ENCRYPTION_KEY = newKey;
  console.warn('🔐 ENCRYPTION_KEY ontbrak — automatisch gegenereerd en opgeslagen in .env');
  return Buffer.from(newKey, 'hex');
}

const KEY = ensureKey();

export function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  });
}

export function decrypt(payload) {
  if (payload == null) return null;
  let parsed;
  try {
    parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch {
    // Backwards compatibility: plaintext fallback (oude tokens van vóór encryptie)
    return typeof payload === 'string' ? payload : null;
  }
  if (!parsed?.encrypted || !parsed?.iv || !parsed?.tag) return null;

  const decipher = crypto.createDecipheriv(ALG, KEY, Buffer.from(parsed.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.encrypted, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}

export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const p = JSON.parse(value);
    return !!(p?.encrypted && p?.iv && p?.tag);
  } catch {
    return false;
  }
}
