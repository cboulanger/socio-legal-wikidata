/**
 * Minimal observable store. Shallow-merge updates; synchronous notification.
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = initial;
  const subscribers = new Set();
  return {
    getState: () => state,
    /** @param {Partial<T> | ((s: T) => Partial<T>)} patch */
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const fn of subscribers) fn(state);
    },
    /** @param {(s: T) => void} fn @returns {() => void} */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
