import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isValidRegionId } from "@/lib/sources/regions";
import { isValidCountry, DEFAULT_COUNTRY } from "@/lib/sources/countries";

export const runtime = "nodejs";

// GET /api/v1/digest-settings → { enabled, search }
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = await prisma.profile.findUnique({ where: { userId } });
  return NextResponse.json({
    enabled: p?.digestEnabled ?? false,
    search: (p?.preferences as Record<string, unknown> | null) ?? null,
  });
}

// POST /api/v1/digest-settings  { enabled, titles?, country?, regions?, remote? }
// Turn the daily digest on/off and save the search it should run.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let enabled = false;
  let titles: string[] = [];
  let regions: string[] = [];
  let remote = false;
  let country = DEFAULT_COUNTRY;
  try {
    const body = await req.json();
    enabled = Boolean(body?.enabled);
    if (Array.isArray(body?.titles)) titles = body.titles.filter((t: unknown) => typeof t === "string" && t.trim());
    if (Array.isArray(body?.regions)) regions = body.regions.filter((r: unknown) => typeof r === "string" && isValidRegionId(r));
    remote = Boolean(body?.remote);
    if (typeof body?.country === "string" && isValidCountry(body.country)) country = body.country;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (enabled && titles.length === 0) {
    return NextResponse.json({ error: "Pick at least one role before enabling the digest." }, { status: 400 });
  }

  const search = { titles, country, regions, remote } as unknown as Prisma.InputJsonValue;

  // Only updates an existing profile — the user must have a CV first.
  const updated = await prisma.profile.updateMany({
    where: { userId },
    data: { digestEnabled: enabled, preferences: search },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "No profile yet — add your CV first." }, { status: 400 });
  }

  return NextResponse.json({ enabled, search });
}
