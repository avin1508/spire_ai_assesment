import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.model.js';
import { Session } from '../models/session.model.js';
import { HttpError, ValidationError } from '../utils/httpErrors.js';

// Email/password accounts and server-side sessions.
//
// Passwords: bcrypt (bcryptjs), cost BCRYPT_ROUNDS (default 12). Only the
//   hash is stored; bcrypt uses at most 72 bytes, so longer passwords are
//   rejected rather than silently truncated.
// Sessions: a random 256-bit token is returned to the app once; the database
//   stores only its SHA-256 hash. A session is valid until it expires
//   (SESSION_TTL_DAYS, default 30) or is revoked by logout.
// Login failures never say whether the email exists.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72;

const rounds = () => Number(process.env.BCRYPT_ROUNDS) || 12;
const sessionTtlMs = () => (Number(process.env.SESSION_TTL_DAYS) || 30) * 24 * 3600000;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const userOwnerKey = (userId) => `user:${String(userId)}`;

// Compared against when the email is unknown, so both failures take as long.
let dummyHash = null;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('not-a-real-password', rounds()));

export const publicUser = (user) => ({ id: String(user._id), name: user.name, email: user.email });

const normEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

function checkEmail(email, details) {
  if (!email) details.push({ param: 'email', message: 'Email is required' });
  else if (email.length > 254 || !EMAIL.test(email)) details.push({ param: 'email', message: 'Enter a valid email address' });
}

function checkPassword(password, details) {
  if (typeof password !== 'string' || !password) {
    details.push({ param: 'password', message: 'Password is required' });
  } else if (password.length < MIN_PASSWORD) {
    details.push({ param: 'password', message: `Password must be at least ${MIN_PASSWORD} characters` });
  } else if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    details.push({ param: 'password', message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes` });
  }
}

export function validateRegistration(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = normEmail(body?.email);
  const details = [];
  if (!name) details.push({ param: 'name', message: 'Name is required' });
  else if (name.length > 80) details.push({ param: 'name', message: 'Name must be at most 80 characters' });
  checkEmail(email, details);
  checkPassword(body?.password, details);
  if (details.length) throw new ValidationError(details);
  return { name, email, password: body.password };
}

export function validateLogin(body) {
  const email = normEmail(body?.email);
  const details = [];
  checkEmail(email, details);
  if (typeof body?.password !== 'string' || !body.password) details.push({ param: 'password', message: 'Password is required' });
  if (details.length) throw new ValidationError(details);
  return { email, password: body.password };
}

export async function createSession(userId, now = Date.now()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + sessionTtlMs());
  await Session.create({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt: expiresAt.toISOString() };
}

const sessionResponse = (user, session) => ({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });

export async function register(body) {
  const { name, email, password } = validateRegistration(body);
  const passwordHash = await bcrypt.hash(password, rounds());
  let user;
  try {
    user = await User.create({ name, email, passwordHash });
  } catch (error) {
    if (error?.code === 11000) {
      throw new HttpError(409, 'email_taken', 'An account with this email already exists. Log in instead.');
    }
    throw error;
  }
  return sessionResponse(user, await createSession(user._id));
}

export async function login(body) {
  const { email, password } = validateLogin(body);
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = user
    ? Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES && (await bcrypt.compare(password, user.passwordHash))
    : (await bcrypt.compare(password, await getDummyHash()), false);
  if (!valid) throw new HttpError(401, 'invalid_credentials', 'Incorrect email or password.');
  return sessionResponse(user, await createSession(user._id));
}

const invalidSession = () => new HttpError(401, 'session_invalid', 'Your session has ended. Please log in again.');

// Bearer token → { session, user }. Unknown, expired or revoked → 401.
export async function resolveSession(token, now = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw invalidSession();
  const session = await Session.findOne({ tokenHash: hashToken(token) });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now) throw invalidSession();
  const user = await User.findById(session.userId);
  if (!user) throw invalidSession();
  return { session, user };
}

// Idempotent: revoking an already revoked session changes nothing.
export async function revokeSession(sessionId, now = new Date()) {
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: now } });
}
