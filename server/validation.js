// Shared validation helpers and HTTP errors.

export const NAME_MAX = 200;
export const NOTES_MAX = 5000;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function validationError(message) {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}

export function unauthorizedError(message) {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function forbiddenError(message) {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function notFoundError(message) {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function conflictError(message) {
  return new HttpError(409, 'CONFLICT', message);
}

export function requireBodyObject(body, what = 'Request body') {
  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError(`${what} must be a JSON object.`);
  }
  return body;
}

export function rejectUnknownFields(body, allowedFields, { requireAtLeastOne = false } = {}) {
  const keys = Object.keys(body);
  for (const key of keys) {
    if (!allowedFields.includes(key)) {
      throw validationError(`Unknown field "${key}".`);
    }
  }
  if (requireAtLeastOne && keys.length === 0) {
    throw validationError('Provide at least one field to update.');
  }
}

export function requireTrimmedString(value, field, { max = NAME_MAX } = {}) {
  if (typeof value !== 'string') {
    throw validationError(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw validationError(`${field} is required.`);
  }
  if (trimmed.length > max) {
    throw validationError(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

export function optionalTrimmedString(value, field, { max = NAME_MAX } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw validationError(`${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw validationError(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

export function requireDateString(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${field} must be a date in YYYY-MM-DD format.`);
  }
  if (!isValidDateString(value)) {
    throw validationError(`${field} is not a valid calendar date.`);
  }
  return value;
}

export function requirePositiveId(value, field) {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value.trim());
  if (!Number.isInteger(value) || value < 1) {
    throw validationError(`${field} must be a positive integer.`);
  }
  return value;
}

export function requireNullableId(value, field) {
  if (value === undefined || value === null) return null;
  return requirePositiveId(value, field);
}

export function requireEnumValue(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw validationError(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

export function requireMoneyCents(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw validationError(`${field} must be a non-negative whole number of cents.`);
  }
  return value;
}

export function requirePositiveCount(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw validationError(`${field} must be a whole number of at least 1.`);
  }
  return value;
}

export function requireBooleanValue(value, field) {
  if (typeof value !== 'boolean') {
    throw validationError(`${field} must be true or false.`);
  }
  return value;
}

// Singapore calendar helpers (the prototype operates in Asia/Singapore).
export function todayInSingapore() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

export function addDaysISO(dateString, days) {
  const utc = new Date(`${dateString}T00:00:00.000Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
