import { describe, it, expect, vi } from 'vitest';
import { NextApiRequest, NextApiResponse } from 'next';
import {
  setAuthCookies,
  getAccessToken,
  getRefreshToken,
  clearAuthCookies,
  generateRandomString,
  isAuthenticated,
} from '../auth';

describe('auth.ts', () => {
  describe('setAuthCookies', () => {
    it('should set access and refresh token cookies', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      setAuthCookies(mockRes, 'access_token_123', 'refresh_token_456', 3600);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.arrayContaining([
          expect.stringContaining('spotify_access_token=access_token_123'),
          expect.stringContaining('spotify_refresh_token=refresh_token_456'),
        ])
      );
    });

    it('should set httpOnly flag on cookies', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      setAuthCookies(mockRes, 'access_token_123', 'refresh_token_456', 3600);

      const cookies = mockRes.setHeader.mock.calls[0][1] as string[];
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[1]).toContain('HttpOnly');
    });

    it('should set SameSite=lax on cookies', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      setAuthCookies(mockRes, 'access_token_123', 'refresh_token_456', 3600);

      const cookies = mockRes.setHeader.mock.calls[0][1] as string[];
      expect(cookies[0]).toContain('SameSite=Lax');
      expect(cookies[1]).toContain('SameSite=Lax');
    });

    it('should set correct Max-Age for access token', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      setAuthCookies(mockRes, 'access_token_123', 'refresh_token_456', 3600);

      const cookies = mockRes.setHeader.mock.calls[0][1] as string[];
      expect(cookies[0]).toContain('Max-Age=3600');
    });

    it('should set 30 day Max-Age for refresh token', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      setAuthCookies(mockRes, 'access_token_123', 'refresh_token_456', 3600);

      const cookies = mockRes.setHeader.mock.calls[0][1] as string[];
      const expectedMaxAge = 60 * 60 * 24 * 30; // 30 days
      expect(cookies[1]).toContain(`Max-Age=${expectedMaxAge}`);
    });
  });

  describe('getAccessToken', () => {
    it('should get access token from cookies', () => {
      const mockReq = {
        headers: {
          cookie: 'spotify_access_token=access_token_123; other_cookie=value',
        },
      } as NextApiRequest;

      const token = getAccessToken(mockReq);

      expect(token).toBe('access_token_123');
    });

    it('should return null when access token cookie does not exist', () => {
      const mockReq = {
        headers: {
          cookie: 'other_cookie=value',
        },
      } as NextApiRequest;

      const token = getAccessToken(mockReq);

      expect(token).toBeNull();
    });

    it('should return null when no cookies are present', () => {
      const mockReq = {
        headers: {},
      } as NextApiRequest;

      const token = getAccessToken(mockReq);

      expect(token).toBeNull();
    });
  });

  describe('getRefreshToken', () => {
    it('should get refresh token from cookies', () => {
      const mockReq = {
        headers: {
          cookie: 'spotify_refresh_token=refresh_token_456; other_cookie=value',
        },
      } as NextApiRequest;

      const token = getRefreshToken(mockReq);

      expect(token).toBe('refresh_token_456');
    });

    it('should return null when refresh token cookie does not exist', () => {
      const mockReq = {
        headers: {
          cookie: 'other_cookie=value',
        },
      } as NextApiRequest;

      const token = getRefreshToken(mockReq);

      expect(token).toBeNull();
    });

    it('should return null when no cookies are present', () => {
      const mockReq = {
        headers: {},
      } as NextApiRequest;

      const token = getRefreshToken(mockReq);

      expect(token).toBeNull();
    });
  });

  describe('clearAuthCookies', () => {
    it('should clear access and refresh token cookies', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      clearAuthCookies(mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.arrayContaining([
          expect.stringContaining('spotify_access_token='),
          expect.stringContaining('spotify_refresh_token='),
        ])
      );
    });

    it('should set Max-Age=0 to expire cookies immediately', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      clearAuthCookies(mockRes);

      const cookies = mockRes.setHeader.mock.calls[0][1] as string[];
      expect(cookies[0]).toContain('Max-Age=0');
      expect(cookies[1]).toContain('Max-Age=0');
    });
  });

  describe('generateRandomString', () => {
    it('should generate string of correct length', () => {
      const str = generateRandomString(16);

      expect(str).toHaveLength(16);
    });

    it('should generate different strings on subsequent calls', () => {
      const str1 = generateRandomString(16);
      const str2 = generateRandomString(16);

      expect(str1).not.toBe(str2);
    });

    it('should only contain alphanumeric characters', () => {
      const str = generateRandomString(100);

      expect(str).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate very short strings', () => {
      const str = generateRandomString(1);

      expect(str).toHaveLength(1);
    });

    it('should generate very long strings', () => {
      const str = generateRandomString(1000);

      expect(str).toHaveLength(1000);
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when access token exists', () => {
      const mockReq = {
        headers: {
          cookie: 'spotify_access_token=access_token_123',
        },
      } as NextApiRequest;

      const authenticated = isAuthenticated(mockReq);

      expect(authenticated).toBe(true);
    });

    it('should return false when access token does not exist', () => {
      const mockReq = {
        headers: {
          cookie: 'other_cookie=value',
        },
      } as NextApiRequest;

      const authenticated = isAuthenticated(mockReq);

      expect(authenticated).toBe(false);
    });

    it('should return false when no cookies are present', () => {
      const mockReq = {
        headers: {},
      } as NextApiRequest;

      const authenticated = isAuthenticated(mockReq);

      expect(authenticated).toBe(false);
    });
  });
});
