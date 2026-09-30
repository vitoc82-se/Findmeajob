import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_PER_HOUR = 120;
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

// POST /api/v1/feedback { jobId, headline, vote: 1|-1, score, query, level, region, surface }
// Thumbs up/down on one result. Anonymous and cheap; never surfaces an error to the visitor.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const vote = Number(b?.vote);
  const jobId = clip(b?.jobId, 80);
  const surface = b?.surface === "app" ? "app" : "try";
  if ((vote !== 1 && vote !== -1) || !jobId) return new NextResponse(null, { status: 400 });
  try {
    const userId = `ip:${clientIp(req)}`;
    const recent = await prisma.usageEvent.count({
      where: { userId, kind: "feedback", at: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent < MAX_PER_HOUR) {
      await prisma.usageEvent.create({ data: { userId, kind: "feedback" } });
      await prisma.resultFeedback.create({
        data: {
          jobId,
          headline: clip(b?.headline, 200),
          vote,
          score: Math.max(0, Math.min(100, Math.round(Number(b?.score) || 0))),
          query: clip(b?.query, 300),
          level: clip(b?.level, 20),
          region: clip(b?.region, 40),
          surface,
        },
      });
    }
  } catch (err) {
    console.error("[feedback]", err);
  }
  return new NextResponse(null, { status: 204 });
}
