// Attendance sessions, manual clock in/out and per-volunteer hours summary.

import { Router } from 'express';
import { hoursFromMs, recordHoursMs, roundHours, sumCompletedHoursMs } from '../hours.js';
import {
  NAME_MAX,
  conflictError,
  notFoundError,
  optionalTrimmedString,
  rejectUnknownFields,
  requireBodyObject,
  requireDateString,
  requirePositiveId,
  requireTrimmedString,
  validationError,
} from '../validation.js';

function sessionOut(row) {
  return { id: row.id, title: row.title, date: row.date, venue: row.venue, createdAt: row.created_at };
}

function recordOut(row) {
  const ms = recordHoursMs(row);
  return {
    id: row.id,
    sessionId: row.session_id,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    hours: ms === null ? null : roundHours(hoursFromMs(ms)),
  };
}

export function createAttendanceRouter(db) {
  const router = Router();

  const selectAllSessions = db.prepare(
    'SELECT id, title, date, venue, created_at FROM attendance_sessions ORDER BY date DESC, id DESC'
  );
  const selectSessionById = db.prepare(
    'SELECT id, title, date, venue, created_at FROM attendance_sessions WHERE id = ?'
  );
  const selectRecordsForSession = db.prepare(
    `SELECT r.id, r.session_id, r.volunteer_id, v.name AS volunteer_name, r.clock_in, r.clock_out
       FROM attendance_records r
       JOIN volunteers v ON v.id = r.volunteer_id
      WHERE r.session_id = ?
      ORDER BY v.name COLLATE NOCASE, r.clock_in, r.id`
  );
  const selectRecordByPair = db.prepare(
    'SELECT id, session_id, volunteer_id, clock_in, clock_out FROM attendance_records WHERE session_id = ? AND volunteer_id = ?'
  );
  const selectVolunteerName = db.prepare('SELECT id, name FROM volunteers WHERE id = ?');
  const selectAllRecords = db.prepare(
    'SELECT clock_in, clock_out, volunteer_id FROM attendance_records'
  );
  const selectAllVolunteers = db.prepare(
    'SELECT id, name FROM volunteers ORDER BY name COLLATE NOCASE, id'
  );

  function loadSession(idParam) {
    const id = requirePositiveId(idParam, 'Session id');
    const session = selectSessionById.get(id);
    if (!session) throw notFoundError('Attendance session not found.');
    return session;
  }

  function loadVolunteer(volunteerId) {
    const volunteer = selectVolunteerName.get(volunteerId);
    if (!volunteer) throw validationError('Volunteer not found.');
    return volunteer;
  }

  function recordOutById(recordId) {
    const row = db
      .prepare(
        `SELECT r.id, r.session_id, r.volunteer_id, v.name AS volunteer_name, r.clock_in, r.clock_out
           FROM attendance_records r
           JOIN volunteers v ON v.id = r.volunteer_id
          WHERE r.id = ?`
      )
      .get(recordId);
    return recordOut(row);
  }

  router.get('/sessions', (req, res, next) => {
    try {
      res.json({ data: selectAllSessions.all().map(sessionOut) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sessions', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['title', 'date', 'venue']);
      const title = requireTrimmedString(body.title, 'Title');
      const date = requireDateString(body.date, 'Date');
      const venue = optionalTrimmedString(body.venue, 'Venue', { max: NAME_MAX });
      const result = db
        .prepare('INSERT INTO attendance_sessions (title, date, venue, created_at) VALUES (?,?,?,?)')
        .run(title, date, venue, new Date().toISOString());
      res.status(201).json({ data: sessionOut(selectSessionById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/summary', (req, res, next) => {
    try {
      const records = selectAllRecords.all();
      const byVolunteer = new Map();
      for (const volunteer of selectAllVolunteers.all()) {
        byVolunteer.set(volunteer.id, {
          volunteerId: volunteer.id,
          volunteerName: volunteer.name,
          completedSessions: 0,
          _ms: 0,
        });
      }
      for (const record of records) {
        if (record.clock_out === null) continue;
        const entry = byVolunteer.get(record.volunteer_id);
        if (!entry) continue;
        entry.completedSessions += 1;
        const ms = Date.parse(record.clock_out) - Date.parse(record.clock_in);
        if (ms > 0) entry._ms += ms;
      }
      const rows = [...byVolunteer.values()].map((entry) => ({
        volunteerId: entry.volunteerId,
        volunteerName: entry.volunteerName,
        completedSessions: entry.completedSessions,
        hours: roundHours(hoursFromMs(entry._ms)),
      }));
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/sessions/:id', (req, res, next) => {
    try {
      const session = loadSession(req.params.id);
      const records = selectRecordsForSession.all(session.id).map(recordOut);
      res.json({ data: { session: sessionOut(session), records } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sessions/:id/clock-in', (req, res, next) => {
    try {
      const session = loadSession(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['volunteerId']);
      const volunteerId = requirePositiveId(body.volunteerId, 'Volunteer id');
      const volunteer = loadVolunteer(volunteerId);
      const existing = selectRecordByPair.get(session.id, volunteerId);
      if (existing) {
        throw conflictError(
          existing.clock_out
            ? `${volunteer.name} already has a completed record for this session.`
            : `${volunteer.name} is already clocked in for this session.`
        );
      }
      const result = db
        .prepare('INSERT INTO attendance_records (session_id, volunteer_id, clock_in) VALUES (?,?,?)')
        .run(session.id, volunteerId, new Date().toISOString());
      res.status(201).json({ data: recordOutById(Number(result.lastInsertRowid)) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sessions/:id/clock-out', (req, res, next) => {
    try {
      const session = loadSession(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['volunteerId']);
      const volunteerId = requirePositiveId(body.volunteerId, 'Volunteer id');
      const volunteer = loadVolunteer(volunteerId);
      const record = selectRecordByPair.get(session.id, volunteerId);
      if (!record) {
        throw notFoundError(`No attendance record for ${volunteer.name} in this session.`);
      }
      if (record.clock_out) {
        throw conflictError(`${volunteer.name} is already clocked out for this session.`);
      }
      db.prepare('UPDATE attendance_records SET clock_out = ? WHERE id = ?').run(
        new Date().toISOString(),
        record.id
      );
      res.json({ data: recordOutById(record.id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Exported for dashboard/tests that need the same completed-hours semantics.
export { sumCompletedHoursMs, roundHours, hoursFromMs };
