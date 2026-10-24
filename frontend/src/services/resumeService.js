import { Directory, File, Paths } from 'expo-file-system';
import { API_BASE_URL, API_TIMEOUT_MS } from '../config/api';
import { ApiError } from './errors';
import { getGuestSessionId } from '../storage/guestSession';

// Client for the backend resume API (backend/src/routes/resumes.routes.js).
// Every request identifies the guest with X-Guest-Session; the server only
// returns this guest's own uploads.

const UPLOAD_TIMEOUT_MS = 60000;

async function request(path, { method = 'GET', body, headers = {}, signal, timeoutMs = API_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener?.('abort', onAbort);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      body,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Guest-Session': await getGuestSessionId(), ...headers },
    });
  } catch (error) {
    if (timedOut) throw new ApiError('The server took too long to respond.', { status: 0, code: 'timeout' });
    if (error?.name === 'AbortError') throw error;
    throw new ApiError("Couldn't reach the server. Check your connection.", { status: 0, code: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body: handled below.
  }
  if (!response.ok) {
    throw new ApiError(data?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: data?.error ?? null,
    });
  }
  return data;
}

/**
 * Uploads a PDF/DOCX resume for processing.
 * → { jobId, resumeId, status: 'queued', pollAfterMs, file }
 * `idempotencyKey` must be the same when retrying the same upload, so the
 * server never creates a second job for it.
 */
export function submitResume(file, { idempotencyKey, signal } = {}) {
  // The app's global fetch is expo/fetch, which doesn't accept React Native's
  // { uri, name, type } form parts; an expo-file-system File (a Blob) works.
  // Its name (the staged copy's file name) becomes the upload's file name.
  const body = new FormData();
  body.append('file', new File(file.uri));
  return request('/api/resumes', {
    method: 'POST',
    body,
    signal,
    timeoutMs: UPLOAD_TIMEOUT_MS,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** → { jobId, status, stage, profile, error, pollAfterMs, file } */
export const getResumeJob = (jobId, { signal } = {}) =>
  request(`/api/resumes/jobs/${encodeURIComponent(jobId)}`, { signal });

/** Re-queues a failed, retryable job. → same shape as getResumeJob */
export const retryResumeJob = (jobId, { signal } = {}) =>
  request(`/api/resumes/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST', signal });

/** Makes the processed upload this guest's resume. → { resume } */
export const confirmResume = (resumeId) =>
  request(`/api/resumes/${encodeURIComponent(resumeId)}/confirm`, { method: 'POST' });

/**
 * Downloads the guest's confirmed resume into the app cache and resolves
 * with the local file. Throws ApiError (404 → the server no longer has it).
 */
export async function downloadResume(resume) {
  const dir = new Directory(Paths.cache, 'resume-download');
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, resume.name.replace(/[^\w.-]+/g, '_') || `resume.${resume.kind ?? 'pdf'}`);
  if (target.exists) target.delete();
  try {
    return await File.downloadFileAsync(
      `${API_BASE_URL}/api/resumes/${encodeURIComponent(resume.resumeId)}/download`,
      target,
      { headers: { 'X-Guest-Session': await getGuestSessionId() } }
    );
  } catch (error) {
    const message = String(error?.message ?? '');
    if (/\b404\b/.test(message)) {
      throw new ApiError('This resume is no longer available. Please upload it again.', { status: 404, code: 'file_missing' });
    }
    throw new ApiError("Couldn't download your resume. Check your connection and try again.", { status: 0, code: 'network' });
  }
}
