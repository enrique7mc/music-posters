/**
 * localStorage polyfill for the test environment.
 *
 * Node 25 enables the experimental Web Storage API by default, exposing a
 * global `localStorage` that throws unless the process was started with a
 * valid `--localstorage-file`. That broken global shadows jsdom's own
 * implementation, so `localStorage.getItem` is not a function. When
 * `msw/node` imports, its `CookieStore` calls `localStorage.getItem(...)` at
 * module-eval time and the whole vitest suite dies at collection. See GitHub
 * issue #38.
 *
 * This file is the FIRST entry in vitest's `setupFiles`, so it runs before
 * `./setup.ts` imports the MSW server. It only replaces `localStorage` when
 * the present one is broken, leaving a working jsdom/native implementation
 * untouched on other Node versions.
 */
function createInMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  } as Storage;
}

if (typeof globalThis.localStorage?.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createInMemoryStorage(),
    writable: true,
    configurable: true,
  });
}
