import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { clearSetlistCache, getTypicalSetlist } from '../setlistfm';

const SEARCH_URL = 'https://api.setlist.fm/rest/1.0/search/setlists';
const NOW = new Date(Date.UTC(2026, 10, 15));
const FULL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((name) => ({ name }));

function entry(date: string, name = 'Turnstile', url = 'https://www.setlist.fm/setlist/x.html') {
  return {
    id: date,
    eventDate: date,
    artist: { mbid: 'mbid-1', name },
    venue: { name: 'Zénith', city: { name: 'Paris' } },
    sets: { set: [{ song: FULL }] },
    url,
  };
}

function page(setlist: unknown[], total = setlist.length) {
  return { type: 'setlists', itemsPerPage: 20, page: 1, total, setlist };
}

describe('getTypicalSetlist', () => {
  const originalKey = process.env.SETLISTFM_API_KEY;

  beforeEach(() => {
    process.env.SETLISTFM_API_KEY = 'test-key';
    clearSetlistCache();
  });

  afterEach(() => {
    process.env.SETLISTFM_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('returns a Typical Set on 200 and sends the key header', async () => {
    let seenKey: string | null = null;
    let seenQuery: string | null = null;
    server.use(
      http.get(SEARCH_URL, ({ request }) => {
        seenKey = request.headers.get('x-api-key');
        seenQuery = new URL(request.url).searchParams.get('artistName');
        return HttpResponse.json(
          page([entry('13-11-2026'), entry('11-11-2026'), entry('09-11-2026')])
        );
      })
    );

    const { result, calls, cacheHit } = await getTypicalSetlist('Turnstile', NOW);

    expect(seenKey).toBe('test-key');
    expect(seenQuery).toBe('Turnstile');
    expect(calls).toBe(1);
    expect(cacheHit).toBe(false);
    expect(result.kind).toBe('typical');
    if (result.kind === 'typical') {
      expect(result.typicalSet.songs).toHaveLength(10);
      expect(result.typicalSet.latest).toMatchObject({
        date: '2026-11-13',
        city: 'Paris',
        venue: 'Zénith',
      });
    }
  });

  it('ignores entries for a differently named artist', async () => {
    server.use(
      http.get(SEARCH_URL, () =>
        HttpResponse.json(page([entry('13-11-2026', 'Turnstile Tribute Band')]))
      )
    );
    const { result } = await getTypicalSetlist('Turnstile', NOW);
    expect(result).toEqual({ kind: 'fallback', reason: 'no-match' });
  });

  it('never uses an entry whose url is not a setlist.fm page', async () => {
    server.use(
      http.get(SEARCH_URL, () =>
        HttpResponse.json(page([entry('13-11-2026', 'Turnstile', 'https://evil.example.com/x')]))
      )
    );
    const { result } = await getTypicalSetlist('Turnstile', NOW);
    expect(result).toEqual({ kind: 'fallback', reason: 'no-match' });
  });

  it('fetches page 2 once when page 1 has fewer than 3 Qualifying Setlists', async () => {
    const pages: string[] = [];
    server.use(
      http.get(SEARCH_URL, ({ request }) => {
        const p = new URL(request.url).searchParams.get('p') ?? '';
        pages.push(p);
        return p === '1'
          ? HttpResponse.json(page([entry('13-11-2026')], 40))
          : HttpResponse.json(page([entry('01-11-2026'), entry('30-10-2026')], 40));
      })
    );
    const { result, calls } = await getTypicalSetlist('Turnstile', NOW);
    expect(pages).toEqual(['1', '2']);
    expect(calls).toBe(2);
    expect(result.kind === 'typical' && result.typicalSet.sampleSize).toBe(3);
  });

  it('treats 404 as no match', async () => {
    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status: 404 })));
    const { result } = await getTypicalSetlist('Nobody', NOW);
    expect(result).toEqual({ kind: 'fallback', reason: 'no-match' });
  });

  it.each([403, 429, 503])('turns HTTP %i into an api-error fallback', async (status) => {
    server.use(http.get(SEARCH_URL, () => new HttpResponse(null, { status })));
    const { result } = await getTypicalSetlist('Turnstile', NOW);
    expect(result).toEqual({ kind: 'fallback', reason: `api-error:${status}` });
  });

  it('turns a timeout into an api-error fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    );
    const { result } = await getTypicalSetlist('Turnstile', NOW);
    expect(result).toEqual({ kind: 'fallback', reason: 'api-error:timeout' });
  });

  it('falls back with no-key and sends nothing when the key is missing', async () => {
    delete process.env.SETLISTFM_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result, calls } = await getTypicalSetlist('Turnstile', NOW);
    expect(result).toEqual({ kind: 'fallback', reason: 'no-key' });
    expect(calls).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serves a repeat lookup from the cache', async () => {
    let requests = 0;
    server.use(
      http.get(SEARCH_URL, () => {
        requests++;
        return HttpResponse.json(page([entry('13-11-2026')]));
      })
    );
    await getTypicalSetlist('Turnstile', NOW);
    const second = await getTypicalSetlist('turnstile', NOW);
    expect(requests).toBe(1);
    expect(second.cacheHit).toBe(true);
    expect(second.calls).toBe(0);
  });

  it('does not cache an API error', async () => {
    let requests = 0;
    server.use(
      http.get(SEARCH_URL, () => {
        requests++;
        return new HttpResponse(null, { status: 503 });
      })
    );
    await getTypicalSetlist('Turnstile', NOW);
    await getTypicalSetlist('Turnstile', NOW);
    expect(requests).toBe(2);
  });

  it('keeps at most 2 requests in flight', async () => {
    let active = 0;
    let peak = 0;
    server.use(
      http.get(SEARCH_URL, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
        return new HttpResponse(null, { status: 404 });
      })
    );
    await Promise.all(['A1', 'B2', 'C3', 'D4'].map((n) => getTypicalSetlist(n, NOW)));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('looks up an artist whose name uses only a non-Latin script', async () => {
    let requests = 0;
    server.use(
      http.get(SEARCH_URL, () => {
        requests++;
        return HttpResponse.json(page([entry('13-11-2026', '宇多田ヒカル')]));
      })
    );
    const { result } = await getTypicalSetlist('宇多田ヒカル', NOW);
    expect(requests).toBe(1);
    expect(result.kind).toBe('typical');
  });
});
