import { Directory, File, Paths } from 'expo-file-system';

// Local copies of resume files. The confirmed resume lives on the backend;
// on the device a picked file is only staged (in the cache) so it can be
// uploaded, and earlier local copies (from before server storage) are
// removed once a resume is confirmed on the server.

const stagingRoot = () => new Directory(Paths.cache, 'resume-upload');
const legacyGuestResumeDir = () => new Directory(Paths.document, 'guest', 'resume');

// Keeps the real name (it becomes the upload's file name), minus path
// separators and control characters.
const stagedFileName = (name) =>
  String(name ?? '')
    .replace(/[\u0000-\u001f\u007f/\\]+/g, '_')
    .trim()
    .slice(-120) || 'resume';

/**
 * Copies a picked file into its own staging folder (removing earlier staged
 * files) and resolves with metadata pointing at the copy. The picker's
 * content:// URI may stop being readable later, so uploads use this copy.
 * Throws if the copy fails.
 */
export async function stageResumeForUpload(file) {
  const root = stagingRoot();
  root.create({ intermediates: true, idempotent: true });
  const dir = new Directory(root, String(Date.now()));
  dir.create({ intermediates: true, idempotent: true });
  const destination = new File(dir, stagedFileName(file.name));
  await new File(file.uri).copy(destination);
  removeEntries(root, dir.uri);
  return { ...file, uri: destination.uri };
}

// Removes staged upload copies (after confirmation or when abandoned).
export function discardStagedResumes() {
  removeEntries(stagingRoot());
}

// Removes resume copies saved on the device before resumes were stored on
// the server; called once a resume is confirmed on the server.
export function removeLegacyLocalResumes() {
  removeEntries(legacyGuestResumeDir());
}

function removeEntries(dir, keepUri = null) {
  try {
    if (!dir.exists) return;
    dir.list().forEach((entry) => {
      if (entry.uri !== keepUri) entry.delete();
    });
  } catch (error) {
    console.warn('[resumeFiles] cleanup failed:', error?.message ?? error);
  }
}
