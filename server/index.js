// Express entry point. createApp() builds the app without starting a
// server so tests can import it; startServer() is the CLI startup path.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAuthMiddleware } from './auth.js';
import { openDatabase } from './db.js';
import { HttpError, forbiddenError } from './validation.js';
import { createAuthRouter } from './routes/auth.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createTraineesRouter, createVolunteersRouter } from './routes/directory.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { createFundraisersRouter, createOrdersRouter } from './routes/fundraising.js';
import { createOutingAssignmentsRouter, createOutingsRouter } from './routes/outings.js';
import {
  createTripLogisticsRouter,
  createTripParticipantsRouter,
  createTripsRouter,
} from './routes/trips.js';
import { createVisitsRouter } from './routes/visits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const defaultDatabasePath = path.join(rootDir, 'data', 'minds.sqlite');

function originGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const origin = req.headers.origin;
  if (!origin) return next();
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin.toLowerCase() !== expected.toLowerCase()) {
    return next(forbiddenError('Cross-origin requests are not allowed.'));
  }
  next();
}

function isSqliteConstraint(err, kind) {
  return (
    (typeof err?.code === 'string' && err.code === `SQLITE_CONSTRAINT_${kind}`) ||
    String(err?.message || '').includes(`${kind} constraint failed`)
  );
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Unexpected server error.';
  if (err instanceof HttpError) {
    status = err.status;
    code = err.code;
    message = err.message;
  } else if (isSqliteConstraint(err, 'UNIQUE')) {
    status = 409;
    code = 'CONFLICT';
    message = 'This entry already exists.';
  } else if (isSqliteConstraint(err, 'FOREIGNKEY')) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'A referenced record does not exist.';
  } else if (isSqliteConstraint(err, 'CHECK')) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'A value failed data validation.';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request body is not valid JSON.';
  } else if (err?.status === 413 || err?.statusCode === 413) {
    status = 413;
    code = 'VALIDATION_ERROR';
    message = 'Request body is too large.';
  } else {
    console.error(`[minds] unexpected error on ${req.method} ${req.originalUrl}:`, err);
  }
  res.status(status).json({ error: { code, message } });
}

export function createApp({ databasePath = defaultDatabasePath } = {}) {
  const db = openDatabase(databasePath);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  const requireAuth = createAuthMiddleware(db);

  const api = express.Router();
  api.use(originGuard);
  api.get('/health', (req, res) => {
    res.json({ data: { status: 'ok' } });
  });
  api.use('/auth', createAuthRouter(db, requireAuth));
  api.use(requireAuth);
  api.use('/dashboard', createDashboardRouter(db));
  api.use('/volunteers', createVolunteersRouter(db));
  api.use('/trainees', createTraineesRouter(db));
  api.use('/attendance', createAttendanceRouter(db));
  api.use('/fundraisers', createFundraisersRouter(db));
  api.use('/orders', createOrdersRouter(db));
  api.use('/outings', createOutingsRouter(db));
  api.use('/outing-assignments', createOutingAssignmentsRouter(db));
  api.use('/trips', createTripsRouter(db));
  api.use('/trip-participants', createTripParticipantsRouter(db));
  api.use('/trip-logistics', createTripLogisticsRouter(db));
  api.use('/visits', createVisitsRouter(db));
  api.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
  });

  app.use('/api', api);
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });

  app.use(errorHandler);
  return { app, db };
}

export function startServer({
  databasePath = defaultDatabasePath,
  port = process.env.PORT ? Number(process.env.PORT) : 3000,
  host = '127.0.0.1',
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }
  const { app, db } = createApp({ databasePath });
  const server = app.listen(port, host, () => {
    console.log(`MINDS Admin prototype running at http://${host}:${port}`);
    console.log(`Database: ${databasePath}`);
    console.log('Demo login: admin / MindsDemo123! (local demo credentials)');
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => {
      try {
        db.close();
      } catch {
        // already closed
      }
      process.exit(0);
    });
    setTimeout(() => {
      try {
        db.close();
      } catch {
        // already closed
      }
      process.exit(0);
    }, 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { server, db };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  startServer();
}
