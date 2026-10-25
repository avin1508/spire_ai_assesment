// Queue diagnostics hints (/health/queues): plain-language causes for jobs
// that aren't processed. Pure; no Redis needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueHints } from '../src/queue/queueDiagnostics.js';

const counts = { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };

test('waiting jobs with no connected worker point at the missing worker', () => {
  const hints = queueHints({ queues: { 'resume-parse': { ...counts, workers: 0, waiting: 2 } } });
  assert.equal(hints.length, 1);
  assert.match(hints[0], /2 job\(s\) waiting but no worker is connected/);
});

test('an unreachable Redis and an idle queue without workers are reported', () => {
  const hints = queueHints({ queues: { a: { error: 'Redis did not respond' }, b: { ...counts, workers: 0 } } });
  assert.match(hints[0], /Redis unreachable from the API/);
  assert.match(hints[1], /no worker connected/);
});

test('a healthy queue has no hints', () => {
  assert.deepEqual(queueHints({ queues: { a: { ...counts, workers: 1, waiting: 3 } } }), []);
});
