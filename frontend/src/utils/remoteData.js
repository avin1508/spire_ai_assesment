// State for one piece of server data that is re-requested whenever its inputs
// change (map markers, result counts, job details). Pure reducer, so the
// loading rules can be tested without React.
// (No imports: this file is also loaded by the Node test runner.)
//
// - Data from the last successful response is kept while a new request runs,
//   so the map doesn't blank out during a pan.
// - Only the response to the latest request (by id) is applied; older ones are
//   ignored, so a slow response can't overwrite newer results.
// - A failure ends the loading state (no endless shimmer) and keeps old data.

export const initialRemoteData = {
  data: null,
  dataKey: null, // key of the request that produced `data`
  hasData: false,
  loading: false,
  error: null,
  requestId: 0,
  requestKey: null,
};

export function remoteDataReducer(state, action) {
  switch (action.type) {
    case 'request':
      return { ...state, loading: true, error: null, requestId: action.id, requestKey: action.key };
    case 'success':
      if (action.id !== state.requestId) return state;
      return {
        ...state,
        data: action.data,
        dataKey: state.requestKey,
        hasData: true,
        loading: false,
        error: null,
      };
    case 'failure':
      if (action.id !== state.requestId) return state;
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

// What to show for `state` when the wanted data is identified by `key`
// (null = nothing wanted right now, e.g. the map is hidden).
//   loadingIndicator: a request is running, or `key` changed and its request
//     is about to start (debounce) — so the indicator appears immediately
//   initialSkeleton: nothing has loaded successfully yet and no error is shown
//   errorRetry: the latest request failed and nothing newer is pending
export function loadingView(state, key) {
  const pending = key !== null && state.requestKey !== key;
  const loadingIndicator = state.loading || pending;
  const errorRetry = !loadingIndicator && Boolean(state.error);
  return {
    loadingIndicator,
    initialSkeleton: !state.hasData && !errorRetry,
    errorRetry,
  };
}
