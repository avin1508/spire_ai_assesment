import { createClient } from 'redis';
import { describeRedisTarget, getRedisUrl } from './env.js';

// Retries allowed while the server is starting; after the first successful
// connection the client keeps reconnecting with a capped backoff.
const STARTUP_RETRIES = 5;

let client = null;

// Error text without credentials from the Redis URL. A refused connection to
// "localhost" can be an AggregateError (IPv4 + IPv6) with an empty message.
const safeMessage = (error) => {
  const text =
    error?.message ||
    error?.errors?.map((inner) => inner.message || inner.code).join('; ') ||
    error?.code ||
    String(error);
  return text.replace(/(rediss?:\/\/)[^@\s]+@/g, '$1<redacted>@');
};

// Connects to Redis at REDIS_URL and verifies it with a PING. Returns null
// (Redis is optional) when REDIS_URL isn't set. Throws a credential-free error
// if Redis can't be reached during startup.
export async function connectRedis() {
  const url = getRedisUrl();
  if (!url) {
    console.log('Redis not configured (REDIS_URL is not set)');
    return null;
  }

  let everReady = false;
  client = createClient({
    url,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) =>
        !everReady && retries >= STARTUP_RETRIES
          ? new Error(`gave up after ${retries} attempts`)
          : Math.min(retries * 200, 5000),
    },
  });
  client.on('error', (error) => console.error(`Redis error: ${safeMessage(error)}`));
  client.on('reconnecting', () => everReady && console.warn('Redis reconnecting'));
  client.on('ready', () => {
    if (everReady) console.log('Redis reconnected');
    everReady = true;
  });

  console.log(`Connecting to Redis (${describeRedisTarget(url)})…`);
  try {
    await client.connect();
    await client.ping();
  } catch (error) {
    client.destroy();
    client = null;
    throw new Error(`Redis connection failed: ${safeMessage(error)}`);
  }
  console.log('Redis connected');
  return client;
}

export async function disconnectRedis() {
  if (client?.isOpen) await client.close();
  client = null;
}

export function getRedisState() {
  if (!client) return getRedisUrl() ? 'disconnected' : 'not_configured';
  if (client.isReady) return 'connected';
  return client.isOpen ? 'connecting' : 'disconnected';
}
