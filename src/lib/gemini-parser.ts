import { Artist } from '@/types';

/**
 * Shared parser for Gemini responses.
 * Handles both new object format { eventName, artists } and legacy array format [...].
 */
function normalizeArtists(input: unknown): Artist[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { name?: unknown }).name === 'string' &&
        (item as { name: string }).name.trim().length > 0
    )
    .map((item) => {
      const validTiers = ['headliner', 'sub-headliner', 'mid-tier', 'undercard'] as const;
      const tier = validTiers.find((t) => t === item.tier);
      return {
        name: (item.name as string).trim(),
        weight: typeof item.weight === 'number' ? item.weight : undefined,
        tier,
        reasoning: typeof item.reasoning === 'string' ? item.reasoning : undefined,
      };
    });
}

export function parseGeminiResponse(responseText: string): {
  artists: Artist[];
  eventName?: string;
} {
  try {
    // Try to extract JSON from markdown code blocks first
    const jsonBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonBlockMatch
      ? jsonBlockMatch[1].trim()
      : // Try to find raw JSON object or array
        (responseText.match(/\{\s*"eventName"[\s\S]*?\}\s*\]?\s*\}/)?.[0] ??
        responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/)?.[0] ??
        responseText);

    const parsed = JSON.parse(jsonStr);

    // New object format: { eventName, artists }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.artists)) {
      return {
        artists: normalizeArtists(parsed.artists),
        eventName:
          typeof parsed.eventName === 'string' && parsed.eventName.trim()
            ? parsed.eventName.trim()
            : undefined,
      };
    }

    // Legacy array format: [...]
    if (Array.isArray(parsed)) {
      return { artists: normalizeArtists(parsed) };
    }

    // Single object — shouldn't happen, but handle gracefully
    return { artists: normalizeArtists([parsed]) };
  } catch (error) {
    console.error('[GeminiParser] Failed to parse response:', responseText);
    console.error('[GeminiParser] Parse error:', error);

    // Last resort: Try to extract artist names from any JSON-like structure
    const artistNameMatches = responseText.matchAll(/"name":\s*"([^"]+)"/g);
    const fallbackArtists: Artist[] = [];

    for (const match of artistNameMatches) {
      fallbackArtists.push({
        name: match[1],
        weight: 5,
        tier: 'mid-tier',
        reasoning: 'Fallback parse - weight may be inaccurate',
      });
    }

    if (fallbackArtists.length > 0) {
      console.log('[GeminiParser] Used fallback parsing, extracted:', fallbackArtists);
      return { artists: fallbackArtists };
    }

    throw new Error('Could not parse Gemini response as JSON');
  }
}
