// Push notifications for completed recommendations: device registration and
// ownership (guest / signed-in user), the completion trigger in the real
// worker processor, duplicate prevention, missing devices, delivery
// failures and owner isolation. In-memory MongoDB and the real API; FCM is
// replaced by a recording fake sender (no network, no credentials).

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { Job } from '../src/models/job.model.js';
import { Recommendation } from '../src/models/recommendation.model.js';
import { PushDevice } from '../src/models/pushDevice.model.js';
import { User } from '../src/models/user.model.js';
import { Session } from '../src/models/session.model.js';
import { JOBS } from '../src/data/jobs.dataset.js';
import { toJobDocument } from '../src/seed/jobTransform.js';
import { setRecommendationEnqueuer } from '../src/queue/recommendationQueue.js';
import { createRecommendationProcessor } from '../src/workers/recommendationWorker.js';
import { guestOwnerKey } from '../src/middleware/owner.js';
import { pruneRateLimits } from '../src/middleware/rateLimit.js';
import { userOwnerKey } from '../src/services/auth.service.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findServiceAccountFile, notifyRecommendationReady, pushSenderFromKeyFile, readyMessage, setPushSender } from '../src/services/push.service.js';

const PROFILE = { skills: ['React', 'JavaScript', 'TypeScript', 'Redux'], currentRole: 'Frontend Developer', currentLocation: 'Pune, Maharashtra' };
const PASSWORD = 'test-Passw0rd!'; // fixture only

let mongod;
let server;
let base;
let queued;
let sent; // what the fake FCM sender received
let senderResult; // (token) => result
let restore = [];

before(
  async () => {
    process.env.BCRYPT_ROUNDS = '4';
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'spire_push_test' });
    await Promise.all([Job, Recommendation, PushDevice, User, Session].map((model) => model.createIndexes()));
    await Job.insertMany(JOBS.map((job) => toJobDocument(job)));
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  },
  { timeout: 600000 }
);

after(async () => {
  restore.forEach((undo) => undo());
  server?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(() => {
  pruneRateLimits(true);
  queued = [];
  sent = [];
  senderResult = () => ({ ok: true });
  restore.forEach((undo) => undo());
  restore = [
    setRecommendationEnqueuer(async (job) => queued.push({ recommendationId: String(job.recommendationId), run: job.run })),
    setPushSender(async (message) => {
      sent.push(message);
      return senderResult(message.token);
    }),
  ];
});

async function api(method, path, { guest, token, json } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(guest ? { 'X-Guest-Session': guest } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const fcmToken = () => `fcm-${randomUUID()}:${randomUUID().replace(/-/g, '')}`;
const registerDevice = (who, token) => api('PUT', '/api/devices', { ...who, json: { token, platform: 'android' } });

async function newUser() {
  const email = `push.${randomUUID().slice(0, 8)}@example.test`;
  const { body } = await api('POST', '/api/auth/register', { json: { name: 'Push Test', email, password: PASSWORD } });
  return body;
}

const goodRanker = Object.assign(
  async (profile, jobs) => ({
    rankings: jobs.slice(0, 10).map((job) => ({ jobId: job.jobId, fitLabel: 'Good Fit', reason: 'Matches React' })),
  }),
  { model: 'test-model' }
);
const fakeJob = ({ recommendationId, run }, attemptsMade = 0) => ({ data: { recommendationId, run }, attemptsMade, opts: { attempts: 4 } });

// Requests recommendations for `who` and runs the real worker processor on the queued job.
async function generate(who, { ranker = goodRanker, profile = PROFILE } = {}) {
  const created = await api('POST', '/api/recommendations', { ...who, json: { matchingProfile: profile } });
  const job = queued.at(-1);
  const result = await createRecommendationProcessor({ rankJobs: ranker })(fakeJob(job));
  return { recommendationId: created.body.recommendationId, job, result };
}

describe('device registration', () => {
  test('a guest and a signed-in user each register their device to themselves', async () => {
    const guest = randomUUID();
    const guestToken = fcmToken();
    assert.deepEqual((await registerDevice({ guest }, guestToken)).body, { registered: true });
    const user = await newUser();
    const userToken = fcmToken();
    await registerDevice({ token: user.token }, userToken);
    const devices = await PushDevice.find({ token: { $in: [guestToken, userToken] } }).lean();
    const byToken = Object.fromEntries(devices.map((d) => [d.token, d]));
    assert.deepEqual([byToken[guestToken].ownerType, byToken[guestToken].ownerKey], ['guest', guestOwnerKey(guest)]);
    assert.deepEqual([byToken[userToken].ownerType, byToken[userToken].ownerKey], ['user', userOwnerKey(user.user.id)]);
  });

  test('re-registering on login / logout moves the device; one token = one owner', async () => {
    const token = fcmToken();
    const guest = randomUUID();
    await registerDevice({ guest }, token);
    const user = await newUser();
    await registerDevice({ token: user.token }, token); // login
    await registerDevice({ guest: randomUUID() }, token); // logout → fresh guest
    const devices = await PushDevice.find({ token }).lean();
    assert.equal(devices.length, 1);
    assert.equal(devices[0].ownerType, 'guest');
    assert.notEqual(devices[0].ownerKey, guestOwnerKey(guest));
  });

  test('only the owner can unregister its device; invalid input and missing identity are rejected', async () => {
    const token = fcmToken();
    const user = await newUser();
    await registerDevice({ token: user.token }, token);
    const other = await newUser();
    assert.deepEqual((await api('DELETE', '/api/devices', { token: other.token, json: { token } })).body, { removed: false });
    assert.deepEqual((await api('DELETE', '/api/devices', { guest: randomUUID(), json: { token } })).body, { removed: false });
    assert.equal(await PushDevice.countDocuments({ token }), 1);
    assert.deepEqual((await api('DELETE', '/api/devices', { token: user.token, json: { token } })).body, { removed: true });
    assert.equal((await registerDevice({ guest: randomUUID() }, '')).status, 400);
    assert.equal((await api('PUT', '/api/devices', { guest: randomUUID(), json: { token: fcmToken(), platform: 'ios' } })).status, 400);
    assert.equal((await registerDevice({}, fcmToken())).status, 401);
    assert.equal((await registerDevice({ token: 'not-a-valid-session-token-xx' }, fcmToken())).status, 401);
  });
});

describe('notification on completion', () => {
  test('guest: one notification with the real count, sent only after the results are saved', async () => {
    const guest = randomUUID();
    const token = fcmToken();
    await registerDevice({ guest }, token);
    let savedWhenSent = null;
    senderResult = () => ({ ok: true });
    restore.push(
      setPushSender(async (message) => {
        sent.push(message);
        savedWhenSent = await Recommendation.findById(message.data.recommendationId).lean();
        return { ok: true };
      })
    );
    const { recommendationId, result } = await generate({ guest });
    assert.deepEqual(result, { completed: true });
    assert.equal(sent.length, 1);
    const doc = await Recommendation.findById(recommendationId).lean();
    const count = doc.items.length;
    assert.equal(count, 10);
    assert.equal(sent[0].token, token);
    assert.deepEqual([sent[0].title, sent[0].body], [readyMessage(count).title, readyMessage(count).body]);
    assert.equal(sent[0].body, "We've found 10 jobs matching your profile. Tap to explore them.");
    assert.deepEqual(sent[0].data, { type: 'recommendations_ready', recommendationId, count: '10' });
    assert.equal(savedWhenSent.status, 'completed');
    assert.equal(savedWhenSent.items.length, 10, 'results were persisted before sending');
    assert.deepEqual([doc.notification.status, doc.notification.sent], ['sent', 1]);
  });

  test('signed-in user: every device of the account is notified; other owners are not', async () => {
    const user = await newUser();
    const phone = fcmToken();
    const tablet = fcmToken();
    await registerDevice({ token: user.token }, phone);
    await registerDevice({ token: user.token }, tablet);
    const strangerGuest = randomUUID();
    const strangerToken = fcmToken();
    await registerDevice({ guest: strangerGuest }, strangerToken);
    const otherUser = await newUser();
    const otherToken = fcmToken();
    await registerDevice({ token: otherUser.token }, otherToken);

    await generate({ token: user.token });
    assert.deepEqual(sent.map((m) => m.token).sort(), [phone, tablet].sort());
    assert.ok(!sent.some((m) => m.token === strangerToken || m.token === otherToken));
  });

  test('after logout the device belongs to the new guest: the account\'s results no longer reach it', async () => {
    const user = await newUser();
    const token = fcmToken();
    await registerDevice({ token: user.token }, token);
    await registerDevice({ guest: randomUUID() }, token); // the app re-registers as the fresh guest
    await generate({ token: user.token });
    assert.equal(sent.length, 0);
  });

  test('a BullMQ retry or a repeated completion never notifies twice', async () => {
    const guest = randomUUID();
    await registerDevice({ guest }, fcmToken());
    const { recommendationId, job } = await generate({ guest });
    assert.equal(sent.length, 1);
    // The same job delivered again (retry / stalled job): the run is no longer active.
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: goodRanker })(fakeJob(job, 1)), { skipped: true });
    // The completion hook called again, even concurrently.
    await Promise.all([notifyRecommendationReady(recommendationId), notifyRecommendationReady(recommendationId)]);
    assert.equal(sent.length, 1);
    // Asking again for the same profile reuses the finished result: no new run, no new notification.
    const again = await api('POST', '/api/recommendations', { guest, json: { matchingProfile: PROFILE } });
    assert.equal(again.body.recommendationId, recommendationId);
    assert.equal(sent.length, 1);
  });

  test('no registered device → the run completes and nothing is sent', async () => {
    const guest = randomUUID();
    const { recommendationId, result } = await generate({ guest });
    assert.deepEqual(result, { completed: true });
    assert.equal(sent.length, 0);
    const doc = await Recommendation.findById(recommendationId).lean();
    assert.deepEqual([doc.status, doc.notification.status], ['completed', 'no_devices']);
  });

  test('a device registered just after completion (permission prompt still open) is notified once', async () => {
    const guest = randomUUID();
    const { recommendationId } = await generate({ guest });
    assert.equal(sent.length, 0);
    const token = fcmToken();
    await registerDevice({ guest }, token);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].token, token);
    assert.equal(sent[0].data.recommendationId, recommendationId);
    assert.equal((await Recommendation.findById(recommendationId)).notification.status, 'sent');
    await registerDevice({ guest }, token); // registering again (restart, token refresh)
    await registerDevice({ guest }, fcmToken()); // a second device later
    assert.equal(sent.length, 1, 'never twice');

    // Too old, or no longer the current run: not notified late.
    const oldGuest = randomUUID();
    const old = await generate({ guest: oldGuest });
    await Recommendation.updateOne({ _id: old.recommendationId }, { $set: { completedAt: new Date(Date.now() - 16 * 60000) } });
    await registerDevice({ guest: oldGuest }, fcmToken());
    const supersededGuest = randomUUID();
    await generate({ guest: supersededGuest });
    await api('POST', '/api/recommendations', { guest: supersededGuest, json: { matchingProfile: { ...PROFILE, skills: ['Elixir'] } } });
    await registerDevice({ guest: supersededGuest }, fcmToken());
    assert.equal(sent.length, 1);
  });

  test('delivery failures never fail the recommendation; unregistered tokens are removed', async () => {
    const guest = randomUUID();
    const dead = fcmToken();
    const flaky = fcmToken();
    await registerDevice({ guest }, dead);
    await registerDevice({ guest }, flaky);
    senderResult = (token) => (token === dead ? { ok: false, invalidToken: true, code: 'UNREGISTERED' } : { ok: false, invalidToken: false, code: 'UNAVAILABLE' });
    const { recommendationId, result } = await generate({ guest });
    assert.deepEqual(result, { completed: true });
    const doc = await Recommendation.findById(recommendationId).lean();
    assert.deepEqual([doc.status, doc.items.length, doc.notification.status], ['completed', 10, 'failed']);
    assert.equal(await PushDevice.countDocuments({ token: dead }), 0, 'unregistered token removed');
    assert.equal(await PushDevice.countDocuments({ token: flaky }), 1, 'a temporary error keeps the token');

    // A sender that throws (network down) or a broken notify hook: still completed.
    restore.push(setPushSender(async () => { throw new Error('socket hang up'); }));
    const second = await generate({ guest }, { profile: { ...PROFILE, skills: ['Vue', 'JavaScript'] } });
    assert.deepEqual(second.result, { completed: true });
    const third = await api('POST', '/api/recommendations', { guest, json: { matchingProfile: { ...PROFILE, skills: ['Angular'] } } });
    const brokenHook = createRecommendationProcessor({ rankJobs: goodRanker, notify: async () => { throw new Error('boom'); } });
    assert.deepEqual(await brokenHook(fakeJob(queued.at(-1))), { completed: true });
    assert.equal((await Recommendation.findById(third.body.recommendationId)).status, 'completed');
  });

  test('failed, superseded and empty runs are never notified', async () => {
    const guest = randomUUID();
    await registerDevice({ guest }, fcmToken());
    // Failed (permanent model error).
    const failing = Object.assign(async () => ({ rankings: 'nonsense' }), { model: 'x' });
    const created = await api('POST', '/api/recommendations', { guest, json: { matchingProfile: PROFILE } });
    await assert.rejects(createRecommendationProcessor({ rankJobs: failing })(fakeJob(queued.at(-1), 3)));
    assert.equal((await Recommendation.findById(created.body.recommendationId)).status, 'failed');
    // Superseded before it finished: the stale run is skipped.
    const first = await api('POST', '/api/recommendations', { guest, json: { matchingProfile: { ...PROFILE, skills: ['Go'] } } });
    const staleJob = queued.at(-1);
    await api('POST', '/api/recommendations', { guest, json: { matchingProfile: { ...PROFILE, skills: ['Rust'] } } });
    assert.equal((await Recommendation.findById(first.body.recommendationId)).status, 'superseded');
    assert.deepEqual(await createRecommendationProcessor({ rankJobs: goodRanker })(fakeJob(staleJob)), { skipped: true });
    await notifyRecommendationReady(first.body.recommendationId);
    // Completed with no matching jobs.
    const empty = await generate({ guest }, { profile: { skills: ['Underwater Basket Weaving'], currentRole: 'Zookeeper' } });
    assert.equal((await Recommendation.findById(empty.recommendationId)).items.length, 0);
    assert.equal(sent.length, 0);
  });

  test('the key file is found by name in the given folders; missing, broken or duplicate keys disable sending', () => {
    const empty = mkdtempSync(join(tmpdir(), 'push-empty-'));
    assert.equal(pushSenderFromKeyFile([empty]).sender, null);
    assert.match(pushSenderFromKeyFile([empty]).reason, /no \*-firebase-adminsdk-\*\.json key file/);

    const broken = mkdtempSync(join(tmpdir(), 'push-broken-'));
    writeFileSync(join(broken, 'demo-firebase-adminsdk-abc12-0123456789.json'), '{"type":"service_account"}');
    assert.match(pushSenderFromKeyFile([broken]).reason, /not a complete service-account key/);
    writeFileSync(join(broken, 'other.json'), '{}'); // other JSON files are ignored
    assert.equal(findServiceAccountFile([broken]).file, join(broken, 'demo-firebase-adminsdk-abc12-0123456789.json'));

    const fake = { type: 'service_account', project_id: 'demo-project', private_key: 'not-a-real-key', client_email: 'x@demo-project.iam.gserviceaccount.com' };
    const ok = mkdtempSync(join(tmpdir(), 'push-ok-'));
    writeFileSync(join(ok, 'demo-project-firebase-adminsdk-x1-abcdef.json'), JSON.stringify(fake));
    const result = pushSenderFromKeyFile([ok]);
    assert.equal(typeof result.sender, 'function');
    assert.equal(result.projectId, 'demo-project', 'project id comes from the key file');
    writeFileSync(join(ok, 'second-firebase-adminsdk-x2-abcdef.json'), JSON.stringify(fake));
    assert.match(pushSenderFromKeyFile([ok]).reason, /2 Firebase key files found/);
  });

  test('without Firebase credentials sending is disabled and nothing is claimed', async () => {
    restore.push(setPushSender(null));
    const guest = randomUUID();
    await registerDevice({ guest }, fcmToken());
    const { recommendationId, result } = await generate({ guest });
    assert.deepEqual(result, { completed: true });
    assert.equal((await Recommendation.findById(recommendationId)).notification, null);
  });
});
