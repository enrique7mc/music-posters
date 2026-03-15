import { describe, it, expect, vi } from 'vitest';
import { NextApiResponse } from 'next';
import {
  isValidAppleMusicToken,
  setAppleMusicCookies,
  getAppleMusicToken,
  clearAppleMusicCookies,
} from '../apple-music-auth';

describe('apple-music-auth.ts', () => {
  describe('isValidAppleMusicToken', () => {
    it('should reject empty or non-string tokens', () => {
      expect(isValidAppleMusicToken('')).toBe(false);
      expect(isValidAppleMusicToken(null as any)).toBe(false);
      expect(isValidAppleMusicToken(undefined as any)).toBe(false);
      expect(isValidAppleMusicToken(123 as any)).toBe(false);
    });

    it('should reject tokens shorter than 100 characters', () => {
      expect(isValidAppleMusicToken('a'.repeat(99))).toBe(false);
    });

    it('should accept tokens with exactly 100 characters', () => {
      expect(isValidAppleMusicToken('a'.repeat(100))).toBe(true);
    });

    it('should accept base64 tokens', () => {
      const base64Token =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' + 'a'.repeat(50);
      expect(isValidAppleMusicToken(base64Token)).toBe(true);
    });

    it('should accept tokens with dots, hyphens, and underscores', () => {
      // Apple Music user tokens can contain these characters
      const tokenWithDots =
        'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJCTFM2OEE4UVMzIiwiaWF0IjoxNzEwNTI0MDAwfQ.signature_here_padding';
      expect(isValidAppleMusicToken(tokenWithDots)).toBe(true);

      const tokenWithHyphens = 'a'.repeat(50) + '-' + 'b'.repeat(50);
      expect(isValidAppleMusicToken(tokenWithHyphens)).toBe(true);

      const tokenWithUnderscores = 'a'.repeat(50) + '_' + 'b'.repeat(50);
      expect(isValidAppleMusicToken(tokenWithUnderscores)).toBe(true);
    });

    it('should reject tokens with invalid characters', () => {
      const tokenWithSpaces = 'a'.repeat(50) + ' ' + 'b'.repeat(50);
      expect(isValidAppleMusicToken(tokenWithSpaces)).toBe(false);

      const tokenWithBraces = 'a'.repeat(50) + '{' + 'b'.repeat(50);
      expect(isValidAppleMusicToken(tokenWithBraces)).toBe(false);

      const tokenWithAngleBrackets = 'a'.repeat(50) + '<script>' + 'b'.repeat(50);
      expect(isValidAppleMusicToken(tokenWithAngleBrackets)).toBe(false);
    });
  });

  describe('setAppleMusicCookies', () => {
    it('should set user token and platform cookies', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      setAppleMusicCookies(mockRes, 'test_token_123');

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.arrayContaining([
          expect.stringContaining('apple_music_user_token=test_token_123'),
          expect.stringContaining('music_platform=apple-music'),
        ])
      );
    });

    it('should set httpOnly flag on cookies', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      setAppleMusicCookies(mockRes, 'test_token');

      const setCookieCall = (mockRes.setHeader as any).mock.calls[0][1] as string[];
      setCookieCall.forEach((cookie: string) => {
        expect(cookie).toContain('HttpOnly');
      });
    });
  });

  describe('getAppleMusicToken', () => {
    it('should return token from cookies', () => {
      const mockReq = {
        headers: { cookie: 'apple_music_user_token=my_token_123; music_platform=apple-music' },
      } as any;

      expect(getAppleMusicToken(mockReq)).toBe('my_token_123');
    });

    it('should return null when no token cookie exists', () => {
      const mockReq = {
        headers: { cookie: 'other_cookie=value' },
      } as any;

      expect(getAppleMusicToken(mockReq)).toBeNull();
    });

    it('should return null when no cookies at all', () => {
      const mockReq = {
        headers: { cookie: '' },
      } as any;

      expect(getAppleMusicToken(mockReq)).toBeNull();
    });
  });

  describe('clearAppleMusicCookies', () => {
    it('should clear user token and platform cookies', () => {
      const mockRes = {
        setHeader: vi.fn(),
      } as unknown as NextApiResponse;

      clearAppleMusicCookies(mockRes);

      const setCookieCall = (mockRes.setHeader as any).mock.calls[0][1] as string[];
      setCookieCall.forEach((cookie: string) => {
        expect(cookie).toContain('Max-Age=0');
      });
    });
  });
});
