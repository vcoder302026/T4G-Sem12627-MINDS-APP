// Fetch wrapper for the /api routes. Uses same-origin cookies, decodes the
// {data}/{error} envelope, and reports session expiry via a callback.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function request(method, path, body) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the local server. Check that it is still running.');
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // non-JSON response body
  }
  if (!response.ok) {
    const code = payload?.error?.code || 'UNKNOWN';
    const message = payload?.error?.message || `Request failed (${response.status}).`;
    if (response.status === 401 && path !== '/api/auth/login' && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(response.status, code, message);
  }
  if (payload === null || typeof payload !== 'object' || !('data' in payload)) {
    throw new ApiError(0, 'BAD_RESPONSE', 'The server returned an unexpected response.');
  }
  return payload.data;
}

export const api = {
  get(path) {
    return request('GET', path);
  },
  post(path, body = {}) {
    return request('POST', path, body);
  },
  patch(path, body) {
    return request('PATCH', path, body);
  },
};
