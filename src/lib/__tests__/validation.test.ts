import { describe, it, expect } from 'vitest';
import {
  artistSchema,
  searchTracksSchema,
  personalizeSchema,
  searchArtistSchema,
  MAX_ARTISTS_PER_SEARCH,
} from '../validation';

describe('validation.ts', () => {
  describe('MAX_ARTISTS_PER_SEARCH', () => {
    it('should be exported and equal 150', () => {
      expect(MAX_ARTISTS_PER_SEARCH).toBe(150);
    });
  });

  describe('artistSchema', () => {
    it('should validate valid artist object', () => {
      const validArtist = {
        name: 'Taylor Swift',
        weight: 10,
        tier: 'headliner' as const,
        reasoning: 'Top billing',
      };

      expect(() => artistSchema.parse(validArtist)).not.toThrow();
    });

    it('should reject empty artist name', () => {
      const invalidArtist = {
        name: '',
      };

      expect(() => artistSchema.parse(invalidArtist)).toThrow();
    });

    it('should reject artist name exceeding 100 characters', () => {
      const invalidArtist = {
        name: 'A'.repeat(101),
      };

      expect(() => artistSchema.parse(invalidArtist)).toThrow();
    });

    it('should trim whitespace from artist name', () => {
      const artist = {
        name: '  Taylor Swift  ',
      };

      const result = artistSchema.parse(artist);
      expect(result.name).toBe('Taylor Swift');
    });

    it('should validate artist with optional fields', () => {
      const artist = {
        name: 'Drake',
      };

      expect(() => artistSchema.parse(artist)).not.toThrow();
    });

    it('should reject invalid weight', () => {
      const invalidArtist = {
        name: 'Drake',
        weight: 11,
      };

      expect(() => artistSchema.parse(invalidArtist)).toThrow();
    });

    it('should reject invalid tier', () => {
      const invalidArtist = {
        name: 'Drake',
        tier: 'invalid-tier',
      };

      expect(() => artistSchema.parse(invalidArtist)).toThrow();
    });
  });

  describe('searchTracksSchema', () => {
    it('should validate valid search tracks request', () => {
      const validRequest = {
        artists: [
          { name: 'Taylor Swift', weight: 10, tier: 'headliner' as const },
          { name: 'Drake', weight: 7, tier: 'sub-headliner' as const },
        ],
      };

      expect(() => searchTracksSchema.parse(validRequest)).not.toThrow();
    });

    it('should reject empty artists array', () => {
      const invalidRequest = {
        artists: [],
      };

      expect(() => searchTracksSchema.parse(invalidRequest)).toThrow();
    });

    it('should reject more than 150 artists', () => {
      const invalidRequest = {
        artists: Array.from({ length: 151 }, (_, i) => ({ name: `Artist ${i}` })),
      };

      expect(() => searchTracksSchema.parse(invalidRequest)).toThrow();
    });

    it('should validate optional trackCountMode', () => {
      const validRequest = {
        artists: [{ name: 'Taylor Swift' }],
        trackCountMode: 'tier-based' as const,
      };

      expect(() => searchTracksSchema.parse(validRequest)).not.toThrow();
    });

    it('should validate optional customTrackCount', () => {
      const validRequest = {
        artists: [{ name: 'Taylor Swift' }],
        trackCountMode: 'custom' as const,
        customTrackCount: 5,
      };

      expect(() => searchTracksSchema.parse(validRequest)).not.toThrow();
    });

    it('should reject invalid customTrackCount', () => {
      const invalidRequest = {
        artists: [{ name: 'Taylor Swift' }],
        customTrackCount: 51,
      };

      expect(() => searchTracksSchema.parse(invalidRequest)).toThrow();
    });
  });

  describe('personalizeSchema', () => {
    it('should validate a minimal valid request', () => {
      expect(() =>
        personalizeSchema.parse({ artists: [{ name: 'Phoenix' }], platform: 'apple-music' })
      ).not.toThrow();
    });

    it('STRIPS any client-supplied affinity metadata (server is the sole authority)', () => {
      // The whole point of personalizeSchema using the bare artistSchema: a
      // malicious/buggy client must not be able to pre-declare an artist as
      // "loved" or "gem". Zod strips unrecognized keys by default.
      const result = personalizeSchema.parse({
        artists: [
          {
            name: 'Phoenix',
            affinity: 'loved',
            affinityConfidence: 0.99,
            affinityReason: 'trust me',
            affinityLinkedTo: ['Caribou'],
          },
        ],
      });

      expect(result.artists[0]).toEqual({ name: 'Phoenix' });
      expect(result.artists[0]).not.toHaveProperty('affinity');
      expect(result.artists[0]).not.toHaveProperty('affinityConfidence');
    });

    it('requires at least one artist', () => {
      expect(() => personalizeSchema.parse({ artists: [] })).toThrow();
    });

    it(`caps the artist count at MAX_ARTISTS_PER_SEARCH (${MAX_ARTISTS_PER_SEARCH})`, () => {
      const tooMany = Array.from({ length: MAX_ARTISTS_PER_SEARCH + 1 }, (_, i) => ({
        name: `Artist ${i}`,
      }));
      expect(() => personalizeSchema.parse({ artists: tooMany })).toThrow();
    });
  });

  describe('searchArtistSchema', () => {
    it('KEEPS the affinity tag (search-tracks derives per-artist track mode from it)', () => {
      const result = searchArtistSchema.parse({ name: 'Phoenix', affinity: 'loved' });
      expect(result.affinity).toBe('loved');
    });

    it('strips the other affinity_* display fields, keeping only the tag', () => {
      const result = searchArtistSchema.parse({
        name: 'Anz',
        affinity: 'gem',
        affinityConfidence: 0.9,
        affinityReason: 'for fans of Phoenix',
        affinityLinkedTo: ['Phoenix'],
      });
      expect(result).toEqual({ name: 'Anz', affinity: 'gem' });
    });

    it('treats affinity as optional', () => {
      const result = searchArtistSchema.parse({ name: 'Phoenix' });
      expect(result.affinity).toBeUndefined();
    });

    it('rejects an affinity value outside the loved|gem enum', () => {
      expect(() => searchArtistSchema.parse({ name: 'Phoenix', affinity: 'headliner' })).toThrow();
    });
  });
});
