import { NextApiRequest, NextApiResponse } from 'next';
import formidable, { Fields, Files } from 'formidable';
import fs from 'fs';
import { analyzeImage } from '@/lib/ocr';
import { isAuthenticated } from '@/lib/auth';

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    // Analyze the image using Google Vision
    const result = await analyzeImage(imageBuffer);

    // Clean up the temporary file
    fs.unlinkSync(imageFile.filepath);

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error analyzing image:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze image',
    });
  }
}
