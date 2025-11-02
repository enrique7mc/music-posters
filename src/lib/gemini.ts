import { GoogleGenerativeAI } from '@google/generative-ai';
import { Artist } from '@/types';

/**
 * Gemini-based image analysis for festival posters
 * Uses vision-first approach with few-shot prompting
 */

const FEW_SHOT_PROMPT = `You are an expert at analyzing music festival posters and extracting performing artists.

EXAMPLES to guide your analysis:

Example 1 - Clean Poster:
Image shows large text "BEYONCÉ" at top, medium "SZA" below, small "Arlo Parks" at bottom
Output: [
  {"name": "Beyoncé", "weight": 10, "tier": "headliner", "reasoning": "Largest text, top position"},
  {"name": "SZA", "weight": 7, "tier": "sub-headliner", "reasoning": "Medium text, upper-middle"},
  {"name": "Arlo Parks", "weight": 3, "tier": "undercard", "reasoning": "Small text, bottom"}
]

Example 2 - Merged Text:
Image shows "BAD BUNNYTAME IMPALA" (no spaces), "21 Savage" below
Output: [
  {"name": "Bad Bunny", "weight": 9, "tier": "headliner", "reasoning": "Large merged text, top"},
  {"name": "Tame Impala", "weight": 9, "tier": "headliner", "reasoning": "Large merged text, top"},
  {"name": "21 Savage", "weight": 6, "tier": "mid-tier", "reasoning": "Medium text, middle"}
]

Example 3 - Poster Noise:
Image shows "COACHELLA 2025" (festival name), "APRIL 12-14" (dates), "Travis Scott" (artist), "TICKETS ON SALE FRI" (info)
Output: [
  {"name": "Travis Scott", "weight": 10, "tier": "headliner", "reasoning": "Only artist, large text"}
]

NOW ANALYZE THIS FESTIVAL POSTER:

INSTRUCTIONS:
1. Identify all performing artists/bands listed on the poster
2. Rank them by visual prominence:
   - Font size (larger = more important)
   - Position (top/center = more important)
   - Styling (bold, color, effects)
3. Assign weight score:
   - 10: Main headliner (largest, top billing)
   - 8-9: Co-headliners (large text, prominent)
   - 6-7: Sub-headliners (medium text, upper tier)
   - 4-5: Mid-tier acts (medium-small text, middle)
   - 1-3: Undercard (small text, bottom/sides)
4. Assign tier category:
   - "headliner" for weight 8-10
   - "sub-headliner" for weight 6-7
   - "mid-tier" for weight 4-5
   - "undercard" for weight 1-3

EXCLUDE (these are NOT artists):
- Festival names (Coachella, Lollapalooza, Bonnaroo, etc.)
- Dates and times (any date format, time stamps)
- Locations and venues
- "Tickets", "VIP", "Presale", "On Sale", "General Admission"
- "Presented by", "Sponsored by", sponsor names
- Stage names ("Main Stage", "Sahara Tent")
- Generic words ("Festival", "Music", "Live", "Tour", "World Tour")
- Website URLs, social media handles
- Age restrictions ("18+", "21+", "All Ages")
- Amenities ("Food", "Drinks", "Parking", "Camping")

HANDLING EDGE CASES:
- If text is merged (no spaces between artists), separate them intelligently
- If unsure about a name, include it with lower weight and explain in reasoning
- If dates are part of artist names (e.g., "88rising"), keep them
- Sort output by weight descending (highest weight first)

Return ONLY a valid JSON array with this exact format:
[
  {
    "name": "Exact Artist Name",
    "weight": 8,
    "tier": "headliner",
    "reasoning": "Brief explanation of weight"
  }
]

Be precise with artist spellings. No additional text, only the JSON array.`;

/**
 * Analyzes a festival poster image using Gemini 2.0 Flash
 * @param imageBuffer - Buffer containing the image data
 * @param mimeType - MIME type of the image (e.g., 'image/jpeg', 'image/png', 'image/webp')
 * @returns Object with artists array and raw Gemini response
 */
export async function analyzeImageWithGemini(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<{
  artists: Artist[];
  rawText: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Initialize Gemini client
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  try {
    console.log('[Gemini] Analyzing poster image...');

    // Convert buffer to base64 for Gemini
    const imageBase64 = imageBuffer.toString('base64');

    // Prepare image part for Gemini
    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

    // Send prompt + image to Gemini
    const result = await model.generateContent([FEW_SHOT_PROMPT, imagePart]);
    const response = await result.response;
    const responseText = response.text();

    console.log('[Gemini] Raw response:', responseText);

    // Parse JSON from response
    const artists = parseGeminiResponse(responseText);

    console.log(`[Gemini] Extracted ${artists.length} artists`);
    console.log('[Gemini] Artists:', artists);

    return {
      artists,
      rawText: responseText,
    };
  } catch (error) {
    console.error('[Gemini] Error analyzing image:', error);
    throw new Error(`Gemini analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parses Gemini's response to extract JSON array of artists
 * Handles markdown code blocks and malformed JSON
 */
function parseGeminiResponse(responseText: string): Artist[] {
  try {
    // Try to extract JSON from markdown code blocks first
    const jsonBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);

    if (jsonBlockMatch) {
      const jsonStr = jsonBlockMatch[1].trim();
      return JSON.parse(jsonStr);
    }

    // Try to find raw JSON array
    const jsonArrayMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);

    if (jsonArrayMatch) {
      return JSON.parse(jsonArrayMatch[0]);
    }

    // Fallback: Try parsing entire response as JSON
    return JSON.parse(responseText);
  } catch (error) {
    console.error('[Gemini] Failed to parse response:', responseText);
    console.error('[Gemini] Parse error:', error);

    // Last resort: Try to extract artist names from any JSON-like structure
    const artistNameMatches = responseText.matchAll(/"name":\s*"([^"]+)"/g);
    const fallbackArtists: Artist[] = [];

    for (const match of artistNameMatches) {
      fallbackArtists.push({
        name: match[1],
        weight: 5, // Default weight if parsing fails
        tier: 'mid-tier',
        reasoning: 'Fallback parse - weight may be inaccurate',
      });
    }

    if (fallbackArtists.length > 0) {
      console.log('[Gemini] Used fallback parsing, extracted:', fallbackArtists);
      return fallbackArtists;
    }

    throw new Error('Could not parse Gemini response as JSON');
  }
}

/**
 * Validates and cleans artist data from Gemini
 * Ensures all required fields are present and valid
 */
function validateArtists(artists: any[]): Artist[] {
  return artists
    .filter(artist => {
      // Must have a name
      if (!artist.name || typeof artist.name !== 'string') {
        console.warn('[Gemini] Skipping invalid artist (no name):', artist);
        return false;
      }

      // Weight should be 1-10
      if (artist.weight && (artist.weight < 1 || artist.weight > 10)) {
        console.warn('[Gemini] Invalid weight for artist:', artist);
        artist.weight = 5; // Default to mid-tier
      }

      return true;
    })
    .map(artist => ({
      name: artist.name.trim(),
      weight: artist.weight || 5,
      tier: artist.tier || inferTierFromWeight(artist.weight || 5),
      reasoning: artist.reasoning || 'No reasoning provided',
    }));
}

/**
 * Infers tier category from weight score
 */
function inferTierFromWeight(weight: number): 'headliner' | 'sub-headliner' | 'mid-tier' | 'undercard' {
  if (weight >= 8) return 'headliner';
  if (weight >= 6) return 'sub-headliner';
  if (weight >= 4) return 'mid-tier';
  return 'undercard';
}

/**
 * Retry logic with exponential backoff for API failures
 */
export async function analyzeImageWithGeminiRetry(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg',
  maxRetries: number = 3
): Promise<{ artists: Artist[]; rawText: string }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Gemini] Analysis attempt ${attempt}/${maxRetries}`);
      const result = await analyzeImageWithGemini(imageBuffer, mimeType);

      // Validate result
      if (!result.artists || result.artists.length === 0) {
        throw new Error('No artists found in response');
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`[Gemini] Attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 2^attempt seconds
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`[Gemini] Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(`Gemini analysis failed after ${maxRetries} attempts: ${lastError?.message}`);
}
