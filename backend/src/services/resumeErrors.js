// A resume-processing failure with a stable code and a message that is safe
// to show to the user. `retryable` = trying again later may succeed.
export class ResumeProcessingError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.name = 'ResumeProcessingError';
    this.code = code;
    this.retryable = retryable;
  }
}

export const RESUME_ERRORS = {
  file_missing: ['This file is no longer available. Please upload it again.', false],
  unreadable_file: ["We couldn't read this file. It may be damaged or password-protected.", false],
  no_text: [
    "This file doesn't contain readable text (scanned resumes aren't supported yet). Upload a PDF or DOCX with selectable text.",
    false,
  ],
  no_profile_data: ["We couldn't find resume details in this file. Please check it's your resume.", false],
  invalid_output: ["We couldn't understand the processed resume. Please try again.", true],
  ai_busy: ['Our resume reader is busy right now. Please try again in a moment.', true],
  ai_timeout: ['Reading your resume took too long. Please try again.', true],
  ai_unavailable: ['Resume processing is temporarily unavailable. Please try again later.', true],
  ai_config: ['Resume processing is temporarily unavailable. Please try again later.', false],
  ai_rejected: ["We couldn't process this resume. Please try a different file.", false],
  processing_failed: ['Something went wrong while processing your resume. Please try again.', true],
};

export function resumeError(code) {
  const [message, retryable] = RESUME_ERRORS[code] ?? RESUME_ERRORS.processing_failed;
  return new ResumeProcessingError(code in RESUME_ERRORS ? code : 'processing_failed', message, { retryable });
}
