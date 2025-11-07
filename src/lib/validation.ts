import { z } from 'zod';
import { FileTypeResult, fromBuffer } from 'file-type';

/**
 * Validation schemas for API endpoints using Zod.
 * Provides comprehensive input validation and sanitization to prevent:
 * - Injection attacks
 * - Malformed requests
 * - Rate limit abuse
 * - Invalid file uploads
 */

// ============================================================================
// Artist Validation
// ============================================================================

/**
 * Schema for validating Artist objects.
 * Matches the Artist interface from src/types/index.ts
 */
export const artistSchema = z.object({
  name: z
    .string()
    .min(1, 'Artist name must not be empty')
    .max(100, 'Artist name must not exceed 100 characters')
    .trim()
    .refine((name) => name.length > 0, {
      message: 'Artist name must not be empty after trimming',
    }),
  weight: z.number().min(1).max(10).optional(),
  tier: z.enum(['headliner', 'sub-headliner', 'mid-tier', 'undercard']).optional(),
  reasoning: z.string().max(500).optional(),
  spotifyId: z.string().max(100).optional(),
});

// ============================================================================
// Search Tracks Validation (/api/search-tracks)
// ============================================================================

/**
 * Schema for validating search tracks request body.
 * Limits artists to 100 to prevent excessive API calls and rate limiting.
 */
export const searchTracksSchema = z.object({
  artists: z
    .array(artistSchema)
    .min(1, 'At least one artist must be provided')
    .max(100, 'Maximum 100 artists allowed to prevent excessive API calls'),
  trackCountMode: z.enum(['tier-based', 'custom']).optional(),
  customTrackCount: z.number().int().min(1).max(50).optional(),
  perArtistCounts: z
    .record(z.string(), z.number().int().min(1).max(50))
    .optional()
    .refine(
      (counts) => {
        if (!counts) return true;
        // Ensure all keys are valid non-empty strings
        return Object.keys(counts).every((key) => key.trim().length > 0);
      },
      {
        message: 'All artist names in perArtistCounts must be non-empty strings',
      }
    ),
});

// ============================================================================
// Create Playlist Validation (/api/create-playlist)
// ============================================================================

/**
 * Schema for validating Spotify URI format.
 * Spotify track URIs follow the format: spotify:track:{id}
 */
const spotifyTrackUriSchema = z
  .string()
  .regex(/^spotify:track:[a-zA-Z0-9]{22}$/, 'Invalid Spotify track URI format');

/**
 * Schema for validating create playlist request body.
 * Playlist names are sanitized to prevent injection attacks.
 */
export const createPlaylistSchema = z.object({
  trackUris: z
    .array(spotifyTrackUriSchema)
    .min(1, 'At least one track URI must be provided')
    .max(10000, 'Maximum 10,000 tracks allowed per playlist'),
  playlistName: z
    .string()
    .min(1, 'Playlist name must not be empty')
    .max(100, 'Playlist name must not exceed 100 characters')
    .trim()
    .optional()
    .refine(
      (name) => {
        if (!name) return true;
        // Ensure no HTML tags or special characters that could cause issues
        const sanitized = name.replace(/<[^>]*>/g, '');
        return sanitized === name;
      },
      {
        message: 'Playlist name must not contain HTML tags',
      }
    ),
});

// ============================================================================
// File Upload Validation (/api/analyze)
// ============================================================================

/**
 * Allowed image MIME types for upload.
 * Using a whitelist approach for security.
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/**
 * Allowed file extensions for images.
 */
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

/**
 * Maximum file size for image uploads (10MB).
 * This matches the formidable maxFileSize configuration.
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validates file type using magic bytes (file signature).
 * This is more secure than relying on MIME type or file extension alone.
 *
 * @param buffer - The file buffer to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export async function validateFileType(
  buffer: Buffer
): Promise<{ isValid: boolean; error?: string; detectedType?: string }> {
  try {
    // Check minimum file size (empty files)
    if (buffer.length === 0) {
      return {
        isValid: false,
        error: 'File is empty',
      };
    }

    // Use file-type to detect actual file type from magic bytes
    const fileType: FileTypeResult | undefined = await fromBuffer(buffer);

    if (!fileType) {
      return {
        isValid: false,
        error: 'Could not determine file type. File may be corrupted or invalid.',
      };
    }

    // Check if detected type is in our allowed list
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(fileType.mime as any)) {
      return {
        isValid: false,
        error: `Invalid file type. Detected: ${fileType.mime}. Allowed types: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
        detectedType: fileType.mime,
      };
    }

    return {
      isValid: true,
      detectedType: fileType.mime,
    };
  } catch (error) {
    console.error('Error validating file type:', error);
    return {
      isValid: false,
      error: 'Failed to validate file type',
    };
  }
}

/**
 * Validates file size.
 *
 * @param buffer - The file buffer to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateFileSize(buffer: Buffer): { isValid: boolean; error?: string } {
  if (buffer.length > MAX_FILE_SIZE) {
    const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
    const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      error: `File size (${sizeMB}MB) exceeds maximum allowed size of ${maxSizeMB}MB`,
    };
  }

  return { isValid: true };
}

/**
 * Comprehensive file validation combining type and size checks.
 *
 * @param buffer - The file buffer to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export async function validateImageFile(
  buffer: Buffer
): Promise<{ isValid: boolean; error?: string; detectedType?: string }> {
  // Check file size first (faster check)
  const sizeValidation = validateFileSize(buffer);
  if (!sizeValidation.isValid) {
    return sizeValidation;
  }

  // Then check file type using magic bytes
  const typeValidation = await validateFileType(buffer);
  if (!typeValidation.isValid) {
    return typeValidation;
  }

  return {
    isValid: true,
    detectedType: typeValidation.detectedType,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Safely parses and validates request body against a Zod schema.
 * Returns typed data on success or throws a detailed error.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Parsed and validated data
 * @throws Error with validation details if validation fails
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    // Format Zod errors into a readable message
    const errors = result.error.issues.map((err) => {
      const path = err.path.join('.');
      return `${path}: ${err.message}`;
    });

    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  return result.data;
}

/**
 * Sanitizes a string by removing potentially dangerous characters.
 * Useful for playlist names, artist names, etc.
 *
 * @param input - String to sanitize
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string
 */
export function sanitizeString(input: string, maxLength: number = 100): string {
  return input
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '') // Remove potentially dangerous characters
    .slice(0, maxLength);
}
