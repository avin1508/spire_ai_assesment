// Decides what the app restores at start-up from the result of reading guest
// storage. Pure, so it can be unit tested without React Native.
// (No imports: this file is also loaded by the Node test runner.)
//
// loadResult: { status: 'ok' | 'corrupt', data: { profile, resume } }
//           | { status: 'failed' }
//
// → { profile, resume, resumeFileMissing, storageStatus }
//   storageStatus 'readonly' means storage couldn't be read: nothing is
//   restored and saving stays off, so the stored data is never overwritten.
export function resolveRestore(loadResult) {
  if (!loadResult || loadResult.status === 'failed') {
    return { profile: null, resume: null, resumeFileMissing: false, storageStatus: 'readonly' };
  }
  const { profile = null, resume = null } = loadResult.data ?? {};
  // The resume file lives on the server (resumeId). A resume saved before
  // that (device copy only) can't be downloaded, so it shows as missing and
  // the user can upload it again.
  const resumeFileMissing = Boolean(resume && !resume.resumeId);
  return { profile, resume, resumeFileMissing, storageStatus: 'ready' };
}
