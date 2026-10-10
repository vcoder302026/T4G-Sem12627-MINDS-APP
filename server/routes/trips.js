// Overseas trips: participants with per-trip medical/dietary notes,
// logistics checklist and expenses.

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
  requireDateString,
  requireEnumValue,
  requireMoneyCents,
  requireNullableId,
  requirePositiveId,
  requireTrimmedString,
  validationError,
} from '../validation.js';

function tripOut(row) {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function participantOut(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    traineeId: row.trainee_id,
    traineeName: row.trainee_name,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
    registrationStatus: row.registration_status,
    medicalNotes: row.medical_notes,
    dietaryNotes: row.dietary_notes,
  };
}

function logisticsOut(row) {
  return { id: row.id, tripId: row.trip_id, description: row.description, status: row.status };
}

function expenseOut(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    description: row.description,
    amountCents: row.amount_cents,
  };
}

const PARTICIPANT_COLUMNS = `p.id, p.trip_id, p.trainee_id, t.name AS trainee_name,
  p.volunteer_id, v.name AS volunteer_name, p.registration_status, p.medical_notes, p.dietary_notes`;

export function createTripsRouter(db) {
  const router = Router();

  const selectAll = db.prepare(
    'SELECT id, title, destination, start_date, end_date, notes, created_at FROM trips ORDER BY start_date ASC, id ASC'
  );
  const selectById = db.prepare(
    'SELECT id, title, destination, start_date, end_date, notes, created_at FROM trips WHERE id = ?'
  );
  const selectParticipants = db.prepare(
    `SELECT ${PARTICIPANT_COLUMNS}
       FROM trip_participants p
       JOIN trainees t ON t.id = p.trainee_id
       LEFT JOIN volunteers v ON v.id = p.volunteer_id
      WHERE p.trip_id = ?
      ORDER BY t.name COLLATE NOCASE, p.id`
  );
  const selectLogistics = db.prepare(
    'SELECT id, trip_id, description, status FROM trip_logistics WHERE trip_id = ? ORDER BY id'
  );
  const selectExpenses = db.prepare(
    'SELECT id, trip_id, description, amount_cents FROM trip_expenses WHERE trip_id = ? ORDER BY id'
  );
  const selectParticipantByPair = db.prepare(
    'SELECT id FROM trip_participants WHERE trip_id = ? AND trainee_id = ?'
  );
  const selectTrainee = db.prepare(
    'SELECT id, name, medical_notes, dietary_notes FROM trainees WHERE id = ?'
  );
  const selectVolunteer = db.prepare('SELECT id FROM volunteers WHERE id = ?');

  function loadTrip(idParam) {
    const id = requirePositiveId(idParam, 'Trip id');
    const trip = selectById.get(id);
    if (!trip) throw notFoundError('Trip not found.');
    return trip;
  }

  router.get('/', (req, res, next) => {
    try {
      res.json({ data: selectAll.all().map(tripOut) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['title', 'destination', 'startDate', 'endDate', 'notes']);
      const title = requireTrimmedString(body.title, 'Title');
      const destination = requireTrimmedString(body.destination, 'Destination');
      const startDate = requireDateString(body.startDate, 'Start date');
      const endDate = requireDateString(body.endDate, 'End date');
      if (endDate < startDate) {
        throw validationError('End date must be on or after the start date.');
      }
      const notes = optionalTrimmedString(body.notes, 'Notes', { max: NOTES_MAX });
      const result = db
        .prepare(
          'INSERT INTO trips (title, destination, start_date, end_date, notes, created_at) VALUES (?,?,?,?,?,?)'
        )
        .run(title, destination, startDate, endDate, notes, new Date().toISOString());
      res.status(201).json({ data: tripOut(selectById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const trip = loadTrip(req.params.id);
      const participants = selectParticipants.all(trip.id).map(participantOut);
      const logistics = selectLogistics.all(trip.id).map(logisticsOut);
      const expenses = selectExpenses.all(trip.id).map(expenseOut);
      const totalExpenseCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
      res.json({
        data: { trip: tripOut(trip), participants, logistics, expenses, totalExpenseCents },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/participants', (req, res, next) => {
    try {
      const trip = loadTrip(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['traineeId', 'volunteerId']);
      const traineeId = requirePositiveId(body.traineeId, 'Trainee id');
      const volunteerId = requireNullableId(body.volunteerId, 'Volunteer id');
      const trainee = selectTrainee.get(traineeId);
      if (!trainee) throw validationError('Trainee not found.');
      if (volunteerId !== null && !selectVolunteer.get(volunteerId)) {
        throw validationError('Volunteer not found.');
      }
      if (selectParticipantByPair.get(trip.id, traineeId)) {
        throw conflictError('This trainee is already registered for the trip.');
      }
      const result = db
        .prepare(
          `INSERT INTO trip_participants (trip_id, trainee_id, volunteer_id, registration_status, medical_notes, dietary_notes)
           VALUES (?,?,?,'pending',?,?)`
        )
        .run(trip.id, traineeId, volunteerId, trainee.medical_notes, trainee.dietary_notes);
      const participant = db
        .prepare(
          `SELECT ${PARTICIPANT_COLUMNS}
             FROM trip_participants p
             JOIN trainees t ON t.id = p.trainee_id
             LEFT JOIN volunteers v ON v.id = p.volunteer_id
            WHERE p.id = ?`
        )
        .get(Number(result.lastInsertRowid));
      res.status(201).json({ data: participantOut(participant) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/logistics', (req, res, next) => {
    try {
      const trip = loadTrip(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['description']);
      const description = requireTrimmedString(body.description, 'Description');
      const result = db
        .prepare("INSERT INTO trip_logistics (trip_id, description, status) VALUES (?,?,'pending')")
        .run(trip.id, description);
      const row = db
        .prepare('SELECT id, trip_id, description, status FROM trip_logistics WHERE id = ?')
        .get(Number(result.lastInsertRowid));
      res.status(201).json({ data: logisticsOut(row) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/expenses', (req, res, next) => {
    try {
      const trip = loadTrip(req.params.id);
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['description', 'amountCents']);
      const description = requireTrimmedString(body.description, 'Description');
      const amountCents = requireMoneyCents(body.amountCents, 'Amount');
      const result = db
        .prepare('INSERT INTO trip_expenses (trip_id, description, amount_cents) VALUES (?,?,?)')
        .run(trip.id, description, amountCents);
      const row = db
        .prepare('SELECT id, trip_id, description, amount_cents FROM trip_expenses WHERE id = ?')
        .get(Number(result.lastInsertRowid));
      res.status(201).json({ data: expenseOut(row) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createTripParticipantsRouter(db) {
  const router = Router();
  const selectParticipantById = db.prepare(
    `SELECT ${PARTICIPANT_COLUMNS}
       FROM trip_participants p
       JOIN trainees t ON t.id = p.trainee_id
       LEFT JOIN volunteers v ON v.id = p.volunteer_id
      WHERE p.id = ?`
  );
  const selectVolunteer = db.prepare('SELECT id FROM volunteers WHERE id = ?');

  router.patch('/:id', (req, res, next) => {
    try {
      const id = requirePositiveId(req.params.id, 'Participant id');
      if (!selectParticipantById.get(id)) throw notFoundError('Trip participant not found.');
      const body = requireBodyObject(req.body);
      rejectUnknownFields(
        body,
        ['volunteerId', 'registrationStatus', 'medicalNotes', 'dietaryNotes'],
        { requireAtLeastOne: true }
      );
      const updates = {};
      if (body.volunteerId !== undefined) {
        const volunteerId = requireNullableId(body.volunteerId, 'Volunteer id');
        if (volunteerId !== null && !selectVolunteer.get(volunteerId)) {
          throw validationError('Volunteer not found.');
        }
        updates.volunteer_id = volunteerId;
      }
      if (body.registrationStatus !== undefined) {
        updates.registration_status = requireEnumValue(
          body.registrationStatus,
          'Registration status',
          ['pending', 'confirmed']
        );
      }
      if (body.medicalNotes !== undefined) {
        updates.medical_notes = optionalTrimmedString(body.medicalNotes, 'Medical notes', {
          max: NOTES_MAX,
        });
      }
      if (body.dietaryNotes !== undefined) {
        updates.dietary_notes = optionalTrimmedString(body.dietaryNotes, 'Dietary notes', {
          max: NOTES_MAX,
        });
      }
      applyUpdate(db, 'trip_participants', id, updates);
      res.json({ data: participantOut(selectParticipantById.get(id)) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createTripLogisticsRouter(db) {
  const router = Router();
  const selectLogisticsById = db.prepare(
    'SELECT id, trip_id, description, status FROM trip_logistics WHERE id = ?'
  );

  router.patch('/:id', (req, res, next) => {
    try {
      const id = requirePositiveId(req.params.id, 'Logistics item id');
      if (!selectLogisticsById.get(id)) throw notFoundError('Logistics item not found.');
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, ['status']);
      const status = requireEnumValue(body.status, 'Status', ['pending', 'done']);
      applyUpdate(db, 'trip_logistics', id, { status });
      res.json({ data: logisticsOut(selectLogisticsById.get(id)) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
