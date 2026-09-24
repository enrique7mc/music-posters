import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ReviewArtists from '../../pages/review-artists';
import {
  PLAYLIST_DRAFT_STORAGE_KEY,
  PlaylistDraft,
  applyTextLineup,
  computeSearchFingerprint,
  createPosterDraft,
  createTextDraft,
} from '@/lib/playlist-draft';

// --- Module mocks (hoisted) -------------------------------------------------

const { mockPush, mockReplace, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { mockPush: push, mockReplace: replace, mockRouter: { push, replace } };
});
const mockPost = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => ({
  user: {
    id: 'us',
    draftOwnerId: 'u1',
    displayName: 'Test User',
    platform: 'apple-music',
  },
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

const OWNER = { userId: 'u1', platform: 'apple-music' as const };

const TEXT_LINEUP = [{ name: 'Alvvays' }, { name: 'The Beths' }, { name: 'Men I Trust' }];

function makeTrack(id: string, name: string) {
  return {
    id,
    name,
    artist: 'Alvvays',
    artistId: 'alvvays-id',
    album: 'Test Album',
    albumArtwork: null,
    duration: 180_000,
    previewUrl: null,
    platformUrl: `https://music.apple.com/track/${id}`,
    platform: 'apple-music' as const,
  };
}

function storeDraft(draft: PlaylistDraft) {
  sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function readStoredDraft(): PlaylistDraft | null {
  const raw = sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PlaylistDraft) : null;
}

function makeTextDraft(artists = TEXT_LINEUP) {
  const manualText = artists.map((a) => a.name).join('\n');
  return applyTextLineup(createTextDraft({ owner: OWNER, manualText }), manualText, artists);
}

function makePosterDraft(
  artists: { name: string; tier: string }[] = [{ name: 'Alvvays', tier: 'headliner' }]
) {
  return createPosterDraft({
    owner: OWNER,
    artists: artists.map((a) => ({ name: a.name, tier: a.tier as never })) as never,
    analysisProvider: 'gemini',
  });
}

function seedTextSession(artists = TEXT_LINEUP) {
  storeDraft(makeTextDraft(artists));
}

function seedPosterSession(
  artists: { name: string; tier: string }[] = [{ name: 'Alvvays', tier: 'headliner' }]
) {
  storeDraft(makePosterDraft(artists));
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
    mockReplace.mockReset();
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

  it('adjusts counts with the stepper and stops at the 1–25 limits', async () => {
    seedTextSession();
    await renderReviewArtists();

    const decrease = screen.getByRole('button', { name: 'Decrease Track count for Alvvays' });
    const increase = screen.getByRole('button', { name: 'Increase Track count for Alvvays' });

    fireEvent.click(increase);
    expect(countSelect('Alvvays').value).toBe('6');
    expect(screen.getByText('~16')).toBeInTheDocument();

    fireEvent.keyDown(countSelect('Alvvays'), { key: 'ArrowDown' });
    expect(countSelect('Alvvays').value).toBe('5');

    fireEvent.change(countSelect('Alvvays'), { target: { value: '1' } });
    expect(decrease).toBeDisabled();
    fireEvent.change(countSelect('Alvvays'), { target: { value: '25' } });
    expect(increase).toBeDisabled();
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

    expect(screen.getByText('Whole numbers 1–25')).toBeInTheDocument();
    // Nothing invalid enters application state: the estimate keeps the last
    // committed count (5 + 5 + 5).
    expect(screen.getByText('~15')).toBeInTheDocument();

    // Blurring reverts the field to the last committed value and clears the message.
    fireEvent.blur(countSelect('Alvvays'));
    expect(countSelect('Alvvays').value).toBe('5');
    expect(screen.queryByText('Whole numbers 1–25')).not.toBeInTheDocument();
  });

  it('treats zero and fractions as invalid editing states, not values', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.change(countSelect('The Beths'), { target: { value: '0' } });
    expect(countSelect('The Beths').value).toBe('0'); // temporary editing state
    expect(screen.getByText('Whole numbers 1–25')).toBeInTheDocument();
    expect(screen.getByText('~15')).toBeInTheDocument();
    fireEvent.blur(countSelect('The Beths'));
    expect(countSelect('The Beths').value).toBe('5');

    fireEvent.change(countSelect('The Beths'), { target: { value: '2.5' } });
    expect(screen.getByText('Whole numbers 1–25')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /reset to recommended/i }));

    expect(countSelect('__proto__').value).toBe('5');
    const stored = readStoredDraft();
    expect(
      Object.prototype.hasOwnProperty.call(stored?.artistReview.perArtistCounts, '__proto__')
    ).toBe(true);
    expect(stored?.artistReview.perArtistCounts['__proto__']).toBe(5);
  });
});

describe('review-artists with a poster lineup (regression guard)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
    mockReplace.mockReset();
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

  it('redirects to /upload when no draft exists (instead of crashing on defaults)', async () => {
    render(<ReviewArtists />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/upload');
    });
  });

  it('redirects to /upload when the draft belongs to another user', async () => {
    const draft = makePosterDraft();
    draft.owner = { userId: 'someone-else', platform: 'apple-music' };
    storeDraft(draft);

    render(<ReviewArtists />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/upload');
    });
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
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

    expect(screen.getByText('Whole numbers 1–25')).toBeInTheDocument();
    expect(screen.getByText('~10')).toBeInTheDocument(); // estimate keeps the last committed count

    // Apply uses the last committed value (10), never the invalid draft.
    fireEvent.click(screen.getByRole('button', { name: 'Apply track count to Headliners' }));
    expect(countSelect('Alvvays').value).toBe('10');

    // Blurring reverts the field to the committed value and clears the message.
    fireEvent.blur(bulkInput);
    expect((bulkInput as HTMLInputElement).value).toBe('10');
    expect(screen.queryByText('Whole numbers 1–25')).not.toBeInTheDocument();
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

describe('review-artists draft persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
    mockPost.mockReset();
    stubApi();
  });

  it('restores artist removals, counts, selection mode, and staged bulk edits', async () => {
    const draft = makePosterDraft([
      { name: 'Alvvays', tier: 'headliner' },
      { name: 'The Beths', tier: 'mid-tier' },
    ]);
    draft.artistReview.artists = [{ name: 'Alvvays', tier: 'headliner' }]; // The Beths removed
    draft.artistReview.trackCountMode = 'per-artist';
    draft.artistReview.perArtistCounts = { Alvvays: 12 };
    draft.artistReview.stagedTierCounts = { headliner: 9 };
    draft.artistReview.trackSelectionMode = 'balanced';
    storeDraft(draft);

    render(<ReviewArtists />);

    await waitFor(() => {
      expect(screen.getByText('Review Artists (1)')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Track count for The Beths')).not.toBeInTheDocument();
    expect(countSelect('Alvvays').value).toBe('12');
    expect(screen.getByText('~12')).toBeInTheDocument();

    // Staged bulk edits survive the remount.
    const bulkInput = await screen.findByLabelText('Track count for Headliners tier');
    expect((bulkInput as HTMLInputElement).value).toBe('9');
  });

  it('does not re-run personalization when a completed result is stored', async () => {
    const draft = makePosterDraft([{ name: 'Alvvays', tier: 'headliner' }]);
    draft.artistReview.artists = [{ name: 'Alvvays', tier: 'headliner', affinity: 'loved' }];
    draft.artistReview.personalization = { status: 'complete', lovedCount: 1, gemCount: 0 };
    storeDraft(draft);

    render(<ReviewArtists />);

    // Continue is enabled immediately (no personalize round trip to wait for).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
    });

    expect(mockPost).not.toHaveBeenCalledWith('/api/personalize', expect.anything());
  });

  it('persists a completed personalization result into the draft', async () => {
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
      const stored = readStoredDraft();
      expect(stored?.artistReview.personalization).toEqual({
        status: 'complete',
        lovedCount: 1,
        gemCount: 0,
      });
      expect(stored?.artistReview.artists[0].affinity).toBe('loved');
    });
  });

  it('Back to Upload navigates without clearing or rewriting the draft', async () => {
    // Personalization is already stored, so nothing writes between mount and Back.
    const draft = makePosterDraft();
    draft.artistReview.personalization = { status: 'complete', lovedCount: 0, gemCount: 0 };
    storeDraft(draft);

    render(<ReviewArtists />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to upload/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /back to upload/i }));

    expect(mockPush).toHaveBeenCalledWith('/upload');
    expect(readStoredDraft()).toEqual(draft);
  });

  it('reuses stored track results when the fingerprint is unchanged (no new search)', async () => {
    // The stored lineup already carries the personalization merge (affinity),
    // which is part of the fingerprint — matching real post-personalize state.
    const draft = makePosterDraft();
    draft.artistReview.artists = [{ name: 'Alvvays', tier: 'headliner', affinity: 'loved' }];
    draft.artistReview.personalization = { status: 'complete', lovedCount: 1, gemCount: 0 };
    const fingerprint = computeSearchFingerprint({
      artists: draft.artistReview.artists,
      trackCountMode: 'tier-based',
      trackSelectionMode: 'popular',
    });
    draft.trackReview = {
      searchFingerprint: fingerprint,
      tracks: [makeTrack('t1', 'Dreams Tonite')],
      selectedTrackIds: ['t1'],
      warnings: [],
      playlistName: 'Edited Name',
    };
    storeDraft(draft);

    render(<ReviewArtists />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });

    const searchCalls = mockPost.mock.calls.filter(([url]) => url === '/api/search-tracks');
    expect(searchCalls).toHaveLength(0);
    // Stored selections and playlist name are preserved verbatim.
    expect(readStoredDraft()?.trackReview?.playlistName).toBe('Edited Name');
    expect(readStoredDraft()?.trackReview?.selectedTrackIds).toEqual(['t1']);
  });

  it('a material change triggers exactly one new search and preserves the playlist name', async () => {
    const draft = makePosterDraft([{ name: 'Alvvays', tier: 'headliner' }]);
    draft.trackReview = {
      searchFingerprint: 'stale-fingerprint',
      tracks: [makeTrack('old-1', 'Old Track')],
      selectedTrackIds: ['old-1'],
      warnings: ['stale warning'],
      playlistName: 'Edited Name',
    };
    storeDraft(draft);

    mockPost.mockImplementation((url: string) => {
      if (url === '/api/personalize') {
        return Promise.resolve({
          data: { artists: [], lovedCount: 0, gemCount: 0, degraded: false },
        });
      }
      return Promise.resolve({
        data: {
          tracks: [makeTrack('new-1', 'New Track'), makeTrack('new-2', 'Other Track')],
          warnings: ['"X" was not found on Apple Music'],
        },
      });
    });

    render(<ReviewArtists />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
    });

    // Material change: switch to per-artist mode with a custom count.
    fireEvent.click(screen.getByRole('button', { name: /per-artist/i }));
    fireEvent.change(countSelect('Alvvays'), { target: { value: '7' } });

    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });

    const searchCalls = mockPost.mock.calls.filter(([url]) => url === '/api/search-tracks');
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0][1].trackCountMode).toBe('per-artist');
    expect(searchCalls[0][1].perArtistCounts).toEqual({ Alvvays: 7 });

    const stored = readStoredDraft();
    expect(stored?.trackReview?.tracks.map((t) => t.id)).toEqual(['new-1', 'new-2']);
    expect(stored?.trackReview?.selectedTrackIds).toEqual(['new-1', 'new-2']);
    expect(stored?.trackReview?.warnings).toEqual(['"X" was not found on Apple Music']);
    expect(stored?.trackReview?.playlistName).toBe('Edited Name');
  });

  it('persisting mutations to the draft (removals, counts, selection mode)', async () => {
    seedTextSession();
    await renderReviewArtists();

    fireEvent.change(countSelect('Alvvays'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select The Beths' }));
    fireEvent.click(screen.getByRole('button', { name: /remove selected \(1\)/i }));

    const stored = readStoredDraft();
    expect(stored?.artistReview.artists.map((a) => a.name)).toEqual(['Alvvays', 'Men I Trust']);
    expect(stored?.artistReview.perArtistCounts).toEqual({ Alvvays: 10, 'Men I Trust': 5 });
    expect(stored?.artistReview.perArtistCounts['The Beths']).toBeUndefined();
  });

  it('blocks Continue with the storage error when the required write fails', async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key === PLAYLIST_DRAFT_STORAGE_KEY && value.includes('"trackReview"')) {
        throw new DOMException('Storage blocked', 'SecurityError');
      }
      return originalSetItem.call(this, key, value);
    });
    seedPosterSession();
    mockPost.mockImplementation((url: string) => {
      if (url === '/api/personalize') {
        return Promise.resolve({
          data: { artists: [], lovedCount: 0, gemCount: 0, degraded: false },
        });
      }
      return Promise.resolve({ data: { tracks: [{ id: 't1', name: 'T', artist: 'A' }] } });
    });

    render(<ReviewArtists />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /search tracks & continue/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /search tracks & continue/i }));

    await waitFor(() => {
      expect(screen.getByText('Browser storage unavailable')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalledWith('/review-tracks');
    setItemSpy.mockRestore();
  });

  it('start over clears the draft and replaces the route to upload', async () => {
    seedPosterSession();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ReviewArtists />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/upload');
    confirmSpy.mockRestore();
  });
});
