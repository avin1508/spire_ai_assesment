import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRedisTarget, getRedisUrl } from '../src/config/env.js';
import { getRedisState } from '../src/config/redis.js';

test('REDIS_URL is optional; blank counts as not set', () => {
  const saved = process.env.REDIS_URL;
  try {
    delete process.env.REDIS_URL;
    assert.equal(getRedisUrl(), null);
    assert.equal(getRedisState(), 'not_configured');
    process.env.REDIS_URL = '   ';
    assert.equal(getRedisUrl(), null);
    process.env.REDIS_URL = ' redis://redis:6379 ';
    assert.equal(getRedisUrl(), 'redis://redis:6379');
    assert.equal(getRedisState(), 'disconnected'); // configured, not connected yet
  } finally {
    if (saved === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = saved;
  }
});

test('Redis log text never includes credentials', () => {
  assert.equal(describeRedisTarget('redis://redis:6379'), 'redis://redis:6379');
  assert.equal(describeRedisTarget('redis://localhost'), 'redis://localhost:6379');
  assert.equal(describeRedisTarget('rediss://user:s3cr%40t@cache.example.com:6380/2'), 'rediss://cache.example.com:6380/2');
  assert.equal(describeRedisTarget('not a url'), 'invalid REDIS_URL');
});
