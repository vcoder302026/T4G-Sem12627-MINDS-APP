// House visits: append-only history with optional trainee filtering.

import { Router } from 'express';
import {
  NOTES_MAX,
  optionalTrimmedString,
  rejectUnknownFields,
  requireBodyObject,
  requireDateString,
  requirePositiveId,
  requireTrimmedString,
  validationError,
} from '../validation.js';

function visitOut(row) {
  return {
    id: row.id,
    traineeId: row.trainee_id,
    traineeName: row.trainee_name,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
    visitDate: row.visit_date,
    familyNotes: row.family_notes,
    dailyLivingNotes: row.daily_living_notes,
    socialNotes: row.social_notes,
    healthNotes: row.health_notes,
    followUp: row.follow_up,
    createdAt: row.created_at,
  };
}

export function createVisitsRouter(db) {
  const router = Router();

  const selectAll = db.prepare(
    `SELECT h.id, h.trainee_id, t.name AS trainee_name, h.volunteer_id, v.name AS volunteer_name,
            h.visit_date, h.family_notes, h.daily_living_notes, h.social_notes, h.health_notes,
            h.follow_up, h.created_at
       FROM house_visits h
       JOIN trainees t ON t.id = h.trainee_id
       JOIN volunteers v ON v.id = h.volunteer_id
      ORDER BY h.visit_date DESC, h.id DESC`
  );
  const selectByTrainee = db.prepare(
    `SELECT h.id, h.trainee_id, t.name AS trainee_name, h.volunteer_id, v.name AS volunteer_name,
            h.visit_date, h.family_notes, h.daily_living_notes, h.social_notes, h.health_notes,
            h.follow_up, h.created_at
       FROM house_visits h
       JOIN trainees t ON t.id = h.trainee_id
       JOIN volunteers v ON v.id = h.volunteer_id
      WHERE h.trainee_id = ?
      ORDER BY h.visit_date DESC, h.id DESC`
  );
  const selectById = db.prepare(
    `SELECT h.id, h.trainee_id, t.name AS trainee_name, h.volunteer_id, v.name AS volunteer_name,
            h.visit_date, h.family_notes, h.daily_living_notes, h.social_notes, h.health_notes,
            h.follow_up, h.created_at
       FROM house_visits h
       JOIN trainees t ON t.id = h.trainee_id
       JOIN volunteers v ON v.id = h.volunteer_id
      WHERE h.id = ?`
  );
  const selectTrainee = db.prepare('SELECT id FROM trainees WHERE id = ?');
  const selectVolunteer = db.prepare('SELECT id FROM volunteers WHERE id = ?');

  router.get('/', (req, res, next) => {
    try {
      let rows;
      if (req.query.traineeId !== undefined) {
        const traineeId = requirePositiveId(req.query.traineeId, 'Trainee id');
        rows = selectByTrainee.all(traineeId);
      } else {
        rows = selectAll.all();
      }
      res.json({ data: rows.map(visitOut) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = requireBodyObject(req.body);
      rejectUnknownFields(body, [
        'traineeId',
        'volunteerId',
        'visitDate',
        'familyNotes',
        'dailyLivingNotes',
        'socialNotes',
        'healthNotes',
        'followUp',
      ]);
      const traineeId = requirePositiveId(body.traineeId, 'Trainee id');
      const volunteerId = requirePositiveId(body.volunteerId, 'Volunteer id');
      if (!selectTrainee.get(traineeId)) throw validationError('Trainee not found.');
      if (!selectVolunteer.get(volunteerId)) throw validationError('Volunteer not found.');
      const visitDate = requireDateString(body.visitDate, 'Visit date');
      const fields = {
        family_notes: optionalTrimmedString(body.familyNotes, 'Family circumstances', {
          max: NOTES_MAX,
        }),
        daily_living_notes: optionalTrimmedString(body.dailyLivingNotes, 'Daily living', {
          max: NOTES_MAX,
        }),
        social_notes: optionalTrimmedString(body.socialNotes, 'Social skills', { max: NOTES_MAX }),
        health_notes: optionalTrimmedString(body.healthNotes, 'Health', { max: NOTES_MAX }),
        follow_up: optionalTrimmedString(body.followUp, 'Follow-up', { max: NOTES_MAX }),
      };
      const result = db
        .prepare(
          `INSERT INTO house_visits
             (trainee_id, volunteer_id, visit_date, family_notes, daily_living_notes, social_notes, health_notes, follow_up, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(
          traineeId,
          volunteerId,
          visitDate,
          fields.family_notes,
          fields.daily_living_notes,
          fields.social_notes,
          fields.health_notes,
          fields.follow_up,
          new Date().toISOString()
        );
      res.status(201).json({ data: visitOut(selectById.get(Number(result.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
