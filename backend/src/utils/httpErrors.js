// Errors that map to a specific HTTP response (see the error handler in app.js).

// 400: one or more request parameters are invalid.
// `details` is a list of { param, message }.
export class ValidationError extends Error {
  constructor(details) {
    super('Invalid request parameters');
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

// 404: the requested resource doesn't exist.
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

// 503: the database is not reachable or didn't answer in time.
export class ServiceUnavailableError extends Error {
  constructor(message = 'The service is temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.status = 503;
  }
}

// Any other error response with a stable machine-readable `code`, e.g.
// new HttpError(415, 'unsupported_type', 'Upload a PDF or DOCX file.').
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
