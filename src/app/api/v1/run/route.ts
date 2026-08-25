import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isValidRegionId } from "@/lib/sources/regions";
import { isValidCountry, DEFAULT_COUNTRY } from "@/lib/sources/countries";
import { executeSearch } from "@/lib/matching/runSearch";
import { rateLimit, LIMITS } from "@/lib/rateLimit";
import type { Profile } from "@/lib/matching/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/v1/run  { titles?, regions?, remote?, country? }
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(userId, "run", LIMITS.run.max, LIMITS.run.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit reached. Try again in ~${rl.retryAfterMinutes} min.` },
      { status: 429 }
    );
  }

  // Parse filters.
  let bodyTitles: string[] = [];
  let regions: string[] = [];
  let remote = false;
  let country = DEFAULT_COUNTRY;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.titles))
      bodyTitles = body.titles.filter((t: unknown) => typeof t === "string" && t.trim());
    if (Array.isArray(body?.regions))
      regions = body.regions.filter((r: unknown) => typeof r === "string" && isValidRegionId(r));
    remote = Boolean(body?.remote);
    if (typeof body?.country === "string" && isValidCountry(body.country)) country = body.country;
  } catch {
    /* empty body → fall back to profile titles */
  }

  const profileRow = await prisma.profile.findUnique({ where: { userId } });
  if (!profileRow) {
    return NextResponse.json({ error: "No profile yet — parse a CV first." }, { status: 400 });
  }
  const profile = profileRow.extracted as unknown as Profile;
  const titles = bodyTitles.length ? bodyTitles : profile.titles;

  const { health, scoredJobIds, warning } = await executeSearch(userId, profile, {
    titles,
    regions,
    remote,
    country,
  });

  if (health.length === 0) {
    return NextResponse.json({ error: warning ?? "Nothing to search.", health, matches: [] }, { status: 400 });
  }
  if (health.every((h) => h.status === "error")) {
    return NextResponse.json({ error: "All sources failed to fetch.", health, matches: [] }, { status: 502 });
  }

  // Return only this run's scored jobs.
  const matches =
    scoredJobIds.length === 0
      ? []
      : await prisma.match.findMany({
          where: { userId, jobId: { in: scoredJobIds } },
          include: { job: true },
          orderBy: { score: "desc" },
        });

  return NextResponse.json({
    health,
    scoredCount: scoredJobIds.length,
    warning,
    matches: matches.map((m) => ({
      id: m.id,
      jobId: m.jobId,
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
