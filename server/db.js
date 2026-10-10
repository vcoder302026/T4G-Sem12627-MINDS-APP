// Database connection, schema creation and first-run demo seeding.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';
import { addDaysISO, todayInSingapore } from './validation.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 200),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 200),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trainees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  caregiver_name TEXT NOT NULL DEFAULT '' CHECK (length(caregiver_name) <= 200),
  caregiver_phone TEXT NOT NULL DEFAULT '' CHECK (length(caregiver_phone) <= 200),
  support_needs TEXT NOT NULL DEFAULT '' CHECK (length(support_needs) <= 5000),
  medical_notes TEXT NOT NULL DEFAULT '' CHECK (length(medical_notes) <= 5000),
  dietary_notes TEXT NOT NULL DEFAULT '' CHECK (length(dietary_notes) <= 5000),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  venue TEXT NOT NULL DEFAULT '' CHECK (length(venue) <= 200),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(id),
  volunteer_id INTEGER NOT NULL REFERENCES volunteers(id),
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  CHECK (clock_out IS NULL OR clock_out >= clock_in),
  UNIQUE (session_id, volunteer_id)
);

CREATE TABLE IF NOT EXISTS fundraisers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  fundraiser_id INTEGER NOT NULL REFERENCES fundraisers(id),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  fundraiser_id INTEGER NOT NULL REFERENCES fundraisers(id),
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 200),
  customer_contact TEXT NOT NULL DEFAULT '' CHECK (length(customer_contact) <= 200),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  collection_status TEXT NOT NULL DEFAULT 'pending' CHECK (collection_status IN ('pending','collected')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL CHECK (length(product_name) BETWEEN 1 AND 200),
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS outings (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  venue TEXT NOT NULL DEFAULT '' CHECK (length(venue) <= 200),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outing_assignments (
  id INTEGER PRIMARY KEY,
  outing_id INTEGER NOT NULL REFERENCES outings(id),
  trainee_id INTEGER NOT NULL REFERENCES trainees(id),
  volunteer_id INTEGER NOT NULL REFERENCES volunteers(id),
  group_name TEXT NOT NULL DEFAULT '' CHECK (length(group_name) <= 200),
  bus_name TEXT NOT NULL DEFAULT '' CHECK (length(bus_name) <= 200),
  boarded INTEGER NOT NULL DEFAULT 0 CHECK (boarded IN (0,1)),
  UNIQUE (outing_id, trainee_id)
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  destination TEXT NOT NULL CHECK (length(trim(destination)) BETWEEN 1 AND 200),
  start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT NOT NULL CHECK (end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
  created_at TEXT NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS trip_participants (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  trainee_id INTEGER NOT NULL REFERENCES trainees(id),
  volunteer_id INTEGER REFERENCES volunteers(id),
  registration_status TEXT NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending','confirmed')),
  medical_notes TEXT NOT NULL DEFAULT '' CHECK (length(medical_notes) <= 5000),
  dietary_notes TEXT NOT NULL DEFAULT '' CHECK (length(dietary_notes) <= 5000),
  UNIQUE (trip_id, trainee_id)
);

CREATE TABLE IF NOT EXISTS trip_logistics (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done'))
);

CREATE TABLE IF NOT EXISTS trip_expenses (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0)
);

CREATE TABLE IF NOT EXISTS house_visits (
  id INTEGER PRIMARY KEY,
  trainee_id INTEGER NOT NULL REFERENCES trainees(id),
  volunteer_id INTEGER NOT NULL REFERENCES volunteers(id),
  visit_date TEXT NOT NULL CHECK (visit_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  family_notes TEXT NOT NULL DEFAULT '' CHECK (length(family_notes) <= 5000),
  daily_living_notes TEXT NOT NULL DEFAULT '' CHECK (length(daily_living_notes) <= 5000),
  social_notes TEXT NOT NULL DEFAULT '' CHECK (length(social_notes) <= 5000),
  health_notes TEXT NOT NULL DEFAULT '' CHECK (length(health_notes) <= 5000),
  follow_up TEXT NOT NULL DEFAULT '' CHECK (length(follow_up) <= 5000),
  created_at TEXT NOT NULL
);
`;

export function withTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // connection already rolled back
    }
    throw err;
  }
}

// Applies a partial UPDATE using only allow-listed snake_case column names.
export function applyUpdate(db, table, id, columns) {
  const keys = Object.keys(columns);
  if (keys.length === 0) return;
  const sql = `UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map((key) => columns[key]), id);
}

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  seedDemoDataIfEmpty(db);
  return db;
}

function seedDemoDataIfEmpty(db) {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;

  withTransaction(db, () => {
    const now = new Date().toISOString();
    const today = todayInSingapore();

    const { hash, salt } = hashPassword('MindsDemo123!');
    db.prepare(
      'INSERT INTO users (username, password_hash, password_salt, name, created_at) VALUES (?,?,?,?,?)'
    ).run('admin', hash, salt, 'MINDS Demo Admin', now);

    const insertVolunteer = db.prepare(
      'INSERT INTO volunteers (name, email, phone, created_at) VALUES (?,?,?,?)'
    );
    insertVolunteer.run('Demo Volunteer A', 'demo.volunteer.a@example.com', '+65 9000 0001', now);
    insertVolunteer.run('Demo Volunteer B', 'demo.volunteer.b@example.com', '+65 9000 0002', now);
    insertVolunteer.run('Demo Volunteer C', 'demo.volunteer.c@example.com', '+65 9000 0003', now);

    const insertTrainee = db.prepare(
      `INSERT INTO trainees
         (name, caregiver_name, caregiver_phone, support_needs, medical_notes, dietary_notes, created_at)
       VALUES (?,?,?,?,?,?,?)`
    );
    insertTrainee.run(
      'Demo Trainee A',
      'Demo Caregiver A',
      '+65 9000 0101',
      'Needs reminders for task sequencing.',
      'No known medical conditions (demo).',
      'No dietary restrictions (demo).',
      now
    );
    insertTrainee.run(
      'Demo Trainee B',
      'Demo Caregiver B',
      '+65 9000 0102',
      'Uses a wheelchair for long distances.',
      'Mild asthma; keeps an inhaler in the day bag (demo).',
      'Avoids peanuts (demo).',
      now
    );
    insertTrainee.run(
      'Demo Trainee C',
      'Demo Caregiver C',
      '+65 9000 0103',
      'Independent in most daily activities.',
      'No known medical conditions (demo).',
      'Halal meals only (demo).',
      now
    );

    db.prepare(
      'INSERT INTO attendance_sessions (title, date, venue, created_at) VALUES (?,?,?,?)'
    ).run('Weekly Programme Session', today, 'MINDS Demo Centre', now);

    const fundraiserResult = db
      .prepare('INSERT INTO fundraisers (name, date, created_at) VALUES (?,?,?)')
      .run('Charity Bake Sale', today, now);
    const fundraiserId = Number(fundraiserResult.lastInsertRowid);
    const insertProduct = db.prepare(
      'INSERT INTO products (fundraiser_id, name, price_cents) VALUES (?,?,?)'
    );
    insertProduct.run(fundraiserId, 'Demo Cookies', 500);
    insertProduct.run(fundraiserId, 'Demo Brownie Box', 1000);

    const outingResult = db
      .prepare('INSERT INTO outings (title, date, venue, notes, created_at) VALUES (?,?,?,?,?)')
      .run('Demo Park Outing', today, 'Demo Park', 'Demo outing for the local prototype.', now);
    const outingId = Number(outingResult.lastInsertRowid);
    db.prepare(
      `INSERT INTO outing_assignments (outing_id, trainee_id, volunteer_id, group_name, bus_name, boarded)
       VALUES (?,?,?,?,?,0)`
    ).run(outingId, 1, 1, 'Group 1', 'Bus A');

    const tripResult = db
      .prepare(
        'INSERT INTO trips (title, destination, start_date, end_date, notes, created_at) VALUES (?,?,?,?,?,?)'
      )
      .run(
        'Demo Regional Exchange',
        'Demo City',
        addDaysISO(today, 7),
        addDaysISO(today, 10),
        'Demo overseas trip for the local prototype.',
        now
      );
    const tripId = Number(tripResult.lastInsertRowid);
    const traineeA = db.prepare('SELECT medical_notes, dietary_notes FROM trainees WHERE id = 1').get();
    db.prepare(
      `INSERT INTO trip_participants (trip_id, trainee_id, volunteer_id, registration_status, medical_notes, dietary_notes)
       VALUES (?,?,?,'pending',?,?)`
    ).run(tripId, 1, 1, traineeA.medical_notes, traineeA.dietary_notes);
    db.prepare(
      "INSERT INTO trip_logistics (trip_id, description, status) VALUES (?,?,'pending')"
    ).run(tripId, 'Confirm travel insurance coverage');

    db.prepare(
      `INSERT INTO house_visits
         (trainee_id, volunteer_id, visit_date, family_notes, daily_living_notes, social_notes, health_notes, follow_up, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      2,
      2,
      addDaysISO(today, -1),
      'Family is supportive and engaged during visits (demo).',
      'Manages household routines with occasional prompts (demo).',
      'Enjoys chatting with neighbours (demo).',
      'No health concerns raised this visit (demo).',
      'Check transport subsidy application next month (demo).',
      now
    );
  });
}
