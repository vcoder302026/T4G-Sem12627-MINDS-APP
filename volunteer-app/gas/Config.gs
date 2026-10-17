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
 *                                     (admins can also set this in the app: Admin → Settings → Databases)
 *   NEW_ADMIN_PASSWORD      one-off   type the shared MINDS admin password here, then run
 *                                     setAdminPassword(); the property is deleted straight after
 *   APP_SECRET              automatic created by setup(); signs logins and QR codes
 *   ADMIN_PASSWORD_HASH/SALT, ADMIN_VERSION  automatic (never type these)
 *
 * OTHER DATABASES
 * Links to other Google Sheets (a separate volunteer list, the trainee list,
 * the house-visit form responses, an existing pairs sheet) and the Drive folder
 * for photos are typed into the "Data Sources" tab, or in the app under
 * Admin → Settings → Databases. Each link can point at one tab (…#gid=123).
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
  PROP_NEW_ADMIN_PASSWORD: 'NEW_ADMIN_PASSWORD',
  PROP_ADMIN_HASH: 'ADMIN_PASSWORD_HASH',
  PROP_ADMIN_SALT: 'ADMIN_PASSWORD_SALT',
  PROP_ADMIN_VERSION: 'ADMIN_VERSION',
  PROP_FILES_FOLDER_ID: 'FILES_FOLDER_ID',

  TOKEN_TTL_DAYS: 30,            // how long a phone stays signed in
  PASSWORD_ITERATIONS: 400,      // HMAC rounds per password check (~0.3–0.8 s in Apps Script)
  LOGIN_MAX_FAILURES: 5,         // per email, per 15 minutes
  MIN_MINUTES_BEFORE_CLOCK_OUT: 2, // a second scan sooner than this is ignored (stops double-scans)
  OFFLINE_SCAN_MAX_AGE_HOURS: 24,  // queued offline scans older than this are rejected
  QR_DAYS_AHEAD: 14,             // QR codes pre-issued to the phone for offline use
  FEEDBACK_WINDOW_DAYS: 14,      // how long after a session volunteers can still give feedback

  // Admin access: one shared MINDS admin password, not tied to anyone's account.
  // Anyone signed in can open Admin by typing it; every admin change is logged
  // with the name of the person who made it (the "Admin Log" tab).
  ADMIN_SESSION_HOURS: 12,       // how long admin stays unlocked on a device
  ADMIN_MAX_FAILURES: 5,         // wrong admin passwords per person, per 15 minutes

  // Regular and new volunteers
  REGULAR_AFTER_SESSIONS: 10,    // a volunteer becomes "regular" automatically after this many completed sessions
  AUTO_PAIR_REGULARS: true,      // regulars are paired with a trainee as soon as they say they're coming
  AUTO_PAIR_NEW: false,          // new / ad-hoc volunteers are paired by an admin (Admin → Sessions)
  ALLOW_SHARED_TRAINEE: true,    // admins may pair one trainee with more than one volunteer in a session.
                                 // Automatic pairing only shares a trainee between regular pairs.

  // Trainee notes and updates
  NOTES_SHOWN_TO_VOLUNTEERS: 5,  // newest shared trainee notes a paired volunteer can read
  AUTO_SHARE_OBSERVATIONS: false, // false = an admin reviews volunteer observations before they become trainee notes

  // New volunteers
  REQUIRE_GUIDE_BEFORE_BOOKING: true, // volunteers must read the Volunteer Guide once before their first sign-up
  REQUIRE_TELEGRAM: true,        // a Telegram handle is required at registration (no emergency contact is collected)
  DEFAULT_VENUES: ['MINDS Woodlands Gardens School'], // added to the Venues tab by setup() when it is empty
  ADD_MISSING_TRAINEE_COLUMNS: true,  // setup() adds empty columns for volunteer-visible fields the trainee tab lacks
  SESSION_TYPES: ['Volunteer session', 'Outing'], // overseas trips are managed separately (Admin → Overseas trips)

  // Google Contacts: each new volunteer is added as a contact in the Google
  // account that deploys the web app (Telegram handle in the contact's notes).
  SYNC_GOOGLE_CONTACTS: true,
  CONTACT_GROUP: 'MINDS Volunteers', // contact label; '' = no label

  // Photos and guide files are stored in Google Drive (private to the deploying account)
  FILES_FOLDER_NAME: 'MINDS Volunteer App Files', // created if the Data Sources tab has no folder link
  UPLOAD_MAX_MB: 5,

  /* App-owned tabs. setup() creates any that are missing and appends any
     missing headers to tabs that already exist (it never deletes or reorders). */
  TABLES: {
    users: {
      tab: 'Volunteers', // can live in another spreadsheet: Data Sources → "volunteers"
      columns: {
        userId: 'User ID',
        name: 'Full Name',
        birthday: 'Birthday',
        email: 'Email',
        phone: 'Phone',
        telegram: 'Telegram',
        volunteerType: 'Volunteer Type', // blank = automatic (regular after REGULAR_AFTER_SESSIONS) | Regular | New
        regularSince: 'Regular Since',
        status: 'Status',        // active | inactive
        createdAt: 'Registered At',
        guideReadAt: 'Guide Read At',
        googleContact: 'Google Contact', // contact ID in the admin Google account, or the last sync error
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
        type: 'Type',            // Volunteer session | Outing
        title: 'Title',          // optional; shows the type when blank
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
        status: 'Status',        // confirmed (= coming) | cancelled. Older rows may say "pending": also coming.
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        moreTrainees: 'More Trainees', // extra trainee IDs when a volunteer looks after more than one
        pairing: 'Pairing',      // auto | manual
        walkIn: 'Walk-in',
        bookedAt: 'Signed Up At',
        decidedBy: 'Changed By',
        decidedAt: 'Changed At',
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
        type: 'Type',            // Session feedback | Trainee update
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
        mediaFileId: 'Picture or PDF', // a File ID from the Files tab, or builtin:on-the-day
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
      numeric: ['order'],
    },

    /* ----- partner feedback, Oct 2026 ----- */
    pairs: {
      tab: 'Pairing List', // standing volunteer ↔ trainee pairs (many-to-many) for regular volunteers
      columns: {
        pairId: 'Pair ID',
        userId: 'Volunteer User ID',
        volunteerName: 'Volunteer',
        traineeId: 'Trainee ID',
        traineeName: 'Trainee',
        since: 'Since',
        notes: 'Notes',
        status: 'Status',        // active | ended
        source: 'Source',        // app | imported
        addedBy: 'Added By',
        addedAt: 'Added At',
        endedBy: 'Ended By',
        endedAt: 'Ended At',
      },
    },
    adminLog: {
      tab: 'Admin Log', // who did what with admin access
      columns: {
        logId: 'Log ID',
        time: 'Time',
        userId: 'User ID',
        person: 'Person',
        action: 'Action',
        details: 'Details',
      },
    },
    dataSources: {
      tab: 'Data Sources', // links to other databases; edit here or in Admin → Settings → Databases
      columns: {
        key: 'Key',
        database: 'Database',
        url: 'Sheet or Folder Link',
        tab: 'Tab Name',
        notes: 'Notes',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
    },
    fieldAccess: {
      tab: 'Trainee Field Access', // what new and regular volunteers may see about a trainee
      columns: {
        field: 'Field',
        source: 'From',          // Trainee list | Trainee updates | App
        newSee: 'New Volunteers See',
        regularSee: 'Regular Volunteers See',
        updatedBy: 'Updated By',
        updatedAt: 'Updated At',
      },
    },
    files: {
      tab: 'Files', // photos and guide pictures/PDFs, stored privately in Google Drive
      columns: {
        fileId: 'File ID',
        name: 'File Name',
        mimeType: 'Type',
        sizeKb: 'Size (KB)',
        driveId: 'Drive File ID',
        usedFor: 'Used For',     // guide | trainee-photo:T-0001
        addedBy: 'Added By',
        addedAt: 'Added At',
      },
      numeric: ['sizeKb'],
    },
    traineePhotos: {
      tab: 'Trainee Photos',
      columns: {
        traineeId: 'Trainee ID',
        traineeName: 'Trainee Name',
        fileId: 'File ID',
        addedBy: 'Added By',
        addedAt: 'Added At',
      },
    },

    /* ----- staff dashboard (web/admin/) ----- */
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
      dietaryNotes: 'Dietary Notes',
      caregiverName: 'Caregiver Name',
      caregiverPhone: 'Caregiver Phone',
      active: 'Active',                      // optional: "No" keeps a trainee out of auto-pairing
    },
    // STARTING values for what volunteers see (setup() writes them into the
    // "Trainee Field Access" tab; admins then change them in Admin → Settings).
    // Keep it to what a volunteer genuinely needs (PDPA: show the minimum).
    // Admins always see every column.
    volunteerVisible: ['preferredName', 'gender', 'communication', 'behaviours', 'takeNote', 'interests', 'supportNeeds'],
    regularAlsoVisible: ['medicalNotes', 'dietaryNotes'], // regular volunteers additionally see these
    // When an admin shares a volunteer observation, it becomes a row in the
    // Trainee Notes tab, and the newest one is also copied into these columns
    // on the trainee's own row. Set writeBack to null to never touch the trainee tab.
    writeBack: {
      latestObservation: 'Latest Volunteer Observation',
      observationUpdated: 'Observation Updated',
    },
  },

  /* The house-visit form responses ("trainee updates"): one row per visit,
     several rows per trainee. Linked in Data Sources → "traineeUpdates".
     These headers identify the visit; EVERY other column is treated as trainee
     information (shown per Trainee Field Access, and editable by volunteers). */
  TRAINEE_UPDATES: {
    tab: 'Form Responses 1',
    timestamp: 'Timestamp',
    visitDate: 'Date of Visit',
    volunteer1: 'Name of Attached Volunteer (1) - Full Name as per NRIC',
    volunteer2: 'Name of Attached Volunteer (2) - Full Name as per NRIC',
    seniorVolunteers: 'Name of Senior Volunteer(s)',
    traineeName: "Trainee's Full Name",
  },

  /* Columns looked for when importing an existing pairs sheet (Data Sources → "pairs").
     The first header found in each list is used. */
  PAIRS_IMPORT: {
    volunteerEmail: ['Volunteer Email', 'Email'],
    volunteerName: ['Volunteer', 'Volunteer Name', 'Name of Volunteer'],
    traineeId: ['Trainee ID'],
    traineeName: ['Trainee', 'Trainee Name', "Trainee's Full Name"],
  },
};

/** The databases an admin can link (Data Sources tab). */
function dataSourceDefs_() {
  return {
    volunteers: {
      label: 'Volunteer details',
      kind: 'sheet',
      tab: CONFIG.TABLES.users.tab,
      notes: 'The volunteer list the app signs people in with. Blank = the "Volunteers" tab of this spreadsheet.',
    },
    trainees: {
      label: 'Trainee list',
      kind: 'sheet',
      tab: CONFIG.TRAINEES.tab,
      notes: 'MINDS\'s trainee list (one row per trainee). Blank = the "Trainees" tab here (or TRAINEE_SPREADSHEET_ID).',
    },
    traineeUpdates: {
      label: 'Trainee updates (house visit form responses)',
      kind: 'sheet',
      tab: CONFIG.TRAINEE_UPDATES.tab,
      notes: 'Form responses with several rows per trainee. Volunteers\' trainee updates are added here as new rows. Blank = not used.',
    },
    pairs: {
      label: 'Existing pairs (to import)',
      kind: 'sheet',
      tab: 'Pairs',
      notes: 'A sheet of existing volunteer–trainee pairs, imported into the Pairing List. Blank = not used.',
    },
    files: {
      label: 'Photos and guide files (Drive folder)',
      kind: 'folder',
      tab: '',
      notes: 'A Google Drive folder for trainee photos and guide pictures/PDFs. Blank = a folder called "MINDS Volunteer App Files".',
    },
  };
}
