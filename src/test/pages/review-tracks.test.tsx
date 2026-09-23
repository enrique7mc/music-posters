import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewTracks from '../../pages/review-tracks';
import type { Track } from '@/types';
import {
  PLAYLIST_DRAFT_STORAGE_KEY,
  PlaylistDraft,
  createPosterDraft,
  createRecommendedArtistReview,
} from '@/lib/playlist-draft';

const { mockPush, mockReplace, mockRouter } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return {
    mockPush: push,
    mockReplace: replace,
    mockRouter: { push, replace, isReady: true, query: {} as Record<string, string> },
  };
});
const mockAxiosPost = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => ({
  user: { id: 'u1', displayName: 'Test User', platform: 'apple-music' },
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

const OWNER = { userId: 'u1', platform: 'apple-music' as const };

const TRACKS: Track[] = [
  {
    id: 'track-1',
    name: 'Archie, Marry Me',
    artist: 'Alvvays',
    artistId: 'artist-1',
    album: 'Alvvays',
    albumArtwork: null,
    duration: 252_000,
    previewUrl: null,
    platformUrl: 'https://music.apple.com/track-1',
    platform: 'apple-music',
  },
  {
    id: 'track-2',
    name: 'Dreams Tonite',
    artist: 'Alvvays',
    artistId: 'artist-1',
    album: 'Antisocialites',
    albumArtwork: null,
    duration: 240_000,
    previewUrl: null,
    platformUrl: 'https://music.apple.com/track-2',
    platform: 'apple-music',
  },
];

function readStoredDraft(): PlaylistDraft | null {
  const raw = sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PlaylistDraft) : null;
}

/** Matches the "{selected} of {total}" counter (its text spans child nodes). */
function selectedCountText(text: string) {
  return screen.getByText(
    (_, element) =>
      !!element &&
      element.classList.contains('text-4xl') &&
      element.textContent?.replace(/\s+/g, ' ').trim() === text
  );
}

function seedTrackReviewDraft(overrides: Partial<PlaylistDraft['trackReview']> = {}) {
  const artists = [{ name: 'Alvvays', tier: 'headliner' as const }];
  const draft = createPosterDraft({
    owner: OWNER,
    artists,
    analysisProvider: 'hybrid',
    posterThumbnail: null,
    eventName: null,
  });
  draft.artistReview = createRecommendedArtistReview(artists, 'poster');
  draft.trackReview = {
    searchFingerprint: 'seeded-fingerprint',
    tracks: TRACKS,
    selectedTrackIds: TRACKS.map((t) => t.id),
    warnings: [],
    playlistName: 'Seeded Mix',
    ...overrides,
  };
  sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  return draft;
}

describe('review-tracks hydration from the playlist draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockAxiosPost.mockReset();
    mockApiPost.mockReset();
    mockAxiosPost.mockResolvedValue({ data: { coverPreview: '' } });
  });

  it('restores tracks, exact selections, warnings, and playlist name', async () => {
    seedTrackReviewDraft({
      selectedTrackIds: ['track-2'],
      warnings: ['"Nobody" was not found on Apple Music'],
      playlistName: 'My Edited Mix',
    });

    render(<ReviewTracks />);

    expect(await screen.findByLabelText('Playlist Name')).toHaveValue('My Edited Mix');
    expect(selectedCountText('1 of 2')).toBeInTheDocument(); // only track-2 selected
    expect(screen.getByText(/"Nobody" was not found on Apple Music/i)).toBeInTheDocument();
    expect(screen.getByText('Archie, Marry Me')).toBeInTheDocument();
    expect(screen.getByText('Dreams Tonite')).toBeInTheDocument();
  });

  it('drops stale selected IDs that no longer map to an available track', async () => {
    seedTrackReviewDraft({ selectedTrackIds: ['track-1', 'ghost-id'] });

    render(<ReviewTracks />);

    await waitFor(() => {
      expect(selectedCountText('1 of 2')).toBeInTheDocument();
    });
  });

  it('Back to Edit goes to /review-artists and leaves the draft untouched', async () => {
    const draft = seedTrackReviewDraft({ selectedTrackIds: ['track-1'] });

    render(<ReviewTracks />);
    fireEvent.click(await screen.findByRole('button', { name: /back to edit/i }));

    expect(mockPush).toHaveBeenCalledWith('/review-artists');
    expect(mockPush).not.toHaveBeenCalledWith('/upload');
    expect(readStoredDraft()).toEqual(draft);
  });

  it('persists toggles, select-all, deselect-all, and playlist-name edits', async () => {
    seedTrackReviewDraft();
    const user = userEvent.setup();

    render(<ReviewTracks />);
    await waitFor(() => {
      expect(selectedCountText('2 of 2')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Archie, Marry Me'));
    expect(readStoredDraft()?.trackReview?.selectedTrackIds).toEqual(['track-2']);

    await user.click(screen.getByRole('button', { name: /deselect all/i }));
    expect(readStoredDraft()?.trackReview?.selectedTrackIds).toEqual([]);

    await user.click(screen.getByRole('button', { name: /^select all$/i }));
    expect(readStoredDraft()?.trackReview?.selectedTrackIds).toEqual(['track-1', 'track-2']);

    await user.clear(screen.getByLabelText('Playlist Name'));
    await user.type(screen.getByLabelText('Playlist Name'), 'Renamed Live');
    expect(readStoredDraft()?.trackReview?.playlistName).toBe('Renamed Live');
  });

  it('no longer removes warnings while loading (they survive hydration)', async () => {
    seedTrackReviewDraft({ warnings: ['"X" was not found on Apple Music'] });

    render(<ReviewTracks />);

    expect(await screen.findByText(/"X" was not found on Apple Music/i)).toBeInTheDocument();
    // Still present after the page settles — dismissal is explicit.
    await waitFor(() => {
      expect(screen.getByLabelText('Playlist Name')).toHaveValue('Seeded Mix');
    });
    expect(screen.getByText(/"X" was not found on Apple Music/i)).toBeInTheDocument();
  });

  it('redirects to /review-artists when tracks are missing but artists remain', async () => {
    const draft = seedTrackReviewDraft();
    delete draft.trackReview;
    sessionStorage.setItem(PLAYLIST_DRAFT_STORAGE_KEY, JSON.stringify(draft));

    render(<ReviewTracks />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/review-artists');
    });
  });

  it('redirects to /upload when no draft exists', async () => {
    render(<ReviewTracks />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/upload');
    });
  });

  it('start over clears the draft and replaces the route to upload', async () => {
    seedTrackReviewDraft();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ReviewTracks />);
    fireEvent.click(await screen.findByRole('button', { name: /start over/i }));

    expect(sessionStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/upload');
    confirmSpy.mockRestore();
  });

  it('enforces the playlist track cap on restored selections', async () => {
    const manyTracks = Array.from({ length: 2001 }, (_, i) => ({
      ...TRACKS[0],
      id: `track-${i}`,
      name: `Track ${i}`,
    }));
    seedTrackReviewDraft({
      tracks: manyTracks,
      selectedTrackIds: manyTracks.map((t) => t.id),
    });

    render(<ReviewTracks />);

    expect(await screen.findByText(/too many tracks selected \(2001\/2000\)/i)).toBeInTheDocument();
    // Creation stays blocked until the restored selection is under the cap.
    expect(
      screen.getByRole('button', { name: /create playlist with 2001 tracks/i })
    ).toBeDisabled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('renders completed stepper steps as links to earlier flow pages', async () => {
    seedTrackReviewDraft();

    render(<ReviewTracks />);

    const uploadLink = await screen.findByRole('link', { name: /back to upload/i });
    expect(uploadLink).toHaveAttribute('href', '/upload');
    expect(screen.getByRole('link', { name: /back to review artists/i })).toHaveAttribute(
      'href',
      '/review-artists'
    );
    // Current and future steps stay non-interactive.
    expect(screen.queryByRole('link', { name: /review tracks/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /done/i })).not.toBeInTheDocument();
  });
});
