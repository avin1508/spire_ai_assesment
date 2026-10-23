import { mockExtractedProfile } from '../data/mockResume';

// Simulated parsing time so the "Building Your Profile" steps are visible.
const MOCK_PARSE_DELAY_MS = 3000;

/**
 * Sends a resume to the backend and resolves with the extracted profile fields
 * (same keys as the profile form plus `experiences` / `education`).
 *
 * MOCK (UI demo only): no upload or parsing happens. Every file resolves with
 * the same fictional sample profile from src/data/mockResume.js. Replace with
 * the backend upload + parsing job (BullMQ + Gemini) in a later phase; on
 * failure it should throw (ServiceUnavailableError when not reachable).
 *
 * @param {{ name: string, size: number | null, uri: string, mimeType: string | null }} file
 */
export async function parseResume(file) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_PARSE_DELAY_MS));
  return JSON.parse(JSON.stringify(mockExtractedProfile));
}
