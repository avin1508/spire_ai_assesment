// Serialises asynchronous writes so an older value can never land after a
// newer one: at most one write runs at a time, and while it runs only the
// most recent pending value is kept (intermediate values are skipped).
// A failed write is reported through onError and the next value still runs.
// (No imports: this file is also loaded by the Node test runner.)

export function createLatestWriter(write, { onError } = {}) {
  let running = null; // Promise of the drain loop in flight
  let pending; // latest value waiting to be written
  let hasPending = false;
  let waiters = []; // resolvers for callers waiting on the next idle point

  const drain = async () => {
    while (hasPending) {
      const value = pending;
      hasPending = false;
      pending = undefined;
      try {
        await write(value);
      } catch (error) {
        onError?.(error);
      }
    }
    running = null;
    const done = waiters;
    waiters = [];
    done.forEach((resolve) => resolve());
  };

  return {
    // Queue `value`; resolves once it (or a newer value) has been written.
    save(value) {
      pending = value;
      hasPending = true;
      const settled = new Promise((resolve) => waiters.push(resolve));
      if (!running) running = drain();
      return settled;
    },
    // Resolves when nothing is in flight or pending.
    flush() {
      if (!running && !hasPending) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}
