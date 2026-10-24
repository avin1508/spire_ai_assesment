import { useCallback, useEffect, useReducer, useRef } from 'react';
import { fetchJobs } from '../services/jobsService';
import { createLatestRequest, isAbortError } from '../utils/latestRequest';
import { initialJobPages, jobPagesReducer, listView, nextPageToLoad } from '../utils/jobPages';
import { paramsKey } from '../utils/jobQueryParams';

const PAGE_SIZE = 20;

// Infinite-scroll All Jobs list for `params` (filters, sort, location, area).
// A change of params starts again from page 1; responses for old params are
// ignored. Returns { items, total, hasMore, loadMore, retry, ...listView }.
export default function useJobList(params, { enabled = true } = {}) {
  const key = enabled ? paramsKey(params) : null;
  const [state, dispatch] = useReducer(jobPagesReducer, initialJobPages);
  const latest = useRef(null);
  if (latest.current === null) latest.current = createLatestRequest();
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback((page, forKey) => {
    const request = latest.current.start();
    dispatch({ type: 'loadStart', key: forKey, page });
    fetchJobs({ ...paramsRef.current, page, limit: PAGE_SIZE }, { signal: request.signal })
      .then((response) => dispatch({ type: 'loadSuccess', key: forKey, page, response }))
      .catch((error) => {
        if (isAbortError(error)) return;
        dispatch({ type: 'loadFailure', key: forKey, page, error });
      });
  }, []);

  // New params: reset and load page 1 (aborting any page in flight).
  useEffect(() => {
    if (key === null) return;
    dispatch({ type: 'reset', key });
    load(1, key);
  }, [key, load]);

  useEffect(() => () => latest.current.cancel(), []);

  // Called by FlatList's onEndReached; ignored while a page is loading,
  // after an error (until retry) or when there are no more pages.
  const loadMore = useCallback(() => {
    const current = stateRef.current;
    const page = nextPageToLoad(current);
    if (page !== null) load(page, current.key);
  }, [load]);

  const retry = useCallback(() => {
    const current = stateRef.current;
    if (current.key !== null) load(current.errorPage ?? current.page + 1, current.key);
  }, [load]);

  return {
    items: state.items,
    total: state.total,
    hasMore: state.hasMore,
    error: state.error,
    loadMore,
    retry,
    ...listView(state),
  };
}
