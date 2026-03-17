import { Artist } from '@/types';
import { extractTextFromImage } from './ocr';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseGeminiResponse } from './gemini-parser';

/**
 * Hybrid image analysis: Combines Vision API OCR with Gemini AI
 *
 * Flow:
 * 1. Vision API extracts comprehensive OCR text (catches everything)
 * 2. Gemini analyzes image visually AND uses OCR text as supplementary context
 * 3. Returns weighted artists with intelligent filtering
 *
 * Benefits:
 * - Vision API: Comprehensive text extraction (won't miss small artist names)
 * - Gemini: Intelligent filtering + visual prominence ranking
 * - Best of both worlds: high coverage + smart filtering
 */

/**
 * Enhanced Gemini prompt that accepts OCR text context
 */
function buildHybridPrompt(ocrText: string): string {
  return `You are an expert at analyzing music festival posters and extracting performing artists.

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

OCR TEXT CONTEXT:
The following text was extracted via OCR from this poster. Use it to supplement your visual analysis and ensure you don't miss any artists, especially those in smaller text that might be harder to see visually:

"""
${ocrText}
"""

IMPORTANT: Cross-reference your visual analysis with the OCR text above. If you see potential artist names in the OCR that you cannot clearly see in the image, include them with appropriate weights based on their likely position/size.

NOW ANALYZE THIS FESTIVAL POSTER:

INSTRUCTIONS:
1. Identify all performing artists/bands listed on the poster
2. Rank them by visual prominence:
   - Font size (larger = more important)
   - Position (top/center = more important)
   - Styling (bold, color, effects)
3. Cross-reference with OCR text to ensure completeness:
   - Artists clearly visible in image = weight based on visual prominence
   - Artists only in OCR text (small/unclear in image) = lower weight (1-3)
4. Assign weight score:
   - 10: Main headliner (largest, top billing)
   - 8-9: Co-headliners (large text, prominent)
   - 6-7: Sub-headliners (medium text, upper tier)
   - 4-5: Mid-tier acts (medium-small text, middle)
   - 1-3: Undercard (small text, bottom/sides, or OCR-only)
5. Assign tier category:
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

Also extract the event or festival name from the poster (e.g., "Coachella 2025", "Lollapalooza 2024"). Include the year if visible.

Return ONLY a valid JSON object with this exact format:
{
  "eventName": "Festival Name 2025",
  "artists": [
    {
      "name": "Exact Artist Name",
      "weight": 8,
      "tier": "headliner",
      "reasoning": "Brief explanation of weight"
    }
  ]
}

If no event name is visible, set "eventName" to "".

Be precise with artist spellings. No additional text, only the JSON object.`;
}

/**
 * Analyzes image using Gemini with OCR text context
 */
async function analyzeWithGeminiAndOCR(
  imageBuffer: Buffer,
  ocrText: string,
  mimeType: string = 'image/jpeg'
): Promise<{ artists: Artist[]; eventName?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Initialize Gemini client
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  console.log('[Hybrid/Gemini] Analyzing poster with OCR context...');

  // Convert buffer to base64 for Gemini
  const imageBase64 = imageBuffer.toString('base64');

  // Prepare image part for Gemini
  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType,
    },
  };

  // Build enhanced prompt with OCR context
  const enhancedPrompt = buildHybridPrompt(ocrText);

  // Send prompt + image to Gemini
  const result = await model.generateContent([enhancedPrompt, imagePart]);
  const response = await result.response;
  const responseText = response.text();

  console.log('[Hybrid/Gemini] Raw response:', responseText);

  // Parse JSON from response
  const parsed = parseGeminiResponse(responseText);

  console.log(`[Hybrid/Gemini] Extracted ${parsed.artists.length} artists`);
  console.log('[Hybrid/Gemini] Artists:', parsed.artists);
  console.log('[Hybrid/Gemini] Event name:', parsed.eventName || '(none)');

  return parsed;
}

/**
 * Main hybrid analysis function with retry logic
 *
 * @param imageBuffer - Buffer containing the image data
 * @param mimeType - MIME type of the image
 * @param maxRetries - Maximum number of retry attempts for Gemini
 * @returns Object with artists array and raw OCR text
 */
export async function analyzeImageHybrid(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg',
  maxRetries: number = 3
): Promise<{
  artists: Artist[];
  rawText: string;
  eventName?: string;
}> {
  console.log('\n=== HYBRID MODE: Vision OCR + Gemini AI ===');

  // Step 1: Extract comprehensive OCR text using Vision API
  let ocrText: string;
  let visionFailed = false;

  try {
    console.log('[Hybrid/Vision] Step 1: Extracting OCR text...');
    ocrText = await extractTextFromImage(imageBuffer);
    console.log(`[Hybrid/Vision] Extracted ${ocrText.length} characters of text`);
  } catch (error) {
    console.error('[Hybrid/Vision] Vision API failed:', error);
    visionFailed = true;
    ocrText = ''; // Empty OCR text, Gemini will work without it
  }

  // Step 2: Analyze with Gemini using OCR context (with retry logic)
  let artists: Artist[] = [];
  let eventName: string | undefined;
  let geminiFailed = false;
  let lastGeminiError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Hybrid/Gemini] Step 2: Gemini analysis attempt ${attempt}/${maxRetries}`);
      const geminiResult = await analyzeWithGeminiAndOCR(imageBuffer, ocrText, mimeType);
      artists = geminiResult.artists;
      eventName = geminiResult.eventName;

      // Validate result
      if (!artists || artists.length === 0) {
        throw new Error('No artists found in Gemini response');
      }

      console.log('[Hybrid] ✓ Both Vision and Gemini succeeded');
      break; // Success!
    } catch (error) {
      lastGeminiError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`[Hybrid/Gemini] Attempt ${attempt} failed:`, lastGeminiError.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 2^attempt seconds
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`[Hybrid/Gemini] Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        geminiFailed = true;
      }
    }
  }

  // Step 3: Handle partial failures with graceful degradation
  if (visionFailed && geminiFailed) {
    // Both failed - cannot proceed
    throw new Error(
      `Hybrid analysis failed: Vision API error and Gemini error after ${maxRetries} attempts`
    );
  }

  if (visionFailed && !geminiFailed) {
    // Vision failed, but Gemini succeeded
    console.warn('[Hybrid] ⚠️  Vision API failed, using Gemini-only results (no OCR context)');
    return {
      artists,
      rawText: artists.map((a) => a.name).join('\n'), // Fallback: use artist names as rawText
      eventName,
    };
  }

  if (!visionFailed && geminiFailed) {
    // Vision succeeded, but Gemini failed - fallback to Vision-only
    console.warn('[Hybrid] ⚠️  Gemini failed, falling back to Vision API only (no ranking)');

    // Import parseArtistsFromText on demand to avoid circular dependency
    const { parseArtistsFromText } = await import('./ocr');
    const artistNames = parseArtistsFromText(ocrText);

    // Convert to Artist[] without weights (Vision API style)
    const visionOnlyArtists: Artist[] = artistNames.map((name) => ({
      name,
      // No weight, tier, or reasoning for Vision-only fallback
    }));

    return {
      artists: visionOnlyArtists,
      rawText: ocrText,
    };
  }

  // Both succeeded - return full hybrid result
  console.log('[Hybrid] ✓ Hybrid analysis complete');
  return {
    artists,
    rawText: ocrText,
    eventName,
  };
}
