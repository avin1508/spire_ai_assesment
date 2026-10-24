// Uploading a new resume (possibly a different person's) must replace what
// came from the previous resume, so nothing from it leaks into the new
// profile or its recommendations.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeExtractedProfile } from '../src/utils/profileMerge.js';
import { buildMatchingProfile } from '../src/utils/recommendations.js';

const JAVA_PERSON = {
  fullName: 'Ravi Kumar',
  email: 'ravi@example.com',
  countryCode: '+91',
  phone: '9000000001',
  whatsappOptIn: false,
  currentRole: 'Assistant System Engineer',
  currentLocation: 'Bengaluru, India',
  preferredLocations: ['Bengaluru'],
  experienceYears: '1',
  experienceMonths: '5',
  currentCompany: 'TCS',
  skills: ['Java', 'Spring Boot', 'Hibernate', 'Kafka', 'MySQL'],
  experiences: [
    { id: 'rA-exp-1', title: 'Assistant System Engineer', company: 'TCS', startDate: '2025-05', endDate: null, source: 'resume' },
    { id: 'exp-1700000000000', title: 'Freelance Tutor', company: 'Self', startDate: '2024-01', endDate: '2024-06', source: 'manual' },
  ],
  education: [{ id: 'rA-edu-1', institution: 'X', degree: 'B.E.', field: 'CSE', startYear: '2020', endYear: '2024', source: 'resume' }],
};

const MERN_PERSON = {
  fullName: 'Asha Verma',
  email: 'asha@example.com',
  countryCode: '+91',
  phone: '9000000002',
  whatsappOptIn: false,
  currentRole: 'MERN Stack Developer',
  currentLocation: 'Indore, India',
  preferredLocations: [],
  experienceYears: '2',
  experienceMonths: '7',
  currentCompany: '',
  skills: ['React.js', 'Node.js', 'Express.js', 'MongoDB', 'Redux Toolkit'],
  experiences: [{ id: 'rB-exp-1', title: 'MERN Stack Developer', company: 'Y', startDate: '2024-03', endDate: null }],
  education: [{ id: 'rB-edu-1', institution: 'Z', degree: 'B.Tech', field: 'IT', startYear: '2019', endYear: '2023' }],
};

test("a different person's resume replaces the previous resume's skills, role and experience", () => {
  const merged = mergeExtractedProfile(JAVA_PERSON, MERN_PERSON);
  assert.deepEqual(merged.skills, MERN_PERSON.skills, 'no Java skills carried over');
  assert.equal(merged.currentRole, 'MERN Stack Developer');
  assert.equal(merged.currentLocation, 'Indore, India');
  assert.equal(merged.currentCompany, '', 'old company not kept when the new resume has none');
  assert.deepEqual([merged.experienceYears, merged.experienceMonths], ['2', '7']);
  assert.deepEqual(merged.experiences.map((e) => e.title), ['MERN Stack Developer', 'Freelance Tutor'], 'resume entries replaced; hand-added kept');
  assert.deepEqual(merged.education.map((e) => e.degree), ['B.Tech']);
  assert.equal(merged.fullName, 'Asha Verma');
  assert.deepEqual(merged.preferredLocations, ['Bengaluru'], 'a preference stays unless the resume states one');

  const matching = buildMatchingProfile(merged);
  assert.ok(!matching.skills.some((skill) => /Java$|Spring|Hibernate|Kafka/.test(skill)));
  assert.ok(!matching.experienceTitles.includes('Assistant System Engineer'));
});

test('missing values in the new resume stay empty for the user to fill in (not inherited)', () => {
  const merged = mergeExtractedProfile(JAVA_PERSON, { ...MERN_PERSON, currentRole: '', experienceYears: '', skills: [] });
  assert.equal(merged.currentRole, '');
  assert.equal(merged.experienceYears, '');
  assert.deepEqual(merged.skills, []);
  // Contact details fall back to the existing ones only when the resume has none.
  const noContact = mergeExtractedProfile(JAVA_PERSON, { ...MERN_PERSON, email: '', phone: '' });
  assert.deepEqual([noContact.email, noContact.phone], ['ravi@example.com', '9000000001']);
});

test('first upload keeps the extracted profile as is', () => {
  const merged = mergeExtractedProfile(null, MERN_PERSON);
  assert.deepEqual(merged.skills, MERN_PERSON.skills);
  assert.ok(merged.experiences.every((entry) => entry.source === 'resume'));
});
