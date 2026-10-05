import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeProfile } from "@/lib/matching/sanitizeProfile";

export const runtime = "nodejs";

// POST /api/v1/profile/adopt { profile, cvText }
// A visitor who read their CV on /try and then signed up arrives here with the profile
// their browser kept, so they don't have to enter the CV again. The profile round-trips
// through the browser, so it is sanitized like any client input. It never overwrites an
// existing profile, and costs nothing (no LLM call).
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Du behöver logga in först." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const profile = sanitizeProfile(body?.profile);
  if (!profile) return NextResponse.json({ error: "Ingen profil att hämta." }, { status: 400 });
  const rawCv = typeof body?.cvText === "string" ? body.cvText.slice(0, 12000) : "";

  const existing = await prisma.profile.findUnique({ where: { userId }, select: { userId: true } });
  if (existing) return NextResponse.json({ adopted: false });

  const extracted = profile as unknown as Prisma.InputJsonValue;
  await prisma.profile.create({ data: { userId, rawCv, extracted } });
  return NextResponse.json({ adopted: true, profile });
}
