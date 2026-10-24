import { mockRecommendations } from '../data/mockRecommendations';

// Short wait so the "Agent Sigma is on the hunt" loading state is visible.
const MOCK_DELAY_MS = 1500;

/**
 * Resolves with recommended jobs for a confirmed profile. Each job:
 * {
 *   id: string,
 *   title: string,
 *   company: string,
 *   location: string,
 *   postedAt: string (ISO date),
 *   verified?: boolean,
 *   fitLabel?: string,          // e.g. "Good Fit"
 *   matchedSkills?: string[],
 *   gapSkills?: string[],       // skills the job needs that the profile lacks
 * }
 *
 * MOCK: returns hardcoded sample jobs (src/data/mockRecommendations.js) for
 * every profile. Replace with the backend matching API in a later phase;
 * on failure it should throw (ServiceUnavailableError when not reachable).
 */
export async function fetchRecommendations(profile) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return mockRecommendations;
}
