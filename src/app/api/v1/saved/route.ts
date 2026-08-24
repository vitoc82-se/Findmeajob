import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/v1/saved → { matches: [...] }
// Everything the user has marked Saved or Applied, across all searches —
// independent of the current search's country/titles.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.match.findMany({
    where: { userId, status: { in: ["SAVED", "APPLIED"] } },
    include: { job: true },
    orderBy: { surfacedAt: "desc" },
  });

  return NextResponse.json({
    matches: rows.map((m) => ({
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
