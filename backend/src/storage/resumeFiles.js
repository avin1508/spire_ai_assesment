import mongoose from 'mongoose';

// Private resume file storage in MongoDB GridFS (bucket "resumeFiles").
// Used by the API (upload, download) and the worker (text extraction); both
// connect to the same database, so no shared disk is needed. Files are only
// reachable through the owner-checked API — never by a public URL.

const BUCKET = 'resumeFiles';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

// Stores `buffer` and resolves with the new file id.
export function saveResumeFile(buffer, { fileName, contentType, ownerType }) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(fileName, { metadata: { contentType, ownerType } });
    upload.once('error', reject);
    upload.once('finish', () => resolve(upload.id));
    upload.end(buffer);
  });
}

// Whole file as a Buffer (resumes are ≤ 5 MB). Rejects if it doesn't exist.
export async function readResumeFile(id) {
  const chunks = [];
  for await (const chunk of bucket().openDownloadStream(toObjectId(id))) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Readable stream for a download; null if the file doesn't exist.
export async function openResumeFileStream(id) {
  const objectId = toObjectId(id);
  const [file] = await bucket().find({ _id: objectId }).limit(1).toArray();
  if (!file) return null;
  return { stream: bucket().openDownloadStream(objectId), length: file.length };
}

// Deletes a file; missing files are ignored.
export async function deleteResumeFile(id) {
  try {
    await bucket().delete(toObjectId(id));
  } catch (error) {
    if (!/not found|FileNotFound/i.test(error?.message ?? '')) throw error;
  }
}

// Files uploaded before `before` (for orphan cleanup).
export function listResumeFilesBefore(before) {
  return bucket().find({ uploadDate: { $lt: before } }, { projection: { _id: 1 } }).toArray();
}
