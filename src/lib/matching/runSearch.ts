import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { jobtechAdapter } from "../sources/jobtech";
import { joblinksAdapter } from "../sources/joblinks";
import { remotiveAdapter } from "../sources/remotive";
import { adzunaAdapter, adzunaConfigured } from "../sources/adzuna";
import { normalize } from "../normalize";
import { dedupeToRepresentatives, type DedupableJob } from "../dedup";
import { scoreJobs, type CandidateJob } from "./scoreJobs";
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
import type { Profile } from "./types";
import type { SourceAdapter, RawJob, FetchOpts } from "../sources/types";

export const MAX_TITLES = 4;
// Per title, per source. A wider net gives the semantic ranking more to choose
// from; the shortlist that reaches the LLM is still capped (RERANK_TOP_N).
const PER_FETCH_LIMIT = 25;

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
}

// Run one adapter across every title query, merged unique by the source's own id.
async function runSource(
  adapter: SourceAdapter,
  titles: string[],
  opts: Omit<FetchOpts, "query" | "limit">
): Promise<{ jobs: RawJob[]; health: SourceHealth }> {
  const results = await Promise.all(
    titles.map((query) => adapter.fetch({ query, limit: PER_FETCH_LIMIT, ...opts }))
  );

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
}

function toCandidate(r: Stored): CandidateJob {
  return {
    jobId: r.id,
    headline: r.headline,
    employer: r.employer,
    location: r.location,
    description: r.description,
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
      distance: number;
    }>
  >(Prisma.sql`
    SELECT id, source, "canonicalUrl", "dedupHash", headline, employer, location, description,
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

  return dedupeToRepresentatives(entries)
    .sort((a, b) => b.sim - a.sim)
    .map((e) => ({
      jobId: e.id,
      headline: e.headline,
      employer: e.employer,
      location: e.location,
      description: e.description,
    }));
}

// A scored match after geo weighting, before any user-scoped persistence.
interface ScoredMatch {
  jobId: string;
  score: number; // final score (geo weighting already applied)
  rationale: string;
  gaps: string;
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
): Promise<{ health: SourceHealth[]; scored: ScoredMatch[]; warning: string | null; timings: Timings }> {
  const timings: Timings = {};
  let t0 = Date.now();
  const lap = (name: string) => {
    const now = Date.now();
    timings[name] = now - t0;
    t0 = now;
  };
  const { country, regions, remote } = filters;
  const titles = filters.titles.slice(0, MAX_TITLES);
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
  let scoredRaw: Awaited<ReturnType<typeof scoreJobs>> = [];
  let warning: string | null = null;
  try {
    scoredRaw = await scoreJobs(profile, candidates, filters.lang ?? "en");
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

  const scored: ScoredMatch[] = scoredRaw.map((s) => {
    let finalScore = Math.round(s.score);
    let gaps = s.gaps ?? "";
    if (applyGeo) {
      const fit = locationFit(locationByJobId.get(s.jobId), selectedStems);
      if (fit === "in") {
        finalScore += IN_REGION_BONUS;
      } else if (fit === "out") {
        finalScore -= OUT_OF_REGION_PENALTY;
        // Explain the lowered score so a strong-fit far job doesn't look mis-scored.
        const note = filters.lang === "sv" ? "Ligger utanför din valda region." : "Outside your selected region.";
        gaps = gaps && !/^(none|inga|ingen)\b/i.test(gaps) ? `${gaps} ${note}` : note;
      } else {
        // The ad doesn't say where the job is (common on aggregated listings), so
        // we can't vouch that it's in the region the visitor asked for.
        finalScore -= UNKNOWN_LOCATION_PENALTY;
        const note = filters.lang === "sv" ? "Annonsen anger ingen ort." : "The ad doesn't say where the job is.";
        gaps = gaps && !/^(none|inga|ingen)\b/i.test(gaps) ? `${gaps} ${note}` : note;
      }
      finalScore = Math.max(0, Math.min(100, finalScore));
    }
    return { jobId: s.jobId, score: finalScore, rationale: s.rationale ?? "", gaps };
  });

  return { health, scored, warning, timings };
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
): Promise<{ health: SourceHealth[]; warning: string | null; results: PreviewMatch[]; timings: Timings }> {
  const { health, scored, warning, timings } = await computeScoredMatches(profile, filters);
  if (scored.length === 0) return { health, warning, results: [], timings };

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

  return { health, warning, results, timings };
}
