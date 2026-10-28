/**
 * Config.gs — the one file most teams need to edit.
 *
 * HOW THE APP FINDS YOUR GOOGLE SHEET
 * The spreadsheet IDs are NOT written here. They live in Script Properties
 * (Apps Script editor → Project Settings → Script properties), so they never
 * end up in GitHub:
 *
 *   SPREADSHEET_ID          required  the volunteer sheet the app reads/writes
 *   TRAINEE_SPREADSHEET_ID  optional  set only if trainees live in a different file
 *                                     (e.g. the House Visit form's response sheet)
 *
 *   Either property may be the sheet's ID or its full URL. A URL that ends in
 *   #gid=123 also picks the tab, so the trainee list can be any tab of any file.
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
  PROP_VISITS_SPREADSHEET_ID: 'VISITS_SPREADSHEET_ID', // optional: house visit records in their own sheet (else the volunteer sheet)
  PROP_SECRET: 'APP_SECRET',
  PROP_FIRST_ADMIN_EMAIL: 'FIRST_ADMIN_EMAIL',
  PROP_GUIDE_FOLDER_ID: 'GUIDE_FOLDER_ID', // automatic: the Drive folder for guide infographics (created on first upload)
  PROP_PHOTO_FOLDER_ID: 'PHOTO_FOLDER_ID', // automatic: the Drive folder for trainee photos (created on first upload)
  // Google Contacts (Contacts.gs): set CONTACTS_SYNC to "on" to save new and edited
  // volunteers as contacts in the Google account the app runs as. CONTACTS_LABEL
  // names the contact label (default "MINDS Volunteers"; use e.g. "MINDS Volunteers (Exp)" for testing).
  PROP_CONTACTS_SYNC: 'CONTACTS_SYNC',
  PROP_CONTACTS_LABEL: 'CONTACTS_LABEL',
  PROP_CONTACTS_GROUP: 'CONTACTS_GROUP', // automatic: "label|contactGroups/…"

  TOKEN_TTL_DAYS: 30,            // how long a phone stays signed in
  PASSWORD_ITERATIONS: 400,      // HMAC rounds per password check (~0.3–0.8 s in Apps Script)
  LOGIN_MAX_FAILURES: 5,         // per email, per 15 minutes
  MIN_MINUTES_BEFORE_CLOCK_OUT: 2, // a second scan sooner than this is ignored (stops double-scans)
  OFFLINE_SCAN_MAX_AGE_HOURS: 24,  // queued offline scans older than this are rejected
  ALLOW_SHARED_TRAINEE: true,    // a trainee may have several volunteers in one session (a volunteer may also have several trainees)
  QR_DAYS_AHEAD: 14,             // QR codes pre-issued to the phone for offline use
  FEEDBACK_WINDOW_DAYS: 14,      // how long after a session volunteers can still give feedback

  // Volunteer types. Everyone starts as a "volunteer" (new / ad hoc) and becomes a
  // "regular" after attending this many sessions, or when an admin promotes them.
  REGULAR_AFTER_SESSIONS: 10,

  // Trainee pairing and notes. A regular's fixed trainee (set by an admin under
  // Pairing → Regular pairings) is applied every time they say they're coming.
  // Volunteers (ad hoc) are paired by an admin on the session's pairing board.
  APPLY_STANDING_PAIRINGS: true,
  NOTES_SHOWN_TO_VOLUNTEERS: 5,  // newest shared trainee notes a paired volunteer can read
  AUTO_SHARE_OBSERVATIONS: false, // false = a leader reviews volunteer observations before they become trainee notes

  // New volunteers
  REQUIRE_GUIDE_BEFORE_BOOKING: true, // volunteers must read the Volunteer Guide once before their first booking
  // Infographics in the Volunteer Guide (images or PDFs). Uploads go to a Google
  // Drive folder owned by the account the app runs as, shared "anyone with the
  // link can view" so volunteers (who don't sign in to Google) can see them.
  GUIDE_FILES: {
    folderName: 'MINDS Volunteer App – Guide infographics',
    maxMb: 8,
    types: { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image', 'application/pdf': 'pdf' },
  },
  // Trainee photos, added by admins on a trainee's admin page. Stored like the
  // guide's infographics (a Drive folder, link-shared so volunteers' phones can show them).
  // Everyone who can open a trainee (their paired volunteer, regulars, admins) sees the photo.
  TRAINEE_PHOTOS: {
    folderName: 'MINDS Volunteer App – Trainee photos',
    maxMb: 5,
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },
  DEFAULT_VENUES: ['MINDS Woodlands Gardens School'], // added to the Venues tab by setup() when it is empty

  // Adding a session: the dropdowns are filled in with the first option, so an
  // admin only picks the date. Add options here (e.g. a morning slot) as needed.
  SESSION_OPTIONS: {
    titles: ['Regular session'],
    times: [{ label: '2:30 pm – 5:30 pm', startTime: '14:30', endTime: '17:30' }],
    venue: 'MINDS Woodlands Gardens School', // the venue chosen by default (must be on the Venues tab)
    // Projects ticked by default. setup() adds any that aren't on the Projects tab yet.
    projects: ['West End', 'RSPID (WGS)'],
  },
  // Projects renamed to match the registration form (WGS = Woodlands Gardens School).
  // setup() renames them on the Projects tab and in sessions; old names keep working.
  PROJECT_RENAMES: {
    'West End (WE)': 'West End',
    'Regular Service Project for the Intellectually Disabled (RSPID)': 'RSPID (WGS)',
  },
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
        role: 'Role',            // volunteer | admin  (admin = can use the Admin menu)
        volunteerType: 'Volunteer Type', // volunteer (new / ad hoc) | regular
        typeSetBy: 'Type Set By',        // "Automatic (10 sessions)" or the admin who changed it
        typeSetAt: 'Type Set At',
        contactId: 'Google Contact ID',  // automatic (Contacts.gs): people/c… in the app's Google account
        contactStatus: 'Google Contact', // automatic: "Saved …", "Updated …" or "Failed …: reason"
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
        project: 'Project',      // one or more projects, e.g. "West End, RSPID (WGS)"
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
        status: 'Status',        // confirmed ("coming") | cancelled  (older rows may say pending)
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        pairing: 'Pairing',      // standing (a regular's fixed trainee) | manual (set by an admin)
        walkIn: 'Walk-in',
        bookedAt: 'Booked At',
        decidedBy: 'Updated By',
        decidedAt: 'Updated At',
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
        method: 'Method',        // QR | QR (offline) | Manual | Dashboard
        editedBy: 'Edited By',   // staff who corrected the times on the dashboard
        editedAt: 'Edited At',
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
        source: 'Source',        // Volunteer feedback | Volunteer update | Leader
        feedbackId: 'Feedback ID',
        status: 'Status',        // shared | hidden (= private)
        audience: 'Shared With', // all | regular | selected | private (see NOTE_AUDIENCES)
        sharedWith: 'Shared With Volunteers', // user IDs, when audience = selected
        sharedWithNames: 'Shared With (Names)', // the same people by name, for reading the sheet
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
      tab: 'Volunteer Guide', // the welcome guide new volunteers read; admins edit it in the app
      columns: {
        sectionId: 'Section ID',
        order: 'Order',
        kind: 'Type',            // text (default) | image | pdf
        title: 'Title',
        body: 'Content',         // the text, or a caption under an infographic
        fileId: 'Drive File ID', // image / pdf: the file in Google Drive
        fileName: 'File Name',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
      numeric: ['order'],
    },

    pairings: {
      tab: 'Regular Pairings', // a regular volunteer's fixed trainees (one row each), set by an admin
      columns: {
        pairingId: 'Pairing ID',
        userId: 'User ID',
        volunteerName: 'Volunteer Name',
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        status: 'Status',        // active | ended
        createdBy: 'Set By',
        createdAt: 'Set At',
        endedBy: 'Ended By',
        endedAt: 'Ended At',
      },
    },
    adminLog: {
      tab: 'Admin Activity Log', // every change an admin makes in the app, newest at the bottom
      columns: {
        logId: 'Log ID',
        at: 'When',
        adminId: 'Admin User ID',
        adminName: 'Admin',
        action: 'Action',
        summary: 'What happened',
      },
    },
    settings: {
      tab: 'App Settings', // e.g. which trainee details volunteers and regulars can see
      columns: {
        key: 'Setting',
        value: 'Value',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
    },
    traineePhotos: {
      tab: 'Trainee Photos', // one photo per trainee (a Google Drive file), set by admins in the app
      columns: {
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        fileId: 'Drive File ID',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
    },
    traineeVisibility: {
      tab: 'Trainee Visibility', // per-trainee exceptions to the default visible details
      columns: {
        traineeId: 'Trainee ID',
        audience: 'Audience',    // volunteer | regular
        fields: 'Visible Details',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
    },

    /* ----- admin sections that came from the staff dashboard ----- */
    fundraisers: {
      tab: 'Fundraisers',
      columns: {
        fundraiserId: 'Fundraiser ID',
        name: 'Fundraiser',
        description: 'Description',
        startDate: 'Start Date',
        endDate: 'End Date',
        status: 'Status',        // open | closed
        createdBy: 'Created By',
        createdAt: 'Created At',
      },
    },
    products: {
      tab: 'Products',
      columns: {
        productId: 'Product ID',
        fundraiserId: 'Fundraiser ID',
        fundraiserName: 'Fundraiser',
        name: 'Product',
        price: 'Price (SGD)',
        status: 'Status',        // active | archived
        createdBy: 'Added By',
        createdAt: 'Added At',
      },
      numeric: ['price'],
    },
    orders: {
      tab: 'Orders',
      columns: {
        orderId: 'Order ID',
        fundraiserId: 'Fundraiser ID',
        fundraiserName: 'Fundraiser',
        customerName: 'Customer',
        customerContact: 'Contact',
        items: 'Items',          // readable summary, e.g. "2 × Cookies, 1 × Tote bag"
        total: 'Total (SGD)',    // worked out by the server from the product prices
        paymentStatus: 'Payment',     // unpaid | paid
        collectionStatus: 'Collection', // pending | collected
        notes: 'Notes',
        createdBy: 'Taken By',
        createdAt: 'Taken At',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
      numeric: ['total'],
    },
    orderItems: {
      tab: 'Order Items',
      columns: {
        itemId: 'Item ID',
        orderId: 'Order ID',
        productId: 'Product ID',
        productName: 'Product',
        quantity: 'Quantity',
        unitPrice: 'Unit Price (SGD)',
        lineTotal: 'Line Total (SGD)',
      },
      numeric: ['quantity', 'unitPrice', 'lineTotal'],
    },
    outings: {
      tab: 'Outings',
      columns: {
        outingId: 'Outing ID',
        title: 'Outing',
        date: 'Date',
        startTime: 'Start Time',
        location: 'Location',
        notes: 'Notes',
        status: 'Status',        // planned | done | cancelled
        createdBy: 'Created By',
        createdAt: 'Created At',
      },
    },
    outingAssignments: {
      tab: 'Outing Assignments',
      columns: {
        assignmentId: 'Assignment ID',
        outingId: 'Outing ID',
        outingTitle: 'Outing',
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        userId: 'Volunteer User ID',
        volunteerName: 'Volunteer Name',
        group: 'Group',
        bus: 'Bus',
        boarded: 'Boarded',      // Yes | (blank)
        boardedAt: 'Boarded At',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
    },
    trips: {
      tab: 'Trips',
      columns: {
        tripId: 'Trip ID',
        title: 'Trip',
        destination: 'Destination',
        startDate: 'Start Date',
        endDate: 'End Date',
        notes: 'Notes',
        status: 'Status',        // planning | confirmed | done | cancelled
        createdBy: 'Created By',
        createdAt: 'Created At',
      },
    },
    tripParticipants: {
      tab: 'Trip Participants',
      columns: {
        participantId: 'Participant ID',
        tripId: 'Trip ID',
        tripTitle: 'Trip',
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        userId: 'Volunteer User ID',
        volunteerName: 'Volunteer Name',
        status: 'Status',        // registered | confirmed | withdrawn
        medicalNotes: 'Medical Notes (for this trip)', // copied from the trainee at sign-up
        dietaryNotes: 'Dietary Notes (for this trip)',
        notes: 'Notes',
        registeredBy: 'Registered By',
        registeredAt: 'Registered At',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
    },
    tripLogistics: {
      tab: 'Trip Logistics',
      columns: {
        itemId: 'Item ID',
        tripId: 'Trip ID',
        description: 'Item',
        dueDate: 'Due Date',
        status: 'Status',        // pending | done
        doneBy: 'Done By',
        doneAt: 'Done At',
        createdBy: 'Added By',
        createdAt: 'Added At',
      },
    },
    tripExpenses: {
      tab: 'Trip Expenses',
      columns: {
        expenseId: 'Expense ID',
        tripId: 'Trip ID',
        description: 'Expense',
        amount: 'Amount (SGD)',
        date: 'Date',
        paidBy: 'Paid By',
        createdBy: 'Added By',
        createdAt: 'Added At',
      },
      numeric: ['amount'],
    },
    houseVisits: {
      tab: 'House Visits',
      book: 'visits', // lives in the house visit database (VISITS_SPREADSHEET_ID), or the volunteer sheet if not set
      columns: {
        visitId: 'Visit ID',
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        userId: 'Volunteer User ID',
        volunteerName: 'Volunteer Name',
        date: 'Visit Date',
        family: 'Family',
        dailyLiving: 'Daily Living',
        social: 'Social',
        health: 'Health',
        followUp: 'Follow-up',
        createdBy: 'Recorded By',
        createdAt: 'Recorded At',
      },
    },
  },

  /* Your EXISTING trainee list. Only `id` and `name` are required; any other
     header that is not found is simply skipped. If the ID column is missing,
     setup() adds it and fills IDs (T-0001, T-0002, …) for rows with a name.
     A list of headers means "whichever of these the sheet has", so the same
     code reads the simple demo list and MINDS's House Visit form responses. */
  TRAINEES: {
    tab: 'Trainees', // ignored when TRAINEE_SPREADSHEET_ID is a URL with #gid=…
    columns: {
      id: 'Trainee ID',
      name: ['Name', 'Trainee’s Full Name', 'Full Name'],
      preferredName: ['Preferred Name', 'Trainee\'s Short Name', 'Short Name'],
      gender: 'Gender',
      communication: 'Communication',        // e.g. Verbal / Non-verbal / A few words + signs
      behaviours: 'Behaviours',
      takeNote: 'Things to Take Note',
      interests: 'Interests',
      supportNeeds: 'Support Needs',
      medicalNotes: ['Medical Notes', 'Current Health Condition （近期的身体状况）'],
      dietaryNotes: ['Dietary Notes', 'Dietary Restriction(s) (if any) （食物限制）'],
      caregiverName: ['Caregiver Name', 'Name of Caregiver / Guardian (1)'],
      caregiverPhone: ['Caregiver Phone', 'Contact Details (Home / Office / Mobile) (1)'],
      active: 'Active',                      // optional: "No" keeps a trainee out of auto-pairing
    },
    // Kept for setup(): these columns are added to a simple trainee list if missing.
    volunteerVisible: ['preferredName', 'gender', 'communication', 'behaviours', 'takeNote', 'interests', 'supportNeeds'],

    // Every column of the trainee tab is shown, grouped into sections. If the
    // trainee file has this tab (row 1 = headers, row 2 = section names, as in
    // the House Visit form's "Map (Fixed)" tab) it decides the sections;
    // otherwise SECTIONS below is used, and anything unlisted goes under "Other details".
    sectionMapTab: 'Map (Fixed)',
    sections: [
      { title: 'About', headers: ['Name', 'Preferred Name', 'Gender', 'Programme', 'Active'] },
      { title: 'For volunteers', headers: ['Communication', 'Behaviours', 'Things to Take Note', 'Interests', 'Support Needs'] },
      { title: 'Medical & Health', headers: ['Medical Notes', 'Dietary Notes'] },
      { title: 'Emergency Contacts', headers: ['Caregiver Name', 'Caregiver Phone'] },
      { title: 'Volunteers\' Observations', headers: ['Latest Volunteer Observation', 'Observation Updated'] },
    ],
    // Never shown in the app: form bookkeeping, and the form's list of attached
    // volunteers (the app keeps pairings itself, under Pairing).
    hiddenHeaders: ['Timestamp'],
    hiddenSections: ['Volunteers\' Details'],
    // The short card on a volunteer's Home shows up to 8 details, from these
    // sections first; "See all details" opens everything they're allowed to see.
    cardSections: ['For volunteers', 'Behaviour', 'Medical & Health', 'Abilities / Skills', 'Trainee\'s Details'],
    cardSkipSections: ['General Details'],

    // Default details each kind of volunteer sees (admins can change these in
    // Admin → Settings → Trainee details, and per trainee). Matched against the
    // sheet's headers and section names. MINDS to confirm the final lists.
    //  - volunteer (new / ad hoc): only their paired trainee, only these details
    //  - regular: any trainee, every detail unless an admin hides some
    visibleTo: {
      volunteer: {
        headers: ['Preferred Name', 'Trainee\'s Short Name', 'Gender', 'Spoken Language / Dialect', 'Communication', 'Behaviours',
          'Things to Take Note', 'Interests', 'Support Needs', 'Activities to avoid (e.g. running due to medical condition)',
          'Drug Allergies (if any) （药物铭感）', 'Food Allergies (if any) （食物铭感）', 'Dietary Restriction(s) (if any) （食物限制）'],
        sections: ['Behaviour', 'Abilities / Skills'],
      },
      regular: { all: true },
    },
    // When a leader shares a volunteer observation, it becomes a row in the
    // Trainee Notes tab, and the newest one is also copied into these columns
    // on the trainee's own row. Set writeBack to null to never touch the trainee tab.
    writeBack: {
      latestObservation: 'Latest Volunteer Observation',
      observationUpdated: 'Observation Updated',
    },
  },
};

/* Who can read a trainee note. Admins choose one when they review a volunteer's
   note (Trainees → Notes to review) or add or change a note on a trainee's page.
   "private" notes are kept for admins, never deleted. */
const NOTE_AUDIENCES = {
  all: { label: 'Share with all future volunteers', hint: 'Everyone paired with this trainee, and every regular.', done: 'shared with all future volunteers' },
  regular: { label: 'Share with regular volunteers only', hint: 'Regulars can read it; ad hoc volunteers can\'t.', done: 'shared with regular volunteers only' },
  selected: { label: 'Share with selected volunteers', hint: 'Only the volunteers you pick (they see it when they open this trainee).', done: 'shared with the volunteers you picked' },
  private: { label: 'Keep private (admins only)', hint: 'Kept on the trainee\'s profile for admins. Volunteers never see it.', done: 'private: only admins can read it' },
};
const NOTE_AUDIENCE_KEYS = Object.keys(NOTE_AUDIENCES);

/* The volunteer registration form: MINDS's "CONSOLIDATED VOLUNTEER RECORDS"
   Google Form, question for question. Full Name, D.O.B, Email, Contact No and
   the password are the account (always asked; Telegram is an extra, because
   admins message volunteers there). These questions follow them. Each answer is
   saved in its own column of the Volunteers tab (setup() adds missing columns).
     key       code name (letters only)        header   the column in the Volunteers tab
     type      text | textarea | choice (one) | multi (several) | yesno
               | email | phone (+65 and 8 digits) | year (YYYY) | nric4 (e.g. 123A) | matric
     options   for choice / multi; "Other" lets the volunteer type their own
     required  true = must be answered          section  heading the question is shown under
     showIf    { key, startsWith }: only asked when that answer starts with the text
               (e.g. the RSPID questions); otherwise left blank and not required
     private   true = personal particulars: shown only to the volunteer and admins
               (never to other volunteers, never saved to Google Contacts)
   To match a new version of the form: edit, add or remove entries here, run
   setup() again, and publish a new version. Old answers stay in the sheet. */
const RSPID_ONLY = { key: 'project', startsWith: 'RSPID' };
const REGISTRATION = {
  sections: ['Personal particulars', 'Project', 'Other information', 'Emergency contact'],
  fields: [
    { key: 'shortName', header: 'Short Name', label: 'Short Name', type: 'text', required: true, section: 'Personal particulars', hint: 'What trainees and staff call you, e.g. Wei Ling.' },
    { key: 'nric4', header: 'NRIC (Last 4)', label: 'NRIC (last 4 characters, e.g. 123A)', type: 'nric4', required: true, private: true, section: 'Personal particulars', placeholder: '123A' },
    { key: 'address', header: 'Address', label: 'Address', type: 'text', required: true, private: true, section: 'Personal particulars' },
    { key: 'project', header: 'Project', label: 'Project', type: 'choice', options: 'projects', alumni: ['RSPID (CTDC)', 'RSPID (WGS)'], required: true, section: 'Project' },
    // ↑ the Projects list (Settings → Guide & projects), then "<project> Alumni" for those in `alumni`.
    { key: 'courseYear', header: 'Course and Year', label: 'Course and Year [upcoming] (e.g. MAE, Y2)', type: 'text', showIf: RSPID_ONLY, section: 'Project', hint: 'RSPID volunteers.' },
    { key: 'matricNo', header: 'Matriculation Number', label: 'Matriculation Number', type: 'matric', showIf: RSPID_ONLY, private: true, section: 'Project', hint: 'RSPID volunteers.' },
    { key: 'schoolEmail', header: 'School Email', label: 'School Email', type: 'email', showIf: RSPID_ONLY, section: 'Project', hint: 'RSPID volunteers.' },
    { key: 'startYear', header: 'Start Year', label: 'Start Year (in RSPID or West End, whichever is earlier)', type: 'year', required: true, section: 'Project', placeholder: 'YYYY' },
    { key: 'shirtSize', header: 'T-Shirt Size', label: 'T-Shirt Size', type: 'choice', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], required: true, section: 'Other information' },
    { key: 'committee', header: 'Events / Project Committee Participation', label: 'Events\' / Project Committee Participation (roles/appointment, include year)', type: 'textarea', section: 'Other information', hint: 'e.g. 2017 - ACID Logs.' },
    { key: 'dietary', header: 'Dietary Restrictions', label: 'Dietary Restrictions', type: 'text', section: 'Other information' },
    { key: 'languages', header: 'Spoken Languages / Dialects', label: 'Spoken languages / dialects', type: 'text', section: 'Other information' },
    // The emergency contact (the form asks for the relationship and the number, not a name).
    { key: 'emergencyRelation', header: 'Emergency Contact Relationship', label: 'Emergency Contact\'s Relationship (e.g. Father, Mother, Wife, GF, BF...)', type: 'text', required: true, private: true, section: 'Emergency contact' },
    { key: 'emergencyPhone', header: 'Emergency Contact Phone', label: 'Emergency Contact No.', type: 'phone', required: true, private: true, section: 'Emergency contact', placeholder: '+65 91234567' },
  ],
};
/* The house visit form (Admin → More → House visits) asks the trainee sheet's
   own questions (its columns, grouped by the Map (Fixed) tab), as MINDS's House
   Visit Form does, prefilled with the trainee's current answers.
     likert        1–5 questions ("Select the … level / ability"): the words at
                   each end, as in MINDS's House Visit app (matched by a word in the question)
     shortAnswers  questions answered in one line (the rest get a bigger box) */
const HOUSE_VISIT = {
  likert: [
    { match: 'mobility', left: 'Need support to walk and can be clumsy', right: 'Agile and stable' },
    { match: 'comprehension', left: 'Very Low (unable to follow instructions)', right: 'High (able to follow instructions effectively)' },
    { match: 'verbal', left: 'Very Low (non-verbal)', right: 'High (able to engage in conversations)' },
  ],
  shortAnswers: /name|nric|contact|blood|race|size|gender|religion|height|weight|relation|language|under minds|working hours|address|location/i,
  skipHeaders: ['Timestamp'], // form bookkeeping, not a question
  // Section order, as on MINDS's House Visit Form (used by the form and the trainee pages).
  sectionOrder: ['General Details', "Volunteers' Details", "Trainee's Details", 'Emergency Contacts', 'Family Background',
    'Medical & Health', 'Behaviour', 'Abilities / Skills', 'For Working Trainees Only', 'For Schooling Trainees Only',
    'Additional Updates from Caregivers', "Volunteers' Observations"],
};

// Each registration answer has its own column in the Volunteers tab.
REGISTRATION.fields.forEach((f) => { CONFIG.TABLES.users.columns[f.key] = f.header; });

