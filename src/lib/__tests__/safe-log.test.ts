import { describe, it, expect } from 'vitest';
import { errMessage, errDetail } from '../safe-log';

/**
 * These helpers exist for one reason: keep credentials out of logs. The assertions
 * below are therefore mostly "the secret is NOT in the output" — that's the contract,
 * not an incidental property.
 */

const ACCESS_TOKEN = 'BQC9-super-secret-access-token';
const CLIENT_SECRET = 'fake-client-secret-for-tests';

/** Shaped like a real axios error: credentials live in `config`, not in `message`. */
function axiosLikeError(status?: number, apiMessage?: string) {
  const error: any = new Error(`Request failed with status code ${status ?? 500}`);
  error.config = {
    url: 'https://api.spotify.com/v1/artists/x/top-tracks',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    // The token-exchange call puts the client secret in the form body.
    data: `grant_type=authorization_code&client_secret=${CLIENT_SECRET}`,
  };
  if (status) {
    error.response = {
      status,
      data: apiMessage ? { error: { message: apiMessage } } : {},
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    };
  }
  return error;
}

describe('errMessage', () => {
  it('returns the message for an Error', () => {
    expect(errMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error throws', () => {
    expect(errMessage('just a string')).toBe('just a string');
    expect(errMessage(42)).toBe('42');
    expect(errMessage(null)).toBe('null');
  });

  it('never exposes the access token or client secret from an axios error', () => {
    const out = errMessage(axiosLikeError(403, 'Forbidden'));
    expect(out).not.toContain(ACCESS_TOKEN);
    expect(out).not.toContain(CLIENT_SECRET);
    expect(out).toBe('Request failed with status code 403');
  });
});

describe('errDetail', () => {
  it('appends status and the API message when both are present', () => {
    expect(errDetail(axiosLikeError(403, 'Forbidden'))).toBe(
      'Request failed with status code 403 (403: Forbidden)'
    );
  });

  it('appends status alone when the API gave no message', () => {
    expect(errDetail(axiosLikeError(500))).toBe('Request failed with status code 500 (500)');
  });

  it('falls back to the bare message when there is no response (network failure)', () => {
    // This is the case that used to leak: no `.response`, so old code fell through
    // to logging the raw error, whose config carries both credentials.
    expect(errDetail(axiosLikeError())).toBe('Request failed with status code 500');
  });

  it('handles non-Error throws', () => {
    expect(errDetail('plain string')).toBe('plain string');
  });

  it('never exposes credentials, with or without a response', () => {
    for (const error of [axiosLikeError(403, 'Forbidden'), axiosLikeError(500), axiosLikeError()]) {
      const out = errDetail(error);
      expect(out).not.toContain(ACCESS_TOKEN);
      expect(out).not.toContain(CLIENT_SECRET);
      expect(out).not.toContain('Bearer');
    }
  });

  it('tolerates a malformed response body without throwing', () => {
    const error: any = new Error('weird');
    error.response = { status: 418, data: 'not-an-object' };
    expect(() => errDetail(error)).not.toThrow();
    expect(errDetail(error)).toBe('weird (418)');
  });
});
