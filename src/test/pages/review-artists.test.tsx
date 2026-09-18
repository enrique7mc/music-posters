import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReviewArtists from '../../pages/review-artists';

// --- Module mocks (hoisted) -------------------------------------------------

const { mockPush, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  return { mockPush: push, mockRouter: { push } };
});
const mockPost = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => ({
  user: { id: 'u1', displayName: 'Test User', platform: 'apple-music' },
  loading: false,
  platform: 'apple-music',
  logout: vi.fn(),
}));

vi.mock('next/router', () => ({
  // Keep the router identity stable: the page's initialization effect depends
  // on it, just as it does with Next's real router singleton.
  useRouter: () => mockRouter,
}));

vi.mock('@/contexts/AuthContext', () => ({
  // Stable identities mirror the real context value and avoid retriggering
  // effects that depend on the authenticated user.
  useAuth: () => mockAuth,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: mockPost },
}));

// PageLayout renders NavBar, whose next/link + motion.nav entrance animation
// never settles under jsdom (pre-existing; the page was never unit-tested).
// The layout is irrelevant to the count logic under test, so pass it through.
vi.mock('@/components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Same pre-existing jsdom hazard: LoadingScreen's spinner animates with
// repeat: Infinity, which never yields under act(). The page shows it while
// loading=true; replace it with a static shell.
vi.mock('@/components/ui/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
  LoadingScreen: ({ message }: { message?: string }) => (
    <div data-testid="loading-screen">{message}</div>
  ),
}));

// --- Helpers ----------------------------------------------------------------

const TEXT_LINEUP = [{ name: 'Alvvays' }, { name: 'The Beths' }, { name: 'Men I Trust' }];

function seedTextSession(artists = TEXT_LINEUP) {
  sessionStorage.setItem('artists', JSON.stringify(artists));
  sessionStorage.setItem('inputSource', 'text');
}

function seedPosterSession() {
  sessionStorage.setItem('artists', JSON.stringify([{ name: 'Alvvays', tier: 'headliner' }]));
  sessionStorage.setItem('analysisProvider', 'gemini');
  sessionStorage.setItem('inputSource', 'poster');
}

const countSelect = (artistName: string) =>
  screen.getByLabelText(`Track count for ${artistName}`) as HTMLSelectElement;

/** Stub /api/personalize + /api/search-tracks responses. */
function stubApi() {
  mockPost.mockImplementation((url: string) => {
    if (url === '/api/personalize') {
      return Promise.resolve({
        data: {
          artists: [
            { name: 'Alvvays', affinity: 'loved', affinityConfidence: 0.97 },
            { name: 'The Beths' },
            { name: 'Men I Trust' },
          ],
          lovedCount: 1,
          gemCount: 0,
          degraded: false,
        },
      });
    }
    return Promise.resolve({
      data: { tracks: [], artistsSearched: 3, tracksFound: 0 },
    });
  });
}

async function renderReviewArtists() {
  const view = render(<ReviewArtists />);
  // Wait for the lineup and for personalization to settle (Continue is
  // disabled while it's in flight).
  await waitFor(() => {
    expect(screen.getByText('Review Artists (3)')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
  });
  return view;
}

// --- Tests -------------------------------------------------------------------

describe('review-artists with a manually entered (text) lineup', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
    mockPost.mockReset();
    stubApi();
  });

  it('defaults every artist to 5 tracks in per-artist mode', async () => {
    seedTextSession();
    await renderReviewArtists();

    expect(countSelect('Alvvays').value).toBe('5');
    expect(countSelect('The Beths').value).toBe('5');
    expect(countSelect('Men I Trust').value).toBe('5');
    expect(screen.getByText('~15')).toBeInTheDocument(); // summary: 3 × 5
  });

  it('shows "Entered manually" instead of an AI provider badge and hides tier modes', async () => {
    seedTextSession();
    await renderReviewArtists();

    expect(screen.getByText('✍️ Entered manually')).toBeInTheDocument();
    expect(screen.queryByText('🤖 Gemini AI')).not.toBeInTheDocument();
    expect(screen.queryByText('👁️ Vision API')).not.toBeInTheDocument();
    expect(screen.queryByText('🔄 Hybrid AI')).not.toBeInTheDocument();

    // Tier-based modes are irrelevant for text lists and must be hidden.
    expect(screen.queryByText('Recommended (Tier-based)')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom Per Tier')).not.toBeInTheDocument();
    expect(screen.getByText('Per-Artist')).toBeInTheDocument();
  });

  it('increasing one artist to 10 leaves the others at 5 (summary follows)', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.change(countSelect('Alvvays'), { target: { value: '10' } });

    expect(countSelect('Alvvays').value).toBe('10');
    expect(countSelect('The Beths').value).toBe('5');
    expect(countSelect('Men I Trust').value).toBe('5');
    expect(screen.getByText('~20')).toBeInTheDocument(); // 10 + 5 + 5
  });

  it('reset restores 5 tracks each for text input', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.change(countSelect('The Beths'), { target: { value: '10' } });
    expect(countSelect('The Beths').value).toBe('10');

    fireEvent.click(screen.getByRole('button', { name: /reset to recommended/i }));

    expect(countSelect('Alvvays').value).toBe('5');
    expect(countSelect('The Beths').value).toBe('5');
    expect(countSelect('Men I Trust').value).toBe('5');
    expect(screen.getByText('~15')).toBeInTheDocument();
  });

  it('sends the per-artist counts (affinity preserved) to /api/search-tracks', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });

    const searchCall = mockPost.mock.calls.find(([url]) => url === '/api/search-tracks');
    expect(searchCall).toBeDefined();
    const body = searchCall![1];
    expect(body.trackCountMode).toBe('per-artist');
    expect(body.trackSelectionMode).toBe('popular');
    expect(body.perArtistCounts).toEqual({
      Alvvays: 5,
      'The Beths': 5,
      'Men I Trust': 5,
    });
    expect(body.artists.map((a: { name: string }) => a.name)).toEqual([
      'Alvvays',
      'The Beths',
      'Men I Trust',
    ]);
    // Personalization merged an affinity tag without disturbing the manual counts.
    expect(body.artists[0].affinity).toBe('loved');
  });

  it('keeps manual counts after personalization merges affinity tags', async () => {
    seedTextSession();
    await renderReviewArtists();

    // Personalization has resolved by now (Continue enabled) — counts unchanged.
    expect(countSelect('Alvvays').value).toBe('5');
    expect(countSelect('The Beths').value).toBe('5');
    expect(countSelect('Men I Trust').value).toBe('5');
  });

  it('supports artist names that collide with object prototype keys', async () => {
    seedTextSession([{ name: '__proto__' }]);
    render(<ReviewArtists />);

    await waitFor(() => {
      expect(countSelect('__proto__').value).toBe('5');
    });
  });
});

describe('review-artists with a poster lineup (regression guard)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
    mockPost.mockReset();
    stubApi();
  });

  it('keeps tier-based defaults and shows tier modes for poster sessions', async () => {
    seedPosterSession();
    render(<ReviewArtists />);

    await waitFor(() => {
      expect(screen.getByText('Review Artists (1)')).toBeInTheDocument();
    });

    // Tier mode remains available and per-artist count uses the tier default (10).
    expect(screen.getByText('Recommended (Tier-based)')).toBeInTheDocument();
    expect(screen.getByText('Custom Per Tier')).toBeInTheDocument();
    expect(screen.getByText('🤖 Gemini AI')).toBeInTheDocument();
    expect(screen.queryByText('✍️ Entered manually')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });
    const searchCall = mockPost.mock.calls.find(([url]) => url === '/api/search-tracks');
    expect(searchCall![1].trackCountMode).toBe('tier-based');
    expect(searchCall![1].perArtistCounts).toBeUndefined();
  });

  it('treats sessions without inputSource as poster input (backward compatible)', async () => {
    sessionStorage.setItem('artists', JSON.stringify([{ name: 'Alvvays' }, { name: 'The Beths' }]));
    // No inputSource key at all — older sessions.
    render(<ReviewArtists />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
    });

    expect(screen.queryByText('✍️ Entered manually')).not.toBeInTheDocument();
    expect(screen.getByText('Recommended (Tier-based)')).toBeInTheDocument();
  });
});
