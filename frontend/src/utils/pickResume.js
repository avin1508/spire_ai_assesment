import * as DocumentPicker from 'expo-document-picker';

import { RESUME_MIME_TYPES } from './resumeProcessing';

const RESUME_TYPES = [RESUME_MIME_TYPES.pdf, RESUME_MIME_TYPES.docx];

// Opens the system file picker for a PDF / DOCX resume.
// Resolves with the file's metadata, or null if the user cancelled.
// The picker's own cache copy isn't used: the returned content:// URI is
// copied into the upload staging folder (storage/resumeFiles.js). In Expo Go
// the picker's cache folder isn't readable by expo-file-system.
export async function pickResume() {
  const result = await DocumentPicker.getDocumentAsync({
    type: RESUME_TYPES,
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled) return null;

  const [asset] = result.assets;
  return {
    name: asset.name,
    size: asset.size ?? null,
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
  };
}
