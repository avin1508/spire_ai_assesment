// MOCK DATA — demonstration jobs for the All Jobs map and list. These are NOT
// real vacancies: company names are fictional and no listing is verified.
// Every job sits in a real business district of its city (coordinates of the
// district, plus a small offset so jobs in the same district don't stack).
// This is the single source for the map, the list, counts and filters;
// replace `ALL_JOBS` with backend results later.

const CITIES = [
  {
    key: 'blr',
    city: 'Bengaluru',
    state: 'Karnataka',
    areas: [
      { name: 'Whitefield', latitude: 12.9698, longitude: 77.75 },
      { name: 'Electronic City', latitude: 12.8452, longitude: 77.6602 },
      { name: 'Koramangala', latitude: 12.9352, longitude: 77.6245 },
      { name: 'Manyata Tech Park', latitude: 13.0475, longitude: 77.6206 },
      { name: 'Bellandur', latitude: 12.926, longitude: 77.6762 },
      { name: 'Indiranagar', latitude: 12.9784, longitude: 77.6408 },
      { name: 'MG Road', latitude: 12.9756, longitude: 77.605 },
      { name: 'HSR Layout', latitude: 12.9116, longitude: 77.6474 },
    ],
  },
  {
    key: 'pune',
    city: 'Pune',
    state: 'Maharashtra',
    areas: [
      { name: 'Hinjewadi', latitude: 18.5913, longitude: 73.7389 },
      { name: 'Kharadi', latitude: 18.5515, longitude: 73.9463 },
      { name: 'Magarpatta', latitude: 18.5155, longitude: 73.9272 },
      { name: 'Baner', latitude: 18.559, longitude: 73.7868 },
      { name: 'Viman Nagar', latitude: 18.5679, longitude: 73.9143 },
      { name: 'Shivajinagar', latitude: 18.5308, longitude: 73.8475 },
    ],
  },
  {
    key: 'chennai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    areas: [
      { name: 'Sholinganallur', latitude: 12.901, longitude: 80.2279 },
      { name: 'Guindy', latitude: 13.0067, longitude: 80.2206 },
      { name: 'Taramani', latitude: 12.9895, longitude: 80.2486 },
      { name: 'Perungudi', latitude: 12.9654, longitude: 80.2461 },
      { name: 'Ambattur', latitude: 13.1143, longitude: 80.1548 },
      { name: 'T. Nagar', latitude: 13.0418, longitude: 80.2341 },
    ],
  },
  {
    key: 'hyd',
    city: 'Hyderabad',
    state: 'Telangana',
    areas: [
      { name: 'HITEC City', latitude: 17.4435, longitude: 78.3772 },
      { name: 'Gachibowli', latitude: 17.4401, longitude: 78.3489 },
      { name: 'Madhapur', latitude: 17.4483, longitude: 78.3915 },
      { name: 'Financial District', latitude: 17.4156, longitude: 78.3426 },
      { name: 'Kondapur', latitude: 17.46, longitude: 78.36 },
      { name: 'Banjara Hills', latitude: 17.4126, longitude: 78.4482 },
    ],
  },
  {
    key: 'mumbai',
    city: 'Mumbai',
    state: 'Maharashtra',
    areas: [
      { name: 'Bandra Kurla Complex', latitude: 19.066, longitude: 72.8654 },
      { name: 'Powai', latitude: 19.1176, longitude: 72.906 },
      { name: 'Andheri East', latitude: 19.1136, longitude: 72.8697 },
      { name: 'Lower Parel', latitude: 18.9953, longitude: 72.8295 },
      { name: 'Malad', latitude: 19.1873, longitude: 72.8361 },
      { name: 'Goregaon', latitude: 19.1646, longitude: 72.8493 },
    ],
  },
  {
    key: 'delhi',
    city: 'New Delhi',
    state: 'Delhi',
    areas: [
      { name: 'Connaught Place', latitude: 28.6315, longitude: 77.2167 },
      { name: 'Nehru Place', latitude: 28.5494, longitude: 77.2533 },
      { name: 'Okhla', latitude: 28.5465, longitude: 77.2731 },
      { name: 'Saket', latitude: 28.5245, longitude: 77.2066 },
      { name: 'Aerocity', latitude: 28.5503, longitude: 77.121 },
      { name: 'Janakpuri', latitude: 28.6219, longitude: 77.0878 },
    ],
  },
  {
    key: 'noida',
    city: 'Noida',
    state: 'Uttar Pradesh',
    areas: [
      { name: 'Sector 62', latitude: 28.627, longitude: 77.3727 },
      { name: 'Sector 63', latitude: 28.621, longitude: 77.388 },
      { name: 'Sector 125', latitude: 28.5442, longitude: 77.3328 },
      { name: 'Sector 132', latitude: 28.51, longitude: 77.378 },
      { name: 'Sector 16', latitude: 28.571, longitude: 77.326 },
      { name: 'Sector 18', latitude: 28.57, longitude: 77.3219 },
    ],
  },
  {
    key: 'ggn',
    city: 'Gurugram',
    state: 'Haryana',
    areas: [
      { name: 'Cyber City', latitude: 28.495, longitude: 77.089 },
      { name: 'Udyog Vihar', latitude: 28.5005, longitude: 77.083 },
      { name: 'Golf Course Road', latitude: 28.459, longitude: 77.096 },
      { name: 'Sohna Road', latitude: 28.418, longitude: 77.043 },
      { name: 'Sector 44', latitude: 28.451, longitude: 77.07 },
      { name: 'MG Road', latitude: 28.4795, longitude: 77.08 },
    ],
  },
  {
    key: 'kolkata',
    city: 'Kolkata',
    state: 'West Bengal',
    areas: [
      { name: 'Salt Lake Sector V', latitude: 22.5726, longitude: 88.4339 },
      { name: 'New Town', latitude: 22.58, longitude: 88.46 },
      { name: 'Park Street', latitude: 22.553, longitude: 88.352 },
      { name: 'Rajarhat', latitude: 22.596, longitude: 88.474 },
      { name: 'Esplanade', latitude: 22.565, longitude: 88.351 },
    ],
  },
  {
    key: 'amd',
    city: 'Ahmedabad',
    state: 'Gujarat',
    areas: [
      { name: 'Prahlad Nagar', latitude: 23.012, longitude: 72.5108 },
      { name: 'Bodakdev', latitude: 23.039, longitude: 72.507 },
      { name: 'Navrangpura', latitude: 23.0365, longitude: 72.5611 },
      { name: 'Thaltej', latitude: 23.051, longitude: 72.5 },
      { name: 'Satellite', latitude: 23.03, longitude: 72.518 },
      { name: 'GIFT City', latitude: 23.164, longitude: 72.6847 },
    ],
  },
];

const ROLES = [
  { title: 'React Native Developer', skills: ['React Native', 'JavaScript', 'Redux', 'REST APIs'] },
  { title: 'React Developer', skills: ['React', 'JavaScript', 'HTML', 'CSS'] },
  { title: 'Node.js Developer', skills: ['Node.js', 'Express', 'MongoDB', 'REST APIs'] },
  { title: 'MERN Stack Developer', skills: ['MongoDB', 'Express', 'React', 'Node.js'] },
  { title: 'Backend Developer', skills: ['Node.js', 'PostgreSQL', 'Docker', 'AWS'] },
  { title: 'Software Engineer', skills: ['JavaScript', 'Data Structures', 'Git', 'SQL'] },
  { title: 'Full Stack Developer', skills: ['React', 'Node.js', 'SQL', 'Git'] },
  { title: 'Frontend Developer', skills: ['React', 'TypeScript', 'CSS', 'Jest'] },
  { title: 'Java Backend Developer', skills: ['Java', 'Spring Boot', 'MySQL', 'Microservices'] },
  { title: 'Python Developer', skills: ['Python', 'Django', 'PostgreSQL', 'REST APIs'] },
  { title: 'Android Developer', skills: ['Kotlin', 'Android SDK', 'Jetpack Compose', 'Git'] },
  { title: 'DevOps Engineer', skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD'] },
  { title: 'QA Automation Engineer', skills: ['Selenium', 'Cypress', 'JavaScript', 'API Testing'] },
  { title: 'Data Analyst', skills: ['SQL', 'Python', 'Excel', 'Power BI'] },
];

// Fictional companies.
const COMPANIES = [
  'Northwind Tech', 'Bluepeak Labs', 'Orbitron Systems', 'Lumen Retail', 'Saffron Fintech',
  'Kestrel Analytics', 'Monsoon Media', 'Tidewater Logistics', 'Banyan Health', 'Indigo Cloud',
  'Peacock Payments', 'Cobalt Mobility', 'Teakwood Software', 'Lotus EdTech', 'Vermilion Games',
  'Granite Insurance',
];

// Experience band → typical salary band (₹ lakhs per annum).
const LEVELS = [
  { experience: '0-1 years', salary: '₹3–5 LPA' },
  { experience: '1-3 years', salary: '₹5–9 LPA' },
  { experience: '2-5 years', salary: '₹8–14 LPA' },
  { experience: '3-6 years', salary: '₹12–20 LPA' },
  { experience: '5-8 years', salary: '₹18–30 LPA' },
];

// Small offsets (≈ 200–700 m) so several jobs in one district get distinct points.
const OFFSETS = [
  [0, 0],
  [0.0042, -0.0031],
  [-0.0036, 0.0039],
  [0.0021, 0.0058],
  [-0.0055, -0.0018],
];

const JOBS_PER_CITY = 12;

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const round = (value) => Math.round(value * 1e6) / 1e6;

function describe(role, companyName, area, city, level, jobType) {
  return `## About ${companyName}
${companyName} is a product company with an engineering team in ${area}, ${city}. (Demonstration listing — not a real vacancy.)

## The Role
We're hiring a ${role.title} (${jobType}) with ${level.experience} of experience.

## What You'll Do
- Build and maintain features using ${role.skills.slice(0, 2).join(' and ')}
- Work with product and design on new releases
- Review code and help keep quality high

## Required Skills
${role.skills.join(' · ')}`;
}

function buildJobs() {
  const jobs = [];
  CITIES.forEach((cityInfo, cityIndex) => {
    for (let n = 0; n < JOBS_PER_CITY; n += 1) {
      const seq = cityIndex * JOBS_PER_CITY + n;
      const role = ROLES[(cityIndex * 5 + n * 3) % ROLES.length];
      const companyName = COMPANIES[(cityIndex * 7 + n * 5) % COMPANIES.length];
      const area = cityInfo.areas[n % cityInfo.areas.length];
      const [dLat, dLng] = OFFSETS[Math.floor(n / cityInfo.areas.length) % OFFSETS.length];
      const levelIndex = (seq * 2 + cityIndex) % LEVELS.length;
      const level = LEVELS[levelIndex];
      const jobType = levelIndex === 0 && n % 2 === 0 ? 'Internship' : n % 5 === 4 ? 'Contract' : 'Full-time';

      jobs.push({
        id: `job-${cityInfo.key}-${n + 1}`,
        title: role.title,
        companyName,
        // Alias used by shared components (JobCard, filters, Job Details).
        company: companyName,
        area: area.name,
        city: cityInfo.city,
        state: cityInfo.state,
        country: 'India',
        // "City, State" — the format the shared filters split on.
        location: `${cityInfo.city}, ${cityInfo.state}`,
        latitude: round(area.latitude + dLat),
        longitude: round(area.longitude + dLng),
        experience: level.experience,
        jobType,
        // Spread from 2 hours to ~25 days old; some fall in the last 24 hours.
        postedAt: hoursAgo(2 + ((seq * 37) % 600)),
        salary: level.salary,
        verified: seq % 3 !== 0,
        requiredSkills: role.skills,
        description: describe(role, companyName, area.name, cityInfo.city, level, jobType),
      });
    }
  });
  return jobs;
}

export const ALL_JOBS = buildJobs();

// Throws if the dataset is malformed (runs once at import in development).
export function validateJobs(jobs) {
  const ids = new Set();
  jobs.forEach((job) => {
    if (ids.has(job.id)) throw new Error(`Duplicate job id ${job.id}`);
    ids.add(job.id);
    const { latitude, longitude } = job;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`Invalid coordinates for ${job.id}`);
    }
  });
  return true;
}

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  validateJobs(ALL_JOBS);
}
