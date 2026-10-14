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

  // Trainee pairing and notes
  AUTO_PAIR_ON_CONFIRM: true,    // confirming a booking pairs the volunteer with a free trainee automatically
  NOTES_SHOWN_TO_VOLUNTEERS: 5,  // newest shared trainee notes a paired volunteer can read
  AUTO_SHARE_OBSERVATIONS: false, // false = a leader reviews volunteer observations before they become trainee notes

  // New volunteers
  REQUIRE_GUIDE_BEFORE_BOOKING: true, // volunteers must read the Volunteer Guide once before their first booking
  DEFAULT_VENUES: ['MINDS Woodlands Gardens School'], // added to the Venues tab by setup() when it is empty
  ADD_MISSING_TRAINEE_COLUMNS: true,  // setup() adds empty columns for volunteer-visible fields the trainee tab lacks

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
        guideReadAt: 'Guide Read At',
        updatedBy: 'Details Updated By',
        updatedAt: 'Details Updated At',
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
        project: 'Project',
        capacity: 'Capacity',
        notes: 'Notes',
        traineeIds: 'Trainees Attending', // optional "T-0001, T-0004": auto-pairing picks only from these
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
        pairing: 'Pairing',      // auto | manual
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
        noteStatus: 'Note Status', // pending (waiting for a leader) | shared | private | none
        reviewedBy: 'Reviewed By',
        submittedAt: 'Submitted At',
      },
      numeric: ['rating'],
    },
    traineeNotes: {
      tab: 'Trainee Notes', // what future volunteers read about a trainee
      columns: {
        noteId: 'Note ID',
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        date: 'Date',
        note: 'Note',
        author: 'Written By',
        source: 'Source',        // Volunteer feedback | Leader
        feedbackId: 'Feedback ID',
        status: 'Status',        // shared | hidden
        addedBy: 'Added By',
        addedAt: 'Added At',
      },
    },
    venues: {
      tab: 'Venues',
      columns: {
        venueId: 'Venue ID',
        name: 'Venue',
        address: 'Address',
        notes: 'Notes',
        status: 'Status',        // active | archived
        createdBy: 'Added By',
        createdAt: 'Added At',
      },
    },
    projects: {
      tab: 'Projects',
      columns: {
        projectId: 'Project ID',
        name: 'Project',
        description: 'Description',
        schedule: 'When',
        venue: 'Usual Venue',
        order: 'Order',
        status: 'Status',        // active | archived
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
      numeric: ['order'],
    },
    guide: {
      tab: 'Volunteer Guide', // the welcome guide new volunteers read; leaders edit it in the app
      columns: {
        sectionId: 'Section ID',
        order: 'Order',
        title: 'Title',
        body: 'Content',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
      numeric: ['order'],
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
      gender: 'Gender',
      communication: 'Communication',        // e.g. Verbal / Non-verbal / A few words + signs
      behaviours: 'Behaviours',
      takeNote: 'Things to Take Note',
      interests: 'Interests',
      supportNeeds: 'Support Needs',
      medicalNotes: 'Medical Notes',
      caregiverName: 'Caregiver Name',
      caregiverPhone: 'Caregiver Phone',
      active: 'Active',                      // optional: "No" keeps a trainee out of auto-pairing
    },
    // What a volunteer sees about their paired trainee. Keep this to what a
    // volunteer genuinely needs for the session (PDPA: collect and show the minimum).
    // Leaders always see every column above.
    volunteerVisible: ['preferredName', 'gender', 'communication', 'behaviours', 'takeNote', 'interests', 'supportNeeds'],
    // When a leader shares a volunteer observation, it becomes a row in the
    // Trainee Notes tab, and the newest one is also copied into these columns
    // on the trainee's own row. Set writeBack to null to never touch the trainee tab.
    writeBack: {
      latestObservation: 'Latest Volunteer Observation',
      observationUpdated: 'Observation Updated',
    },
  },
};
