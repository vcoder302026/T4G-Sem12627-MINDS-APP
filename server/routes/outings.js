// Outings: list/create, detail with assignments, assignment editing and boarding.

import { Router } from 'express';
import { applyUpdate } from '../db.js';
import {
  NAME_MAX,
  NOTES_MAX,
  conflictError,
  notFoundError,
  optionalTrimmedString,
  rejectUnknownFields,
  requireBodyObject,
  requireBooleanValue,
  requireDateString,
  requireNullableId,
  requirePositiveId,
  requireTrimmedString,
  validationError,
} from '../validation.js';

function outingOut(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    venue: row.venue,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function assignmentOut(row) {
  return {
    id: row.id,
    outingId: row.outing_id,
    traineeId: row.trainee_id,
    traineeName: row.trainee_name,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
    groupName: row.group_name,
    busName: row.bus_name,
    boarded: row.boarded === 1,
  };
}

const ASSIGNMENT_COLUMNS = `a.id, a.outing_id, a.trainee_id, t.name AS trainee_name,
  a.volunteer_id, v.name AS volunteer_name, a.group_name, a.bus_name, a.boarded`;

export function createOutingsRouter(db) {
  const router = Router();

  const selectAll = db.prepare(
    'SELECT id, title, date, venue, notes, created_at FROM outings ORDER BY date ASC, id ASC'
  );
  const selectById = db.prepare('SELECT id, title, date, venue, notes, created_at FROM outings WHERE id = ?');
  const selectAssignments = db.prepare(
    `SELECT ${ASSIGNMENT_COLUMNS}
       FROM outing_assignments a
       JOIN trainees t ON t.id = a.trainee_id
       JOIN volunteers v ON v.id = a.volunteer_id
      WHERE a.outing_id = ?
      ORDER BY t.name COLLATE NOCASE, a.id`
  );
  const selectAssignmentById = db.prepare(
    `SELECT ${ASSIGNMENT_COLUMNS}
       FROM outing_assignments a
       JOIN trainees t ON t.id = a.trainee_id
       JOIN volunteers v ON v.id = a.volunteer_id
      WHERE a.id = ?`
  );
  const selectAssignmentByPair = db.prepare(
    'SELECT id FROM outing_assignments WHERE outing_id = ? AND trainee_id = ?'
  );
  const selectTrainee = db.prepare('SELECT id, name FROM trainees WHERE id = ?');
  const selectVolunteer = db.prepare('SELECT id, name FROM volunteers WHERE id = ?');

  function loadOuting(idParam) {
    const id = requirePositiveId(idParam, 'Outing id');
    const outing = selectById.get(id);
    if (!outing) throw notFoundError('Outing not found.');
    return outing;
  }

  router.get('/', (req, res, next) => {
    try {
      res.json({ data: selectAll.all().map(outingOut) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['title', 'date', 'venue', 'notes']);
      const title = requireTrimmedString(body.title, 'Title');
      const date = requireDateString(body.date, 'Date');
      const venue = optionalTrimmedString(body.venue, 'Venue', { max: NAME_MAX });
      const notes = optionalTrimmedString(body.notes, 'Notes', { max: NOTES_MAX });
      const result = db
        .prepare('INSERT INTO outings (title, date, venue, notes, created_at) VALUES (?,?,?,?,?)')
        .run(title, date, venue, notes, new Date().toISOString());
      res.status(201).json({ data: outingOut(selectById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const outing = loadOuting(req.params.id);
      const assignments = selectAssignments.all(outing.id).map(assignmentOut);
      res.json({ data: { outing: outingOut(outing), assignments } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/assignments', (req, res, next) => {
    try {
      const outing = loadOuting(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['traineeId', 'volunteerId', 'groupName', 'busName']);
      const traineeId = requirePositiveId(body.traineeId, 'Trainee id');
      const volunteerId = requireNullableId(body.volunteerId, 'Volunteer id');
      if (!selectTrainee.get(traineeId)) throw validationError('Trainee not found.');
      if (volunteerId !== null && !selectVolunteer.get(volunteerId)) {
        throw validationError('Volunteer not found.');
      }
      if (selectAssignmentByPair.get(outing.id, traineeId)) {
        throw conflictError('This trainee is already assigned to the outing.');
      }
      const groupName = optionalTrimmedString(body.groupName, 'Group', { max: NAME_MAX });
      const busName = optionalTrimmedString(body.busName, 'Bus', { max: NAME_MAX });
      const result = db
        .prepare(
          `INSERT INTO outing_assignments (outing_id, trainee_id, volunteer_id, group_name, bus_name, boarded)
           VALUES (?,?,?,?,?,0)`
        )
        .run(outing.id, traineeId, volunteerId, groupName, busName);
      res.status(201).json({ data: assignmentOut(selectAssignmentById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createOutingAssignmentsRouter(db) {
  const router = Router();
  const selectAssignmentById = db.prepare(
    `SELECT ${ASSIGNMENT_COLUMNS}
       FROM outing_assignments a
       JOIN trainees t ON t.id = a.trainee_id
       JOIN volunteers v ON v.id = a.volunteer_id
      WHERE a.id = ?`
  );
  const selectVolunteer = db.prepare('SELECT id FROM volunteers WHERE id = ?');

  router.patch('/:id', (req, res, next) => {
    try {
      const id = requirePositiveId(req.params.id, 'Assignment id');
      const assignment = selectAssignmentById.get(id);
      if (!assignment) throw notFoundError('Outing assignment not found.');
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['volunteerId', 'groupName', 'busName', 'boarded'], {
        requireAtLeastOne: true,
      });
      const updates = {};
      if (body.volunteerId !== undefined) {
        const volunteerId = requireNullableId(body.volunteerId, 'Volunteer id');
        if (volunteerId !== null && !selectVolunteer.get(volunteerId)) {
          throw validationError('Volunteer not found.');
        }
        updates.volunteer_id = volunteerId;
      }
      if (body.groupName !== undefined)
        updates.group_name = optionalTrimmedString(body.groupName, 'Group', { max: NAME_MAX });
      if (body.busName !== undefined)
        updates.bus_name = optionalTrimmedString(body.busName, 'Bus', { max: NAME_MAX });
      if (body.boarded !== undefined) {
        updates.boarded = requireBooleanValue(body.boarded, 'Boarded') ? 1 : 0;
      }
      applyUpdate(db, 'outing_assignments', id, updates);
      res.json({ data: assignmentOut(selectAssignmentById.get(id)) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
