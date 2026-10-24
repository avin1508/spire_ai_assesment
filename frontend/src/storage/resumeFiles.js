import { Directory, File, Paths } from 'expo-file-system';

// The guest's resume file is copied into the app's private document
// directory, under a guest-only folder, so it survives restarts.

const guestResumeDir = () => new Directory(Paths.document, 'guest', 'resume');

const safeFileName = (name) => name.replace(/[^\w.-]+/g, '_').slice(-80) || 'resume';

/**
 * Copies a picked file into permanent guest storage, then removes older guest
 * resume copies. Resolves with metadata pointing at the new copy.
 * Throws if the copy fails — nothing existing is deleted in that case.
 */
export async function persistGuestResume(file) {
  const dir = guestResumeDir();
  dir.create({ intermediates: true, idempotent: true });

  const destination = new File(dir, `${Date.now()}-${safeFileName(file.name)}`);
  await new File(file.uri).copy(destination);

  // Only after the new copy exists, remove previous copies.
  dir.list().forEach((entry) => {
    if (entry instanceof File && entry.uri !== destination.uri) {
      try {
        entry.delete();
      } catch (error) {
        console.warn('[resumeFiles] could not delete old copy:', error?.message ?? error);
      }
    }
  });

  return { ...file, uri: destination.uri, persisted: true };
}

// True if a file exists at `uri`; false if it's missing or can't be checked.
export function resumeFileExists(uri) {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
