// Resume file checks based on the file's content (not its name or the
// client-supplied MIME type).

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export const RESUME_CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// 'pdf' | 'docx' | null.
//   PDF: starts with "%PDF-".
//   DOCX: a ZIP archive containing word/document.xml (entry names are stored
//   uncompressed in the archive, so they can be found without unzipping).
//   Anything else (including old .doc files) → null.
export function detectResumeKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (
    buffer.subarray(0, 4).equals(ZIP_SIGNATURE) &&
    buffer.includes('word/document.xml', 0, 'latin1') &&
    buffer.includes('[Content_Types].xml', 0, 'latin1')
  ) {
    return 'docx';
  }
  return null;
}

// A display/download name without paths or unsafe characters, ending with the
// extension of the detected kind.
export function safeResumeFileName(name, kind) {
  let raw = String(name ?? '');
  try {
    raw = decodeURIComponent(raw); // some clients percent-encode the file name
  } catch {
    // Not percent-encoded: keep as is.
  }
  const base = raw
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.(pdf|docx?|)$/i, '')
    .slice(0, 100)
    .trim();
  return `${base || 'resume'}.${kind}`;
}
