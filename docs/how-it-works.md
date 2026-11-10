---
title: How a poster becomes a playlist
chrome: title
width: wide
---

The app turns a festival poster into a playlist. The [Analyze route](#analyze) reads the artist names once. When the server uses Gemini, it also ranks them by how big they are on the poster. The [Track search route](#search) then uses that rank to decide how many songs each artist gets. The app has no database: a draft in the browser carries the artists and songs from page to page. The Analyze route writes the upload to a temporary file on the server and deletes it after it reads the file. The server logs also record the poster text that Vision reads, and the host can keep those logs.

## 01 · The path of a poster

```figure
id: path
layout: flow
grid: [5, 3]
nodes:
  listener:  { label: Listener, at: [0, 1], kind: actor, about: "Signs in with Spotify or Apple Music first. Every API route below checks for that sign-in cookie." }
  upload:    { label: Upload page, at: [1, 1], about: "Takes a poster image, from a file or the clipboard, and shows the artists it found. Offers a quick create with default track counts, or a detour to edit the list. A typed lineup skips the Analyze route and goes to Review artists." }
  analyze:   { label: Analyze route, sub: /api/analyze, at: [1, 0], focal: true, about: "Checks the file by its first bytes, then sends it to the poster reader that the server is set to use. Also makes a 300 px thumbnail for the playlist cover. Limited to 5 calls per minute because AI calls cost money." }
  ai:        { label: Google AI, sub: Vision or Gemini, at: [2, 0], kind: external, about: "The server uses one reader setup per deployment. Cloud Vision reads every word on the poster but does not rank artists. Gemini looks at the image and decides which words are artists and how big each one is. Hybrid uses both. Section 02 compares them." }
  review:    { label: Review artists, at: [2, 2], kind: optional, about: "Lets the listener remove artists and set track counts per tier or per artist. On Apple Music, it also tags artists from the listener's library and suggests hidden gems. Skipped on the quick-create path." }
  search:    { label: Track search, sub: /api/search-tracks, at: [2, 1], focal: true, about: "Looks up each artist and fetches their songs. Searches go out in small batches with a pause between them, so the music service does not rate-limit the app. Weak name matches are dropped." }
  tracks:    { label: Review tracks, at: [3, 1], about: "Shows the songs found and a preview of the generated cover. The listener names the playlist here." }
  create:    { label: Create playlist, sub: /api/create-playlist, at: [4, 1], about: "Makes the playlist and adds the songs. On Spotify, it also uploads a cover made from the poster. The Apple Music API does not accept a custom cover." }
  music:     { label: Music service, sub: Spotify or Apple, at: [3, 2], kind: external, about: "The listener's own account. Both services sit behind one interface in the code. Apple Music is the one that works today; Spotify is broken until its migration ships." }
edges:
  - listener -> upload: drops poster
  - upload -> analyze: sends image
  - analyze => ai: reads poster
  - { from: analyze, to: upload, label: ranked artists, kind: return }
  - upload -> search: quick create
  - upload -> review: customize
  - review -> search
  - search => music: finds songs
  - { from: search, to: tracks, about: "The page saves the songs in the playlist draft in sessionStorage, then opens Review tracks. A repeat search with the same inputs reuses the saved songs." }
  - tracks -> create: confirms
  - create => music: saves playlist
notes:
  - { on: analyze, text: "The poster is read once. Every later step works from the artist list it returned." }
  - { on: [upload, review], text: "Two paths reach the same search: quick create, or edit the list first." }
caveat: "Sign-in, the typed-lineup path, the personalize call and the live cover preview are left out."
scenes:
  quick:
    title: Quick create
    path: [listener, upload, analyze, ai, analyze, upload, search, music, search, tracks, create, music]
  custom:
    title: Edit the artists first
    path: [listener, upload, analyze, ai, analyze, upload, review, search, music, search, tracks, create, music]
```

```steps
for: path
```

## 02 · Three ways to read a poster

The server reads the poster in one of three ways, chosen by `IMAGE_ANALYSIS_PROVIDER`. The code defaults to [Vision](#vision). This machine's `.env` uses [Hybrid](#hybrid), which keeps Vision's full word list and adds Gemini's ranking.

```compare
id: readers
title: Poster readers
dimensions:
  - { id: finds, label: Finds artists by }
  - { id: ranks, label: Ranks by size }
  - { id: risk, label: Weak spot }
items:
  - id: vision
    label: Vision
    about: "The default in the code. Code rules decide what an artist is."
    values: { finds: OCR + filters, ranks: "no", risk: keeps stray words }
    points:
      - Reads every word on the poster
      - Drops dates, links and words like "tickets"
  - id: gemini
    label: Gemini
    about: "Looks at the image only."
    values: { finds: the model, ranks: "yes, 1–10", risk: can miss small text }
    points:
      - Gives each artist a weight and a tier
      - Skips the festival name and dates
  - id: hybrid
    label: Hybrid
    focal: true
    about: "Sends the Vision text to Gemini inside the prompt. An artist found only in the text gets a weight of 1 to 3. If one API fails, it returns what the other one found."
    on: analyze
    values: { finds: OCR + the model, ranks: "yes, 1–10", risk: two API calls }
    points:
      - Vision finds every word
      - Gemini filters and ranks them
notes:
  - { on: hybrid, text: "Hybrid exists because Gemini alone missed small names at the bottom of posters." }
```

## 03 · Bigger names get more songs

By default, the search asks for [10 songs per headliner](#tiers-headliner) and [1 per undercard act](#tiers-undercard). [Vision gives no tier, so it asks for 3 per artist it finds](#tiers-no-tier). These counts are targets: an artist can get fewer songs, or none, when the music service has fewer matches. On Review artists the listener can replace these counts.

```bar
id: tiers
unit: songs
axis: Songs requested per artist, tier-based mode
sort: none
data:
  - { label: Headliner, value: 10, focal: true, about: "Weight 8 to 10: the largest names at the top of the poster." }
  - { label: Sub-headliner, value: 5, about: "Weight 6 or 7." }
  - { label: Mid-tier, value: 3, about: "Weight 4 or 5." }
  - { label: Undercard, value: 1, about: "Weight 1 to 3: small text, or names only Vision saw." }
  - { label: No tier, value: 3, muted: true, about: "What the search asks for each artist when Vision reads the poster alone." }
notes:
  - { on: tiers-headliner, text: "One headliner asks for as many songs as ten undercard acts." }
caveat: "A track mode then picks which songs: popular, balanced or deep cuts. Each mode shuffles its pool."
```

```note warn
Spotify sign-in works, but its Development Mode limits break track lookup. See [SPOTIFY_MIGRATION.md](https://github.com/enrique7mc/music-posters/blob/main/SPOTIFY_MIGRATION.md) before you test with Spotify.
```

To rebuild this page after you edit `how-it-works.md`, run `bun <explainer-skill>/scripts/explainer.ts build docs/how-it-works.md`. The [explainer skill](https://github.com/overment/skills/tree/main/skills/explainer) needs Bun 1.4 or later.
