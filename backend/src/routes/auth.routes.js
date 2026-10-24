import { Router } from 'express';
import { login, publicUser, register, revokeSession } from '../services/auth.service.js';
import { linkGuestToUser } from '../services/guestLink.service.js';
import { requireDatabase, requireGuestProof, requireUser } from '../middleware/owner.js';
import { rateLimit } from '../middleware/rateLimit.js';

// Email/password authentication.
//
//   POST /api/auth/register    { name, email, password } → 201 { user, token, expiresAt }
//   POST /api/auth/login       { email, password }       → 200 { user, token, expiresAt }
//   POST /api/auth/logout      (Bearer)                  → 204, the session is revoked
//   GET  /api/auth/me          (Bearer)                  → { user }
//   POST /api/auth/link-guest  (Bearer + X-Guest-Session) → { status, profile, resume, recommendations }
//
// Passwords and tokens are never logged.
const router = Router();

const MINUTE = 60000;
const emailKey = (req) => `${req.ip}:${String(req.body?.email ?? '').trim().toLowerCase()}`;

router.use(requireDatabase);

router.post(
  '/register',
  rateLimit({ name: 'register', limit: 20, windowMs: 60 * MINUTE }),
  async (req, res) => {
    res.status(201).json(await register(req.body));
  }
);

router.post(
  '/login',
  rateLimit({ name: 'login-ip', limit: 100, windowMs: 15 * MINUTE }),
  rateLimit({ name: 'login', limit: 10, windowMs: 15 * MINUTE, key: emailKey }),
  async (req, res) => {
    res.json(await login(req.body));
  }
);

router.post('/logout', requireUser, async (req, res) => {
  await revokeSession(req.auth.session._id);
  res.status(204).end();
});

router.get('/me', requireUser, (req, res) => {
  res.json({ user: publicUser(req.auth.user) });
});

// The user id comes only from the verified session; a body is ignored.
router.post('/link-guest', requireUser, requireGuestProof, async (req, res) => {
  res.json(await linkGuestToUser({ guestKey: req.guest.key, userId: req.auth.user._id }));
});

export default router;
