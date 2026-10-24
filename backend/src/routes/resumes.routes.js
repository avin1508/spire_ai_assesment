import { createHash } from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import {
  confirmResume,
  createResumeUpload,
  getResumeJob,
  openResumeDownload,
  retryResumeJob,
} from '../services/resumes.service.js';
import { MAX_RESUME_BYTES } from '../services/resumeFile.js';
import { HttpError, ServiceUnavailableError } from '../utils/httpErrors.js';

// Resume upload and processing API.
//
//   POST /api/resumes                    upload (multipart, field "file") → 202 { jobId, status, … }
//   GET  /api/resumes/jobs/:jobId        processing status (+ profile when completed)
//   POST /api/resumes/jobs/:jobId/retry  re-queue a failed, retryable job
//   POST /api/resumes/:resumeId/confirm  make it the owner's resume (after profile confirm)
//   GET  /api/resumes/:resumeId/download the owner's confirmed resume file
//
// Identity: guests send X-Guest-Session (a random UUID the app generates and
// keeps). Only its SHA-256 hash is stored. Signed-in users aren't supported
// yet (the app has no verified login), so an Authorization header alone is
// rejected rather than trusted.
const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;

export const guestOwnerKey = (guestSessionId) =>
  createHash('sha256').update(`guest:${guestSessionId.toLowerCase()}`).digest('hex');

function requireOwner(req, res, next) {
  const guestSession = req.get('x-guest-session');
  if (guestSession && UUID.test(guestSession)) {
    req.owner = { type: 'guest', key: guestOwnerKey(guestSession) };
    next();
    return;
  }
  if (!guestSession && req.get('authorization')) {
    next(new HttpError(401, 'auth_not_supported', 'Signed-in access to resumes is not available yet.'));
    return;
  }
  next(new HttpError(401, 'guest_session_required', 'A valid X-Guest-Session header is required.'));
}

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    next(new ServiceUnavailableError('The database is not connected'));
    return;
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 0, parts: 1 },
}).single('file');

router.use(requireDatabase, requireOwner);

router.post('/', upload, async (req, res) => {
  const idempotencyKey = req.get('idempotency-key');
  if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new HttpError(400, 'invalid_request', 'Idempotency-Key must be 8–100 letters, digits, "-" or "_".');
  }
  if (!req.file) throw new HttpError(400, 'file_required', 'Attach the resume as the "file" field.');
  const job = await createResumeUpload({ owner: req.owner, file: req.file, idempotencyKey });
  res.status(202).json(job);
});

router.get('/jobs/:jobId', async (req, res) => {
  res.json(await getResumeJob({ owner: req.owner, jobId: req.params.jobId }));
});

router.post('/jobs/:jobId/retry', async (req, res) => {
  res.json(await retryResumeJob({ owner: req.owner, jobId: req.params.jobId }));
});

router.post('/:resumeId/confirm', async (req, res) => {
  res.json(await confirmResume({ owner: req.owner, resumeId: req.params.resumeId }));
});

router.get('/:resumeId/download', async (req, res) => {
  const file = await openResumeDownload({ owner: req.owner, resumeId: req.params.resumeId });
  const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.set({
    'Content-Type': file.contentType,
    'Content-Length': String(file.length),
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  await new Promise((resolve, reject) => {
    file.stream.once('error', reject);
    file.stream.once('end', resolve);
    file.stream.pipe(res);
  });
});

export default router;
