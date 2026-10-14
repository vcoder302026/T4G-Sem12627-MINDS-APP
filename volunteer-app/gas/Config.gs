/**
 * Config.gs — the one file most teams need to edit.
 *
 * HOW THE APP FINDS YOUR GOOGLE SHEET
 * The spreadsheet IDs are NOT written here. They live in Script Properties
 * (Apps Script editor → Project Settings → Script properties), so they never
 * end up in GitHub:
 *
 *   SPREADSHEET_ID          required  the existing MINDS sheet the app reads/writes
 *   TRAINEE_SPREADSHEET_ID  optional  set only if trainees live in a different file
 *   FIRST_ADMIN_EMAIL       optional  used once by makeFirstAdmin()
 *   APP_SECRET              automatic created by setup(); signs logins and QR codes
 *
 * HOW COLUMNS ARE MATCHED
 * Every table below maps a code key (left) to the header text in row 1 (right).
 * Columns are found by header text, so their order in the sheet does not
 * matter and any extra columns you already have are left untouched.
 * Rename the header text here if your sheet uses different wording.
 */
const CONFIG = {
  TIMEZONE: 'Asia/Singapore',
  TZ_OFFSET: '+08:00', // Singapore has no daylight saving, so a fixed offset is safe.

  PROP_SPREADSHEET_ID: 'SPREADSHEET_ID',
  PROP_TRAINEE_SPREADSHEET_ID: 'TRAINEE_SPREADSHEET_ID',
  PROP_SECRET: 'APP_SECRET',
  PROP_FIRST_ADMIN_EMAIL: 'FIRST_ADMIN_EMAIL',

  TOKEN_TTL_DAYS: 30,            // how long a phone stays signed in
  PASSWORD_ITERATIONS: 400,      // HMAC rounds per password check (~0.3–0.8 s in Apps Script)
  LOGIN_MAX_FAILURES: 5,         // per email, per 15 minutes
  MIN_MINUTES_BEFORE_CLOCK_OUT: 2, // a second scan sooner than this is ignored (stops double-scans)
  OFFLINE_SCAN_MAX_AGE_HOURS: 24,  // queued offline scans older than this are rejected
  ALLOW_SHARED_TRAINEE: false,   // true = two volunteers may be paired with one trainee in a session
  QR_DAYS_AHEAD: 14,             // QR codes pre-issued to the phone for offline use
  FEEDBACK_WINDOW_DAYS: 14,      // how long after a session volunteers can still give feedback

  /* App-owned tabs. setup() creates any that are missing and appends any
     missing headers to tabs that already exist (it never deletes or reorders). */
  TABLES: {
    users: {
      tab: 'Volunteers',
      columns: {
        userId: 'User ID',
        name: 'Full Name',
        birthday: 'Birthday',
        email: 'Email',
        phone: 'Phone',
        telegram: 'Telegram',
        emergencyName: 'Emergency Contact Name',
        emergencyPhone: 'Emergency Contact Phone',
        emergencyRelation: 'Emergency Contact Relationship',
        role: 'Role',            // volunteer | admin
        status: 'Status',        // active | inactive
        createdAt: 'Registered At',
      },
    },
    auth: {
      tab: '_Auth', // hidden tab: password hashes, kept apart from the staff-facing list
      hidden: true,
      columns: {
        userId: 'User ID',
        passwordHash: 'Password Hash',
        salt: 'Salt',
        tokenVersion: 'Token Version',
        updatedAt: 'Updated At',
      },
      numeric: ['tokenVersion'],
    },
    sessions: {
      tab: 'Sessions',
      columns: {
        sessionId: 'Session ID',
        title: 'Title',
        date: 'Date',
        startTime: 'Start Time',
        endTime: 'End Time',
        venue: 'Venue',
        capacity: 'Capacity',
        notes: 'Notes',
        status: 'Status',        // open | closed | cancelled
        createdBy: 'Created By',
        createdAt: 'Created At',
      },
      numeric: ['capacity'],
    },
    bookings: {
      tab: 'Bookings',
      columns: {
        bookingId: 'Booking ID',
        sessionId: 'Session ID',
        sessionDate: 'Session Date',
        sessionTitle: 'Session Title',
        userId: 'User ID',
        volunteerName: 'Volunteer Name',
        status: 'Status',        // pending | confirmed | cancelled
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        walkIn: 'Walk-in',
        bookedAt: 'Booked At',
        decidedBy: 'Confirmed By',
        decidedAt: 'Confirmed At',
      },
    },
    attendance: {
      tab: 'Attendance',
      columns: {
        attendanceId: 'Attendance ID',
        sessionId: 'Session ID',
        bookingId: 'Booking ID',
        userId: 'User ID',
        volunteerName: 'Volunteer Name',
        sessionTitle: 'Session Title',
        date: 'Date',
        clockIn: 'Clock In',
        clockOut: 'Clock Out',
        hours: 'Hours',
        clockInBy: 'Clocked In By',
        clockOutBy: 'Clocked Out By',
        method: 'Method',        // QR | QR (offline) | Manual
      },
      numeric: ['hours'],
    },
    feedback: {
      tab: 'Feedback',
      columns: {
        feedbackId: 'Feedback ID',
        sessionId: 'Session ID',
        bookingId: 'Booking ID',
        userId: 'User ID',
        volunteerName: 'Volunteer Name',
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        date: 'Session Date',
        rating: 'Session Rating (1-5)',
        sessionFeedback: 'Session Feedback',
        traineeObservation: 'Trainee Observation',
        submittedAt: 'Submitted At',
      },
      numeric: ['rating'],
    },
  },

  /* Your EXISTING trainee list. Only `id` and `name` are required; any other
     header that is not found is simply skipped. If the ID column is missing,
     setup() adds it and fills IDs (T-0001, T-0002, …) for rows with a name. */
  TRAINEES: {
    tab: 'Trainees',
    columns: {
      id: 'Trainee ID',
      name: 'Name',
      preferredName: 'Preferred Name',
      interests: 'Interests',
      communication: 'Communication Tips',
      supportNeeds: 'Support Needs',
      medicalNotes: 'Medical Notes',
      caregiverName: 'Caregiver Name',
      caregiverPhone: 'Caregiver Phone',
    },
    // What a volunteer sees about their assigned trainee. Keep this to what a
    // volunteer genuinely needs for the session (PDPA: collect and show the minimum).
    volunteerVisible: ['preferredName', 'interests', 'communication', 'supportNeeds'],
    // Volunteer observations are appended to the Feedback tab (full history).
    // The latest one is also copied into these columns on the trainee's row.
    // Set writeBack to null to never touch the trainee tab.
    writeBack: {
      latestObservation: 'Latest Volunteer Observation',
      observationUpdated: 'Observation Updated',
    },
  },
};
