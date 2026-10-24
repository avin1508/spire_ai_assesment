import { HttpError } from '../utils/httpErrors.js';

// Fixed-window rate limiting for the authentication endpoints, kept in
// memory. That is enough for the single API process this project runs; with
// several API instances each would count separately (a shared Redis counter
// would be needed then).
//
// rateLimit({ name, limit, windowMs, key(req) }) → middleware. A request
// over the limit gets 429 too_many_attempts with Retry-After (seconds).

const windows = new Map(); // `${name}:${key}` → { count, resetAt }

export function rateLimit({ name, limit, windowMs, key = (req) => req.ip }) {
  return (req, res, next) => {
    const now = Date.now();
    const id = `${name}:${key(req)}`;
    let entry = windows.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(id, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new HttpError(429, 'too_many_attempts', 'Too many attempts. Please wait a few minutes and try again.');
    }
    next();
  };
}

// Drops expired windows (called periodically) — and, in tests, everything.
export function pruneRateLimits(all = false, now = Date.now()) {
  for (const [id, entry] of windows) if (all || entry.resetAt <= now) windows.delete(id);
}

setInterval(() => pruneRateLimits(), 10 * 60000).unref();
