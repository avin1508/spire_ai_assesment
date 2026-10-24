import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';
import { PushDevice } from '../models/pushDevice.model.js';
import { Recommendation } from '../models/recommendation.model.js';
import { ValidationError } from '../utils/httpErrors.js';

// Push notifications through Firebase Cloud Messaging (HTTP v1).
//
// Devices: the app registers its FCM registration token for its current
//   owner (guest session or signed-in user). A token belongs to one owner at
//   a time; registering it again for another owner moves it.
// Sending: notifyRecommendationReady() runs after the worker has saved a
//   completed recommendation. It claims the run's `notification` field
//   atomically first, so retries or repeated completions can't notify twice
//   (at most once). Delivery problems are recorded and logged — they never
//   change the recommendation itself. Tokens FCM reports as unregistered are
//   removed. Tokens and credentials are never logged.
// Credentials: the Firebase service-account key file (…-firebase-adminsdk-….json)
//   in the backend directory or the project root — never committed (see
//   .gitignore) and never logged. The project id is the key's project_id.
//   Without exactly one such file, sending is disabled and the reason logged.

const MAX_TOKEN_LENGTH = 4096;
export const ANDROID_CHANNEL_ID = 'recommendations';

// --- devices -------------------------------------------------------------------------

function validateDevice(body) {
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const platform = body?.platform ?? 'android';
  const details = [];
  if (!token || token.length > MAX_TOKEN_LENGTH || /\s/.test(token)) details.push({ param: 'token', message: 'A valid push token is required' });
  if (platform !== 'android') details.push({ param: 'platform', message: 'Only Android is supported' });
  if (details.length) throw new ValidationError(details);
  return { token, platform };
}

// A run that finished while the owner had no device yet (e.g. the
// permission prompt was still open) is still notified when a device
// registers within this window.
export const LATE_DEVICE_WINDOW_MS = 15 * 60000;

// PUT /api/devices: this device now belongs to `owner` (moved from any previous owner).
export async function registerDevice(owner, body, now = Date.now()) {
  const { token, platform } = validateDevice(body);
  await PushDevice.updateOne(
    { token },
    { $set: { platform, ownerType: owner.type, ownerKey: owner.key } },
    { upsert: true }
  );
  try {
    await notifyMissedRecommendation(owner, now);
  } catch (error) {
    console.warn(`[push] late notification failed: ${error?.message ?? error}`);
  }
  return { registered: true };
}

// The owner's latest run, if it completed recently without any device to notify.
async function notifyMissedRecommendation(owner, now) {
  if (!sender) return;
  const latest = await Recommendation.findOne({ ownerKey: owner.key, status: { $ne: 'superseded' } })
    .sort({ requestedAt: -1 })
    .select({ _id: 1, status: 1, notification: 1, completedAt: 1 });
  if (
    latest?.status === 'completed' &&
    latest.notification?.status === 'no_devices' &&
    latest.completedAt?.getTime() > now - LATE_DEVICE_WINDOW_MS
  ) {
    await notifyRecommendationReady(latest._id, { now: () => now, retryWithoutDevices: true });
  }
}

// DELETE /api/devices: removes the device only if it belongs to `owner`.
export async function unregisterDevice(owner, body) {
  const { token } = validateDevice(body);
  const result = await PushDevice.deleteOne({ token, ownerKey: owner.key });
  return { removed: result.deletedCount === 1 };
}

// --- sending -------------------------------------------------------------------------

// sender({ token, title, body, data }) → { ok: true } | { ok: false, invalidToken, code }
let sender = null;
export function setPushSender(next) {
  const previous = sender;
  sender = next ?? null;
  return () => {
    sender = previous;
  };
}

// FCM HTTP v1 sender authorised with the service account (OAuth access token,
// refreshed by google-auth-library).
export function createFcmSender({ projectId, credentialsFile, timeoutMs = 10000 }) {
  const auth = new GoogleAuth({ keyFile: credentialsFile, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

  return async function sendFcm({ token, title, body, data }) {
    const accessToken = await auth.getAccessToken();
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          android: { priority: 'HIGH', notification: { channel_id: ANDROID_CHANNEL_ID } },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return { ok: true };
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // no JSON body
    }
    const code = payload?.error?.details?.find((detail) => detail.errorCode)?.errorCode ?? payload?.error?.status ?? `http_${response.status}`;
    const invalidToken =
      code === 'UNREGISTERED' ||
      (code === 'INVALID_ARGUMENT' && /registration token/i.test(payload?.error?.message ?? ''));
    return { ok: false, invalidToken, code };
  };
}

// Where the key file is looked for, independent of the working directory:
// the backend directory (src/services → ../..), then the project root. In
// Docker the backend directory is /app, where the worker mounts the file.
const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const KEY_FILE_DIRS = [BACKEND_DIR, resolve(BACKEND_DIR, '..')];
const KEY_FILE = /^[\w.-]+-firebase-adminsdk-[\w-]+\.json$/;

// The one service-account key file in `dirs` → { file } or { reason }.
export function findServiceAccountFile(dirs = KEY_FILE_DIRS) {
  const found = new Set();
  for (const dir of dirs) {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    names.filter((name) => KEY_FILE.test(name)).forEach((name) => found.add(join(dir, name)));
  }
  if (found.size === 0) return { reason: `no *-firebase-adminsdk-*.json key file in ${dirs.join(' or ')}` };
  if (found.size > 1) return { reason: `${found.size} Firebase key files found; keep exactly one` };
  return { file: [...found][0] };
}

// Sender from the key file (project id from its project_id), or null with the reason.
export function pushSenderFromKeyFile(dirs = KEY_FILE_DIRS) {
  const { file, reason } = findServiceAccountFile(dirs);
  if (!file) return { sender: null, reason };
  let account;
  try {
    account = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { sender: null, reason: `the key file ${file} could not be read` };
  }
  if (account?.type !== 'service_account' || !account.project_id || !account.private_key || !account.client_email) {
    return { sender: null, reason: `${file} is not a complete service-account key` };
  }
  return { sender: createFcmSender({ projectId: account.project_id, credentialsFile: file }), projectId: account.project_id, file };
}

export function readyMessage(count) {
  return {
    title: 'Your job recommendations are ready!',
    body: `We've found ${count} ${count === 1 ? 'job' : 'jobs'} matching your profile. Tap to explore them.`,
  };
}

// After a run was saved as completed. → { sent, devices } or { skipped: reason }.
// Never throws for delivery problems.
// retryWithoutDevices: also claim a run that earlier found no device.
export async function notifyRecommendationReady(recommendationId, { now = () => Date.now(), retryWithoutDevices = false } = {}) {
  if (!sender) return { skipped: 'disabled' };
  // Claim: only a completed (not superseded / failed) run with results, once.
  const unclaimed = retryWithoutDevices ? { 'notification.status': 'no_devices' } : { notification: null };
  const doc = await Recommendation.findOneAndUpdate(
    { _id: recommendationId, status: 'completed', ...unclaimed, 'items.0': { $exists: true } },
    { $set: { notification: { status: 'sending', at: new Date(now()), sent: 0 } } },
    { returnDocument: 'after' }
  );
  if (!doc) return { skipped: 'not_eligible' };

  const devices = await PushDevice.find({ ownerKey: doc.ownerKey });
  if (!devices.length) {
    await Recommendation.updateOne({ _id: doc._id }, { $set: { 'notification.status': 'no_devices' } });
    return { sent: 0, devices: 0 };
  }

  const count = doc.items.length;
  const message = {
    ...readyMessage(count),
    data: { type: 'recommendations_ready', recommendationId: String(doc._id), count: String(count) },
  };
  let sent = 0;
  for (const device of devices) {
    let result;
    try {
      result = await sender({ token: device.token, ...message });
    } catch (error) {
      result = { ok: false, invalidToken: false, code: error?.name === 'TimeoutError' ? 'timeout' : 'send_error' };
    }
    if (result.ok) sent += 1;
    else if (result.invalidToken) await PushDevice.deleteOne({ _id: device._id, token: device.token });
    else console.warn(`[push] recommendation ${doc._id}: delivery failed (${result.code})`);
  }
  await Recommendation.updateOne(
    { _id: doc._id },
    { $set: { 'notification.status': sent ? 'sent' : 'failed', 'notification.sent': sent } }
  );
  return { sent, devices: devices.length };
}
