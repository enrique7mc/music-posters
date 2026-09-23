# Plan: Preserve Playlist Progress Across Steps

## Status

Implemented on 2026-09-22. Automated verification is complete; the live Apple
Music acceptance walkthrough remains a manual check because it requires real
MusicKit credentials and an authenticated library.

## Goal

Preserve an authenticated user's in-progress playlist while they move backward and
forward through Upload, Review Artists, and Review Tracks. The draft must survive
page remounts, browser Back/Forward, and refreshes in the current tab. Users must
also have an explicit, confirmed way to discard the draft and begin again.

This remains a stateless application: the draft lives only in `sessionStorage`.
There is no database, server-side draft, account sync, or persistence after the tab
is closed.

## Locked product decisions

1. Draft lifetime is the current browser tab/session.
2. **Back** from Review Tracks goes to Review Artists, the immediately preceding
   step.
3. **Start over** asks for confirmation, clears playlist-flow data only, and
   returns to the empty Upload chooser.

## Current behavior and root cause

- `src/pages/upload.tsx` owns its input mode, manual text, analyzed artists,
  provider, preview, and quick-create settings in component state. It writes only
  selected values into several independent `sessionStorage` keys and does not
  restore them when the page mounts.
- `src/pages/review-artists.tsx` restores the lineup and poster metadata, but
  recreates track-count, selection-mode, staged bulk, and personalization state
  from defaults on every mount. Its Back button navigates to `/upload`, where the
  prior source is not restored.
- `src/pages/review-tracks.tsx` restores available tracks, but selects every track
  again, recreates the playlist name, consumes/removes warnings, and sends **Back
  to Edit** directly to `/upload`.
- Flow data is split across `artists`, `analysisProvider`, `posterThumbnail`,
  `eventName`, `tracks`, `trackWarnings`, and `inputSource`. Because writes and
  clears happen independently, partial or stale combinations are possible.
- `ProgressStepper` declares an unused `href` field, so completed steps look like
  progress indicators but cannot navigate.
- The success page clears only part of the flow state, leaving older artist data
  behind.

## Desired behavior

### Upload

- A manual-entry draft restores the selected text mode and exact textarea value.
- A completed poster analysis restores the analyzed artist list, provider, event
  name, and poster thumbnail without calling `/api/analyze` again.
- The original `File` and blob URL are not persisted. The existing 300x300 base64
  thumbnail is used as the restored preview. If thumbnail generation failed, show
  a neutral poster placeholder while retaining the artist results.
- Navigating back does not clear artist-review or track-review work.
- Choosing a genuinely new source (new poster, replacing an analyzed poster, or
  switching from a populated source to the other input method) is destructive and
  uses the same confirmation behavior as Start over. Merely switching modes before
  entering/analyzing anything does not need confirmation.

### Review Artists

- Restore the working artist list, removals, affinity annotations, track-count
  mode, tier counts, per-artist counts, staged bulk-tier inputs, and track
  selection mode.
- Do not rerun Apple Music personalization when a completed or degraded result is
  already stored. If the user left while the request was in flight, do not persist
  the loading state; retry when they return.
- Back goes to `/upload` without mutating the draft.
- Continuing with the same effective search inputs reuses the stored track results
  and returns to Review Tracks without another `/api/search-tracks` request.
- Continuing after a material artist/search-setting change performs a new search,
  replaces available tracks and warnings, and selects all returned tracks. Preserve
  the independently edited playlist name.

### Review Tracks

- Restore the available tracks, exact selected-track IDs, playlist name, and
  warnings. Cover preview remains derived and may regenerate.
- Card/list view remains the existing user preference in `localStorage`; it is not
  part of the playlist draft.
- Back goes to `/review-artists` and does not clear or rewrite track selections.
- Completed Upload and Review Artists steps in the progress stepper are navigable;
  future steps are not.

### Start over and completion

- Show a visible **Start over** action on each non-empty flow page.
- Confirmation copy should make the consequence explicit, for example: “Start
  over? Your uploaded poster, artist edits, and track selections will be cleared.”
- Cancel closes the browser confirmation and changes nothing.
- Confirm clears only the playlist draft and obsolete flow keys, resets in-memory
  page state, and uses `router.replace('/upload')` so the discarded page is not
  immediately reintroduced by browser Back.
- Preserve auth cookies, `returnAfterAuth`, theme, and `trackViewMode`.
- After a successful logout, clear the playlist draft so another account in the
  same tab cannot inherit it.
- Clear the complete draft only after `/success` mounts. **Create another** then
  opens a clean Upload chooser.

## Draft model and storage contract

Add a client-only storage module, suggested path:
`src/lib/playlist-draft.ts`.

Use one versioned, namespaced key such as
`playlistd:playlist-draft:v1`. A single serialized object makes writes coherent and
gives future schema changes an explicit migration boundary.

The exact names may change during implementation, but the stored information must
cover this contract:

```ts
interface PlaylistDraftV1 {
  version: 1;
  updatedAt: number;
  owner: {
    userId: string;
    platform: MusicPlatform;
  };
  source: {
    kind: ArtistInputSource;
    manualText?: string;
    originalArtists: Artist[];
    analysisProvider?: 'vision' | 'gemini' | 'hybrid';
    posterThumbnail?: string;
    eventName?: string;
  };
  artistReview: {
    artists: Artist[];
    trackCountMode: 'tier-based' | 'custom-per-tier' | 'per-artist';
    tierCounts: TierCounts;
    perArtistCounts: Record<string, number>;
    stagedTierCounts: Partial<TierCounts>;
    trackSelectionMode: TrackSelectionMode;
    personalization?: {
      status: 'complete' | 'degraded';
      lovedCount: number;
      gemCount: number;
    };
  };
  trackReview?: {
    searchFingerprint: string;
    tracks: Track[];
    selectedTrackIds: string[];
    warnings: string[];
    playlistName: string;
  };
}
```

Implementation rules:

- Store arrays rather than `Set` instances and reconstruct sets after hydration.
- Validate parsed JSON, the version, and required nested values before exposing a
  draft. A malformed/unknown-version draft is cleared and treated as absent.
- Compare `owner` with the authenticated user and platform. Clear a mismatched
  draft rather than showing one account's work to another.
- Read only in the browser. Pages must wait for auth and draft hydration before
  redirecting for missing prerequisites; otherwise a refresh can incorrectly send
  a valid user back to Upload.
- `saveDraft` must catch quota/security exceptions, read back the stored value to
  verify it, and return a typed result. A failed required save blocks navigation
  and shows the existing browser-storage error pattern.
- `clearDraft` removes the aggregate key plus the legacy flow keys listed above,
  but never calls `sessionStorage.clear()`.
- Keep shared draft types out of UI components. Move/re-export `TrackCountMode` and
  `TierCounts` from a shared type/config module if needed rather than making
  `src/lib` depend on `src/components`.

## Track-result reuse and invalidation

Create a deterministic fingerprint from only the fields that affect
`/api/search-tracks`:

- ordered working `artists`, including affinity fields that affect selection;
- `trackCountMode`;
- `trackSelectionMode`;
- active `tierCounts` or `perArtistCounts`, with object keys sorted.

On a successful search, store the fingerprint with the returned tracks. On
Continue:

1. Build the fingerprint for the current artist-review state.
2. If it matches a non-empty stored track review, navigate without searching and
   preserve selection, warnings, and playlist name.
3. If it differs, call `/api/search-tracks` with the current request, replace
   `tracks` and `warnings`, select all new track IDs, store the new fingerprint,
   preserve an existing playlist name, verify the write, and then navigate.

Do not eagerly delete downstream results when an upstream control changes. Keeping
the old result until Continue allows the user to undo changes and recover the
exact prior track state if the fingerprint matches again.

The Upload **Quick Create Playlist** path must initialize the same complete
`artistReview` state with recommended defaults before searching. That gives every
Review Tracks page a valid Review Artists destination, including drafts that
originally skipped customization.

## Implementation steps

### 1. Centralize and test draft storage

Files:

- Add `src/lib/playlist-draft.ts`.
- Add `src/lib/__tests__/playlist-draft.test.ts`.
- Update shared types/config as necessary in `src/types/index.ts` and the existing
  track-count selector modules.

Tasks:

- Define the versioned schema, defaults, owner validation, safe read/write/update,
  verified writes, legacy-key cleanup, clear, and search-fingerprint helpers.
- Provide constructors for poster, text, and recommended artist-review defaults so
  Upload and Review Artists cannot drift in their initialization logic.
- Unit-test round trips, blocked storage, quota failures, malformed JSON, unknown
  versions, owner mismatch, preservation of unrelated keys, deterministic
  fingerprints, and clear behavior.

### 2. Restore and persist Upload state

Files:

- Update `src/pages/upload.tsx`.
- Update `src/test/pages/upload.test.tsx`.

Tasks:

- Hydrate the source after auth resolves and render the appropriate chooser,
  manual draft, or analyzed-result state.
- Persist manual text as it changes and write the complete analyzed result after
  `/api/analyze` succeeds.
- Refactor result rendering so a restored thumbnail/placeholder does not require
  the original `File` or blob URL.
- Initialize or reuse `artistReview` when Customize Artists is selected.
- Initialize recommended artist-review state before Quick Create searches.
- Replace the current scattered key writes/clears with storage-module operations.
- Ensure replacing the source confirms before clearing meaningful progress.
- Revoke live object URLs on replacement/unmount; persisted thumbnails are data
  and do not need revocation.

### 3. Restore artist-review edits and reuse track searches

Files:

- Update `src/pages/review-artists.tsx`.
- Update `src/test/pages/review-artists.test.tsx`.

Tasks:

- Hydrate every material control from `artistReview`; do not overwrite restored
  values with text/poster defaults.
- Persist mutations from artist removal, bulk removal, resets, tier/per-artist
  changes, staged inputs, selection mode, and successful personalization merges.
- Restore stored personalization summary and skip duplicate personalization.
- Implement fingerprint comparison and cached-track navigation before issuing a
  new search.
- On new search success, atomically store the updated artist review and track
  review before routing.
- Keep Back as a navigation-only operation to `/upload`.

### 4. Restore exact track-review state and correct Back

Files:

- Update `src/pages/review-tracks.tsx`.
- Update `src/test/pages/review-tracks.test.tsx`.

Tasks:

- Hydrate tracks, selected IDs, warnings, and playlist name from `trackReview`.
- Stop removing warnings during load.
- Persist toggle/select-all/deselect-all and playlist-name edits. Use verified,
  synchronous state updates before explicit navigation so a fast click cannot beat
  a deferred effect.
- Change **Back to Edit** to `/review-artists`.
- Keep cover preview derived from playlist name and poster thumbnail.
- Continue to enforce `MAX_PLAYLIST_TRACKS` after restoration.

### 5. Add non-destructive navigation and confirmed reset

Files:

- Update `src/components/ui/ProgressStepper.tsx` and add/update its nearest test.
- Add a small shared `StartOverButton` component if that avoids duplicating the
  same handler/copy across pages.
- Update Upload, Review Artists, and Review Tracks page tests.

Tasks:

- Render completed steps with an `href` as real accessible links; keep current and
  future steps non-interactive.
- Supply `/upload` and `/review-artists` links where those destinations have the
  required draft data.
- Show Start over only when meaningful source/review data exists.
- Use `window.confirm` for the first implementation because the project has no
  dialog primitive. Confirm, clear, reset local state, and replace the route;
  cancel is a no-op.

### 6. Complete lifecycle cleanup and developer shortcuts

Files:

- Update `src/pages/success.tsx` and its nearest tests.
- Update `src/contexts/AuthContext.tsx` and auth tests for logout cleanup.
- Update `src/components/dev/DevPanel.tsx` and, if useful,
  `src/pages/api/dev/mock-session.ts`.

Tasks:

- Clear the aggregate draft on success mount instead of deleting three individual
  keys.
- Clear the draft after successful logout.
- Make dev shortcuts seed valid versioned drafts so Review Artists and Review
  Tracks remain directly testable in DEV_MODE.

### 7. Update documentation

Files:

- Update `ARCHITECTURE.md`.
- Update `TESTING.md` if its manual flow remains in use.

Tasks:

- Document the single-tab draft lifecycle, storage key ownership, restoration
  behavior, upstream fingerprint invalidation, and success/logout/reset cleanup.
- Make clear that OAuth tokens remain in httpOnly cookies and are never included
  in the draft.

## Automated test scenarios

At minimum, cover these user-visible cases:

1. Manual text survives refresh and Back to Upload exactly as typed.
2. Poster result survives Review Artists -> Upload with artists, provider, event
   name, and thumbnail/placeholder.
3. Artist removals and every track-count/selection setting survive refresh and
   backward/forward navigation.
4. Completed personalization is restored without another personalize request;
   interrupted personalization may retry.
5. Review Tracks -> Back lands on Review Artists with edits intact.
6. Returning to Review Tracks with an unchanged fingerprint makes no search API
   call and restores exact track selections, warnings, and playlist name.
7. Changing a material artist setting causes one new search, replaces tracks,
   selects the new set, and preserves the playlist name.
8. Browser Back/Forward and direct refresh do not trigger premature missing-state
   redirects during hydration.
9. Quick Create produces a restorable recommended artist-review state.
10. Start over cancellation preserves everything; confirmation clears flow state,
    preserves auth/preferences/`returnAfterAuth`, and shows the empty chooser.
11. Success and successful logout clear the draft.
12. Malformed, outdated, cross-user, and unavailable storage fail safely without
    exposing stale data or navigating with incomplete state.
13. The 150-artist search cap and playlist track cap remain enforced after
    restoration.

## Manual acceptance walkthrough

Run on `http://127.0.0.1:3000`:

1. Authenticate with Apple Music, enter a manual lineup, edit artist counts,
   search, deselect tracks, and rename the playlist.
2. Use both in-app Back buttons and the browser Back/Forward controls. Confirm each
   page restores the exact prior values.
3. Refresh on Review Artists and Review Tracks and confirm no progress is lost.
4. Return to Review Artists and continue without changes; confirm no new track
   search occurs. Change a material option and confirm a new result replaces the
   old tracks while the playlist name remains.
5. Repeat with a poster. Confirm the restored Upload page uses the stored thumbnail
   or placeholder and never reanalyzes automatically.
6. Cancel Start over once, then confirm it. Confirm auth and UI preferences remain
   while the flow returns to the empty chooser.
7. Create a playlist successfully and confirm Create another starts clean.

## Verification commands

```bash
npm run test:run -- src/lib/__tests__/playlist-draft.test.ts \
  src/test/pages/upload.test.tsx \
  src/test/pages/review-artists.test.tsx \
  src/test/pages/review-tracks.test.tsx
npm run lint
npm run typecheck
```

Run the full `npm run test:run` if shared types, `AuthContext`, the progress stepper,
or developer shortcuts cause broader test changes.

## Out of scope

- Persistence across closed tabs or browser restarts.
- Database/server-side drafts, cross-device resume, or multiple named drafts.
- Persisting the original uploaded `File` or changing `/api/analyze` temp-file
  cleanup.
- Spotify migration or changes to music-platform rate limits.
- Changing artist or playlist caps.

## Completion criteria

- All acceptance scenarios above pass for both text and poster input.
- There are no direct reads/writes of the legacy flow keys outside the migration
  cleanup path.
- Back navigation never clears draft state.
- Start over, success, logout, and owner mismatch are the only normal lifecycle
  paths that clear the aggregate draft.
- Lint, typecheck, targeted tests, and the manual Apple Music walkthrough pass.
