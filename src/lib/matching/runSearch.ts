import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { jobtechAdapter } from "../sources/jobtech";
import { joblinksAdapter } from "../sources/joblinks";
import { remotiveAdapter } from "../sources/remotive";
import { adzunaAdapter, adzunaConfigured } from "../sources/adzuna";
import { normalize } from "../normalize";
import { dedupeToRepresentatives, type DedupableJob } from "../dedup";
import { scoreJobs, RERANK_TOP_N, type CandidateJob } from "./scoreJobs";
import {
  regionStemsFromIds,
  locationFit,
  IN_REGION_BONUS,
  OUT_OF_REGION_PENALTY,
  UNKNOWN_LOCATION_PENALTY,
} from "./location";
import {
  embedTexts,
  cosine,
  toVectorLiteral,
  jobEmbedText,
  profileEmbedText,
} from "../embeddings";
import { strictQuery, isTitleOnly } from "./titles";
import { normalizeLevel, levelPenalty, LEVELS, type Level } from "./levels";
import { expandTitle } from "./expandTitles";
import { extractFeatures, type JobFeatures } from "./features";
import { voyageRerank } from "../rerank";
import type { Profile } from "./types";
import type { SourceAdapter, RawJob, FetchOpts } from "../sources/types";

export const MAX_TITLES = 4;
// A title-only search adds neighbouring titles (see expandTitles), so it may search more.
const MAX_EXPANDED_TITLES = 6;
// Per title, per source. A wider net gives the semantic ranking more to choose
// from; the shortlist that reaches the LLM is still capped (RERANK_TOP_N).
const PER_FETCH_LIMIT = 25;

// Semantic shortlist: candidates more than this far below the best similarity are
// dropped (keeping at least MIN_KEPT), so unrelated jobs never reach the re-ranker.
const SIM_FLOOR_BELOW_BEST = 0.15;
const MIN_KEPT = 8;
// Score penalty for candidates far less similar to the profile than the best one:
// 0 within the grace gap, then SLOPE points per unit of similarity, capped.
const SIM_PENALTY_GRACE = 0.06;
const SIM_PENALTY_SLOPE = 250;
const SIM_PENALTY_MAX = 30;

// Matches scoring below this are a different field or clearly unqualified. Showing
// them just adds noise, so they are dropped (an honest short list beats a padded one).
const MIN_SHOWN_SCORE = 40;

export interface SourceHealth {
  source: string;
  fetchedCount: number;
  status: string; // ok | empty_warning | error
  error?: string;
}

export interface SearchFilters {
  titles: string[];
  regions: string[];
  remote: boolean;
  country: string;
  // Language of the LLM-written rationale/gaps. Defaults to English.
  lang?: "sv" | "en";
  // Research only: return every candidate with all its signals, and score `pool` of them.
  debug?: { pool?: number };
}

// Run one adapter across every title query, merged unique by the source's own id.
async function runSource(
  adapter: SourceAdapter,
  titles: string[],
  opts: Omit<FetchOpts, "query" | "limit">
): Promise<{ jobs: RawJob[]; health: SourceHealth }> {
  // Multi-word titles are searched strictly first (every word must appear); only if
  // that finds little do we also run the loose query, so "IT chef" doesn't drown in
  // unrelated "chef" ads but a thin market still gets results.
  const MIN_STRICT_HITS = 6;
  const results = (
    await Promise.all(
      titles.map(async (query) => {
        const strict = strictQuery(query);
        if (!strict) return [await adapter.fetch({ query, limit: PER_FETCH_LIMIT, ...opts })];
        const first = await adapter.fetch({ query: strict, limit: PER_FETCH_LIMIT, ...opts });
        if (first.status === "ok" && first.jobs.length >= MIN_STRICT_HITS) return [first];
        const loose = await adapter.fetch({ query, limit: PER_FETCH_LIMIT, ...opts });
        return [first, loose];
      })
    )
  ).flat();

  const bySourceId = new Map<string, RawJob>();
  let anyOk = false;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "ok") {
      anyOk = true;
      for (const j of r.jobs) if (!bySourceId.has(j.sourceId)) bySourceId.set(j.sourceId, j);
    } else if (r.error) {
      errors.push(r.error);
    }
  }

  const jobs = [...bySourceId.values()];
  let status: string;
  if (!anyOk) status = "error";
  else if (jobs.length === 0) status = "empty_warning";
  else status = "ok";

  // Health bookkeeping must not slow the search: log it, don't wait for it.
  void prisma.sourceRun
    .create({
      data: { source: adapter.name, fetchedCount: jobs.length, status, error: errors.length ? errors.join("; ") : null },
    })
    .catch((err) => console.error("sourceRun log failed:", err));

  return {
    jobs,
    health: { source: adapter.name, fetchedCount: jobs.length, status, error: errors.length ? errors.join("; ") : undefined },
  };
}

// Round-robin interleave by source so the top-N reranked set sees every source.
function interleaveBySource<T extends { source: string }>(items: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    (buckets.get(it.source) ?? buckets.set(it.source, []).get(it.source)!).push(it);
  }
  const lists = [...buckets.values()];
  const out: T[] = [];
  let added = true;
  for (let i = 0; added; i++) {
    added = false;
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
        added = true;
      }
    }
  }
  return out;
}

interface Stored {
  id: string;
  source: string;
  canonicalUrl: string | null;
  dedupHash: string;
  headline: string;
  employer: string | null;
  location: string | null;
  description: string;
  raw?: unknown;
}

function toCandidate(r: Stored): CandidateJob {
  return {
    jobId: r.id,
    headline: r.headline,
    employer: r.employer,
    location: r.location,
    description: r.description,
    feat: extractFeatures(r.raw),
  };
}

// Write job embeddings back to their rows (raw SQL: Prisma can't set an
// Unsupported column). One UPDATE ... FROM (VALUES ...) per chunk instead of one
// statement per job, so persisting a run's vectors is a couple of round trips.
async function persistVectors(pairs: Array<readonly [string, number[]]>): Promise<void> {
  const CHUNK = 25;
  const chunks: Array<typeof pairs> = [];
  for (let i = 0; i < pairs.length; i += CHUNK) chunks.push(pairs.slice(i, i + CHUNK));
  await Promise.all(
    chunks.map((chunk) =>
      prisma.$executeRaw(
        Prisma.sql`UPDATE "Job" AS j SET embedding = v.e::vector
          FROM (VALUES ${Prisma.join(
            chunk.map(([id, vec]) => Prisma.sql`(${id}, ${toVectorLiteral(vec)})`)
          )}) AS v(id, e)
          WHERE j.id = v.id`
      )
    )
  );
}

// Jobs already embedded (by the daily crawl or an earlier search) don't need
// another Voyage call: ask the database for their similarity to the profile
// directly. Returns id -> cosine similarity for the ones that have a vector.
async function storedSimilarities(ids: string[], profileVec: number[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const rows = await prisma.$queryRaw<Array<{ id: string; sim: number }>>(Prisma.sql`
    SELECT id, 1 - (embedding <=> ${toVectorLiteral(profileVec)}::vector) AS sim
    FROM "Job"
    WHERE id IN (${Prisma.join(ids)}) AND embedding IS NOT NULL
  `);
  for (const r of rows) out.set(r.id, Number(r.sim));
  return out;
}

// A candidate carrying the dedup signals (canonical URL, dedupHash, source) so
// the WHOLE pool — this run's reps AND cross-run recall — can be collapsed to one
// posting per job, and its similarity for ordering.
type PoolEntry = DedupableJob & {
  headline: string;
  employer: string | null;
  location: string | null;
  description: string;
  sim: number;
  raw?: unknown;
};

// A location-robust dedup key: employer | title | municipality (the first token
// of the location, so "Lund, Skåne län, Sverige" and "Lund, Skåne, Sverige" both
// key on "lund"). Computed fresh at merge time so cross-source / cross-run
// location-string drift can't smuggle a duplicate past the dedup.
function contentKey(e: { employer: string | null; headline: string; location: string | null }): string {
  const norm = (s: string | null | undefined) =>
    (s ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  const municipality = norm(e.location).split(" ")[0] ?? "";
  return `${norm(e.employer)}|${norm(e.headline)}|${municipality}`;
}

// Cross-run recall: jobs the CURRENT keyword fetch didn't return, but that sit
// near the profile in embedding space. Scoped to Sweden + last 30 days, and to
// the selected regions when the search is region-locked, so recalled jobs stay
// geographically relevant. Carries dedup signals so a recalled posting that also
// exists in this run (another source/id) is collapsed, not shown twice.
async function recallSimilarJobs(
  profileVec: number[],
  filters: SearchFilters,
  excludeIds: string[]
): Promise<PoolEntry[]> {
  if (filters.country !== "se") return []; // v1: recall only in the primary market
  const vecLit = toVectorLiteral(profileVec);

  const stems =
    filters.regions.length > 0 && !filters.remote ? regionStemsFromIds(filters.regions) : [];
  const geo =
    stems.length > 0
      ? Prisma.sql`AND (${Prisma.join(
          stems.map((s) => Prisma.sql`location ILIKE ${`%${s}%`}`),
          " OR "
        )})`
      : Prisma.sql`AND (source IN ('jobtech', 'joblinks') OR location ILIKE '%sverige%')`;
  const exclude =
    excludeIds.length > 0 ? Prisma.sql`AND id NOT IN (${Prisma.join(excludeIds)})` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      source: string;
      canonicalUrl: string | null;
      dedupHash: string;
      headline: string;
      employer: string | null;
      location: string | null;
      description: string;
      raw: unknown;
      distance: number;
    }>
  >(Prisma.sql`
    SELECT id, source, "canonicalUrl", "dedupHash", headline, employer, location, description, raw,
           embedding <=> ${vecLit}::vector AS distance
    FROM "Job"
    WHERE embedding IS NOT NULL
      AND "firstSeen" > now() - interval '30 days'
      AND ("applicationDeadline" IS NULL OR "applicationDeadline" > now())
      ${geo}
      ${exclude}
    ORDER BY embedding <=> ${vecLit}::vector
    LIMIT 30
  `);

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    canonicalUrl: r.canonicalUrl,
    dedupHash: r.dedupHash,
    headline: r.headline,
    employer: r.employer,
    location: r.location,
    description: r.description,
    raw: r.raw,
    sim: 1 - Number(r.distance),
  }));
}

// Build the candidate set for the reranker by SEMANTIC similarity to the profile,
// not the source's own sort order. Embeds the profile + this run's jobs, persists
// the job vectors (growing the corpus), pulls in cross-run recall, dedups the
// WHOLE pool (so a recalled posting can't duplicate a fetched one), and returns
// it sorted best-first. THROWS on an embedding failure so the caller can fall
// back to the source-order interleave (a Voyage outage must not break search).
async function buildRankedCandidates(
  profileVecP: Promise<number[]>,
  reps: Stored[],
  filters: SearchFilters
): Promise<CandidateJob[]> {
  // The profile vector was requested at the start of the search, in parallel with
  // the job fetch, so it is normally already here.
  const profileVec = await profileVecP;

  // Only embed jobs that don't have a vector yet; reuse the stored ones.
  const sims = await storedSimilarities(reps.map((r) => r.id), profileVec);
  const missing = reps.filter((r) => !sims.has(r.id));
  const missingVecs = await embedTexts(missing.map(jobEmbedText), "document");
  missing.forEach((r, i) => sims.set(r.id, cosine(profileVec, missingVecs[i])));

  // Grow the corpus so future runs can reuse these. Runs alongside the recall
  // query below rather than in front of it.
  const persist = persistVectors(missing.map((r, i) => [r.id, missingVecs[i]] as const)).catch((err) =>
    console.error("persisting embeddings failed:", err)
  );

  const entries: PoolEntry[] = reps.map((r) => ({
    id: r.id,
    source: r.source,
    canonicalUrl: r.canonicalUrl,
    dedupHash: r.dedupHash,
    headline: r.headline,
    employer: r.employer,
    location: r.location,
    description: r.description,
    raw: r.raw,
    sim: sims.get(r.id) ?? 0,
  }));

  // Additive + guarded: recall failures never sink the run.
  try {
    const recalled = await recallSimilarJobs(profileVec, filters, entries.map((e) => e.id));
    entries.push(...recalled);
  } catch (err) {
    console.error("cross-run recall skipped:", err);
  }
  await persist;

  // Collapse duplicates across reps AND recall. We recompute a location-robust
  // key here (employer | title | municipality) rather than trusting each row's
  // stored dedupHash: the same posting can arrive from two sources (or an older
  // run) with a slightly different location string — e.g. "Skåne län" vs
  // "Skåne" — which would otherwise hash differently and show twice. Overriding
  // dedupHash lets dedupeToRepresentatives (canonical URL OR hash) group them.
  for (const e of entries) e.dedupHash = contentKey(e);

  // Semantic recall always returns "the nearest N", even when nothing near exists
  // (a narrow region, a rare title), which pads the list with unrelated jobs. Drop
  // anything far below the best candidate's similarity, but always keep a handful
  // so a thin market still shows what little there is.
  const ranked = dedupeToRepresentatives(entries).sort((a, b) => b.sim - a.sim);
  const floor = (ranked[0]?.sim ?? 0) - SIM_FLOOR_BELOW_BEST;
  const kept = ranked.filter((e, i) => i < MIN_KEPT || e.sim >= floor);

  return kept
    .map((e) => ({
      jobId: e.id,
      headline: e.headline,
      employer: e.employer,
      location: e.location,
      description: e.description,
      sim: e.sim,
      feat: extractFeatures(e.raw),
    }));
}

// A scored match after geo weighting, before any user-scoped persistence.
interface ScoredMatch {
  jobId: string;
  score: number; // final score (geo weighting already applied)
  rationale: string;
  gaps: string;
  level: Level | "unclear";
}

export interface DebugRow {
  rank: number;
  jobId: string;
  headline: string;
  employer: string | null;
  location: string | null;
  sim: number | null;
  rr?: number | null; // cross-encoder relevance
  rrErr?: string;
  feat: JobFeatures | null;
  llm: { score: number | null; same: boolean | null; level: string | null; rationale: string; gaps: string } | null;
  adj: { simPen: number; geo: number; fit: string; lvl: number; final: number } | null;
  final: number | null;
}

// Milliseconds spent per phase of one search, surfaced as a Server-Timing header
// so slow phases show up in real traffic instead of being guessed at.
export type Timings = Record<string, number>;

// The core search, WITHOUT any user-scoped persistence: pick sources for the
// market, fetch, dedup, embedding-rank, LLM-rerank, and deterministically weight
// by location. Returns the scored matches so callers can either persist them
// (authenticated search) or just display them (anonymous preview). Job rows and
// their embeddings ARE persisted here — they hold no personal data and growing
// the corpus is the whole point — but Match rows are the caller's concern.
async function computeScoredMatches(
  profile: Profile,
  filters: SearchFilters
): Promise<{ health: SourceHealth[]; scored: ScoredMatch[]; warning: string | null; timings: Timings; debug?: DebugRow[] }> {
  const timings: Timings = {};
  let t0 = Date.now();
  const lap = (name: string) => {
    const now = Date.now();
    timings[name] = now - t0;
    t0 = now;
  };
  const { country, regions, remote } = filters;
  let titles = filters.titles.slice(0, MAX_TITLES);
  // A typed title alone is narrower than the market: also search its neighbours
  // (synonyms, one seniority step either way). CV-based searches already carry
  // several titles from the CV, so they are left as they are.
  if (titles.length === 1 && isTitleOnly(profile)) {
    titles = (await expandTitle(titles[0], normalizeLevel(profile.seniority))).slice(0, MAX_EXPANDED_TITLES);
  }
  lap("expand");
  if (titles.length === 0) return { health: [], scored: [], warning: "No titles selected", timings };

  const useRegions = country === "se" ? regions : [];
  const includeRemoteSources = !(country === "se" && useRegions.length > 0 && !remote);
  const plan: Array<{ adapter: SourceAdapter; opts: Omit<FetchOpts, "query" | "limit"> }> = [];
  if (jobtechAdapter.covers(country)) plan.push({ adapter: jobtechAdapter, opts: { regions: useRegions, remote } });
  if (joblinksAdapter.covers(country)) plan.push({ adapter: joblinksAdapter, opts: { regions: useRegions } });
  if (adzunaConfigured() && adzunaAdapter.covers(country)) plan.push({ adapter: adzunaAdapter, opts: { country, remote } });
  if (includeRemoteSources && remotiveAdapter.covers(country)) plan.push({ adapter: remotiveAdapter, opts: {} });

  if (plan.length === 0) return { health: [], scored: [], warning: `No sources cover ${country}`, timings };

  // Start embedding the profile now: it only needs the profile, so it overlaps
  // with the job fetch instead of waiting behind it.
  const profileVecP = embedTexts([profileEmbedText(profile)], "query").then((v) => v[0]);
  profileVecP.catch(() => {}); // handled where it is awaited; avoid an unhandled rejection

  const sourceResults = await Promise.all(plan.map((p) => runSource(p.adapter, titles, p.opts)));
  const health = sourceResults.map((r) => r.health);
  lap("sources");
  if (health.every((h) => h.status === "error")) {
    return { health, scored: [], warning: "All sources failed to fetch.", timings };
  }

  // Save this run's postings in bulk: one INSERT ... ON CONFLICT DO NOTHING plus
  // one read-back per source, instead of an upsert round trip per job. Existing
  // rows are left as they are (a posting's text rarely changes mid-search).
  const perSource = await Promise.all(
    sourceResults.map(async ({ jobs, health: h }) => {
      if (jobs.length === 0) return [] as Stored[];
      const normalized = jobs.map((raw) => normalize(h.source, raw));
      await prisma.job.createMany({ data: normalized, skipDuplicates: true });
      const rows = await prisma.job.findMany({
        where: { source: h.source, sourceId: { in: normalized.map((n) => n.sourceId) } },
        select: {
          id: true,
          source: true,
          canonicalUrl: true,
          dedupHash: true,
          headline: true,
          employer: true,
          location: true,
          description: true,
          raw: true,
        },
      });
      return rows as Stored[];
    })
  );
  const stored: Stored[] = perSource.flat();
  lap("upsert");
  const reps = dedupeToRepresentatives(stored);
  // Rank candidates by embedding similarity to the profile. On any embedding
  // failure, fall back to the source-order interleave so search still works.
  let candidates: CandidateJob[];
  try {
    candidates = await buildRankedCandidates(profileVecP, reps, filters);
  } catch (err) {
    console.error("embedding ranking failed, using source-order fallback:", err);
    candidates = interleaveBySource(reps).map(toCandidate);
  }

  lap("embed");
  // Research: score the whole pool with the cross-encoder so it can be compared with
  // every other signal offline.
  let rrScores: number[] | null = null;
  let rrErr: string | undefined;
  if (filters.debug) {
    const pool = candidates.slice(0, filters.debug.pool ?? RERANK_TOP_N);
    const q = isTitleOnly(profile)
      ? `Jobb som ${profile.titles[0]}${profile.seniority ? ` (${profile.seniority}-nivå)` : ""}`
      : `${profile.titles.join(", ")}. ${profile.summary} Färdigheter: ${profile.skills.slice(0, 10).join(", ")}`;
    const docs = pool.map((c) =>
      [c.headline, c.employer, c.feat?.group, c.description.slice(0, 700)].filter(Boolean).join("\n")
    );
    try {
      rrScores = await voyageRerank(q, docs);
    } catch (err) {
      rrErr = err instanceof Error ? err.message : String(err);
    }
    lap("rerankX");
  }
  let scoredRaw: Awaited<ReturnType<typeof scoreJobs>> = [];
  let warning: string | null = null;
  try {
    scoredRaw = await scoreJobs(profile, candidates, filters.lang ?? "en", isTitleOnly(profile) ? "careful" : "fast", filters.debug?.pool ?? RERANK_TOP_N);
    if (candidates.length > 0 && scoredRaw.length === 0) warning = "Re-ranker returned no scored jobs.";
  } catch (err) {
    warning = `Re-ranker failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  lap("rerank");
  // Deterministic location weighting — only when the user narrowed to specific
  // Swedish regions AND isn't searching remote (remote makes geography moot).
  // This mirrors the includeRemoteSources condition above: exactly the case
  // where an out-of-region job can leak in (e.g. joblinks, which doesn't filter
  // by region server-side).
  const applyGeo = country === "se" && useRegions.length > 0 && !remote;
  const selectedStems = applyGeo ? regionStemsFromIds(useRegions) : [];
  // Built from candidates (not stored) so cross-run recalled jobs — which were
  // never fetched this run — still get their location weighting.
  const locationByJobId = new Map(candidates.map((c) => [c.jobId, c.location] as const));

  // Second opinion from the embeddings: a small model can misjudge one batch (it once
  // scored a cook 93 for an IT manager). A job far less similar to the profile than
  // the best candidate loses points, so such a slip can't outrank the real matches.
  const simById = new Map(candidates.map((c) => [c.jobId, c.sim] as const));
  const bestSim = Math.max(0, ...candidates.map((c) => c.sim ?? 0));
  const simPenalty = (jobId: string): number => {
    const sim = simById.get(jobId);
    if (sim === undefined || bestSim === 0) return 0;
    return Math.min(SIM_PENALTY_MAX, Math.max(0, Math.round((bestSim - sim - SIM_PENALTY_GRACE) * SIM_PENALTY_SLOPE)));
  };

  const wantLevel = normalizeLevel(profile.seniority);
  const comp = new Map<string, { simPen: number; geo: number; fit: string; lvl: number; final: number }>();

  const scored: ScoredMatch[] = scoredRaw.map((s) => {
    const simPen = simPenalty(s.jobId);
    let geoDelta = 0;
    let fitName = "n/a";
    let lvlDelta = 0;
    let finalScore = Math.round(s.score) - simPen;
    let gaps = s.gaps ?? "";
    if (applyGeo) {
      const fit = locationFit(locationByJobId.get(s.jobId), selectedStems);
      fitName = fit;
      if (fit === "in") {
        geoDelta = IN_REGION_BONUS;
        finalScore += IN_REGION_BONUS;
      } else if (fit === "out") {
        geoDelta = -OUT_OF_REGION_PENALTY;
        finalScore -= OUT_OF_REGION_PENALTY;
        // Explain the lowered score so a strong-fit far job doesn't look mis-scored.
        const note = filters.lang === "sv" ? "Ligger utanför din valda region." : "Outside your selected region.";
        gaps = gaps && !/^(none|inga|ingen)\b/i.test(gaps) ? `${gaps} ${note}` : note;
      } else {
        // The ad doesn't say where the job is (common on aggregated listings), so
        // we can't vouch that it's in the region the visitor asked for.
        geoDelta = -UNKNOWN_LOCATION_PENALTY;
        finalScore -= UNKNOWN_LOCATION_PENALTY;
        const note = filters.lang === "sv" ? "Annonsen anger ingen ort." : "The ad doesn't say where the job is.";
        gaps = gaps && !/^(none|inga|ingen)\b/i.test(gaps) ? `${gaps} ${note}` : note;
      }
      finalScore = Math.max(0, Math.min(100, finalScore));
    }
    // Seniority: the level the person picked (or their CV implies) against the level the
    // ad describes. Deterministic, so the same mismatch always costs the same.
    if (wantLevel) {
      const lp = levelPenalty(wantLevel, s.jobLevel);
      if (lp > 0 && s.jobLevel && s.jobLevel !== "unclear") {
        lvlDelta = -lp;
        finalScore = Math.max(0, finalScore - lp);
        const higher = LEVELS.indexOf(s.jobLevel) > LEVELS.indexOf(wantLevel);
        const note =
          filters.lang === "sv"
            ? `Nivån ligger ${higher ? "över" : "under"} den du valt.`
            : `The level is ${higher ? "above" : "below"} the one you chose.`;
        gaps = gaps && !/^(none|inga|ingen)\b/i.test(gaps) ? `${gaps} ${note}` : note;
      }
    }
    comp.set(s.jobId, { simPen, geo: geoDelta, fit: fitName, lvl: lvlDelta, final: finalScore });
    return { jobId: s.jobId, score: finalScore, rationale: s.rationale ?? "", gaps, level: s.jobLevel ?? "unclear" };
  }).filter((m) => m.score >= MIN_SHOWN_SCORE);

  // Research output: every candidate with every signal that went into its score.
  let debug: DebugRow[] | undefined;
  if (filters.debug) {
    const raw = new Map(scoredRaw.map((r) => [r.jobId, r] as const));
    debug = candidates.map((c, i) => {
      const r = raw.get(c.jobId);
      const k = comp.get(c.jobId);
      return {
        rank: i,
        jobId: c.jobId,
        headline: c.headline,
        employer: c.employer,
        location: c.location,
        sim: c.sim ?? null,
        rr: rrScores ? (rrScores[i] ?? null) : null,
        rrErr,
        feat: c.feat ?? null,
        llm: r ? { score: r.llmScore ?? null, same: r.sameOccupation ?? null, level: r.jobLevel ?? null, rationale: r.rationale, gaps: r.gaps } : null,
        adj: k ?? null,
        final: k ? k.final : null,
      };
    });
  }

  return { health, scored, warning, timings, debug };
}

// The authenticated search: compute scored matches and upsert them for the user.
// Used by both /api/v1/run (interactive) and the digest cron. Match.emailedAt is
// never touched here, so the digest's "not yet emailed" tracking survives re-runs.
export async function executeSearch(
  userId: string,
  profile: Profile,
  filters: SearchFilters
): Promise<{ health: SourceHealth[]; scoredJobIds: string[]; warning: string | null }> {
  const { health, scored, warning } = await computeScoredMatches(profile, filters);

  for (const s of scored) {
    await prisma.match.upsert({
      where: { userId_jobId: { userId, jobId: s.jobId } },
      create: { userId, jobId: s.jobId, score: s.score, rationale: s.rationale, gaps: s.gaps },
      update: { score: s.score, rationale: s.rationale, gaps: s.gaps },
    });
  }

  return { health, scoredJobIds: scored.map((s) => s.jobId), warning };
}

// A preview match: everything the UI needs to render a result card, with no
// Match row ever created.
export interface PreviewMatch {
  jobId: string;
  score: number;
  rationale: string;
  gaps: string;
  level: Level | "unclear";
  job: {
    headline: string;
    employer: string | null;
    location: string | null;
    url: string;
    source: string;
    applicationDeadline: Date | null;
  };
}

// The anonymous preview search: same pipeline as executeSearch, but persists NO
// user-scoped rows. Reads the display fields for the scored jobs and returns them
// sorted best-first, so a signed-out visitor can see real matches before signing
// up. Powers the public /try flow.
export async function previewSearch(
  profile: Profile,
  filters: SearchFilters
): Promise<{ health: SourceHealth[]; warning: string | null; results: PreviewMatch[]; timings: Timings; debug?: Array<DebugRow & { url?: string; source?: string }> }> {
  const { health, scored, warning, timings, debug } = await computeScoredMatches(profile, filters);
  let debugOut: Array<DebugRow & { url?: string; source?: string }> | undefined;
  if (debug) {
    const urls = await prisma.job.findMany({ where: { id: { in: debug.map((d) => d.jobId) } }, select: { id: true, url: true, source: true } });
    const um = new Map(urls.map((u) => [u.id, u] as const));
    debugOut = debug.map((d) => ({ ...d, url: um.get(d.jobId)?.url, source: um.get(d.jobId)?.source }));
  }
  if (scored.length === 0) return { health, warning, results: [], timings, debug: debugOut };

  const jobs = await prisma.job.findMany({
    where: { id: { in: scored.map((s) => s.jobId) } },
    select: {
      id: true,
      headline: true,
      employer: true,
      location: true,
      url: true,
      source: true,
      applicationDeadline: true,
    },
  });
  const byId = new Map(jobs.map((j) => [j.id, j]));

  const results: PreviewMatch[] = [];
  for (const s of scored) {
    const j = byId.get(s.jobId);
    if (!j) continue;
    results.push({
      jobId: s.jobId,
      score: s.score,
      rationale: s.rationale,
      gaps: s.gaps,
      level: s.level,
      job: {
        headline: j.headline,
        employer: j.employer,
        location: j.location,
        url: j.url,
        source: j.source,
        applicationDeadline: j.applicationDeadline,
      },
    });
  }
  results.sort((a, b) => b.score - a.score);

  return { health, warning, results, timings, debug: debugOut };
}
