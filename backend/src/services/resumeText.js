import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import { resumeError } from './resumeErrors.js';

// Fewer letters than this means there is no usable text (e.g. a scanned PDF).
export const MIN_RESUME_LETTERS = 150;
// Longer text is cut before it is sent to Gemini.
export const MAX_RESUME_CHARS = 40000;

async function rawText(kind, buffer) {
  if (kind === 'pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  }
  if (kind === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  throw resumeError('unreadable_file');
}

// Plain text of a PDF/DOCX resume. Throws ResumeProcessingError
// "unreadable_file" (damaged, encrypted) or "no_text" (no usable text).
export async function extractResumeText(kind, buffer) {
  let text;
  try {
    text = await rawText(kind, buffer);
  } catch (error) {
    if (error?.name === 'ResumeProcessingError') throw error;
    throw resumeError('unreadable_file');
  }

  const cleaned = String(text ?? '')
    .replace(/\u0000/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim();
  const letters = cleaned.match(/\p{L}/gu)?.length ?? 0;
  if (letters < MIN_RESUME_LETTERS) throw resumeError('no_text');
  return cleaned.slice(0, MAX_RESUME_CHARS);
}
