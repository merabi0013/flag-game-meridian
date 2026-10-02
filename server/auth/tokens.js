/**
 * auth/tokens.js — random tokens, hashing, and the signed short-lived
 * "OAuth handshake" cookie. Pure crypto helpers; no database, no HTTP.
 */
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** A fresh unguessable token (256 bits). */
function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** What we store instead of the token itself. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newPkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

/** value (object) -> "payload.signature" */
function signPayload(value, secret) {
  const payload = b64u(JSON.stringify(value));
  return `${payload}.${hmac(payload, secret)}`;
}

/** Returns the object, or null if the signature is wrong / it expired / it is malformed. */
function verifyPayload(signed, secret) {
  if (typeof signed !== 'string') return null;
  const [payload, sig] = signed.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof value.exp !== 'number' || value.exp < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

module.exports = { newToken, hashToken, newPkce, signPayload, verifyPayload, parseCookies };
