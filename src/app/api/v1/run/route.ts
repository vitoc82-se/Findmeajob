import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jobtechAdapter } from "@/lib/sources/jobtech";
import { normalize } from "@/lib/normalize";
import { scoreJobs, type CandidateJob } from "@/lib/matching/scoreJobs";
import type { Profile } from "@/lib/matching/types";
import type { RawJob } from "@/lib/sources/types";

export const runtime = "nodejs";

const USER_ID = "niklas";

// POST /api/v1/run
// The Phase 1 "Run now" pipeline: stored profile -> JobTech fetch -> normalize
// -> store jobs -> LLM re-rank -> store matches -> return ranked list + source
// health. Single source (JobTech), so no cross-source dedup yet.
export async function POST() {
  // 1. Load the stored profile.
  const profileRow = await prisma.profile.findUnique({ where: { userId: USER_ID } });
  if (!profileRow) {
    return NextResponse.json(
      { error: "No profile yet — parse a CV first." },
      { status: 400 }
    );
  }
  const profile = profileRow.extracted as unknown as Profile;

  // 2. Fetch JobTech for the top titles and merge unique postings.
  const queries = profile.titles.slice(0, 2);
  const bySourceId = new Map<string, RawJob>();
  let anyOk = false;
  const errors: string[] = [];

  for (const query of queries) {
    const result = await jobtechAdapter.fetch({ query, limit: 25 });
    if (result.status === "ok") {
      anyOk = true;
      for (const job of result.jobs) {
        if (!bySourceId.has(job.sourceId)) bySourceId.set(job.sourceId, job);
      }
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  const fetchedCount = bySourceId.size;

  // 3. F3 health status: distinguish "worked, found jobs", "worked but empty
  //    (suspicious)", and "all fetches failed".
  let status: string;
  if (!anyOk) status = "error";
  else if (fetchedCount === 0) status = "empty_warning";
  else status = "ok";

  await prisma.sourceRun.create({
    data: {
      source: "jobtech",
      fetchedCount,
      status,
      error: errors.length ? errors.join("; ") : null,
    },
  });

  if (status === "error") {
    return NextResponse.json(
      {
        error: "JobTech fetch failed — no jobs retrieved.",
        detail: errors.join("; "),
        health: [{ source: "jobtech", fetchedCount, status }],
      },
      { status: 502 }
    );
  }

  // 4. Persist jobs (upsert by source+sourceId) and build scoring candidates.
  const candidates: CandidateJob[] = [];
  for (const raw of bySourceId.values()) {
    const n = normalize("jobtech", raw);
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
    candidates.push({
      jobId: job.id,
      headline: job.headline,
      employer: job.employer,
      location: job.location,
      description: job.description,
    });
  }

  // 5. LLM re-rank (top N only — F2 guardrail lives inside scoreJobs).
  const scored = await scoreJobs(profile, candidates);

  // 6. Persist matches.
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
      update: {
        score: Math.round(s.score),
        rationale: s.rationale ?? "",
        gaps: s.gaps ?? "",
      },
    });
  }

  // 7. Return the ranked list joined with job details.
  const matches = await prisma.match.findMany({
    where: { userId: USER_ID },
    include: { job: true },
    orderBy: { score: "desc" },
  });

  return NextResponse.json({
    health: [{ source: "jobtech", fetchedCount, status }],
    scoredCount: scored.length,
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
        applicationDeadline: m.job.applicationDeadline,
      },
    })),
  });
}
