import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { jobtechAdapter } from "../sources/jobtech";
import { joblinksAdapter } from "../sources/joblinks";
import { remotiveAdapter } from "../sources/remotive";
import { adzunaAdapter, adzunaConfigured } from "../sources/adzuna";
import { normalize } from "../normalize";
import { dedupeToRepresentatives } from "../dedup";
import { scoreJobs, type CandidateJob } from "./scoreJobs";
import {
  regionStemsFromIds,
  locationFit,
  IN_REGION_BONUS,
  OUT_OF_REGION_PENALTY,
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
const PER_FETCH_LIMIT = 15;

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

  await prisma.sourceRun.create({
    data: { source: adapter.name, fetchedCount: jobs.length, status, error: errors.length ? errors.join("; ") : null },
  });

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

// Write job embeddings back to their rows (raw SQL — Prisma can't set an
// Unsupported column). Chunked so we don't flood the connection pool.
async function persistVectors(pairs: Array<readonly [string, number[]]>): Promise<void> {
  const CHUNK = 10;
  for (let i = 0; i < pairs.length; i += CHUNK) {
    await Promise.all(
      pairs.slice(i, i + CHUNK).map(([id, vec]) =>
        prisma.$executeRaw(
          Prisma.sql`UPDATE "Job" SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${id}`
        )
      )
    );
  }
}

// Cross-run recall: jobs the CURRENT keyword fetch didn't return, but that sit
// near the profile in embedding space. Scoped to Sweden + last 30 days, and to
// the selected regions when the search is region-locked, so recalled jobs stay
// geographically relevant. Returns each with a comparable cosine similarity
// (pgvector `<=>` is cosine distance, so similarity = 1 - distance).
async function recallSimilarJobs(
  profileVec: number[],
  filters: SearchFilters,
  excludeIds: string[]
): Promise<Array<{ cand: CandidateJob; sim: number }>> {
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
      headline: string;
      employer: string | null;
      location: string | null;
      description: string;
      distance: number;
    }>
  >(Prisma.sql`
    SELECT id, headline, employer, location, description,
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
    cand: {
      jobId: r.id,
      headline: r.headline,
      employer: r.employer,
      location: r.location,
      description: r.description,
    },
    sim: 1 - Number(r.distance),
  }));
}

// Build the candidate set for the reranker by SEMANTIC similarity to the profile,
// not the source's own sort order. Embeds the profile + this run's jobs, persists
// the job vectors (growing the corpus), pulls in cross-run recall, and returns
// the pool sorted best-first. THROWS on an embedding failure so the caller can
// fall back to the source-order interleave (a Voyage outage must not break search).
async function buildRankedCandidates(
  profile: Profile,
  reps: Stored[],
  filters: SearchFilters
): Promise<CandidateJob[]> {
  const [profileVec] = await embedTexts([profileEmbedText(profile)], "query");
  const repVecs = await embedTexts(reps.map(jobEmbedText), "document");

  // Grow the corpus so future runs can recall these (and skip re-embedding).
  await persistVectors(reps.map((r, i) => [r.id, repVecs[i]] as const));

  const pool = new Map<string, { cand: CandidateJob; sim: number }>();
  reps.forEach((r, i) => {
    pool.set(r.id, { cand: toCandidate(r), sim: cosine(profileVec, repVecs[i]) });
  });

  // Additive + guarded: recall failures never sink the run.
  try {
    for (const r of await recallSimilarJobs(profileVec, filters, [...pool.keys()])) {
      if (!pool.has(r.cand.jobId)) pool.set(r.cand.jobId, r);
    }
  } catch (err) {
    console.error("cross-run recall skipped:", err);
  }

  return [...pool.values()].sort((a, b) => b.sim - a.sim).map((x) => x.cand);
}

// A scored match after geo weighting, before any user-scoped persistence.
interface ScoredMatch {
  jobId: string;
  score: number; // final score (geo weighting already applied)
  rationale: string;
  gaps: string;
}

// The core search, WITHOUT any user-scoped persistence: pick sources for the
// market, fetch, dedup, embedding-rank, LLM-rerank, and deterministically weight
// by location. Returns the scored matches so callers can either persist them
// (authenticated search) or just display them (anonymous preview). Job rows and
// their embeddings ARE persisted here — they hold no personal data and growing
// the corpus is the whole point — but Match rows are the caller's concern.
async function computeScoredMatches(
  profile: Profile,
  filters: SearchFilters
): Promise<{ health: SourceHealth[]; scored: ScoredMatch[]; warning: string | null }> {
  const { country, regions, remote } = filters;
  const titles = filters.titles.slice(0, MAX_TITLES);
  if (titles.length === 0) return { health: [], scored: [], warning: "No titles selected" };

  const useRegions = country === "se" ? regions : [];
  const includeRemoteSources = !(country === "se" && useRegions.length > 0 && !remote);
  const plan: Array<{ adapter: SourceAdapter; opts: Omit<FetchOpts, "query" | "limit"> }> = [];
  if (jobtechAdapter.covers(country)) plan.push({ adapter: jobtechAdapter, opts: { regions: useRegions, remote } });
  if (joblinksAdapter.covers(country)) plan.push({ adapter: joblinksAdapter, opts: {} });
  if (adzunaConfigured() && adzunaAdapter.covers(country)) plan.push({ adapter: adzunaAdapter, opts: { country, remote } });
  if (includeRemoteSources && remotiveAdapter.covers(country)) plan.push({ adapter: remotiveAdapter, opts: {} });

  if (plan.length === 0) return { health: [], scored: [], warning: `No sources cover ${country}` };

  const sourceResults = await Promise.all(plan.map((p) => runSource(p.adapter, titles, p.opts)));
  const health = sourceResults.map((r) => r.health);
  if (health.every((h) => h.status === "error")) {
    return { health, scored: [], warning: "All sources failed to fetch." };
  }

  const stored: Stored[] = [];
  for (const { jobs, health: h } of sourceResults) {
    for (const raw of jobs) {
      const n = normalize(h.source, raw);
      const job = await prisma.job.upsert({
        where: { source_sourceId: { source: n.source, sourceId: n.sourceId } },
        create: n,
        update: {
          headline: n.headline,
          employer: n.employer,
          location: n.location,
          description: n.description,
          url: n.url,
          canonicalUrl: n.canonicalUrl,
          publishedAt: n.publishedAt,
          applicationDeadline: n.applicationDeadline,
          raw: n.raw,
        },
      });
      stored.push({
        id: job.id,
        source: job.source,
        canonicalUrl: job.canonicalUrl,
        dedupHash: job.dedupHash,
        headline: job.headline,
        employer: job.employer,
        location: job.location,
        description: job.description,
      });
    }
  }

  const reps = dedupeToRepresentatives(stored);
  // Rank candidates by embedding similarity to the profile. On any embedding
  // failure, fall back to the source-order interleave so search still works.
  let candidates: CandidateJob[];
  try {
    candidates = await buildRankedCandidates(profile, reps, filters);
  } catch (err) {
    console.error("embedding ranking failed, using source-order fallback:", err);
    candidates = interleaveBySource(reps).map(toCandidate);
  }

  let scoredRaw: Awaited<ReturnType<typeof scoreJobs>> = [];
  let warning: string | null = null;
  try {
    scoredRaw = await scoreJobs(profile, candidates);
    if (candidates.length > 0 && scoredRaw.length === 0) warning = "Re-ranker returned no scored jobs.";
  } catch (err) {
    warning = `Re-ranker failed: ${err instanceof Error ? err.message : String(err)}`;
  }

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
        gaps =
          gaps && gaps.toLowerCase() !== "none"
            ? `${gaps} Outside your selected region.`
            : "Outside your selected region.";
      }
      finalScore = Math.max(0, Math.min(100, finalScore));
    }
    return { jobId: s.jobId, score: finalScore, rationale: s.rationale ?? "", gaps };
  });

  return { health, scored, warning };
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
): Promise<{ health: SourceHealth[]; warning: string | null; results: PreviewMatch[] }> {
  const { health, scored, warning } = await computeScoredMatches(profile, filters);
  if (scored.length === 0) return { health, warning, results: [] };

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

  return { health, warning, results };
}
