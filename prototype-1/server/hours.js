// Attendance hour calculations. Durations are computed from stored
// timestamps; no second hours value is ever stored.

export function recordHoursMs(record) {
  if (!record.clock_out || !record.clock_in) return null;
  return Date.parse(record.clock_out) - Date.parse(record.clock_in);
}

export function sumCompletedHoursMs(records) {
  let totalMs = 0;
  for (const record of records) {
    const ms = recordHoursMs(record);
    if (ms !== null && ms > 0) totalMs += ms;
  }
  return totalMs;
}

export function roundHours(hours) {
  return Math.round(hours * 100) / 100;
}

export function hoursFromMs(ms) {
  return ms / 3_600_000;
}
