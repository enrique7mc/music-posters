import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * Routes that are safe to retry on transient errors (idempotent GET-like or search operations).
 * Never retry non-idempotent operations like playlist creation or image analysis.
 */
const SAFE_RETRY_ROUTES = ['/api/search-tracks', '/api/auth/me'];

const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 2000;

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

function isRetryableError(error: AxiosError): boolean {
  if (error.code === 'ERR_CANCELED') return false;
  if (!error.response) return true; // Network error
  const status = error.response.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isSafeRoute(url: string | undefined): boolean {
  if (!url) return false;
  return SAFE_RETRY_ROUTES.some((route) => url.startsWith(route));
}

const apiClient = axios.create();

// Retry interceptor
apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetryConfig | undefined;
  if (!config) return Promise.reject(error);

  const retryCount = config._retryCount || 0;

  if (isSafeRoute(config.url) && isRetryableError(error) && retryCount < MAX_RETRIES) {
    config._retryCount = retryCount + 1;
    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
    await new Promise((resolve) => setTimeout(resolve, backoff));
    return apiClient(config);
  }

  return Promise.reject(error);
});

// 401 interceptor — store return URL and redirect to login
apiClient.interceptors.response.use(undefined, (error: AxiosError) => {
  if (
    error.response?.status === 401 &&
    error.config?.url &&
    !error.config.url.startsWith('/api/auth/')
  ) {
    if (typeof window !== 'undefined') {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      // In development the app is reachable on both `localhost` and `127.0.0.1`, and
      // /api/auth/spotify/login bounces to `127.0.0.1` because Spotify prohibits
      // `localhost` in redirect URIs. Those are distinct origins with separate
      // sessionStorage, so anything written here on `localhost` is unreadable after
      // the bounce and the user loses their place. Send the return path through the
      // URL — host-independent — and let the landing page persist it on whichever
      // origin the flow actually continues from.
      let destination = '/';
      try {
        const target = new URL('/', window.location.href);
        if (target.hostname === 'localhost') target.hostname = '127.0.0.1';
        target.searchParams.set('returnTo', returnTo);
        destination = target.toString();
      } catch {
        // Unparseable location (non-browser or stubbed env). Fall back to a plain
        // redirect — this interceptor must never throw, or it would replace the 401
        // the caller is waiting on with a URL error.
      }

      try {
        // Still write it here: on a single-origin (production) flow this is enough on
        // its own, and it keeps working if the query param is stripped by anything.
        sessionStorage.setItem(
          'returnAfterAuth',
          JSON.stringify({ url: returnTo, timestamp: Date.now() })
        );
      } catch {
        // sessionStorage quota exceeded — the query param still carries it
      }
      window.location.href = destination;
    }
  }
  return Promise.reject(error);
});

export { apiClient };
