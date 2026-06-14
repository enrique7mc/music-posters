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

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(artists).toEqual(['Phoenix', 'Caribou', 'Overmono']);
    expect(complete).toBe(true); // read every page, no error
    // The second request resolves the relative `next` against the origin only —
    // it must keep a single `/v1`, not a doubled `/v1/v1`.
    expect(requested[1]).toBe(
      'https://api.music.apple.com/v1/me/library/artists?offset=2&limit=100'
    );
    expect(requested[1]).not.toContain('/v1/v1');
  });

  it('returns partial results AND complete:false on a mid-scan page error (no throw)', async () => {
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

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(artists).toEqual(['Phoenix']); // kept the first page, swallowed the error
    expect(complete).toBe(false); // a failed page means the scan is incomplete
  });

  it('skips entries with no name and handles an empty library', async () => {
    server.use(
      http.get(LIBRARY_URL, () =>
        HttpResponse.json({
          data: [{ attributes: { name: 'Phoenix' } }, { attributes: {} }, {}],
        })
      )
    );

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(artists).toEqual(['Phoenix']);
    expect(complete).toBe(true); // clean single page
  });

  it('stops at the MAX_LIBRARY_PAGES ceiling instead of looping forever', async () => {
    let calls = 0;
    server.use(
      // A library that ALWAYS returns another `next` — without the ceiling this loops forever.
      http.get(LIBRARY_URL, ({ request }) => {
        calls++;
        const offset = Number(new URL(request.url).searchParams.get('offset') || 0);
        return HttpResponse.json({
          data: [{ attributes: { name: `Artist ${offset}` } }],
          next: `/v1/me/library/artists?offset=${offset + 1}&limit=100`,
        });
      })
    );

    const { artists, complete } = await service.getLibraryArtists('user-token');

    expect(calls).toBe(50); // MAX_LIBRARY_PAGES — did not loop unbounded
    expect(artists).toHaveLength(50);
    expect(complete).toBe(false); // truncated by the ceiling
  });
});
