import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '@/pages/api/dev/config';
import { resetDevConfig } from '@/lib/dev-mode';

describe('/api/dev/config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetDevConfig();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDevConfig();
  });

  function createReq(method: string, body?: any) {
    const { req, res } = createMocks({
      method: method as any,
      body,
      headers: {},
    });
    // Simulate localhost
    (req as any).socket = { remoteAddress: '::1' };
    return { req: req as any, res: res as any };
  }

  it('GET returns 403 when dev mode unavailable', () => {
    delete process.env.DEV_MODE;
    process.env.NODE_ENV = 'development';

    const { req, res } = createReq('GET');
    handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it('GET returns config when dev mode available', () => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';

    const { req, res } = createReq('GET');
    handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.enabled).toBe(true);
    expect(data).toHaveProperty('mockAnalysis');
    expect(data).toHaveProperty('dryRunPlaylist');
    expect(data).toHaveProperty('skipAuth');
    expect(data).toHaveProperty('fakePlatform');
  });

  it('PATCH merges and returns updated config', () => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';

    const { req, res } = createReq('PATCH', { mockAnalysis: true, mockDelayMs: 500 });
    handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.mockAnalysis).toBe(true);
    expect(data.mockDelayMs).toBe(500);
  });

  it('PATCH with invalid body returns 400', () => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';

    const { req, res } = createReq('PATCH', { mockAnalysis: 'not-a-boolean' });
    handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Invalid type');
  });

  it('rejects non-localhost requests', () => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';

    const { req, res } = createMocks({
      method: 'GET',
      headers: {},
    });
    (req as any).socket = { remoteAddress: '192.168.1.100' };

    handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain('localhost-only');
  });

  it('returns 405 for unsupported methods', () => {
    process.env.DEV_MODE = 'true';
    process.env.NODE_ENV = 'development';

    const { req, res } = createReq('DELETE');
    handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
