import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// We need to test the interceptors, so we import the configured instance
// But since interceptors are added at module load time, we test the behavior
describe('api-client', () => {
  let apiClient: typeof import('../api-client').apiClient;
  let mock: MockAdapter;

  beforeEach(async () => {
    // Reset modules to get fresh interceptors
    vi.resetModules();
    const mod = await import('../api-client');
    apiClient = mod.apiClient;
    mock = new MockAdapter(apiClient);

    // Mock sessionStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  afterEach(() => {
    mock.restore();
    vi.unstubAllGlobals();
  });

  it('should retry on 429 for safe route and succeed on retry', async () => {
    mock
      .onPost('/api/search-tracks')
      .replyOnce(429, { error: 'Rate limited' })
      .onPost('/api/search-tracks')
      .replyOnce(200, { tracks: [], artistsSearched: 0, tracksFound: 0 });

    const response = await apiClient.post('/api/search-tracks', { artists: [] });
    expect(response.status).toBe(200);
  }, 15000);

  it('should NOT retry for /api/create-playlist', async () => {
    mock.onPost('/api/create-playlist').reply(429, { error: 'Rate limited' });

    await expect(apiClient.post('/api/create-playlist', { trackIds: [] })).rejects.toMatchObject({
      response: { status: 429 },
    });

    // Should only have been called once (no retry)
    expect(mock.history.post.length).toBe(1);
  });

  it('should NOT retry for /api/analyze', async () => {
    mock.onPost('/api/analyze').reply(502, { error: 'Bad gateway' });

    await expect(apiClient.post('/api/analyze', {})).rejects.toMatchObject({
      response: { status: 502 },
    });

    expect(mock.history.post.length).toBe(1);
  });

  it('should store return URL in sessionStorage on 401 for non-auth routes', async () => {
    // Mock window.location
    const mockLocation = { pathname: '/review-tracks', href: '' };
    vi.stubGlobal('window', {
      location: mockLocation,
      sessionStorage: globalThis.sessionStorage,
    });

    mock.onPost('/api/search-tracks').reply(401, { error: 'Unauthorized' });

    await expect(apiClient.post('/api/search-tracks', { artists: [] })).rejects.toMatchObject({
      response: { status: 401 },
    });

    const stored = sessionStorage.getItem('returnAfterAuth');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.url).toBe('/review-tracks');
    expect(parsed.timestamp).toBeGreaterThan(0);
  });

  it('should skip 401 interceptor for /api/auth/* routes', async () => {
    mock.onGet('/api/auth/me').reply(401, { error: 'Not authenticated' });

    await expect(apiClient.get('/api/auth/me')).rejects.toMatchObject({
      response: { status: 401 },
    });

    // Should NOT have stored return URL
    const stored = sessionStorage.getItem('returnAfterAuth');
    expect(stored).toBeNull();
  });
});
