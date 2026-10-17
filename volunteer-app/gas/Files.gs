/**
 * Files.gs — trainee photos and Volunteer Guide pictures/PDFs.
 *
 * Files are stored in Google Drive, in the folder linked in Data Sources →
 * "files" (or a folder called FILES_FOLDER_NAME in the deploying account's
 * Drive, created the first time). They stay private to that account: the app
 * hands them to the phone through the API, after checking who is asking:
 *   guide pictures/PDFs   any signed-in volunteer
 *   a trainee's photo     admins, and volunteers allowed to see that trainee's photo
 *                         (Trainee Field Access → Photo; new volunteers only for their own trainee)
 * The "Files" tab lists every file; "Trainee Photos" links a trainee to their photo.
 */

const UPLOAD_TYPES = {
  'image/jpeg': { label: 'JPEG picture', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { label: 'PNG picture', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { label: 'WebP picture', magic: [[0x52, 0x49, 0x46, 0x46]] },
  'image/gif': { label: 'GIF picture', magic: [[0x47, 0x49, 0x46, 0x38]] },
  'application/pdf': { label: 'PDF', magic: [[0x25, 0x50, 0x44, 0x46]] },
};

function filesFolder_() {
  return memo_('filesFolder', () => {
    const row = dataSourceRows_().files;
    if (row && row.url) {
      const id = parseFolderUrl_(row.url);
      if (!id) throw err_.config('The "Photos and guide files" link in Data Sources is not a Google Drive folder link.');
      try {
        return DriveApp.getFolderById(id);
      } catch (e) {
        throw err_.config('The app cannot open the Drive folder for photos and guide files. Check the link in Admin → Settings → Databases.');
      }
    }
    const props = PropertiesService.getScriptProperties();
    const saved = props.getProperty(CONFIG.PROP_FILES_FOLDER_ID);
    if (saved) {
      try {
        return DriveApp.getFolderById(saved);
      } catch (e) {
        // deleted: make a new one below
      }
    }
    const found = DriveApp.getFoldersByName(CONFIG.FILES_FOLDER_NAME);
    const folder = found.hasNext() ? found.next() : DriveApp.createFolder(CONFIG.FILES_FOLDER_NAME);
    props.setProperty(CONFIG.PROP_FILES_FOLDER_ID, folder.getId());
    return folder;
  });
}

/** Checks an upload { name, mimeType, data (base64) } and saves it to Drive. Returns the Files row. */
function saveUpload_(p, usedFor, admin, allowed) {
  const name = str_(p.name, 'File name', { required: true, max: 120 }).replace(/[\\/:*?"<>|]+/g, '-');
  const mimeType = oneOf_(p.mimeType, 'File type', allowed || Object.keys(UPLOAD_TYPES));
  if (typeof p.data !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(p.data)) throw err_.validation('The file did not arrive. Please choose it again.');
  const bytes = Utilities.base64Decode(p.data.replace(/\s+/g, ''));
  if (!bytes.length) throw err_.validation('The file is empty.');
  if (bytes.length > CONFIG.UPLOAD_MAX_MB * 1024 * 1024) throw err_.validation(`Files can be up to ${CONFIG.UPLOAD_MAX_MB} MB.`);
  const head = bytes.slice(0, 12).map((b) => (b < 0 ? b + 256 : b));
  const okMagic = UPLOAD_TYPES[mimeType].magic.some((m) => m.every((v, i) => head[i] === v));
  if (!okMagic) throw err_.validation(`This file is not really a ${UPLOAD_TYPES[mimeType].label}.`);
  const file = filesFolder_().createFile(Utilities.newBlob(bytes, mimeType, name));
  return table_('files').insert({
    fileId: newId_('FL'),
    name,
    mimeType,
    sizeKb: Math.max(1, Math.round(bytes.length / 1024)),
    driveId: file.getId(),
    usedFor,
    addedBy: admin.name,
    addedAt: fmtDateTime_(now_()),
  });
}

/** Moves a file to the Drive bin and removes it from the Files tab. */
function deleteUpload_(fileId) {
  if (!fileId || /^builtin:/.test(fileId)) return;
  const files = table_('files');
  const row = files.find((f) => f.fileId === fileId);
  if (!row) return;
  try {
    DriveApp.getFileById(row.driveId).setTrashed(true);
  } catch (e) {
    // already gone from Drive
  }
  files.remove(row);
}

/* ---------- reading ---------- */

function getFile_(p, user, ctx) {
  onlyFields_(p, ['fileId']);
  const fileId = id_(p.fileId, 'File');
  const row = table_('files').find((f) => f.fileId === fileId);
  if (!row) throw err_.notFound('File not found.');
  const used = String(row.usedFor || '');
  let allowed = ctx.isAdmin || used === 'guide';
  if (!allowed && /^trainee-photo:/.test(used)) {
    const traineeId = used.slice('trainee-photo:'.length);
    allowed = Boolean(canViewTrainee_(user, traineeId)) && canSee_(`app|${APP_FIELDS.photo}`, volunteerTypeOf_(user).type)
      && traineePhotoId_(traineeId) === fileId;
  }
  if (!allowed) throw err_.notFound('File not found.');
  let blob;
  try {
    blob = DriveApp.getFileById(row.driveId).getBlob();
  } catch (e) {
    throw err_.notFound('This file is no longer in Google Drive.');
  }
  return { fileId, name: row.name, mimeType: row.mimeType, data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- trainee photos ---------- */

function traineePhotoId_(traineeId) {
  const map = memo_('traineePhotos', () => {
    const out = {};
    if (!spreadsheet_().getSheetByName(CONFIG.TABLES.traineePhotos.tab)) return out;
    sortBy_(table_('traineePhotos').rows(), (r) => r.addedAt).forEach((r) => { if (r.traineeId && r.fileId) out[String(r.traineeId)] = r.fileId; });
    return out;
  });
  return map[String(traineeId)] || '';
}

function uploadTraineePhoto_(p, admin) {
  onlyFields_(p, ['traineeId', 'name', 'mimeType', 'data']);
  const trainee = traineeRef_(p.traineeId, 'Trainee');
  const id = String(trainee.id);
  const old = traineePhotoId_(id);
  const file = saveUpload_(p, `trainee-photo:${id}`, admin, ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  table_('traineePhotos').insert({ traineeId: id, traineeName: trainee.name, fileId: file.fileId, addedBy: admin.name, addedAt: fmtDateTime_(now_()) });
  if (old) {
    removePhotoRows_(id, file.fileId);
    deleteUpload_(old);
  }
  delete DB_.memo.traineePhotos;
  return { photoFileId: file.fileId, message: `Saved a photo of ${trainee.name}.` };
}

/** Removes a trainee's photo rows except `keepFileId`. */
function removePhotoRows_(traineeId, keepFileId) {
  const photos = table_('traineePhotos');
  // delete from the bottom up so row numbers stay valid
  sortBy_(photos.filter((r) => String(r.traineeId) === traineeId && r.fileId !== keepFileId), (r) => -r._row).forEach((r) => {
    photos.remove(r);
  });
}

function removeTraineePhoto_(p) {
  onlyFields_(p, ['traineeId']);
  const trainee = traineeRef_(p.traineeId, 'Trainee');
  const id = String(trainee.id);
  const old = traineePhotoId_(id);
  if (!old) throw err_.conflict(`${trainee.name} has no photo.`);
  removePhotoRows_(id, '');
  deleteUpload_(old);
  delete DB_.memo.traineePhotos;
  return { photoFileId: '', message: `Removed ${trainee.name}'s photo.` };
}

/* ---------- guide pictures and PDFs ---------- */

function uploadGuideMedia_(p, admin) {
  onlyFields_(p, ['sectionId', 'name', 'mimeType', 'data']);
  const { table, row } = rowById_('guide', 'sectionId', p.sectionId, 'Guide section');
  const file = saveUpload_(p, 'guide', admin);
  const old = row.mediaFileId;
  table.update(row, Object.assign({ mediaFileId: file.fileId }, stamp_(admin)));
  deleteUpload_(old);
  return Object.assign(contentForLeaders_(), { message: `Added ${file.name} to "${row.title}".` });
}

function removeGuideMedia_(p, admin) {
  onlyFields_(p, ['sectionId']);
  const { table, row } = rowById_('guide', 'sectionId', p.sectionId, 'Guide section');
  if (!row.mediaFileId) throw err_.conflict('This section has no picture or PDF.');
  const old = row.mediaFileId;
  table.update(row, Object.assign({ mediaFileId: '' }, stamp_(admin)));
  deleteUpload_(old);
  return Object.assign(contentForLeaders_(), { message: `Removed the picture/PDF from "${row.title}".` });
}
