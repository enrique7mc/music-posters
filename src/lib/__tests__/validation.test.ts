import { describe, it, expect } from 'vitest';
import { artistSchema, searchTracksSchema } from '../validation';

describe('validation.ts', () => {
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

    it('should reject more than 100 artists', () => {
      const invalidRequest = {
        artists: Array.from({ length: 101 }, (_, i) => ({ name: `Artist ${i}` })),
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
});
