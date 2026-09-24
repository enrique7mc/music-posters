import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Upload from '../../pages/upload';
import {
  PLAYLIST_DRAFT_STORAGE_KEY,
  PlaylistDraft,
  applyTextLineup,
  createPosterDraft,
  createTextDraft,
  computeSearchFingerprint,
  createRecommendedArtistReview,
} from '@/lib/playlist-draft';

const { mockPush, mockReplace, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { mockPush: push, mockReplace: replace, mockRouter: { push, replace } };
});
const mockAxiosPost = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
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
  useRouter: () => mockRouter,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('axios', () => ({
  default: { post: mockAxiosPost },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: mockApiPost },
}));

vi.mock('@/components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingScreen: ({ message }: { message?: string }) => <div>{message}</div>,
}));

// Keep the mock interactive so poster/text mode switching exercises Upload's
// real handlers without needing a native file picker.
vi.mock('@/components/features/UploadZone', () => ({
  default: ({ onFileSelect }: { onFileSelect: (file: File) => void }) => (
    <button onClick={() => onFileSelect(new File(['poster'], 'poster.png'))}>
      Select test poster
    </button>
  ),
}));

const OWNER = { userId: 'u1', platform: 'apple-music' as const };

function readStoredDraft(): PlaylistDraft | null {
  const raw = sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PlaylistDraft) : null;
}

function storeDraft(draft: PlaylistDraft) {
  sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function posterDraft(overrides: Partial<ReturnType<typeof createPosterDraft>> = {}) {
  return {
    ...createPosterDraft({
      owner: OWNER,
      artists: [{ name: 'Alvvays', tier: 'headliner' }],
      analysisProvider: 'hybrid',
      posterThumbnail: 'data:image/jpeg;base64,dGh1bWJuYWls',
      eventName: 'Test Fest',
    }),
    ...overrides,
  };
}

function textDraftWithLineup(lineup = [{ name: 'Alvvays' }, { name: 'The Beths' }]) {
  const base = createTextDraft({ owner: OWNER, manualText: lineup.map((a) => a.name).join('\n') });
  return applyTextLineup(base, lineup.map((a) => a.name).join('\n'), lineup);
}

const SEARCH_TRACKS = [
  {
    id: 't1',
    name: 'Dreams Tonite',
    artist: 'Alvvays',
    artistId: 'a1',
    album: 'Antisocialites',
    albumArtwork: null,
    duration: 240000,
    previewUrl: null,
    platformUrl: 'https://music.apple.com/t1',
    platform: 'apple-music',
  },
];

describe('upload manual artist entry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockAxiosPost.mockReset();
    mockApiPost.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores a complete text draft and navigates without analyzing an image', async () => {
    const user = userEvent.setup();
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays{enter}The Beths');
    await user.click(screen.getByRole('button', { name: /review artists/i }));

    const draft = readStoredDraft();
    expect(draft).not.toBeNull();
    expect(draft!.source.kind).toBe('text');
    expect(draft!.source.manualText).toBe('Alvvays\nThe Beths');
    expect(draft!.source.originalArtists).toEqual([{ name: 'Alvvays' }, { name: 'The Beths' }]);
    expect(draft!.artistReview.trackCountMode).toBe('per-artist');
    expect(draft!.artistReview.perArtistCounts).toEqual({ Alvvays: 5, 'The Beths': 5 });
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/review-artists');
  });

  it('shows a recoverable error and does not navigate when storage fails', async () => {
    const user = userEvent.setup();
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value
    ) {
      if (key === PLAYLIST_DRAFT_STORAGE_KEY) {
        throw new DOMException('Storage blocked', 'SecurityError');
      }
      return originalSetItem.call(this, key, value);
    });
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays');
    await user.click(screen.getByRole('button', { name: /review artists/i }));

    expect(screen.getByText('Could not save your lineup')).toBeInTheDocument();
    expect(screen.getByText(/browser blocked local storage/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/review-artists');
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    setItemSpy.mockRestore();
  });

  it('still confirms before discarding typed text when storage is blocked', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays');

    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /upload a poster instead/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/artists, one per line/i)).toHaveValue('Alvvays');
  });

  it('restores the exact manual text draft on remount (refresh / Back)', async () => {
    storeDraft(textDraftWithLineup());
    render(<Upload />);

    expect(await screen.findByLabelText(/artists, one per line/i)).toHaveValue(
      'Alvvays\nThe Beths'
    );
    expect(screen.queryByText(/start your playlist/i)).not.toBeInTheDocument();
  });

  it('cancel keeps a populated text draft when switching to poster input', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays');
    await user.click(screen.getByRole('button', { name: /upload a poster instead/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Cancelled switch: the text screen and its draft survive untouched.
    expect(screen.getByLabelText(/artists, one per line/i)).toHaveValue('Alvvays');
    expect(readStoredDraft()?.source.manualText).toBe('Alvvays');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('confirm clears the text draft when switching to poster input', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Upload />);

    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    await user.type(screen.getByLabelText(/artists, one per line/i), 'Alvvays');
    await user.click(screen.getByRole('button', { name: /upload a poster instead/i }));

    expect(screen.getByRole('button', { name: /select test poster/i })).toBeInTheDocument();
    expect(readStoredDraft()).toBeNull();
  });

  it('re-submitting the same text keeps downstream artist-review edits', async () => {
    const user = userEvent.setup();
    const draft = textDraftWithLineup();
    // Simulate edits made on the review page.
    draft.artistReview.trackSelectionMode = 'balanced';
    draft.artistReview.perArtistCounts = { Alvvays: 7, 'The Beths': 5 };
    storeDraft(draft);
    render(<Upload />);

    await user.click(await screen.findByRole('button', { name: /review artists/i }));

    const stored = readStoredDraft();
    expect(stored?.artistReview.trackSelectionMode).toBe('balanced');
    expect(stored?.artistReview.perArtistCounts).toEqual({ Alvvays: 7, 'The Beths': 5 });
    expect(mockPush).toHaveBeenCalledWith('/review-artists');
  });

  it('marks poster input without failing analysis when storage is restricted', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    mockAxiosPost.mockResolvedValue({
      data: { artists: [], rawText: '', provider: 'vision', eventName: 'Test Fest' },
    });
    render(<Upload />);

    fireEvent.click(screen.getByRole('button', { name: /upload a poster/i }));
    fireEvent.click(screen.getByRole('button', { name: /select test poster/i }));

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/api/analyze',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/no artists found in the image/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/error analyzing image/i)).not.toBeInTheDocument();
  });

  it('stores the complete analyzed poster result and removes legacy flow keys', async () => {
    sessionStorage.setItem('artists', JSON.stringify([{ name: 'Stale Artist' }]));
    sessionStorage.setItem('posterThumbnail', 'stale-thumbnail');
    sessionStorage.setItem('tracks', '[]');
    sessionStorage.setItem('inputSource', 'text');
    sessionStorage.setItem('returnAfterAuth', 'keep-auth-state');
    mockAxiosPost.mockResolvedValue({
      data: {
        artists: [{ name: 'Alvvays', tier: 'headliner' }],
        rawText: 'Alvvays',
        provider: 'hybrid',
        posterThumbnail: 'data:image/jpeg;base64,dGh1bWJuYWls',
        eventName: 'Test Fest',
      },
    });
    render(<Upload />);

    fireEvent.click(screen.getByRole('button', { name: /upload a poster/i }));
    fireEvent.click(screen.getByRole('button', { name: /select test poster/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /quick create playlist/i })).toBeInTheDocument();
    });

    const draft = readStoredDraft();
    expect(draft).not.toBeNull();
    expect(draft!.owner).toEqual(OWNER);
    expect(draft!.source.kind).toBe('poster');
    expect(draft!.source.originalArtists).toEqual([{ name: 'Alvvays', tier: 'headliner' }]);
    expect(draft!.source.analysisProvider).toBe('hybrid');
    expect(draft!.source.posterThumbnail).toBe('data:image/jpeg;base64,dGh1bWJuYWls');
    expect(draft!.source.eventName).toBe('Test Fest');
    expect(draft!.artistReview.trackCountMode).toBe('tier-based');
    // Legacy per-key flow data died with the write; auth state survives.
    expect(sessionStorage.getItem('artists')).toBeNull();
    expect(sessionStorage.getItem('posterThumbnail')).toBeNull();
    expect(sessionStorage.getItem('tracks')).toBeNull();
    expect(sessionStorage.getItem('inputSource')).toBeNull();
    expect(sessionStorage.getItem('returnAfterAuth')).toBe('keep-auth-state');
  });

  it('restores a completed poster analysis without re-analyzing', async () => {
    storeDraft(posterDraft());
    render(<Upload />);

    // Result state with the stored thumbnail, not the chooser or drop zone.
    expect(await screen.findByAltText('Festival Poster')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,dGh1bWJuYWls'
    );
    expect(screen.getByText('Alvvays')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick create playlist/i })).toBeInTheDocument();
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('shows a neutral placeholder when the restored draft has no thumbnail', async () => {
    const draft = posterDraft();
    delete draft.source.posterThumbnail;
    storeDraft(draft);
    render(<Upload />);

    expect(await screen.findByText('Poster preview unavailable')).toBeInTheDocument();
    expect(screen.getByText('Alvvays')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick create playlist/i })).toBeInTheDocument();
  });

  it('replaces an analyzed poster only after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    storeDraft(posterDraft());
    render(<Upload />);

    fireEvent.click(await screen.findByRole('button', { name: /upload different poster/i }));

    // Cancel: the analyzed result and its draft survive.
    expect(readStoredDraft()).not.toBeNull();
    expect(screen.getByText('Alvvays')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /upload different poster/i }));

    expect(readStoredDraft()).toBeNull();
    expect(screen.getByRole('button', { name: /select test poster/i })).toBeInTheDocument();
    expect(screen.queryByText('Alvvays')).not.toBeInTheDocument();
  });

  it('disables poster completion actions and shows a recoverable error when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    mockAxiosPost.mockResolvedValue({
      data: { artists: [{ name: 'Alvvays' }], rawText: '', provider: 'vision' },
    });
    render(<Upload />);

    fireEvent.click(screen.getByRole('button', { name: /upload a poster/i }));
    fireEvent.click(screen.getByRole('button', { name: /select test poster/i }));

    await waitFor(() => {
      expect(screen.getByText('Browser storage unavailable')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /quick create playlist/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /customize artists/i })).toBeDisabled();
  });

  it('does not report a blocked draft write as a track-search failure', async () => {
    const user = userEvent.setup();
    const originalSetItem = Storage.prototype.setItem;
    // The analysis-time draft write succeeds, but the track-review write
    // (quick create) is blocked — the failure must surface as a storage
    // error, never as a track-search API error.
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
    mockAxiosPost.mockResolvedValue({
      data: { artists: [{ name: 'Alvvays' }], rawText: '', provider: 'vision' },
    });
    mockApiPost.mockResolvedValue({ data: { tracks: SEARCH_TRACKS } });
    render(<Upload />);

    fireEvent.click(screen.getByRole('button', { name: /upload a poster/i }));
    fireEvent.click(screen.getByRole('button', { name: /select test poster/i }));

    await user.click(await screen.findByRole('button', { name: /quick create playlist/i }));

    await waitFor(() => {
      expect(screen.getByText('Browser storage unavailable')).toBeInTheDocument();
    });
    expect(mockApiPost).toHaveBeenCalledWith('/api/search-tracks', {
      artists: [{ name: 'Alvvays' }],
      trackCountMode: 'tier-based',
      trackSelectionMode: 'popular',
    });
    expect(mockPush).not.toHaveBeenCalledWith('/review-tracks');
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    setItemSpy.mockRestore();
  });

  it('quick create stores a recommended artist review and fully-selected track review', async () => {
    const user = userEvent.setup();
    storeDraft(posterDraft());
    mockApiPost.mockResolvedValue({
      data: { tracks: SEARCH_TRACKS, warnings: ['"X" was not found on Apple Music'] },
    });
    render(<Upload />);

    await user.click(await screen.findByRole('button', { name: /quick create playlist/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });

    const draft = readStoredDraft();
    expect(draft!.artistReview.artists).toEqual([{ name: 'Alvvays', tier: 'headliner' }]);
    expect(draft!.artistReview.trackCountMode).toBe('tier-based');
    expect(draft!.trackReview).toBeDefined();
    expect(draft!.trackReview!.tracks).toEqual(SEARCH_TRACKS);
    expect(draft!.trackReview!.selectedTrackIds).toEqual(['t1']);
    expect(draft!.trackReview!.warnings).toEqual(['"X" was not found on Apple Music']);
    // Event name from the analyzed poster becomes the default playlist name.
    expect(draft!.trackReview!.playlistName).toBe('Test Fest');
    // The stored fingerprint matches the recommended inputs actually searched.
    const recommended = createRecommendedArtistReview(
      [{ name: 'Alvvays', tier: 'headliner' }],
      'poster'
    );
    expect(draft!.trackReview!.searchFingerprint).toBe(
      computeSearchFingerprint({
        artists: recommended.artists,
        trackCountMode: recommended.trackCountMode,
        trackSelectionMode: recommended.trackSelectionMode,
        tierCounts: recommended.tierCounts,
        perArtistCounts: recommended.perArtistCounts,
      })
    );
  });

  it('quick create reuses a matching stored search without another API call', async () => {
    const user = userEvent.setup();
    const draft = posterDraft();
    const recommended = createRecommendedArtistReview(draft.source.originalArtists, 'poster');
    draft.artistReview = recommended;
    draft.trackReview = {
      searchFingerprint: computeSearchFingerprint({
        artists: recommended.artists,
        trackCountMode: recommended.trackCountMode,
        trackSelectionMode: recommended.trackSelectionMode,
        tierCounts: recommended.tierCounts,
        perArtistCounts: recommended.perArtistCounts,
      }),
      tracks: SEARCH_TRACKS as never,
      selectedTrackIds: [],
      warnings: [],
      playlistName: 'Kept Name',
    };
    storeDraft(draft);
    render(<Upload />);

    await user.click(await screen.findByRole('button', { name: /quick create playlist/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-tracks');
    });
    expect(mockApiPost).not.toHaveBeenCalled();
    // The stored selections/name stay exactly as they were.
    const stored = readStoredDraft();
    expect(stored!.trackReview!.selectedTrackIds).toEqual([]);
    expect(stored!.trackReview!.playlistName).toBe('Kept Name');
  });

  it('customize artists navigates without overwriting stored review edits', async () => {
    const user = userEvent.setup();
    const draft = posterDraft();
    draft.artistReview.artists = [
      { name: 'Alvvays', tier: 'headliner' },
      { name: 'The Beths', tier: 'mid-tier' },
    ];
    draft.artistReview.perArtistCounts = { Alvvays: 4, 'The Beths': 2 };
    storeDraft(draft);
    render(<Upload />);

    await user.click(await screen.findByRole('button', { name: /customize artists/i }));

    expect(mockPush).toHaveBeenCalledWith('/review-artists');
    const stored = readStoredDraft();
    expect(stored!.artistReview.artists).toHaveLength(2);
    expect(stored!.artistReview.perArtistCounts).toEqual({ Alvvays: 4, 'The Beths': 2 });
  });

  it('start over cancel preserves everything; confirm clears flow state and stays on upload', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    sessionStorage.setItem('returnAfterAuth', 'keep-auth-state');
    storeDraft(posterDraft());
    render(<Upload />);

    await user.click(await screen.findByRole('button', { name: /start over/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(readStoredDraft()).not.toBeNull();
    expect(screen.getByText('Alvvays')).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /start over/i }));

    expect(readStoredDraft()).toBeNull();
    expect(sessionStorage.getItem('returnAfterAuth')).toBe('keep-auth-state');
    expect(mockReplace).toHaveBeenCalledWith('/upload');
    expect(await screen.findByText(/start your playlist/i)).toBeInTheDocument();
    expect(screen.queryByText('Alvvays')).not.toBeInTheDocument();

    // The in-memory draft mirror was cleared too, so beginning the next flow
    // does not ask the user to confirm the same discard a second time.
    await user.click(screen.getByRole('button', { name: /enter artists/i }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/artists, one per line/i)).toBeInTheDocument();
  });

  it('clears another user’s draft instead of showing it', () => {
    const foreign = posterDraft();
    foreign.owner = { userId: 'someone-else', platform: 'apple-music' };
    storeDraft(foreign);

    render(<Upload />);

    expect(screen.getByText(/start your playlist/i)).toBeInTheDocument();
    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    expect(mockPush).not.toHaveBeenCalledWith('/review-artists');
  });
});
