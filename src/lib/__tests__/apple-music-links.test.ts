import { describe, expect, it } from 'vitest';
import {
  APPLE_MUSIC_LIBRARY_URL,
  appleMusicOpenUrl,
  isAppleMobileDevice,
  libraryPlaylistUrl,
} from '../apple-music-links';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('apple-music-links', () => {
  it('builds the web player library link from the library id', () => {
    expect(libraryPlaylistUrl('p.AbC123')).toBe(
      'https://music.apple.com/library/playlist/p.AbC123'
    );
  });

  it('detects iPhone, and iPadOS posing as a Mac via touch points', () => {
    expect(isAppleMobileDevice({ userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobileDevice({ userAgent: MAC_UA, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobileDevice({ userAgent: MAC_UA, maxTouchPoints: 0 })).toBe(false);
    expect(isAppleMobileDevice({ userAgent: ANDROID_UA, maxTouchPoints: 5 })).toBe(false);
    expect(isAppleMobileDevice(undefined)).toBe(false);
  });

  it('sends iOS to the Library root and keeps the playlist link elsewhere', () => {
    const url = libraryPlaylistUrl('p.1');
    expect(appleMusicOpenUrl(url, { userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe(
      APPLE_MUSIC_LIBRARY_URL
    );
    expect(appleMusicOpenUrl(url, { userAgent: MAC_UA, maxTouchPoints: 0 })).toBe(url);
    expect(appleMusicOpenUrl(url, { userAgent: ANDROID_UA, maxTouchPoints: 5 })).toBe(url);
  });
});
