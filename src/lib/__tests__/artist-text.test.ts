import { describe, it, expect } from 'vitest';
import {
  parseArtistText,
  MAX_ARTIST_NAME_LENGTH,
  MAX_ARTIST_TEXT_LENGTH,
  DEFAULT_TEXT_ARTIST_TRACK_COUNT,
} from '../artist-text';
import { MAX_ARTISTS_PER_SEARCH } from '../constants';

describe('parseArtistText', () => {
  describe('basic parsing', () => {
    it('parses one artist per line, preserving input order', () => {
      const result = parseArtistText('Alvvays\nThe Beths\nMen I Trust');
      expect(result.artists.map((a) => a.name)).toEqual(['Alvvays', 'The Beths', 'Men I Trust']);
      expect(result.errorCode).toBeNull();
      expect(result.duplicates).toEqual([]);
      expect(result.invalidNames).toEqual([]);
    });

    it('trims whitespace from names and skips blank lines', () => {
      const result = parseArtistText('  Alvvays  \n\n\t\n   \nThe Beths\n \n ');
      expect(result.artists.map((a) => a.name)).toEqual(['Alvvays', 'The Beths']);
    });

    it('handles Windows line endings (\\r\\n)', () => {
      const result = parseArtistText('Alvvays\r\nThe Beths\r\n');
      expect(result.artists.map((a) => a.name)).toEqual(['Alvvays', 'The Beths']);
    });

    it('preserves punctuation in names', () => {
      const result = parseArtistText('Panic! At The Disco\nAnderson .Paak\nP!nk');
      expect(result.artists.map((a) => a.name)).toEqual([
        'Panic! At The Disco',
        'Anderson .Paak',
        'P!nk',
      ]);
    });

    it('preserves international (non-ASCII) names exactly', () => {
      const result = parseArtistText('Sigur Rós\nBjörk\nБи-2\n東京事変');
      expect(result.artists.map((a) => a.name)).toEqual(['Sigur Rós', 'Björk', 'Би-2', '東京事変']);
    });

    it('returns artists with only the name field set (no tier/weight/reasoning)', () => {
      const result = parseArtistText('Alvvays');
      expect(result.artists).toEqual([{ name: 'Alvvays' }]);
      expect(result.artists[0].tier).toBeUndefined();
      expect(result.artists[0].weight).toBeUndefined();
      expect(result.artists[0].reasoning).toBeUndefined();
    });
  });

  describe('no delimiter splitting', () => {
    it('does not split names on commas', () => {
      const result = parseArtistText('Crosby, Stills & Nash');
      expect(result.artists).toEqual([{ name: 'Crosby, Stills & Nash' }]);
    });

    it('does not split names on ampersands', () => {
      const result = parseArtistText('Simon & Garfunkel');
      expect(result.artists).toEqual([{ name: 'Simon & Garfunkel' }]);
    });

    it('does not split names on slashes', () => {
      const result = parseArtistText('AC/DC');
      expect(result.artists).toEqual([{ name: 'AC/DC' }]);
    });

    it('does not split names on the word "and"', () => {
      const result = parseArtistText('Florence and the Machine');
      expect(result.artists).toEqual([{ name: 'Florence and the Machine' }]);
    });
  });

  describe('deduplication', () => {
    it('removes case-insensitive exact duplicates and keeps the first spelling', () => {
      const result = parseArtistText('The Beths\nthe beths\nTHE BETHS');
      expect(result.artists).toEqual([{ name: 'The Beths' }]);
      expect(result.duplicates).toEqual(['the beths', 'THE BETHS']);
      expect(result.errorCode).toBeNull();
    });

    it('keeps the first spelling even when later ones differ in case', () => {
      const result = parseArtistText('alvvays\nAlvvays');
      expect(result.artists).toEqual([{ name: 'alvvays' }]);
      expect(result.duplicates).toEqual(['Alvvays']);
    });

    it('does not treat distinct names as duplicates', () => {
      const result = parseArtistText('The Beths\nThe Beths Band');
      expect(result.artists.map((a) => a.name)).toEqual(['The Beths', 'The Beths Band']);
      expect(result.duplicates).toEqual([]);
    });
  });

  describe('invalid input', () => {
    it('reports blank input as empty', () => {
      const result = parseArtistText('');
      expect(result.artists).toEqual([]);
      expect(result.errorCode).toBe('empty');
    });

    it('reports whitespace-only input as empty', () => {
      const result = parseArtistText('   \n\t\n  ');
      expect(result.errorCode).toBe('empty');
    });

    it('reports overlong names instead of silently truncating or dropping them', () => {
      const tooLong = 'A'.repeat(MAX_ARTIST_NAME_LENGTH + 1);
      const result = parseArtistText(`Alvvays\n${tooLong}`);
      expect(result.artists.map((a) => a.name)).toEqual(['Alvvays']);
      expect(result.invalidNames).toEqual([tooLong]);
      expect(result.errorCode).toBeNull(); // at least one valid artist remains
    });

    it('reports empty when every line is invalid', () => {
      const tooLong = 'B'.repeat(MAX_ARTIST_NAME_LENGTH + 1);
      const result = parseArtistText(tooLong);
      expect(result.artists).toEqual([]);
      expect(result.invalidNames).toEqual([tooLong]);
      expect(result.errorCode).toBe('empty');
    });

    it('accepts exactly 100-character names', () => {
      const name = 'C'.repeat(MAX_ARTIST_NAME_LENGTH);
      const result = parseArtistText(name);
      expect(result.artists).toEqual([{ name }]);
      expect(result.invalidNames).toEqual([]);
    });

    it('bounds raw input size with a reported error (never silent truncation)', () => {
      const huge = 'x'.repeat(MAX_ARTIST_TEXT_LENGTH + 1);
      const result = parseArtistText(huge);
      expect(result.errorCode).toBe('input-too-long');
      expect(result.artists).toEqual([]);
    });

    it('accepts input at exactly the raw size bound', () => {
      const lines: string[] = [];
      let total = 0;
      while (total < MAX_ARTIST_TEXT_LENGTH) {
        const line = 'Artist';
        if (total + line.length + 1 > MAX_ARTIST_TEXT_LENGTH) break;
        lines.push(line);
        total += line.length + 1;
      }
      const raw = lines.join('\n');
      expect(raw.length).toBeLessThanOrEqual(MAX_ARTIST_TEXT_LENGTH);
      const result = parseArtistText(raw);
      expect(result.errorCode).toBeNull();
    });
  });

  describe('artist count limits', () => {
    it('accepts exactly 150 unique artists', () => {
      const raw = Array.from({ length: MAX_ARTISTS_PER_SEARCH }, (_, i) => `Artist ${i + 1}`).join(
        '\n'
      );
      const result = parseArtistText(raw);
      expect(result.artists).toHaveLength(MAX_ARTISTS_PER_SEARCH);
      expect(result.errorCode).toBeNull();
    });

    it('rejects 151 unique artists with too-many-artists', () => {
      const raw = Array.from(
        { length: MAX_ARTISTS_PER_SEARCH + 1 },
        (_, i) => `Artist ${i + 1}`
      ).join('\n');
      const result = parseArtistText(raw);
      expect(result.artists).toHaveLength(MAX_ARTISTS_PER_SEARCH + 1);
      expect(result.errorCode).toBe('too-many-artists');
    });

    it('counts duplicates once toward the cap', () => {
      const raw = Array.from({ length: MAX_ARTISTS_PER_SEARCH }, () => 'Same Artist').join('\n');
      const result = parseArtistText(raw);
      expect(result.artists).toHaveLength(1);
      expect(result.errorCode).toBeNull();
    });
  });

  describe('text defaults', () => {
    it('defaults manual-entry lineups to 5 tracks per artist', () => {
      expect(DEFAULT_TEXT_ARTIST_TRACK_COUNT).toBe(5);
    });
  });
});
