import { NextApiRequest, NextApiResponse } from "next";
import formidable, { Fields, Files } from "formidable";
import fs from "fs";
import { analyzeImage } from "@/lib/ocr";
import { analyzeImageWithGeminiRetry } from "@/lib/gemini";
import { isAuthenticated } from "@/lib/auth";
import { AnalyzeResponse } from "@/types";

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};

// Mock data for development (Vision API style - no weights)
const MOCK_VISION_ARTISTS = [
  { name: "Tame Impala" },
  { name: "The Strokes" },
  { name: "Billie Eilish" },
  { name: "Tyler, The Creator" },
  { name: "Arctic Monkeys" },
  { name: "Frank Ocean" },
  { name: "Disclosure" },
  { name: "LCD Soundsystem" },
  { name: "Childish Gambino" },
  { name: "ODESZA" },
  { name: "Vampire Weekend" },
  { name: "The 1975" },
  { name: "Khruangbin" },
  { name: "Japanese Breakfast" },
  { name: "Wet Leg" },
  { name: "boygenius" },
  { name: "Turnstile" },
  { name: "Fontaines D.C." },
  { name: "Remi Wolf" },
  { name: "Wallows" },
];

// Mock data for development (Gemini style - with weights and tiers)
const MOCK_GEMINI_ARTISTS = [
  {
    name: "Tame Impala",
    weight: 10,
    tier: "headliner",
    reasoning: "Largest text at top of poster",
  },
  {
    name: "The Strokes",
    weight: 10,
    tier: "headliner",
    reasoning: "Large text, prominent position",
  },
  {
    name: "Billie Eilish",
    weight: 9,
    tier: "sub-headliner",
    reasoning: "Second line, large font",
  },
  {
    name: "Tyler, The Creator",
    weight: 9,
    tier: "sub-headliner",
    reasoning: "Second tier positioning",
  },
  {
    name: "Arctic Monkeys",
    weight: 8,
    tier: "sub-headliner",
    reasoning: "Third line, still prominent",
  },
  {
    name: "Frank Ocean",
    weight: 8,
    tier: "sub-headliner",
    reasoning: "Third tier, notable size",
  },
  {
    name: "Disclosure",
    weight: 7,
    tier: "mid-tier",
    reasoning: "Mid-tier placement",
  },
  {
    name: "LCD Soundsystem",
    weight: 7,
    tier: "mid-tier",
    reasoning: "Medium font size",
  },
  {
    name: "Childish Gambino",
    weight: 6,
    tier: "mid-tier",
    reasoning: "Middle section",
  },
  {
    name: "ODESZA",
    weight: 6,
    tier: "mid-tier",
    reasoning: "Medium prominence",
  },
  {
    name: "Vampire Weekend",
    weight: 5,
    tier: "mid-tier",
    reasoning: "Mid-lower section",
  },
  {
    name: "The 1975",
    weight: 5,
    tier: "mid-tier",
    reasoning: "Standard font size",
  },
  {
    name: "Khruangbin",
    weight: 4,
    tier: "undercard",
    reasoning: "Lower third of lineup",
  },
  {
    name: "Japanese Breakfast",
    weight: 4,
    tier: "undercard",
    reasoning: "Smaller text",
  },
  {
    name: "Wet Leg",
    weight: 3,
    tier: "undercard",
    reasoning: "Bottom section",
  },
  {
    name: "boygenius",
    weight: 3,
    tier: "undercard",
    reasoning: "Small font near bottom",
  },
  { name: "Turnstile", weight: 2, tier: "undercard", reasoning: "Lower tier" },
  {
    name: "Fontaines D.C.",
    weight: 2,
    tier: "undercard",
    reasoning: "Small text",
  },
  {
    name: "Remi Wolf",
    weight: 1,
    tier: "undercard",
    reasoning: "Smallest text at bottom",
  },
  {
    name: "Wallows",
    weight: 1,
    tier: "undercard",
    reasoning: "Bottom tier placement",
  },
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check authentication
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB max
      keepExtensions: true,
    });

    const [fields, files] = await new Promise<[Fields, Files]>(
      (resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      }
    );

    const imageFile = files.image?.[0];

    if (!imageFile) {
      return res.status(400).json({ error: "No image file provided" });
    }

    // Read the image file
    const imageBuffer = fs.readFileSync(imageFile.filepath);

    // Check if we should use mock data (for dev/UI iteration)
    const useMockData = process.env.USE_MOCK_DATA === "true";

    // Determine which analysis provider to use
    const provider = process.env.IMAGE_ANALYSIS_PROVIDER || "vision";

    console.log(`[Analyze API] Using provider: ${provider}`);
    if (useMockData) {
      console.log("[Analyze API] 🎭 MOCK MODE ENABLED - Returning mock data");
    }

    let result: { artists: any[]; rawText: string };

    if (useMockData) {
      // Return mock data instead of calling real APIs
      const mockArtists =
        provider === "gemini" ? MOCK_GEMINI_ARTISTS : MOCK_VISION_ARTISTS;
      result = {
        artists: mockArtists,
        rawText: mockArtists.map((a) => a.name).join("\n"),
      };
      console.log(
        `[Analyze API] Returning ${mockArtists.length} mock artists (${provider} style)`
      );
    } else if (provider === "gemini") {
      // Use Gemini 2.0 Flash with vision-first approach
      console.log("[Analyze API] Analyzing with Gemini...");
      result = await analyzeImageWithGeminiRetry(
        imageBuffer,
        imageFile.mimetype ?? "image/jpeg"
      );
    } else {
      // Use Google Cloud Vision (default)
      console.log("[Analyze API] Analyzing with Vision API...");
      result = await analyzeImage(imageBuffer);
    }

    // Clean up the temporary file
    fs.unlinkSync(imageFile.filepath);

    // Return result with provider information
    const response: AnalyzeResponse = {
      artists: result.artists,
      rawText: result.rawText,
      provider: provider as "vision" | "gemini",
    };

    // Log extracted artists for debugging
    console.log(`\n=== IMAGE ANALYSIS COMPLETE (Provider: ${provider}) ===`);
    console.log(`Total artists extracted: ${result.artists.length}`);
    if (provider === "gemini" && result.artists.some((a) => a.weight)) {
      console.log("\nArtists (sorted by weight):");
      const sorted = [...result.artists].sort(
        (a, b) => (b.weight || 0) - (a.weight || 0)
      );
      sorted.forEach((artist, index) => {
        const weightStr = artist.weight
          ? ` [Weight: ${artist.weight}/10, Tier: ${artist.tier}]`
          : "";
        console.log(`${index + 1}. ${artist.name}${weightStr}`);
      });
    } else {
      console.log("\nArtists:");
      result.artists.forEach((artist, index) => {
        console.log(`${index + 1}. ${artist.name}`);
      });
    }
    console.log("=== END IMAGE ANALYSIS ===\n");

    res.status(200).json(response);
  } catch (error: any) {
    console.error("Error analyzing image:", error);
    res.status(500).json({
      error: error.message || "Failed to analyze image",
    });
  }
}
