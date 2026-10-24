// Candidate selection for recommendations: scores the real jobs against the
// matching profile and keeps the best few for Gemini to rank. These scores
// are never shown as recommendations on their own.
// (Pure functions; the 500-job dataset is scored in memory. A much larger
// dataset would need an indexed pre-filter in MongoDB first.)

export const MAX_CANDIDATES = 30;

const norm = (value) => String(value ?? '').toLowerCase().trim();
const words = (value) =>
  norm(value)
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
// Words that say nothing about the kind of role (every job is a 'developer').
const STOP_WORDS = new Set([
  'and', 'of', 'the', 'for', 'in', 'at', 'to', 'with', 'senior', 'junior', 'lead', 'intern', 'trainee',
  'developer', 'engineer', 'software', 'associate', 'assistant', 'system', 'systems', 'specialist', 'ii', 'iii',
]);

// Different spellings of the same skill → one key, so "React.js" on a resume
// matches "React" in a job (and isn't reported as a gap).
const SKILL_ALIASES = {
  reduxtoolkit: 'redux', rtk: 'redux', mongo: 'mongodb', mongodbatlas: 'mongodb', postgres: 'postgresql',
  golang: 'go', k8s: 'kubernetes', ts: 'typescript', js: 'javascript', ecmascript: 'javascript',
  restapi: 'restapis', rest: 'restapis', restful: 'restapis', restfulapi: 'restapis', restfulapis: 'restapis',
  restapidesign: 'restapis', restfulservices: 'restapis', html5: 'html', css3: 'css', tailwind: 'tailwindcss',
  sklearn: 'scikitlearn', ml: 'machinelearning', githubaction: 'githubactions', amazonwebservices: 'aws',
  microsoftazure: 'azure', googlecloud: 'gcp', googlecloudplatform: 'gcp', springbootframework: 'springboot',
};

export function skillKey(skill) {
  let key = norm(skill)
    .replace(/\([^)]*\)/g, '') // "Role-Based Access Control (RBAC)" → without the brackets
    .replace(/[\s._/-]+/g, ''); // "Node.js" → "nodejs", "REST APIs" → "restapis"
  if (key.length > 4 && key.endsWith('js')) key = key.slice(0, -2); // reactjs → react, nodejs → node
  return SKILL_ALIASES[key] ?? key;
}

// "2-5 years" → { low: 2, high: 5 }
function experienceBand(text) {
  const match = String(text ?? '').match(/(\d+)\s*-\s*(\d+)/);
  return match ? { low: Number(match[1]), high: Number(match[2]) } : null;
}

const cityOf = (location) => norm(String(location ?? '').split(',')[0]);
const stateOf = (location) => norm(String(location ?? '').split(',')[1]);

// Skills the job asks for that the profile has / lacks (job's own spelling).
export function compareSkills(profileSkills, jobSkills) {
  const have = new Set(profileSkills.map(skillKey));
  const matchedSkills = [];
  const gapSkills = [];
  jobSkills.forEach((skill) => (have.has(skillKey(skill)) ? matchedSkills : gapSkills).push(skill));
  return { matchedSkills, gapSkills };
}

function titleSimilarity(profileTitles, job) {
  const jobWords = new Set([...words(job.title), ...words(job.category)]);
  if (!jobWords.size) return 0;
  let best = 0;
  profileTitles.forEach((title) => {
    const titleWords = words(title);
    if (!titleWords.length) return;
    const shared = titleWords.filter((word) => jobWords.has(word)).length;
    best = Math.max(best, shared / Math.max(titleWords.length, 1));
  });
  return Math.min(best, 1);
}

function locationScore(profile, job) {
  const jobCity = norm(job.city);
  const jobState = norm(job.state);
  const preferred = profile.preferredLocations;
  if (preferred.some((place) => cityOf(place) === jobCity)) return 1;
  if (cityOf(profile.currentLocation) === jobCity) return 0.8;
  if ([...preferred, profile.currentLocation].some((place) => stateOf(place) && stateOf(place) === jobState)) return 0.4;
  return 0;
}

function experienceScore(profile, job) {
  const band = experienceBand(job.experience);
  if (!band || profile.experienceYears === null) return 0.5; // unknown → neutral
  const years = profile.experienceYears + (profile.experienceMonths ?? 0) / 12;
  if (years >= band.low && years <= band.high + 0.99) return 1;
  const distance = years < band.low ? band.low - years : years - band.high;
  return Math.max(0, 1 - distance / 4);
}

// Score one job (0..1) with the skill comparison used for the result.
export function scoreJob(profile, job) {
  const { matchedSkills, gapSkills } = compareSkills(profile.skills, job.requiredSkills ?? []);
  const skillScore = job.requiredSkills?.length ? matchedSkills.length / job.requiredSkills.length : 0;
  const titleScore = titleSimilarity([profile.currentRole, ...profile.experienceTitles].filter(Boolean), job);
  const score = 0.5 * skillScore + 0.25 * titleScore + 0.15 * locationScore(profile, job) + 0.1 * experienceScore(profile, job);
  return { score, skillScore, titleScore, matchedSkills, gapSkills };
}

// Best-matching jobs for the profile (only jobs sharing at least one skill or
// a title word), highest score first; ties → newer posting, then jobId.
export function selectCandidates(profile, jobs, max = MAX_CANDIDATES) {
  return jobs
    .map((job) => ({ job, ...scoreJob(profile, job) }))
    .filter((entry) => entry.matchedSkills.length > 0 || entry.titleScore > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.job.postedAt) - new Date(a.job.postedAt) ||
        String(a.job.jobId).localeCompare(String(b.job.jobId))
    )
    .slice(0, max);
}
