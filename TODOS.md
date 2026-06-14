# TODOS

## Backlog

- [ ] **SSE progress indicator for track search** — Show "Searching artist 47 of 150..." instead of static spinner during 30-70s track search operations. Pairs with partial success warnings. Priority: P2. Effort: M (CC: ~30min).

### Deferred from User-Aware Recommendations eng review (2026-06-02)

These were explicitly deferred when scoping the loved+gems feature to "right-sized" (v1 = engine + one non-streaming /api/personalize). Design doc: `~/.gstack/projects/enrique7mc-music-posters/oem-main-design-20260530-162634.md`.

- [ ] **Two-stage progressive streaming for personalization** — Stream "loved" in at ~3.5s (library scan + match, no LLM) and "gems" at ~10s (after Gemini), instead of one ~10s call. **Why:** cuts perceived latency on the loved group by ~6.5s. **Cons:** real UI/state work (shimmer, late re-decorate, two response phases). **Context:** v1 ships a single /api/personalize returning both groups together with a "personalizing…" header state; revisit if testers complain about the wait. **Depends on:** v1 endpoint shipped. Priority: P2.
- [ ] **Library-scan caching (per-user, short TTL)** — Cache `/me/library/artists` results so personalization isn't a ~3-5s scan on every poster. **Why:** the library is the same every session; removes most of the loved-stage latency. **Cons:** stateless app today (no DB) — needs an in-memory/edge cache keyed by user token with TTL + invalidation. **Context:** spike measured 304 artists / 10 pages ≈ 3.4-5.8s. **Depends on:** v1 endpoint. Priority: P2.
- [ ] **High-confidence undercard track-bump** — Give high-confidence gems extra track slots even when they're undercards on the poster. **Why:** "taste beats font size" — the design's stretch delight. **Cons:** LLM confidence is uncalibrated (Codex #7) — don't drive track counts off it until validated. **Context:** needs a confidence→count mapping + a calibration pass. **Depends on:** v1 gems shipped + confidence calibration. Priority: P3.
- [ ] **Loved/gems override toggles** — Real on/off controls per group (off reverts that group to the global selection mode). **Why:** user control if the auto deep-cuts/popular default isn't wanted. **Cons:** extra client+request state; only build if testers ask. **Context:** v1 drops toggles (affinity auto-derives mode). Priority: P3.
- [ ] **Cross-genre gem seed for empty-loved lineups** — A smarter seed when a lineup has 0 loved overlap (recently-played proved off-genre in the spike). **Why:** surface gems even for lineups outside your owned taste. **Cons:** the spike showed recency-seeded gems are low-confidence/off-target — needs a genuinely better signal. **Context:** v1 skips gems entirely when 0 loved. Priority: P3.

## Completed
