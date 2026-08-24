import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/v1/profile → { profile: Profile | null }
// Lets the client decide onboarding (no profile) vs the app (profile exists),
// and restores a returning user's profile without re-parsing their CV.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.profile.findUnique({ where: { userId } });
  return NextResponse.json({ profile: row ? row.extracted : null });
}
