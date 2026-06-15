# Explanation: Why personalization works the way it does

This explains the design behind user-aware recommendations (loved + hidden gems):
the problems it solves, the approach, the trade-offs accepted, and the
alternatives that were measured and rejected. For the API surface, see
[reference-personalization.md](./reference-personalization.md).

## The problem

A poster-to-playlist app, by default, gives everyone the same playlist for the
same poster: each artist's most popular track. That is fine, but it ignores the
one thing the signed-in user brings that no poster has — their taste.

Two specific misses:

1. **No recognition.** A festival lineup usually contains artists the user already
   loves. Handing back their #1 hit (which the user has heard a hundred times)
   wastes the slot and feels generic.
2. **No discovery.** The same lineup contains artists the user has never heard but
   would probably love. Nothing surfaces them, so they stay buried in the
   undercard.

The goal: make the playlist feel hand-picked — recognize what the user already
loves, and surface on-taste unknowns from the same lineup.

## The approach

Personalization runs as one pass over the lineup, splitting each artist into one
of three buckets and acting on each:

```
                 the user's Apple Music library
                            │
          poster lineup ────┼──────────────────────────┐
                            │                           │
                ┌───────────▼──────────┐    ┌───────────▼───────────┐
                │  in the library?     │    │  not in the library   │
                │  → LOVED             │    │  → unknown (candidate) │
                │  fuzzy name match    │    └───────────┬───────────┘
                │  (threshold 0.85)    │                │
                └───────────┬──────────┘     seed Gemini with the loved set
                            │                           │
              deep cuts downstream          Gemini ranks the unknowns → GEMS
                                            (popular tracks downstream)
```

The split is deliberately **hybrid**, mirroring the app's own OCR-plus-AI
identity: a deterministic part where determinism is right, and an LLM part where
judgment is right.

### "Loved" is a name-match problem, not a similarity problem

Whether the user already loves an artist is a yes/no fact: is this lineup name the
same artist as one in their library? That is fuzzy string matching (OCR names are
noisy), not taste inference. So loved uses `similarity()` over normalized names at
a **conservative 0.85 threshold**.

Why conservative? A false "loved" is the worst failure mode in the whole feature.
Telling a user "you already love this" about an artist they have never heard
breaks trust in everything else on the screen. A throwaway latency spike on a real
Apple Music library validated the bar: **12 of 14 lineup artists matched at 100%
with zero false positives at 0.85.** The two misses were safe (they fell through
to the unknown pool), which is the right direction to be wrong.

### "Gems" is a taste-inference problem, so Gemini owns it

Picking which unknown artists a user would love is exactly the judgment an LLM is
good at and string matching cannot do. Gemini takes the proven loved set as the
taste anchor and ranks the unknown lineup, returning a confidence and a one-phrase
reason per gem.

### Seed gems from the loved set, not from listening history

The original design seeded the gem engine from the user's heavy rotation /
recently-played. The spike showed that is **wrong for cross-genre lineups.**
Recency reflects current _mood_, which can be a different genre than the poster.
On the test account, recent plays were Latin-indie while the lineup was rock, so
gems came back off-target (Gemini confidence ~0.55). Re-seeded from the loved
matches (lineup ∩ library — taste anchored to _this_ lineup), confidence on the
right gem jumped to 0.85 with a shippable reason string.

The loved set is the lineup-anchored taste signal. Heavy rotation is not.

## Trade-offs

- **Apple Music only.** Personalization needs a readable user library.
  Spotify's library endpoints are off the table here (the Spotify path is also
  broken by the February 2026 API changes — see
  [../CLAUDE.md](../CLAUDE.md)). Other platforms return the plain lineup with
  `degraded: true`. Accepted: this is a personal app and Apple Music is the
  working platform.
- **~10 seconds of latency.** The Gemini pass is a ~7–11s floor; the library scan
  adds a few seconds. The product swallows this with a **progressive** screen:
  `review-artists` renders the lineup instantly and the loved/gems header streams
  in when the single response lands. The "Search Tracks & Continue" button is
  disabled while personalizing, so a user cannot accidentally skip the feature by
  clicking early (which would send untagged artists downstream and silently lose
  the loved → deep-cuts and gem → popular routing).
- **Degrade, never fail.** Every sub-step can fail independently (library scan,
  Gemini), and each failure returns _less_ rather than an error. A library failure
  yields the plain lineup; a Gemini failure yields loved-only; the route never
  500s the user out of their lineup. The cost is a `degraded` flag the client must
  honor by hiding the header.
- **A truncated scan skips gems entirely.** If the library scan is incomplete, an
  unscanned loved artist could be wrongly treated as "unknown" and surfaced as a
  gem. Rather than risk that specific embarrassment, an incomplete scan
  (`complete: false`) skips the gem pass. The cost is fewer gems on very large
  libraries that hit the 50-page ceiling.

## Alternatives considered

### The Apple "similar-artists" graph (rejected)

The locked design's premise was a hybrid gem engine: walk Apple's
`similar-artists` graph from the user's seeds, intersect with the lineup to _find_
candidate gems, then have Gemini _re-rank_ them.

The spike killed it. **The graph found 0 gems across all three runs** (depth-1
twice, depth-2 once). Depth-2 doubled the reach (31 calls, 134 candidates, 8.6s —
slower than Gemini) and still found nothing. The `lineup ∩ graph` intersection is
structurally too thin: it needs an unknown lineup act to sit inside a seed's
bounded top-N similar list, which rarely happens for a sparse festival lineup.

So the premise was backwards. The graph adds latency for zero recall; **Gemini is
the gem engine.** The graph survives only as an optional, no-LLM fallback outside
the critical path. Dropping it simplified the path to: library scan (~3.5s) →
match → Gemini (~6–7s) ≈ 10s.

### Comprehensive sync vs progressive UI (chose progressive)

Given the ~10s floor, the architecture choice was "scan everything up front, then
render" vs "render instantly, stream the header." The latency numbers forced
progressive: even fully optimized (drop the throttle, parallelize the scan and
Gemini), the path is ~14s because Gemini alone is a ~10s floor. Blocking the whole
review screen on that is the wrong feel. Loved (LLM-free, ~3.5s) can stream first;
gems arrive after Gemini.

## Treating Gemini output as untrusted

Gemini's reply reaches both application state and the DOM, so the engine treats it
as hostile input. The hardening (all in `selectGems`, which is pure and
unit-tested):

- **Allowlist to the lineup.** A gem is kept only if its name maps (≥ 0.85) back to
  a submitted _unknown_ lineup name. Gemini cannot invent an artist, and cannot
  re-tag a loved artist as a gem.
- **Strip unexpected fields.** Only `name`, `confidence`, `reason` are read.
- **Clamp and gate confidence** to `[0,1]`, dropping anything below 0.5;
  non-finite values become 0.
- **Sanitize the reason** before it can reach the DOM: collapse whitespace, strip
  control / zero-width / bidi-override characters (which can mangle the card or
  spoof text direction), and cap at 200 chars.
- **Dedupe and cap** at 12 so a runaway response cannot flood the screen.

A parallel concern lives in the library scan: Apple's pagination `next` URL is
attacker-influenceable (it comes from a response body), and the request to it
carries the developer bearer + Music-User-Token. The scan **refuses any `next`
whose origin is not Apple's**, so a malformed or compromised cursor cannot
exfiltrate those tokens. (This was a CRITICAL finding from adversarial review.)

## Where to look in the code

| Concern               | File                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| Engine orchestration  | `src/lib/personalize.ts` (`personalizeLineup`)                                      |
| Gem sanitizing (pure) | `src/lib/personalize.ts` (`selectGems`, `parseGemsResponse`)                        |
| Name matching         | `src/lib/artist-match.ts` (`normalize`, `similarity`, `matchLineup`)                |
| Library scan          | `src/lib/music-platform/apple-music-platform.ts` (`getLibraryArtists`)              |
| Affinity → track mode | `src/lib/music-platform/index.ts` (`getSelectionModeForArtist`)                     |
| HTTP route            | `src/pages/api/personalize.ts`                                                      |
| UI wiring             | `src/pages/review-artists.tsx`, `src/components/features/PersonalizationHeader.tsx` |

## Related

- [reference-personalization.md](./reference-personalization.md) — exact types,
  constants, and endpoint contract.
- [howto-personalization.md](./howto-personalization.md) — tune the thresholds
  this document explains.
- [../CLAUDE.md](../CLAUDE.md) — provider setup and the Spotify limitation.
