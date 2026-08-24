import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jobtechAdapter } from "@/lib/sources/jobtech";
import { remotiveAdapter } from "@/lib/sources/remotive";
import { adzunaAdapter, adzunaConfigured } from "@/lib/sources/adzuna";
import { isValidRegionId } from "@/lib/sources/regions";
import { normalize } from "@/lib/normalize";
import { dedupeToRepresentatives } from "@/lib/dedup";
import { scoreJobs, type CandidateJob } from "@/lib/matching/scoreJobs";
import type { Profile } from "@/lib/matching/types";
import type { SourceAdapter, RawJob, FetchOpts } from "@/lib/sources/types";

export const runtime = "nodejs";
export const maxDuration = 60; // multi-source fetch + LLM rerank

const USER_ID = "niklas";
const MAX_TITLES = 4;
const PER_FETCH_LIMIT = 15;

interface SourceHealth {
  source: string;
  fetchedCount: number;
  status: string; // ok | empty_warning | error
}

// Run one adapter across every title query, merged unique by the source's own id.
async function runSource(
  adapter: SourceAdapter,
  titles: string[],
  opts: Omit<FetchOpts, "query" | "limit">
): Promise<{ jobs: RawJob[]; health: SourceHealth }> {
  const results = await Promise.all(
    titles.map((query) =>
      adapter.fetch({ query, limit: PER_FETCH_LIMIT, ...opts })
    )
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
    data: {
      source: adapter.name,
      fetchedCount: jobs.length,
      status,
      error: errors.length ? errors.join("; ") : null,
    },
  });

  return { jobs, health: { source: adapter.name, fetchedCount: jobs.length, status } };
}

// Round-robin interleave by source so the top-N reranked set sees every source,
// not just the first one (no embeddings yet to rank recall globally).
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

// POST /api/v1/run  { titles?, regions?, remote? }
export async function POST(req: NextRequest) {
  // 0. Parse filters.
  let bodyTitles: string[] = [];
  let regions: string[] = [];
  let remote = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.titles))
      bodyTitles = body.titles.filter((t: unknown) => typeof t === "string" && t.trim());
    if (Array.isArray(body?.regions))
      regions = body.regions.filter((r: unknown) => typeof r === "string" && isValidRegionId(r));
    remote = Boolean(body?.remote);
  } catch {
    /* empty body → fall back to profile titles */
  }

  // 1. Profile.
  const profileRow = await prisma.profile.findUnique({ where: { userId: USER_ID } });
  if (!profileRow) {
    return NextResponse.json({ error: "No profile yet — parse a CV first." }, { status: 400 });
  }
  const profile = profileRow.extracted as unknown as Profile;

  const titles = (bodyTitles.length ? bodyTitles : profile.titles).slice(0, MAX_TITLES);
  if (titles.length === 0) {
    return NextResponse.json({ error: "No titles selected — pick at least one role." }, { status: 400 });
  }

  // 2. Choose sources. JobTech always (Swedish market, honors region/remote).
  //    Remote boards join unless the user restricted to on-site regions.
  const includeRemoteSources = !(regions.length > 0 && !remote);
  const plan: Array<{ adapter: SourceAdapter; opts: Omit<FetchOpts, "query" | "limit"> }> = [
    { adapter: jobtechAdapter, opts: { regions, remote } },
  ];
  if (includeRemoteSources) {
    plan.push({ adapter: remotiveAdapter, opts: {} });
    if (adzunaConfigured()) plan.push({ adapter: adzunaAdapter, opts: {} });
  }

  // 3. Fetch all sources in parallel.
  const sourceResults = await Promise.all(plan.map((p) => runSource(p.adapter, titles, p.opts)));
  const health = sourceResults.map((r) => r.health);

  // Every source failed → surface it (F3).
  if (health.every((h) => h.status === "error")) {
    return NextResponse.json(
      { error: "All sources failed to fetch.", health, matches: [] },
      { status: 502 }
    );
  }

  // 4. Normalize + persist every job; keep a record with the fields we need.
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

  // 5. Cross-source dedup, then interleave so the rerank sees every source.
  const reps = dedupeToRepresentatives(stored);
  const candidates: CandidateJob[] = interleaveBySource(reps).map((r) => ({
    jobId: r.id,
    headline: r.headline,
    employer: r.employer,
    location: r.location,
    description: r.description,
  }));

  // 6. LLM re-rank (top N — F2 guardrail inside scoreJobs). Surface failures.
  let scored: Awaited<ReturnType<typeof scoreJobs>> = [];
  let rerankWarning: string | null = null;
  try {
    scored = await scoreJobs(profile, candidates);
    if (candidates.length > 0 && scored.length === 0)
      rerankWarning = "Re-ranker returned no scored jobs for the fetched candidates.";
  } catch (err) {
    rerankWarning = `Re-ranker failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 7. Persist matches.
  for (const s of scored) {
    await prisma.match.upsert({
      where: { userId_jobId: { userId: USER_ID, jobId: s.jobId } },
      create: {
        userId: USER_ID,
        jobId: s.jobId,
        score: Math.round(s.score),
        rationale: s.rationale ?? "",
        gaps: s.gaps ?? "",
      },
      update: { score: Math.round(s.score), rationale: s.rationale ?? "", gaps: s.gaps ?? "" },
    });
  }

  // 8. Return ranked list joined with job details.
  const matches = await prisma.match.findMany({
    where: { userId: USER_ID },
    include: { job: true },
    orderBy: { score: "desc" },
  });

  return NextResponse.json({
    health,
    candidateCount: candidates.length,
    scoredCount: scored.length,
    warning: rerankWarning,
    matches: matches.map((m) => ({
      id: m.id,
      score: m.score,
      rationale: m.rationale,
      gaps: m.gaps,
      status: m.status,
      job: {
        headline: m.job.headline,
        employer: m.job.employer,
        location: m.job.location,
        url: m.job.url,
        source: m.job.source,
        applicationDeadline: m.job.applicationDeadline,
      },
    })),
  });
}
