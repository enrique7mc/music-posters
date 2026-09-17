import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../analyze';

const mocks = vi.hoisted(() => ({
  analyzeImage: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('image')),
  unlinkSync: vi.fn(),
  validateImageFile: vi.fn(async () => ({
    isValid: true,
    detectedType: 'image/jpeg',
  })),
}));

vi.mock('formidable', () => ({
  default: vi.fn(() => ({
    parse: (_req: unknown, callback: (error: null, fields: object, files: object) => void) =>
      callback(
        null,
        {},
        {
          image: [{ filepath: '/tmp/poster-upload.jpg', mimetype: 'image/jpeg' }],
        }
      ),
  })),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: mocks.readFileSync,
    unlinkSync: mocks.unlinkSync,
  },
}));

vi.mock('@/lib/ocr', () => ({ analyzeImage: mocks.analyzeImage }));
vi.mock('@/lib/gemini', () => ({ analyzeImageWithGeminiRetry: vi.fn() }));
vi.mock('@/lib/hybrid-analyzer', () => ({ analyzeImageHybrid: vi.fn() }));
vi.mock('@/lib/auth', () => ({ isAuthenticatedOrDev: vi.fn(() => true) }));
vi.mock('@/lib/dev-mode', () => ({
  isDevModeAvailable: vi.fn(() => false),
  getDevConfig: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  applyRateLimit: vi.fn(() => false),
  RateLimitPresets: { strict: vi.fn(() => ({})) },
}));
vi.mock('@/lib/validation', () => ({
  validateImageFile: mocks.validateImageFile,
  ALLOWED_IMAGE_MIME_TYPES: ['image/jpeg'],
}));

describe('/api/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IMAGE_ANALYSIS_PROVIDER = 'vision';
  });

  it('deletes the temporary upload when image analysis fails', async () => {
    mocks.analyzeImage.mockRejectedValueOnce(new Error('provider unavailable'));
    const { req, res } = createMocks({ method: 'POST' });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(mocks.unlinkSync).toHaveBeenCalledOnce();
    expect(mocks.unlinkSync).toHaveBeenCalledWith('/tmp/poster-upload.jpg');
  });
});
