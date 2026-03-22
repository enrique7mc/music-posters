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
      try {
        sessionStorage.setItem(
          'returnAfterAuth',
          JSON.stringify({
            url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
            timestamp: Date.now(),
          })
        );
      } catch {
        // sessionStorage quota exceeded — proceed without return URL
      }
      window.location.href = '/';
    }
  }
  return Promise.reject(error);
});

export { apiClient };
