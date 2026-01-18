import { Track, Artist, MusicPlatform } from '@/types';

/**
 * Mock track data for development and testing
 *
 * This data includes:
 * - Tracks representing all artist tiers (headliner, sub-headliner, mid-tier, undercard)
 * - Edge cases: long names, missing artwork, no preview URL
 * - Realistic Spotify URIs and URLs (platform-agnostic format)
 *
 * Use by setting USE_MOCK_DATA=true in .env
 */
export const mockTracks: Track[] = [
  // HEADLINERS (10 tracks each in real usage)
  {
    name: 'Blinding Lights',
    id: '0VjIjW4GlUZAMYd2vXMi3b',
    uri: 'spotify:track:0VjIjW4GlUZAMYd2vXMi3b',
    artist: 'The Weeknd',
    artistId: '1Xyo4u8uXC1ZmMpatF05PJ',
    album: 'After Hours',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
    duration: 200040,
    previewUrl: 'https://p.scdn.co/mp3-preview/6b0a5a4e3e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
    platform: 'spotify',
  },
  {
    name: 'Save Your Tears',
    id: '5QO79kh1waicV47BqGRL3g',
    uri: 'spotify:track:5QO79kh1waicV47BqGRL3g',
    artist: 'The Weeknd',
    artistId: '1Xyo4u8uXC1ZmMpatF05PJ',
    album: 'After Hours',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
    duration: 215626,
    previewUrl: 'https://p.scdn.co/mp3-preview/7b0a5a4e3e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/5QO79kh1waicV47BqGRL3g',
    platform: 'spotify',
  },
  {
    name: 'Starboy',
    id: '7MXVkk9YMctZqd1Srtv4MB',
    uri: 'spotify:track:7MXVkk9YMctZqd1Srtv4MB',
    artist: 'The Weeknd',
    artistId: '1Xyo4u8uXC1ZmMpatF05PJ',
    album: 'Starboy',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b2734718e2b124f79258be7bc452',
    duration: 230453,
    previewUrl: 'https://p.scdn.co/mp3-preview/8b0a5a4e3e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/7MXVkk9YMctZqd1Srtv4MB',
    platform: 'spotify',
  },
  {
    name: 'Anti-Hero',
    id: '0V3wPSX9ygBnCm8psDIegu',
    uri: 'spotify:track:0V3wPSX9ygBnCm8psDIegu',
    artist: 'Taylor Swift',
    artistId: '06HL4z0CvFAxyc27GXpf02',
    album: 'Midnights',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae0f5',
    duration: 200690,
    previewUrl: 'https://p.scdn.co/mp3-preview/9b0a5a4e3e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/0V3wPSX9ygBnCm8psDIegu',
    platform: 'spotify',
  },
  {
    name: 'Cruel Summer',
    id: '1BxfuPKGuaTgP7aM0Bbdwr',
    uri: 'spotify:track:1BxfuPKGuaTgP7aM0Bbdwr',
    artist: 'Taylor Swift',
    artistId: '06HL4z0CvFAxyc27GXpf02',
    album: 'Lover',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b273e787cffec20aa2a396a61647',
    duration: 178426,
    previewUrl: null, // Edge case: no preview URL
    platformUrl: 'https://open.spotify.com/track/1BxfuPKGuaTgP7aM0Bbdwr',
    platform: 'spotify',
  },
  {
    name: 'Shake It Off',
    id: '0cqRj7pUJDkTCEsJkx8snD',
    uri: 'spotify:track:0cqRj7pUJDkTCEsJkx8snD',
    artist: 'Taylor Swift',
    artistId: '06HL4z0CvFAxyc27GXpf02',
    album: '1989',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b273904445d70d04eb24d6bb79ac',
    duration: 219200,
    previewUrl: 'https://p.scdn.co/mp3-preview/10b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/0cqRj7pUJDkTCEsJkx8snD',
    platform: 'spotify',
  },

  // SUB-HEADLINERS (5 tracks each in real usage)
  {
    name: 'Heat Waves',
    id: '02MWAaffLxlfxAUY7c5dvx',
    uri: 'spotify:track:02MWAaffLxlfxAUY7c5dvx',
    artist: 'Glass Animals',
    artistId: '4yvcSjfu4PC0CYQyLy4wSq',
    album: 'Dreamland',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b2739e495fb707973f3390850eea',
    duration: 238805,
    previewUrl: 'https://p.scdn.co/mp3-preview/11b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/02MWAaffLxlfxAUY7c5dvx',
    platform: 'spotify',
  },
  {
    name: 'Gooey',
    id: '2UazAtjfzqBF0Nwf9AmHd8',
    uri: 'spotify:track:2UazAtjfzqBF0Nwf9AmHd8',
    artist: 'Glass Animals',
    artistId: '4yvcSjfu4PC0CYQyLy4wSq',
    album: 'ZABA',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b2739e495fb707973f3390850eea',
    duration: 267626,
    previewUrl: 'https://p.scdn.co/mp3-preview/12b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/2UazAtjfzqBF0Nwf9AmHd8',
    platform: 'spotify',
  },
  {
    name: 'Tokyo Drifting',
    id: '4k4xEp2hJfW5mDO7IM5eJK',
    uri: 'spotify:track:4k4xEp2hJfW5mDO7IM5eJK',
    artist: 'Glass Animals',
    artistId: '4yvcSjfu4PC0CYQyLy4wSq',
    album: 'Dreamland',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b2739e495fb707973f3390850eea',
    duration: 205893,
    previewUrl: 'https://p.scdn.co/mp3-preview/13b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/4k4xEp2hJfW5mDO7IM5eJK',
    platform: 'spotify',
  },
  {
    name: 'Rather Be',
    id: '2Gtxy2IqmvJGvP85PoZV7M',
    uri: 'spotify:track:2Gtxy2IqmvJGvP85PoZV7M',
    artist: 'Clean Bandit',
    artistId: '6MDME20pz9RveH9rEXvrOM',
    album: 'New Eyes',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 227626,
    previewUrl: 'https://p.scdn.co/mp3-preview/14b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/2Gtxy2IqmvJGvP85PoZV7M',
    platform: 'spotify',
  },
  {
    name: 'Symphony (feat. Zara Larsson)',
    id: '5kJDqXNhAkuGNpr3TqBukL',
    uri: 'spotify:track:5kJDqXNhAkuGNpr3TqBukL',
    artist: 'Clean Bandit', // Edge case: long artist name with feature
    artistId: '6MDME20pz9RveH9rEXvrOM',
    album: 'What Is Love?',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 212093,
    previewUrl: 'https://p.scdn.co/mp3-preview/15b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/5kJDqXNhAkuGNpr3TqBukL',
    platform: 'spotify',
  },

  // MID-TIER (3 tracks each in real usage)
  {
    name: 'Pumped Up Kicks',
    id: '7w87IxuO7BDcJ3YUqCyMTT',
    uri: 'spotify:track:7w87IxuO7BDcJ3YUqCyMTT',
    artist: 'Foster The People',
    artistId: '7gP3bB2nilZXLfPHJhMdvc',
    album: 'Torches',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 239600,
    previewUrl: 'https://p.scdn.co/mp3-preview/16b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/7w87IxuO7BDcJ3YUqCyMTT',
    platform: 'spotify',
  },
  {
    name: 'Sit Next to Me',
    id: '0Y1XGNaAQ9kTRIkjaMMwcT',
    uri: 'spotify:track:0Y1XGNaAQ9kTRIkjaMMwcT',
    artist: 'Foster The People',
    artistId: '7gP3bB2nilZXLfPHJhMdvc',
    album: 'Sacred Hearts Club',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 262266,
    previewUrl: 'https://p.scdn.co/mp3-preview/17b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/0Y1XGNaAQ9kTRIkjaMMwcT',
    platform: 'spotify',
  },
  {
    name: 'Helena Beat',
    id: '4npv0xZO9fVLBmDS2XP9Bw',
    uri: 'spotify:track:4npv0xZO9fVLBmDS2XP9Bw',
    artist: 'Foster The People',
    artistId: '7gP3bB2nilZXLfPHJhMdvc',
    album: 'Torches',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 272826,
    previewUrl: 'https://p.scdn.co/mp3-preview/18b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/4npv0xZO9fVLBmDS2XP9Bw',
    platform: 'spotify',
  },
  {
    name: 'Somebody That I Used to Know',
    id: '4JehYebiI9JE8sR8MisGVb',
    uri: 'spotify:track:4JehYebiI9JE8sR8MisGVb',
    artist: 'Gotye',
    artistId: '0Z8R3ixvOPfk9A7KPCfZw5',
    album: 'Making Mirrors',
    albumArtwork: null, // Edge case: missing artwork
    duration: 244960,
    previewUrl: 'https://p.scdn.co/mp3-preview/19b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/4JehYebiI9JE8sR8MisGVb',
    platform: 'spotify',
  },
  {
    name: 'Hearts a Mess',
    id: '0bvH9rNTFMnIGo8pDMkbNP',
    uri: 'spotify:track:0bvH9rNTFMnIGo8pDMkbNP',
    artist: 'Gotye',
    artistId: '0Z8R3ixvOPfk9A7KPCfZw5',
    album: 'Like Drawing Blood',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 226000,
    previewUrl: null, // Edge case: no preview
    platformUrl: 'https://open.spotify.com/track/0bvH9rNTFMnIGo8pDMkbNP',
    platform: 'spotify',
  },
  {
    name: 'Eyes Wide Open',
    id: '3bGSeQ6LUXXN1W4vHyDfPo',
    uri: 'spotify:track:3bGSeQ6LUXXN1W4vHyDfPo',
    artist: 'Gotye',
    artistId: '0Z8R3ixvOPfk9A7KPCfZw5',
    album: 'Making Mirrors',
    albumArtwork: null, // Edge case: missing artwork
    duration: 267200,
    previewUrl: 'https://p.scdn.co/mp3-preview/20b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/3bGSeQ6LUXXN1W4vHyDfPo',
    platform: 'spotify',
  },

  // UNDERCARD (1 track each in real usage)
  {
    name: 'This Is What It Feels Like',
    id: '4lWp9Jbt6jCDZPQqbsEqHG',
    uri: 'spotify:track:4lWp9Jbt6jCDZPQqbsEqHG',
    artist: 'Armin van Buuren',
    artistId: '0SfsnGyD8FpIN4U4WCkBZ5',
    album: 'Intense',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 275000,
    previewUrl: 'https://p.scdn.co/mp3-preview/21b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/4lWp9Jbt6jCDZPQqbsEqHG',
    platform: 'spotify',
  },
  {
    name: 'Tidal Wave',
    id: '1XYwNiKjAhPJNbCJBNpYZU',
    uri: 'spotify:track:1XYwNiKjAhPJNbCJBNpYZU',
    artist: 'Sub Focus',
    artistId: '1x5sNLfJFgZ1Cq9SfxGCF3',
    album: 'Torus',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 245333,
    previewUrl: 'https://p.scdn.co/mp3-preview/22b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/1XYwNiKjAhPJNbCJBNpYZU',
    platform: 'spotify',
  },
  {
    name: 'Edge Case: Very Long Song Title That Should Test How The UI Handles Overflow Text In The Track Display Component',
    id: '1234567890ABCDEFGHIJKL',
    uri: 'spotify:track:1234567890ABCDEFGHIJKL',
    artist: 'Edge Case Artist With An Extremely Long Name That Tests UI Boundaries',
    artistId: '0EdgeCaseArtistId123456',
    album:
      'Edge Case Album: Testing Very Long Album Names and How They Display In Various UI Components',
    albumArtwork: 'https://i.scdn.co/image/ab67616d0000b273edgecaseedgecaseedgecase',
    duration: 543210, // Edge case: very long song (9+ minutes)
    previewUrl: 'https://p.scdn.co/mp3-preview/23b0a5a4e3e3e3e3e3e3e3e3e3e3e3e',
    platformUrl: 'https://open.spotify.com/track/1234567890ABCDEFGHIJKL',
    platform: 'spotify',
  },
  {
    name: 'Minimal',
    id: '9876543210ZYXWVUTSRQPO',
    uri: 'spotify:track:9876543210ZYXWVUTSRQPO',
    artist: 'M', // Edge case: very short artist name
    artistId: '0MinimalArtistId9876543',
    album: 'M',
    albumArtwork: 'https://placehold.co/400x400?text=album',
    duration: 60000, // Edge case: very short song (1 minute)
    previewUrl: null,
    platformUrl: 'https://open.spotify.com/track/9876543210ZYXWVUTSRQPO',
    platform: 'spotify',
  },
];

/**
 * Get a subset of mock tracks for testing
 * @param count Number of tracks to return (default: all)
 * @returns Track[]
 */
export function getMockTracks(count?: number): Track[] {
  if (typeof count === 'number' && count >= 0) {
    return mockTracks.slice(0, count);
  }
  return mockTracks;
}

/**
 * Mock artist data for Vision API style (no weights/tiers)
 *
 * Used by /api/analyze when USE_MOCK_DATA=true and IMAGE_ANALYSIS_PROVIDER=vision
 */
export const mockVisionArtists: Artist[] = [
  { name: 'Tame Impala' },
  { name: 'The Strokes' },
  { name: 'Billie Eilish' },
  { name: 'Tyler, The Creator' },
  { name: 'Arctic Monkeys' },
  { name: 'Frank Ocean' },
  { name: 'Disclosure' },
  { name: 'LCD Soundsystem' },
  { name: 'Childish Gambino' },
  { name: 'ODESZA' },
  { name: 'Vampire Weekend' },
  { name: 'The 1975' },
  { name: 'Khruangbin' },
  { name: 'Japanese Breakfast' },
  { name: 'Wet Leg' },
  { name: 'boygenius' },
  { name: 'Turnstile' },
  { name: 'Fontaines D.C.' },
  { name: 'Remi Wolf' },
  { name: 'Wallows' },
];

/**
 * Mock artist data for Gemini API style (with weights and tiers)
 *
 * Used by /api/analyze when USE_MOCK_DATA=true and IMAGE_ANALYSIS_PROVIDER=gemini
 */
export const mockGeminiArtists: Artist[] = [
  {
    name: 'Tame Impala',
    weight: 10,
    tier: 'headliner',
    reasoning: 'Largest text at top of poster',
  },
  {
    name: 'The Strokes',
    weight: 10,
    tier: 'headliner',
    reasoning: 'Large text, prominent position',
  },
  {
    name: 'Billie Eilish',
    weight: 9,
    tier: 'sub-headliner',
    reasoning: 'Second line, large font',
  },
  {
    name: 'Tyler, The Creator',
    weight: 9,
    tier: 'sub-headliner',
    reasoning: 'Second tier positioning',
  },
  {
    name: 'Arctic Monkeys',
    weight: 8,
    tier: 'sub-headliner',
    reasoning: 'Third line, still prominent',
  },
  {
    name: 'Frank Ocean',
    weight: 8,
    tier: 'sub-headliner',
    reasoning: 'Third tier, notable size',
  },
  {
    name: 'Disclosure',
    weight: 7,
    tier: 'mid-tier',
    reasoning: 'Mid-tier placement',
  },
  {
    name: 'LCD Soundsystem',
    weight: 7,
    tier: 'mid-tier',
    reasoning: 'Medium font size',
  },
  {
    name: 'Childish Gambino',
    weight: 6,
    tier: 'mid-tier',
    reasoning: 'Middle section',
  },
  {
    name: 'ODESZA',
    weight: 6,
    tier: 'mid-tier',
    reasoning: 'Medium prominence',
  },
  {
    name: 'Vampire Weekend',
    weight: 5,
    tier: 'mid-tier',
    reasoning: 'Mid-lower section',
  },
  {
    name: 'The 1975',
    weight: 5,
    tier: 'mid-tier',
    reasoning: 'Standard font size',
  },
  {
    name: 'Khruangbin',
    weight: 4,
    tier: 'undercard',
    reasoning: 'Lower third of lineup',
  },
  {
    name: 'Japanese Breakfast',
    weight: 4,
    tier: 'undercard',
    reasoning: 'Smaller text',
  },
  {
    name: 'Wet Leg',
    weight: 3,
    tier: 'undercard',
    reasoning: 'Bottom section',
  },
  {
    name: 'boygenius',
    weight: 3,
    tier: 'undercard',
    reasoning: 'Small font near bottom',
  },
  { name: 'Turnstile', weight: 2, tier: 'undercard', reasoning: 'Lower tier' },
  {
    name: 'Fontaines D.C.',
    weight: 2,
    tier: 'undercard',
    reasoning: 'Small text',
  },
  {
    name: 'Remi Wolf',
    weight: 1,
    tier: 'undercard',
    reasoning: 'Smallest text at bottom',
  },
  {
    name: 'Wallows',
    weight: 1,
    tier: 'undercard',
    reasoning: 'Bottom tier placement',
  },
];

/**
 * Get mock tracks for a specific platform.
 * Transforms the mock data to use platform-specific URLs and identifiers.
 *
 * @param platform - The music platform ('spotify' or 'apple-music')
 * @returns Array of Track objects for the specified platform
 */
export function getMockTracksForPlatform(platform: MusicPlatform): Track[] {
  if (platform === 'spotify') {
    return mockTracks;
  }

  // Transform to Apple Music format
  return mockTracks.map((track, index) => ({
    ...track,
    id: `${1000000000 + index}`, // Apple Music uses numeric IDs
    uri: undefined, // Apple Music doesn't use URIs
    platformUrl: `https://music.apple.com/us/song/${track.name.toLowerCase().replace(/\s+/g, '-')}/${1000000000 + index}`,
    platform: 'apple-music' as const,
  }));
}
