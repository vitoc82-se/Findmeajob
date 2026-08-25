import { prisma } from "../prisma";
import { jobtechAdapter } from "../sources/jobtech";
import { joblinksAdapter } from "../sources/joblinks";
import { remotiveAdapter } from "../sources/remotive";
import { adzunaAdapter, adzunaConfigured } from "../sources/adzuna";
import { normalize } from "../normalize";
import { dedupeToRepresentatives } from "../dedup";
import { scoreJobs, type CandidateJob } from "./scoreJobs";
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

// The core search: pick sources for the market, fetch, dedup, LLM-rerank, and
// upsert matches. Used by both /api/v1/run (interactive) and the digest cron.
// Match.emailedAt is never touched here, so the digest's "not yet emailed"
// tracking survives re-runs.
export async function executeSearch(
  userId: string,
  profile: Profile,
  filters: SearchFilters
): Promise<{ health: SourceHealth[]; scoredJobIds: string[]; warning: string | null }> {
  const { country, regions, remote } = filters;
  const titles = filters.titles.slice(0, MAX_TITLES);
  if (titles.length === 0) return { health: [], scoredJobIds: [], warning: "No titles selected" };

  const useRegions = country === "se" ? regions : [];
  const includeRemoteSources = !(country === "se" && useRegions.length > 0 && !remote);
  const plan: Array<{ adapter: SourceAdapter; opts: Omit<FetchOpts, "query" | "limit"> }> = [];
  if (jobtechAdapter.covers(country)) plan.push({ adapter: jobtechAdapter, opts: { regions: useRegions, remote } });
  if (joblinksAdapter.covers(country)) plan.push({ adapter: joblinksAdapter, opts: {} });
  if (adzunaConfigured() && adzunaAdapter.covers(country)) plan.push({ adapter: adzunaAdapter, opts: { country, remote } });
  if (includeRemoteSources && remotiveAdapter.covers(country)) plan.push({ adapter: remotiveAdapter, opts: {} });

  if (plan.length === 0) return { health: [], scoredJobIds: [], warning: `No sources cover ${country}` };

  const sourceResults = await Promise.all(plan.map((p) => runSource(p.adapter, titles, p.opts)));
  const health = sourceResults.map((r) => r.health);
  if (health.every((h) => h.status === "error")) {
    return { health, scoredJobIds: [], warning: "All sources failed to fetch." };
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
  const candidates: CandidateJob[] = interleaveBySource(reps).map((r) => ({
    jobId: r.id,
    headline: r.headline,
    employer: r.employer,
    location: r.location,
    description: r.description,
  }));

  let scored: Awaited<ReturnType<typeof scoreJobs>> = [];
  let warning: string | null = null;
  try {
    scored = await scoreJobs(profile, candidates);
    if (candidates.length > 0 && scored.length === 0) warning = "Re-ranker returned no scored jobs.";
  } catch (err) {
    warning = `Re-ranker failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  for (const s of scored) {
    await prisma.match.upsert({
      where: { userId_jobId: { userId, jobId: s.jobId } },
      create: { userId, jobId: s.jobId, score: Math.round(s.score), rationale: s.rationale ?? "", gaps: s.gaps ?? "" },
      update: { score: Math.round(s.score), rationale: s.rationale ?? "", gaps: s.gaps ?? "" },
    });
  }

  return { health, scoredJobIds: scored.map((s) => s.jobId), warning };
}
