import { describe, it, expect } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../health';

describe('/api/health', () => {
  it('should return 200 with health status', () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      service: 'music-posters',
      version: '1.0.0',
    });
  });

  it('should include valid ISO timestamp', () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    handler(req, res);

    const data = JSON.parse(res._getData());
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  it('should work with any HTTP method', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];

    methods.forEach((method) => {
      const { req, res } = createMocks({ method });
      handler(req, res);
      expect(res._getStatusCode()).toBe(200);
    });
  });
});
