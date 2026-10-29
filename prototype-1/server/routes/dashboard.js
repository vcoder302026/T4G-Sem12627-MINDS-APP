// Dashboard aggregation: counts, completed volunteer hours, upcoming outings and trips.

import { Router } from 'express';
import { roundHours, sumCompletedHoursMs, hoursFromMs } from '../hours.js';
import { todayInSingapore } from '../validation.js';

export function createDashboardRouter(db) {
  const router = Router();

  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

  router.get('/', (req, res, next) => {
    try {
      const completedRecords = db
        .prepare('SELECT clock_in, clock_out FROM attendance_records WHERE clock_out IS NOT NULL')
        .all();
      const today = todayInSingapore();
      const upcomingOutings = db
        .prepare(
          'SELECT id, title, date, venue FROM outings WHERE date >= ? ORDER BY date ASC, id ASC LIMIT 5'
        )
        .all(today)
        .map((row) => ({ id: row.id, title: row.title, date: row.date, venue: row.venue }));
      const upcomingTrips = db
        .prepare(
          'SELECT id, title, destination, start_date, end_date FROM trips WHERE start_date >= ? ORDER BY start_date ASC, id ASC LIMIT 5'
        )
        .all(today)
        .map((row) => ({
          id: row.id,
          title: row.title,
          destination: row.destination,
          startDate: row.start_date,
          endDate: row.end_date,
        }));

      res.json({
        data: {
          counts: {
            volunteers: count('volunteers'),
            trainees: count('trainees'),
            attendanceSessions: count('attendance_sessions'),
            fundraisers: count('fundraisers'),
            outings: count('outings'),
            trips: count('trips'),
            visits: count('house_visits'),
          },
          completedHours: roundHours(hoursFromMs(sumCompletedHoursMs(completedRecords))),
          upcomingOutings,
          upcomingTrips,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
