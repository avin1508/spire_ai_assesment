// Thrown by service functions whose backend integration does not exist yet,
// so screens can show an honest "not available" state instead of fake data.
export class ServiceUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

// A backend request that failed: `status` is the HTTP status (0 when the
// server couldn't be reached) and `code` the API error code, if any.
export class ApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
