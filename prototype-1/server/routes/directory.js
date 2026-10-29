// Shared volunteer and trainee directories.

import { Router } from 'express';
import { applyUpdate } from '../db.js';
import {
  NAME_MAX,
  NOTES_MAX,
  notFoundError,
  optionalTrimmedString,
  rejectUnknownFields,
  requireBodyObject,
  requirePositiveId,
  requireTrimmedString,
  validationError,
} from '../validation.js';

const VOLUNTEER_FIELDS = ['name', 'email', 'phone'];
const TRAINEE_FIELDS = [
  'name',
  'caregiverName',
  'caregiverPhone',
  'supportNeeds',
  'medicalNotes',
  'dietaryNotes',
];

function volunteerOut(row) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, createdAt: row.created_at };
}

function traineeOut(row) {
  return {
    id: row.id,
    name: row.name,
    caregiverName: row.caregiver_name,
    caregiverPhone: row.caregiver_phone,
    supportNeeds: row.support_needs,
    medicalNotes: row.medical_notes,
    dietaryNotes: row.dietary_notes,
    createdAt: row.created_at,
  };
}

export function createVolunteersRouter(db) {
  const router = Router();
  const selectAll = db.prepare(
    'SELECT id, name, email, phone, created_at FROM volunteers ORDER BY name COLLATE NOCASE, id'
  );
  const selectById = db.prepare('SELECT id, name, email, phone, created_at FROM volunteers WHERE id = ?');

  router.get('/', (req, res, next) => {
    try {
      res.json({ data: selectAll.all().map(volunteerOut) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, VOLUNTEER_FIELDS);
      const record = {
        name: requireTrimmedString(body.name, 'Name'),
        email: optionalTrimmedString(body.email, 'Email', { max: NAME_MAX }),
        phone: optionalTrimmedString(body.phone, 'Phone', { max: NAME_MAX }),
      };
      const result = db
        .prepare('INSERT INTO volunteers (name, email, phone, created_at) VALUES (?,?,?,?)')
        .run(record.name, record.email, record.phone, new Date().toISOString());
      res.status(201).json({ data: volunteerOut(selectById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      const id = requirePositiveId(req.params.id, 'Volunteer id');
      if (!selectById.get(id)) throw notFoundError('Volunteer not found.');
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, VOLUNTEER_FIELDS, { requireAtLeastOne: true });
      const updates = {};
      if (body.name !== undefined) updates.name = requireTrimmedString(body.name, 'Name');
      if (body.email !== undefined)
        updates.email = optionalTrimmedString(body.email, 'Email', { max: NAME_MAX });
      if (body.phone !== undefined)
        updates.phone = optionalTrimmedString(body.phone, 'Phone', { max: NAME_MAX });
      applyUpdate(db, 'volunteers', id, updates);
      res.json({ data: volunteerOut(selectById.get(id)) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createTraineesRouter(db) {
  const router = Router();
  const columns = 'id, name, caregiver_name, caregiver_phone, support_needs, medical_notes, dietary_notes, created_at';
  const selectAll = db.prepare(
    `SELECT ${columns} FROM trainees ORDER BY name COLLATE NOCASE, id`
  );
  const selectById = db.prepare(`SELECT ${columns} FROM trainees WHERE id = ?`);

  function parseTraineeFields(body, { partial }) {
    const updates = {};
    if (!partial || body.name !== undefined)
      updates.name = requireTrimmedString(body.name, 'Name');
    if (body.caregiverName !== undefined || !partial)
      updates.caregiver_name = optionalTrimmedString(body.caregiverName, 'Caregiver name', {
        max: NAME_MAX,
      });
    if (body.caregiverPhone !== undefined || !partial)
      updates.caregiver_phone = optionalTrimmedString(body.caregiverPhone, 'Caregiver phone', {
        max: NAME_MAX,
      });
    if (body.supportNeeds !== undefined || !partial)
      updates.support_needs = optionalTrimmedString(body.supportNeeds, 'Support needs', {
        max: NOTES_MAX,
      });
    if (body.medicalNotes !== undefined || !partial)
      updates.medical_notes = optionalTrimmedString(body.medicalNotes, 'Medical notes', {
        max: NOTES_MAX,
      });
    if (body.dietaryNotes !== undefined || !partial)
      updates.dietary_notes = optionalTrimmedString(body.dietaryNotes, 'Dietary notes', {
        max: NOTES_MAX,
      });
    return updates;
  }

  router.get('/', (req, res, next) => {
    try {
      res.json({ data: selectAll.all().map(traineeOut) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, TRAINEE_FIELDS);
      const fields = parseTraineeFields(body, { partial: false });
      const result = db
        .prepare(
          `INSERT INTO trainees
             (name, caregiver_name, caregiver_phone, support_needs, medical_notes, dietary_notes, created_at)
           VALUES (?,?,?,?,?,?,?)`
        )
        .run(
          fields.name,
          fields.caregiver_name,
          fields.caregiver_phone,
          fields.support_needs,
          fields.medical_notes,
          fields.dietary_notes,
          new Date().toISOString()
        );
      res.status(201).json({ data: traineeOut(selectById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      const id = requirePositiveId(req.params.id, 'Trainee id');
      if (!selectById.get(id)) throw notFoundError('Trainee not found.');
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, TRAINEE_FIELDS, { requireAtLeastOne: true });
      const updates = parseTraineeFields(body, { partial: true });
      if (Object.keys(updates).length === 0) throw validationError('Provide at least one field to update.');
      applyUpdate(db, 'trainees', id, updates);
      res.json({ data: traineeOut(selectById.get(id)) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
