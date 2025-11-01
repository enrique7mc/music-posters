import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
  try {
    const [result] = await client.textDetection(imageBuffer);
    const detections = result.textAnnotations;

    // Log the full Vision API response for debugging
    console.log('\n=== VISION API RESPONSE ===');
    console.log('Total annotations:', detections?.length || 0);

    if (detections && detections.length > 0) {
      console.log('\nFirst annotation (full text):');
      console.log(JSON.stringify(detections[0], null, 2));

      console.log('\nSample of individual word annotations (first 5):');
      console.log(JSON.stringify(detections.slice(1, 6), null, 2));

      console.log('\nFull text extracted:');
      console.log(detections[0].description);
    }
    console.log('=== END VISION API RESPONSE ===\n');

    if (!detections || detections.length === 0) {
      return '';
    }

    // The first annotation contains all the text
    return detections[0].description || '';
  } catch (error) {
    console.error('Error extracting text from image:', error);
    throw new Error('Failed to extract text from image');
  }
}

export function parseArtistsFromText(text: string): string[] {
  // Split text into lines
  const lines = text.split('\n').map((line) => line.trim());

  // Filter out empty lines and apply heuristics
  const filtered = lines.filter((line) => {
    // Remove empty lines
    if (line.length === 0) return false;

    // Remove very short lines (likely noise)
    if (line.length < 2) return false;

    // Remove URLs and websites
    if (
      line.match(/http|www\.|\.com|\.net|\.org|\.io|\.co/i) ||
      line.includes('://') ||
      line.includes('www')
    ) {
      return false;
    }

    // Remove dates in various formats
    if (
      line.match(
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
      ) ||
      line.match(/january|february|march|april|may|june|july|august|september|october|november|december/i)
    ) {
      return false;
    }

    // Remove time patterns
    if (line.match(/\d{1,2}:\d{2}\s*(am|pm)?/i)) {
      return false;
    }

    // Remove common festival/venue keywords
    const excludeKeywords = [
      'festival',
      'presents',
      'presented by',
      'sponsored by',
      'tickets',
      'vip',
      'stage',
      'doors',
      'general admission',
      'all ages',
      '18+',
      '21+',
      'lineup',
      'featuring',
      'with special guest',
      'location',
      'venue',
      'address',
      'parking',
      'food',
      'drinks',
      'beer',
      'wine',
      'live music',
      'live',
      'performance',
      'concert',
      'show',
      'event',
      'tour',
      'world tour',
    ];

    const lowerLine = line.toLowerCase();
    if (excludeKeywords.some((keyword) => lowerLine.includes(keyword))) {
      return false;
    }

    // Remove lines that are mostly numbers or special characters
    const alphaRatio = (line.match(/[a-zA-Z]/g) || []).length / line.length;
    if (alphaRatio < 0.5) {
      return false;
    }

    // Remove single characters or initials (unless they're known single-letter artists)
    if (line.length === 1) {
      return false;
    }

    // Remove lines with excessive punctuation
    const punctuationRatio = (line.match(/[!@#$%^&*()_+=\[\]{}|;:,.<>?]/g) || []).length / line.length;
    if (punctuationRatio > 0.3) {
      return false;
    }

    return true;
  });

  // Remove duplicates (case-insensitive)
  const unique = Array.from(
    new Map(filtered.map((item) => [item.toLowerCase(), item])).values()
  );

  // Sort by length (longer names first, as they're more likely to be headliners)
  // This also helps with deduplication of partial matches
  const sorted = unique.sort((a, b) => b.length - a.length);

  // Remove items that are substrings of other items (to avoid "Drake" and "Drake Bell")
  const deduplicated = sorted.filter((item, index) => {
    const lowerItem = item.toLowerCase();
    return !sorted.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      return other.toLowerCase().includes(lowerItem) && other.length > item.length;
    });
  });

  return deduplicated;
}

export async function analyzeImage(imageBuffer: Buffer): Promise<{
  artists: string[];
  rawText: string;
}> {
  const rawText = await extractTextFromImage(imageBuffer);
  const artists = parseArtistsFromText(rawText);

  return {
    artists,
    rawText,
  };
}
