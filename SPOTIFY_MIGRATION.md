# Spotify Web API (Feb 2026) — What Broke and How We Replace It

**Date:** 2026-08-04 · **Verified by:** live probes with client-credentials **and** a real user token

> **Verdict:** every endpoint we need has a replacement. The migration is ~4 methods in one file
> (`spotify-platform.ts`). Two things are _not_ solved by code: the `popularity` field is gone (no
> ranking signal — §5), and Development Mode requires the owner's Premium plus a 5-user cap (§6).

---

## 1. Endpoints — what works

| Endpoint                        | Used by                   | Status                                      |
| ------------------------------- | ------------------------- | ------------------------------------------- |
| `POST /api/token`               | `spotify.ts:11`           | ✅ Works                                    |
| `GET /search`                   | `spotify-platform.ts:89`  | ✅ Works — `limit` max now **10**           |
| `GET /me`                       | `spotify-platform.ts:245` | ✅ Works — `email` deprecated               |
| `GET /artists/{id}/albums`      | (unused)                  | ✅ Works — `limit` cut 50 → **10**          |
| `GET /albums/{id}/tracks`       | (unused)                  | ✅ Works — `limit` 50                       |
| `PUT /playlists/{id}/images`    | `spotify-platform.ts:272` | ✅ Works — still 256 KB, `ugc-image-upload` |
| `GET /me/top/artists`           | (not yet used)            | ✅ Works — could power Spotify "gems"       |
| `GET /me/following?type=artist` | (not yet used)            | ✅ Works                                    |
| `GET /me/tracks`                | (not yet used)            | ✅ Works                                    |

## 2. Endpoints — what's broken, and the replacement

| Endpoint                       | Used by                   | Status               | Replacement                                                | Effort |
| ------------------------------ | ------------------------- | -------------------- | ---------------------------------------------------------- | ------ |
| `GET /artists/{id}/top-tracks` | `spotify-platform.ts:154` | 🔴 **403 Forbidden** | `GET /search?q=artist:"X"&type=artist,track&limit=10` → §5 | **M**  |
| `POST /users/{id}/playlists`   | `spotify-platform.ts:196` | 🔴 Removed           | `POST /me/playlists` — same body, drop `userId`            | **S**  |
| `POST /playlists/{id}/tracks`  | `spotify-platform.ts:230` | 🟠 Renamed           | `POST /playlists/{id}/items` — body still `uris`, max 100  | **XS** |
| `GET /playlists/{id}/tracks`   | `spotify.ts:431`          | 🟠 Renamed           | `GET /playlists/{id}/items`; response `tracks` → `items`   | **XS** |

**Removed but unused by us** (listed so we don't reach for them): batch `GET /tracks`, `GET /artists`,
`GET /albums` (single-ID only now) · `GET /browse/*` · `GET /markets` · `GET /users/{id}` ·
`GET /users/{id}/playlists`. The `PUT|DELETE /me/{tracks,albums,following,…}` family is consolidated
into `PUT|DELETE /me/library`.

## 3. Fields — what disappeared

| Field                                    | We use it for                    | Status for our app tier | Consequence                                     |
| ---------------------------------------- | -------------------------------- | ----------------------- | ----------------------------------------------- |
| `track.popularity`                       | would be the ranking key         | 🔴 **Absent**           | Selection modes have nothing to sort by → §5    |
| `track.preview_url`                      | `Track.previewUrl`, audio player | 🔴 Absent               | In-app previews dead for Spotify tracks         |
| `artist.popularity` / `artist.followers` | unused                           | 🔴 Absent               | none                                            |
| `user.email`                             | `SpotifyUser.email`              | 🟠 Deprecated           | Cosmetic — drop field + `user-read-email` scope |

Docs list these as "deprecated but present." **In practice a Development Mode app receives none of
them.**

## 4. Measured probe results (2026-08-04)

| Probe                                  | Result                                                       |
| -------------------------------------- | ------------------------------------------------------------ |
| `POST /api/token` (client credentials) | **200** — app and credentials valid                          |
| `GET /artists/{id}/top-tracks`         | **403** with client-credentials _and_ user token             |
| `GET /search?type=artist,track`        | **200**, `artist:` filter accurate                           |
| `limit=20` / `limit=50`                | **400 "Invalid limit"** — max really is 10                   |
| `limit=10` → returned                  | **5 tracks**                                                 |
| `limit=5` → returned                   | **3 tracks**                                                 |
| `track.popularity` / `preview_url`     | **absent on every result**                                   |
| `/albums/{id}/tracks` fields           | no `popularity` (field list enumerated)                      |
| End-to-end run, 59-artist poster       | 59/59 artists matched on search, **0 tracks**, 403 each, 48s |

**Two consequences:** no ranking signal exists (§5), and we get ~5 tracks per artist — so the tier
policy (`getTrackCountForTier`: headliner 10 / sub-headliner 5 / mid-tier 3 / undercard 1) needs
rescaling to roughly 5/3/2/1.

## 5. Replacing `popularity` — ranking options

We need **an ordering, not a score.** Any source that ranks an artist's tracks gives us one; we map
it onto Spotify's search results by fuzzy title match, reusing `artist-match.similarity()`.

> ⚠️ **The crux: every free third-party source prohibits commercial use.** Deezer bans it with no
> upgrade path; Last.fm and MusicBrainz require a separate agreement. **Settle "is this ever going
> commercial?" first** — if yes, only A, E, and self-hosted D survive.

| Option                      | Setup            | Depth       | Commercial              | Key advantage                                | Key risk                                                                   |
| --------------------------- | ---------------- | ----------- | ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| **A. Spotify search order** | none             | ~5          | ✅ already licensed     | Zero deps; order looks hit-weighted          | Undocumented, unguaranteed; modes stay effectively dead                    |
| **B. Deezer**               | none — keyless   | 10 + `rank` | ❌ banned, no upgrade   | 449ms measured; no secret to manage          | Akamai bot protection may block Vercel IPs; EU-skewed; `rank` undocumented |
| **C. Last.fm**              | free key         | 50          | ⚠️ separate agreement\* | Richest data; `getSimilar` also fixes "gems" | Mandatory attribution in UI; 100 MB cache cap; unpublished limits          |
| **D. ListenBrainz + MBz**   | none             | varies      | ⚠️ CC0 data, API terms  | Only commercially-clean **data** licence     | MusicBrainz ~1 req/s → ~59s of MBID lookups per poster                     |
| **E. Apple Music catalog**  | paid membership  | 25          | ✅ dev agreement        | Adapter already exists; global catalog       | $99/yr; couples the Spotify path to Apple credentials                      |
| **F. Gemini LLM**           | already have key | unbounded   | ✅ our own key          | No new dependency; one batched call          | Uncalibrated, stale training data, hallucinates                            |
| **G. Spotify heuristics**   | none             | ~5          | ✅ already licensed     | No third party at all                        | ~12 req/artist ≈ 200s; weak signal. **Don't build.**                       |

\* An earlier verbal summary in this session said Last.fm allows commercial use — **that was wrong.**
The free key is non-commercial only.

**Recommendation**

- **Stays non-commercial** → **B (Deezer)**. Fastest to prove, zero setup. Verify it works from
  Vercel's IPs before committing.
- **Commercial is possible** → **C (Last.fm)**; an agreement is something you can actually apply for.
- **Apple membership renewing anyway** → **E** is cleanest: no new relationship, code already there.
- Use **F** only as a fallback when the ranker returns no match. Never **G**.

**Regardless of the winner:** build a `TrackRanker` interface
(`getRankedTitles(artistName): Promise<string[]>`) with `Deezer` / `LastFm` / `AppleCatalog` /
`Null` implementations. Swapping sources then costs one file, ranking stays platform-independent,
and it addresses the Open/Closed finding in [audit.md §2.2](audit.md). Cache per artist (`lru-cache`
is already a dependency), time out, and fall back to A.

**Open questions**

1. Is this ever going commercial? Everything else follows.
2. Is the Apple Developer membership being renewed regardless?
3. Do we accept an attribution badge in the UI (required by Last.fm)?
4. Is ~5 tracks/artist acceptable, or must the selection modes genuinely work? If the latter, add
   "rank-then-fetch" (query Spotify per _desired track_) for headliners — more requests, real depth.
5. Who verifies Deezer from a deployed Vercel environment before we build on it?

## 6. The non-code blocker: access tier

From Spotify's [Feb 6 2026 developer-access post](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security):

| Rule                                           | Applies from                    |
| ---------------------------------------------- | ------------------------------- |
| App owner must hold **active Spotify Premium** | Mar 9 2026 (existing apps)      |
| **Max 5** authorized users per client ID       | Mar 9 2026 (existing apps)      |
| **Max 1** client ID per developer              | Mar 9 2026 (existing apps)      |
| Endpoint restrictions for legacy apps          | **Postponed**, pending feedback |

**Sequencing:** reconnect Premium first. Without it the OAuth flow 403s and none of the migration is
testable end-to-end.

## 7. Migration checklist

**Phase 1 — endpoints** (`spotify-platform.ts`)

1. `createPlaylist` → `POST /me/playlists`; drop `userId` (also lets `create-playlist.ts:124` skip
   its `getCurrentUser` call for Spotify — one less request).
2. `addTracksToPlaylist` → `POST /playlists/{id}/items`.
3. `getArtistTopTracks` → rewrite on `GET /search`; filter candidates through
   `artist-match.similarity()`; order via the chosen `TrackRanker` (§5).
4. `getPlaylistTracks` (`spotify.ts`) → `/items`, read `items` not `tracks`.
5. Rescale `getTrackCountForTier` to the ~5-track ceiling.

**Phase 2 — auth correctness** (independent of the API changes)

6. Wire up `refreshAccessToken` — zero production callers today, so sessions die after ~1h.
7. Drop `user-read-email` scope and `SpotifyUser.email`.

**Phase 3 — cleanup**

8. Delete the ~370 dead lines in `spotify.ts` ([audit.md §3.1](audit.md)).
9. Replace the adapter's local `similarity()` copy with `artist-match` — the search-result filter
   needs its accent/`&`/`feat.` normalization.
10. **Stop logging raw axios errors** (`spotify-platform.ts:142,184`) — they print the user's bearer
    token into logs. Apple's adapter already has `errMessage()` for exactly this.
11. Fail fast on the first 403 instead of burning 59 requests over 48s.

**Optional, high value:** implement `getLibraryArtists` for Spotify via `GET /me/top/artists` — it
survived the migration and would fix `personalize.ts` returning `degraded: true` for every Spotify
user today.

## Sources

- Spotify: [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) ·
  [changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026) ·
  [access update](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security) ·
  [redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) ·
  [rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- Deezer: [terms of use](https://developers.deezer.com/termsofuse) (non-commercial only) ·
  [ownership](https://www.musicbusinessworldwide.com/who-owns-deezer-today/) — Access Industries ~38%,
  which also owns Warner Music Group
- Last.fm: [API terms](https://www.last.fm/api/tos) ·
  [artist.getTopTracks](https://www.last.fm/api/show/artist.getTopTracks)
- MusicBrainz/ListenBrainz: [data licence](https://musicbrainz.org/doc/About/Data_License) ·
  [popularity API](https://listenbrainz.readthedocs.io/en/latest/users/api/popularity.html)
- Direct API probes (Spotify + Deezer), 2026-08-04
