/**
 * User-aware personalization engine: tags a poster lineup with the authed user's
 * taste relationship to each artist.
 *
 *   loved = the lineup artist is already in the user's library (deterministic
 *           fuzzy match at the conservative 0.85 threshold — a false "loved"
 *           breaks trust, so the bar is high).
 *   gem   = the user doesn't know them yet but is a likely taste match, surfaced
 *           by Gemini seeded from the loved set.
 *
 * Design (locked, eng review 2026-06-02):
 *   ~/.gstack/projects/enrique7mc-music-posters/oem-main-design-20260530-162634.md
 *
 * Hardening (Codex outside-voice):
 *   - Gemini output is UNTRUSTED: gem names are allowlisted to the submitted
 *     unknown lineup, unexpected fields stripped, deduped, capped, and gated on a
 *     minimum confidence.
 *   - Partial success, never a hard failure: a library-scan failure returns the
 *     plain lineup; a Gemini failure returns loved annotations only. The caller
 *     can always render something.
 *   - Empty-loved (0 overlap) → skip Gemini entirely (no call, no cost).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Artist } from '@/types';
import { matchLineup, similarity, LOVED_MATCH_THRESHOLD } from '@/lib/artist-match';
import { MusicPlatformService } from '@/lib/music-platform/types';

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEM_MAX_COUNT = 12; // cap surfaced gems so the screen stays scannable
const GEM_MIN_CONFIDENCE = 0.5; // drop low-confidence guesses
const GEM_MATCH_THRESHOLD = 0.85; // gem name must clearly map back to a lineup name
const GEM_SEED_CAP = 8; // how many loved artists to seed Gemini with
const GEM_LINKED_CAP = 3; // loved seeds surfaced per gem ("for fans of …")
const GEM_REASON_MAX_LEN = 200; // cap untrusted Gemini reason text before it reaches state/DOM
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_TIMEOUT_MS = 12000; // per-attempt deadline so a hung Gemini call can't ride to the 30s route kill

/** Reject if `promise` doesn't settle within `ms`. Used to bound the Gemini call. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export interface PersonalizeResult {
  /** A copy of the input lineup with affinity fields merged in. */
  artists: Artist[];
  lovedCount: number;
  gemCount: number;
  /** True if a sub-step failed (library or Gemini) and results are degraded. */
  degraded: boolean;
}

/** Raw, untrusted gem object as it may arrive from Gemini. */
export interface RawGem {
  name?: unknown;
  confidence?: unknown;
  reason?: unknown;
}

/** A sanitized gem mapped back to a real lineup name. */
export interface SelectedGem {
  /** The lineup name (original casing) this gem maps to. */
  lineupName: string;
  confidence: number;
  reason?: string;
}

/**
 * Extract a gems array from a (possibly fenced, possibly noisy) Gemini text
 * response. Never throws — returns [] on any parse failure so callers degrade
 * to loved-only rather than 500.
 */
export function parseGemsResponse(responseText: string): RawGem[] {
  try {
    const fenced = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    const raw = fenced ? fenced[1].trim() : responseText.trim();

    let parsed: unknown;
    try {
      // Happy path: the (de-fenced) text is itself valid JSON — handles both a
      // bare array and a {gems:[...]} object.
      parsed = JSON.parse(raw);
    } catch {
      // Noisy text around the JSON: pull out the first array or object literal.
      const extracted =
        responseText.match(/\[[\s\S]*\]/)?.[0] ?? responseText.match(/\{[\s\S]*\}/)?.[0];
      if (!extracted) throw new Error('no JSON found');
      parsed = JSON.parse(extracted);
    }

    const gems = Array.isArray(parsed) ? parsed : (parsed as { gems?: unknown })?.gems;
    return Array.isArray(gems) ? gems : [];
  } catch {
    console.error('[Personalize] Failed to parse gems response:', responseText.slice(0, 300));
    return [];
  }
}

/**
 * Turn untrusted raw gems into sanitized, lineup-anchored gems. Pure (no I/O),
 * so the whole hardening surface is unit-testable:
 *  - allowlist: a gem only survives if its name maps (>= threshold) to one of the
 *    submitted unknown lineup names — Gemini cannot invent artists.
 *  - strip: only name/confidence/reason are read; everything else is ignored.
 *  - confidence gate + clamp to [0, 1].
 *  - dedupe by lineup name, keeping the highest-confidence gem.
 *  - sort by confidence desc, cap at GEM_MAX_COUNT.
 */
export function selectGems(
  rawGems: RawGem[],
  unknownLineup: string[],
  opts: { minConfidence?: number; maxCount?: number; matchThreshold?: number } = {}
): SelectedGem[] {
  const minConfidence = opts.minConfidence ?? GEM_MIN_CONFIDENCE;
  const maxCount = opts.maxCount ?? GEM_MAX_COUNT;
  const matchThreshold = opts.matchThreshold ?? GEM_MATCH_THRESHOLD;

  const byLineupName = new Map<string, SelectedGem>();

  for (const raw of rawGems) {
    if (!raw || typeof raw.name !== 'string') continue;

    const confidence =
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0;
    if (confidence < minConfidence) continue;

    // Allowlist: map the gem name to the closest submitted unknown lineup name.
    let bestName: string | null = null;
    let bestSim = 0;
    for (const candidate of unknownLineup) {
      const sim = similarity(raw.name, candidate);
      if (sim > bestSim) {
        bestSim = sim;
        bestName = candidate;
      }
    }
    if (!bestName || bestSim < matchThreshold) continue; // hallucinated / off-lineup

    // Gemini is untrusted: cap the reason so a runaway/hostile response can't
    // blow the header layout or bloat the response (name + confidence are
    // already bounded; reason was the one unbounded field).
    const reason =
      typeof raw.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim().slice(0, GEM_REASON_MAX_LEN)
        : undefined;
    const existing = byLineupName.get(bestName);
    if (!existing || confidence > existing.confidence) {
      byLineupName.set(bestName, { lineupName: bestName, confidence, reason });
    }
  }

  return [...byLineupName.values()].sort((a, b) => b.confidence - a.confidence).slice(0, maxCount);
}

/** Build the gems prompt. Exported for prompt eval (T9). */
export function buildGemsPrompt(seedNames: string[], unknownLineup: string[]): string {
  return (
    `A user heavily listens to these artists: ${seedNames.join(', ')}.\n\n` +
    `From this festival lineup (artists they do NOT already listen to), pick the ` +
    `ones they'd most likely love, rank them, and explain why in one short phrase. ` +
    `Lineup:\n${unknownLineup.join(', ')}\n\n` +
    `Respond ONLY with JSON: {"gems":[{"name":string,"confidence":number(0-1),"reason":string}]}. ` +
    `Order by confidence desc. Only include genuine taste matches — omit weak ones ` +
    `rather than padding the list.`
  );
}

/**
 * Ask Gemini for gems. Returns raw (unsanitized) gems, or [] on any failure
 * (missing key, network, non-JSON). Retries with exponential backoff. Never
 * throws — gems are a best-effort enhancement.
 */
async function requestGems(seedNames: string[], unknownLineup: string[]): Promise<RawGem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Personalize] GEMINI_API_KEY not set — skipping gems');
    return [];
  }

  const prompt = buildGemsPrompt(seedNames, unknownLineup);
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL });

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent(prompt),
        GEMINI_TIMEOUT_MS,
        'Gemini gems'
      );
      const text = result.response.text();
      const gems = parseGemsResponse(text);
      if (gems.length > 0) return gems;
      // Parsed but empty — a legitimate "no strong matches" answer; don't retry.
      return [];
    } catch (error) {
      console.error(`[Personalize] Gemini gems attempt ${attempt} failed:`, error);
      if (attempt < GEMINI_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  return [];
}

/**
 * Personalize a lineup against the authed user's library.
 * Returns a COPY of the lineup with affinity fields merged in (input untouched).
 *
 * @param lineup    - artists extracted from the poster
 * @param platform  - the user's music platform service (must expose getLibraryArtists)
 * @param userToken - user-scoped auth token for the library scan
 */
export async function personalizeLineup(
  lineup: Artist[],
  platform: MusicPlatformService,
  userToken: string
): Promise<PersonalizeResult> {
  const annotated: Artist[] = lineup.map((a) => ({ ...a }));
  const byName = new Map<string, Artist>(annotated.map((a) => [a.name, a]));

  // 1. Library scan → loved set. No library support (e.g. Spotify) → plain lineup.
  if (!platform.getLibraryArtists) {
    return { artists: annotated, lovedCount: 0, gemCount: 0, degraded: true };
  }

  let lovedNames: string[] = [];
  let scanComplete = true;
  let degraded = false;
  try {
    const scan = await platform.getLibraryArtists(userToken);
    lovedNames = scan.artists;
    scanComplete = scan.complete;
  } catch (error) {
    console.error('[Personalize] Library scan threw:', error);
    degraded = true;
    scanComplete = false;
  }

  // A truncated/failed scan is incomplete: the loved matches we DID find are real,
  // but an unscanned loved artist would wrongly land in `unknown` and could be
  // surfaced as a "gem". Mark degraded and skip the gem pass entirely.
  if (!scanComplete) degraded = true;

  // 2. Match lineup ∩ library (conservative threshold).
  const lineupNames = annotated.map((a) => a.name);
  const { loved, unknown } = matchLineup(lineupNames, lovedNames, LOVED_MATCH_THRESHOLD);

  for (const match of loved) {
    const artist = byName.get(match.poster);
    if (artist) {
      artist.affinity = 'loved';
      artist.affinityConfidence = match.similarity;
      artist.affinityReason = 'Already in your library';
    }
  }

  // 3. Skip gems when there's nothing to seed from, or when the scan was
  // incomplete (an unknown artist might actually be loved on an unscanned page).
  if (loved.length === 0 || unknown.length === 0 || !scanComplete) {
    return { artists: annotated, lovedCount: loved.length, gemCount: 0, degraded };
  }

  // 4. Gems: seed Gemini with the loved set (the proven taste anchor).
  const seeds = loved.map((l) => l.matched).slice(0, GEM_SEED_CAP);
  const rawGems = await requestGems(seeds, unknown);
  if (rawGems.length === 0) {
    // Gemini failed or found nothing — loved annotations still stand.
    return { artists: annotated, lovedCount: loved.length, gemCount: 0, degraded };
  }

  const gems = selectGems(rawGems, unknown);
  for (const gem of gems) {
    const artist = byName.get(gem.lineupName);
    if (artist) {
      artist.affinity = 'gem';
      artist.affinityConfidence = gem.confidence;
      artist.affinityReason = gem.reason;
      artist.affinityLinkedTo = seeds.slice(0, GEM_LINKED_CAP);
    }
  }

  return { artists: annotated, lovedCount: loved.length, gemCount: gems.length, degraded };
}
