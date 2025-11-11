import sharp from 'sharp';

interface CoverOptions {
  playlistName: string;
  posterBuffer?: Buffer;
}

/**
 * Generates a playlist cover image for Spotify.
 * - Uses poster as blurred/darkened background (if provided)
 * - Falls back to gradient if no poster
 * - Dynamically sizes text to prevent cropping
 * - Keeps image under 256 KB JPEG limit
 *
 * @param options - Cover generation options
 * @returns Base64 encoded JPEG string (without data URI prefix)
 */
export async function generatePlaylistCover(options: CoverOptions): Promise<string> {
  const { playlistName, posterBuffer } = options;
  const width = 300;
  const height = 300;

  // Helper function to create a fresh Sharp instance from the original source
  const createBaseImage = () => {
    if (posterBuffer) {
      // Option: Use poster as background with blur and darkening
      return sharp(posterBuffer)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .blur(3) // Slight blur for readability
        .modulate({ brightness: 0.5 }); // Darken by 50%
    } else {
      // Fallback: Create gradient background
      return sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 30, g: 30, b: 60 }, // Dark blue
        },
      });
    }
  };

  // Generate SVG overlay with text
  const svgOverlay = generateTextOverlay(playlistName, width, height);
  const svgBuffer = Buffer.from(svgOverlay);

  // Try different quality levels to stay under 256 KB limit
  const qualityLevels = [90, 75, 60];
  let buffer: Buffer | null = null;

  for (const quality of qualityLevels) {
    // Create a fresh Sharp instance for each attempt
    const image = createBaseImage();

    buffer = await image
      .composite([
        {
          input: svgBuffer,
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    console.log(`Cover size at quality ${quality}: ${buffer.length} bytes`);

    // If under 256 KB, we're done
    if (buffer.length <= 256000) {
      break;
    }

    // If this was not the last quality level, log and try lower quality
    if (quality !== qualityLevels[qualityLevels.length - 1]) {
      console.log(`Cover size ${buffer.length} bytes exceeds limit, trying lower quality...`);
    }
  }

  if (!buffer) {
    throw new Error('Failed to generate playlist cover');
  }

  // Final size check
  if (buffer.length > 256000) {
    console.warn(
      `Cover size ${buffer.length} bytes still exceeds 256 KB limit after quality reduction. Upload may fail.`
    );
  }

  console.log(`Final cover size: ${buffer.length} bytes`);

  console.log(`Final cover size: ${buffer.length} bytes`);

  return buffer.toString('base64');
}

/**
 * Generates SVG overlay with playlist name and branding.
 * Dynamically wraps text and adjusts font size to prevent cropping.
 */
function generateTextOverlay(playlistName: string, width: number, height: number): string {
  const maxWidth = width * 0.85; // 85% of image width for padding
  const maxTitleHeight = height * 0.6; // Reserve 60% for title area

  // Calculate optimal font size and wrapped text
  const { fontSize, lines } = calculateTextLayout(playlistName, maxWidth, maxTitleHeight);

  // Calculate vertical positioning to center the text block
  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2;

  // Generate text elements for each line
  const textElements = lines
    .map((line, index) => {
      const y = startY + index * lineHeight + fontSize; // fontSize offset for baseline
      return `
      <text
        x="${width / 2}"
        y="${y}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
        text-anchor="middle"
        style="text-shadow: 2px 2px 8px rgba(0,0,0,0.9);"
      >${escapeXml(line)}</text>
    `;
    })
    .join('');

  return `
    <svg width="${width}" height="${height}">
      <!-- Dark overlay for text readability -->
      <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.4)"/>

      <!-- Playlist name (multi-line if needed) -->
      ${textElements}

      <!-- "By Music Posters" badge -->
      <text
        x="${width / 2}"
        y="${height - 30}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="11"
        font-weight="normal"
        fill="#cccccc"
        text-anchor="middle"
      >By Music Posters</text>
    </svg>
  `;
}

/**
 * Calculates optimal font size and text wrapping for a given string.
 * Ensures text fits within maxWidth and maxHeight without cropping.
 *
 * @returns Object with fontSize and array of wrapped text lines
 */
function calculateTextLayout(
  text: string,
  maxWidth: number,
  maxHeight: number
): { fontSize: number; lines: string[] } {
  // Start with a reasonable font size
  let fontSize = 32;
  const minFontSize = 14;
  const avgCharWidth = 0.6; // Approximate ratio of character width to font size

  while (fontSize >= minFontSize) {
    const estimatedCharPerLine = Math.floor(maxWidth / (fontSize * avgCharWidth));
    const lines = wrapText(text, estimatedCharPerLine);
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;

    // Check if it fits
    if (totalHeight <= maxHeight && lines.every((line) => fitsInWidth(line, fontSize, maxWidth))) {
      return { fontSize, lines };
    }

    // Reduce font size and try again
    fontSize -= 2;
  }

  // Fallback: use minimum font size with aggressive wrapping
  const estimatedCharPerLine = Math.floor(maxWidth / (minFontSize * avgCharWidth));
  const lines = wrapText(text, estimatedCharPerLine);
  return { fontSize: minFontSize, lines };
}

/**
 * Hard-wraps a word that exceeds the maximum characters per line.
 * Breaks it into chunks of maxCharsPerLine.
 *
 * @param word - The word to break into chunks
 * @param maxCharsPerLine - Maximum characters allowed per line
 * @returns Array of word chunks
 */
function hardWrapWord(word: string, maxCharsPerLine: number): string[] {
  const chunks: string[] = [];
  let remaining = word;

  while (remaining.length > maxCharsPerLine) {
    chunks.push(remaining.slice(0, maxCharsPerLine));
    remaining = remaining.slice(maxCharsPerLine);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Wraps text into multiple lines based on character limit per line.
 * Tries to break at word boundaries when possible.
 * Hard-wraps oversized words to guarantee every line respects the character budget.
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    // Check if the word itself exceeds maxCharsPerLine
    if (word.length > maxCharsPerLine) {
      // Push current line if it exists
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }

      // Hard-wrap the oversized word
      const chunks = hardWrapWord(word, maxCharsPerLine);
      // Push all complete chunks
      for (let i = 0; i < chunks.length - 1; i++) {
        lines.push(chunks[i]);
      }
      // Set the last chunk as current line
      currentLine = chunks[chunks.length - 1];
      continue;
    }

    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      // Line would be too long
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // This should not happen since we handle oversized words above
        // But keep as fallback
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text]; // Fallback to original text
}

/**
 * Estimates if a line of text fits within the given width at the given font size.
 */
function fitsInWidth(line: string, fontSize: number, maxWidth: number): boolean {
  const avgCharWidth = 0.6;
  const estimatedWidth = line.length * fontSize * avgCharWidth;
  return estimatedWidth <= maxWidth;
}

/**
 * Escapes XML special characters for safe SVG text rendering.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
