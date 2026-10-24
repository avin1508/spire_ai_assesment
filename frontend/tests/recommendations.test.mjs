// Recommendations on the app side: what profile data is sent (privacy),
// when a change triggers new recommendations, how server responses become
// screen states, and when polling continues or stops.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchingProfile,
  isInProgress,
  matchingProfileKey,
  nextPollDelay,
  recommendationStateFrom,
  recommendationView,
} from '../src/utils/recommendations.js';

const PROFILE = {
  fullName: 'Asha Verma',
  email: 'asha@example.com',
  countryCode: '+91',
  phone: '9876543210',
  whatsappOptIn: true,
  currentRole: 'Frontend Developer',
  currentLocation: 'Pune, Maharashtra, India',
  preferredLocations: ['Bengaluru, Karnataka, India'],
  experienceYears: '3',
  experienceMonths: '2',
  currentCompany: 'Northwind Tech',
  skills: ['React', 'TypeScript'],
  experiences: [
    { id: 'e1', title: 'Frontend Developer', company: 'Northwind Tech', startDate: '2023-01', endDate: null },
    { id: 'e2', title: 'Intern', company: 'Bluepeak', startDate: '2022-01', endDate: '2022-12' },
  ],
  education: [{ id: 'd1', institution: 'Example Institute', degree: 'B.Tech', field: 'CS', startYear: '2018', endYear: '2022' }],
};

describe('matching profile sent to the server', () => {
  test('contains only matching fields — never name, email, phone, WhatsApp, companies or institutions', () => {
    const matching = buildMatchingProfile(PROFILE);
    assert.deepEqual(matching, {
      skills: ['React', 'TypeScript'],
      currentRole: 'Frontend Developer',
      experienceTitles: ['Frontend Developer', 'Intern'],
      experienceYears: '3',
      experienceMonths: '2',
      currentLocation: 'Pune, Maharashtra, India',
      preferredLocations: ['Bengaluru, Karnataka, India'],
      education: [{ degree: 'B.Tech', field: 'CS' }],
    });
    assert.ok(!JSON.stringify(matching).match(/Asha|example\.com|9876543210|Northwind|Bluepeak|Institute|whatsapp/i));
  });

  test('a profile with nothing to match on is not sent', () => {
    assert.equal(buildMatchingProfile(null), null);
    assert.equal(buildMatchingProfile({ fullName: 'X', skills: [], experiences: [] }), null);
  });

  test('regenerate only when matching fields change (not company names or dates)', () => {
    const key = matchingProfileKey(buildMatchingProfile(PROFILE));
    const companyEdit = { ...PROFILE, currentCompany: 'Other', experiences: PROFILE.experiences.map((e) => ({ ...e, company: 'Other', startDate: '2020-01' })) };
    assert.equal(matchingProfileKey(buildMatchingProfile(companyEdit)), key);
    assert.notEqual(matchingProfileKey(buildMatchingProfile({ ...PROFILE, skills: [...PROFILE.skills, 'Redux'] })), key);
    assert.notEqual(
      matchingProfileKey(buildMatchingProfile({ ...PROFILE, experiences: [...PROFILE.experiences, { id: 'e3', title: 'Tech Lead', company: 'Z', startDate: '2024-01' }] })),
      key
    );
    assert.notEqual(matchingProfileKey(buildMatchingProfile({ ...PROFILE, preferredLocations: ['Mumbai'] })), key);
  });
});

describe('server response → app state', () => {
  const completed = {
    recommendationId: 'r1',
    profileVersion: 'v1',
    status: 'completed',
    items: [{ id: 'job-blr-1', title: 'React Developer', company: 'Northwind Tech', location: 'Bengaluru, Karnataka', fitLabel: 'Excellent Fit', matchedSkills: ['React'], gapSkills: ['Redux'], reason: 'Strong match' }],
    pollAfterMs: null,
    error: null,
  };

  test('completed → ready with JobCard fields (fit label, matched and gap skills) and a jobId for details', () => {
    const state = recommendationStateFrom(completed);
    assert.equal(state.status, 'ready');
    assert.deepEqual(
      [state.items[0].id, state.items[0].jobId, state.items[0].fitLabel, state.items[0].matchedSkills, state.items[0].gapSkills],
      ['job-blr-1', 'job-blr-1', 'Excellent Fit', ['React'], ['Redux']]
    );
    assert.deepEqual(recommendationView(state), { kind: 'list' });
  });

  test('only completed responses carry results (no candidates while waiting)', () => {
    for (const status of ['queued', 'processing', 'deferred', 'failed']) {
      const state = recommendationStateFrom({ ...completed, status, items: completed.items });
      assert.deepEqual(state.items, [], status);
    }
  });

  test('screen states: generating, waiting for quota, failed with/without retry, request error', () => {
    const now = Date.parse('2026-10-25T10:00:00Z');
    assert.deepEqual(recommendationView({ status: 'queued' }), { kind: 'status', status: 'loading' });
    assert.deepEqual(recommendationView({ status: 'idle' }), { kind: 'status', status: 'loading' });

    const deferredSoon = recommendationView(
      { status: 'deferred', message: 'High demand right now.', nextAttemptAt: '2026-10-25T10:05:00Z' },
      now
    );
    assert.equal(deferredSoon.status, 'deferred');
    assert.match(deferredSoon.message, /about 5 min/);
    const deferredDaily = recommendationView(
      { status: 'deferred', message: "Today's limit reached.", nextAttemptAt: '2026-10-26T07:00:00Z' },
      now
    );
    assert.match(deferredDaily.message, /daily reset/);

    assert.deepEqual(recommendationView({ status: 'failed', message: 'Try later', retryable: true }), {
      kind: 'status', status: 'error', message: 'Try later', canRetry: true,
    });
    assert.equal(recommendationView({ status: 'failed', retryable: false }).canRetry, false);
    assert.equal(recommendationView({ status: 'error', message: 'offline' }).canRetry, true);
  });
});

describe('polling', () => {
  test('polls while in progress at the server hint; stops on final states', () => {
    assert.equal(nextPollDelay({ status: 'queued', pollAfterMs: 2000 }), 2000);
    assert.equal(nextPollDelay({ status: 'processing', pollAfterMs: null }), 2000);
    assert.equal(nextPollDelay({ status: 'deferred', pollAfterMs: 45000 }), 45000);
    assert.equal(nextPollDelay({ status: 'deferred', pollAfterMs: 9999999 }), 60000);
    for (const status of ['ready', 'failed', 'error', 'none', 'idle']) {
      assert.equal(nextPollDelay({ status, pollAfterMs: 2000 }), null, status);
      assert.equal(isInProgress(status), false);
    }
  });
});
