// MOCK DATA — hardcoded sample recommendations shown until the backend
// matching API exists. Company names, descriptions and URLs are fictional
// (apply links use example.com). No distance data is included, so the
// "Distance" sort stays unavailable. rec-4 has no apply URL and rec-5 has no
// description, to exercise the missing-data states.
//
// `description` is raw text: "## " lines are headings, "- " lines are
// bullets, blank lines separate paragraphs.

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

export const mockRecommendations = [
  {
    id: 'rec-1',
    title: 'Full Stack Engineer',
    company: 'Northwind Tech',
    location: 'Benhgaluru, Karnataka',
    country: 'India',
    experience: '2-5 years',
    postedAt: daysAgo(5),
    verified: true,
    fitLabel: 'Good Fit',
    matchedSkills: ['Full Stack Development', 'React', 'Node.js', 'Git', 'REST APIs'],
    gapSkills: ['Restful Api', 'Jest'],
    applyUrl: 'https://example.com/careers/northwind-tech/full-stack-engineer',
    description: `## About Northwind Tech
Northwind Tech builds inventory and ordering software for mid-sized retailers. Our small product teams own features end to end.

## The Role
We're looking for a Full Stack Engineer to build and maintain customer-facing web features using React and Node.js.

## What You'll Do
- Build and ship full-stack features from design to deployment
- Design and document REST APIs used by web and mobile clients
- Review code and help improve test coverage
- Work closely with product and design on new features

## Tech Stack
React · Node.js · Express · MongoDB · REST APIs · Git

## You're a Fit If
- You have 2–5 years of professional development experience
- You're comfortable across the stack, from UI to database
- You write clear code and communicate well in reviews

## Bonus Points
- Experience with automated testing (Jest or similar)
- Experience with cloud deployment`,
  },
  {
    id: 'rec-2',
    title: 'Senior Associate - Software Engineer',
    company: 'Bluepeak Labs',
    location: 'Bengaluru, Karnataka',
    country: 'India',
    experience: '3-6 years',
    postedAt: daysAgo(10),
    verified: true,
    fitLabel: 'Excellent Fit',
    matchedSkills: ['Reactjs', 'Javascript', 'Api Development', 'Git'],
    gapSkills: ['Nestjs', 'Sql', 'Aws'],
    applyUrl: 'https://example.com/careers/bluepeak-labs/senior-associate',
    description: `## About Bluepeak Labs
Bluepeak Labs is a product engineering studio that builds web platforms for logistics companies.

## The Role
As a Senior Associate, you'll lead features on a React and Node.js platform and mentor junior engineers.

## What You'll Do
- Own features across the frontend and API layers
- Break down requirements into well-scoped tasks
- Mentor associates through pairing and code reviews

## You're a Fit If
- You have 3–6 years of experience with JavaScript and React
- You've designed and maintained production APIs

## Why Bluepeak Labs
- Small teams with real ownership
- Learning budget for courses and certifications`,
  },
  {
    id: 'rec-3',
    title: 'Software Development Engineer - Backend',
    company: 'Orbitron Systems',
    location: 'Bengaluru, Karnataka',
    country: 'India',
    experience: '2-5 years',
    postedAt: daysAgo(1),
    verified: true,
    fitLabel: 'Good Fit',
    matchedSkills: ['Nodejs', 'Javascript', 'Git', 'Software Development'],
    gapSkills: ['Postgresql', 'Aws', 'Unit Testing'],
    applyUrl: 'https://example.com/careers/orbitron-systems/sde-backend',
    description: `## About Orbitron Systems
Orbitron Systems builds telemetry and monitoring tools for industrial equipment.

## The Role
Join the backend team to design services that ingest and process device data.

## What You'll Do
- Build and maintain Node.js services and APIs
- Model data and write efficient queries
- Add unit and integration tests for new services

## Tech Stack
Node.js · JavaScript · PostgreSQL · AWS · Git`,
  },
  {
    id: 'rec-4',
    title: 'Frontend Developer (React)',
    company: 'Lumen Retail',
    location: 'Pune, Maharashtra',
    country: 'India',
    experience: '0-2 years',
    postedAt: hoursAgo(6),
    verified: false,
    fitLabel: 'Average Fit',
    matchedSkills: ['React', 'Javascript', 'HTML', 'CSS'],
    gapSkills: ['Typescript'],
    description: `## About Lumen Retail
Lumen Retail runs an online store for home and lifestyle products.

## The Role
Help build and polish our shopping experience on the web.

## What You'll Do
- Build responsive UI components in React
- Fix bugs and improve page performance

## You're a Fit If
- You know React, JavaScript, HTML and CSS
- You care about clean, accessible UI`,
  },
  {
    id: 'rec-5',
    title: 'Node.js Developer',
    company: 'Saffron Fintech',
    location: 'Indore, Madhya Pradesh',
    country: 'India',
    experience: '1-3 years',
    postedAt: daysAgo(21),
    verified: true,
    fitLabel: 'Excellent Fit',
    matchedSkills: ['Node.js', 'Express', 'MongoDB'],
    gapSkills: [],
    applyUrl: 'https://example.com/careers/saffron-fintech/nodejs-developer',
  },
];
