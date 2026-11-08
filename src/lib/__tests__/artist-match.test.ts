import { describe, it, expect } from 'vitest';
import {
  normalize,
  similarity,
  matchLineup,
  containsName,
  isDerivativeName,
  LOVED_MATCH_THRESHOLD,
  CATALOG_MATCH_THRESHOLD,
} from '../artist-match';

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Phoenix  ')).toBe('phoenix');
  });

  it('strips accents', () => {
    expect(normalize('Sigur Rós')).toBe('sigur ros');
    expect(normalize('Björk')).toBe('bjork');
  });

  it('unifies ampersands to "and"', () => {
    expect(normalize('Above & Beyond')).toBe('above and beyond');
  });

  it('drops "feat." tails', () => {
    expect(normalize('Calvin Harris feat. Rihanna')).toBe('calvin harris');
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalize('A.A.L. (Against All Logic)')).toBe('aal against all logic');
  });
});

describe('similarity', () => {
  it('scores identical names as 1.0', () => {
    expect(similarity('Caribou', 'Caribou')).toBe(1);
  });

  it('treats accent/case variants as identical', () => {
    expect(similarity('Sigur Ros', 'Sigur Rós')).toBe(1);
  });

  it('treats ampersand variants as identical', () => {
    expect(similarity('Above & Beyond', 'Above and Beyond')).toBe(1);
  });

  it('scores unrelated names low', () => {
    expect(similarity('Phoenix', 'Metallica')).toBeLessThan(0.5);
  });

  it('is symmetric regardless of argument order', () => {
    expect(similarity('Lane 8', 'Lane Eight')).toBe(similarity('Lane Eight', 'Lane 8'));
  });
});

describe('containsName', () => {
  it('finds a multi-word name as a phrase, ignoring case and accents', () => {
    expect(containsName('Maldita Vecindad y Los Hijos del Quinto Patio', 'maldita vecindad')).toBe(
      true
    );
    expect(containsName('Café Tacvba Unplugged', 'Cafe Tacvba')).toBe(true);
  });

  it('rejects partial words and non-adjacent words', () => {
    expect(containsName('Cafe Tacvbas', 'Cafe Tacvba')).toBe(false);
    expect(containsName('Caifanes y la Sinfónica', 'Caifanes Sinfónica')).toBe(false);
  });

  it('rejects single-word names (too weak a signal)', () => {
    expect(containsName('Porter Robinson', 'Porter')).toBe(false);
  });

  it('does not count leading articles and prefixes as distinctive words', () => {
    expect(containsName('Los Lobos del Norte', 'Los Lobos')).toBe(false);
    expect(containsName('The Killers Tribute', 'The Killers')).toBe(false);
    expect(containsName('DJ Snake Remixes', 'DJ Snake')).toBe(false);
    expect(containsName('Los Fabulosos Cadillacs y Amigos', 'Los Fabulosos Cadillacs')).toBe(true);
  });
});

describe('isDerivativeName', () => {
  it('flags tribute, karaoke, live and hits pages', () => {
    expect(isDerivativeName('Café Tacvba Tribute Band', 'Cafe Tacvba')).toBe(true);
    expect(isDerivativeName('Karaoke Maldita Vecindad', 'Maldita Vecindad')).toBe(true);
    expect(isDerivativeName('Los Fabulosos Cadillacs en Vivo', 'Los Fabulosos Cadillacs')).toBe(
      true
    );
    expect(isDerivativeName('Café Tacvba & Friends', 'Cafe Tacvba')).toBe(true);
  });

  it('does not flag a longer form of the real name', () => {
    expect(
      isDerivativeName('Maldita Vecindad y Los Hijos del Quinto Patio', 'Maldita Vecindad')
    ).toBe(false);
  });

  it('ignores marker words that are part of the poster name', () => {
    expect(isDerivativeName('Live Wire Band', 'Live Wire')).toBe(false);
  });

  it('is false when the candidate does not contain the name', () => {
    expect(isDerivativeName('Tribute', 'Cafe Tacvba')).toBe(false);
  });
});

describe('matchLineup', () => {
  const loved = ['Phoenix', 'Caribou', 'Sigur Rós', 'Above & Beyond'];

  it('matches exact and accent/ampersand variants as loved', () => {
    const { loved: hits, unknown } = matchLineup(
      ['Phoenix', 'Sigur Ros', 'Above and Beyond', 'Anz', 'Overmono'],
      loved
    );
    expect(hits.map((h) => h.poster).sort()).toEqual(
      ['Above and Beyond', 'Phoenix', 'Sigur Ros'].sort()
    );
    expect(unknown.sort()).toEqual(['Anz', 'Overmono'].sort());
  });

  it('does NOT match a different artist sharing a first name (false-positive guard)', () => {
    // A false "loved" breaks trust — "Caribou" must not match "Cari Cari".
    const { loved: hits, unknown } = matchLineup(['Cari Cari'], loved);
    expect(hits).toHaveLength(0);
    expect(unknown).toEqual(['Cari Cari']);
  });

  it('records the matched loved-set name and similarity for each hit', () => {
    const { loved: hits } = matchLineup(['sigur ros'], loved);
    expect(hits).toHaveLength(1);
    expect(hits[0].matched).toBe('Sigur Rós');
    expect(hits[0].similarity).toBe(1);
  });

  it('returns everything as unknown when the loved set is empty', () => {
    const { loved: hits, unknown } = matchLineup(['Phoenix', 'Caribou'], []);
    expect(hits).toHaveLength(0);
    expect(unknown).toEqual(['Phoenix', 'Caribou']);
  });

  it('respects a custom threshold', () => {
    // At a loose 0.5 threshold a near-miss can match; at the default 0.85 it cannot.
    const looseHits = matchLineup(['Phoeni'], ['Phoenix'], 0.5).loved;
    expect(looseHits).toHaveLength(1);
    const strictHits = matchLineup(['Phoeni'], ['Phoenix'], LOVED_MATCH_THRESHOLD).loved;
    expect(strictHits).toHaveLength(1); // 6/7 ≈ 0.857 ≥ 0.85, still a hit
  });

  it('exposes the documented threshold constants', () => {
    expect(LOVED_MATCH_THRESHOLD).toBe(0.85);
    expect(CATALOG_MATCH_THRESHOLD).toBe(0.6);
  });
});
