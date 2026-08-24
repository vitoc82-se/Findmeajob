import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parseAndStoreProfile } from "@/lib/matching/persistProfile";
import { rateLimit, LIMITS } from "@/lib/rateLimit";

// Anthropic SDK needs the Node.js runtime (not edge).
export const runtime = "nodejs";

// POST /api/v1/parse-cv  { cvText }
// Parses pasted CV text into a structured Profile and stores it.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(userId, "parse", LIMITS.parse.max, LIMITS.parse.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit reached. Try again in ~${rl.retryAfterMinutes} min.` },
      { status: 429 }
    );
  }

  let cvText: string;
  try {
    const body = await req.json();
    cvText = String(body?.cvText ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!cvText.trim()) {
    return NextResponse.json({ error: "cvText is required" }, { status: 400 });
  }

  try {
    const profile = await parseAndStoreProfile(userId, cvText);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "CV parse failed", detail: message },
      { status: 500 }
    );
  }
}
