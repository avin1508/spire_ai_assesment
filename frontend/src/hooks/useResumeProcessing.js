import { useCallback, useEffect, useReducer, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { getResumeJob, retryResumeJob, submitResume } from '../services/resumeService';
import { initialProcessing, nextPollDelay, processingReducer } from '../utils/resumeProcessing';

// After this long without a result, the screen offers Retry (polling stops).
const PROCESSING_TIMEOUT_MS = 3 * 60000;
const POLL_RETRY_DELAY_MS = 2000;
const MAX_POLL_ERRORS = 4;

const UPLOAD_REJECTED = new Set([400, 401, 413, 415]);

// Uploads `file`, then polls the processing job until it completes or fails.
// Everything stops when the screen unmounts: requests are aborted, timers
// cleared and late responses ignored, so leaving the screen can't trigger a
// redirect later. Retry reuses the same upload (same idempotency key / job),
// so it never creates a duplicate job.
// → { state, retry }   (state: see utils/resumeProcessing.js)
export default function useResumeProcessing(file) {
  const [state, dispatch] = useReducer(processingReducer, initialProcessing);
  const idempotencyKey = useRef(null);
  if (idempotencyKey.current === null) idempotencyKey.current = Crypto.randomUUID();

  const alive = useRef(true);
  const jobId = useRef(null);
  const timer = useRef(null);
  const controller = useRef(null);
  const pollCount = useRef(0);
  const pollErrors = useRef(0);
  const startedAt = useRef(Date.now());
  const pollRef = useRef(null);

  const stopActivity = () => {
    clearTimeout(timer.current);
    controller.current?.abort();
  };
  const newSignal = () => {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  };
  const schedulePoll = (delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => pollRef.current(), delay);
  };

  const handleJob = useCallback((job) => {
    if (!alive.current || !job) return;
    if (jobId.current && job.jobId !== jobId.current) return; // a different (older) job
    jobId.current = job.jobId;
    pollErrors.current = 0;
    dispatch({ type: 'status', job });
    if (job.status === 'queued' || job.status === 'processing') {
      if (Date.now() - startedAt.current > PROCESSING_TIMEOUT_MS) dispatch({ type: 'timedOut' });
      else schedulePoll(nextPollDelay(job.pollAfterMs, pollCount.current++));
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      handleJob(await getResumeJob(jobId.current, { signal: newSignal() }));
    } catch (error) {
      if (error?.name === 'AbortError' || !alive.current) return;
      if (error?.status === 404) {
        dispatch({
          type: 'uploadFailed',
          error: { code: 'not_found', message: 'This upload is no longer available. Please upload your resume again.', retryable: false },
        });
        return;
      }
      pollErrors.current += 1;
      dispatch({ type: 'pollFailed', error: { code: error?.code ?? 'network', message: error?.message, retryable: true } });
      if (pollErrors.current < MAX_POLL_ERRORS) schedulePoll(POLL_RETRY_DELAY_MS);
    }
  }, [handleJob]);
  pollRef.current = poll;

  const submit = useCallback(async () => {
    startedAt.current = Date.now();
    try {
      const job = await submitResume(file, { idempotencyKey: idempotencyKey.current, signal: newSignal() });
      handleJob(job);
    } catch (error) {
      if (error?.name === 'AbortError' || !alive.current) return;
      dispatch({
        type: 'uploadFailed',
        error: {
          code: error?.code ?? 'upload_failed',
          message: error?.message ?? "Couldn't upload your resume.",
          retryable: !UPLOAD_REJECTED.has(error?.status),
        },
      });
    }
  }, [file, handleJob]);

  const retry = useCallback(async () => {
    stopActivity();
    dispatch({ type: 'retryStarted' });
    pollCount.current = 0;
    pollErrors.current = 0;
    startedAt.current = Date.now();
    if (!jobId.current) {
      submit(); // the upload never got a job id: send it again (same idempotency key)
      return;
    }
    try {
      // Re-queues a failed job; for a job that is still running (e.g. after a
      // timeout or lost connection) it just returns the current status.
      handleJob(await retryResumeJob(jobId.current, { signal: newSignal() }));
    } catch (error) {
      if (error?.name === 'AbortError' || !alive.current) return;
      dispatch({
        type: 'uploadFailed',
        error: { code: error?.code ?? 'retry_failed', message: error?.message, retryable: error?.status !== 409 },
      });
    }
  }, [submit, handleJob]);

  useEffect(() => {
    alive.current = true;
    submit();
    return () => {
      alive.current = false;
      stopActivity();
    };
  }, [submit]);

  return { state, retry };
}
