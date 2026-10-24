// Keeps only the newest of a series of requests: starting a new request aborts
// the previous one, and a response that arrives after a newer request started
// is reported as stale so it can be ignored.
// (No imports: this file is also loaded by the Node test runner.)

export function createLatestRequest() {
  let current = null; // { id, controller }
  let nextId = 0;

  return {
    // Begins a request: returns its AbortSignal and an isLatest() check.
    start() {
      current?.controller.abort();
      nextId += 1;
      const ticket = { id: nextId, controller: new AbortController() };
      current = ticket;
      return {
        id: ticket.id,
        signal: ticket.controller.signal,
        isLatest: () => current === ticket,
      };
    },
    // Aborts the request in flight (e.g. on unmount or when it's no longer needed).
    cancel() {
      current?.controller.abort();
      current = null;
    },
  };
}

export const isAbortError = (error) => error?.name === 'AbortError';
