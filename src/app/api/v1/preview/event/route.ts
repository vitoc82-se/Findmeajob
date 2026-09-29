import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rateLimit";
import { FUNNEL_STEPS, FUNNEL_SOURCES } from "@/lib/funnel";

export const runtime = "nodejs";

// Per-IP cap on funnel pings per hour — a real visit fires a handful, so this
// only ever bites a script hammering the endpoint.
const MAX_PER_HOUR = 60;

// POST /api/v1/preview/event  { step, src }
// Cookie-free, consent-independent visitor-funnel counter. It records only an
// allowlisted step name and coarse traffic source ("fb" | "other") as a
// UsageEvent row (kind "funnel_<step>_<src>", keyed like the other anonymous
// preview events). No CV text or profile data ever reaches this endpoint.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const step = String(body?.step ?? "");
  const src = String(body?.src ?? "");
  if (!(FUNNEL_STEPS as readonly string[]).includes(step) || !(FUNNEL_SOURCES as readonly string[]).includes(src)) {
    return new NextResponse(null, { status: 400 });
  }

  const userId = `ip:${clientIp(req)}`;
  const recent = await prisma.usageEvent.count({
    where: { userId, kind: { startsWith: "funnel_" }, at: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_PER_HOUR) return new NextResponse(null, { status: 204 });

  await prisma.usageEvent.create({ data: { userId, kind: `funnel_${step}_${src}` } });
  return new NextResponse(null, { status: 204 });
}
