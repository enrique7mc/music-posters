import { describe, it, expect } from 'vitest';
import { parseApiError } from '../error-utils';

describe('parseApiError', () => {
  it('should return validation type with combined message for 400 with details', () => {
    const err = {
      response: {
        status: 400,
        data: { error: 'Invalid request data', details: 'artists: Maximum 150 artists allowed' },
      },
    };
    const result = parseApiError(err, 'search tracks');
    expect(result.type).toBe('validation');
    expect(result.title).toBe('Invalid request');
    expect(result.message).toBe('Invalid request data: artists: Maximum 150 artists allowed');
  });

  it('should return auth type for 401', () => {
    const err = {
      response: { status: 401, data: { error: 'Session expired' } },
    };
    const result = parseApiError(err, 'search tracks');
    expect(result.type).toBe('auth');
    expect(result.title).toBe('Session expired');
    expect(result.message).toBe('Session expired');
  });

  it('should return rate_limit type for 429', () => {
    const err = {
      response: { status: 429, data: { error: 'Rate limit exceeded' } },
    };
    const result = parseApiError(err, 'search tracks');
    expect(result.type).toBe('rate_limit');
    expect(result.title).toBe('Too many requests');
  });

  it('should return server type for 500', () => {
    const err = {
      response: { status: 500, data: { error: 'Internal server error' } },
    };
    const result = parseApiError(err, 'create playlist');
    expect(result.type).toBe('server');
    expect(result.title).toBe('Something went wrong');
  });

  it('should not prefix with undefined when serverMsg is missing but details exists', () => {
    const err = {
      response: {
        status: 400,
        data: { details: 'artists: Maximum 150 artists allowed' },
      },
    };
    const result = parseApiError(err, 'search tracks');
    expect(result.type).toBe('validation');
    expect(result.message).toBe('artists: Maximum 150 artists allowed');
    expect(result.message).not.toContain('undefined');
  });

  it('should return details only when serverMsg is empty string', () => {
    const err = {
      response: {
        status: 500,
        data: { error: '', details: 'Something specific' },
      },
    };
    const result = parseApiError(err, 'do something');
    expect(result.message).toBe('Something specific');
  });

  it('should return server type with fallback message for network error', () => {
    const err = { message: 'Network Error' };
    const result = parseApiError(err, 'search tracks');
    expect(result.type).toBe('server');
    expect(result.message).toBe('Failed to search tracks. Please try again.');
  });
});
