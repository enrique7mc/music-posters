import { describe, it, expect } from 'vitest';
import {
  artistSchema,
  searchTracksSchema,
  personalizeSchema,
  searchArtistSchema,
  MAX_ARTISTS_PER_SEARCH,
} from '../validation';
import { MIN_TRACKS_PER_ARTIST, MAX_TRACKS_PER_ARTIST } from '../constants';

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
        customTrackCount: 26,
      };

      expect(() => searchTracksSchema.parse(invalidRequest)).toThrow();
    });

    describe('track count range (1–25)', () => {
      const baseRequest = { artists: [{ name: 'Taylor Swift' }] };

      it.each([MIN_TRACKS_PER_ARTIST, 7, 17, MAX_TRACKS_PER_ARTIST])(
        'accepts customTrackCount %i',
        (customTrackCount) => {
          expect(() =>
            searchTracksSchema.parse({ ...baseRequest, trackCountMode: 'custom', customTrackCount })
          ).not.toThrow();
        }
      );

      it.each([0, -1, 26, 51, 1.5, '5'])('rejects customTrackCount %p', (customTrackCount) => {
        expect(() =>
          searchTracksSchema.parse({ ...baseRequest, trackCountMode: 'custom', customTrackCount })
        ).toThrow();
      });

      it('accepts tierCounts at the boundaries and between them', () => {
        const validRequest = {
          ...baseRequest,
          trackCountMode: 'custom-per-tier' as const,
          tierCounts: {
            headliner: MAX_TRACKS_PER_ARTIST,
            'sub-headliner': 17,
            'mid-tier': MIN_TRACKS_PER_ARTIST,
            undercard: 5,
          },
        };

        expect(() => searchTracksSchema.parse(validRequest)).not.toThrow();
      });

      it.each([0, 26, 2.5, '3'])('rejects tierCounts when any tier is %p', (undercard) => {
        const invalidRequest = {
          ...baseRequest,
          trackCountMode: 'custom-per-tier' as const,
          tierCounts: {
            headliner: 10,
            'sub-headliner': 5,
            'mid-tier': 3,
            undercard,
          },
        };

        expect(() => searchTracksSchema.parse(invalidRequest)).toThrow();
      });

      it('accepts per-artist counts across the range', () => {
        const validRequest = {
          ...baseRequest,
          trackCountMode: 'per-artist' as const,
          perArtistCounts: {
            Phoenix: MIN_TRACKS_PER_ARTIST,
            Alvvays: 17,
            'Men I Trust': MAX_TRACKS_PER_ARTIST,
          },
        };

        expect(() => searchTracksSchema.parse(validRequest)).not.toThrow();
      });

      it.each([0, 26, 1.5, '3'])('rejects per-artist count %p', (badCount) => {
        const invalidRequest = {
          ...baseRequest,
          trackCountMode: 'per-artist' as const,
          perArtistCounts: { Phoenix: 5, Alvvays: badCount },
        };

        expect(() => searchTracksSchema.parse(invalidRequest)).toThrow();
      });
    });

    it('preserves artist count keys that collide with object prototype names', () => {
      const request = JSON.parse(
        '{"artists":[{"name":"__proto__"}],"trackCountMode":"per-artist","perArtistCounts":{"__proto__":5}}'
      );

      const result = searchTracksSchema.parse(request);

      expect(Object.hasOwn(result.perArtistCounts!, '__proto__')).toBe(true);
      expect(result.perArtistCounts!.__proto__).toBe(5);
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
