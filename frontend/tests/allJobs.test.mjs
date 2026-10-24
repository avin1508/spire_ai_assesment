// All Jobs API integration: loading/shimmer rules, stale-response handling,
// infinite-scroll paging and query parameters. These modules hold the logic
// the screen's hooks run, so the rules are tested without rendering React.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initialRemoteData, loadingView, remoteDataReducer } from '../src/utils/remoteData.js';
import { initialJobPages, jobPagesReducer, listView, nextPageToLoad } from '../src/utils/jobPages.js';
import { createLatestRequest, isAbortError } from '../src/utils/latestRequest.js';
import { bboxParam, buildFilterParams, paramsKey, toQueryString } from '../src/utils/jobQueryParams.js';

const reduce = (reducer, state, ...actions) => actions.reduce(reducer, state);
const clusters = (count) => ({ mode: 'clusters', total: count, clusters: [], points: [] });

// --- map loading (shimmer) ---------------------------------------------------------

describe('map loading states', () => {
  test('initial load: reference skeleton + loading pill until the first response', () => {
    // Before the map reports its viewport, nothing is requested yet.
    assert.deepEqual(loadingView(initialRemoteData, null), {
      loadingIndicator: false,
      initialSkeleton: true,
      errorRetry: false,
    });
    // Viewport known, request debounced/running: skeleton + indicator.
    const requesting = remoteDataReducer(initialRemoteData, { type: 'request', id: 1, key: 'v1' });
    assert.deepEqual(loadingView(initialRemoteData, 'v1'), { loadingIndicator: true, initialSkeleton: true, errorRetry: false });
    assert.deepEqual(loadingView(requesting, 'v1'), { loadingIndicator: true, initialSkeleton: true, errorRetry: false });
  });

  test('a successful response removes the shimmer and shows the data', () => {
    const state = reduce(
      remoteDataReducer,
      initialRemoteData,
      { type: 'request', id: 1, key: 'v1' },
      { type: 'success', id: 1, data: clusters(500) }
    );
    assert.deepEqual(loadingView(state, 'v1'), { loadingIndicator: false, initialSkeleton: false, errorRetry: false });
    assert.equal(state.data.total, 500);
    assert.equal(state.dataKey, 'v1');
  });

  test('viewport change: loading pill shows immediately, existing markers stay visible', () => {
    const loaded = reduce(
      remoteDataReducer,
      initialRemoteData,
      { type: 'request', id: 1, key: 'v1' },
      { type: 'success', id: 1, data: clusters(500) }
    );
    // New viewport key, request still debounced: indicator on, no full skeleton.
    assert.deepEqual(loadingView(loaded, 'v2'), { loadingIndicator: true, initialSkeleton: false, errorRetry: false });
    const requesting = remoteDataReducer(loaded, { type: 'request', id: 2, key: 'v2' });
    assert.equal(requesting.data.total, 500, 'previous markers are kept during the request');
    assert.equal(loadingView(requesting, 'v2').loadingIndicator, true);
  });

  test('a failed request stops the shimmer and offers retry (initial and later)', () => {
    const initialFail = reduce(
      remoteDataReducer,
      initialRemoteData,
      { type: 'request', id: 1, key: 'v1' },
      { type: 'failure', id: 1, error: new Error('offline') }
    );
    assert.deepEqual(loadingView(initialFail, 'v1'), { loadingIndicator: false, initialSkeleton: false, errorRetry: true });

    const laterFail = reduce(
      remoteDataReducer,
      initialRemoteData,
      { type: 'request', id: 1, key: 'v1' },
      { type: 'success', id: 1, data: clusters(10) },
      { type: 'request', id: 2, key: 'v2' },
      { type: 'failure', id: 2, error: new Error('timeout') }
    );
    assert.deepEqual(loadingView(laterFail, 'v2'), { loadingIndicator: false, initialSkeleton: false, errorRetry: true });
    assert.equal(laterFail.data.total, 10, 'old markers stay after a failure');
    // Retrying clears the error and shows the indicator again.
    const retrying = remoteDataReducer(laterFail, { type: 'request', id: 3, key: 'v2' });
    assert.deepEqual(loadingView(retrying, 'v2'), { loadingIndicator: true, initialSkeleton: false, errorRetry: false });
  });

  test('a stale (older, slower) viewport response cannot overwrite newer data', () => {
    const state = reduce(
      remoteDataReducer,
      initialRemoteData,
      { type: 'request', id: 1, key: 'india' },
      { type: 'request', id: 2, key: 'bengaluru' },
      { type: 'success', id: 2, data: clusters(70) },
      { type: 'success', id: 1, data: clusters(500) }, // arrives late
      { type: 'failure', id: 1, error: new Error('late failure') }
    );
    assert.equal(state.data.total, 70);
    assert.equal(state.dataKey, 'bengaluru');
    assert.equal(state.error, null);
    assert.equal(state.loading, false);
  });
});

// --- latest-request guard (what the hooks use around fetch) ------------------------

describe('latest request guard', () => {
  test('starting a new request aborts the previous one and marks it stale', () => {
    const latest = createLatestRequest();
    const first = latest.start();
    const second = latest.start();
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isLatest(), false);
    assert.equal(second.signal.aborted, false);
    assert.equal(second.isLatest(), true);
    latest.cancel();
    assert.equal(second.signal.aborted, true);
    assert.equal(second.isLatest(), false);
  });

  test('out-of-order responses: only the newest is applied (simulated hook flow)', async () => {
    const latest = createLatestRequest();
    let state = initialRemoteData;
    const dispatch = (action) => { state = remoteDataReducer(state, action); };
    const run = (key, delay, data) => {
      const request = latest.start();
      dispatch({ type: 'request', id: request.id, key });
      return new Promise((resolve) => setTimeout(resolve, delay)).then(() => {
        if (request.isLatest()) dispatch({ type: 'success', id: request.id, data });
      });
    };
    await Promise.all([run('slow', 30, clusters(1)), run('fast', 5, clusters(2))]);
    assert.equal(state.data.total, 2);
    assert.equal(state.dataKey, 'fast');
  });

  test('aborted fetches are recognised and not shown as errors', () => {
    assert.equal(isAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' })), true);
    assert.equal(isAbortError(new Error('network')), false);
  });
});

// --- infinite scroll ---------------------------------------------------------------

const page = (ids, { total = 45, hasMore = true } = {}) => ({
  items: ids.map((id) => ({ id })),
  total,
  hasMore,
});
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `job-x-${from + i}`);

describe('infinite scroll', () => {
  test('first page: skeleton cards, then items; next-page shimmer only while loading more', () => {
    let state = reduce(jobPagesReducer, initialJobPages, { type: 'reset', key: 'k' }, { type: 'loadStart', key: 'k', page: 1 });
    assert.equal(listView(state).firstPageLoading, true);
    assert.equal(listView(state).nextPageLoading, false);

    state = jobPagesReducer(state, { type: 'loadSuccess', key: 'k', page: 1, response: page(ids(1, 20)) });
    assert.deepEqual([state.items.length, state.page, state.total, listView(state).firstPageLoading], [20, 1, 45, false]);
    assert.equal(listView(state).nextPageLoading, false);

    assert.equal(nextPageToLoad(state), 2);
    state = jobPagesReducer(state, { type: 'loadStart', key: 'k', page: 2 });
    assert.equal(listView(state).nextPageLoading, true, 'footer shimmer while page 2 loads');
    assert.equal(state.items.length, 20, 'existing cards are kept');
  });

  test('no duplicate requests while a page is loading, and none after the last page', () => {
    let state = reduce(
      jobPagesReducer,
      initialJobPages,
      { type: 'reset', key: 'k' },
      { type: 'loadStart', key: 'k', page: 1 }
    );
    assert.equal(nextPageToLoad(state), null, 'page 1 is still loading');
    state = reduce(
      jobPagesReducer,
      state,
      { type: 'loadSuccess', key: 'k', page: 1, response: page(ids(1, 20)) },
      { type: 'loadStart', key: 'k', page: 2 }
    );
    assert.equal(nextPageToLoad(state), null, 'rapid scrolling while page 2 loads');
    state = reduce(
      jobPagesReducer,
      state,
      { type: 'loadSuccess', key: 'k', page: 2, response: page(ids(21, 40)) },
      { type: 'loadStart', key: 'k', page: 3 },
      { type: 'loadSuccess', key: 'k', page: 3, response: page(ids(41, 45), { hasMore: false }) }
    );
    assert.equal(state.items.length, 45);
    assert.equal(state.hasMore, false);
    assert.equal(nextPageToLoad(state), null);
  });

  test('jobs already shown are never rendered twice', () => {
    const state = reduce(
      jobPagesReducer,
      initialJobPages,
      { type: 'reset', key: 'k' },
      { type: 'loadStart', key: 'k', page: 1 },
      { type: 'loadSuccess', key: 'k', page: 1, response: page(ids(1, 20)) },
      { type: 'loadStart', key: 'k', page: 2 },
      // Page 2 overlaps page 1 (e.g. a job was inserted meanwhile).
      { type: 'loadSuccess', key: 'k', page: 2, response: page(ids(18, 37)) }
    );
    const shown = state.items.map((item) => item.id);
    assert.equal(new Set(shown).size, shown.length);
    assert.equal(shown.length, 37);
  });

  test('a duplicate success for the same page is ignored', () => {
    const state = reduce(
      jobPagesReducer,
      initialJobPages,
      { type: 'reset', key: 'k' },
      { type: 'loadStart', key: 'k', page: 1 },
      { type: 'loadSuccess', key: 'k', page: 1, response: page(ids(1, 20)) },
      { type: 'loadSuccess', key: 'k', page: 1, response: page(ids(1, 20)) }
    );
    assert.equal(state.items.length, 20);
  });

  test('changing search/filters/sort resets to page 1 and ignores the old results', () => {
    let state = reduce(
      jobPagesReducer,
      initialJobPages,
      { type: 'reset', key: 'old' },
      { type: 'loadStart', key: 'old', page: 1 },
      { type: 'loadSuccess', key: 'old', page: 1, response: page(ids(1, 20)) },
      { type: 'loadStart', key: 'old', page: 2 }
    );
    state = reduce(
      jobPagesReducer,
      state,
      { type: 'reset', key: 'new' },
      { type: 'loadStart', key: 'new', page: 1 },
      // The old page-2 response arrives after the filter change.
      { type: 'loadSuccess', key: 'old', page: 2, response: page(ids(21, 40)) }
    );
    assert.deepEqual([state.key, state.items.length, state.page], ['new', 0, 0]);
    assert.equal(listView(state).firstPageLoading, true);
    state = jobPagesReducer(state, { type: 'loadSuccess', key: 'new', page: 1, response: page(['job-y-1'], { total: 1, hasMore: false }) });
    assert.deepEqual(state.items.map((item) => item.id), ['job-y-1']);
  });

  test('errors: first-page error, next-page error with retry, no automatic retry loop', () => {
    let state = reduce(
      jobPagesReducer,
      initialJobPages,
      { type: 'reset', key: 'k' },
      { type: 'loadStart', key: 'k', page: 1 },
      { type: 'loadFailure', key: 'k', page: 1, error: new Error('down') }
    );
    assert.equal(listView(state).firstPageError, true);
    assert.equal(listView(state).firstPageLoading, false);
    assert.equal(nextPageToLoad(state), null, 'onEndReached must not retry by itself');

    state = reduce(
      jobPagesReducer,
      state,
      { type: 'loadStart', key: 'k', page: 1 },
      { type: 'loadSuccess', key: 'k', page: 1, response: page(ids(1, 20)) },
      { type: 'loadStart', key: 'k', page: 2 },
      { type: 'loadFailure', key: 'k', page: 2, error: new Error('timeout') }
    );
    assert.deepEqual([listView(state).nextPageError, state.errorPage, state.items.length], [true, 2, 20]);
    assert.equal(nextPageToLoad(state), null);
    state = jobPagesReducer(state, { type: 'loadStart', key: 'k', page: 2 }); // retry
    assert.equal(listView(state).nextPageError, false);
    assert.equal(listView(state).nextPageLoading, true);
  });

  test('zero results (e.g. no jobs in the last 24 hours) shows the empty state', () => {
    const state = reduce(
      jobPagesReducer,
      initialJobPages,
      { type: 'reset', key: 'last24h=true' },
      { type: 'loadStart', key: 'last24h=true', page: 1 },
      { type: 'loadSuccess', key: 'last24h=true', page: 1, response: { items: [], total: 0, hasMore: false } }
    );
    assert.deepEqual(listView(state), {
      firstPageLoading: false,
      nextPageLoading: false,
      firstPageError: false,
      nextPageError: false,
      empty: true,
    });
    assert.equal(state.total, 0);
  });
});

// --- query parameters ------------------------------------------------------------------

describe('API query parameters', () => {
  const EMPTY = { country: [], location: [], company: [], experience: [], title: [], aging: null, state: [] };

  test('screen state maps onto the API filters (same names as the filter sections)', () => {
    assert.deepEqual(buildFilterParams({ filters: EMPTY }), {});
    assert.deepEqual(
      buildFilterParams({
        query: '  react  ',
        verifiedOnly: true,
        last24h: true,
        filters: { ...EMPTY, location: ['Pune', 'Bengaluru'], experience: ['2-5 years'], aging: '7d' },
      }),
      { q: 'react', location: ['Bengaluru', 'Pune'], experience: ['2-5 years'], aging: '7d', verified: 'true', last24h: 'true' }
    );
  });

  test('equal states give equal keys, regardless of selection order', () => {
    const a = buildFilterParams({ filters: { ...EMPTY, location: ['Pune', 'Mumbai'] } });
    const b = buildFilterParams({ filters: { ...EMPTY, location: ['Mumbai', 'Pune'] } });
    assert.equal(paramsKey(a), paramsKey(b));
    assert.notEqual(paramsKey(a), paramsKey(buildFilterParams({ filters: EMPTY, last24h: true })));
  });

  test('query strings repeat multi-value filters and encode text safely', () => {
    assert.equal(
      toQueryString({ location: ['New Delhi', 'Pune'], q: 'C++ & .NET', page: 2, empty: '', none: undefined }),
      'location=New%20Delhi&location=Pune&page=2&q=C%2B%2B%20%26%20.NET'
    );
  });

  test('bbox uses the backend "west,south,east,north" format', () => {
    assert.equal(bboxParam({ west: 68.1234567, south: 6.5, east: 97.25, north: 37 }), '68.123457,6.5,97.25,37');
  });

  test('a cluster\'s "View list" asks for exactly its area plus the active filters', () => {
    const cluster = { bounds: { west: 77.59913, south: 12.840276, east: 77.755914, north: 13.054142 } };
    const params = { ...buildFilterParams({ verifiedOnly: true, filters: EMPTY }), sort: 'recommended', bbox: bboxParam(cluster.bounds) };
    assert.equal(toQueryString(params), 'bbox=77.59913%2C12.840276%2C77.755914%2C13.054142&sort=recommended&verified=true');
  });
});
