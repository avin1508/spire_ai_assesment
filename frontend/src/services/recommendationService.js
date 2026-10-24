import { ServiceUnavailableError } from './errors';

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
 * Not built yet (a later phase): always rejects with ServiceUnavailableError,
 * so the Recommended tab says recommendations aren't ready instead of
 * showing sample jobs.
 */
export async function fetchRecommendations(profile) {
  throw new ServiceUnavailableError('Job recommendations are coming soon. Your profile has been saved.');
}
