// DEMO DATA — 500 sample job listings for the Spire.AI iExchange Clone.
// These are NOT real vacancies: the companies are fictional and listings are
// marked isDemo when seeded. The dataset is deterministic (same input → same
// jobs, ids and coordinates), so seeding is repeatable.
//
// Each listing combines a city + business district (data/cities.js), a
// company (data/companies.js), a role template (data/roles.js) and a seniority
// level, so titles, skills, salaries and descriptions differ meaningfully.

import { CITIES } from './cities.js';
import { COMPANIES } from './companies.js';
import { ROLES } from './roles.js';

export const EXPECTED_JOB_COUNT = 500;

// Seniority levels. `lpa` is the base annual salary band in lakhs (₹100,000);
// internships use a monthly stipend instead.
const LEVELS = {
  intern: {
    experience: '0-1 years',
    jobType: 'Internship',
    title: (role) => `${role.title} Intern`,
    stipend: [15000, 30000],
    requirement: 'Final-year student or recent graduate with hands-on project or internship work',
  },
  junior: {
    experience: '1-3 years',
    jobType: 'Full-time',
    title: (role) => `Junior ${role.title}`,
    lpa: [4, 8],
    requirement: '1–3 years of professional experience in a similar role',
  },
  mid: {
    experience: '2-5 years',
    jobType: 'Full-time',
    title: (role) => role.title,
    lpa: [8, 15],
    requirement: '2–5 years of professional experience in a similar role',
  },
  mid2: {
    experience: '3-6 years',
    jobType: 'Full-time',
    title: (role) => role.title,
    lpa: [12, 20],
    requirement: '3–6 years of professional experience in a similar role',
  },
  senior: {
    experience: '5-8 years',
    jobType: 'Full-time',
    title: (role) => `Senior ${role.title}`,
    lpa: [18, 32],
    requirement: '5–8 years of experience, with a track record of owning features from design to production',
  },
  lead: {
    experience: '8-12 years',
    jobType: 'Full-time',
    title: (role) => role.leadTitle,
    lpa: [30, 50],
    requirement: '8+ years of experience, including leading and mentoring a team of engineers',
  },
};

// Repeating seniority mix: ~10% intern, 25% junior, 35% mid, 20% senior, 10% lead.
const LEVEL_PATTERN = [
  'mid', 'junior', 'senior', 'mid2', 'junior', 'mid', 'senior', 'intern', 'mid2', 'junior',
  'lead', 'mid', 'senior', 'junior', 'mid2', 'senior', 'mid', 'junior', 'lead', 'intern',
];

const TIER_FACTOR = { 1: 1, 2: 0.85 };
const GOLDEN_ANGLE = 2.399963229728653; // radians, spreads points evenly

const round6 = (value) => Math.round(value * 1e6) / 1e6;
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hoursAgo = (now, hours) => new Date(now - hours * 3600000).toISOString();

// `count` consecutive items from `list`, starting at `start` (wrapping round).
const rotate = (list, start, count) =>
  Array.from({ length: Math.min(count, list.length) }, (_, i) => list[(start + i) % list.length]);

// Position inside the district: first job at the district point, later ones on
// a small spiral (~250–850 m) so markers don't stack.
function placeInArea(area, ring) {
  if (ring === 0) return { latitude: area.latitude, longitude: area.longitude };
  const radius = 0.0025 * Math.sqrt(ring);
  const angle = ring * GOLDEN_ANGLE;
  return {
    latitude: round6(area.latitude + radius * Math.cos(angle)),
    longitude: round6(area.longitude + radius * Math.sin(angle)),
  };
}

function buildSalary(level, role, tier, seq) {
  const factor = role.salaryFactor * TIER_FACTOR[tier];
  const wiggle = (seq % 3) - 1; // -1, 0 or +1
  if (level.stipend) {
    const [low, high] = level.stipend;
    return {
      min: Math.round((low * factor) / 1000) * 1000 + wiggle * 1000,
      max: Math.round((high * factor) / 1000) * 1000 + wiggle * 1000,
      currency: 'INR',
      period: 'month',
    };
  }
  const [low, high] = level.lpa;
  const minLpa = Math.max(3, Math.round(low * factor) + wiggle);
  const maxLpa = Math.max(minLpa + 2, Math.round(high * factor) + wiggle);
  return { min: minLpa * 100000, max: maxLpa * 100000, currency: 'INR', period: 'year' };
}

function buildRequirements(role, level, seq) {
  return [level.requirement, ...rotate(role.requirements, seq % role.requirements.length, 4)];
}

function buildSummary({ companyName, title, role, area, city, jobType }) {
  const lines = [
    `${companyName} is hiring a ${title} to join its ${role.team} team in ${area}, ${city}.`,
    `In this role you will ${role.mission}.`,
  ];
  if (jobType === 'Internship') {
    lines.push('This is a six-month paid internship with mentorship from senior engineers.');
  } else if (jobType === 'Contract') {
    lines.push('This is a 12-month contract role with the possibility of extension.');
  }
  return lines.join(' ');
}

export function buildJobs(now = Date.now()) {
  const jobs = [];
  const listings = new Set(); // title|company|city — keeps listings distinct
  let globalSeq = 0;

  CITIES.forEach((cityInfo, cityIndex) => {
    for (let seq = 0; seq < cityInfo.jobs; seq += 1) {
      const role = ROLES[(seq * 11 + cityIndex * 7) % ROLES.length];
      const levelKey = LEVEL_PATTERN[(seq + cityIndex * 3) % LEVEL_PATTERN.length];
      const level = LEVELS[levelKey];
      const title = level.title(role);

      // Pick a company; step forward if this exact listing already exists.
      let companyIndex = (seq * 13 + cityIndex * 5) % COMPANIES.length;
      while (listings.has(`${title}|${COMPANIES[companyIndex].name}|${cityInfo.city}`)) {
        companyIndex = (companyIndex + 1) % COMPANIES.length;
      }
      const company = COMPANIES[companyIndex];
      listings.add(`${title}|${company.name}|${cityInfo.city}`);

      const area = cityInfo.areas[seq % cityInfo.areas.length];
      const position = placeInArea(area, Math.floor(seq / cityInfo.areas.length));
      const jobType = levelKey === 'mid' && seq % 9 === 4 ? 'Contract' : level.jobType;
      const jobId = `job-${cityInfo.key}-${seq + 1}`;

      jobs.push({
        jobId,
        title,
        category: role.category,
        companyName: company.name,
        companyIndustry: company.industry,
        companyAbout: company.about,
        area: area.name,
        city: cityInfo.city,
        state: cityInfo.state,
        country: 'India',
        latitude: position.latitude,
        longitude: position.longitude,
        experience: level.experience,
        jobType,
        salary: buildSalary(level, role, cityInfo.tier, globalSeq),
        // Spread from 2 hours to 30 days old.
        postedAt: hoursAgo(now, 2 + ((globalSeq * 37 + cityIndex * 11) % 718)),
        verified: (globalSeq * 3 + cityIndex) % 10 < 7,
        summary: buildSummary({
          companyName: company.name,
          title,
          role,
          area: area.name,
          city: cityInfo.city,
          jobType,
        }),
        responsibilities: rotate(role.responsibilities, seq % role.responsibilities.length, 5),
        requirements: buildRequirements(role, level, seq),
        qualifications: [...role.qualifications],
        niceToHave: rotate(role.niceToHave, seq % role.niceToHave.length, 2),
        requiredSkills: [
          ...new Set([...role.skills, ...rotate(role.extraSkills, seq % role.extraSkills.length, 2)]),
        ],
        applyUrl: `https://example.com/careers/${slug(company.name)}/${jobId}`,
      });
      globalSeq += 1;
    }
  });
  return jobs;
}

export const JOBS = buildJobs();
