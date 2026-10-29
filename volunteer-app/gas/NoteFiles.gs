/**
 * Files attached to notes and updates (Version 4): photos, documents, videos.
 *
 * Volunteers and admins can attach up to CONFIG.NOTE_FILES.maxFiles files to an update, a
 * session note or an admin note: uploaded from their device (photos are made smaller in the
 * browser first) or picked from Google Drive. Files go into a PRIVATE Drive folder (no link
 * sharing: they're about trainees) and are only shown through the app (noteFile_), to people
 * who may read that note: admins, the volunteers the note is shared with, and the author while
 * their update waits for review.
 */

function noteFolder_() {
  return appFolder_(CONFIG.PROP_NOTE_FOLDER_ID, CONFIG.NOTE_FILES.folderName);
}

/** Saves the attached files; returns what to store in the Attachments column ('' for none). */
function saveNoteFiles_(files) {
  if (files === undefined || files === null) return '';
  if (!Array.isArray(files)) throw err_.validation('Attachments must be a list of files.');
  const cfg = CONFIG.NOTE_FILES;
  if (!files.length) return '';
  if (files.length > cfg.maxFiles) throw err_.validation(`Attach up to ${cfg.maxFiles} files.`);
  const allowed = (t) => cfg.types.indexOf(t) >= 0 || /^image\//.test(t) || /^video\//.test(t);
  let total = 0;
  const saved = files.map((raw) => {
    const f = obj_(raw, 'File');
    let file;
    if (f.driveUrl) {
      const id = driveFileId_(f.driveUrl);
      try {
        file = DriveApp.getFileById(id);
      } catch (e) {
        throw err_.validation('The app\'s Google account can\'t open that Drive file. Share it with the account the app runs as, or upload it from your device instead.');
      }
    } else {
      const mimeType = str_(f.mimeType, 'File type', { required: true, max: 120 });
      if (!allowed(mimeType)) throw err_.validation('That kind of file can\'t be attached. Use a photo, video, PDF, Office document or text file.');
      const fileName = str_(f.fileName, 'File name', { required: true, max: 200 }).replace(/[\\/:*?"<>|]+/g, '_');
      if (typeof f.data !== 'string' || !f.data) throw err_.validation('A file was not received. Choose it again.');
      let bytes;
      try {
        bytes = Utilities.base64Decode(f.data.replace(/^data:[^,]*,/, ''));
      } catch (e) {
        throw err_.validation('A file could not be read. Choose it again.');
      }
      total += bytes.length;
      if (total > cfg.maxMb * 1024 * 1024) {
        throw err_.validation(`The files are too big together: keep them under ${cfg.maxMb} MB. Photos are made smaller automatically; for a long video, use Import from Google Drive.`);
      }
      file = noteFolder_().createFile(Utilities.newBlob(bytes, mimeType, fileName));
    }
    return { id: file.getId(), name: file.getName(), type: file.getMimeType() };
  });
  return JSON.stringify(saved);
}

/** The Attachments column as a list (empty if none or unreadable). */
function attachmentsOut_(value) {
  try {
    const list = JSON.parse(String(value || '') || '[]');
    return Array.isArray(list) ? list.filter((x) => x && x.id).map((x) => ({ id: String(x.id), name: String(x.name || 'File'), type: String(x.type || '') })) : [];
  } catch (e) {
    return [];
  }
}

/** One attached file's content, for someone allowed to read its note (or their own pending update). */
function noteFile_(p, user) {
  onlyFields_(p, ['noteId', 'feedbackId', 'fileId']);
  const fileId = str_(p.fileId, 'File', { required: true, max: 120 });
  let holder;
  if (p.noteId) {
    holder = table_('traineeNotes').find((n) => n.noteId === id_(p.noteId, 'Note'));
    if (!holder) throw err_.notFound('Note not found.');
    if (user.role !== 'admin') {
      const kind = traineeAccess_(user, holder.traineeId);
      if (!notesFor_(holder.traineeId, user, kind).some((n) => n.noteId === holder.noteId)) throw err_.forbidden('You can\'t open this file.');
    }
  } else {
    holder = table_('feedback').find((f) => f.feedbackId === id_(p.feedbackId, 'Feedback'));
    if (!holder) throw err_.notFound('Update not found.');
    if (user.role !== 'admin' && holder.userId !== user.userId) throw err_.forbidden('You can\'t open this file.');
  }
  if (!attachmentsOut_(holder.attachments).some((a) => a.id === fileId)) throw err_.notFound('File not found.');
  let file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (e) {
    throw err_.notFound('This file is no longer in Google Drive.');
  }
  const blob = file.getBlob();
  return { name: file.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}
