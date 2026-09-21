import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

function seedPosterSession(
  artists: { name: string; tier: string }[] = [{ name: 'Alvvays', tier: 'headliner' }]
) {
  sessionStorage.setItem('artists', JSON.stringify(artists));
  sessionStorage.setItem('analysisProvider', 'gemini');
  sessionStorage.setItem('inputSource', 'poster');
}

/** Seed a poster session and render until Continue is ready. */
async function renderPosterReviewArtists(
  artists: { name: string; tier: string }[] = [{ name: 'Alvvays', tier: 'headliner' }]
) {
  seedPosterSession(artists);
  const view = render(<ReviewArtists />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
  });
  return view;
}

const countSelect = (artistName: string) =>
  screen.getByLabelText(`Track count for ${artistName}`) as HTMLInputElement;

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

  it('accepts per-artist counts across the 1–25 range (17 and 25)', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.change(countSelect('Alvvays'), { target: { value: '17' } });
    fireEvent.change(countSelect('The Beths'), { target: { value: '25' } });

    expect(countSelect('Alvvays').value).toBe('17');
    expect(countSelect('The Beths').value).toBe('25');
    expect(countSelect('Men I Trust').value).toBe('5');
    expect(screen.getByText('~47')).toBeInTheDocument(); // 17 + 25 + 5
  });

  it('shows a range message for out-of-range values without committing them', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.change(countSelect('Alvvays'), { target: { value: '26' } });

    expect(screen.getByText('Enter a whole number from 1 to 25.')).toBeInTheDocument();
    // Nothing invalid enters application state: the estimate keeps the last
    // committed count (5 + 5 + 5).
    expect(screen.getByText('~15')).toBeInTheDocument();

    // Blurring reverts the field to the last committed value and clears the message.
    fireEvent.blur(countSelect('Alvvays'));
    expect(countSelect('Alvvays').value).toBe('5');
    expect(screen.queryByText('Enter a whole number from 1 to 25.')).not.toBeInTheDocument();
  });

  it('treats zero and fractions as invalid editing states, not values', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.change(countSelect('The Beths'), { target: { value: '0' } });
    expect(countSelect('The Beths').value).toBe('0'); // temporary editing state
    expect(screen.getByText('Enter a whole number from 1 to 25.')).toBeInTheDocument();
    expect(screen.getByText('~15')).toBeInTheDocument();
    fireEvent.blur(countSelect('The Beths'));
    expect(countSelect('The Beths').value).toBe('5');

    fireEvent.change(countSelect('The Beths'), { target: { value: '2.5' } });
    expect(screen.getByText('Enter a whole number from 1 to 25.')).toBeInTheDocument();
    fireEvent.blur(countSelect('The Beths'));
    expect(countSelect('The Beths').value).toBe('5');
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

  it('shows no bulk tier controls for manually entered lineups', async () => {
    seedTextSession();
    await renderReviewArtists();

    // No tiers exist, so the bulk bar hides its apply-to-tier section entirely.
    expect(
      screen.queryByText(/apply a track count \(1–25\) to all artists in a tier/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Track count for Headliners tier')).not.toBeInTheDocument();
    // The text-lineup reset (per-artist defaults) remains available.
    expect(screen.getByRole('button', { name: /reset to recommended/i })).toBeInTheDocument();
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

  it('custom-per-tier counts appear in the estimate and the API payload', async () => {
    await renderPosterReviewArtists();

    fireEvent.click(screen.getByRole('button', { name: /custom per tier/i }));

    const headlinerInput = screen.getByLabelText('Headliners track count') as HTMLInputElement;
    expect(headlinerInput.value).toBe('10'); // tier default
    expect(screen.getByText('~10')).toBeInTheDocument(); // single headliner artist

    fireEvent.change(headlinerInput, { target: { value: '17' } });

    expect(headlinerInput.value).toBe('17');
    expect(screen.getByText('~17')).toBeInTheDocument(); // estimate follows the tier override

    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });

    const searchCall = mockPost.mock.calls.find(([url]) => url === '/api/search-tracks');
    expect(searchCall![1].trackCountMode).toBe('custom-per-tier');
    expect(searchCall![1].tierCounts.headliner).toBe(17);
  });

  it('bulk tier application supports arbitrary values (17) via explicit Apply', async () => {
    await renderPosterReviewArtists();

    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));

    // Bulk bar shows one row per available tier, seeded with the tier default.
    const bulkInput = screen.getByLabelText('Track count for Headliners tier');
    expect((bulkInput as HTMLInputElement).value).toBe('10');

    fireEvent.change(bulkInput, { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply track count to Headliners' }));

    // Every headliner's per-artist input and the estimate pick up 17.
    expect(countSelect('Alvvays').value).toBe('17');
    expect(screen.getByText('~17')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });

    const searchCall = mockPost.mock.calls.find(([url]) => url === '/api/search-tracks');
    expect(searchCall![1].trackCountMode).toBe('per-artist');
    expect(searchCall![1].perArtistCounts).toEqual({ Alvvays: 17 });
  });

  it('reset also clears the staged bulk tier inputs, not just the lineup counts', async () => {
    await renderPosterReviewArtists();

    // Apply a custom bulk count of 17 to the headliner tier.
    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    const bulkInput = screen.getByLabelText('Track count for Headliners tier');
    fireEvent.change(bulkInput, { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply track count to Headliners' }));
    expect(countSelect('Alvvays').value).toBe('17');

    // Reset to Recommended restores the lineup defaults and drops the mode
    // back to tier-based.
    fireEvent.click(screen.getByRole('button', { name: /reset to recommended/i }));
    expect(screen.getByText('~10')).toBeInTheDocument(); // tier default for the headliner

    // Returning to per-artist mode must show the recommended default in the
    // staged input — not the stale 17 from before the reset.
    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    const bulkInputAfterReset = screen.getByLabelText('Track count for Headliners tier');
    expect((bulkInputAfterReset as HTMLInputElement).value).toBe('10');

    // Applying again keeps the recommended count; the pre-reset 17 is gone.
    fireEvent.click(screen.getByRole('button', { name: 'Apply track count to Headliners' }));
    expect(countSelect('Alvvays').value).toBe('10');
    expect(screen.getByText('~10')).toBeInTheDocument();
  });

  it('hides Reset to Recommended while in tier-based mode', async () => {
    await renderPosterReviewArtists();

    // Tier-based mode IS the recommended state — nothing to reset.
    expect(screen.queryByRole('button', { name: /reset to recommended/i })).not.toBeInTheDocument();

    // Leaving tier-based mode reveals the reset action again.
    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    expect(screen.getByRole('button', { name: /reset to recommended/i })).toBeInTheDocument();
  });

  it('keeps a staged (unapplied) tier count across mode switches until reset', async () => {
    await renderPosterReviewArtists();

    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    const bulkInput = screen.getByLabelText('Track count for Headliners tier');
    fireEvent.change(bulkInput, { target: { value: '17' } }); // staged, not applied

    // Staging is reset-scoped, not mode-scoped: leaving and returning keeps 17.
    fireEvent.click(screen.getByRole('button', { name: /recommended \(tier-based\)/i }));
    expect(screen.queryByLabelText('Track count for Headliners tier')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    const bulkInputAfterSwitch = screen.getByLabelText('Track count for Headliners tier');
    expect((bulkInputAfterSwitch as HTMLInputElement).value).toBe('17');

    // Reset is the one action that clears it.
    fireEvent.click(screen.getByRole('button', { name: /reset to recommended/i }));
    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    expect(
      (screen.getByLabelText('Track count for Headliners tier') as HTMLInputElement).value
    ).toBe('10');
  });

  it('reset restores the custom-per-tier selector inputs to recommended defaults', async () => {
    await renderPosterReviewArtists();

    fireEvent.click(screen.getByRole('button', { name: /custom per tier/i }));
    const tierInput = screen.getByLabelText('Headliners track count');
    expect((tierInput as HTMLInputElement).value).toBe('10');
    fireEvent.change(tierInput, { target: { value: '17' } });
    expect(screen.getByText('~17')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset to recommended/i }));
    expect(screen.getByText('~10')).toBeInTheDocument();

    // Re-entering custom-per-tier shows the recommended default, not the 17.
    fireEvent.click(screen.getByRole('button', { name: /custom per tier/i }));
    expect((screen.getByLabelText('Headliners track count') as HTMLInputElement).value).toBe('10');
  });

  it('rejects invalid drafts in the bulk tier input without committing them', async () => {
    await renderPosterReviewArtists();

    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    const bulkInput = screen.getByLabelText('Track count for Headliners tier');
    fireEvent.change(bulkInput, { target: { value: '26' } });

    expect(screen.getByText('Enter a whole number from 1 to 25.')).toBeInTheDocument();
    expect(screen.getByText('~10')).toBeInTheDocument(); // estimate keeps the last committed count

    // Apply uses the last committed value (10), never the invalid draft.
    fireEvent.click(screen.getByRole('button', { name: 'Apply track count to Headliners' }));
    expect(countSelect('Alvvays').value).toBe('10');

    // Blurring reverts the field to the committed value and clears the message.
    fireEvent.blur(bulkInput);
    expect((bulkInput as HTMLInputElement).value).toBe('10');
    expect(screen.queryByText('Enter a whole number from 1 to 25.')).not.toBeInTheDocument();
  });

  it('Remove Selected drops artists from the lineup, counts, and search payload', async () => {
    await renderPosterReviewArtists([
      { name: 'Alvvays', tier: 'headliner' },
      { name: 'The Beths', tier: 'mid-tier' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    fireEvent.change(countSelect('Alvvays'), { target: { value: '17' } });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alvvays' }));
    fireEvent.click(screen.getByRole('button', { name: /remove selected \(1\)/i }));

    expect(screen.getByText('Review Artists (1)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Track count for Alvvays')).not.toBeInTheDocument();
    expect(countSelect('The Beths').value).toBe('3'); // mid-tier default, untouched

    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });

    const searchCall = mockPost.mock.calls.find(([url]) => url === '/api/search-tracks');
    expect(searchCall![1].artists.map((a: { name: string }) => a.name)).toEqual(['The Beths']);
    expect(searchCall![1].perArtistCounts).toEqual({ 'The Beths': 3 });
  });

  it('preserves independent staged overrides for multiple tiers until reset', async () => {
    await renderPosterReviewArtists([
      { name: 'Alvvays', tier: 'headliner' },
      { name: 'Men I Trust', tier: 'mid-tier' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));

    // Staging one tier must not clobber the other's staged override.
    fireEvent.change(screen.getByLabelText('Track count for Headliners tier'), {
      target: { value: '17' },
    });
    fireEvent.change(screen.getByLabelText('Track count for Mid-Tier tier'), {
      target: { value: '8' },
    });
    expect(
      (screen.getByLabelText('Track count for Headliners tier') as HTMLInputElement).value
    ).toBe('17');
    expect((screen.getByLabelText('Track count for Mid-Tier tier') as HTMLInputElement).value).toBe(
      '8'
    );

    // Reset clears every tier's staged override back to its own default.
    fireEvent.click(screen.getByRole('button', { name: /reset to recommended/i }));
    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    expect(
      (screen.getByLabelText('Track count for Headliners tier') as HTMLInputElement).value
    ).toBe('10');
    expect((screen.getByLabelText('Track count for Mid-Tier tier') as HTMLInputElement).value).toBe(
      '3'
    );
  });

  it('personalization merging does not disturb staged or applied bulk counts', async () => {
    seedPosterSession();
    let resolvePersonalize!: (value: unknown) => void;
    mockPost.mockImplementation((url: string) => {
      if (url === '/api/personalize') {
        return new Promise((resolve) => {
          resolvePersonalize = resolve;
        });
      }
      return Promise.resolve({ data: { tracks: [], artistsSearched: 1, tracksFound: 0 } });
    });
    render(<ReviewArtists />);

    await waitFor(() => {
      expect(screen.getByText('Review Artists (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    const bulkInput = screen.getByLabelText('Track count for Headliners tier');
    fireEvent.change(bulkInput, { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply track count to Headliners' }));
    expect(countSelect('Alvvays').value).toBe('17');

    // Personalization lands mid-session: the affinity merge re-renders the
    // lineup but must not clobber staged or applied counts.
    await act(async () => {
      resolvePersonalize({
        data: {
          artists: [{ name: 'Alvvays', affinity: 'loved', affinityConfidence: 0.97 }],
          lovedCount: 1,
          gemCount: 0,
          degraded: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
    });
    expect(
      (screen.getByLabelText('Track count for Headliners tier') as HTMLInputElement).value
    ).toBe('17');
    expect(countSelect('Alvvays').value).toBe('17');
    expect(screen.getByText('~17')).toBeInTheDocument();
  });
});
