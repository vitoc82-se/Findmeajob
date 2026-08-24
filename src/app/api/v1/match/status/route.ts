import { NextRequest, NextResponse } from "next/server";
import { MatchStatus } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const VALID = new Set<string>(Object.values(MatchStatus));

// POST /api/v1/match/status  { id, status }
// Update a match's status (SAVED / APPLIED / DISMISSED / SEEN / NEW).
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let id: string;
  let status: string;
  try {
    const body = await req.json();
    id = String(body?.id ?? "");
    status = String(body?.status ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!VALID.has(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  // Scope the update to this user's own match.
  const result = await prisma.match.updateMany({
    where: { id, userId },
    data: { status: status as MatchStatus },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id, status });
}
