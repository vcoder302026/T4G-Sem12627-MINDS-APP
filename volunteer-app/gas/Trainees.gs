/**
 * Trainees.gs — read-mostly adapter over the EXISTING trainee list.
 *
 * The app never adds, removes or reorders trainees. It only reads the columns
 * mapped in Config.gs → TRAINEES, and (optionally) writes the latest volunteer
 * observation into the two write-back columns on the trainee's own row.
 */

function traineeList_() {
  const list = traineeTable_().rows()
    .filter((r) => r.id && r.name)
    .map((r) => ({ id: String(r.id), name: r.name }));
  return sortBy_(list, (t) => t.name.toLowerCase());
}

function traineeById_(id) {
  if (!id) return null;
  return traineeTable_().find((r) => String(r.id) === String(id));
}

/** Only the fields a volunteer needs for the session (Config.gs → volunteerVisible). */
function traineeForVolunteer_(id) {
  const row = traineeById_(id);
  if (!row) return null;
  const labels = CONFIG.TRAINEES.columns;
  return {
    id: String(row.id),
    name: row.name,
    fields: CONFIG.TRAINEES.volunteerVisible
      .filter((key) => row[key] !== '' && row[key] !== undefined)
      .map((key) => ({ label: labels[key], value: String(row[key]) })),
  };
}

/** Copies the newest observation onto the trainee's row. Returns true if anything was written. */
function recordTraineeObservation_(traineeId, text, volunteerName, dateStr) {
  if (!CONFIG.TRAINEES.writeBack || !text) return false;
  const table = traineeTable_();
  const row = table.find((r) => String(r.id) === String(traineeId));
  if (!row) return false;
  const patch = {};
  if (table.hasColumn('latestObservation')) patch.latestObservation = `${dateStr} (${volunteerName}): ${text}`;
  if (table.hasColumn('observationUpdated')) patch.observationUpdated = dateStr;
  table.update(row, patch);
  return Object.keys(patch).length > 0;
}
