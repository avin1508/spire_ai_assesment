// Email/password authentication, sessions, the profile API, guest → account
// linking (Scenarios A–D) and owner isolation. Real in-memory MongoDB
// (GridFS included) and the real API; queues are replaced by recorders.
// Only made-up test users and passwords are used.

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { Session } from '../src/models/session.model.js';
import { Profile } from '../src/models/profile.model.js';
import { GuestLink } from '../src/models/guestLink.model.js';
import { Resume } from '../src/models/resume.model.js';
import { Recommendation } from '../src/models/recommendation.model.js';
import { guestOwnerKey } from '../src/middleware/owner.js';
import { pruneRateLimits } from '../src/middleware/rateLimit.js';
import { setLinkStepHook } from '../src/services/guestLink.service.js';
import { cleanupResumes } from '../src/services/resumes.service.js';
import { hashToken, userOwnerKey } from '../src/services/auth.service.js';
import { readResumeFile, saveResumeFile } from '../src/storage/resumeFiles.js';
import { setResumeEnqueuer } from '../src/queue/resumeQueue.js';
import { setRecommendationEnqueuer } from '../src/queue/recommendationQueue.js';
import { makePdf } from './helpers/resumeFixtures.js';

const PASSWORD = 'test-Passw0rd!'; // fixture only

const GUEST_PROFILE = {
  fullName: 'Neha Joshi',
  email: 'neha.work@example.com',
  countryCode: '+91',
  phone: '9810011111',
  whatsappOptIn: true,
  currentRole: 'MERN Stack Developer',
  currentCompany: 'Pixelcraft Labs',
  currentLocation: 'Indore, Madhya Pradesh, India',
  preferredLocations: ['Bengaluru', 'Pune'],
  experienceYears: '2',
  experienceMonths: '7',
  skills: ['React.js', 'Node.js', 'MongoDB'],
  experiences: [
    { id: 'r1-exp-1', title: 'MERN Stack Developer', company: 'Pixelcraft Labs', startDate: '2024-03', endDate: null, source: 'resume' },
    { id: 'exp-1700000000000', title: 'Freelance Tutor', company: 'Self', startDate: '2023-01', endDate: '2023-06', source: 'manual' },
  ],
  education: [
    { id: 'r1-edu-1', institution: 'Example University', degree: 'B.Tech', field: 'IT', startYear: '2019', endYear: '2023', source: 'resume' },
  ],
};

let mongod;
let server;
let base;
let restoreQueues = [];

before(
  async () => {
    process.env.BCRYPT_ROUNDS = '4'; // fast hashing in tests only
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'spire_auth_test' });
    await Promise.all([User, Session, Profile, GuestLink, Resume, Recommendation].map((model) => model.createIndexes()));
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  },
  { timeout: 600000 }
);

after(async () => {
  restoreQueues.forEach((restore) => restore());
  server?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

let queued;
beforeEach(() => {
  pruneRateLimits(true);
  queued = { resumes: [], recommendations: [] };
  restoreQueues.forEach((restore) => restore());
  restoreQueues = [
    setResumeEnqueuer(async (job) => queued.resumes.push(job)),
    setRecommendationEnqueuer(async (job) => queued.recommendations.push(job)),
  ];
});

// --- helpers ---------------------------------------------------------------------------

async function api(method, path, { token, guest, json, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(guest ? { 'X-Guest-Session': guest } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const uniqueEmail = (label = 'user') => `${label}.${randomUUID().slice(0, 8)}@example.test`;

async function registerUser(label = 'user', name = 'Test User') {
  const email = uniqueEmail(label);
  const { status, body } = await api('POST', '/api/auth/register', { json: { name, email, password: PASSWORD } });
  assert.equal(status, 201);
  return { ...body, email };
}

const loginUser = (email, password = PASSWORD) => api('POST', '/api/auth/login', { json: { email, password } });
const link = (token, guest, json) => api('POST', '/api/auth/link-guest', { token, guest, json });

// A confirmed resume (file in GridFS + record) owned by `ownerKey`.
async function confirmedResume(ownerType, ownerKey, fileName = 'cv.pdf') {
  const buffer = makePdf();
  const fileId = await saveResumeFile(buffer, { fileName, contentType: 'application/pdf', ownerType });
  return Resume.create({
    ownerType, ownerKey, fileId, fileName, kind: 'pdf', contentType: 'application/pdf', size: buffer.length,
    status: 'completed', confirmedAt: new Date(), expiresAt: null,
  });
}

function recommendationFor(ownerType, ownerKey, profileVersion = randomUUID().replace(/-/g, '')) {
  return Recommendation.create({
    ownerType, ownerKey, profileVersion, matchingProfile: { skills: ['React'] }, requestedAt: new Date(), status: 'completed',
  });
}

// A guest with any of: a saved profile (through the real API), a confirmed resume, recommendations.
async function makeGuest({ profile = null, resume = false, recommendations = 0 } = {}) {
  const guest = randomUUID();
  const key = guestOwnerKey(guest);
  if (profile) assert.equal((await api('PUT', '/api/profile', { guest, json: { profile, baseRevision: null } })).status, 200);
  const resumeDoc = resume ? await confirmedResume('guest', key, 'guest-cv.pdf') : null;
  const recs = [];
  for (let i = 0; i < recommendations; i += 1) recs.push(await recommendationFor('guest', key));
  return { guest, key, resumeDoc, recs };
}

const rawProfile = (ownerKey) => mongoose.connection.collection('profiles').findOne({ ownerKey });

// --- authentication --------------------------------------------------------------------

describe('registration and login', () => {
  test('1. registration creates the user and a working session', async () => {
    const email = uniqueEmail('Reg').toUpperCase();
    const { status, body } = await api('POST', '/api/auth/register', { json: { name: ' Asha ', email, password: PASSWORD } });
    assert.equal(status, 201);
    assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'token', 'user']);
    assert.deepEqual([body.user.name, body.user.email], ['Asha', email.toLowerCase()]);
    assert.ok(new Date(body.expiresAt) > new Date());
    const me = await api('GET', '/api/auth/me', { token: body.token });
    assert.deepEqual([me.status, me.body.user.id], [200, body.user.id]);
    assert.equal(await Profile.countDocuments({ userId: body.user.id }), 0, 'no profile is created at registration');
  });

  test('2. a duplicate email (any case) → 409 email_taken; still one user', async () => {
    const { email } = await registerUser('dup');
    const again = await api('POST', '/api/auth/register', { json: { name: 'Other', email: email.toUpperCase(), password: PASSWORD } });
    assert.deepEqual([again.status, again.body.error], [409, 'email_taken']);
    assert.equal(await User.countDocuments({ email }), 1);
  });

  test('3. invalid email and missing fields → 400 with the fields named', async () => {
    const missing = await api('POST', '/api/auth/register', { json: {} });
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.body.details.map((d) => d.param).sort(), ['email', 'name', 'password']);
    const badEmail = await api('POST', '/api/auth/register', { json: { name: 'A', email: 'not-an-email', password: PASSWORD } });
    assert.deepEqual(badEmail.body.details.map((d) => d.param), ['email']);
    const shortPassword = await api('POST', '/api/auth/register', { json: { name: 'A', email: uniqueEmail(), password: 'short' } });
    assert.deepEqual(shortPassword.body.details.map((d) => d.param), ['password']);
    const tooLong = await api('POST', '/api/auth/register', { json: { name: 'A', email: uniqueEmail(), password: 'x'.repeat(73) } });
    assert.deepEqual(tooLong.body.details.map((d) => d.param), ['password'], 'bcrypt limit: rejected, not truncated');
    const loginMissing = await api('POST', '/api/auth/login', { json: { email: 'nope' } });
    assert.deepEqual(loginMissing.body.details.map((d) => d.param).sort(), ['email', 'password']);
    assert.equal(await User.countDocuments({ email: 'not-an-email' }), 0);
  });

  test('5. the password is stored only as a bcrypt hash; session tokens only as hashes', async () => {
    const { email, token } = await registerUser('hash');
    const raw = await mongoose.connection.collection('users').findOne({ email });
    assert.match(raw.passwordHash, /^\$2[aby]\$\d{2}\$/);
    assert.ok(!JSON.stringify(raw).includes(PASSWORD));
    const sessions = await mongoose.connection.collection('sessions').find({ userId: raw._id }).toArray();
    assert.ok(!JSON.stringify(sessions).includes(token));
    assert.equal(sessions[0].tokenHash, hashToken(token));
    const viaModel = await User.findOne({ email }).lean();
    assert.equal(viaModel.passwordHash, undefined, 'the hash is not selected by default');
  });

  test('6. login with the right password → a new session', async () => {
    const { email, token: first } = await registerUser('login');
    const { status, body } = await loginUser(email.toUpperCase());
    assert.equal(status, 200);
    assert.notEqual(body.token, first);
    assert.equal((await api('GET', '/api/auth/me', { token: body.token })).body.user.email, email);
  });

  test('7–8. wrong password and unknown email get the same 401 (no account enumeration)', async () => {
    const { email } = await registerUser('wrong');
    const wrong = await loginUser(email, 'not-the-password');
    const unknown = await loginUser(uniqueEmail('nobody'));
    assert.deepEqual([wrong.status, wrong.body], [401, { error: 'invalid_credentials', message: 'Incorrect email or password.' }]);
    assert.deepEqual([unknown.status, unknown.body], [401, wrong.body]);
  });

  test('repeated failed logins are rate limited (429 + Retry-After)', async () => {
    const { email } = await registerUser('limit');
    let last;
    for (let i = 0; i < 11; i += 1) last = await loginUser(email, 'wrong-password');
    assert.deepEqual([last.status, last.body.error], [429, 'too_many_attempts']);
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert.equal(response.status, 429, 'blocked even with the right password until the window ends');
    assert.ok(Number(response.headers.get('retry-after')) > 0);
  });
});

describe('sessions and logout', () => {
  test('9. invalid, expired and revoked sessions → 401; no token → 401', async () => {
    const { token } = await registerUser('sess');
    for (const bad of ['garbage', 'x'.repeat(43), `${token.slice(0, -2)}AA`]) {
      const result = await api('GET', '/api/auth/me', { token: bad });
      assert.deepEqual([result.status, result.body.error], [401, 'session_invalid']);
    }
    await Session.updateOne({ tokenHash: hashToken(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await api('GET', '/api/auth/me', { token })).status, 401, 'expired');
    const { token: second } = await registerUser('sess2');
    await Session.updateOne({ tokenHash: hashToken(second) }, { $set: { revokedAt: new Date() } });
    assert.equal((await api('GET', '/api/auth/me', { token: second })).status, 401, 'revoked');
    assert.deepEqual((await api('GET', '/api/auth/me')).body.error, 'auth_required');
    const malformed = await api('GET', '/api/auth/me', { headers: { Authorization: 'Basic abc' } });
    assert.equal(malformed.status, 401);
  });

  test('10. logout revokes the session; the token is rejected everywhere afterwards', async () => {
    const { token, email } = await registerUser('logout');
    const other = (await loginUser(email)).body.token;
    assert.equal((await api('POST', '/api/auth/logout', { token })).status, 204);
    assert.equal((await api('GET', '/api/auth/me', { token })).status, 401);
    assert.equal((await api('GET', '/api/profile', { token })).status, 401);
    assert.equal((await api('POST', '/api/auth/logout', { token })).status, 401);
    assert.equal((await api('GET', '/api/auth/me', { token: other })).status, 200, 'other sessions stay valid');
  });
});

// --- profile API -----------------------------------------------------------------------

describe('profile persistence', () => {
  test('the complete profile is stored and returned; unknown fields are dropped', async () => {
    const { token } = await registerUser('profile');
    const saved = await api('PUT', '/api/profile', { token, json: { profile: { ...GUEST_PROFILE, password: 'x', isAdmin: true }, baseRevision: null } });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.profile, GUEST_PROFILE);
    assert.equal(saved.body.revision, 1);
    const loaded = await api('GET', '/api/profile', { token });
    assert.deepEqual(loaded.body.profile, GUEST_PROFILE);
    const raw = await Profile.findOne({ fullName: GUEST_PROFILE.fullName, ownerType: 'user' }).lean();
    assert.equal(raw.password, undefined);
    assert.equal(raw.isAdmin, undefined);
    const invalid = await api('PUT', '/api/profile', { token, json: { profile: { email: 'x' }, baseRevision: 1 } });
    assert.equal(invalid.status, 400);
  });

  test('31 (server). a save based on an old revision → 409 and the newer data is kept', async () => {
    const { token } = await registerUser('conflict');
    await api('PUT', '/api/profile', { token, json: { profile: GUEST_PROFILE, baseRevision: null } });
    const newer = await api('PUT', '/api/profile', { token, json: { profile: { ...GUEST_PROFILE, phone: '9000000001' }, baseRevision: 1 } });
    assert.equal(newer.body.revision, 2);
    const stale = await api('PUT', '/api/profile', { token, json: { profile: { ...GUEST_PROFILE, phone: '9000000002' }, baseRevision: 1 } });
    assert.deepEqual([stale.status, stale.body.error], [409, 'profile_conflict']);
    const recreate = await api('PUT', '/api/profile', { token, json: { profile: GUEST_PROFILE, baseRevision: null } });
    assert.equal(recreate.status, 409, '"no profile yet" when there is one');
    assert.equal((await api('GET', '/api/profile', { token })).body.profile.phone, '9000000001');
  });
});

// --- guest linking ---------------------------------------------------------------------

describe('Scenario A: guest registers for the first time', () => {
  test('11. complete guest profile + resume + recommendations all move to the new account', async () => {
    const g = await makeGuest({ profile: GUEST_PROFILE, resume: true, recommendations: 2 });
    const { token, user } = await registerUser('a11');
    const result = await link(token, g.guest);
    assert.deepEqual(result.body, { status: 'completed', profile: 'linked', resume: 'linked', recommendations: 2 });

    const account = await api('GET', '/api/profile', { token });
    assert.deepEqual(account.body.profile, GUEST_PROFILE);
    assert.equal(account.body.resume.resumeId, String(g.resumeDoc._id));
    const resume = await Resume.findById(g.resumeDoc._id);
    assert.deepEqual([resume.ownerType, resume.ownerKey, resume.archivedAt], ['user', userOwnerKey(user.id), null]);
    assert.ok((await readResumeFile(resume.fileId)).length > 0, 'the file is intact');
    const download = await fetch(`${base}/api/resumes/${g.resumeDoc._id}/download`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(download.status, 200);
    assert.equal(await Recommendation.countDocuments({ ownerKey: userOwnerKey(user.id) }), 2);
    assert.equal((await api('GET', '/api/recommendations/current', { token })).body.status, 'completed');
    // Nothing is left with (or reachable through) the guest session.
    assert.equal((await api('GET', '/api/profile', { guest: g.guest })).body.profile, null);
    assert.equal(await Recommendation.countDocuments({ ownerKey: g.key }), 0);
  });

  test('12. no guest data → nothing linked and no profile created', async () => {
    const { token, user } = await registerUser('a12');
    const result = await link(token, randomUUID());
    assert.deepEqual(result.body, { status: 'completed', profile: 'none', resume: 'none', recommendations: 0 });
    assert.equal(await Profile.countDocuments({ userId: user.id }), 0);
    assert.deepEqual((await api('GET', '/api/profile', { token })).body, { profile: null, revision: null, updatedAt: null, resume: null });
  });

  test('13. profile without a resume → profile linked, no resume', async () => {
    const g = await makeGuest({ profile: GUEST_PROFILE });
    const { token } = await registerUser('a13');
    assert.deepEqual((await link(token, g.guest)).body, { status: 'completed', profile: 'linked', resume: 'none', recommendations: 0 });
    const account = (await api('GET', '/api/profile', { token })).body;
    assert.deepEqual([account.profile, account.resume], [GUEST_PROFILE, null]);
  });

  test('14. resume without a (complete) profile → resume becomes the new account\'s resume, no profile invented', async () => {
    const g = await makeGuest({ resume: true });
    const { token, user } = await registerUser('a14');
    assert.deepEqual((await link(token, g.guest)).body, { status: 'completed', profile: 'none', resume: 'linked', recommendations: 0 });
    const account = (await api('GET', '/api/profile', { token })).body;
    assert.equal(account.profile, null);
    assert.equal(account.resume.resumeId, String(g.resumeDoc._id));
    assert.equal(await Profile.countDocuments({ userId: user.id }), 0);
  });

  test('23. the login email and the professional profile email stay independent', async () => {
    const g = await makeGuest({ profile: GUEST_PROFILE });
    const { token, email } = await registerUser('login-email');
    await link(token, g.guest);
    assert.equal((await api('GET', '/api/auth/me', { token })).body.user.email, email);
    const account = (await api('GET', '/api/profile', { token })).body;
    assert.equal(account.profile.email, 'neha.work@example.com');
    await api('PUT', '/api/profile', { token, json: { profile: { ...account.profile, email: 'new.work@example.com' }, baseRevision: account.revision } });
    assert.equal((await api('GET', '/api/auth/me', { token })).body.user.email, email, 'changing the profile email never changes the login email');
    assert.equal((await loginUser(email)).status, 200);
  });
});

describe('Scenario B: guest logs into an existing account', () => {
  test('15. an existing Profile document is not modified at all (no fill-in, no merge)', async () => {
    const { email, token: firstToken, user } = await registerUser('b15');
    // A sparse account profile: missing phone, role, skills, experiences…
    const sparse = { fullName: 'Ravi Kumar', email: 'ravi@example.com', preferredLocations: ['Mumbai'] };
    await api('PUT', '/api/profile', { token: firstToken, json: { profile: sparse, baseRevision: null } });
    await api('POST', '/api/auth/logout', { token: firstToken });
    const before = await rawProfile(userOwnerKey(user.id));

    const g = await makeGuest({ profile: GUEST_PROFILE, recommendations: 1 });
    const { body: session } = await loginUser(email);
    const result = await link(session.token, g.guest);
    assert.deepEqual(result.body, { status: 'completed', profile: 'kept', resume: 'none', recommendations: 0 });

    const afterLink = await rawProfile(userOwnerKey(user.id));
    assert.deepEqual(afterLink, before, 'byte-for-byte the same document (fields, arrays, revision, updatedAt)');
    assert.deepEqual([afterLink.phone, afterLink.skills, afterLink.experiences], ['', [], []]);
    // The guest's own data is left untouched with the guest (not merged, not deleted).
    assert.equal((await api('GET', '/api/profile', { guest: g.guest })).body.profile.fullName, 'Neha Joshi');
    assert.equal(await Recommendation.countDocuments({ ownerKey: g.key }), 1);
  });

  test('16. no Profile document on the account + guest profile → the guest profile is linked', async () => {
    const { email } = await registerUser('b16');
    const g = await makeGuest({ profile: GUEST_PROFILE, recommendations: 1 });
    const { body: session } = await loginUser(email);
    assert.deepEqual((await link(session.token, g.guest)).body, { status: 'completed', profile: 'linked', resume: 'none', recommendations: 1 });
    assert.deepEqual((await api('GET', '/api/profile', { token: session.token })).body.profile, GUEST_PROFILE);
  });

  test('17. no account profile and no guest data → login works, nothing is created', async () => {
    const { email, user } = await registerUser('b17');
    const { status, body } = await loginUser(email);
    assert.equal(status, 200);
    assert.equal((await link(body.token, randomUUID())).body.profile, 'none');
    assert.equal(await Profile.countDocuments({ userId: user.id }), 0);
    assert.equal(await Profile.countDocuments({ ownerKey: userOwnerKey(user.id) }), 0);
  });

  test('18. the account\'s resume is kept; the guest resume is retained (archived), and cleanup removes neither', async () => {
    const { email, user } = await registerUser('b18');
    const accountKey = userOwnerKey(user.id);
    const accountResume = await confirmedResume('user', accountKey, 'account-cv.pdf');
    const g = await makeGuest({ resume: true }); // newer than the account's
    const { body: session } = await loginUser(email);
    assert.deepEqual((await link(session.token, g.guest)).body, { status: 'completed', profile: 'none', resume: 'retained', recommendations: 0 });

    assert.equal((await api('GET', '/api/profile', { token: session.token })).body.resume.resumeId, String(accountResume._id));
    const guestResume = await Resume.findById(g.resumeDoc._id);
    assert.equal(guestResume.ownerKey, accountKey);
    assert.ok(guestResume.archivedAt instanceof Date);
    await cleanupResumes();
    assert.ok(await Resume.exists({ _id: accountResume._id }));
    assert.ok(await Resume.exists({ _id: g.resumeDoc._id }));
    assert.ok((await readResumeFile(guestResume.fileId)).length > 0);
    assert.equal((await api('GET', '/api/profile', { token: session.token })).body.resume.resumeId, String(accountResume._id));
  });
});

describe('link safety', () => {
  test('19. retrying the same link changes nothing more', async () => {
    const g = await makeGuest({ profile: GUEST_PROFILE, resume: true, recommendations: 2 });
    const { token, user } = await registerUser('retry');
    const first = await link(token, g.guest);
    const profileBefore = await rawProfile(userOwnerKey(user.id));
    const [second, third] = await Promise.all([link(token, g.guest), link(token, g.guest)]);
    assert.deepEqual(second.body, first.body);
    assert.deepEqual(third.body, first.body);
    assert.deepEqual(await rawProfile(userOwnerKey(user.id)), profileBefore);
    assert.equal(await Profile.countDocuments({ userId: user.id }), 1);
    assert.equal(await GuestLink.countDocuments({ guestKey: g.key }), 1);
    assert.equal(await Resume.countDocuments({ ownerKey: userOwnerKey(user.id) }), 1);
    assert.equal(await Recommendation.countDocuments({ ownerKey: userOwnerKey(user.id) }), 2);
  });

  test('20. a failure part-way through, then a retry: the same plan finishes, nothing lost or duplicated', async () => {
    for (const failAt of ['claim', 'profile', 'resume']) {
      const g = await makeGuest({ profile: GUEST_PROFILE, resume: true, recommendations: 2 });
      const { token, user } = await registerUser(`partial-${failAt}`);
      const restore = setLinkStepHook(async (step) => {
        if (step === failAt) throw new Error('simulated crash');
      });
      const failed = await link(token, g.guest);
      restore();
      assert.equal(failed.status, 500, failAt);
      assert.equal((await GuestLink.findOne({ guestKey: g.key })).status, 'in_progress');

      // Another account can't take over a half-finished link.
      const intruder = await registerUser('intruder');
      assert.equal((await link(intruder.token, g.guest)).status, 409);

      const retried = await link(token, g.guest);
      assert.deepEqual(retried.body, { status: 'completed', profile: 'linked', resume: 'linked', recommendations: 2 }, failAt);
      const userKey = userOwnerKey(user.id);
      assert.deepEqual((await api('GET', '/api/profile', { token })).body.profile, GUEST_PROFILE);
      const resume = await Resume.findById(g.resumeDoc._id);
      assert.deepEqual([resume.ownerKey, resume.archivedAt], [userKey, null], 'linked as current, not archived by the retry');
      assert.equal(await Recommendation.countDocuments({ ownerKey: userKey }), 2);
      assert.equal(await Profile.countDocuments({ ownerKey: userOwnerKey(intruder.user.id) }), 0);
      assert.equal(await Resume.countDocuments({ ownerKey: userOwnerKey(intruder.user.id) }), 0);
    }
  });

  test('21. a guest session already linked to one account can\'t be linked to another', async () => {
    const g = await makeGuest({ profile: GUEST_PROFILE, resume: true, recommendations: 1 });
    const a = await registerUser('owner-a');
    const b = await registerUser('owner-b');
    await link(a.token, g.guest);
    const attempt = await link(b.token, g.guest);
    assert.deepEqual([attempt.status, attempt.body.error], [409, 'guest_already_linked']);
    assert.equal((await api('GET', '/api/profile', { token: b.token })).body.profile, null);
    assert.deepEqual((await api('GET', '/api/profile', { token: a.token })).body.profile, GUEST_PROFILE);
    assert.equal((await GuestLink.findOne({ guestKey: g.key })).userId.toString(), a.user.id);
  });

  test('22. a client-supplied user id never decides the account; linking needs the guest session itself', async () => {
    const a = await registerUser('victim');
    const b = await registerUser('attacker');
    const g = await makeGuest({ profile: GUEST_PROFILE });
    // B names A in the body: the link still goes to B (the verified session).
    const result = await link(b.token, g.guest, { userId: a.user.id });
    assert.equal(result.body.profile, 'linked');
    assert.equal((await api('GET', '/api/profile', { token: a.token })).body.profile, null);
    // Another user's (already linked) guest session → rejected.
    assert.equal((await link(a.token, g.guest)).status, 409);
    // Without the guest session header, or without a session, nothing can be linked.
    assert.equal((await link(a.token, undefined)).status, 400);
    assert.equal((await link(undefined, randomUUID())).status, 401);
    assert.equal((await api('POST', '/api/auth/link-guest', { guest: randomUUID(), headers: { 'X-User-Id': a.user.id } })).status, 401);
  });
});

// --- isolation -------------------------------------------------------------------------

describe('Scenario D and account isolation', () => {
  test('24–25. A\'s data persists across logout/login; B never sees it', async () => {
    const a = await registerUser('iso-a');
    await api('PUT', '/api/profile', { token: a.token, json: { profile: GUEST_PROFILE, baseRevision: null } });
    const aResume = await confirmedResume('user', userOwnerKey(a.user.id));
    await recommendationFor('user', userOwnerKey(a.user.id));
    await api('POST', '/api/auth/logout', { token: a.token });

    const b = await registerUser('iso-b');
    const bProfile = await api('GET', '/api/profile', { token: b.token });
    assert.deepEqual([bProfile.body.profile, bProfile.body.resume], [null, null]);
    assert.equal((await api('GET', '/api/recommendations/current', { token: b.token })).body.status, 'none');
    assert.equal((await api('GET', `/api/resumes/jobs/${aResume._id}`, { token: b.token })).status, 404);
    assert.equal((await fetch(`${base}/api/resumes/${aResume._id}/download`, { headers: { Authorization: `Bearer ${b.token}` } })).status, 404);

    const again = (await loginUser(a.email)).body;
    const aProfile = (await api('GET', '/api/profile', { token: again.token })).body;
    assert.deepEqual(aProfile.profile, GUEST_PROFILE);
    assert.equal(aProfile.resume.resumeId, String(aResume._id));
    assert.equal((await api('GET', '/api/recommendations/current', { token: again.token })).body.status, 'completed');
  });

  test('a fresh guest session after logout sees none of the account\'s data', async () => {
    const a = await registerUser('fresh');
    await api('PUT', '/api/profile', { token: a.token, json: { profile: GUEST_PROFILE, baseRevision: null } });
    await api('POST', '/api/auth/logout', { token: a.token });
    const guest = randomUUID();
    assert.equal((await api('GET', '/api/profile', { guest })).body.profile, null);
    assert.equal((await api('GET', '/api/recommendations/current', { guest })).body.status, 'none');
  });

  test('28. guest resume upload and recommendations still work', async () => {
    const guest = randomUUID();
    const form = new FormData();
    form.append('file', new Blob([makePdf()], { type: 'application/pdf' }), 'cv.pdf');
    const upload = await fetch(`${base}/api/resumes`, { method: 'POST', body: form, headers: { 'X-Guest-Session': guest } });
    assert.equal(upload.status, 202);
    const doc = await Resume.findById((await upload.json()).jobId);
    assert.deepEqual([doc.ownerType, doc.ownerKey], ['guest', guestOwnerKey(guest)]);
    const rec = await api('POST', '/api/recommendations', { guest, json: { matchingProfile: { skills: ['React'] } } });
    assert.equal(rec.status, 202);
    assert.equal(queued.recommendations.length, 1);
  });

  test('29. signed-in resume and recommendation endpoints use the verified user and enforce ownership', async () => {
    const a = await registerUser('own-a');
    const b = await registerUser('own-b');
    const form = new FormData();
    form.append('file', new Blob([makePdf()], { type: 'application/pdf' }), 'cv.pdf');
    const upload = await fetch(`${base}/api/resumes`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${a.token}` } });
    assert.equal(upload.status, 202);
    const { jobId } = await upload.json();
    const doc = await Resume.findById(jobId);
    assert.deepEqual([doc.ownerType, doc.ownerKey], ['user', userOwnerKey(a.user.id)]);
    assert.equal((await api('GET', `/api/resumes/jobs/${jobId}`, { token: a.token })).status, 200);
    assert.equal((await api('GET', `/api/resumes/jobs/${jobId}`, { token: b.token })).status, 404);
    assert.equal((await api('GET', `/api/resumes/jobs/${jobId}`, { guest: randomUUID() })).status, 404);

    const rec = await api('POST', '/api/recommendations', { token: a.token, json: { matchingProfile: { skills: ['Java'] } } });
    assert.equal(rec.status, 202);
    assert.equal((await Recommendation.findById(rec.body.recommendationId)).ownerKey, userOwnerKey(a.user.id));
    assert.equal((await api('GET', '/api/recommendations/current', { token: b.token })).body.status, 'none');
    assert.equal((await api('POST', `/api/recommendations/${rec.body.recommendationId}/retry`, { token: b.token })).status, 404);
    // The guest header is ignored when a session token is present.
    const both = await api('GET', '/api/recommendations/current', { token: b.token, guest: randomUUID() });
    assert.equal(both.body.status, 'none');
  });
});
