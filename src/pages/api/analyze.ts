import { NextApiRequest, NextApiResponse } from 'next';
import formidable, { Fields, Files } from 'formidable';
import fs from 'fs';
import { analyzeImage } from '@/lib/ocr';
import { analyzeImageWithGeminiRetry } from '@/lib/gemini';
import { isAuthenticated } from '@/lib/auth';
import { mockVisionArtists, mockGeminiArtists } from '@/lib/mock-data';
import { AnalyzeResponse } from '@/types';
import { applyRateLimit, RateLimitPresets } from '@/lib/rate-limit';

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (5 requests per minute for expensive image analysis)
  if (applyRateLimit(req, res, RateLimitPresets.strict())) {
    return; // Rate limit exceeded, response already sent
  }

  // Check authentication
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB max
      keepExtensions: true,
    });

    const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const imageFile = files.image?.[0];

    if (!imageFile) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Read the image file
    const imageBuffer = fs.readFileSync(imageFile.filepath);

    // Check if we should use mock data (for dev/UI iteration)
    const useMockData = process.env.USE_MOCK_DATA === 'true';

    // Determine which analysis provider to use
    const provider = process.env.IMAGE_ANALYSIS_PROVIDER || 'vision';

    console.log(`[Analyze API] Using provider: ${provider}`);
    if (useMockData) {
      console.log('[Analyze API] 🎭 MOCK MODE ENABLED - Returning mock data');
    }

    let result: { artists: any[]; rawText: string };

    if (useMockData) {
      // Return mock data instead of calling real APIs
      const mockArtists = provider === 'gemini' ? mockGeminiArtists : mockVisionArtists;
      result = {
        artists: mockArtists,
        rawText: mockArtists.map((a) => a.name).join('\n'),
      };
      console.log(`[Analyze API] Returning ${mockArtists.length} mock artists (${provider} style)`);
    } else if (provider === 'gemini') {
      // Use Gemini 2.0 Flash with vision-first approach
      console.log('[Analyze API] Analyzing with Gemini...');
      result = await analyzeImageWithGeminiRetry(imageBuffer, imageFile.mimetype ?? 'image/jpeg');
    } else {
      // Use Google Cloud Vision (default)
      console.log('[Analyze API] Analyzing with Vision API...');
      result = await analyzeImage(imageBuffer);
    }

    // Clean up the temporary file
    fs.unlinkSync(imageFile.filepath);

    // Return result with provider information
    const response: AnalyzeResponse = {
      artists: result.artists,
      rawText: result.rawText,
      provider: provider as 'vision' | 'gemini',
    };

    // Log extracted artists for debugging
    console.log(`\n=== IMAGE ANALYSIS COMPLETE (Provider: ${provider}) ===`);
    console.log(`Total artists extracted: ${result.artists.length}`);
    if (provider === 'gemini' && result.artists.some((a) => a.weight)) {
      console.log('\nArtists (sorted by weight):');
      const sorted = [...result.artists].sort((a, b) => (b.weight || 0) - (a.weight || 0));
      sorted.forEach((artist, index) => {
        const weightStr = artist.weight
          ? ` [Weight: ${artist.weight}/10, Tier: ${artist.tier}]`
          : '';
        console.log(`${index + 1}. ${artist.name}${weightStr}`);
      });
    } else {
      console.log('\nArtists:');
      result.artists.forEach((artist, index) => {
        console.log(`${index + 1}. ${artist.name}`);
      });
    }
    console.log('=== END IMAGE ANALYSIS ===\n');

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error analyzing image:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze image',
    });
  }
}
