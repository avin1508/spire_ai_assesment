import * as DocumentPicker from 'expo-document-picker';

const RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Opens the system file picker for a PDF / Word resume.
// Resolves with the file's metadata, or null if the user cancelled.
// The picker's own cache copy isn't used: the returned content:// URI is
// copied straight into permanent app storage (storage/resumeFiles.js). In
// Expo Go the picker's cache folder isn't readable by expo-file-system.
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
