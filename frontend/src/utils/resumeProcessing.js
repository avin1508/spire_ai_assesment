// Resume upload + processing rules for the app, kept pure so they can be
// tested without React Native.
// (No imports: this file is also loaded by the Node test runner.)

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export const RESUME_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// 'pdf' | 'docx' | null from a file's name / MIME type.
export function resumeKind({ name = '', mimeType = '' } = {}) {
  const ext = String(name).toLowerCase().split('.').pop();
  if (ext === 'pdf' || mimeType === RESUME_MIME_TYPES.pdf) return 'pdf';
  if (ext === 'docx' || mimeType === RESUME_MIME_TYPES.docx) return 'docx';
  return null;
}

// Client-side check before upload (the server checks the content again).
// → null when OK, else a message for the user.
export function validatePickedResume(file) {
  if (!file) return 'Choose a resume file.';
  if (!resumeKind(file)) return 'Only PDF and DOCX resumes are supported.';
  if (typeof file.size === 'number' && file.size === 0) return 'This file is empty.';
  if (typeof file.size === 'number' && file.size > MAX_RESUME_BYTES) return 'This file is larger than 5 MB.';
  return null;
}

// --- processing state ----------------------------------------------------------------
//
// phase: 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'
// Only responses for the current jobId are applied, so an older job's late
// response can never replace a newer one.

export const initialProcessing = {
  phase: 'uploading',
  jobId: null,
  stage: null,
  profile: null,
  file: null,
  error: null, // { code, message, retryable }
  networkErrors: 0,
};

const MAX_CONSECUTIVE_NETWORK_ERRORS = 4;

export function processingReducer(state, action) {
  switch (action.type) {
    case 'uploadStarted':
      return { ...initialProcessing };
    case 'uploadFailed':
      return { ...state, phase: 'failed', error: action.error };
    case 'retryStarted':
      return { ...state, phase: state.jobId ? 'queued' : 'uploading', error: null, networkErrors: 0 };
    case 'status': {
      const job = action.job;
      if (!job || (state.jobId && job.jobId !== state.jobId)) return state; // stale job
      const base = { ...state, jobId: job.jobId, file: job.file ?? state.file, networkErrors: 0 };
      if (job.status === 'completed') return { ...base, phase: 'completed', stage: null, profile: job.profile, error: null };
      if (job.status === 'failed') {
        return {
          ...base,
          phase: 'failed',
          stage: null,
          error: job.error ?? { code: 'processing_failed', message: 'Processing failed.', retryable: true },
        };
      }
      return { ...base, phase: job.status === 'processing' ? 'processing' : 'queued', stage: job.stage ?? null, error: null };
    }
    case 'pollFailed': {
      // A few dropped polls are tolerated; then the user gets a Retry.
      const networkErrors = state.networkErrors + 1;
      if (networkErrors < MAX_CONSECUTIVE_NETWORK_ERRORS) return { ...state, networkErrors };
      return { ...state, networkErrors, phase: 'failed', error: action.error };
    }
    case 'timedOut':
      return {
        ...state,
        phase: 'failed',
        error: { code: 'timeout', message: 'This is taking longer than expected. Please try again.', retryable: true },
      };
    default:
      return state;
  }
}

export const isPolling = (state) => state.phase === 'queued' || state.phase === 'processing';

// Delay before the next status request: the server's hint, slowing down
// gradually on long jobs (1 s → max 3 s).
export function nextPollDelay(pollAfterMs, pollCount) {
  const base = Number.isFinite(pollAfterMs) && pollAfterMs > 0 ? pollAfterMs : 1000;
  const slowdown = pollCount > 10 ? 2 : pollCount > 5 ? 1.5 : 1;
  return Math.min(3000, Math.max(500, Math.round(base * slowdown)));
}

// Server stages → the processing screen's three steps.
const STAGE_STEP = { extracting_text: 0, analyzing: 1, building_profile: 2 };

// Step states for the processing screen: 'pending' | 'active' | 'done' | 'failed'.
// Steps only advance with the real stage reported by the server.
export function stepStates(state, stepCount = 3) {
  return Array.from({ length: stepCount }, (_, index) => {
    if (state.phase === 'completed') return 'done';
    if (state.phase === 'failed') return 'failed';
    if (state.phase !== 'processing') return 'pending';
    const current = STAGE_STEP[state.stage] ?? 0;
    if (index < current) return 'done';
    return index === current ? 'active' : 'pending';
  });
}

export function statusText(state) {
  if (state.phase === 'uploading') return 'Uploading your resume…';
  if (state.phase === 'queued') return 'Waiting to start…';
  return null;
}

// --- profile shape --------------------------------------------------------------------

const str = (value) => (typeof value === 'string' ? value : '');
const strList = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []);

// Server profile → exactly the fields ProfileConfirm uses. Empty country code
// falls back to the form's default; nothing else is filled in.
export function toProfileFormValues(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    fullName: str(profile.fullName),
    email: str(profile.email),
    countryCode: str(profile.countryCode) || '+91',
    phone: str(profile.phone),
    whatsappOptIn: false,
    currentRole: str(profile.currentRole),
    currentLocation: str(profile.currentLocation),
    preferredLocations: strList(profile.preferredLocations),
    experienceYears: str(profile.experienceYears),
    experienceMonths: str(profile.experienceMonths),
    currentCompany: str(profile.currentCompany),
    skills: strList(profile.skills),
    experiences: (Array.isArray(profile.experiences) ? profile.experiences : [])
      .filter((entry) => entry && str(entry.id) && str(entry.title) && str(entry.company) && str(entry.startDate))
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        company: entry.company,
        startDate: entry.startDate,
        endDate: typeof entry.endDate === 'string' && entry.endDate ? entry.endDate : null,
      })),
    education: (Array.isArray(profile.education) ? profile.education : [])
      .filter((entry) => entry && str(entry.id) && str(entry.institution))
      .map((entry) => ({
        id: entry.id,
        institution: entry.institution,
        degree: str(entry.degree),
        field: str(entry.field),
        startYear: str(entry.startYear),
        endYear: str(entry.endYear),
      })),
  };
}

// Resume metadata kept with the confirmed profile (server copy is the source of truth).
export function confirmedResumeMetadata(serverResume) {
  return {
    resumeId: serverResume.resumeId,
    name: serverResume.fileName,
    size: typeof serverResume.size === 'number' ? serverResume.size : null,
    mimeType: serverResume.contentType ?? null,
    kind: serverResume.kind ?? null,
  };
}

// "PDF" / "DOCX" label for the Profile resume card.
export function resumeTypeLabel(resume) {
  if (!resume) return '—';
  const kind = resume.kind ?? resumeKind({ name: resume.name, mimeType: resume.mimeType ?? '' });
  return kind ? kind.toUpperCase() : 'FILE';
}
