import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { AppleMusicPlatformService } from '../apple-music-platform';

const LIBRARY_URL = 'https://api.music.apple.com/v1/me/library/artists';

describe('AppleMusicPlatformService.getLibraryArtists', () => {
  let service: AppleMusicPlatformService;

  beforeEach(() => {
    service = new AppleMusicPlatformService();
    service.setDeveloperToken('dev-token');
  });

  it('paginates via `next`, prepending origin only (never /v1/v1)', async () => {
    const requested: string[] = [];
    server.use(
      http.get(LIBRARY_URL, ({ request }) => {
        requested.push(request.url);
        const offset = new URL(request.url).searchParams.get('offset');
        if (!offset) {
          return HttpResponse.json({
            data: [{ attributes: { name: 'Phoenix' } }, { attributes: { name: 'Caribou' } }],
            next: '/v1/me/library/artists?offset=2&limit=100',
          });
        }
        return HttpResponse.json({ data: [{ attributes: { name: 'Overmono' } }] }); // last page
      })
    );

    const names = await service.getLibraryArtists('user-token');

    expect(names).toEqual(['Phoenix', 'Caribou', 'Overmono']);
    // The second request resolves the relative `next` against the origin only —
    // it must keep a single `/v1`, not a doubled `/v1/v1`.
    expect(requested[1]).toBe(
      'https://api.music.apple.com/v1/me/library/artists?offset=2&limit=100'
    );
    expect(requested[1]).not.toContain('/v1/v1');
  });

  it('returns partial results on a mid-scan page error (no throw)', async () => {
    server.use(
      http.get(LIBRARY_URL, ({ request }) => {
        const offset = new URL(request.url).searchParams.get('offset');
        if (!offset) {
          return HttpResponse.json({
            data: [{ attributes: { name: 'Phoenix' } }],
            next: '/v1/me/library/artists?offset=1&limit=100',
          });
        }
        return new HttpResponse(null, { status: 500 });
      })
    );

    const names = await service.getLibraryArtists('user-token');

    expect(names).toEqual(['Phoenix']); // kept the first page, swallowed the error
  });

  it('skips entries with no name and handles an empty library', async () => {
    server.use(
      http.get(LIBRARY_URL, () =>
        HttpResponse.json({
          data: [{ attributes: { name: 'Phoenix' } }, { attributes: {} }, {}],
        })
      )
    );

    const names = await service.getLibraryArtists('user-token');

    expect(names).toEqual(['Phoenix']);
  });
});
