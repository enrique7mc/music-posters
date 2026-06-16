import { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedPlatformOrDev, getPlatformAccessTokenOrDev } from '@/lib/auth';
import { isDevModeAvailable, getDevConfig } from '@/lib/dev-mode';
import { getMusicPlatform } from '@/lib/music-platform';
import { AppleMusicPlatformService } from '@/lib/music-platform/apple-music-platform';
import { generateDeveloperToken } from '@/lib/apple-music-auth';
import { personalizeLineup } from '@/lib/personalize';
import { PersonalizeResponse, MusicPlatform } from '@/types';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';
import { personalizeSchema, validateRequest } from '@/lib/validation';

/**
 * POST /api/personalize
 *
 * Tags a poster lineup with the authed user's taste relationship to each artist
 * (loved = already in their library; gem = likely-to-love unknown). Returns one
 * annotated flat Artist[] — the client renders the lineup instantly and merges
 * these affinity fields when this single (~10s) response lands.
 *
 * Hardening:
 * - Validation strips any client-supplied affinity metadata and caps artist
 *   count + name length (see personalizeSchema).
 * - The engine never throws on a sub-failure; on library/Gemini errors it returns
 *   a degraded result and the client hides the loved/gems UI.
 *
 * Apple Music only for now (it's the platform exposing a user library). Other
 * platforms return the plain lineup with degraded=true.
 */
export const config = {
  // The library scan + Gemini gems pass can take ~10s; give the function headroom.
  // Vercel Hobby permits up to 60s; create-playlist already ships maxDuration: 30.
  maxDuration: 30,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PersonalizeResponse | { error: string; details?: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const devConfig = isDevModeAvailable() ? getDevConfig() : null;
  const authenticatedPlatform = getAuthenticatedPlatformOrDev(req);
  const useMock = devConfig?.mockTrackSearch ?? false;

  if (!authenticatedPlatform && !useMock) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Rate limit after the auth check so anonymous traffic can't burn legit users' slots.
  if (applyRateLimit(req, res, RateLimitPresets.moderate())) {
    return; // response already sent
  }

  let validated;
  try {
    validated = validateRequest(personalizeSchema, req.body);
  } catch (error: any) {
    console.error('[Personalize API] Validation error:', error.message);
    return res.status(400).json({ error: 'Invalid request data', details: error.message });
  }

  const { artists, platform: requestedPlatform } = validated;

  if (requestedPlatform && authenticatedPlatform && requestedPlatform !== authenticatedPlatform) {
    return res.status(401).json({
      error: `Authenticated with ${authenticatedPlatform}. Please log in to ${requestedPlatform}.`,
    });
  }

  const platform: MusicPlatform =
    (requestedPlatform as MusicPlatform) || authenticatedPlatform || 'apple-music';

  // Dev mock: fabricate loved/gem tags (no external calls) so the loved/gems
  // header can be exercised without a real library or Gemini. mockDelayMs lets
  // you also feel the "personalizing…" state.
  if (useMock) {
    console.log('[DEV MODE] Personalize mocked — fabricating loved/gem tags');
    const { mockPersonalize } = await import('@/lib/mock-data');
    const delay = devConfig?.mockDelayMs ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return res.status(200).json(mockPersonalize(artists));
  }

  const accessToken = getPlatformAccessTokenOrDev(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const platformService = getMusicPlatform(platform);

    // Apple Music needs a developer token before any catalog/library call.
    if (platform === 'apple-music') {
      (platformService as AppleMusicPlatformService).setDeveloperToken(generateDeveloperToken());
    }

    const result = await personalizeLineup(artists, platformService, accessToken);

    console.log(
      `[Personalize API] ${platform}: ${result.lovedCount} loved, ${result.gemCount} gems` +
        `${result.degraded ? ' (degraded)' : ''}`
    );

    return res.status(200).json(result);
  } catch (error: any) {
    // The engine is built to degrade rather than throw, so reaching here is rare
    // (e.g. developer-token generation failed). Never 500 the user out of their
    // lineup — return it plain so the review screen still works.
    console.error('[Personalize API] Unexpected error, returning plain lineup:', error);
    return res.status(200).json({ artists, lovedCount: 0, gemCount: 0, degraded: true });
  }
}
