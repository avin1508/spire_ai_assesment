// Infinite-scroll state for the All Jobs list. Pure reducer, so the paging
// rules can be tested without React.
// (No imports: this file is also loaded by the Node test runner.)
//
// - `key` identifies the search/filter/sort; a new key starts again at page 1
//   and responses for an old key are ignored (no stale appends).
// - Only one page request runs at a time, and only the next page is requested
//   (no duplicate requests); job ids already shown are never added twice.
// - Paging stops when the server says hasMore is false.

export const initialJobPages = {
  key: null,
  items: [],
  ids: {}, // id → true, for de-duplication
  page: 0, // last page loaded
  total: null,
  hasMore: true,
  loadingPage: null, // page being requested, or null
  error: null,
  errorPage: null,
};

export function jobPagesReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return { ...initialJobPages, key: action.key };
    case 'loadStart':
      if (action.key !== state.key) return state;
      return { ...state, loadingPage: action.page, error: null, errorPage: null };
    case 'loadSuccess': {
      if (action.key !== state.key || action.page !== state.loadingPage) return state;
      const ids = { ...state.ids };
      const added = [];
      action.response.items.forEach((item) => {
        if (ids[item.id]) return;
        ids[item.id] = true;
        added.push(item);
      });
      return {
        ...state,
        items: [...state.items, ...added],
        ids,
        page: action.page,
        total: action.response.total,
        hasMore: Boolean(action.response.hasMore),
        loadingPage: null,
      };
    }
    case 'loadFailure':
      if (action.key !== state.key || action.page !== state.loadingPage) return state;
      return { ...state, loadingPage: null, error: action.error, errorPage: action.page };
    default:
      return state;
  }
}

// The page to request next, or null when nothing should be requested now.
export function nextPageToLoad(state) {
  if (state.key === null || state.loadingPage !== null || !state.hasMore || state.error) return null;
  return state.page + 1;
}

// What the list should show.
export function listView(state) {
  return {
    firstPageLoading: state.page === 0 && state.loadingPage === 1,
    nextPageLoading: state.page > 0 && state.loadingPage !== null,
    firstPageError: state.page === 0 && Boolean(state.error),
    nextPageError: state.page > 0 && Boolean(state.error),
    empty: state.page > 0 && state.items.length === 0 && !state.hasMore,
  };
}
