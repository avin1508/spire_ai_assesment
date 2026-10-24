import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createLatestRequest, isAbortError } from '../utils/latestRequest';
import { initialRemoteData, remoteDataReducer } from '../utils/remoteData';

// Loads `fetcher(input, { signal })` whenever `key` changes (after `debounceMs`),
// keeping only the latest request: older requests are aborted and their late
// responses ignored. Previous data stays available while a new request runs.
// Returns { data, dataKey, hasData, loading, error, retry }.
export default function useRemoteData(fetcher, input, key, { enabled = true, debounceMs = 0 } = {}) {
  const [state, dispatch] = useReducer(remoteDataReducer, initialRemoteData);
  const latest = useRef(null);
  if (latest.current === null) latest.current = createLatestRequest();
  const [retryCount, setRetryCount] = useState(0);

  // Latest input/fetcher without re-running the effect when only their identity changes.
  const inputRef = useRef(input);
  inputRef.current = input;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled || key === null) return undefined;
    let timer = null;
    const run = () => {
      const request = latest.current.start();
      dispatch({ type: 'request', id: request.id, key });
      fetcherRef.current(inputRef.current, { signal: request.signal })
        .then((data) => {
          if (request.isLatest()) dispatch({ type: 'success', id: request.id, data });
        })
        .catch((error) => {
          if (isAbortError(error)) return;
          if (request.isLatest()) dispatch({ type: 'failure', id: request.id, error });
        });
    };
    if (debounceMs > 0) timer = setTimeout(run, debounceMs);
    else run();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [key, enabled, debounceMs, retryCount]);

  // Abort anything in flight when the component unmounts.
  useEffect(() => () => latest.current.cancel(), []);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  return { ...state, retry };
}
