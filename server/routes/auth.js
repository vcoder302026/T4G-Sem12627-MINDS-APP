// Login, session check and logout routes.

import { Router } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  hashToken,
  parseCookies,
  verifyPassword,
} from '../auth.js';
import {
  HttpError,
  requireBodyObject,
  requireTrimmedString,
  rejectUnknownFields,
} from '../validation.js';

export function createAuthRouter(db, requireAuth) {
  const router = Router();

  const selectUserByUsername = db.prepare(
    'SELECT id, username, name, password_hash, password_salt FROM users WHERE username = ?'
  );
  const deleteSession = db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?');
  const deleteExpired = db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?');

  router.post('/login', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['username', 'password']);
      const username = requireTrimmedString(body.username, 'Username');
      if (typeof body.password !== 'string' || body.password.length === 0) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Password is required.');
      }
      const user = selectUserByUsername.get(username);
      if (!user || !verifyPassword(body.password, user.password_salt, user.password_hash)) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Invalid username or password.');
      }
      deleteExpired.run(new Date().toISOString());
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(
        hashToken(token),
        user.id,
        expiresAt
      );
      res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
      res.json({ data: { id: user.id, username: user.username, name: user.name } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ data: req.user });
  });

  router.post('/logout', requireAuth, (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
      if (token) deleteSession.run(hashToken(token));
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.json({ data: { loggedOut: true } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
