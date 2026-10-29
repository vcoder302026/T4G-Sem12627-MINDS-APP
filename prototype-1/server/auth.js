// Password hashing, session tokens and authentication middleware.
// Passwords use scrypt with a random salt; sessions store only a SHA-256
// hash of a random 32-byte token.

import crypto from 'node:crypto';
import { unauthorizedError } from './validation.js';

export const SESSION_COOKIE_NAME = 'minds_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // eight hours

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  let expected;
  try {
    expected = Buffer.from(expectedHash, 'hex');
  } catch {
    return false;
  }
  const derived = crypto.scryptSync(password, salt, 64);
  return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseCookies(header) {
  const cookies = {};
  if (!header || typeof header !== 'string') return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!name) continue;
    let value = raw;
    if (raw.startsWith('"') && raw.endsWith('"')) value = raw.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw value
    }
    cookies[name] = value;
  }
  return cookies;
}

export function createAuthMiddleware(db) {
  const selectSession = db.prepare(
    `SELECT s.token_hash AS token_hash, s.expires_at AS expires_at,
            u.id AS user_id, u.username AS username, u.name AS name
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  );
  const deleteSession = db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?');

  return function requireAuth(req, res, next) {
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
      if (!token) {
        throw unauthorizedError('Sign in required.');
      }
      const tokenHash = hashToken(token);
      const session = selectSession.get(tokenHash);
      if (!session) {
        throw unauthorizedError('Session not recognised. Sign in again.');
      }
      if (Date.parse(session.expires_at) <= Date.now()) {
        deleteSession.run(tokenHash);
        throw unauthorizedError('Session expired. Sign in again.');
      }
      req.user = { id: session.user_id, username: session.username, name: session.name };
      req.sessionTokenHash = tokenHash;
      next();
    } catch (err) {
      next(err);
    }
  };
}
