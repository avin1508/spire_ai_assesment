import express from 'express';
import { getDbState } from './config/db.js';
import { getRedisState } from './config/redis.js';
import jobsRouter from './routes/jobs.routes.js';
import resumesRouter from './routes/resumes.routes.js';
import recommendationsRouter from './routes/recommendations.routes.js';

// MongoDB driver errors that mean "database unavailable or too slow".
const UNAVAILABLE_ERRORS = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
]);
const MAX_TIME_EXPIRED = 50; // MongoDB error code for maxTimeMS

// Upload (multer) limit errors → status + code.
const UPLOAD_ERRORS = {
  LIMIT_FILE_SIZE: [413, 'file_too_large', 'The file is larger than 5 MB.'],
  LIMIT_FILE_COUNT: [400, 'invalid_request', 'Upload one file at a time.'],
  LIMIT_UNEXPECTED_FILE: [400, 'invalid_request', 'Attach the resume as the "file" field.'],
  LIMIT_PART_COUNT: [400, 'invalid_request', 'Send only the resume file.'],
  LIMIT_FIELD_COUNT: [400, 'invalid_request', 'Send only the resume file.'],
};

// Error text without any credential-bearing URI.
const safeMessage = (error) =>
  String(error?.message ?? error).replace(/(mongodb(\+srv)?|rediss?):\/\/[^@\s]+@/g, '$1://<redacted>@');

// The Express app without starting a server (server.js connects and listens;
// tests use it directly).
export function createApp() {
  const app = express();
  app.use(express.json());

  // 200 when MongoDB is connected and Redis is connected (or not configured).
  app.get('/health', (req, res) => {
    const database = getDbState();
    const redis = getRedisState();
    const healthy = database === 'connected' && (redis === 'connected' || redis === 'not_configured');
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      database,
      redis,
    });
  });

  app.use('/api/jobs', jobsRouter);
  app.use('/api/resumes', resumesRouter);
  app.use('/api/recommendations', recommendationsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
  });

  // Error responses: { error, message, details? }. (Express needs all 4 arguments.)
  app.use((error, req, res, next) => {
    if (error.name === 'MulterError') {
      const [status, code, message] = UPLOAD_ERRORS[error.code] ?? [400, 'invalid_request', 'Invalid upload.'];
      res.status(status).json({ error: code, message });
      return;
    }
    // Errors that carry their own code (HttpError), e.g. 401 / 409 / 413 / 415.
    if (error.code && typeof error.code === 'string' && error.status >= 400 && error.status < 600 && error.status !== 500) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    if (error.status === 400 || error.status === 404) {
      res.status(error.status).json({
        error: error.status === 400 ? 'invalid_request' : 'not_found',
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_request', message: 'Malformed JSON body' });
      return;
    }
    const unavailable =
      error.status === 503 || UNAVAILABLE_ERRORS.has(error.name) || error.code === MAX_TIME_EXPIRED;
    console.error(`${req.method} ${req.path} failed: ${error.name}: ${safeMessage(error)}`);
    if (unavailable) {
      res.status(503).json({
        error: 'service_unavailable',
        message: req.path.startsWith('/api/resumes')
          ? 'Resume processing is temporarily unavailable. Please try again.'
          : req.path.startsWith('/api/recommendations')
            ? 'Recommendations are temporarily unavailable. Please try again.'
            : 'Jobs are temporarily unavailable. Please try again.',
      });
      return;
    }
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  });

  return app;
}
