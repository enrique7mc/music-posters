// Regression: ISSUE-001 — raw Spotify track IDs rejected by createPlaylistSchema
// Found by /qa on 2026-03-22
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-03-22.md

import { describe, it, expect } from 'vitest';
import { createPlaylistSchema } from '../validation';

describe('createPlaylistSchema — track ID formats', () => {
  it('should accept raw 22-char Spotify track IDs', () => {
    const request = {
      trackIds: ['0VjIjW4GlUZAMYd2vXMi3b', '5QO79kh1waicV47BqGRL3g'],
      playlistName: 'Test Playlist',
    };
    expect(() => createPlaylistSchema.parse(request)).not.toThrow();
  });

  it('should accept Spotify URI format', () => {
    const request = {
      trackIds: ['spotify:track:0VjIjW4GlUZAMYd2vXMi3b'],
      playlistName: 'Test Playlist',
    };
    expect(() => createPlaylistSchema.parse(request)).not.toThrow();
  });

  it('should accept Apple Music numeric IDs', () => {
    const request = {
      trackIds: ['1440935467', '1440935468'],
      playlistName: 'Test Playlist',
    };
    expect(() => createPlaylistSchema.parse(request)).not.toThrow();
  });

  it('should reject invalid track ID formats', () => {
    const request = {
      trackIds: ['not-a-valid-id'],
      playlistName: 'Test Playlist',
    };
    expect(() => createPlaylistSchema.parse(request)).toThrow();
  });

  it('should reject short alphanumeric strings that are not 22 chars', () => {
    const request = {
      trackIds: ['abc123'],
      playlistName: 'Test Playlist',
    };
    expect(() => createPlaylistSchema.parse(request)).toThrow();
  });
});
