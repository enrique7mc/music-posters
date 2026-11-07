import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeImageWithGeminiRetry, isNonRetryableGeminiError } from '../gemini';
import { analyzeImageHybrid } from '../hybrid-analyzer';

// Mock the Gemini SDK so each attempt's outcome can be driven deterministically.
// vi.hoisted makes `generateContent` available to the hoisted vi.mock factory.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

// Stub only the Vision call; the OCR fallback path uses the real parser.
vi.mock('../ocr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ocr')>()),
  extractTextFromImage: vi.fn().mockResolvedValue('ARTIST ONE\nARTIST TWO'),
}));

// Shape of the SDK's GoogleGenerativeAIFetchError: a message plus an HTTP status.
function fetchError(status: number): Error {
  return Object.assign(new Error(`[${status}] fetch failed`), { status });
}

const okResponse = {
  response: {
    text: () => '{"artists":[{"name":"Artist One","weight":9}],"eventName":"Fest"}',
  },
};

const image = Buffer.from('fake-image');

describe('isNonRetryableGeminiError', () => {
  it.each([400, 401, 402, 403, 404])('returns true for status %i', (status) => {
    expect(isNonRetryableGeminiError(fetchError(status))).toBe(true);
  });

  it.each([429, 500, 503])('returns false for status %i', (status) => {
    expect(isNonRetryableGeminiError(fetchError(status))).toBe(false);
  });

  it('reads the status from a wrapped cause', () => {
    const wrapped = new Error('Gemini analysis failed', { cause: fetchError(402) });
    expect(isNonRetryableGeminiError(wrapped)).toBe(true);
  });

  it('returns false for errors without a status', () => {
    expect(isNonRetryableGeminiError(new Error('No artists found'))).toBe(false);
    expect(isNonRetryableGeminiError(undefined)).toBe(false);
  });
});

describe('Gemini retry loops', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('analyzeImageWithGeminiRetry stops after one attempt on 402', async () => {
    generateContent.mockRejectedValue(fetchError(402));

    await expect(analyzeImageWithGeminiRetry(image, 'image/jpeg', 3)).rejects.toThrow(
      /Gemini analysis failed/
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('analyzeImageWithGeminiRetry still retries on 503', async () => {
    vi.useFakeTimers();
    generateContent.mockRejectedValueOnce(fetchError(503)).mockResolvedValueOnce(okResponse);

    const promise = analyzeImageWithGeminiRetry(image, 'image/jpeg', 3);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.artists[0].name).toBe('Artist One');
  });

  it('analyzeImageHybrid falls back to OCR after one attempt on 402', async () => {
    generateContent.mockRejectedValue(fetchError(402));

    const result = await analyzeImageHybrid(image, 'image/jpeg', 3);

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.rawText).toContain('ARTIST ONE');
  });

  it('analyzeImageHybrid still retries on 503', async () => {
    vi.useFakeTimers();
    generateContent.mockRejectedValueOnce(fetchError(503)).mockResolvedValueOnce(okResponse);

    const promise = analyzeImageHybrid(image, 'image/jpeg', 3);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.artists[0].name).toBe('Artist One');
  });
});
