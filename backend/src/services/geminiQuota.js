// Shared Gemini quota guard for every worker process (resume parsing and
// recommendations use the same Google project quota).
//
// - Optional request / token / daily limits from the environment
//   (GEMINI_RPM, GEMINI_TPM, GEMINI_DAILY_BUDGET). Google publishes no fixed
//   numbers for our model, so nothing is assumed: an unset limit is simply
//   not enforced here, and real 429 responses are handled below.
// - A circuit breaker: repeated 429 / 5xx responses stop all Gemini calls for
//   a cooldown (doubling up to a maximum), honouring a retry delay when the
//   error carries one. A daily-quota error (or 429s that keep coming back)
//   stops calls until the next midnight Pacific time, when Gemini's daily
//   quota resets.
// State lives in Redis so all workers share it; tests use the memory store.

const PT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const HOUR = 3600000;

export const pacificDate = (time) => PT.format(new Date(time));

// Next midnight in Pacific time (whole-hour UTC offsets, so stepping by hour
// lands exactly on it).
export function nextPacificMidnight(now = Date.now()) {
  const today = pacificDate(now);
  let time = Math.floor(now / HOUR) * HOUR + HOUR;
  while (pacificDate(time) === today) time += HOUR;
  return time;
}

const positiveInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export function quotaConfigFromEnv(env = process.env) {
  return {
    rpm: positiveInt(env.GEMINI_RPM),
    tpm: positiveInt(env.GEMINI_TPM),
    dailyBudget: positiveInt(env.GEMINI_DAILY_BUDGET),
    breakerThreshold: positiveInt(env.GEMINI_BREAKER_THRESHOLD) ?? 3,
    breakerBaseMs: positiveInt(env.GEMINI_BREAKER_BASE_MS) ?? 60000,
    breakerMaxMs: positiveInt(env.GEMINI_BREAKER_MAX_MS) ?? 15 * 60000,
    // This many 429s in a row (without a success) are treated as the daily
    // quota being used up.
    dailyAfter429s: positiveInt(env.GEMINI_DAILY_AFTER_429S) ?? 8,
  };
}

// --- stores --------------------------------------------------------------------------

export function createMemoryQuotaStore() {
  const values = new Map(); // key → { value, expiresAt }
  const live = (key, now) => {
    const entry = values.get(key);
    if (entry && entry.expiresAt > now) return entry;
    values.delete(key);
    return null;
  };
  return {
    async incrBy(key, amount, ttlMs, now = Date.now()) {
      const entry = live(key, now) ?? { value: 0, expiresAt: now + ttlMs };
      entry.value += amount;
      values.set(key, entry);
      return entry.value;
    },
    async get(key, now = Date.now()) {
      return live(key, now)?.value ?? 0;
    },
    async set(key, value, ttlMs, now = Date.now()) {
      values.set(key, { value, expiresAt: now + ttlMs });
    },
    async del(key) {
      values.delete(key);
    },
  };
}

// `redis` is an ioredis client (queue/resumeQueue.js createRedisClient).
export function createRedisQuotaStore(redis, prefix = 'gemini:quota:') {
  return {
    async incrBy(key, amount, ttlMs) {
      const [[, value]] = await redis.multi().incrby(prefix + key, amount).pexpire(prefix + key, ttlMs, 'NX').exec();
      return Number(value);
    },
    async get(key) {
      return Number((await redis.get(prefix + key)) ?? 0);
    },
    async set(key, value, ttlMs) {
      await redis.set(prefix + key, String(value), 'PX', Math.max(1, ttlMs));
    },
    async del(key) {
      await redis.del(prefix + key);
    },
  };
}

// --- error details ------------------------------------------------------------------

const errorText = (error) => {
  try {
    return `${error?.message ?? ''} ${JSON.stringify(error ?? {})}`;
  } catch {
    return String(error?.message ?? '');
  }
};

// Retry delay carried by a 429 (RetryInfo "retryDelay": "37s", "retry in 37s"
// or a Retry-After header), in ms; null if none.
export function retryHintMs(error) {
  const text = errorText(error);
  const match =
    text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) ??
    text.match(/retry (?:in|after) (\d+(?:\.\d+)?)\s*s/i) ??
    text.match(/retry-after"?\s*[:=]\s*"?(\d+)/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

export const isDailyQuotaError = (error) => /PerDay|per[ _-]?day|daily/i.test(errorText(error));

// --- guard --------------------------------------------------------------------------

export function createQuotaGuard({ store, config = quotaConfigFromEnv(), now = () => Date.now() }) {
  const keys = {
    openUntil: 'breaker:open-until',
    failures: 'breaker:failures',
    consecutive429: 'breaker:429s',
  };

  return {
    config,

    // Reserve one call (estimated tokens). → { ok: true } or
    // { ok: false, reason: 'circuit_open' | 'daily_budget' | 'rpm' | 'tpm', retryAt }
    async acquire(estimatedTokens = 0) {
      const time = now();
      const openUntil = await store.get(keys.openUntil, time);
      if (openUntil > time) return { ok: false, reason: 'circuit_open', retryAt: openUntil };

      const day = `rpd:${pacificDate(time)}`;
      if (config.dailyBudget && (await store.get(day, time)) >= config.dailyBudget) {
        return { ok: false, reason: 'daily_budget', retryAt: nextPacificMidnight(time) };
      }
      const minute = Math.floor(time / 60000);
      const minuteEnd = (minute + 1) * 60000;
      if (config.rpm) {
        const used = await store.incrBy(`rpm:${minute}`, 1, 120000, time);
        if (used > config.rpm) {
          await store.incrBy(`rpm:${minute}`, -1, 120000, time);
          return { ok: false, reason: 'rpm', retryAt: minuteEnd };
        }
      }
      if (config.tpm && estimatedTokens > 0) {
        const used = await store.incrBy(`tpm:${minute}`, estimatedTokens, 120000, time);
        if (used > config.tpm) {
          await store.incrBy(`tpm:${minute}`, -estimatedTokens, 120000, time);
          if (config.rpm) await store.incrBy(`rpm:${minute}`, -1, 120000, time);
          return { ok: false, reason: 'tpm', retryAt: minuteEnd };
        }
      }
      if (config.dailyBudget) await store.incrBy(day, 1, 26 * HOUR, time);
      return { ok: true };
    },

    async recordSuccess() {
      await Promise.all([store.del(keys.failures), store.del(keys.consecutive429)]);
    },

    // After a 429 / 5xx / timeout. Opens the circuit when warranted and
    // returns { openUntil, daily } (openUntil null if still closed).
    async recordFailure(error, { rateLimited = false } = {}) {
      const time = now();
      const failures = await store.incrBy(keys.failures, 1, HOUR, time);
      const count429 = rateLimited ? await store.incrBy(keys.consecutive429, 1, 26 * HOUR, time) : 0;
      const daily = rateLimited && (isDailyQuotaError(error) || count429 >= config.dailyAfter429s);

      const backoff = (count) => Math.min(config.breakerBaseMs * 2 ** Math.max(0, count - 1), config.breakerMaxMs);
      let openUntil = null;
      if (daily) {
        // Daily quota: nothing can succeed before the reset (+ up to 5 min jitter).
        openUntil = nextPacificMidnight(time) + Math.floor(Math.random() * 5 * 60000);
      } else if (rateLimited) {
        // Per-minute style limit: the server's retry hint, else a doubling cooldown.
        openUntil = time + Math.max(retryHintMs(error) ?? 0, backoff(count429));
      } else if (failures >= config.breakerThreshold) {
        // Repeated 5xx / timeouts.
        openUntil = time + backoff(failures - config.breakerThreshold + 1);
      }
      if (openUntil) {
        const current = await store.get(keys.openUntil, time);
        if (openUntil > current) await store.set(keys.openUntil, openUntil, openUntil - time + 1000, time);
      }
      return { openUntil, daily };
    },
  };
}

// Rough token estimate for TPM accounting (about 4 characters per token).
export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 4);
